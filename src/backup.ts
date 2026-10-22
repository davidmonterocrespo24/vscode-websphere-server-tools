import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { env, requireServer, stamp } from './config';
import { credentialArgs, getCredentials } from './credentials';
import { portalExportSample } from './detect';
import { runInTerminal } from './runner';

/**
 * Full backup before risky changes:
 *  1. copy of <profile>/config (WAS configuration: apps, BLAs, security, resources),
 *  2. WebSphere Portal only: XMLAccess export (pages, navigation, portlets, permissions).
 */
export async function fullBackup(): Promise<number> {
  const e = requireServer();
  const creds = e.portalHome ? await getCredentials() : null;
  if (creds === undefined) { return -1; }
  return runInTerminal(vscode.l10n.t('WebSphere: Backup'), async t => {
    const ts = stamp();
    fs.mkdirSync(e.backupDir, { recursive: true });
    const cfgDst = path.join(e.backupDir, `config_${ts}`);
    t.info(vscode.l10n.t('1) Copying {0} to {1}', path.join(e.profilePath, 'config'), cfgDst));
    fs.cpSync(path.join(e.profilePath, 'config'), cfgDst, { recursive: true });
    t.ok(vscode.l10n.t('   configuration copied'));
    if (!e.portalHome) { return 0; }

    t.info(vscode.l10n.t('2) Portal XMLAccess export'));
    const sample = portalExportSample(e.profilePath);
    if (!sample) { t.warn(vscode.l10n.t('ExportRelease.xml not found: skipping the Portal export.')); return 0; }
    const out = path.join(e.backupDir, `portal_export_${ts}.xml`);
    const c = credentialArgs(creds ?? null, '-user');
    const code = await t.exec(path.join(e.portalHome, 'bin', process.platform === 'win32' ? 'xmlaccess.bat' : 'xmlaccess.sh'),
      ['-in', sample, ...c.args, '-url', `http://${e.host}:${e.ports.http}/wps/config`, '-out', out],
      { env: c.env, secrets: ['WAS_PASSWORD'] });
    if (code !== 0 || !fs.existsSync(out) || fs.statSync(out).size === 0) {
      t.error(vscode.l10n.t('The export failed or is empty (is the server running?).'));
      return code || 1;
    }
    const xml = fs.readFileSync(out, 'utf8');
    t.ok(vscode.l10n.t('   {0}: {1} pages, {2} portlet instances', out,
      (xml.match(/<content-node/g) ?? []).length, (xml.match(/<portletinstance/g) ?? []).length));
    return 0;
  });
}

/** Copy of the node trust store before adding a certificate. */
export function backupTrustStore(): string | undefined {
  const e = requireServer();
  const t = path.join(e.profilePath, 'config', 'cells', e.cell, 'nodes', e.node, 'trust.p12');
  if (!fs.existsSync(t)) { return undefined; }
  fs.mkdirSync(e.backupDir, { recursive: true });
  const dst = path.join(e.backupDir, `trust.p12.before_cert_${stamp()}`);
  fs.copyFileSync(t, dst);
  return dst;
}
