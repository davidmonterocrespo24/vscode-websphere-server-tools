import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { env, workspaceRoot } from './config';
import { runInTerminal, Term } from './runner';

/**
 * Lightweight Maven support: finds the pom.xml files of the workspace, builds the
 * aggregator -> modules tree and runs goals with the configured JDK (by default the one
 * bundled with WAS, so the bytecode matches the server).
 */

export interface MavenProject {
  pom: string;            // absolute path of pom.xml
  dir: string;            // absolute folder
  artifactId: string;
  packaging: string;
  modules: string[];      // absolute folders of <modules>
  /** folder relative to the workspace root (or absolute when outside the workspace) */
  rel: string;
}

const SKIP = new Set(['node_modules', 'target', 'bin', '.git', '.svn', '.idea', '.vscode', 'build', 'out', 'dist']);

function readPom(pom: string): MavenProject | undefined {
  let xml: string;
  try { xml = fs.readFileSync(pom, 'utf8'); } catch { return undefined; }
  // ignore <parent>, <dependencies>, <build>, <profiles> blocks when looking for the project's own coordinates
  const own = xml.replace(/<parent>[\s\S]*?<\/parent>|<dependencies>[\s\S]*?<\/dependencies>|<build>[\s\S]*?<\/build>|<profiles>[\s\S]*?<\/profiles>|<dependencyManagement>[\s\S]*?<\/dependencyManagement>|<!--[\s\S]*?-->/g, '');
  const tag = (t: string) => new RegExp(`<${t}>\\s*([^<]+?)\\s*</${t}>`).exec(own)?.[1];
  const dir = path.dirname(pom);
  const modulesBlock = /<modules>([\s\S]*?)<\/modules>/.exec(own)?.[1] ?? '';
  const modules = [...modulesBlock.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)].map(m => path.resolve(dir, m[1]));
  const root = workspaceRoot();
  const rel = root && !path.relative(root, dir).startsWith('..') ? path.relative(root, dir) || '.' : dir;
  return { pom, dir, artifactId: tag('artifactId') ?? path.basename(dir), packaging: tag('packaging') ?? 'jar', modules, rel };
}

/** All Maven projects under the workspace (depth-limited) plus modules referenced from outside it. */
export function discover(maxDepth = 4): MavenProject[] {
  const root = workspaceRoot();
  if (!root) { return []; }
  const found = new Map<string, MavenProject>();
  const walk = (dir: string, depth: number) => {
    const pom = path.join(dir, 'pom.xml');
    if (fs.existsSync(pom)) {
      const p = readPom(pom);
      if (p) { found.set(norm(p.dir), p); }
    }
    if (depth >= maxDepth) { return; }
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* unreadable */ }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.')) { walk(path.join(dir, e.name), depth + 1); }
    }
  };
  walk(root, 0);
  // modules that live outside the workspace (e.g. <module>../../other-repo/lib</module>)
  for (const p of [...found.values()]) {
    for (const m of p.modules) {
      if (!found.has(norm(m))) {
        const mp = readPom(path.join(m, 'pom.xml'));
        if (mp) { found.set(norm(mp.dir), mp); }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

export function norm(p: string): string {
  return path.resolve(p).toLowerCase();
}

/** Projects not listed as a module of another project (tree roots). */
export function roots(all: MavenProject[]): MavenProject[] {
  const children = new Set(all.flatMap(p => p.modules.map(norm)));
  return all.filter(p => !children.has(norm(p.dir)));
}

export function byDir(all: MavenProject[], dir: string): MavenProject | undefined {
  return all.find(p => norm(p.dir) === norm(dir));
}

/** Resolves a project from a tree node, a pom.xml / folder Uri (explorer) or the active editor. */
export function projectFrom(arg: unknown, all = discover()): MavenProject | undefined {
  if (arg && typeof arg === 'object' && 'project' in arg) { return (arg as { project: MavenProject }).project; }
  let fsPath: string | undefined;
  if (arg instanceof vscode.Uri) { fsPath = arg.fsPath; }
  else { fsPath = vscode.window.activeTextEditor?.document.uri.fsPath; }
  if (!fsPath) { return undefined; }
  let dir = fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory() ? fsPath : path.dirname(fsPath);
  // walk up until a folder with pom.xml
  for (;;) {
    const p = byDir(all, dir) ?? (fs.existsSync(path.join(dir, 'pom.xml')) ? readPom(path.join(dir, 'pom.xml')) : undefined);
    if (p) { return p; }
    const up = path.dirname(dir);
    if (up === dir) { return undefined; }
    dir = up;
  }
}

export const DEFAULT_GOALS = ['clean', 'compile', 'package', 'install', 'clean install', 'clean package', 'test', 'dependency:tree', 'clean compile'];

export function goalChoices(): string[] {
  const configured = env().mavenGoals;
  return configured.length ? configured : DEFAULT_GOALS;
}

/** Command line flags common to every run. */
function flags(goals: string): string[] {
  const e = env();
  const f: string[] = [];
  if (e.mavenOffline) { f.push('-o'); }
  if (e.mavenSkipTests && !/\btest\b/.test(goals)) { f.push('-DskipTests'); }
  return [...f, ...e.mavenArgs];
}

function mavenEnv(): Record<string, string> {
  const e = env();
  if (!e.javaHome) { return {}; }
  const sep = process.platform === 'win32' ? ';' : ':';
  return { JAVA_HOME: e.javaHome, PATH: path.join(e.javaHome, 'bin') + sep + (process.env.PATH ?? process.env.Path ?? '') };
}

/** Runs goals on one project (like "Run As > Maven build" in RSA/Eclipse). */
export function runIn(t: Term, project: MavenProject, goals: string, extra: string[] = []): Promise<number> {
  const e = env();
  t.info(vscode.l10n.t('Maven {0} — {1}', goals, project.artifactId));
  if (e.javaHome) { t.line(`JAVA_HOME=${e.javaHome}`); }
  return t.exec(e.mavenCmd, [...goals.split(/\s+/).filter(Boolean), ...flags(goals), ...extra, '-f', project.pom],
    { cwd: project.dir, env: mavenEnv(), encoding: 'utf-8' });
}

export function run(project: MavenProject, goals: string): Promise<number> {
  return runInTerminal(vscode.l10n.t('Maven: {0} {1}', project.artifactId, goals), t => runIn(t, project, goals));
}

/**
 * Builds several projects through their aggregator using -pl (and optionally -am, "also make"
 * the modules they depend on). Falls back to one run per project when there is no common aggregator.
 */
export async function runMany(t: Term, projects: MavenProject[], goals: string, all = discover()): Promise<number> {
  const aggregator = all.find(a => projects.every(p => a.modules.some(m => norm(m) === norm(p.dir))));
  if (aggregator) {
    const pl = projects.map(p => path.relative(aggregator.dir, p.dir).split(path.sep).join('/')).join(',');
    return runIn(t, aggregator, goals, ['-pl', pl]);
  }
  for (const p of projects) {
    const code = await runIn(t, p, goals);
    if (code !== 0) { return code; }
  }
  return 0;
}
