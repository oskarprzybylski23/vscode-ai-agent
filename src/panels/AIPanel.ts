/**
 * The main panel for the Assistant extension.
 * It manages:
 * - Creating and displaying the main assistant webview panel
 * - Handling communication between VS Code extension and webview
 * - Processing API requests to OpenAI
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as config from '../config';

export class AIPanel {
  public static currentPanel: AIPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private static readonly _outputChannel =
    vscode.window.createOutputChannel('AI Assistant');

  private readonly _extensionPath: string;

  private get _apiKey(): string {
    return config.getApiKey();
  }

  private get _model(): string {
    return config.getModel();
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionPath = extensionUri.fsPath;
    AIPanel._outputChannel.appendLine('Initializing AI Assistant panel...');

    this._setupWebview(extensionUri);

    this._panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'askQuestion') {
        const userQuestion = message.text;
        AIPanel._outputChannel.appendLine(`User asked: ${userQuestion}`);

        // Send the question to OpenAI
        const response = await this._fetchAIResponse(userQuestion);

        // Send response back to webview
        this._panel.webview.postMessage({
          type: 'response',
          content: response,
        });
      }
    });
  }

  private _setupWebview(extensionUri: vscode.Uri): void {
    if (!this._panel.webview) {
      throw new Error('Webview is not available');
    }

    this._panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [extensionUri],
    };

    this._panel.webview.html = this._getWebviewContent();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static async createOrShow(extensionUri: vscode.Uri): Promise<AIPanel> {
    AIPanel._outputChannel.appendLine('Creating or showing AI panel...');

    const panel = vscode.window.createWebviewPanel(
      'aiAssistantPanel',
      'AI Assistant',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
      }
    );

    AIPanel.currentPanel = new AIPanel(panel, extensionUri);
    AIPanel._outputChannel.appendLine('AI panel created and initialized');
    return AIPanel.currentPanel;
  }

  private _getWebviewContent(): string {
    try {
      const htmlPath = path.join(
        this._extensionPath,
        'out',
        'webview',
        'webview.html'
      );

      if (!fs.existsSync(htmlPath)) {
        throw new Error(`HTML file not found at: ${htmlPath}`);
      }

      return fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
      const errorMessage = `Error loading webview content: ${error}`;
      AIPanel._outputChannel.appendLine(errorMessage);
      return `<html><body><h1>Error loading content</h1><p>${errorMessage}</p></body></html>`;
    }
  }

  public dispose(): void {
    AIPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private async _fetchAIResponse(prompt: string): Promise<string> {
    try {
      const apiKey = this._apiKey;
      const model = this._model;

      if (!apiKey) {
        throw new Error('API key is missing.');
      }

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      // Explicitly define the expected structure
      interface OpenAIResponse {
        choices: { message: { content: string } }[];
      }

      const data = (await response.json()) as OpenAIResponse;
      return data.choices[0]?.message?.content.trim() || 'No response from AI.';
    } catch (error) {
      AIPanel._outputChannel.appendLine(`Error fetching AI response: ${error}`);
      return 'Sorry, I encountered an error processing your request.';
    }
  }
}
