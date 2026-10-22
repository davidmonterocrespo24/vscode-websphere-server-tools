# Changelog

## 0.3.2

- README: screenshot of the WebSphere view.

## 0.3.1

- New icon.
- Settings: *Write Detected Values to Settings* command; *Open Settings* opens the Workspace tab, where the project values live.
- Debug: the debug port state is read from the OS socket table (no JDWP probe); an already attached debugger is detected.

## 0.3.0

- Generic product: auto-detection of WAS install, profiles, cell/node/server, ports, debug port, Portal and the server JDK.
- No dependency on Git Bash: processes run through a VS Code pseudo-terminal, passwords travel only as environment variables and are never echoed.
- Maven Projects view and explorer/editor menus: clean, compile, package, install, clean install, test, custom goals, Build & Publish to Server.
- Application detection from installedApps (web project matched by files, module jars, shared libraries from deployment.xml).
- Errors report by message code (language independent), runtime trace presets, enable JVM debug mode.
- English and Spanish UI.

## 0.2.0 (internal)

- Configurable applications and modules (war/ear).

## 0.1.0 (internal)

- First version: server control, attach, hot publish, logs.
