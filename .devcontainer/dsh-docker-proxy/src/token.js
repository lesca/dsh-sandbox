'use strict';

/**
 * Captures the launch token from dsh's console output.
 *
 * `dsh web` announces its ready state on stdout with a line such as:
 *
 *   dsh web: http://127.0.0.1:3080/?token=q3PatifZhyjuUwng_2_sT7rKUoUxvIFvWx1_4NDLELc
 *
 * followed by `dsh web: opening the default browser; pass --no-open to
 * disable`. The parser matches the first http(s) URL on each `dsh web:` line
 * and reads its `token` query parameter; lines without a parseable
 * URL/token are ignored, and if dsh re-announces, the latest token wins.
 */

const ANNOUNCE = /dsh\s+web:\s*(https?:\/\/\S+)/i;

class TokenLineParser {
  /** @param {(token: string) => void} onToken invoked once per announced token */
  constructor(onToken) {
    this.onToken = onToken;
    this._buf = '';
  }

  /** Feed a chunk of the child process stdout. */
  feed(chunk) {
    this._buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl;
    while ((nl = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, nl);
      this._buf = this._buf.slice(nl + 1);
      this._handleLine(line);
    }
  }

  /** Flush a trailing partial line (child exited mid-line). */
  end() {
    if (this._buf.length > 0) {
      this._handleLine(this._buf);
      this._buf = '';
    }
  }

  _handleLine(line) {
    const match = line.match(ANNOUNCE);
    if (!match) return;
    let url;
    try {
      url = new URL(match[1]);
    } catch {
      return; // not a parseable URL (e.g. the browser-handoff line)
    }
    const token = url.searchParams.get('token');
    if (token) this.onToken(token);
  }
}

module.exports = { TokenLineParser };
