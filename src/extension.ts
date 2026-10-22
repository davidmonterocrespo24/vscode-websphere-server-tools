import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { backupTrustStore, fullBackup } from './backup';
import { AppConfig, AppModule, env, initConfig, invalidate, logPath, requireServer, update, workspaceRoot } from './config';
import { configureCredentials, forgetPassword, initCredentials } from './credentials';
import * as detect from './detect';
import { errorReport, LogFollower } from './logs';
import * as maven from './maven';
import * as publish from './publish';
import { runInTerminal, Term } from './runner';
import * as server from './server';
import { AppModuleNode, AppNode, MavenNode, MavenTree, ServerTree } from './trees';


export function activate(context: vscode.ExtensionContext): void {
  initConfig(context);
  initCredentials(context);
  const jython = context.asAbsolutePath(path.join('resources', 'jython'));

  const monitor = new server.ServerMonitor();
  const serverTree = new ServerTree(monitor);
  const mavenTree = new MavenTree();
  const logs = new LogFollower();
  const status = vscode.window.createStatusBarItem('wasTools.status', vscode.StatusBarAlignment.Left, 50);
  status.name = 'WebSphere';
  status.command = 'workbench.view.extension.wasTools';

  const paintStatus = () => {
    const i = monitor.info;
    if (i.state === 'unknown') { status.hide(); return; }
    const icon = { running: '$(pass-filled)', starting: '$(sync~spin)', stopped: '$(circle-slash)', unknown: '' }[i.state];
    status.text = `${icon} ${env().server} ${server.stateLabel(i.state)}${i.debug === 'attached' ? ' · $(debug)' : i.debug === 'listening' ? ` · $(debug-alt) ${env().debugPort}` : ''}`;
    status.tooltip = vscode.l10n.t('WebSphere server — click to open the panel');
    status.show();
  };
  monitor.onChange(paintStatus);
  monitor.start();

  const refreshAll = async () => { invalidate(); await monitor.refresh(true); serverTree.refresh(); mavenTree.refresh(); paintStatus(); };
  const reg = (id: string, fn: (...a: any[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...a: any[]) => {
      try { return await fn(...a); }
      catch (err) { void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err)); }
    }));

  // Java debug sessions in this window: the debug port state changes when they start/stop
  const activeJavaSessions = new Set<vscode.DebugSession>();
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(s => { if (s.type === 'java') { activeJavaSessions.add(s); setTimeout(() => void monitor.refresh(true), 1500); } }),
    vscode.debug.onDidTerminateDebugSession(s => { if (activeJavaSessions.delete(s)) { setTimeout(() => void monitor.refresh(true), 1500); } }),
  );

  const pomWatcher = vscode.workspace.createFileSystemWatcher('**/pom.xml');
  pomWatcher.onDidCreate(() => mavenTree.refresh());
  pomWatcher.onDidDelete(() => mavenTree.refresh());
  pomWatcher.onDidChange(() => mavenTree.refresh());

  context.subscriptions.push(
    monitor, logs, status, pomWatcher,
    vscode.window.createTreeView('wasTools.server', { treeDataProvider: serverTree, showCollapseAll: true }),
    vscode.window.createTreeView('wasTools.maven', { treeDataProvider: mavenTree, showCollapseAll: true }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('wasTools')) { monitor.restartTimer(); void refreshAll(); }
    }),
  );

  // ------------------------------------------------------------ server
  reg('wasTools.server.refresh', refreshAll);
  reg('wasTools.server.start', async () => {
    requireServer();
    logs.start();
    await server.start();
    await monitor.refresh(true);
  });
  reg('wasTools.server.stop', async () => {
    const e = requireServer();
    const yes = vscode.l10n.t('Stop');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Stop {0}?', e.server), { modal: true }, yes) !== yes) { return; }
    await server.stop();
    await monitor.refresh(true);
  });
  reg('wasTools.server.restart', async () => {
    const e = requireServer();
    const yes = vscode.l10n.t('Restart');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Restart {0}?', e.server), { modal: true }, yes) !== yes) { return; }
    logs.start();
    await server.restart();
    await monitor.refresh(true);
  });
  reg('wasTools.server.forceStop', async () => {
    const yes = vscode.l10n.t('Kill');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Kill the server process without a clean shutdown?'), { modal: true }, yes) !== yes) { return; }
    await server.forceStop();
    await monitor.refresh(true);
  });
  reg('wasTools.server.attach', async () => {
    const e = env();
    if (!vscode.extensions.getExtension('vscjava.vscode-java-debug')) {
      const install = vscode.l10n.t('Install');
      if (await vscode.window.showErrorMessage(vscode.l10n.t('Attaching needs the "Debugger for Java" extension.'), install) === install) {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', 'vscjava.vscode-java-debug');
      }
      return;
    }
    const i = await monitor.refresh(true);
    if (i.debug === 'attached') {
      // JDWP accepts a single debugger: if it is ours, show it; otherwise say who has it
      const session = [...activeJavaSessions, vscode.debug.activeDebugSession].find(s =>
        s?.type === 'java' && s.configuration.request === 'attach' && Number(s.configuration.port) === e.debugPort);
      if (session) {
        vscode.debug.activeDebugSession = session;
        await vscode.commands.executeCommand('workbench.view.debug');
        void vscode.window.showInformationMessage(vscode.l10n.t('The debugger is already attached to {0} (session "{1}").', e.server ?? '', session.name));
      } else {
        void vscode.window.showWarningMessage(vscode.l10n.t(
          'Another debugger is already connected to port {0} (JDWP accepts only one). Stop that debug session, or the other IDE, and try again.', e.debugPort));
      }
      return;
    }
    if (i.debug !== 'listening') {
      const enable = vscode.l10n.t('Enable debug mode');
      const r = await vscode.window.showErrorMessage(
        vscode.l10n.t('Nothing listens on debug port {0} (server {1}). Is the server running with debug mode enabled?', e.debugPort, server.stateLabel(i.state)),
        ...(e.debugEnabled ? [] : [enable]));
      if (r === enable) { await vscode.commands.executeCommand('wasTools.server.enableDebug'); }
      return;
    }
    await vscode.debug.startDebugging(vscode.workspace.workspaceFolders?.[0], {
      type: 'java', name: `Attach ${e.server}`, request: 'attach', hostName: e.host, port: e.debugPort, timeout: 30000,
    });
  });
  reg('wasTools.server.enableDebug', async () => {
    const e = requireServer();
    const port = await vscode.window.showInputBox({ title: vscode.l10n.t('JDWP debug port'), value: String(e.debugPort), validateInput: v => /^\d+$/.test(v) ? undefined : vscode.l10n.t('Port number') });
    if (!port) { return; }
    const yes = vscode.l10n.t('Enable');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Change the server configuration (debugMode=true, port {0})? It applies after a restart.', port), { modal: true }, yes) !== yes) { return; }
    await server.wsadmin(vscode.l10n.t('WebSphere: Enable debug'), 'enable_debug.py', [port], jython);
    invalidate();
  });
  reg('wasTools.server.openApp', () => vscode.env.openExternal(vscode.Uri.parse(env().appUrl)));
  reg('wasTools.server.openConsole', () => vscode.env.openExternal(vscode.Uri.parse(env().adminConsoleUrl)));

  // ------------------------------------------------------------ logs
  reg('wasTools.logs.follow', () => logs.start());
  reg('wasTools.logs.stopFollow', () => logs.stop());
  reg('wasTools.logs.errors', () => errorReport());
  reg('wasTools.logs.open', async () => {
    const f = logPath();
    if (!f || !fs.existsSync(f)) { throw new Error(vscode.l10n.t('Log not found: {0}', f ?? '')); }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(f));
    const ed = await vscode.window.showTextDocument(doc, { preview: true });
    const end = new vscode.Position(ed.document.lineCount, 0);
    ed.revealRange(new vscode.Range(end, end));
  });

  // ------------------------------------------------------------ applications
  const pickApp = async (arg: unknown, filter: (a: AppConfig) => boolean = () => true): Promise<AppConfig | undefined> => {
    if (arg instanceof AppNode) { return arg.app; }
    if (arg && typeof arg === 'object' && 'installedPath' in arg) { return arg as AppConfig; }
    const apps = env().applications.filter(filter);
    if (!apps.length) {
      const d = vscode.l10n.t('Detect applications');
      if (await vscode.window.showWarningMessage(vscode.l10n.t('No applications configured.'), d) === d) { await vscode.commands.executeCommand('wasTools.app.detect'); }
      return undefined;
    }
    if (apps.length === 1) { return apps[0]; }
    return (await vscode.window.showQuickPick(apps.map(a => ({ label: a.name, description: a.type, a })), { title: vscode.l10n.t('Application') }))?.a;
  };

  const offerRestart = async (apps: AppConfig[], classesOnly: boolean) => {
    if (!apps.length) { return; }
    const names = apps.map(a => a.name).join(', ');
    const restart = vscode.l10n.t('Restart application');
    const msg = classesOnly && vscode.debug.activeDebugSession?.type === 'java'
      ? vscode.l10n.t('With the debugger attached, Hot Code Replace applies method-body changes on save. Restart {0} if you changed signatures or added fields/methods.', names)
      : vscode.l10n.t('Changes are loaded when {0} restarts.', names);
    if (await vscode.window.showInformationMessage(msg, restart) === restart) {
      for (const a of apps) { await restartApp(a, false); }
    }
  };

  const restartApp = async (app: AppConfig, confirm = true) => {
    const yes = vscode.l10n.t('Restart');
    if (confirm && await vscode.window.showWarningMessage(vscode.l10n.t('Restart application {0}? The server keeps running.', app.name), { modal: true }, yes) !== yes) { return; }
    await server.wsadmin(vscode.l10n.t('WebSphere: Restart {0}', app.name), 'restart_app.py', [app.name], jython);
  };

  const projectOf = (rel: string) => {
    const dir = publish.projectDir(rel);
    return dir ? maven.byDir(mavenTree.all(), dir) : undefined;
  };

  /** Maven goals + publish of whatever the project feeds, in one terminal. */
  const buildAndPublish = async (title: string, projects: maven.MavenProject[], goals: string,
    after: () => publish.Result[], restartApps: AppConfig[], classesOnly: boolean) => {
    const code = await runInTerminal(title, (term: Term) => maven.runMany(term, projects, goals, mavenTree.all()));
    if (code !== 0) { void vscode.window.showErrorMessage(vscode.l10n.t('Maven failed: nothing was published.')); return; }
    const results = after();
    results.forEach(r => publish.report(title, r));
    if (results.some(r => r.copied.length) && !results.some(r => r.error)) { await offerRestart(restartApps, classesOnly); }
  };

  reg('wasTools.app.detect', async () => {
    const e = requireServer();
    const apps = publish.detectApplications(e.profilePath);
    if (!apps.length) { void vscode.window.showWarningMessage(vscode.l10n.t('No installed application matches the Maven projects of this workspace.')); return; }
    const picked = await vscode.window.showQuickPick(apps.map(a => ({
      label: a.name, description: `${a.type}${a.webProject ? ` · ${a.webProject}` : ''} · ${vscode.l10n.t('{0} modules', a.modules?.length ?? 0)}`,
      detail: a.installedPath, picked: true, a,
    })), { canPickMany: true, title: vscode.l10n.t('Applications to manage (saved in the workspace settings)') });
    if (!picked?.length) { return; }
    await update('applications', picked.map(p => p.a));
    serverTree.refresh();
  });
  reg('wasTools.app.publishWeb', async (arg?: unknown) => {
    const app = await pickApp(arg, a => a.type === 'war' && !!a.webProject);
    if (app) { publish.report(vscode.l10n.t('Publish web resources ({0})', app.name), publish.publishWebResources(app)); }
  });
  reg('wasTools.app.publishClasses', async (arg?: unknown) => {
    const app = await pickApp(arg, a => a.type === 'war' && !!a.webProject);
    const p = app?.webProject ? projectOf(app.webProject) : undefined;
    if (!app || !p) { if (app) { throw new Error(vscode.l10n.t('Maven project {0} not found.', app.webProject ?? '')); } return; }
    await buildAndPublish(vscode.l10n.t('Build & publish classes ({0})', app.name), [p], 'compile', () => [publish.publishClasses(app)], [app], true);
  });
  const publishModules = async (app: AppConfig, mods: AppModule[]) => {
    const projects = mods.map(m => projectOf(m.project)).filter((p): p is maven.MavenProject => !!p);
    if (projects.length !== mods.length) { throw new Error(vscode.l10n.t('Some module projects were not found in the workspace.')); }
    await buildAndPublish(vscode.l10n.t('Build & publish modules ({0})', app.name), projects, 'package', () => [publish.publishModules(app, mods)], [app], false);
  };
  reg('wasTools.app.publishModule', async (arg?: unknown) => {
    if (arg instanceof AppModuleNode) { await publishModules(arg.app, [arg.module]); return; }
    const app = await pickApp(arg, a => !!a.modules?.length);
    if (!app?.modules?.length) { return; }
    const m = await vscode.window.showQuickPick(app.modules.map(x => ({ label: x.project, description: x.target, x })), { title: vscode.l10n.t('Module of {0}', app.name) });
    if (m) { await publishModules(app, [m.x]); }
  });
  reg('wasTools.app.publishAllModules', async (arg?: unknown) => {
    const app = await pickApp(arg, a => !!a.modules?.length);
    if (app?.modules?.length) { await publishModules(app, app.modules); }
  });
  reg('wasTools.app.restart', async (arg?: unknown) => {
    const app = await pickApp(arg);
    if (app) { await restartApp(app); }
  });
  reg('wasTools.app.sharedLibs', async (arg?: unknown) => {
    const app = await pickApp(arg, a => !!a.sharedLibraries?.length);
    if (!app?.sharedLibraries?.length) { return; }
    const yes = vscode.l10n.t('Map');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Map {0} to {1}? This changes the WAS configuration and restarts the application.',
      app.sharedLibraries.join(' + '), app.name), { modal: true }, yes) !== yes) { return; }
    await server.wsadmin(vscode.l10n.t('WebSphere: Shared libraries of {0}', app.name), 'map_shared_libs.py', [app.name, app.sharedLibraries.join('+')], jython);
  });

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
    if (!env().publishOnSave || doc.uri.scheme !== 'file') { return; }
    const r = publish.publishFile(doc.uri.fsPath);
    if (!r) { return; }
    if (r.res.changedDescriptors.length || r.res.error) { publish.report(vscode.l10n.t('Publish on save'), r.res); return; }
    if (r.res.copied.length) { vscode.window.setStatusBarMessage(`$(cloud-upload) ${r.app.name}: ${r.res.copied[0]}`, 4000); }
  }));

  // ------------------------------------------------------------ maven
  const mavenProject = async (arg: unknown): Promise<maven.MavenProject | undefined> => {
    const all = mavenTree.all();
    const p = maven.projectFrom(arg instanceof MavenNode ? arg : arg, all);
    if (p) { return p; }
    if (!all.length) { throw new Error(vscode.l10n.t('No pom.xml found in the workspace.')); }
    return (await vscode.window.showQuickPick(all.map(x => ({ label: x.artifactId, description: x.rel, x })), { title: vscode.l10n.t('Maven project') }))?.x;
  };
  const goal = (g: string) => async (arg?: unknown) => {
    const p = await mavenProject(arg);
    if (p) { await maven.run(p, g); }
  };
  reg('wasTools.maven.clean', goal('clean'));
  reg('wasTools.maven.compile', goal('compile'));
  reg('wasTools.maven.package', goal('package'));
  reg('wasTools.maven.install', goal('install'));
  reg('wasTools.maven.cleanInstall', goal('clean install'));
  reg('wasTools.maven.test', goal('test'));
  reg('wasTools.maven.refresh', () => mavenTree.refresh());
  reg('wasTools.maven.run', async (arg?: unknown) => {
    const p = await mavenProject(arg);
    if (!p) { return; }
    const last = context.workspaceState.get<string[]>('wasTools.lastGoals') ?? [];
    const choices = [...new Set([...last, ...maven.goalChoices()])];
    const qp = vscode.window.createQuickPick();
    qp.title = vscode.l10n.t('Maven goals for {0}', p.artifactId);
    qp.placeholder = vscode.l10n.t('Pick or type goals, e.g. "clean install -U"');
    qp.items = choices.map(label => ({ label }));
    const g = await new Promise<string | undefined>(resolve => {
      qp.onDidAccept(() => { resolve(qp.selectedItems[0]?.label ?? qp.value); qp.hide(); });
      qp.onDidHide(() => resolve(undefined));
      qp.onDidChangeValue(v => { qp.items = [...(v && !choices.includes(v) ? [{ label: v }] : []), ...choices.map(label => ({ label }))]; });
      qp.show();
    });
    qp.dispose();
    if (!g?.trim()) { return; }
    await context.workspaceState.update('wasTools.lastGoals', [g, ...last.filter(x => x !== g)].slice(0, 8));
    await maven.run(p, g.trim());
  });
  reg('wasTools.maven.buildAndPublish', async (arg?: unknown) => {
    const p = await mavenProject(arg);
    if (!p) { return; }
    const uses = publish.appsUsing(p);
    if (!uses.length) {
      throw new Error(vscode.l10n.t('{0} is not a web project or module of any configured application. Run "Detect installed applications".', p.artifactId));
    }
    const web = uses.filter(u => u.isWeb);
    await buildAndPublish(vscode.l10n.t('Build & publish {0}', p.artifactId), [p], web.length && uses.every(u => !u.modules.length) ? 'compile' : 'package',
      () => uses.flatMap(u => [
        ...(u.isWeb ? [publish.publishClasses(u.app), publish.publishWebResources(u.app)] : []),
        ...(u.modules.length ? [publish.publishModules(u.app, u.modules)] : []),
      ]),
      uses.map(u => u.app), uses.every(u => u.isWeb && !u.modules.length));
  });

  // ------------------------------------------------------------ tools
  reg('wasTools.tools.listApps', () => server.wsadmin(vscode.l10n.t('WebSphere: Applications'), 'list_apps.py', [], jython));
  reg('wasTools.tools.backup', () => fullBackup());
  reg('wasTools.tools.trace', async () => {
    const presets = [
      { label: '*=info', description: vscode.l10n.t('Default (trace off)') },
      { label: '*=info:com.ibm.ws.websvcs.trace.*=all', description: vscode.l10n.t('SOAP messages of JAX-WS web services (contains passwords!)') },
      { label: '*=info:com.ibm.ws.webcontainer*=all', description: vscode.l10n.t('Web container') },
      { label: '*=info:com.ibm.ws.classloader.*=all', description: vscode.l10n.t('Class loading') },
      { label: '*=info:SSL=all', description: 'SSL / TLS' },
    ];
    const pick = await vscode.window.showQuickPick([...presets, { label: vscode.l10n.t('Custom…'), description: '' }], { title: vscode.l10n.t('Trace specification (runtime only, reset on restart)') });
    if (!pick) { return; }
    const spec = pick.label === vscode.l10n.t('Custom…') ? await vscode.window.showInputBox({ title: vscode.l10n.t('Trace specification'), value: '*=info' }) : pick.label;
    if (!spec) { return; }
    await server.wsadmin(vscode.l10n.t('WebSphere: Trace'), 'set_trace.py', [spec], jython);
    if (spec !== '*=info') {
      void vscode.window.showWarningMessage(vscode.l10n.t('Trace goes to {0}. Set it back to *=info and delete trace.log when done: it can contain sensitive data.',
        path.join(env().logDir ?? '', 'trace.log')));
    }
  });
  reg('wasTools.tools.addSigner', async () => {
    const host = await vscode.window.showInputBox({ title: vscode.l10n.t('Remote host (e.g. services.example.com)'), ignoreFocusOut: true });
    if (!host) { return; }
    const port = await vscode.window.showInputBox({ title: vscode.l10n.t('Port'), value: '443', ignoreFocusOut: true });
    if (!port) { return; }
    const alias = await vscode.window.showInputBox({ title: vscode.l10n.t('Certificate alias'), value: host.replace(/\./g, '_'), ignoreFocusOut: true });
    if (!alias) { return; }
    const yes = vscode.l10n.t('Trust');
    if (await vscode.window.showWarningMessage(vscode.l10n.t('Trust the certificate presented by {0}:{1}? The trust store is backed up first; restart the server afterwards.', host, port),
      { modal: true }, yes) !== yes) { return; }
    const bk = backupTrustStore();
    if (bk) { void vscode.window.showInformationMessage(vscode.l10n.t('Trust store backed up to {0}', bk)); }
    await server.wsadmin(vscode.l10n.t('WebSphere: Trust certificate'), 'add_signer.py', [host, port, alias], jython);
  });
  reg('wasTools.tools.listSigners', () => server.wsadmin(vscode.l10n.t('WebSphere: Trusted certificates'), 'list_signers.py', [], jython));

  // ------------------------------------------------------------ configuration
  reg('wasTools.config.credentials', async () => { await configureCredentials(); serverTree.refresh(); });
  reg('wasTools.config.forgetPassword', forgetPassword);
  // workspace tab: that is where the project's values live (the user tab would look empty)
  reg('wasTools.config.open', () => vscode.commands.executeCommand(
    workspaceRoot() ? 'workbench.action.openWorkspaceSettings' : 'workbench.action.openSettings', { query: `@ext:${context.extension.id}` }));
  reg('wasTools.config.detect', async () => {
    const profiles = detect.allProfiles([vscode.workspace.getConfiguration('wasTools').get<string>('wasHome') ?? ''].filter(Boolean));
    if (!profiles.length) {
      const set = vscode.l10n.t('Set path');
      if (await vscode.window.showErrorMessage(vscode.l10n.t('No WebSphere installation found. Set wasTools.wasHome or wasTools.profilePath.'), set) === set) {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'wasTools.profilePath');
      }
      return;
    }
    const prof = profiles.length === 1 ? profiles[0] : (await vscode.window.showQuickPick(
      profiles.map(p => ({ label: p.name, description: p.isDefault ? vscode.l10n.t('default') : '', detail: p.path, p })), { title: vscode.l10n.t('WebSphere profile') }))?.p;
    if (!prof) { return; }
    const servers = detect.listServers(prof.path);
    const srv = servers.length <= 1 ? servers[0] : (await vscode.window.showQuickPick(
      servers.map(s => ({ label: s.server, description: `${s.cell} / ${s.node}`, s })), { title: vscode.l10n.t('Server') }))?.s;
    if (!srv) { throw new Error(vscode.l10n.t('The profile {0} has no application server.', prof.path)); }
    await update('profilePath', prof.path);
    await update('serverName', srv.server);
    const e = env();
    const msg = vscode.l10n.t('Using {0} / {1} (ports: https {2}, admin {3}, soap {4}, debug {5}).', prof.name, srv.server, e.ports.https, e.ports.adminHttps, e.ports.soap, e.debugPort);
    const apps = vscode.l10n.t('Detect applications');
    const save = vscode.l10n.t('Write detected values');
    const choice = await vscode.window.showInformationMessage(msg, apps, save);
    if (choice === apps) { await vscode.commands.executeCommand('wasTools.app.detect'); }
    if (choice === save) { await vscode.commands.executeCommand('wasTools.config.saveDetected'); }
    await refreshAll();
  });
  // Auto-detected values live only in memory, so the settings UI shows those fields empty:
  // this writes the chosen ones to the workspace settings (they stop following serverindex.xml).
  reg('wasTools.config.saveDetected', async () => {
    const e = env();
    const values: Record<string, unknown> = {
      wasHome: e.wasHome, profilePath: e.profilePath, serverName: e.server, cell: e.cell, node: e.node,
      'ports.https': e.ports.https, 'ports.http': e.ports.http, 'ports.adminHttps': e.ports.adminHttps, 'ports.soap': e.ports.soap,
      'ports.debug': e.debugPort, 'maven.javaHome': e.javaHome, 'maven.executable': e.mavenCmd, 'publish.maxClassVersion': e.maxClassVersion,
    };
    const items = e.detected.filter(k => values[k] !== undefined && values[k] !== '')
      .map(k => ({ label: `wasTools.${k}`, description: String(values[k]), picked: true, k }));
    if (!items.length) { void vscode.window.showInformationMessage(vscode.l10n.t('Every detected value is already in the settings.')); return; }
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true, title: vscode.l10n.t('Write detected values to the workspace settings'),
      placeHolder: vscode.l10n.t('Written values are fixed: they no longer follow changes in the server configuration'),
    });
    if (!chosen?.length) { return; }
    for (const c of chosen) { await update(c.k, values[c.k]); }
    const open = vscode.l10n.t('Open Settings');
    if (await vscode.window.showInformationMessage(vscode.l10n.t('{0} values written to the workspace settings.', chosen.length), open) === open) {
      await vscode.commands.executeCommand('wasTools.config.open');
    }
  });
  reg('wasTools.config.show', () => {
    const e = env();
    const ch = showEnvChannel ??= vscode.window.createOutputChannel('WebSphere Environment');
    ch.clear();
    const rows: [string, unknown][] = [
      ['wasHome', e.wasHome], ['profilePath', e.profilePath], ['cell', e.cell], ['node', e.node], ['serverName', e.server],
      ['host', e.host], ['ports', JSON.stringify(e.ports)], ['debugPort', `${e.debugPort} (debugMode ${e.debugEnabled})`],
      ['portal', e.portalHome ?? '-'], ['appUrl', e.appUrl], ['adminConsole', e.adminConsoleUrl], ['log', logPath()],
      ['username', e.username || '-'], ['maven', e.mavenCmd], ['maven.javaHome', e.javaHome ?? '(JAVA_HOME)'],
      ['maxClassVersion', e.maxClassVersion], ['backupDir', e.backupDir], ['applications', e.applications.map(a => a.name).join(', ') || '-'],
    ];
    for (const [k, v] of rows) { ch.appendLine(`${k.padEnd(16)} ${v ?? '-'}${e.detected.includes(k) || e.detected.includes(`ports.${k}`) ? '   (auto)' : ''}`); }
    ch.appendLine('');
    ch.appendLine(vscode.l10n.t('Auto-detected: {0}', e.detected.join(', ') || '-'));
    ch.show();
  });

  if (!workspaceRoot()) { return; }
  paintStatus();
}

let showEnvChannel: vscode.OutputChannel | undefined;

export function deactivate(): void { /* disposables are released by VS Code */ }
