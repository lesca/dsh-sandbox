'use strict';

/**
 * Watches the dsh-market restart helper's output log for the replacement
 * dsh's launch token.
 *
 * Background. The dsh-market page's "restart service" button is a
 * self-restart: the running dsh process spawns a DETACHED HELPER (a separate
 * node process), then sends itself SIGTERM. The helper waits for the port to
 * free, boots the replacement `dsh web` on the same port, and writes the
 * replacement's stdout to
 *
 *   <tmpdir>/dsh-market-restart-<stamp>.out.log
 *
 * The replacement is NOT a child of whoever spawned the old dsh, so a proxy
 * that spawned it cannot read its console — yet the replacement announces
 * the very same line in that log:
 *
 *   dsh web: http://127.0.0.1:<port>/?token=...
 *
 * The launch token is per-process: dsh generates a fresh random one at every
 * boot and the old one stops being accepted after the restart, while the
 * browser-session cookie secret is durable. So already-logged-in browsers
 * survive a market restart, but a NEW browser can only get in through the
 * token redirect — which keeps working only if the proxy refreshes its
 * token from exactly this file. (The market's recovery surface, which takes
 * over when the helper's replacement fails to boot, appends to the same
 * file, so one tail covers both paths.)
 *
 * The watcher therefore:
 *   * starts when the spawned dsh child exits — the only moment a market
 *     restart can be in flight for our port;
 *   * polls <tmpdir> for the newest `dsh-market-restart-*.out.log` created
 *     after that moment (older files belong to earlier dsh instances whose
 *     tokens are irrelevant);
 *   * tails that file through the same TokenLineParser used for the child's
 *     stdout, so the latest announcement wins;
 *   * keeps running across FURTHER restarts: the replacement is not our
 *     child, so its own exit never notifies us — every poll re-picks the
 *     newest file and re-reads it from the start whenever the target
 *     changes.
 *
 * All timers are unref()'d: the watcher never keeps the process alive, the
 * listening server does.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TokenLineParser } = require('./token');

/** Naming convention of the helper's out log (restart.ts: `dsh-market-restart-<stamp>.out.log`). */
const LOG_NAME = /^dsh-market-restart-.+\.out\.log$/;
const POLL_MS = 500;
/**
 * Restart logs created up to this long BEFORE the child's exit still count
 * as "ours": the helper opens the out log as soon as the port frees, which
 * can land a hair before our exit event is delivered.
 */
const FLOOR_GRACE_MS = 10_000;

/**
 * @param {{
 *   startedAt?: number,         // Date.now() at the child's exit
 *   log: (message: string) => void,
 *   logDebug?: (message: string) => void,
 *   onToken: (token: string) => void,
 * }} opts
 * @returns {() => void} stop the watcher (clears its timer)
 */
function watchReplacementToken(opts) {
  const log = opts.log ?? (() => {});
  const logDebug = opts.logDebug ?? (() => {});
  const floorMs = (opts.startedAt ?? Date.now()) - FLOOR_GRACE_MS;
  const tmpdir = os.tmpdir();

  /** Tokens already handed out, so a re-read of a file is a no-op. */
  let emitted = new Set();
  let parser = makeParser();
  let target = null; // the out log currently being tailed
  let offset = 0;    // bytes of `target` already fed to the parser
  let stopped = false;
  let timer = null;

  function makeParser() {
    return new TokenLineParser((token) => {
      if (emitted.has(token)) return;
      emitted.add(token);
      log(`captured replacement dsh launch token (length ${token.length}) from the market restart log; the token redirect is up to date`);
      opts.onToken(token);
    });
  }

  /** Newest restart out log created after the floor, or null. */
  function pick() {
    let entries;
    try {
      entries = fs.readdirSync(tmpdir);
    } catch {
      return null;
    }
    let best = null;
    for (const name of entries) {
      if (!LOG_NAME.test(name)) continue;
      const file = path.join(tmpdir, name);
      let st;
      try {
        st = fs.statSync(file);
      } catch {
        continue;
      }
      if (st.mtimeMs < floorMs) continue;
      // Newest mtime wins; the stamp is ISO time, so the name breaks ties
      // chronologically.
      if (
        best === null ||
        st.mtimeMs > best.st.mtimeMs ||
        (st.mtimeMs === best.st.mtimeMs && name > best.name)
      ) {
        best = { name, file, st };
      }
    }
    return best ? best.file : null;
  }

  function poll() {
    if (stopped) return;

    const next = pick();
    if (next !== target) {
      if (next !== null) logDebug(`watching market restart log ${next} for the replacement token`);
      target = next;
      offset = 0;
      parser = makeParser(); // never join a leftover partial line from an older file
    }

    if (target !== null) {
      let st;
      try {
        st = fs.statSync(target);
      } catch {
        target = null; // vanished between pick() and here; re-pick next round
        scheduleNext();
        return;
      }
      if (st.size > offset) {
        let chunk;
        try {
          const fd = fs.openSync(target, 'r');
          try {
            const len = st.size - offset;
            chunk = Buffer.alloc(len);
            fs.readSync(fd, chunk, 0, len, offset);
          } finally {
            fs.closeSync(fd);
          }
        } catch (err) {
          logDebug(`replacement-token watch: read failed: ${err.code || err.message}`);
          scheduleNext();
          return;
        }
        offset = st.size;
        parser.feed(chunk);
      }
    }

    scheduleNext();
  }

  function scheduleNext() {
    timer = setTimeout(poll, POLL_MS);
    timer.unref();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
  }

  scheduleNext();
  return stop;
}

module.exports = { watchReplacementToken };
