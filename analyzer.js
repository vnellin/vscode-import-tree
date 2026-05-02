const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const IMPORT_PATTERNS = [
  /import\s+['"]([^'"]+)['"]/g,
  /import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const RESOLVE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.mjs', '.cjs', '.mts', '.cts',
  '.json',
];

class DependencyGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addFile(filePath) {
    if (!this.nodes.has(filePath)) {
      this.nodes.set(filePath, { path: filePath, imports: [], importedBy: [] });
    }
    return this.nodes.get(filePath);
  }

  addImport(from, to) {
    if (!to) return;
    const fromNode = this.addFile(from);
    if (!fromNode.imports.includes(to)) {
      fromNode.imports.push(to);
      this.edges.push({ from, to });
      const toNode = this.addFile(to);
      if (!toNode.importedBy.includes(from)) {
        toNode.importedBy.push(from);
      }
    }
  }

  getUnusedFiles() {
    const result = [];
    for (const [filePath, node] of this.nodes) {
      if (node.importedBy.length === 0) {
        const basename = path.basename(filePath);
        if (!/^index\./.test(basename)) {
          result.push(filePath);
        }
      }
    }
    return result;
  }

  toJSON() {
    return {
      nodes: Array.from(this.nodes.keys()),
      edges: this.edges.map(e => ({ from: e.from, to: e.to })),
      unused: this.getUnusedFiles(),
    };
  }
}

async function findSourceFiles(rootPath, progress) {
  const pattern = new vscode.RelativePattern(rootPath, '**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}');
  const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
  if (progress) {
    progress.report({ message: `Found ${files.length} source files` });
  }
  return files;
}

function resolveImport(importPath, fromFile) {
  if (!importPath.startsWith('.')) {
    return null;
  }
  const fromDir = path.dirname(fromFile);
  const resolved = path.resolve(fromDir, importPath);

  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    return resolved;
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) return withExt;

    const index = path.join(resolved, `index${ext}`);
    if (fs.existsSync(index)) return index;
  }

  return null;
}

function parseImports(content, filePath) {
  const imports = [];

  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath) {
        const resolved = resolveImport(importPath, filePath);
        if (resolved && !imports.includes(resolved)) {
          imports.push(resolved);
        }
      }
    }
  }

  return imports;
}

async function buildGraph(rootPath, progress) {
  const files = await findSourceFiles(rootPath, progress);
  const graph = new DependencyGraph();
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const fileUri = files[i];
    const filePath = fileUri.fsPath;
    if (progress) {
      progress.report({ message: `Analyzing ${path.basename(filePath)}`, increment: 100 / total });
    }
    try {
      const doc = await vscode.workspace.openTextDocument(fileUri);
      const content = doc.getText();
      const resolvedImports = parseImports(content, filePath);
      for (const resolved of resolvedImports) {
        graph.addImport(filePath, resolved);
      }
      if (!graph.nodes.has(filePath)) {
        graph.addFile(filePath);
      }
    } catch {
      graph.addFile(filePath);
    }
  }

  return graph;
}

module.exports = { buildGraph, DependencyGraph };
