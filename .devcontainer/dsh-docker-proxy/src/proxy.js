'use strict';

/**
 * Transparent LAN -> loopback proxy for the dsh web server.
 *
 * Why the header rewrite: dsh refuses to bind anything but loopback and its
 * API trust fence (HostConnectionService) requires the request `Host` to be a
 * loopback address — and, when an `Origin` header is present, to match that
 * Host exactly. A LAN browser dials `http://192.168.x.y:<listen-port>` and
 * sends `Host: 192.168.x.y:<listen-port>` / `Origin: http://192.168.x.y:<listen-port>`,
 * which dsh would reject with 403. The proxy therefore rewrites both headers
 * to the loopback dsh authority for every request (HTTP and WebSocket
 * upgrade). Cookies keep working because the cookie authority is derived from
 * the (rewritten) Host, so it stays consistent end to end.
 *
 * Why the 401 redirect: `dsh web` gates the index page behind a one-time
 * launch token. In a container the user cannot read the console URL, so when
 * the backend answers 401 to a browser navigation of the index page, the
 * proxy answers 302 -> `/?token=<token>` (the token captured from dsh's
 * stdout). The relative location resolves against whatever host the user
 * dialed, landing on e.g. http://192.168.2.10:13080/?token=xxx.
 *
 * Why the index rewrite: the dsh client also gates its privileged surfaces —
 * the settings document read/write (models, providers, keys) and the durable
 * locale preference — on `ctx.connection.isLoopback`, which it computes from
 * the page's own `location.hostname`. A LAN IP classifies as non-loopback,
 * so a page reached through this proxy runs the settings layer in "memory"
 * persistence: the models settings page reports "settings are unavailable in
 * this browser" and locale selections never reach the Host (they are dropped
 * and the next load falls back to the browser language). The client honors a
 * `globalThis.__DSH_TRANSPORT__` object (the shell transport contract,
 * `ClientTransportHooks`): `ownsHost: true` declares "the page owns the Host
 * outright" and flips `isLoopback` on, while every other field is optional
 * and falls back to the stock browser carrier, so the minimal
 * `{ ownsHost: true }` changes nothing but the gate. This proxy is exactly
 * such an owner: dsh binds loopback-only, the proxy is the sole external
 * route, and sessions are authenticated by dsh's own browser-session cookie,
 * so a proxied session has the same trust level as a loopback session. The
 * proxy therefore buffers the index document and injects a minimal transport
 * declaration as an inline classic script in `<head>` (it runs before the
 * deferred module bundle boots the client). The `??` keeps the injection
 * idempotent and non-destructive if a future dsh build ships its own
 * transport.
 */

const http = require('node:http');
const net = require('node:net');
const zlib = require('node:zlib');

/**
 * Hop-by-hop headers (RFC 7230) plus `transfer-encoding`: node dechunks the
 * upstream body before we see it, so relaying the framing header would make
 * the client try to dechunk an already-dechunked body.
 */
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/** Paths the dsh index auth gate owns (frontend-static fallback seat). */
const INDEX_PATHS = new Set(['/', '/index.html']);

/**
 * The minimal shell-transport declaration injected into the index document.
 * Only `ownsHost` is set: every other `ClientTransportHooks` field is
 * optional and the client falls back to the stock browser carrier
 * (global `fetch`, Gateway WebSocket, bundle loading over HTTP), so the
 * injection flips `ctx.connection.isLoopback` on and nothing else. The `??`
 * never clobbers a transport a future dsh build might define itself.
 */
const TRANSPORT_SNIPPET =
  '<script>globalThis.__DSH_TRANSPORT__=globalThis.__DSH_TRANSPORT__??{ownsHost:true}</script>';

/** Cap for the buffered index document; larger bodies stream through verbatim. */
const MAX_REWRITE_BYTES = 2 * 1024 * 1024;

/** Upstream content-encodings the rewriter can decode; anything else streams through. */
const DECODABLE_ENCODINGS = new Set(['', 'identity', 'gzip', 'deflate']);

/**
 * @param {{
 *   targetHost: string,
 *   targetPort: number,
 *   getToken: () => string | undefined,
 *   log?: (message: string) => void,
 * }} opts
 * @returns {{server: import('node:http').Server, agent: import('node:http').Agent}}
 */
function createProxyServer({ targetHost, targetPort, getToken, log = () => {} }) {
  const authority = `${targetHost}:${targetPort}`;
  const targetOrigin = `http://${authority}`;
  const agent = new http.Agent({ keepAlive: true });
  /** Once the index document has been rewritten, later injections are routine. */
  let injectedBefore = false;

  const server = http.createServer();
  server.on('request', handleRequest);
  server.on('upgrade', handleUpgrade);
  server.on('clientError', (err, socket) => {
    log(`client error: ${err.code || err.message}`);
    try { socket.destroy(); } catch { /* already gone */ }
  });

  /**
   * Rewrite the authority-bearing headers a LAN browser sends to the loopback
   * dsh authority so the API trust fence accepts the request.
   */
  function rewriteRequestHeaders(clientHeaders) {
    const out = {};
    for (const [name, value] of Object.entries(clientHeaders)) {
      const key = name.toLowerCase();
      if (key === 'host') { out.host = authority; continue; }
      if (key === 'origin') { out.origin = targetOrigin; continue; }
      out[key] = value;
    }
    return out;
  }

  function handleRequest(req, res) {
    let pathname = '';
    let path = req.url;
    try {
      const url = new URL(req.url, 'http://internal');
      pathname = url.pathname;
      path = url.pathname + url.search;
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dsh-docker-proxy: malformed request path\n');
      return;
    }

    const upstream = http.request(
      {
        host: targetHost,
        port: targetPort,
        method: req.method,
        path,
        headers: rewriteRequestHeaders(req.headers),
        agent,
      },
      (upstreamRes) => {
        const status = upstreamRes.statusCode || 502;
        const token =
          status === 401 && req.method === 'GET' && INDEX_PATHS.has(pathname)
            ? getToken()
            : undefined;

        if (token) {
          // Backend says "unauthenticated" for the index page and we know the
          // launch token: send the browser to the token URL.
          upstreamRes.destroy();
          log(`redirecting unauthenticated GET ${req.url} -> /?token=***`);
          res.writeHead(302, {
            location: `/?token=${encodeURIComponent(token)}`,
            'cache-control': 'no-store',
          });
          res.end();
          return;
        }

        // Relay the backend response verbatim (cookies, Location, ...) —
        // except for the app's HTML document, which we buffer, inject the
        // transport declaration into, and re-send (see TRANSPORT_SNIPPET).
        const headers = {};
        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (STRIP_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
          headers[name] = value;
        }
        upstreamRes.on('error', (err) => {
          log(`upstream response error for ${req.method} ${req.url}: ${err.code || err.message}`);
          try { res.destroy(); } catch { /* already gone */ }
        });

        const contentType = String(upstreamRes.headers['content-type'] ?? '').toLowerCase();
        const encoding = String(upstreamRes.headers['content-encoding'] ?? '').toLowerCase();
        const rewriteCandidate =
          req.method === 'GET' &&
          INDEX_PATHS.has(pathname) &&
          status === 200 &&
          contentType.startsWith('text/html') &&
          DECODABLE_ENCODINGS.has(encoding);

        if (!rewriteCandidate) {
          res.writeHead(status, upstreamRes.statusMessage, headers);
          upstreamRes.pipe(res);
          return;
        }

        // Buffer the document (bounded) and decide how to answer once the
        // whole body has arrived. `finishVerbatim` replays the raw upstream
        // bytes with the original framing headers — the correct answer for
        // any skip path, including bodies we decoded for inspection.
        const chunks = [];
        let size = 0;
        let announced = false;
        const finishVerbatim = (trailingChunk) => {
          announced = true;
          res.writeHead(status, upstreamRes.statusMessage, headers);
          for (const c of chunks) res.write(c);
          if (trailingChunk !== undefined) res.write(trailingChunk);
          else res.end();
        };

        upstreamRes.on('data', (chunk) => {
          if (announced) return;
          size += chunk.length;
          if (size > MAX_REWRITE_BYTES) {
            log(`index rewrite skipped: document exceeds ${MAX_REWRITE_BYTES} bytes; streaming verbatim`);
            finishVerbatim(chunk);
            upstreamRes.pipe(res);
            return;
          }
          chunks.push(chunk);
        });

        upstreamRes.on('end', () => {
          if (announced || res.destroyed) return; // pipe is driving res now
          const raw = Buffer.concat(chunks);
          let decoded;
          try {
            decoded =
              encoding === 'gzip' ? zlib.gunzipSync(raw)
              : encoding === 'deflate' ? zlib.unzipSync(raw)
              : raw;
          } catch (err) {
            log(`index rewrite skipped: cannot decode ${encoding || 'identity'} body (${err.code || err.message})`);
            finishVerbatim();
            return;
          }
          const html = decoded.toString('utf8');
          if (html.includes('__DSH_TRANSPORT__')) {
            // The document already carries a transport declaration: serve it
            // verbatim rather than stacking a second script.
            finishVerbatim();
            return;
          }
          const anchor = html.match(/<head[^>]*>/i);
          if (anchor === null) {
            log('index rewrite skipped: no <head> anchor found in the index document');
            finishVerbatim();
            return;
          }
          const at = anchor.index + anchor[0].length;
          const out = Buffer.from(html.slice(0, at) + TRANSPORT_SNIPPET + html.slice(at), 'utf8');
          delete headers['content-encoding']; // body is re-sent identity
          headers['content-length'] = String(out.length);
          announced = true;
          res.writeHead(status, upstreamRes.statusMessage, headers);
          res.end(out);
          log(
            injectedBefore
              ? 'index document: transport declaration re-injected'
              : 'index document: injected __DSH_TRANSPORT__ (ownsHost: true); settings persistence and locale preference are now host-backed',
          );
          injectedBefore = true;
        });
      },
    );

    upstream.on('error', (err) => {
      log(`upstream error for ${req.method} ${req.url}: ${err.code || err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`dsh-docker-proxy: cannot reach dsh on ${authority} (${err.code || err.message})\n`);
      } else {
        res.destroy();
      }
    });

    // If the client goes away (mid-upload, mid-download, closed tab), tear the
    // upstream exchange down too. After a fully finished response this is a
    // no-op because writableFinished is already true.
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });

    req.pipe(upstream);
  }

  /**
   * WebSocket (and any HTTP upgrade) proxying: open a raw TCP connection to
   * dsh, replay the upgrade request with rewritten authority headers, then
   * pipe both directions until either side closes.
   */
  function handleUpgrade(req, socket, head) {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [name, value] of Object.entries(rewriteRequestHeaders(req.headers))) {
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${name}: ${item}`);
      } else {
        lines.push(`${name}: ${value}`);
      }
    }
    const requestBytes = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'utf8');

    const backend = net.connect(targetPort, targetHost);
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* already gone */ }
      try { backend.destroy(); } catch { /* already gone */ }
    };

    backend.once('connect', () => {
      backend.write(requestBytes);
      if (head && head.length > 0) backend.write(head);
      socket.pipe(backend);
      backend.pipe(socket);
    });
    backend.on('error', (err) => {
      log(`websocket upgrade upstream error: ${err.code || err.message}`);
      cleanup();
    });
    socket.on('error', (err) => {
      log(`websocket upgrade socket error: ${err.code || err.message}`);
      cleanup();
    });
    socket.on('close', cleanup);
    backend.on('close', cleanup);
  }

  return { server, agent };
}

module.exports = { createProxyServer };
