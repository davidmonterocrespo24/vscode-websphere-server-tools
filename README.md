<p align="center"><img src="media/icon.png" width="128" alt=""></p>

<h1 align="center">WebSphere Server Tools</h1>

<p align="center">
  <b>Run, debug, build and hot-publish to a local IBM WebSphere Application Server (traditional) or WebSphere Portal — from VS Code.</b>
</p>

<p align="center">
  <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-%5E1.90-007ACC?logo=visualstudiocode&logoColor=white">
  <img alt="WebSphere" src="https://img.shields.io/badge/WebSphere-8.5.5%20%7C%209.0-1F70C1">
  <img alt="Portal" src="https://img.shields.io/badge/Portal-8.5%20%7C%209.x-1F70C1">
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-English%20%7C%20Espa%C3%B1ol-orange">
</p>

---

Eclipse-based IDEs such as Rational Software Architect or WebSphere Developer Tools are heavy and slow, and IBM's VS Code tooling only covers Liberty. **WebSphere Server Tools** brings their daily workflow to VS Code: start and stop the server, attach the debugger, build Maven modules one by one, and copy the result into the running server in seconds, without reinstalling the application.

> **Unofficial community project.** It is not affiliated with, endorsed or supported by IBM. *IBM* and *WebSphere* are trademarks of International Business Machines Corp.

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [The panel](#the-panel)
- [Everyday workflows](#everyday-workflows)
- [Maven](#maven)
- [Hot publish: how it works](#hot-publish-how-it-works)
- [Configuration](#configuration)
- [Commands](#commands)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)
- [Development](#development)
- [Roadmap](#roadmap)

## Highlights

| | |
|---|---|
| 🔎 **Zero configuration** | Finds the WAS install, profiles, cell, node, server, ports, debug port, Portal and the server JDK by reading the WAS files. Nothing to type. |
| ▶️ **Server control** | Start, stop, restart and kill. A `stopServer` that hangs (common with Portal) is detected and cleaned up. Status shows in the status bar. |
| 🐞 **One-click debugging** | Attaches to the server JDWP port and supports Hot Code Replace. It knows when a debugger is already attached and can enable debug mode for you. |
| 🧱 **Maven per module** | `clean`, `compile`, `package`, `install`, `clean install`, `test` or any goals on one module, as in RSA/Eclipse *Run As → Maven build*. Maven runs with the **server JDK**. |
| 🚀 **Build & Publish** | Builds a project and copies its output (web resources, classes, module jars, EJB jars) into the installed application, then restarts only that application. |
| 🛡️ **Safe by default** | Backs up every file before overwriting it, never hot-publishes deployment descriptors and refuses bytecode newer than the server's Java. |
| 📜 **Logs** | Follow `SystemOut.log` live with noise filtered. Get an error report by message code since the last startup, in any WAS language. |
| 🧰 **Admin tools** | Application status (finds orphaned composition units), configuration backup (plus Portal XMLAccess export), trace presets, trust SSL certificates, map shared libraries. |
| 🔐 **Credentials** | The admin password stays in the OS keychain and is never echoed to terminals. |
| 🌐 **Localized** | English and Spanish. |

## Quick start

1. Install the extension and open the folder of your Java project (any folder with a `pom.xml`).
2. Open the **WebSphere** view in the Activity Bar.
3. Run **WebSphere: Detect Environment** (if more than one profile or server is found you will be asked which one).
4. Run **WebSphere: Detect Installed Applications**. It matches what is installed in `installedApps` with the Maven projects of your workspace and saves the result in `.vscode/settings.json`.
5. If administrative security is on, run **WebSphere: Configure User and Password**.
6. Press ▶ to start the server, then 🐞 to attach the debugger.

Run **WebSphere: Show Resolved Environment** at any time to see every value in use and whether it was auto-detected or configured.

## The panel

```
WEBSPHERE
├─ SERVER
│  ├─ ● WebSphere_Portal   running · debug 7777        [🐞] [⟳] [■]
│  ├─ Applications
│  │  ├─ 🌐 MyPortalWeb      war · my-web               [⟳]
│  │  │   ├─ Publish web resources (xhtml, js, css…)
│  │  │   ├─ Build & publish classes
│  │  │   ├─ Build & publish all 9 modules
│  │  │   ├─ Modules (9)  ▸ my-core   WEB-INF/lib/my-core-1.0.jar   [⬆]
│  │  │   ├─ Map shared libraries (MyProperties, LOG4J)
│  │  │   └─ Restart application
│  │  └─ 📦 MyEJBApp         ear
│  ├─ Logs           follow SystemOut · errors since startup · open log
│  ├─ Tools          app status · backup · trace · certificates · debug mode · console
│  └─ Configuration  user/password · detect · resolved environment · settings
└─ MAVEN PROJECTS
   └─ 📚 my-parent (pom)
      ├─ 🌐 my-web (war)                [clean install] [▶ goals…]
      ├─ 📦 my-core (jar)
      └─ 📦 my-ejb (ejb)
```

The status bar shows `● WebSphere_Portal running · 🐞 7777`. Click it to open the panel.

## Everyday workflows

| I changed… | Do this | Effect |
|---|---|---|
| A page, script or stylesheet (`.xhtml`, `.jsp`, `.js`, `.css`, images) | Application → **Publish web resources**, or enable `wasTools.publish.onSave` | Copied in milliseconds; refresh the browser. Bump the `?v=` query string of the JS/CSS if your pages cache them. |
| Java code inside a method, with the debugger attached | Just **save** | Hot Code Replace swaps the method in the running JVM. |
| Java code of the web project (new methods, fields, signatures) | Application → **Build & publish classes** | `mvn compile`, copy to `WEB-INF/classes`, offer to restart the application. |
| A library or EJB module | Maven Projects → right-click → **Build & Publish to Server** (or click the module under the application) | `mvn package`, jar copied to `WEB-INF/lib`, `lib/` or the EAR root, application restarted. |
| `web.xml`, `portlet.xml`, `faces-config.xml`, new modules or EJBs | Update the application with your usual deploy (admin console / Portal *Manage Web Modules*) | The extension warns you that descriptors cannot be hot-published. |

## Maven

The **Maven Projects** view shows each aggregator with its modules, including modules that live outside the workspace folder (`<module>../../other-repo/lib</module>`).

You can run goals from:
- the inline buttons of a project (`clean install`, *Run Goals…*);
- the **Maven (WebSphere)** submenu of the view, the Explorer (right-click a folder or `pom.xml`) and the editor title of a `pom.xml`;
- the Command Palette (`WebSphere: Maven: …`), which uses the project of the active editor.

*Run Goals…* accepts any goals and flags (for example `clean install -U -Pdev`) and remembers your last runs.

Each run uses:
- **JDK:** `wasTools.maven.javaHome`, or by default the JDK bundled with WAS (`<wasHome>/java/<version>`), so the classes always match the server's Java.
- **Maven:** `wasTools.maven.executable`, or `maven.executable.path`, `mvnw`, `MAVEN_HOME` and `PATH`, in that order.
- **Flags:** `-o` when `wasTools.maven.offline` is on, `-DskipTests` unless the goals include `test`, plus `wasTools.maven.extraArgs`.

## Hot publish: how it works

WebSphere runs applications from an exploded copy under `<profile>/installedApps/<cell>/<app>.ear/`. Hot publish copies the changed files there, which is the same thing Eclipse-based tools do when they publish to a local server.

```
workspace                                    <profile>/installedApps/<cell>/MyApp.ear/
my-web/WebContent/**          ──copy──▶      MyWeb.war/**                (web resources)
my-web/target/classes/**      ──copy──▶      MyWeb.war/WEB-INF/classes/**
my-core/target/my-core.jar    ──copy──▶      MyWeb.war/WEB-INF/lib/my-core-1.0.jar
my-ejb/target/my-ejb.jar      ──copy──▶      MyEJB.jar   |   lib/…        (EAR modules)
                                   │
                                   └── previous file saved first in <backupDir>/publish_<app>_<what>_<timestamp>/
```

Safeguards:
- **Only changed files** are copied (byte comparison).
- **Backups:** every overwritten file is saved first, so any publish can be undone by copying the backup back.
- **Descriptors** (`web.xml`, `portlet.xml`, `faces-config*.xml`) are never copied, only reported. `ibm-*-bnd/ext` files, which WAS rewrites at install time, are ignored.
- **Bytecode check:** a publish is refused if a class targets a newer Java than the server runs (class version above `wasTools.publish.maxClassVersion`, auto-detected from the server JDK). This catches a frequent problem: the Java language server compiling `target/classes` with its own newer JDK.

## Configuration

Every value is resolved in three layers: **explicit setting → auto-detection → generic default**. Leave a setting empty (or `0`) to auto-detect it.

Put team values in the workspace `.vscode/settings.json` and commit it. Put personal values in your user settings.

### Server

| Setting | Default | Notes |
|---|---|---|
| `wasTools.wasHome` | auto | Install root with `properties/profileRegistry.xml` |
| `wasTools.profilePath` | auto | Default profile of `profileRegistry.xml` |
| `wasTools.serverName` | auto | The profile's only application server |
| `wasTools.cell`, `wasTools.node` | auto | From `config/cells` |
| `wasTools.host` | `localhost` | |
| `wasTools.username` | — | The password is **not** a setting (see [Security](#security)) |
| `wasTools.appUrl` | auto | `https://host:<https>/` (Portal: `/wps/myportal/`) |
| `wasTools.portal.enabled` | `true` | Portal features when the profile is a Portal profile |
| `wasTools.stopTimeoutMinutes` | `10` | Then the server process is killed |
| `wasTools.pollSeconds` | `10` | Status refresh |
| `wasTools.consoleEncoding` | auto | Output of WAS tools (`windows-1252` on Windows) |

### Ports (0 = auto from `serverindex.xml` / `server.xml`)

`wasTools.ports.https` (WC_defaulthost_secure), `wasTools.ports.http` (WC_defaulthost), `wasTools.ports.adminHttps` (WC_adminhost_secure), `wasTools.ports.soap` (SOAP_CONNECTOR_ADDRESS), `wasTools.ports.debug` (JDWP).

### Maven

`wasTools.maven.executable`, `wasTools.maven.javaHome`, `wasTools.maven.offline` (`false`), `wasTools.maven.skipTests` (`true`), `wasTools.maven.extraArgs` (`[]`), `wasTools.maven.goals` (goals offered by *Run Goals…*).

### Applications

```jsonc
"wasTools.applications": [
  {
    "name": "MyPortalWeb",                    // application name in WAS
    "type": "war",                            // war: web root + WEB-INF/classes + modules
    "installedPath": "C:\\IBM\\WebSphere\\wp_profile\\installedApps\\Cell01\\MyPortalWeb.ear\\MyWeb.war",
    "webProject": "my-web",                   // Maven project folder, relative to the workspace
    "webRoot": "WebContent",                  // optional: WebContent or src/main/webapp by default
    "sharedLibraries": ["MyProperties", "LOG4J"],
    "modules": [
      { "project": "my-core", "target": "WEB-INF/lib/my-core-1.0.jar" }
    ]
  },
  {
    "name": "MyEJBApp",
    "type": "ear",                            // ear: module jars only
    "installedPath": "C:\\IBM\\WebSphere\\wp_profile\\installedApps\\Cell01\\MyEJBApp.ear",
    "sharedLibraries": ["MyEJBProperties"],
    "modules": [
      { "project": "my-ejb",      "target": "MyEJB.jar" },
      { "project": "my-services", "target": "lib/my-services.jar" },
      { "project": "C:\\work\\other-repo\\common", "target": "lib/common.jar" }
    ]
  }
]
```

*Detect Installed Applications* builds this list for you:
- **Web project:** a project is linked to an installed war only if at least half of a sample of its web files exist in the war.
- **Modules:** a jar is linked to a Maven project when its name, without the version, matches the project's `artifactId` or folder name.
- **Shared libraries:** read from the application's `deployment.xml`.

### Publishing, backups and logs

| Setting | Default |
|---|---|
| `wasTools.publish.onSave` | `false` |
| `wasTools.publish.maxClassVersion` | auto (52 = Java 8, 55 = 11, 61 = 17) |
| `wasTools.backupDir` | extension storage |
| `wasTools.logs.ignorePatterns` | `["CWSRV0255E", "favicon\\.ico"]` |
| `wasTools.logs.encoding` | `latin1` |

## Commands

All commands are in the Command Palette under **WebSphere:**.

| Area | Commands |
|---|---|
| Server | Start · Stop · Restart · Kill Server Process · Attach Debugger · Enable JVM Debug Mode · Open Application in Browser · Open Admin Console · Refresh |
| Logs | Follow SystemOut.log · Stop Following the Log · Errors Since Last Startup · Open SystemOut.log |
| Applications | Detect Installed Applications · Publish Web Resources · Build & Publish Classes · Build & Publish Module · Build & Publish All Modules · Restart Application · Map Shared Libraries |
| Maven | clean · compile · test · package · install · clean install · Run Goals… · Build & Publish to Server · Refresh Maven Projects |
| Tools | Applications Status (wsadmin) · Backup Configuration · Set Trace Specification · Trust a Remote Certificate · List Trusted Certificates |
| Configuration | Configure User and Password · Forget Saved Password · Detect Environment · Show Resolved Environment · Open Settings |

## Security

- **Password storage:** the administrator password is stored with the VS Code `SecretStorage` API (Windows Credential Manager, macOS Keychain, libsecret), one entry per profile and user. It is never written to settings or files.
- **Passing it to WAS tools:** `stopServer`, `wsadmin` and `xmlaccess` receive it as the environment variable `WAS_PASSWORD`, expanded by `cmd`/`sh` at run time. The command line shown in the terminal reads `-password %WAS_PASSWORD%`, and any echo of the value is masked as `****`.
- **Confirmations:** anything that changes the WAS configuration asks first in a modal dialog: debug mode, trusting a certificate, shared libraries, restarts. Trusting a certificate backs up `trust.p12` first.
- **Untrusted workspaces:** the extension is disabled in them, because it runs Maven and WAS command line tools.
- **SOAP traces:** they include full messages, credentials too. The extension reminds you to turn the trace off and delete `trace.log`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| *"Another debugger is already connected to port 7777"* | JDWP accepts one debugger at a time; the port stops listening while attached | Stop the other debug session (or close the other IDE). |
| *Nothing listens on debug port* | Debug mode is off in `server.xml`, or the server is not running | **Enable JVM Debug Mode**, then restart the server. |
| Maven or WAS fails with `class file has wrong version 69.0, should be 52.0` | The Java language server compiled `target/classes` with its bundled newer JDK | Define the server Java in `java.configuration.runtimes` (e.g. `JavaSE-1.8`), delete `target/classes`, rebuild. |
| `stopServer` hangs on `ADMU3201I` | Common with Portal: the server is gone but the stop client waits | Built in: after `wasTools.stopTimeoutMinutes` the server and the hung client are killed. |
| `CWPKI0022E` / `PKIX path building failed` in the log | A remote HTTPS service renewed its certificate | **Trust a Remote Certificate** (host, port), then restart. |
| Every portlet/servlet fails after reinstalling an application | The reinstall dropped its shared library references | Add `sharedLibraries` to the application and run **Map Shared Libraries**. |
| *A composition unit with name X already exists* (`ADMA5014E`) when updating | A failed update left an orphaned business-level application | **Applications Status** shows it as *ORPHANED*. Remove it with the admin console or wsadmin before redeploying. |
| Accents look wrong in the log | Log encoding | Set `wasTools.logs.encoding` (`latin1`, `utf-8`…). |

Still stuck? Run **Show Resolved Environment** and include its output when you [open an issue](https://github.com/davidmonterocrespo24/vscode-websphere-server-tools/issues).

## Requirements

- A **local** profile of WebSphere Application Server traditional 8.5.5 / 9.0 or WebSphere Portal 8.5 / 9.x, on Windows or Linux.
- **Maven** 3.x.
- [**Debugger for Java**](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-debug) to attach. The extension offers to install it.
- Recommended: [**Extension Pack for Java**](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack), with `java.configuration.runtimes` set to the server's Java version.

**Not supported (yet):** remote servers, Network Deployment cells (deployment manager / node agents), WebSphere Liberty (use [Liberty Tools](https://marketplace.visualstudio.com/items?itemName=Open-Liberty.liberty-dev-vscode-ext)).

## Development

```bash
git clone https://github.com/davidmonterocrespo24/vscode-websphere-server-tools.git
cd vscode-websphere-server-tools
npm install
npm run compile        # generates the manifest/translations and compiles TypeScript
```

Press **F5** to open an Extension Development Host. To open a test workspace directly, add its path to `args` in `.vscode/launch.json`.

| Path | Purpose |
|---|---|
| `src/detect.ts` | Read-only discovery of WAS installs, profiles, servers, ports, debug settings, Portal, JDK |
| `src/config.ts` | Settings + auto-detection → resolved environment |
| `src/runner.ts` | Pseudo-terminal process runner (no shell dependency, secret masking, cancellation) |
| `src/server.ts` | Server status, start/stop/restart, debug port state, wsadmin |
| `src/maven.ts` | `pom.xml` discovery, module tree, goal execution |
| `src/publish.ts` | Hot publish, backups, bytecode check, application detection |
| `src/logs.ts`, `src/backup.ts`, `src/credentials.ts`, `src/trees.ts`, `src/extension.ts` | Logs, backups, credentials, views, commands |
| `resources/jython/` | wsadmin scripts (Jython 2.x) |
| `scripts/gen-manifest.js` | Generates `contributes`, `package.nls.json` and `package.nls.es.json` |
| `l10n/` | Runtime strings (`npm run l10n` re-extracts them) |

Package a `.vsix` with `npm run package`, then install it with `code --install-extension websphere-server-tools-<version>.vsix`.

**Translations:** add a `package.nls.<lang>.json` (generated by `scripts/gen-manifest.js`) and an `l10n/bundle.l10n.<lang>.json`.

## Roadmap

- Getting-started walkthrough.
- Full application update (war/ear) through wsadmin, and Portal web module update through XMLAccess.
- Problem matcher for Maven compiler errors.
- Several servers or profiles in one workspace.
- macOS testing.

## License

[MIT](LICENSE) © David Montero
