#!/usr/bin/env node
'use strict';

/**
 * dsh-docker-proxy
 *
 * Lets LAN devices reach a `dsh web` instance that only listens on loopback:
 *
 *   1. Spawns `dsh web --port <dsh-port> --no-open` (unless --no-spawn).
 *   2. Captures the launch token dsh prints on its console
 *      (`dsh web: http://127.0.0.1:3080/?token=...`).
 *   3. Listens on 0.0.0.0:<listen-port> and forwards every request to the
 *      loopback dsh, rewriting the Host/Origin headers to the loopback
 *      authority so dsh's API trust fence accepts them.
 *   4. When an unauthenticated browser requests the index page, answers with
 *      a redirect to /?token=<token> so the browser can obtain its session
 *      cookie — no console access needed.
 *
 * Lifecycle: when this process exits (SIGINT/SIGTERM or child death), the
 * spawned dsh child is terminated; when the child dies on its own, this
 * process exits with it.
 */

const { spawn } = require('node:child_process');
const { parseArgs, UsageError, HELP } = require('./args');
const { TokenLineParser } = require('./token');
const { createProxyServer } = require('./proxy');

const KILL_GRACE_MS = 3000;   // SIGTERM -> SIGKILL escalation for the child
const SHUTDOWN_DEADLINE_MS = 2000; // hard exit deadline for the proxy itself

function log(message) {
  const line = `[dsh-docker-proxy] ${message}`;
  if (process.env.DSH_PROXY_DEBUG) process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

/**
 * Routine per-request events (client-side teardowns, routine re-injections).
 * Emitted only in debug mode (DSH_PROXY_DEBUG=1, on stderr), so an ordinary
 * page refresh produces no log output at all.
 */
function logDebug(message) {
  if (!process.env.DSH_PROXY_DEBUG) return;
  process.stderr.write(`[dsh-docker-proxy] ${message}\n`);
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    // parseArgs already printed usage for UsageError.
    if (err instanceof UsageError) process.exit(2);
    throw err;
  }
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }
  if (opts.listenPort === opts.dshPort) {
    process.stderr.write(`dsh-docker-proxy: --listen and --dsh-port must differ (the proxy would forward to itself)\n`);
    process.exit(2);
  }

  const dshAuthority = `${opts.dshHost}:${opts.dshPort}`;

  let token = opts.token;
  const getToken = () => token;
  let child = null;
  let proxyServer = null;
  let proxyAgent = null;
  let shuttingDown = false;
  let killAnnounced = false;

  /**
   * Terminate the spawned dsh tree. `dsh` is a launcher that boots the web
   * server as a further child, so we signal the whole process group (the
   * child is spawned with detached: true, making it a group leader): the
   * launcher and the booted web server go down together. SIGTERM first,
   * escalating to SIGKILL if the tree lingers.
   */
  function killChild() {
    if (!child || child.pid === undefined) return;
    if (!killAnnounced) {
      killAnnounced = true;
      log(`terminating dsh process group (leader pid ${child.pid})`);
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* group already gone */ }
    const force = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
    }, KILL_GRACE_MS);
    force.unref();
  }

  /** Stop the proxy and this process, taking the child with us. */
  function shutdown(code, reason) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (reason) log(reason);
    killChild();

    const deadline = setTimeout(() => process.exit(code), SHUTDOWN_DEADLINE_MS);
    deadline.unref();

    if (!proxyServer) {
      process.exit(code);
      return;
    }
    proxyServer.close(() => process.exit(code));
    // Drop idle upstream keep-alive sockets so close() can complete.
    if (proxyAgent) proxyAgent.destroy();
    if (typeof proxyServer.closeAllConnections === 'function') {
      // Give in-flight (e.g. WebSocket) connections a moment, then force.
      setTimeout(() => proxyServer.closeAllConnections?.(), 500).unref();
    }
  }

  /** Spawn `dsh web` and stream its console output. */
  function startDsh() {
    if (opts.noSpawn) {
      log(`not spawning dsh (--no-spawn); expecting it on ${dshAuthority}`);
      if (!token) log('warning: no --token given; unauthenticated browsers will see dsh\'s 401 page');
      return;
    }

    const cmd = [opts.dshCmd, 'web', '--port', String(opts.dshPort), '--no-open'];
    log(`starting: ${cmd.join(' ')}`);
    // detached: true makes the child a process-group leader so shutdown can
    // signal the entire dsh tree (launcher + booted web server) at once.
    child = spawn(cmd[0], cmd.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: true,
    });

    const parser = new TokenLineParser((captured) => {
      token = captured;
      log(`captured dsh launch token (length ${captured.length})`);
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      parser.feed(chunk);
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', (err) => {
      log(`failed to start dsh (${err.code || err.message}); is "${opts.dshCmd}" installed and on PATH?`);
      shutdown(1);
    });
    child.on('exit', (code, signal) => {
      log(`dsh child exited (code=${code} signal=${signal}); stopping proxy`);
      shutdown(signal ? 143 : code === null ? 1 : code);
    });
  }

  /** Start the listening proxy. */
  function startProxy() {
    const { server, agent } = createProxyServer({
      targetHost: opts.dshHost,
      targetPort: opts.dshPort,
      getToken,
      log,
      logDebug,
    });
    proxyServer = server;
    proxyAgent = agent;

    server.on('error', (err) => {
      log(`proxy server error: ${err.code || err.message}`);
      if (err.code === 'EADDRINUSE') {
        log(`port ${opts.listenPort} is already in use; try --listen <port>`);
      }
      shutdown(1);
    });

    server.listen(opts.listenPort, opts.listenHost, () => {
      log(`proxy listening on http://${opts.listenHost}:${opts.listenPort}`);
      log(`forwarding to dsh on http://${dshAuthority}`);
      log(`LAN users: open http://<this-machine-ip>:${opts.listenPort}/ — unauthenticated requests are redirected to the token URL.`);
    });
  }

  startDsh();
  // No wait for dsh: requests that arrive before dsh bound its port get a
  // 502 from the proxy, and the token redirect activates as soon as dsh
  // announces its token on stdout.
  startProxy();

  process.on('SIGINT', () => shutdown(0, 'received SIGINT'));
  process.on('SIGTERM', () => shutdown(0, 'received SIGTERM'));
  // Best-effort: any other exit path still takes the child with it.
  process.on('exit', killChild);

  // Surface a hint if dsh stays silent about the token for a while.
  if (child) {
    const grace = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null && !token) {
        log('warning: dsh has not announced a token yet; the token redirect activates once it does');
      }
    }, 15000);
    grace.unref();
  }
}

main();
