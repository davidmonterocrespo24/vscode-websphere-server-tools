import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AppConfig, AppModule, env, stamp, workspaceRoot } from './config';
import { discover, MavenProject, norm } from './maven';

/**
 * "Hot publish": copies changed files into the exploded application under installedApps, the
 * same thing RSA/Eclipse do when publishing to a local server. Every overwritten file is first
 * copied to <backupDir>/publish_<app>_<what>_<timestamp>/ with the same relative path.
 *
 * Deployment descriptors (web.xml, portlet.xml, faces-config) are never hot-published: they
 * need a regular application update.
 */

const DESCRIPTORS = /^WEB-INF[\\/](web\.xml|portlet\.xml|faces-config.*\.xml)$/i;
// ibm-*-bnd/ext are rewritten by WAS at install time: they always differ from the sources
const SKIP = /^(WEB-INF[\\/](lib|classes|ibm-[^\\/]*)|META-INF)([\\/]|$)/i;

export interface Result {
  copied: string[];
  changedDescriptors: string[];
  backup?: string;
  error?: string;
}

const failed = (error: string): Result => ({ copied: [], changedDescriptors: [], error });

function same(a: string, b: string): boolean {
  let sb: fs.Stats;
  try { sb = fs.statSync(b); } catch { return false; }
  if (fs.statSync(a).size !== sb.size) { return false; }
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

function* walk(dir: string, base = dir): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { yield* walk(p, base); }
    else if (e.isFile()) { yield path.relative(base, p); }
  }
}

class Copier {
  readonly res: Result = { copied: [], changedDescriptors: [] };
  private readonly backupDir: string;

  constructor(private readonly dest: string, label: string) {
    this.backupDir = path.join(env().backupDir, `publish_${label}_${stamp()}`);
  }

  copy(src: string, rel: string): void {
    const dst = path.join(this.dest, rel);
    if (same(src, dst)) { return; }
    if (fs.existsSync(dst)) {
      const bk = path.join(this.backupDir, rel);
      fs.mkdirSync(path.dirname(bk), { recursive: true });
      fs.copyFileSync(dst, bk);
      this.res.backup = this.backupDir;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    this.res.copied.push(rel);
  }
}

export function projectDir(project: string): string | undefined {
  if (path.isAbsolute(project)) { return project; }
  const root = workspaceRoot();
  return root ? path.join(root, project) : undefined;
}

/** Web root of a war project: configured, or WebContent (Eclipse/RSA) or src/main/webapp (Maven). */
export function webRoot(app: AppConfig): string | undefined {
  const dir = app.webProject ? projectDir(app.webProject) : undefined;
  if (!dir) { return undefined; }
  if (app.webRoot) { return path.join(dir, app.webRoot); }
  return [path.join(dir, 'WebContent'), path.join(dir, 'src', 'main', 'webapp')].find(p => fs.existsSync(p));
}

function classVersion(file: string): number {
  const fd = fs.openSync(file, 'r');
  try {
    const b = Buffer.alloc(8);
    fs.readSync(fd, b, 0, 8, 0);
    return b.readUInt16BE(6);
  } finally {
    fs.closeSync(fd);
  }
}

/** Error message when classes were compiled for a newer Java than the server runs. */
function checkClassVersion(classesDir: string): string | undefined {
  if (!fs.existsSync(classesDir)) { return undefined; }
  const max = env().maxClassVersion;
  const bad = [...walk(classesDir)].filter(r => r.endsWith('.class') && classVersion(path.join(classesDir, r)) > max);
  return bad.length
    ? vscode.l10n.t('{0} classes in {1} were compiled for a newer Java than the server supports (class version > {2}), e.g. {3}. Rebuild with the server JDK.',
      bad.length, classesDir, max, bad[0])
    : undefined;
}

export function publishWebResources(app: AppConfig): Result {
  const src = webRoot(app);
  if (app.type !== 'war' || !src) { return failed(vscode.l10n.t('{0} is not a war with a web project.', app.name)); }
  if (!fs.existsSync(app.installedPath)) { return failed(vscode.l10n.t('Installed application not found: {0}', app.installedPath)); }
  const cp = new Copier(app.installedPath, `${app.name}_web`);
  for (const rel of walk(src)) {
    if (SKIP.test(rel)) { continue; }
    if (DESCRIPTORS.test(rel)) {
      if (!same(path.join(src, rel), path.join(app.installedPath, rel))) { cp.res.changedDescriptors.push(rel); }
      continue;
    }
    cp.copy(path.join(src, rel), rel);
  }
  return cp.res;
}

/** Publish-on-save: finds the war whose web root contains the file. */
export function publishFile(file: string): { app: AppConfig; res: Result } | undefined {
  for (const app of env().applications) {
    const src = app.type === 'war' ? webRoot(app) : undefined;
    if (!src) { continue; }
    const rel = path.relative(src, file);
    if (rel.startsWith('..') || path.isAbsolute(rel) || SKIP.test(rel)) { continue; }
    if (DESCRIPTORS.test(rel)) { return { app, res: { copied: [], changedDescriptors: [rel] } }; }
    const cp = new Copier(app.installedPath, `${app.name}_web`);
    cp.copy(file, rel);
    return { app, res: cp.res };
  }
  return undefined;
}

export function publishClasses(app: AppConfig): Result {
  const dir = app.webProject ? projectDir(app.webProject) : undefined;
  if (app.type !== 'war' || !dir) { return failed(vscode.l10n.t('{0} is not a war with a web project.', app.name)); }
  const src = path.join(dir, 'target', 'classes');
  if (!fs.existsSync(src)) { return failed(vscode.l10n.t('{0} does not exist. Build the project first.', src)); }
  const bad = checkClassVersion(src);
  if (bad) { return failed(bad); }
  const cp = new Copier(path.join(app.installedPath, 'WEB-INF', 'classes'), `${app.name}_classes`);
  for (const rel of walk(src)) { cp.copy(path.join(src, rel), rel); }
  return cp.res;
}

/** Main jar produced by Maven in <project>/target (not -sources/-javadoc/-tests), newest first. */
function builtJar(dir: string): string | undefined {
  const target = path.join(dir, 'target');
  if (!fs.existsSync(target)) { return undefined; }
  return fs.readdirSync(target)
    .filter(f => /\.jar$/i.test(f) && !/-(sources|javadoc|tests)\.jar$/i.test(f))
    .map(f => path.join(target, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

export function publishModules(app: AppConfig, modules: AppModule[]): Result {
  if (!fs.existsSync(app.installedPath)) { return failed(vscode.l10n.t('Installed application not found: {0}', app.installedPath)); }
  const cp = new Copier(app.installedPath, `${app.name}_modules`);
  for (const m of modules) {
    const dir = projectDir(m.project);
    if (!dir || !fs.existsSync(dir)) { return failed(vscode.l10n.t('Project {0} not found.', m.project)); }
    const bad = checkClassVersion(path.join(dir, 'target', 'classes'));
    if (bad) { return failed(bad); }
    const jar = builtJar(dir);
    if (!jar) { return failed(vscode.l10n.t('No jar in {0}/target. Run "package" or "install" first.', m.project)); }
    cp.copy(jar, m.target);
  }
  return cp.res;
}

/** Applications (and which of their modules) a Maven project feeds. */
export function appsUsing(project: MavenProject): { app: AppConfig; modules: AppModule[]; isWeb: boolean }[] {
  const out: { app: AppConfig; modules: AppModule[]; isWeb: boolean }[] = [];
  for (const app of env().applications) {
    const modules = (app.modules ?? []).filter(m => { const d = projectDir(m.project); return d && norm(d) === norm(project.dir); });
    const w = app.webProject ? projectDir(app.webProject) : undefined;
    const isWeb = !!w && norm(w) === norm(project.dir);
    if (modules.length || isWeb) { out.push({ app, modules, isWeb }); }
  }
  return out;
}

export function report(title: string, r: Result): void {
  if (r.error) { void vscode.window.showErrorMessage(`${title}: ${r.error}`); return; }
  if (r.changedDescriptors.length) {
    void vscode.window.showWarningMessage(vscode.l10n.t(
      '{0}: deployment descriptors changed ({1}). They are not hot-published: update the application (redeploy the war/ear).',
      title, r.changedDescriptors.join(', ')));
  }
  const msg = r.copied.length
    ? vscode.l10n.t('{0}: {1} file(s) copied.', title, r.copied.length) + (r.backup ? ' ' + vscode.l10n.t('Backup: {0}', r.backup) : '')
    : vscode.l10n.t('{0}: nothing changed.', title);
  void vscode.window.showInformationMessage(msg);
}

/**
 * The web project whose web root best matches an installed war: at least half of a sample of
 * its files (outside WEB-INF/META-INF) must exist in the war with the same relative path.
 * Matching only folder names is not enough (many wars have js/, img/, css/…).
 */
function bestWebProject(candidates: MavenProject[], warDir: string): MavenProject | undefined {
  let best: { p: MavenProject; score: number } | undefined;
  for (const p of candidates) {
    const wr = webRoot({ name: '', type: 'war', installedPath: warDir, webProject: p.dir });
    if (!wr) { continue; }
    const sample: string[] = [];
    for (const rel of walk(wr)) {
      if (!SKIP.test(rel) && !DESCRIPTORS.test(rel)) { sample.push(rel); }
      if (sample.length >= 300) { break; }
    }
    if (sample.length < 3) { continue; }
    const score = sample.filter(rel => fs.existsSync(path.join(warDir, rel))).length / sample.length;
    if (score >= 0.5 && (!best || score > best.score)) { best = { p, score }; }
  }
  return best?.p;
}

/**
 * Builds the applications list from installedApps: each installed .ear with an exploded .war
 * becomes a "war" app (web project = the workspace project whose web root matches), and each
 * jar (WEB-INF/lib, lib/, EJB modules) whose name matches a workspace Maven project becomes a module.
 */
export function detectApplications(profilePath: string): AppConfig[] {
  const projects = discover();
  const root = workspaceRoot() ?? '';
  const relOf = (p: MavenProject) => (path.relative(root, p.dir).startsWith('..') ? p.dir : path.relative(root, p.dir));
  const base = (jar: string) => jar.replace(/\.jar$/i, '').replace(/-\d[\w.-]*$/, '').toLowerCase();
  const match = (jar: string) => projects.find(p => p.packaging !== 'pom' &&
    (p.artifactId.toLowerCase() === base(jar) || path.basename(p.dir).toLowerCase() === base(jar)));
  const ls = (d: string) => { try { return fs.readdirSync(d); } catch { return []; } };
  const modulesIn = (dir: string, rel: string): AppModule[] =>
    ls(dir).filter(j => /\.jar$/i.test(j)).map(j => ({ j, p: match(j) })).filter(x => x.p)
      .map(x => ({ project: relOf(x.p!), target: rel ? `${rel}/${x.j}` : x.j }));

  const webProjects = projects.filter(p => p.packaging === 'war' ||
    fs.existsSync(path.join(p.dir, 'WebContent', 'WEB-INF')) || fs.existsSync(path.join(p.dir, 'src', 'main', 'webapp', 'WEB-INF')));

  // shared library references currently mapped to an application (deployment.xml)
  const sharedLibs = (name: string): string[] | undefined => {
    const cells = path.join(profilePath, 'config', 'cells');
    for (const c of ls(cells)) {
      const dep = path.join(cells, c, 'applications', `${name}.ear`, 'deployments', name, 'deployment.xml');
      if (fs.existsSync(dep)) {
        const libs = [...fs.readFileSync(dep, 'utf8').matchAll(/libraryName="([^"]+)"/g)].map(m => m[1]);
        return libs.length ? [...new Set(libs)] : undefined;
      }
    }
    return undefined;
  };

  const installed = path.join(profilePath, 'installedApps');
  const apps: AppConfig[] = [];
  for (const cell of ls(installed)) {
    for (const ear of ls(path.join(installed, cell)).filter(n => n.endsWith('.ear'))) {
      const earDir = path.join(installed, cell, ear);
      const name = ear.replace(/\.ear$/, '');
      const wars = ls(earDir).filter(n => n.endsWith('.war') && fs.statSync(path.join(earDir, n)).isDirectory());
      if (wars.length) {
        const warDir = path.join(earDir, wars[0]);
        const modules = modulesIn(path.join(warDir, 'WEB-INF', 'lib'), 'WEB-INF/lib');
        const web = bestWebProject(webProjects, warDir);
        if (web || modules.length) {
          apps.push({ name, type: 'war', installedPath: warDir, webProject: web ? relOf(web) : undefined, sharedLibraries: sharedLibs(name), modules });
        }
      } else {
        const modules = [...modulesIn(earDir, ''), ...modulesIn(path.join(earDir, 'lib'), 'lib')];
        if (modules.length) { apps.push({ name, type: 'ear', installedPath: earDir, sharedLibraries: sharedLibs(name), modules }); }
      }
    }
  }
  return apps;
}
