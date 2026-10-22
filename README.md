# WebSphere Server Tools

Work with a **local IBM WebSphere Application Server (traditional, 8.5.5 / 9.0)** or **WebSphere Portal** from VS Code: start, stop, debug, build Maven modules and hot-publish to the server without a heavy Eclipse-based IDE.

> Unofficial community extension. Not affiliated with, endorsed or supported by IBM. "IBM" and "WebSphere" are trademarks of IBM Corp.

## Features

- **Server panel**: state (running / starting / stopped), start, stop, restart, kill. A hung `stopServer` (common with Portal) is detected and cleaned up.
- **Debug with one click**: attaches the Java debugger to the server JDWP port. Hot Code Replace works as in Eclipse. If debug mode is off, the extension can turn it on.
- **Maven per module**, as in RSA/Eclipse: `clean`, `compile`, `package`, `install`, `clean install`, `test` or any goals, from the *Maven Projects* view, the explorer (right-click a folder or `pom.xml`) or the editor. Maven runs with the **server JDK**, so the bytecode always matches the server.
- **Build & Publish to Server**: builds a project and copies the result (web resources, `WEB-INF/classes`, module jars in `WEB-INF/lib`, EAR `lib/` or EJB jars) into the exploded installed application, then restarts only that application. This is what Eclipse/RSA "publish" does, without a full redeploy.
- **Safe by default**:
  - every overwritten file is backed up first;
  - deployment descriptors are never hot-published;
  - classes compiled for a newer Java than the server runs are refused.
- **Logs**:
  - follow `SystemOut.log` live, with noise filtered;
  - see errors since the last startup, grouped by message code.
- **Tools**:
  - application status (also finds orphaned composition units);
  - configuration backup (plus a Portal XMLAccess export);
  - runtime trace presets;
  - trust a remote SSL certificate (fixes `CWPKI0022E`);
  - map shared libraries.
- **Credentials**: the admin password is stored in the OS secret storage. It reaches the WAS tools only through an environment variable and is never shown in terminals.

## Zero configuration

Everything is auto-detected from the WAS installation:

| What | From |
|---|---|
| Install root and profiles | `<WAS_HOME>/properties/profileRegistry.xml` (common install paths, `WAS_HOME`) |
| Cell, node, server | `<profile>/config/cells/*/nodes/*/servers/*` |
| Ports (https, admin, SOAP, http) | `serverindex.xml` |
| Debug port / debug mode | `server.xml` (`debugArgs`) |
| WebSphere Portal | `<profile>/PortalServer` |
| JDK for Maven | `<WAS_HOME>/java/<version>` |
| Maven | `maven.executable.path`, `mvnw`, `MAVEN_HOME`, `PATH` |
| Applications and modules | jars in `installedApps` matched to the workspace Maven projects, plus shared libraries from `deployment.xml` |

Run **WebSphere: Detect Environment** and **WebSphere: Detect Installed Applications**. Use **WebSphere: Show Resolved Environment** to see every value and where it came from.

Any value can be overridden in the settings (`wasTools.*`), per user or per workspace. For example, a team can commit its `.vscode/settings.json` with its applications.

## Applications and modules

```jsonc
"wasTools.applications": [
  {
    "name": "MyWebApp",                       // application name in WAS
    "type": "war",                            // war: web root + WEB-INF/classes
    "installedPath": "C:\\IBM\\WebSphere\\AppServer\\profiles\\AppSrv01\\installedApps\\Cell01\\MyWebApp.ear\\MyWeb.war",
    "webProject": "my-web",                   // Maven project folder (relative to the workspace)
    "sharedLibraries": ["MyProperties"],
    "modules": [
      { "project": "my-core", "target": "WEB-INF/lib/my-core-1.0.jar" }
    ]
  },
  {
    "name": "MyEJBApp",
    "type": "ear",                            // ear: module jars only
    "installedPath": "C:\\IBM\\...\\installedApps\\Cell01\\MyEJBApp.ear",
    "modules": [
      { "project": "my-ejb", "target": "MyEJB.jar" },
      { "project": "my-services", "target": "lib/my-services.jar" }
    ]
  }
]
```

## Requirements

- A local WebSphere Application Server traditional (8.5.5 / 9.0) or WebSphere Portal (8.5 / 9.x) profile. Windows and Linux are supported.
- Maven.
- [Debugger for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug), to attach the debugger.
- Recommended: [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack). Configure `java.configuration.runtimes` with the server Java version (for example `JavaSE-1.8`); otherwise the Java language server may compile `target/classes` with a newer JDK.

## Settings

| Setting | Default |
|---|---|
| `wasTools.wasHome`, `wasTools.profilePath`, `wasTools.serverName`, `wasTools.cell`, `wasTools.node` | auto |
| `wasTools.username` | — (the password is in the secret storage) |
| `wasTools.ports.https`, `.http`, `.adminHttps`, `.soap`, `.debug` | auto (`serverindex.xml`, `server.xml`) |
| `wasTools.maven.executable`, `wasTools.maven.javaHome` | auto |
| `wasTools.maven.offline`, `wasTools.maven.skipTests`, `wasTools.maven.extraArgs`, `wasTools.maven.goals` | `false`, `true`, `[]`, `[]` |
| `wasTools.applications` | `[]` (detect) |
| `wasTools.publish.onSave`, `wasTools.publish.maxClassVersion` | `false`, auto |
| `wasTools.backupDir` | extension storage |
| `wasTools.logs.ignorePatterns`, `wasTools.logs.encoding` | noise patterns, `latin1` |
| `wasTools.stopTimeoutMinutes`, `wasTools.pollSeconds` | `10`, `10` |

## Known limitations

- Local servers only (the profile must be on this machine). Network Deployment cells are not managed.
- Hot publish copies files into `installedApps`. Changes to descriptors, new modules or new EJBs need a regular application update.
- Hot Code Replace only applies changes inside method bodies (JVM limitation).

## Localization

English and Spanish.
