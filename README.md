# Import Tree

VS Code extension that analyzes your project's dependency graph and shows a visual map of imports — who imports whom, and which files are unused.

## Features

- **Dependency graph** — force-directed graph of all JS/TS files and their imports
- **Unused files** — sidebar view listing files with zero incoming imports
- **Interactive** — drag nodes, hover for details, double-click to open a file

![screenshot](https://github.com/puzzo/vscode-import-tree/raw/main/media/screenshot.png)

## Usage

- Command: `Import Tree: Show Dependency Graph`
- Opens automatically when you open a workspace
- Unused files appear in the Explorer under **Unused Files**

## Supported imports

- `import ... from '...'`
- `import '...'`
- `require('...')`
- `import('...')`

Works with `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.mts`, `.cts`.

## Scripts

| Command | Description |
|---|---|
| `npm run vsix` | Build `.vsix` package |
| `npm run install` | Build + install into VS Code |

## License

MIT
