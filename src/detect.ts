import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Auto-detection of a local WebSphere Application Server (traditional) / WebSphere Portal
 * installation. Everything here reads files only; nothing is modified.
 */

const isWin = process.platform === 'win32';

export interface Profile {
  name: string;
  path: string;
  isDefault: boolean;
  wasHome: string;
}

export interface ServerLocation {
  cell: string;
  node: string;
  server: string;
}

export interface Ports {
  soap?: number;          // SOAP_CONNECTOR_ADDRESS (wsadmin, stopServer)
  http?: number;          // WC_defaulthost
  https?: number;         // WC_defaulthost_secure
  adminHttps?: number;    // WC_adminhost_secure (admin console)
  bootstrap?: number;
}

export interface DebugInfo {
  enabled: boolean;
  port?: number;
}

function exists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function list(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function read(p: string): string | undefined {
  try { return fs.readFileSync(p, 'utf8'); } catch { return undefined; }
}

/** Candidate WAS install roots (the folder that contains bin/ and properties/profileRegistry.xml). */
export function candidateWasHomes(extra: string[] = []): string[] {
  const roots = isWin
    ? ['C:\\IBM\\WebSphere\\AppServer', 'C:\\Program Files\\IBM\\WebSphere\\AppServer',
       'C:\\Program Files (x86)\\IBM\\WebSphere\\AppServer', 'D:\\IBM\\WebSphere\\AppServer']
    : ['/opt/IBM/WebSphere/AppServer', '/opt/ibm/WebSphere/AppServer', path.join(os.homedir(), 'IBM/WebSphere/AppServer')];
  const env = [process.env.WAS_HOME, process.env.WAS_INSTALL_ROOT].filter((x): x is string => !!x);
  return [...new Set([...extra, ...env, ...roots])]
    .filter(h => exists(path.join(h, 'properties', 'profileRegistry.xml')));
}

/** Profiles registered in <WAS_HOME>/properties/profileRegistry.xml. */
export function readProfiles(wasHome: string): Profile[] {
  const xml = read(path.join(wasHome, 'properties', 'profileRegistry.xml')) ?? '';
  const out: Profile[] = [];
  for (const m of xml.matchAll(/<profile\b([^>]*)\/?>/g)) {
    const attr = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(m[1])?.[1];
    const p = attr('path');
    if (p && exists(p) && attr('isAReservationTicket') !== 'true') {
      out.push({ name: attr('name') ?? path.basename(p), path: p, isDefault: attr('isDefault') === 'true', wasHome });
    }
  }
  return out;
}

export function allProfiles(extraHomes: string[] = []): Profile[] {
  return candidateWasHomes(extraHomes).flatMap(readProfiles);
}

/** The WAS install root a profile belongs to (from bin/setupCmdLine), if it can be found. */
export function wasHomeOfProfile(profilePath: string): string | undefined {
  const setup = read(path.join(profilePath, 'bin', isWin ? 'setupCmdLine.bat' : 'setupCmdLine.sh')) ?? '';
  const m = /WAS_HOME=([^\r\n]+)/.exec(setup);
  return m ? m[1].trim().replace(/^"|"$/g, '') : undefined;
}

/** Every cell/node/server of a profile (application servers only, not nodeagents). */
export function listServers(profilePath: string): ServerLocation[] {
  const cells = path.join(profilePath, 'config', 'cells');
  const out: ServerLocation[] = [];
  for (const cell of list(cells)) {
    for (const node of list(path.join(cells, cell, 'nodes'))) {
      const servers = path.join(cells, cell, 'nodes', node, 'servers');
      for (const server of list(servers)) {
        if (server === 'nodeagent' || server === 'dmgr') { continue; }
        if (exists(path.join(servers, server, 'server.xml'))) { out.push({ cell, node, server }); }
      }
    }
  }
  return out;
}

function nodeDir(profilePath: string, loc: ServerLocation): string {
  return path.join(profilePath, 'config', 'cells', loc.cell, 'nodes', loc.node);
}

/** Ports of a server, from serverindex.xml. */
export function readPorts(profilePath: string, loc: ServerLocation): Ports {
  const xml = read(path.join(nodeDir(profilePath, loc), 'serverindex.xml')) ?? '';
  const entry = new RegExp(`<serverEntries\\b[^>]*serverName="${loc.server}"[^>]*>([\\s\\S]*?)</serverEntries>`).exec(xml)?.[1] ?? '';
  const port = (name: string) => {
    const m = new RegExp(`endPointName="${name}"[\\s\\S]*?port="(\\d+)"`).exec(entry);
    return m ? Number(m[1]) : undefined;
  };
  return {
    soap: port('SOAP_CONNECTOR_ADDRESS'),
    http: port('WC_defaulthost'),
    https: port('WC_defaulthost_secure'),
    adminHttps: port('WC_adminhost_secure'),
    bootstrap: port('BOOTSTRAP_ADDRESS'),
  };
}

/** JDWP settings from server.xml (jvmEntries debugMode / debugArgs). */
export function readDebug(profilePath: string, loc: ServerLocation): DebugInfo {
  const xml = read(path.join(nodeDir(profilePath, loc), 'servers', loc.server, 'server.xml')) ?? '';
  const jvm = /<jvmEntries\b([^>]*)>/.exec(xml)?.[1] ?? '';
  const enabled = /debugMode="true"/.test(jvm);
  const args = /debugArgs="([^"]*)"/.exec(jvm)?.[1] ?? '';
  const m = /address=(?:[\w.-]*:)?(\d+)/.exec(args);
  return { enabled, port: m ? Number(m[1]) : undefined };
}

/** WebSphere Portal profile? (it has PortalServer/bin/xmlaccess) */
export function portalHome(profilePath: string): string | undefined {
  const p = path.join(profilePath, 'PortalServer');
  return exists(path.join(p, 'bin', isWin ? 'xmlaccess.bat' : 'xmlaccess.sh')) ? p : undefined;
}

/** ExportRelease.xml sample shipped with Portal (used for a full XMLAccess export). */
export function portalExportSample(profilePath: string): string | undefined {
  const wasHome = wasHomeOfProfile(profilePath);
  const candidates = [
    wasHome && path.join(path.dirname(wasHome), 'PortalServer', 'doc', 'xml-samples', 'ExportRelease.xml'),
    path.join(profilePath, 'PortalServer', 'doc', 'xml-samples', 'ExportRelease.xml'),
  ].filter((x): x is string => !!x);
  return candidates.find(exists);
}

/** The JDK bundled with WAS (e.g. <WAS_HOME>/java/8.0) — matches the server's Java level. */
export function wasJavaHome(wasHome: string | undefined): string | undefined {
  if (!wasHome) { return undefined; }
  const javac = isWin ? 'javac.exe' : 'javac';
  const java = path.join(wasHome, 'java');
  const dirs = [...list(java).map(d => path.join(java, d)).sort().reverse(), java];
  return dirs.find(d => exists(path.join(d, 'bin', javac)));
}

/** Class file major version for a Java home: java/8.0 -> 52, 11 -> 55, 17 -> 61. */
export function classVersionFor(javaHome: string | undefined): number | undefined {
  if (!javaHome) { return undefined; }
  const release = read(path.join(javaHome, 'release')) ?? '';
  const v = /JAVA_VERSION="(?:1\.)?(\d+)/.exec(release)?.[1] ?? /(?:^|[\\/])(?:jdk-?)?(?:1\.)?(\d+)(?:\.\d+)*[\\/]?$/.exec(javaHome)?.[1];
  return v ? 44 + Number(v) : undefined;
}

/** Maven executable: mvnw in the workspace, MAVEN_HOME / M2_HOME, or "mvn" on PATH. */
export function detectMaven(workspaceRoot: string | undefined): string {
  const wrapper = workspaceRoot && path.join(workspaceRoot, isWin ? 'mvnw.cmd' : 'mvnw');
  if (wrapper && exists(wrapper)) { return wrapper; }
  for (const home of [process.env.MAVEN_HOME, process.env.M2_HOME]) {
    const exe = home && path.join(home, 'bin', isWin ? 'mvn.cmd' : 'mvn');
    if (exe && exists(exe)) { return exe; }
  }
  return isWin ? 'mvn.cmd' : 'mvn';
}

export const util = { exists, list, read };
