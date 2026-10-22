// Generates package.json "contributes" + package.nls.json (en) + package.nls.es.json (es).
// Run: node scripts/gen-manifest.js   (keeps the rest of package.json as is)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const en = {}, es = {};
const s = (key, english, spanish) => { en[key] = english; es[key] = spanish; return `%${key}%`; };

// [id, en, es, icon]
const commands = [
  ['server.refresh', 'Refresh', 'Actualizar', '$(refresh)'],
  ['server.start', 'Start Server', 'Iniciar servidor', '$(play)'],
  ['server.stop', 'Stop Server', 'Parar servidor', '$(debug-stop)'],
  ['server.restart', 'Restart Server', 'Reiniciar servidor', '$(debug-restart)'],
  ['server.forceStop', 'Kill Server Process', 'Matar el proceso del servidor', '$(close)'],
  ['server.attach', 'Attach Debugger', 'Conectar depurador', '$(debug-alt)'],
  ['server.enableDebug', 'Enable JVM Debug Mode', 'Activar modo depuración de la JVM', '$(debug)'],
  ['server.openApp', 'Open Application in Browser', 'Abrir la aplicación en el navegador', '$(globe)'],
  ['server.openConsole', 'Open Admin Console', 'Abrir consola de administración', '$(settings-gear)'],
  ['logs.follow', 'Follow SystemOut.log', 'Seguir SystemOut.log', '$(output)'],
  ['logs.stopFollow', 'Stop Following the Log', 'Dejar de seguir el log'],
  ['logs.errors', 'Errors Since Last Startup', 'Errores desde el último arranque', '$(warning)'],
  ['logs.open', 'Open SystemOut.log', 'Abrir SystemOut.log', '$(go-to-file)'],
  ['app.detect', 'Detect Installed Applications', 'Detectar aplicaciones instaladas', '$(search)'],
  ['app.publishWeb', 'Publish Web Resources', 'Publicar recursos web', '$(cloud-upload)'],
  ['app.publishClasses', 'Build & Publish Classes', 'Compilar y publicar clases', '$(cloud-upload)'],
  ['app.publishModule', 'Build & Publish Module', 'Compilar y publicar módulo', '$(cloud-upload)'],
  ['app.publishAllModules', 'Build & Publish All Modules', 'Compilar y publicar todos los módulos', '$(cloud-upload)'],
  ['app.restart', 'Restart Application', 'Reiniciar aplicación', '$(debug-restart)'],
  ['app.sharedLibs', 'Map Shared Libraries', 'Asociar librerías compartidas', '$(library)'],
  ['maven.clean', 'Maven: clean', 'Maven: clean'],
  ['maven.compile', 'Maven: compile', 'Maven: compile'],
  ['maven.package', 'Maven: package', 'Maven: package'],
  ['maven.install', 'Maven: install', 'Maven: install'],
  ['maven.cleanInstall', 'Maven: clean install', 'Maven: clean install', '$(tools)'],
  ['maven.test', 'Maven: test', 'Maven: test'],
  ['maven.run', 'Maven: Run Goals…', 'Maven: ejecutar objetivos…', '$(play)'],
  ['maven.buildAndPublish', 'Build & Publish to Server', 'Compilar y publicar en el servidor', '$(cloud-upload)'],
  ['maven.refresh', 'Refresh Maven Projects', 'Actualizar proyectos Maven', '$(refresh)'],
  ['tools.listApps', 'Applications Status (wsadmin)', 'Estado de las aplicaciones (wsadmin)'],
  ['tools.backup', 'Backup Configuration', 'Respaldar configuración', '$(archive)'],
  ['tools.trace', 'Set Trace Specification', 'Cambiar especificación de traza'],
  ['tools.addSigner', 'Trust a Remote Certificate', 'Confiar en un certificado remoto'],
  ['tools.listSigners', 'List Trusted Certificates', 'Listar certificados confiables'],
  ['config.credentials', 'Configure User and Password', 'Configurar usuario y contraseña', '$(key)'],
  ['config.forgetPassword', 'Forget Saved Password', 'Olvidar contraseña guardada'],
  ['config.detect', 'Detect Environment', 'Detectar ambiente', '$(search)'],
  ['config.show', 'Show Resolved Environment', 'Mostrar ambiente resuelto'],
  ['config.saveDetected', 'Write Detected Values to Settings', 'Guardar valores detectados en la configuración', '$(save)'],
  ['config.open', 'Open Settings', 'Abrir configuración', '$(gear)'],
];

const category = s('category', 'WebSphere', 'WebSphere');
const contributes = {
  commands: commands.map(([id, e, sp, icon]) => ({
    command: `wasTools.${id}`, title: s(`cmd.${id}`, e, sp), category, ...(icon ? { icon } : {}),
  })),
  viewsContainers: { activitybar: [{ id: 'wasTools', title: s('container', 'WebSphere', 'WebSphere'), icon: 'media/was.svg' }] },
  views: {
    wasTools: [
      { id: 'wasTools.server', name: s('view.server', 'Server', 'Servidor') },
      { id: 'wasTools.maven', name: s('view.maven', 'Maven Projects', 'Proyectos Maven') },
    ],
  },
  viewsWelcome: [{
    view: 'wasTools.maven',
    contents: s('welcome.maven', 'No pom.xml found in this workspace.\n[Refresh](command:wasTools.maven.refresh)', 'No se encontró ningún pom.xml en este workspace.\n[Actualizar](command:wasTools.maven.refresh)'),
  }],
  submenus: [{ id: 'wasTools.mavenMenu', label: s('submenu.maven', 'Maven (WebSphere)', 'Maven (WebSphere)') }],
  menus: {
    'view/title': [
      { command: 'wasTools.server.refresh', when: 'view == wasTools.server', group: 'navigation@1' },
      { command: 'wasTools.logs.follow', when: 'view == wasTools.server', group: 'navigation@2' },
      { command: 'wasTools.config.open', when: 'view == wasTools.server', group: 'navigation@9' },
      { command: 'wasTools.maven.refresh', when: 'view == wasTools.maven', group: 'navigation' },
    ],
    'view/item/context': [
      { command: 'wasTools.server.start', when: 'view == wasTools.server && viewItem == server.stopped', group: 'inline@1' },
      { command: 'wasTools.server.attach', when: 'view == wasTools.server && viewItem == server.running', group: 'inline@1' },
      { command: 'wasTools.server.restart', when: 'view == wasTools.server && viewItem =~ /^server\\.(running|starting)$/', group: 'inline@2' },
      { command: 'wasTools.server.stop', when: 'view == wasTools.server && viewItem =~ /^server\\.(running|starting)$/', group: 'inline@3' },
      { command: 'wasTools.server.forceStop', when: 'view == wasTools.server && viewItem =~ /^server\\.(running|starting)$/', group: '9_danger' },
      { command: 'wasTools.server.enableDebug', when: 'view == wasTools.server && viewItem =~ /^server\\./', group: '1_debug' },
      { command: 'wasTools.app.restart', when: 'view == wasTools.server && viewItem =~ /^app\\./', group: 'inline' },
      { command: 'wasTools.app.publishWeb', when: 'view == wasTools.server && viewItem == app.war', group: '1_publish@1' },
      { command: 'wasTools.app.publishClasses', when: 'view == wasTools.server && viewItem == app.war', group: '1_publish@2' },
      { command: 'wasTools.app.publishAllModules', when: 'view == wasTools.server && viewItem =~ /^app\\./', group: '1_publish@3' },
      { command: 'wasTools.app.publishModule', when: 'view == wasTools.server && viewItem == appModule', group: 'inline' },
      { command: 'wasTools.maven.cleanInstall', when: 'view == wasTools.maven', group: 'inline@1' },
      { command: 'wasTools.maven.run', when: 'view == wasTools.maven', group: 'inline@2' },
      { submenu: 'wasTools.mavenMenu', when: 'view == wasTools.maven', group: '1_maven' },
      { command: 'wasTools.maven.buildAndPublish', when: 'view == wasTools.maven && viewItem == maven.module', group: '0_publish' },
    ],
    'explorer/context': [
      { submenu: 'wasTools.mavenMenu', when: 'resourceFilename == pom.xml || explorerResourceIsFolder', group: '7_modification@9' },
    ],
    'editor/title/context': [
      { submenu: 'wasTools.mavenMenu', when: 'resourceFilename == pom.xml', group: '9_maven' },
    ],
    'wasTools.mavenMenu': [
      { command: 'wasTools.maven.clean', group: '1_lifecycle@1' },
      { command: 'wasTools.maven.compile', group: '1_lifecycle@2' },
      { command: 'wasTools.maven.test', group: '1_lifecycle@3' },
      { command: 'wasTools.maven.package', group: '1_lifecycle@4' },
      { command: 'wasTools.maven.install', group: '1_lifecycle@5' },
      { command: 'wasTools.maven.cleanInstall', group: '2_combined@1' },
      { command: 'wasTools.maven.run', group: '2_combined@2' },
      { command: 'wasTools.maven.buildAndPublish', group: '3_publish@1' },
    ],
    commandPalette: [
      { command: 'wasTools.maven.buildAndPublish', when: 'workspaceFolderCount > 0' },
    ],
  },
  configuration: [
    {
      title: s('cfg.server', 'Server', 'Servidor'),
      order: 1,
      properties: {
        'wasTools.wasHome': { type: 'string', default: '', order: 1, markdownDescription: s('cfg.wasHome', 'WebSphere install root (contains `bin/` and `properties/profileRegistry.xml`). Empty = auto-detect.\n\nEmpty fields are resolved automatically at run time and are **not** written here; see *WebSphere: Show Resolved Environment*, or fill them with *WebSphere: Write Detected Values to Settings*. Values of the opened project are in the **Workspace** tab.', 'Raíz de la instalación de WebSphere (contiene `bin/` y `properties/profileRegistry.xml`). Vacío = autodetectar.\n\nLos campos vacíos se resuelven solos al ejecutar y **no** se escriben acá; ver *WebSphere: Mostrar ambiente resuelto*, o completarlos con *WebSphere: Guardar valores detectados en la configuración*. Los valores del proyecto abierto están en la pestaña **Área de trabajo**.') },
        'wasTools.profilePath': { type: 'string', default: '', order: 2, markdownDescription: s('cfg.profilePath', 'Profile folder (e.g. `C:\\IBM\\WebSphere\\AppServer\\profiles\\AppSrv01`). Empty = default profile of `profileRegistry.xml`.', 'Carpeta del perfil (ej. `C:\\IBM\\WebSphere\\AppServer\\profiles\\AppSrv01`). Vacío = perfil por defecto de `profileRegistry.xml`.') },
        'wasTools.serverName': { type: 'string', default: '', order: 3, markdownDescription: s('cfg.serverName', 'Application server name (e.g. `server1`, `WebSphere_Portal`). Empty = the profile\'s only server.', 'Nombre del servidor (ej. `server1`, `WebSphere_Portal`). Vacío = el único servidor del perfil.') },
        'wasTools.cell': { type: 'string', default: '', order: 4, description: s('cfg.cell', 'Cell. Empty = from the profile configuration.', 'Celda. Vacío = de la configuración del perfil.') },
        'wasTools.node': { type: 'string', default: '', order: 5, description: s('cfg.node', 'Node. Empty = from the profile configuration.', 'Nodo. Vacío = de la configuración del perfil.') },
        'wasTools.host': { type: 'string', default: 'localhost', order: 6, description: s('cfg.host', 'Host of the server.', 'Host del servidor.') },
        'wasTools.username': { type: 'string', default: '', order: 7, markdownDescription: s('cfg.username', 'Administrator user (wsadmin, stopServer, XMLAccess). Empty when administrative security is off. **The password is not a setting**: use *WebSphere: Configure User and Password* (stored in the OS secret storage).', 'Usuario administrador (wsadmin, stopServer, XMLAccess). Vacío si la seguridad administrativa está apagada. **La contraseña no es un setting**: usar *WebSphere: Configurar usuario y contraseña* (queda en el almacén seguro del sistema).') },
        'wasTools.appUrl': { type: 'string', default: '', order: 8, description: s('cfg.appUrl', 'URL opened by "Open Application". Empty = https://host:<WC_defaulthost_secure>/ (Portal: /wps/myportal/).', 'URL de "Abrir la aplicación". Vacío = https://host:<WC_defaulthost_secure>/ (Portal: /wps/myportal/).') },
        'wasTools.portal.enabled': { type: 'boolean', default: true, order: 9, description: s('cfg.portal', 'Use WebSphere Portal features (XMLAccess backup) when the profile is a Portal profile.', 'Usar funciones de WebSphere Portal (respaldo XMLAccess) si el perfil es de Portal.') },
        'wasTools.stopTimeoutMinutes': { type: 'number', default: 10, order: 10, description: s('cfg.stopTimeout', 'Minutes to wait for stopServer before killing the server process.', 'Minutos de espera de stopServer antes de matar el proceso del servidor.') },
        'wasTools.pollSeconds': { type: 'number', default: 10, order: 11, description: s('cfg.poll', 'Seconds between server status checks.', 'Segundos entre chequeos del estado del servidor.') },
        'wasTools.consoleEncoding': { type: 'string', default: '', order: 12, description: s('cfg.consoleEncoding', 'Encoding of the output of WAS command line tools. Empty = windows-1252 on Windows, utf-8 elsewhere.', 'Codificación de la salida de las herramientas de WAS. Vacío = windows-1252 en Windows, utf-8 en otros.') },
      },
    },
    {
      title: s('cfg.ports', 'Ports', 'Puertos'),
      order: 2,
      properties: {
        'wasTools.ports.https': { type: 'number', default: 0, description: s('cfg.ports.https', 'WC_defaulthost_secure (the server is "running" when it listens). 0 = from serverindex.xml.', 'WC_defaulthost_secure (el servidor está "corriendo" cuando escucha). 0 = de serverindex.xml.') },
        'wasTools.ports.http': { type: 'number', default: 0, description: s('cfg.ports.http', 'WC_defaulthost (Portal XMLAccess). 0 = from serverindex.xml.', 'WC_defaulthost (XMLAccess de Portal). 0 = de serverindex.xml.') },
        'wasTools.ports.adminHttps': { type: 'number', default: 0, description: s('cfg.ports.admin', 'WC_adminhost_secure (admin console). 0 = from serverindex.xml.', 'WC_adminhost_secure (consola de administración). 0 = de serverindex.xml.') },
        'wasTools.ports.soap': { type: 'number', default: 0, description: s('cfg.ports.soap', 'SOAP_CONNECTOR_ADDRESS (wsadmin, stopServer). 0 = from serverindex.xml.', 'SOAP_CONNECTOR_ADDRESS (wsadmin, stopServer). 0 = de serverindex.xml.') },
        'wasTools.ports.debug': { type: 'number', default: 0, description: s('cfg.ports.debug', 'JDWP debug port. 0 = from server.xml debugArgs (7777 if not set).', 'Puerto JDWP de depuración. 0 = de debugArgs en server.xml (7777 si no hay).') },
      },
    },
    {
      title: 'Maven',
      order: 3,
      properties: {
        'wasTools.maven.executable': { type: 'string', default: '', description: s('cfg.mvn', 'Maven executable. Empty = maven.executable.path, mvnw of the workspace, MAVEN_HOME or mvn on PATH.', 'Ejecutable de Maven. Vacío = maven.executable.path, mvnw del workspace, MAVEN_HOME o mvn del PATH.') },
        'wasTools.maven.javaHome': { type: 'string', default: '', markdownDescription: s('cfg.javaHome', 'JDK used to run Maven (JAVA_HOME). Empty = the JDK bundled with WAS (`<wasHome>/java/<version>`), so the bytecode matches the server.', 'JDK con el que corre Maven (JAVA_HOME). Vacío = el JDK de WAS (`<wasHome>/java/<versión>`), así el bytecode coincide con el servidor.') },
        'wasTools.maven.offline': { type: 'boolean', default: false, description: s('cfg.offline', 'Run Maven offline (-o).', 'Correr Maven sin conexión (-o).') },
        'wasTools.maven.skipTests': { type: 'boolean', default: true, description: s('cfg.skipTests', 'Add -DskipTests (except for goals that include "test").', 'Agregar -DskipTests (salvo objetivos que incluyan "test").') },
        'wasTools.maven.extraArgs': { type: 'array', items: { type: 'string' }, default: [], description: s('cfg.extraArgs', 'Extra arguments for every Maven run (e.g. "-s", "settings.xml", "-U").', 'Argumentos extra para cada ejecución de Maven (ej. "-s", "settings.xml", "-U").') },
        'wasTools.maven.goals': { type: 'array', items: { type: 'string' }, default: [], description: s('cfg.goals', 'Goals offered by "Run Goals…". Empty = clean, compile, package, install, clean install, test…', 'Objetivos que ofrece "Ejecutar objetivos…". Vacío = clean, compile, package, install, clean install, test…') },
      },
    },
    {
      title: s('cfg.publish', 'Applications & Publishing', 'Aplicaciones y publicación'),
      order: 4,
      properties: {
        'wasTools.applications': {
          type: 'array', default: [],
          markdownDescription: s('cfg.apps', 'Applications installed in WAS that are published from this workspace. Filled by **WebSphere: Detect Installed Applications**; can be edited by hand.', 'Aplicaciones instaladas en WAS que se publican desde este workspace. Se completa con **WebSphere: Detectar aplicaciones instaladas**; se puede editar a mano.'),
          items: {
            type: 'object', required: ['name', 'type', 'installedPath'],
            properties: {
              name: { type: 'string', description: s('cfg.app.name', 'Application name in WAS.', 'Nombre de la aplicación en WAS.') },
              type: { type: 'string', enum: ['war', 'ear'], description: s('cfg.app.type', 'war: web root + WEB-INF/classes; ear: only modules (jars).', 'war: web root + WEB-INF/classes; ear: solo módulos (jars).') },
              installedPath: { type: 'string', description: s('cfg.app.installed', 'Exploded install folder under installedApps (the .war folder inside the .ear, or the .ear).', 'Carpeta instalada (explotada) en installedApps (el .war dentro del .ear, o el .ear).') },
              webProject: { type: 'string', description: s('cfg.app.web', 'war only: Maven project folder (relative to the workspace) with the web root and target/classes.', 'Solo war: carpeta del proyecto Maven (relativa al workspace) con el web root y target/classes.') },
              webRoot: { type: 'string', description: s('cfg.app.webRoot', 'Web root inside webProject. Empty = WebContent or src/main/webapp.', 'Web root dentro de webProject. Vacío = WebContent o src/main/webapp.') },
              sharedLibraries: { type: 'array', items: { type: 'string' }, description: s('cfg.app.libs', 'Shared libraries the application must reference.', 'Librerías compartidas que la aplicación debe referenciar.') },
              modules: {
                type: 'array',
                description: s('cfg.app.modules', 'Jars built from workspace projects and copied into the application.', 'Jars que se compilan desde proyectos del workspace y se copian dentro de la aplicación.'),
                items: {
                  type: 'object', required: ['project', 'target'],
                  properties: {
                    project: { type: 'string', description: s('cfg.mod.project', 'Maven project folder (relative to the workspace, or absolute).', 'Carpeta del proyecto Maven (relativa al workspace, o absoluta).') },
                    target: { type: 'string', description: s('cfg.mod.target', 'Path of the jar inside the installed application (e.g. WEB-INF/lib/core-1.0.jar, lib/core.jar, MyEJB.jar).', 'Ruta del jar dentro de la aplicación instalada (ej. WEB-INF/lib/core-1.0.jar, lib/core.jar, MiEJB.jar).') },
                  },
                },
              },
            },
          },
        },
        'wasTools.publish.onSave': { type: 'boolean', default: false, description: s('cfg.onSave', 'Copy web resources (xhtml, js, css, images…) to the installed application on save.', 'Copiar recursos web (xhtml, js, css, imágenes…) a la aplicación instalada al guardar.') },
        'wasTools.publish.maxClassVersion': { type: 'number', default: 0, description: s('cfg.maxClass', 'Highest class file version allowed when publishing (52 = Java 8, 55 = 11, 61 = 17). 0 = from the server JDK.', 'Versión máxima de class file al publicar (52 = Java 8, 55 = 11, 61 = 17). 0 = según el JDK del servidor.') },
        'wasTools.backupDir': { type: 'string', default: '', description: s('cfg.backupDir', 'Folder for backups (overwritten files, configuration copies, trust store). Empty = extension storage.', 'Carpeta de respaldos (archivos pisados, copias de configuración, trust store). Vacío = almacenamiento de la extensión.') },
      },
    },
    {
      title: 'Logs',
      order: 5,
      properties: {
        'wasTools.logs.ignorePatterns': { type: 'array', items: { type: 'string' }, default: ['CWSRV0255E', 'favicon\\.ico'], description: s('cfg.ignore', 'Regular expressions of log lines to hide (noise).', 'Expresiones regulares de líneas del log a ocultar (ruido).') },
        'wasTools.logs.encoding': { type: 'string', default: 'latin1', description: s('cfg.logEnc', 'Encoding of SystemOut.log (latin1, utf-8…).', 'Codificación de SystemOut.log (latin1, utf-8…).') },
      },
    },
  ],
  taskDefinitions: [{ type: 'wasTools', properties: { name: { type: 'string' } } }],
};

pkg.contributes = contributes;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'package.nls.json'), JSON.stringify(en, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'package.nls.es.json'), JSON.stringify(es, null, 2) + '\n');
console.log(`contributes: ${contributes.commands.length} commands, ${Object.keys(en).length} strings`);
