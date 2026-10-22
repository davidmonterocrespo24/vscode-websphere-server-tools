import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { env } from './config';

/**
 * Runs processes inside a VS Code terminal (CustomExecution + Pseudoterminal) instead of a shell:
 * - no dependency on bash/PowerShell quoting,
 * - secrets travel only as environment variables and are never echoed,
 * - several steps (stop -> wait -> kill -> start) can share one terminal and be cancelled.
 */

const isWin = process.platform === 'win32';

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** names of env vars whose values must be masked if they show up in the output */
  secrets?: string[];
  encoding?: string;
}

export class Term {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;
  private children = new Set<import('child_process').ChildProcess>();
  cancelled = false;

  write(text: string): void { this.writeEmitter.fire(text.replace(/\r?\n/g, '\r\n')); }
  line(text = ''): void { this.write(text + '\n'); }
  info(text: string): void { this.line(`\x1b[36m${text}\x1b[0m`); }
  ok(text: string): void { this.line(`\x1b[32m${text}\x1b[0m`); }
  warn(text: string): void { this.line(`\x1b[33m${text}\x1b[0m`); }
  error(text: string): void { this.line(`\x1b[31m${text}\x1b[0m`); }

  /**
   * Runs a command and streams its output. On Windows, .bat/.cmd are run through cmd.exe;
   * arguments written as %VAR% are expanded by cmd from `opts.env` (used for passwords).
   * On Unix use "$VAR" the same way (the command is run through /bin/sh).
   */
  exec(command: string, args: string[], opts: ExecOptions = {}): Promise<number> {
    if (this.cancelled) { return Promise.resolve(-1); }
    const decoder = new TextDecoder(opts.encoding ?? env().consoleEncoding);
    const procEnv = { ...process.env, ...opts.env };
    const shown = [command, ...args].map(quoteForDisplay).join(' ');
    this.line(`\x1b[2m> ${shown}\x1b[0m`);
    let child;
    if (isWin) {
      const line = [command, ...args].map(quoteWin).join(' ');
      child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { cwd: opts.cwd, env: procEnv, windowsVerbatimArguments: true, windowsHide: true });
    } else {
      child = spawn('/bin/sh', ['-c', [command, ...args].map(quoteSh).join(' ')], { cwd: opts.cwd, env: procEnv });
    }
    this.children.add(child);
    const secretValues = (opts.secrets ?? []).map(k => opts.env?.[k]).filter((v): v is string => !!v && v.length > 2);
    const mask = (s: string) => secretValues.reduce((acc, v) => acc.split(v).join('****'), s);
    const pipe = (b: Buffer) => this.write(mask(decoder.decode(b, { stream: true })));
    child.stdout?.on('data', pipe);
    child.stderr?.on('data', pipe);
    return new Promise(resolve => {
      child.on('error', err => { this.error(String(err)); this.children.delete(child); resolve(-1); });
      child.on('close', code => { this.children.delete(child); resolve(code ?? -1); });
    });
  }

  cancel(): void {
    this.cancelled = true;
    for (const c of this.children) {
      if (isWin && c.pid) { spawn('taskkill', ['/pid', String(c.pid), '/t', '/f'], { windowsHide: true }); }
      else { c.kill(); }
    }
  }

  close(code: number): void { this.closeEmitter.fire(code); }
}

function quoteWin(a: string): string {
  if (/^%\w+%$/.test(a)) { return `"${a}"`; }        // cmd expands it; quotes protect & | < > in the value
  return /[\s&|<>^()"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

function quoteSh(a: string): string {
  if (/^"\$\w+"$/.test(a)) { return a; }              // let sh expand it
  return /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
}

function quoteForDisplay(a: string): string {
  return /\s/.test(a) ? `"${a}"` : a;
}

const running = new Map<string, vscode.TaskExecution>();

/**
 * Runs `body` in a dedicated terminal task named `name`. Resolves with the exit code (0 = ok).
 * Only one task with the same name runs at a time.
 */
export async function runInTerminal(name: string, body: (t: Term) => Promise<number>): Promise<number> {
  if (running.has(name)) {
    void vscode.window.showWarningMessage(vscode.l10n.t('"{0}" is already running.', name));
    return -1;
  }
  let result = -1;
  let done: () => void = () => undefined;
  const finished = new Promise<void>(r => { done = r; });
  const execution = new vscode.CustomExecution(async () => {
    const term = new Term();
    const pty: vscode.Pseudoterminal = {
      onDidWrite: term.onDidWrite,
      onDidClose: term.onDidClose,
      open: () => {
        body(term)
          .then(code => { result = code; })
          .catch(err => { term.error(err instanceof Error ? err.message : String(err)); result = -1; })
          .finally(() => {
            term.line();
            if (result === 0) { term.ok(vscode.l10n.t('✔ {0}: finished', name)); }
            else { term.error(vscode.l10n.t('✖ {0}: failed (code {1})', name, result)); }
            term.close(result);
            done();
          });
      },
      close: () => term.cancel(),
    };
    return pty;
  });
  const task = new vscode.Task({ type: 'wasTools', name }, vscode.TaskScope.Workspace, name, 'WebSphere', execution, []);
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false };
  const exec = await vscode.tasks.executeTask(task);
  running.set(name, exec);
  await finished;
  running.delete(name);
  return result;
}

export const platform = { isWin };
