import * as fs from 'fs';
import * as vscode from 'vscode';
import { env, logPath } from './config';

/** Startup-complete message ("open for e-business"), language independent. */
const STARTED = /CWWSR0001I|WSVR0001I/;
const CODE = /\b([A-Z]{4,5}\d{4}[EW])\b/g;
const ERROR_LINE = /\] [0-9a-f]{8} \S+\s+E |^\s*Caused by:|\bException\b.*:\s/;

/** Follows SystemOut.log in an output channel (tail -F), skipping the configured noise patterns. */
export class LogFollower implements vscode.Disposable {
  private channel: vscode.OutputChannel | undefined;
  private timer: NodeJS.Timeout | undefined;
  private pos = 0;
  private file = '';

  get active(): boolean { return this.timer !== undefined; }

  start(): void {
    const file = logPath();
    if (!file) { void vscode.window.showWarningMessage(vscode.l10n.t('No server log configured.')); return; }
    this.channel ??= vscode.window.createOutputChannel('WebSphere SystemOut', 'log');
    this.channel.show(true);
    if (this.timer && this.file === file) { return; }
    this.stop();
    this.file = file;
    try { this.pos = Math.max(0, fs.statSync(file).size - 64 * 1024); }
    catch { this.pos = 0; this.channel.appendLine(vscode.l10n.t('(waiting for {0})', file)); }
    this.timer = setInterval(() => this.read(), 1000);
    this.read();
  }

  private read(): void {
    let size: number;
    try { size = fs.statSync(this.file).size; } catch { return; }
    if (size < this.pos) { this.pos = 0; this.channel?.appendLine('---- log rotated ----'); }
    if (size === this.pos) { return; }
    const len = Math.min(size - this.pos, 4 * 1024 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(this.file, 'r');
    try { fs.readSync(fd, buf, 0, len, this.pos); } finally { fs.closeSync(fd); }
    this.pos += len;
    const ignore = env().logIgnore;
    const text = decode(buf).split(/\r?\n/).filter(l => !ignore.some(r => r.test(l))).join('\n');
    this.channel?.append(text);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }

  dispose(): void {
    this.stop();
    this.channel?.dispose();
  }
}

function decode(buf: Buffer): string {
  const enc = env().logEncoding;
  try { return new TextDecoder(enc === 'latin1' ? 'windows-1252' : enc).decode(buf); }
  catch { return buf.toString('latin1'); }
}

let reportChannel: vscode.OutputChannel | undefined;

/** Summary of errors since the last "open for e-business": message codes by count + last error lines. */
export function errorReport(maxLines = 60): void {
  const file = logPath();
  if (!file || !fs.existsSync(file)) { void vscode.window.showWarningMessage(vscode.l10n.t('Log not found: {0}', file ?? '')); return; }
  const lines = decode(fs.readFileSync(file)).split(/\r?\n/);
  let start = 0;
  for (let i = lines.length - 1; i >= 0; i--) { if (STARTED.test(lines[i])) { start = i; break; } }
  const ignore = env().logIgnore;
  const counts = new Map<string, number>();
  const errors: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (ignore.some(r => r.test(l))) { continue; }
    for (const m of l.matchAll(CODE)) { counts.set(m[1], (counts.get(m[1]) ?? 0) + 1); }
    if (ERROR_LINE.test(l)) { errors.push(`${i + 1}: ${l.slice(0, 400)}`); }
  }
  reportChannel ??= vscode.window.createOutputChannel('WebSphere Errors', 'log');
  const c = reportChannel;
  c.clear();
  c.appendLine(`${file}`);
  c.appendLine(start ? vscode.l10n.t('Since last startup (line {0}): {1}', start + 1, lines[start].slice(0, 30))
    : vscode.l10n.t('No startup message found: whole file.'));
  c.appendLine('');
  c.appendLine(vscode.l10n.t('== Error/warning codes (count) =='));
  if (!counts.size) { c.appendLine(vscode.l10n.t('(none)')); }
  for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) { c.appendLine(`${String(n).padStart(6)}  ${code}`); }
  c.appendLine('');
  c.appendLine(vscode.l10n.t('== Last {0} error lines and "Caused by" ==', maxLines));
  for (const l of errors.slice(-maxLines)) { c.appendLine(l); }
  c.show(true);
}
