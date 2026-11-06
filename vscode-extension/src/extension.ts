/**
 * VS Code Extension for API Typist
 * Generates TypeScript types, Zod schemas, and API clients from JSON, OpenAPI, or GraphQL
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  // Register commands
  const disposable = vscode.commands.registerCommand('api-typist.pasteJson', async () => {
    await pasteJsonToTypes();
  });

  const graphqlDisposable = vscode.commands.registerCommand('api-typist.fromGraphQL', async (uri?: vscode.Uri) => {
    if (uri) {
      await generateFromGraphQL(uri.fsPath);
    } else {
      const file = await pickGraphQLFile();
      if (file) await generateFromGraphQL(file);
    }
  });

  const openapiDisposable = vscode.commands.registerCommand('api-typist.fromOpenAPI', async (uri?: vscode.Uri) => {
    if (uri) {
      await generateFromOpenAPI(uri.fsPath);
    } else {
      const file = await pickOpenAPIFile();
      if (file) await generateFromOpenAPI(file);
    }
  });

  const configDisposable = vscode.commands.registerCommand('api-typist.showConfig', () => {
    showConfig();
  });

  context.subscriptions.push(disposable, graphqlDisposable, openapiDisposable, configDisposable);
}

async function pasteJsonToTypes() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  let jsonText = '';

  if (selection.isEmpty) {
    // Try to paste from clipboard
    const clipboardText = await vscode.env.clipboard.readText();
    try {
      JSON.parse(clipboardText);
      jsonText = clipboardText;
    } catch {
      vscode.window.showErrorMessage('Clipboard does not contain valid JSON');
      return;
    }
  } else {
    // Use selected text
    jsonText = editor.document.getText(selection);
    try {
      JSON.parse(jsonText);
    } catch {
      vscode.window.showErrorMessage('Selected text is not valid JSON');
      return;
    }
  }

  // Create temp file
  const tempDir = path.join(vscode.extensions.getExtension('api-typist.api-typist')?.extensionPath || '', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempPath = path.join(tempDir, `samples-${Date.now()}.json`);
  fs.writeFileSync(tempPath, jsonText);

  // Run api-typist
  const outputDir = vscode.workspace.getConfiguration('api-typist').get<string>('outputDirectory') || './generated';
  await runApiTypist(['merge', '-i', tempPath, '-o', outputDir]);

  // Clean up temp file
  fs.unlinkSync(tempPath);
}

async function generateFromGraphQL(filePath: string) {
  const outputDir = vscode.workspace.getConfiguration('api-typist').get<string>('outputDirectory') || './generated';
  await runApiTypist(['graphql', '-i', filePath, '-o', outputDir]);
}

async function generateFromOpenAPI(filePath: string) {
  const outputDir = vscode.workspace.getConfiguration('api-typist').get<string>('outputDirectory') || './generated';
  await runApiTypist(['openapi', '-i', filePath, '-o', outputDir]);
}

async function runApiTypist(args: string[]): Promise<boolean> {
  const extension = vscode.extensions.getExtension('api-typist.api-typist');
  const apiTypistPath = extension?.extensionPath ?
    path.join(extension.extensionPath, 'dist', 'cli.js') :
    path.join(__dirname, '..', '..', '..', '..', 'dist', 'cli.js');

  return new Promise((resolve) => {
    const proc = spawn('node', [apiTypistPath, ...args]);

    proc.stdout.on('data', (data) => {
      vscode.window.visibleNotebookEditor?.notebook?.cells?.[0]?.document?.getText();
      vscode.outputChannel?.appendLine(data.toString());
    });

    proc.stderr.on('data', (data) => {
      vscode.window.showErrorMessage(data.toString());
    });

    proc.on('close', (code) => {
      if (code === 0) {
        vscode.window.showInformationMessage('✅ Generated files successfully!');
      } else {
        vscode.window.showErrorMessage(`❌ Generation failed with code ${code}`);
      }
      resolve(code === 0);
    });
  });
}

async function pickGraphQLFile(): Promise<string | undefined> {
  const files = await vscode.workspace.findFiles('**/*.json', null, 10);
  const graphqlFiles = files.filter(f => 
    f.fsPath.includes('introspection') || 
    f.fsPath.includes('graphql') ||
    f.fsPath.includes('schema')
  );

  if (graphqlFiles.length === 0) {
    const allJson = await vscode.workspace.findFiles('**/*.json', null, 20);
    const pick = await vscode.window.showQuickPick([...allJson].map(f => f.fsPath), {
      placeHolder: 'Select GraphQL introspection JSON file'
    });
    return pick;
  }

  const pick = await vscode.window.showQuickPick(graphqlFiles.map(f => f.fsPath), {
    placeHolder: 'Select GraphQL introspection JSON file'
  });
  return pick;
}

async function pickOpenAPIFile(): Promise<string | undefined> {
  const yamlFiles = await vscode.workspace.findFiles('**/*.{yaml,yml}', null, 10);
  
  const pick = await vscode.window.showQuickPick(yamlFiles.map(f => f.fsPath), {
    placeHolder: 'Select OpenAPI YAML file'
  });
  return pick;
}

function showConfig() {
  const config = vscode.workspace.getConfiguration('api-typist');
  const settings = [
    `Output Directory: ${config.get('outputDirectory')}`,
    `Framework: ${config.get('framework')}`,
    `Validator: ${config.get('validator')}`,
    `Include Mocks: ${config.get('includeMocks')}`
  ];
  
  vscode.window.showInformationMessage(settings.join('\n'));
}

export function deactivate() {}

// Output channel for display
export const outputChannel = vscode.window.createOutputChannel('API Typist');