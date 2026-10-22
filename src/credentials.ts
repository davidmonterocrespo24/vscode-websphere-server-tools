import * as vscode from 'vscode';
import { env, update } from './config';

/**
 * Admin credentials. The user name is a normal setting (wasTools.username); the password is kept
 * in VS Code SecretStorage (OS keychain / Windows Credential Manager), one per profile + user,
 * and is handed to child processes only as an environment variable.
 */

let secrets: vscode.SecretStorage;

export function initCredentials(context: vscode.ExtensionContext): void {
  secrets = context.secrets;
}

function key(): string {
  const e = env();
  return `wasTools.password:${(e.profilePath ?? '').toLowerCase()}:${e.username}`;
}

export interface Credentials { username: string; password: string }

/**
 * Returns credentials, asking for whatever is missing. Returns `null` when security is off
 * (no user name configured and the user chose to continue without), `undefined` when cancelled.
 */
export async function getCredentials(): Promise<Credentials | null | undefined> {
  let username = env().username;
  if (!username) {
    const u = await vscode.window.showInputBox({
      title: vscode.l10n.t('WebSphere administrator user (leave empty if administrative security is disabled)'),
      ignoreFocusOut: true,
    });
    if (u === undefined) { return undefined; }
    if (u === '') { return null; }
    await update('username', u, vscode.ConfigurationTarget.Global);
    username = u;
  }
  const saved = await secrets.get(key());
  if (saved) { return { username, password: saved }; }
  const password = await vscode.window.showInputBox({
    title: vscode.l10n.t('Password for {0}', username),
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) { return undefined; }
  const save = vscode.l10n.t('Save');
  const r = await vscode.window.showInformationMessage(
    vscode.l10n.t('Save the password in the VS Code secret storage?'), save, vscode.l10n.t('Only this time'));
  if (r === save) { await secrets.store(key(), password); }
  return { username, password };
}

export async function configureCredentials(): Promise<void> {
  const username = await vscode.window.showInputBox({
    title: vscode.l10n.t('WebSphere administrator user'),
    value: env().username,
    ignoreFocusOut: true,
  });
  if (username === undefined) { return; }
  if (username !== env().username) { await update('username', username, vscode.ConfigurationTarget.Global); }
  if (!username) { return; }
  const password = await vscode.window.showInputBox({ title: vscode.l10n.t('Password for {0}', username), password: true, ignoreFocusOut: true });
  if (password) {
    await secrets.store(key(), password);
    void vscode.window.showInformationMessage(vscode.l10n.t('Credentials for {0} saved (password in the secret storage).', username));
  }
}

export async function forgetPassword(): Promise<void> {
  await secrets.delete(key());
  void vscode.window.showInformationMessage(vscode.l10n.t('Saved password for {0} removed.', env().username));
}

/** Env vars + args for WAS command line tools (-username/-user + password from %WAS_PASSWORD%). */
export function credentialArgs(c: Credentials | null, userFlag: '-username' | '-user'): { args: string[]; env: Record<string, string> } {
  if (!c) { return { args: [], env: {} }; }
  const ref = process.platform === 'win32' ? '%WAS_PASSWORD%' : '"$WAS_PASSWORD"';
  return { args: [userFlag, c.username, '-password', ref], env: { WAS_PASSWORD: c.password } };
}
