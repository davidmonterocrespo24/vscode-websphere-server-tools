import * as path from 'path';
import * as vscode from 'vscode';
import * as detect from './detect';

/** A jar built from a Maven project of the workspace and copied inside an installed application. */
export interface AppModule {
  /** Maven project folder, relative to the workspace folder (e.g. "FachadasIntegracion" or "libs/core") */
  project: string;
  /** Path of the jar inside the installed application (e.g. "WEB-INF/lib/core-1.0.jar", "lib/core.jar", "MyEJB.jar") */
  target: string;
}

/** An application installed in WAS that is published from the workspace. */
export interface AppConfig {
  name: string;
  type: 'war' | 'ear';
  /** Exploded install folder under installedApps (the .war folder inside the .ear, or the .ear) */
  installedPath: string;
  /** war only: project with the web root (WebContent / src/main/webapp) and target/classes */
  webProject?: string;
  /** war only: web root folder inside webProject; auto = WebContent or src/main/webapp */
  webRoot?: string;
  sharedLibraries?: string[];
  modules?: AppModule[];
}

const SECTION = 'wasTools';

function raw<T>(key: string): T | undefined {
  return vscode.workspace.getConfiguration(SECTION).get<T>(key);
}

/** "" / 0 / "auto" mean "detect it". */
function given<T>(v: T | undefined): v is T {
  return v !== undefined && v !== null && v !== '' && v !== 0 && v !== 'auto';
}

export function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export async function update(key: string, value: unknown, target = vscode.ConfigurationTarget.Workspace): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update(key, value, target);
  invalidate();
}

/** Fully resolved environment: explicit settings first, then auto-detection, then defaults. */
export interface WasEnv {
  wasHome?: string;
  profilePath?: string;
  cell?: string;
  node?: string;
  server?: string;
  host: string;
  username: string;
  ports: Required<Pick<detect.Ports, 'soap' | 'http' | 'https' | 'adminHttps'>>;
  debugPort: number;
  debugEnabled: boolean;
  portalHome?: string;
  appUrl: string;
  adminConsoleUrl: string;
  logDir?: string;
  javaHome?: string;
  maxClassVersion: number;
  mavenCmd: string;
  mavenOffline: boolean;
  mavenSkipTests: boolean;
  mavenArgs: string[];
  mavenGoals: string[];
  backupDir: string;
  applications: AppConfig[];
  publishOnSave: boolean;
  pollSeconds: number;
  stopTimeoutMinutes: number;
  logIgnore: RegExp[];
  logEncoding: string;
  consoleEncoding: string;
  /** what was auto-detected (for "Show environment") */
  detected: string[];
}

let cache: WasEnv | undefined;
let storageDir = '';

export function initConfig(context: vscode.ExtensionContext): void {
  storageDir = context.globalStorageUri.fsPath;
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(SECTION)) { invalidate(); }
  }));
}

export function invalidate(): void { cache = undefined; }

export function env(): WasEnv {
  if (cache) { return cache; }
  const detected: string[] = [];
  const auto = <T>(name: string, v: T | undefined, fallback: () => T | undefined): T | undefined => {
    if (given(v)) { return v; }
    const d = fallback();
    if (d !== undefined && d !== '') { detected.push(name); }
    return d;
  };

  const extraHomes = [raw<string>('wasHome')].filter((x): x is string => given(x));
  const profilePath = auto('profilePath', raw<string>('profilePath'), () => {
    const profiles = detect.allProfiles(extraHomes);
    return (profiles.find(p => p.isDefault) ?? profiles[0])?.path;
  });
  const wasHome = auto('wasHome', raw<string>('wasHome'),
    () => (profilePath && detect.wasHomeOfProfile(profilePath)) || detect.candidateWasHomes()[0]);

  const servers = profilePath ? detect.listServers(profilePath) : [];
  const serverName = auto('serverName', raw<string>('serverName'), () => servers[0]?.server);
  const loc = servers.find(s => s.server === serverName) ?? servers[0];
  const cell = auto('cell', raw<string>('cell'), () => loc?.cell);
  const node = auto('node', raw<string>('node'), () => loc?.node);
  const full = profilePath && cell && node && serverName ? { cell, node, server: serverName } : undefined;

  const ports = full && profilePath ? detect.readPorts(profilePath, full) : {};
  const dbg = full && profilePath ? detect.readDebug(profilePath, full) : { enabled: false };
  const p = (key: string, d: number | undefined, def: number) => auto(`ports.${key}`, raw<number>(`ports.${key}`), () => d) ?? def;
  const portalHome = profilePath && raw<boolean>('portal.enabled') !== false ? detect.portalHome(profilePath) : undefined;
  const host = raw<string>('host') || 'localhost';
  const httpsPort = p('https', ports.https, 9443);
  const adminPort = p('adminHttps', ports.adminHttps, 9043);

  const javaHome = auto('maven.javaHome', raw<string>('maven.javaHome'), () => detect.wasJavaHome(wasHome));
  const root = workspaceRoot();

  cache = {
    wasHome, profilePath, cell, node, server: serverName, host,
    username: raw<string>('username') ?? '',
    ports: { soap: p('soap', ports.soap, 8880), http: p('http', ports.http, 9080), https: httpsPort, adminHttps: adminPort },
    debugPort: p('debug', dbg.port, 7777),
    debugEnabled: dbg.enabled,
    portalHome,
    appUrl: auto('appUrl', raw<string>('appUrl'),
      () => `https://${host}:${httpsPort}${portalHome ? '/wps/myportal/' : '/'}`) ?? '',
    adminConsoleUrl: `https://${host}:${adminPort}/ibm/console`,
    logDir: profilePath && serverName ? path.join(profilePath, 'logs', serverName) : undefined,
    javaHome,
    maxClassVersion: auto('publish.maxClassVersion', raw<number>('publish.maxClassVersion'),
      () => detect.classVersionFor(javaHome)) ?? 52,
    mavenCmd: auto('maven.executable', raw<string>('maven.executable'),
      () => vscode.workspace.getConfiguration('maven').get<string>('executable.path') || detect.detectMaven(root)) ?? 'mvn',
    mavenOffline: raw<boolean>('maven.offline') ?? false,
    mavenSkipTests: raw<boolean>('maven.skipTests') ?? true,
    mavenArgs: raw<string[]>('maven.extraArgs') ?? [],
    mavenGoals: raw<string[]>('maven.goals') ?? [],
    backupDir: raw<string>('backupDir') || path.join(storageDir, 'backups'),
    applications: raw<AppConfig[]>('applications') ?? [],
    publishOnSave: raw<boolean>('publish.onSave') ?? false,
    pollSeconds: Math.max(3, raw<number>('pollSeconds') ?? 10),
    stopTimeoutMinutes: raw<number>('stopTimeoutMinutes') ?? 10,
    logIgnore: (raw<string[]>('logs.ignorePatterns') ?? []).map(s => { try { return new RegExp(s); } catch { return /$^/; } }),
    logEncoding: raw<string>('logs.encoding') || 'latin1',
    consoleEncoding: raw<string>('consoleEncoding') || (process.platform === 'win32' ? 'windows-1252' : 'utf-8'),
    detected,
  };
  return cache;
}

/** Throws a user-friendly error when no WAS profile/server could be found or configured. */
export function requireServer(e = env()): Required<Pick<WasEnv, 'profilePath' | 'server' | 'cell' | 'node'>> & WasEnv {
  if (!e.profilePath || !e.server || !e.cell || !e.node) {
    throw new Error(vscode.l10n.t('No WebSphere profile/server found. Run "WebSphere: Detect Environment" or set wasTools.profilePath.'));
  }
  return e as Required<Pick<WasEnv, 'profilePath' | 'server' | 'cell' | 'node'>> & WasEnv;
}

export function logPath(e = env()): string | undefined {
  return e.logDir ? path.join(e.logDir, 'SystemOut.log') : undefined;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
