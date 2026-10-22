import { execFile } from 'child_process';
import * as net from 'net';
import * as path from 'path';
import * as vscode from 'vscode';
import { env, requireServer } from './config';
import { credentialArgs, getCredentials } from './credentials';
import { runInTerminal, Term } from './runner';

const isWin = process.platform === 'win32';
const ext = isWin ? '.bat' : '.sh';

export type State = 'running' | 'starting' | 'stopped' | 'unknown';

/** off = nothing on the port; listening = free for a debugger; attached = a debugger is already connected */
export type DebugState = 'off' | 'listening' | 'attached';

export interface ServerInfo {
  state: State;
  debug: DebugState;
  pid?: number;
}

/**
 * State of the JDWP port read from the OS socket table, WITHOUT connecting to it: a JDWP agent
 * accepts a single connection and logs "JDWP-Handshake ... premature EOF" for every probe, so a
 * TCP probe could even steal the connection from the real debugger.
 */
export function debugPortState(port: number): Promise<DebugState> {
  return new Promise(resolve => {
    const done = (out: string) => {
      const onLocal = out.split(/\r?\n/).filter(l => {
        const cols = l.trim().split(/\s+/);
        // Windows netstat: Proto Local Foreign State PID; ss: State Recv Send Local Peer
        const localCol = isWin ? cols[1] : cols[3];
        return !!localCol && new RegExp(`[:.]${port}$`).test(localCol);
      });
      if (onLocal.some(l => /LISTEN/i.test(l))) { resolve('listening'); return; }
      if (onLocal.some(l => /ESTAB/i.test(l))) { resolve('attached'); return; }
      resolve('off');
    };
    if (isWin) {
      execFile('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => done(out ?? ''));
    } else {
      execFile('ss', ['-tan'], { timeout: 10000 }, (err, out) => err ? resolve('off') : done(out ?? ''));
    }
  });
}

export function portOpen(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise(resolve => {
    const s = net.createConnection({ host, port });
    const end = (ok: boolean) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => end(false));
    s.once('connect', () => end(true));
    s.once('error', () => end(false));
  });
}

interface Proc { pid: number; cmd: string }

/** Java processes with their command lines. */
function javaProcesses(): Promise<Proc[]> {
  return new Promise(resolve => {
    if (isWin) {
      const ps = `Get-CimInstance Win32_Process -Filter "name like 'java%'" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 20000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (_e, out) => resolve(parse(out ?? '')));
    } else {
      execFile('ps', ['-eo', 'pid=,args='], { maxBuffer: 16 * 1024 * 1024 }, (_e, out) =>
        resolve((out ?? '').split('\n').map(l => /^\s*(\d+)\s+(.*)$/.exec(l)).filter((m): m is RegExpExecArray => !!m && /java/.test(m[2]))
          .map(m => ({ pid: Number(m[1]), cmd: m[2] }))));
    }
  });
  function parse(out: string): Proc[] {
    return out.split(/\r?\n/).map(l => l.split('\t')).filter(a => a.length > 1 && /^\d+$/.test(a[0]))
      .map(a => ({ pid: Number(a[0]), cmd: a.slice(1).join('\t') }));
  }
}

/**
 * The server JVM: main class com.ibm.ws.runtime.WsServer, launched with "<cell> <node> <server>"
 * and the profile path in its command line. (The <server>.pid file is written only when startup
 * finishes and goes stale, so it is not used.)
 */
export async function serverPid(): Promise<number | undefined> {
  const e = env();
  if (!e.profilePath || !e.server) { return undefined; }
  const profile = path.basename(e.profilePath).toLowerCase();
  const procs = await javaProcesses();
  return procs.find(p => {
    const c = p.cmd.toLowerCase();
    return c.includes('com.ibm.ws.runtime.wsserver ') && c.includes(profile) && c.includes(` ${e.server!.toLowerCase()}`);
  })?.pid;
}

/** stopServer clients (com.ibm.ws.management.tools.WsServerStop) that can hang after the server died. */
async function stopClients(): Promise<number[]> {
  const e = env();
  return (await javaProcesses())
    .filter(p => p.cmd.includes('WsServerStop') && (!e.server || p.cmd.includes(e.server)))
    .map(p => p.pid);
}

function kill(pid: number): void {
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

export class ServerMonitor implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ServerInfo>();
  readonly onChange = this.emitter.event;
  info: ServerInfo = { state: 'unknown', debug: 'off' };
  private timer: NodeJS.Timeout | undefined;
  private busy = false;

  start(): void {
    void this.refresh();
    this.restartTimer();
  }

  restartTimer(): void {
    if (this.timer) { clearInterval(this.timer); }
    this.timer = setInterval(() => void this.refresh(), env().pollSeconds * 1000);
  }

  async refresh(force = false): Promise<ServerInfo> {
    if (this.busy && !force) { return this.info; }
    this.busy = true;
    try {
      const e = env();
      let next: ServerInfo;
      if (!e.profilePath || !e.server) {
        next = { state: 'unknown', debug: 'off' };
      } else {
        const [up, dbg] = await Promise.all([portOpen(e.host, e.ports.https), debugPortState(e.debugPort)]);
        if (up) {
          next = { state: 'running', debug: dbg, pid: this.info.pid };
        } else {
          const pid = await serverPid();
          next = { state: pid ? 'starting' : 'stopped', debug: dbg, pid };
        }
      }
      const changed = next.state !== this.info.state || next.debug !== this.info.debug;
      this.info = next;
      if (changed || force) { this.emitter.fire(next); }
      return next;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    if (this.timer) { clearInterval(this.timer); }
    this.emitter.dispose();
  }
}

export function stateLabel(s: State): string {
  switch (s) {
    case 'running': return vscode.l10n.t('running');
    case 'starting': return vscode.l10n.t('starting / stopping');
    case 'stopped': return vscode.l10n.t('stopped');
    default: return vscode.l10n.t('not configured');
  }
}

function bin(tool: string): string {
  return path.join(requireServer().profilePath, 'bin', tool + ext);
}

async function doStart(t: Term): Promise<number> {
  const e = requireServer();
  if (await serverPid()) { t.warn(vscode.l10n.t('{0} is already running.', e.server)); return 0; }
  t.info(vscode.l10n.t('Starting {0} (this can take several minutes)…', e.server));
  return t.exec(bin('startServer'), [e.server], { cwd: e.profilePath });
}

async function doStop(t: Term, creds: Awaited<ReturnType<typeof getCredentials>>): Promise<number> {
  const e = requireServer();
  const pid = await serverPid();
  if (!pid) { t.warn(vscode.l10n.t('{0} is already stopped.', e.server)); return 0; }
  t.info(vscode.l10n.t('Stopping {0} (PID {1}), waiting up to {2} min…', e.server, pid, e.stopTimeoutMinutes));
  const c = credentialArgs(creds ?? null, '-username');
  const stop = t.exec(bin('stopServer'), [e.server, ...c.args], { cwd: e.profilePath, env: c.env, secrets: ['WAS_PASSWORD'] });
  const deadline = Date.now() + e.stopTimeoutMinutes * 60_000;
  // stopServer can hang even after the server is gone: watch the server process ourselves
  let stopped = false;
  while (Date.now() < deadline && !t.cancelled) {
    if (!(await serverPid())) { stopped = true; break; }
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!stopped && !t.cancelled) {
    const still = await serverPid();
    if (still) { t.warn(vscode.l10n.t('The server did not stop in time: killing PID {0}.', still)); kill(still); }
  }
  for (const p of await stopClients()) { t.warn(vscode.l10n.t('Killing hung stopServer client (PID {0}).', p)); kill(p); }
  await Promise.race([stop, new Promise(r => setTimeout(r, 3000))]);
  return (await serverPid()) ? 1 : 0;
}

export async function start(): Promise<number> {
  return runInTerminal(vscode.l10n.t('WebSphere: Start'), doStart);
}

export async function stop(): Promise<number> {
  const creds = await getCredentials();
  if (creds === undefined) { return -1; }
  return runInTerminal(vscode.l10n.t('WebSphere: Stop'), t => doStop(t, creds));
}

export async function restart(): Promise<number> {
  const creds = await getCredentials();
  if (creds === undefined) { return -1; }
  return runInTerminal(vscode.l10n.t('WebSphere: Restart'), async t => {
    const s = await doStop(t, creds);
    if (s !== 0) { return s; }
    return doStart(t);
  });
}

/** Kills the server JVM without asking it to stop (last resort). */
export async function forceStop(): Promise<void> {
  const pid = await serverPid();
  if (pid) { kill(pid); }
  for (const p of await stopClients()) { kill(p); }
}

/** Runs a Jython script bundled in resources/jython with wsadmin against the running server. */
export async function wsadmin(title: string, script: string, args: string[] = [], scriptsDir: string): Promise<number> {
  const creds = await getCredentials();
  if (creds === undefined) { return -1; }
  return runInTerminal(title, t => runWsadmin(t, creds, script, args, scriptsDir));
}

export function runWsadmin(t: Term, creds: Awaited<ReturnType<typeof getCredentials>>, script: string, args: string[], scriptsDir: string): Promise<number> {
  const e = requireServer();
  const c = credentialArgs(creds ?? null, '-user');
  return t.exec(bin('wsadmin'),
    ['-lang', 'jython', '-conntype', 'SOAP', '-host', e.host, '-port', String(e.ports.soap), ...c.args, '-f', path.join(scriptsDir, script), ...args],
    { cwd: e.profilePath, env: { ...c.env, WAS_CELL: e.cell, WAS_NODE: e.node, WAS_SERVER: e.server, WAS_TOOLS_JYTHON: scriptsDir }, secrets: ['WAS_PASSWORD'] });
}
