import * as path from 'path';
import * as vscode from 'vscode';
import { AppConfig, AppModule, env } from './config';
import { discover, MavenProject, norm, roots } from './maven';
import { ServerInfo, ServerMonitor, stateLabel } from './server';


// ---------------------------------------------------------------- Server view

export class ServerNode extends vscode.TreeItem {
  constructor(i: ServerInfo) {
    const e = env();
    super(e.server ?? vscode.l10n.t('No server found'), vscode.TreeItemCollapsibleState.None);
    this.description = stateLabel(i.state) + (i.debugListening ? ` · debug ${e.debugPort}` : '');
    this.contextValue = `server.${i.state}`;
    const color = { running: 'testing.iconPassed', starting: 'testing.iconQueued', stopped: 'testing.iconFailed', unknown: 'disabledForeground' }[i.state];
    this.iconPath = new vscode.ThemeIcon(i.state === 'starting' ? 'loading~spin' : 'circle-filled', new vscode.ThemeColor(color));
    if (i.state === 'unknown') {
      this.command = { command: 'wasTools.config.detect', title: vscode.l10n.t('Detect environment') };
    }
    this.tooltip = new vscode.MarkdownString([
      `**${e.server ?? '?'}** — ${stateLabel(i.state)}`,
      '',
      `- ${vscode.l10n.t('Profile')}: \`${e.profilePath ?? '-'}\``,
      `- ${vscode.l10n.t('Cell / node')}: ${e.cell ?? '-'} / ${e.node ?? '-'}`,
      `- ${vscode.l10n.t('Application URL')}: ${e.appUrl}`,
      `- ${vscode.l10n.t('Debug (JDWP)')}: ${e.debugPort} ${e.debugEnabled ? '' : vscode.l10n.t('(debug mode disabled in server.xml)')}`,
      i.pid ? `- PID ${i.pid}` : '',
      e.portalHome ? `- WebSphere Portal` : '',
    ].filter(Boolean).join('\n'));
  }
}

class Action extends vscode.TreeItem {
  constructor(label: string, command: string, icon: string, tooltip?: string, args: unknown[] = []) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command, title: label, arguments: args };
    this.iconPath = new vscode.ThemeIcon(icon);
    this.tooltip = tooltip;
  }
}

class Group extends vscode.TreeItem {
  constructor(label: string, icon: string, readonly children: vscode.TreeItem[], expanded = true, id?: string) {
    super(label, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon(icon);
    if (id) { this.id = id; }
  }
}

export class AppNode extends vscode.TreeItem {
  constructor(readonly app: AppConfig) {
    super(app.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `app:${app.name}`;
    this.description = app.type + (app.webProject ? ` · ${app.webProject}` : '');
    this.iconPath = new vscode.ThemeIcon(app.type === 'war' ? 'globe' : 'package');
    this.contextValue = `app.${app.type}`;
    this.tooltip = app.installedPath;
  }
}

export class AppModuleNode extends vscode.TreeItem {
  constructor(readonly app: AppConfig, readonly module: AppModule) {
    super(path.basename(module.project), vscode.TreeItemCollapsibleState.None);
    this.description = module.target;
    this.iconPath = new vscode.ThemeIcon('file-zip');
    this.contextValue = 'appModule';
    this.tooltip = vscode.l10n.t('Click: build {0} with Maven (package) and copy the jar to {1}', module.project, module.target);
    this.command = { command: 'wasTools.app.publishModule', title: vscode.l10n.t('Build & publish module'), arguments: [this] };
  }
}

export class ServerTree implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly monitor: ServerMonitor) {
    monitor.onChange(() => this.emitter.fire(undefined));
  }

  refresh(): void { this.emitter.fire(undefined); }
  getTreeItem(n: vscode.TreeItem): vscode.TreeItem { return n; }

  getChildren(n?: vscode.TreeItem): vscode.TreeItem[] {
    if (n instanceof Group) { return n.children; }
    if (n instanceof AppNode) { return this.appChildren(n.app); }
    if (n) { return []; }
    const e = env();
    const apps = e.applications;
    return [
      new ServerNode(this.monitor.info),
      new Group(vscode.l10n.t('Applications'), 'layers', apps.length
        ? apps.map(a => new AppNode(a))
        : [new Action(vscode.l10n.t('Detect installed applications…'), 'wasTools.app.detect', 'search')], true, 'g:apps'),
      new Group(vscode.l10n.t('Logs'), 'output', [
        new Action(vscode.l10n.t('Follow SystemOut.log'), 'wasTools.logs.follow', 'eye'),
        new Action(vscode.l10n.t('Errors since last startup'), 'wasTools.logs.errors', 'warning'),
        new Action(vscode.l10n.t('Open SystemOut.log'), 'wasTools.logs.open', 'go-to-file'),
      ], true, 'g:logs'),
      new Group(vscode.l10n.t('Tools'), 'wrench', [
        new Action(vscode.l10n.t('Applications status (wsadmin)'), 'wasTools.tools.listApps', 'list-tree'),
        new Action(vscode.l10n.t('Backup configuration{0}', e.portalHome ? ' + Portal (XMLAccess)' : ''), 'wasTools.tools.backup', 'archive'),
        new Action(vscode.l10n.t('Set trace specification…'), 'wasTools.tools.trace', 'radio-tower'),
        new Action(vscode.l10n.t('Trust a remote certificate…'), 'wasTools.tools.addSigner', 'lock'),
        new Action(vscode.l10n.t('List trusted certificates'), 'wasTools.tools.listSigners', 'shield'),
        new Action(vscode.l10n.t('Enable JVM debug mode…'), 'wasTools.server.enableDebug', 'debug'),
        new Action(vscode.l10n.t('Open application'), 'wasTools.server.openApp', 'globe'),
        new Action(vscode.l10n.t('Open admin console'), 'wasTools.server.openConsole', 'settings-gear'),
      ], false, 'g:tools'),
      new Group(vscode.l10n.t('Configuration'), 'gear', [
        new Action(vscode.l10n.t('User and password ({0})…', e.username || vscode.l10n.t('none')), 'wasTools.config.credentials', 'key'),
        new Action(vscode.l10n.t('Detect environment…'), 'wasTools.config.detect', 'search'),
        new Action(vscode.l10n.t('Show resolved environment'), 'wasTools.config.show', 'info'),
        new Action(vscode.l10n.t('Settings…'), 'wasTools.config.open', 'settings'),
      ], false, 'g:config'),
    ];
  }

  private appChildren(app: AppConfig): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    if (app.type === 'war' && app.webProject) {
      items.push(
        new Action(vscode.l10n.t('Publish web resources (xhtml, js, css…)'), 'wasTools.app.publishWeb', 'cloud-upload',
          vscode.l10n.t('Copies changed files of the web root to the installed application.'), [app]),
        new Action(vscode.l10n.t('Build & publish classes'), 'wasTools.app.publishClasses', 'cloud-upload',
          vscode.l10n.t('Maven compile + copy target/classes to WEB-INF/classes.'), [app]),
      );
    }
    const mods = app.modules ?? [];
    if (mods.length) {
      items.push(new Action(vscode.l10n.t('Build & publish all {0} modules', mods.length), 'wasTools.app.publishAllModules', 'cloud-upload', undefined, [app]));
      items.push(new Group(vscode.l10n.t('Modules ({0})', mods.length), 'file-zip', mods.map(m => new AppModuleNode(app, m)), false, `mods:${app.name}`));
    }
    if (app.sharedLibraries?.length) {
      items.push(new Action(vscode.l10n.t('Map shared libraries ({0})', app.sharedLibraries.join(', ')), 'wasTools.app.sharedLibs', 'library', undefined, [app]));
    }
    items.push(new Action(vscode.l10n.t('Restart application'), 'wasTools.app.restart', 'debug-restart', undefined, [app]));
    return items;
  }
}

// ---------------------------------------------------------------- Maven view

export class MavenNode extends vscode.TreeItem {
  constructor(readonly project: MavenProject, hasChildren: boolean, parentId = '') {
    super(project.artifactId, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.id = `${parentId}>${norm(project.dir)}`;
    this.description = `${project.packaging}${project.rel !== project.artifactId ? ` · ${project.rel}` : ''}`;
    this.iconPath = new vscode.ThemeIcon(project.packaging === 'pom' ? 'folder-library' : project.packaging === 'war' ? 'globe' : 'package');
    this.contextValue = project.packaging === 'pom' ? 'maven.aggregator' : 'maven.module';
    this.resourceUri = vscode.Uri.file(project.pom);
    this.tooltip = project.pom;
    this.command = { command: 'vscode.open', title: 'Open pom.xml', arguments: [vscode.Uri.file(project.pom)] };
  }
}

export class MavenTree implements vscode.TreeDataProvider<MavenNode> {
  private readonly emitter = new vscode.EventEmitter<MavenNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private projects: MavenProject[] | undefined;

  refresh(): void { this.projects = undefined; this.emitter.fire(undefined); }
  getTreeItem(n: MavenNode): vscode.TreeItem { return n; }

  all(): MavenProject[] {
    this.projects ??= discover();
    return this.projects;
  }

  getChildren(n?: MavenNode): MavenNode[] {
    const all = this.all();
    const list = n
      ? n.project.modules.map(m => all.find(p => norm(p.dir) === norm(m))).filter((p): p is MavenProject => !!p)
      : roots(all);
    return list.map(p => new MavenNode(p, p.modules.length > 0, n?.id ?? 'mvn'));
  }
}
