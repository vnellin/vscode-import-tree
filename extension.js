const vscode = require('vscode');
const path = require('path');
const { buildGraph } = require('./analyzer');
const { showGraph } = require('./panel');

let graphData = null;

class UnusedFilesProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._files = [];
  }

  refresh(files) {
    this._files = files || [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    const item = new vscode.TreeItem(
      path.basename(element),
      vscode.TreeItemCollapsibleState.None
    );
    item.description = path.dirname(element);
    item.tooltip = element;
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(element)],
    };
    item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    item.contextValue = 'unusedFile';
    return item;
  }

  getChildren() {
    return this._files;
  }
}

function activate(context) {
  const unusedProvider = new UnusedFilesProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('importTree.unused', unusedProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('importTree.showGraph', async () => {
      const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (!rootPath) {
        vscode.window.showErrorMessage('Import Tree: Open a workspace first');
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Import Tree: Analyzing dependencies...',
          cancellable: false,
        },
        async (progress) => {
          const graph = await buildGraph(rootPath, progress);
          graphData = graph.toJSON();
          unusedProvider.refresh(graphData.unused);

          if (graphData.nodes.length === 0) {
            vscode.window.showInformationMessage('Import Tree: No source files found');
            return;
          }

          showGraph(context, graphData);
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('importTree.refresh', async () => {
      if (graphData) {
        unusedProvider.refresh(graphData.unused);
      }
    })
  );

  if (vscode.workspace.workspaceFolders) {
    vscode.commands.executeCommand('importTree.showGraph');
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
