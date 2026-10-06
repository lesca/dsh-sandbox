'use strict';

/**
 * Dependency-free command-line parser for dsh-docker-proxy.
 *
 * Supported options:
 *   --listen <port>     port the proxy listens on            (default 13080)
 *   --listen-host <ip>  address the proxy binds to           (default 0.0.0.0)
 *   --dsh-port <port>   port the dsh web service listens on  (default 3080)
 *   --dsh-host <ip>     host of the dsh web service          (default 127.0.0.1)
 *   --dsh-cmd <cmd>     command used to start dsh            (default "dsh")
 *   --token <token>     supply the launch token explicitly (used with --no-spawn)
 *   --no-spawn          do not start dsh; assume it already runs on --dsh-port
 *   -h, --help          show help
 */

const HELP = `dsh-docker-proxy — LAN proxy for the dsh web server

Usage:
  node index.js [options]

Options:
  --listen <port>     port the proxy listens on            (default 13080)
  --listen-host <ip>  address the proxy binds to           (default 0.0.0.0)
  --dsh-port <port>   port the dsh web service listens on  (default 3080)
  --dsh-host <ip>     host of the dsh web service          (default 127.0.0.1)
  --dsh-cmd <cmd>     command used to start dsh            (default "dsh")
  --token <token>     supply the launch token explicitly (with --no-spawn)
  --no-spawn          do not start dsh; assume it runs on --dsh-port
  -h, --help          show this help

The proxy starts "dsh web --port <dsh-port> --no-open", captures the token dsh
prints to its console, and serves the dsh UI on the LAN. Unauthenticated
browsers are redirected to /?token=<token> so they can obtain the session
cookie. When the proxy exits, the spawned dsh child is terminated as well.
`;

class UsageError extends Error {}

function toPort(value, flag) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new UsageError(`${flag} expects an integer port 1-65535, got "${value}"`);
  }
  return n;
}

function fail(message, usage = true) {
  const err = new UsageError(message);
  if (usage) process.stderr.write(`dsh-docker-proxy: ${message}\n\n${HELP}`);
  throw err;
}

/**
 * Parse process.argv style arguments (the slice after the script path).
 * @param {string[]} argv
 * @returns {{listenPort:number, listenHost:string, dshPort:number, dshHost:string,
 *           dshCmd:string, token:string|undefined, noSpawn:boolean, help:boolean}}
 */
function parseArgs(argv) {
  const opts = {
    listenPort: 13080,
    listenHost: '0.0.0.0',
    dshPort: 3080,
    dshHost: '127.0.0.1',
    dshCmd: 'dsh',
    token: undefined,
    noSpawn: false,
    help: false,
  };

  const readValue = (i, flag) => {
    if (i + 1 >= argv.length) fail(`missing value for ${flag}`);
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let flag = arg;
    let inline;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flag = arg.slice(0, eq);
        inline = arg.slice(eq + 1);
      }
    }

    switch (flag) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--listen':
      case '--port':
        opts.listenPort = toPort(inline !== undefined ? inline : readValue(i, '--listen'), '--listen');
        if (inline === undefined) i++;
        break;
      case '--listen-host':
        opts.listenHost = inline !== undefined ? inline : readValue(i, '--listen-host');
        if (inline === undefined) i++;
        break;
      case '--dsh-port':
        opts.dshPort = toPort(inline !== undefined ? inline : readValue(i, '--dsh-port'), '--dsh-port');
        if (inline === undefined) i++;
        break;
      case '--dsh-host':
        opts.dshHost = inline !== undefined ? inline : readValue(i, '--dsh-host');
        if (inline === undefined) i++;
        break;
      case '--dsh-cmd':
        opts.dshCmd = inline !== undefined ? inline : readValue(i, '--dsh-cmd');
        if (inline === undefined) i++;
        break;
      case '--token':
        opts.token = inline !== undefined ? inline : readValue(i, '--token');
        if (inline === undefined) i++;
        break;
      case '--no-spawn':
        opts.noSpawn = true;
        break;
      default:
        fail(`unknown option ${arg}`);
    }
  }

  if (!opts.dshCmd) fail('--dsh-cmd must not be empty', false);
  return opts;
}

module.exports = { parseArgs, UsageError, HELP };
