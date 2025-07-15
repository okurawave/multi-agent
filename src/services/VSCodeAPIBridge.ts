/**
 * VSCodeAPIBridge
 * VS Code APIを活用したブリッジ機能
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { LoggingService } from './LoggingService';

export interface FileOperation {
    type: 'create' | 'read' | 'update' | 'delete' | 'exists';
    filePath: string;
    content?: string;
    encoding?: string;
}

export interface TerminalOperation {
    type: 'execute' | 'sendText' | 'show' | 'hide' | 'dispose';
    terminalId?: string;
    command?: string;
    text?: string;
    cwd?: string;
    env?: { [key: string]: string };
}

export interface WorkspaceOperation {
    type: 'getWorkspaceFolder' | 'getWorkspaceFolders' | 'openFolder' | 'findFiles' | 'getConfiguration';
    pattern?: string;
    section?: string;
}

export interface EditorOperation {
    type: 'openFile' | 'insertText' | 'replaceText' | 'selectText' | 'getCurrentFile' | 'closeFile';
    filePath?: string;
    text?: string;
    position?: vscode.Position;
    selection?: vscode.Selection;
    range?: vscode.Range;
}

export interface NotificationOperation {
    type: 'showInformation' | 'showWarning' | 'showError' | 'showInputBox' | 'showQuickPick';
    message: string;
    options?: any;
    items?: string[];
}

export class VSCodeAPIBridge {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private terminalCounter = 0;

    constructor(private loggingService: LoggingService) {}

    /**
     * ファイルシステム操作を実行
     */
    async executeFileOperation(operation: FileOperation): Promise<any> {
        this.loggingService.debug(`File operation: ${operation.type} on ${operation.filePath}`);

        try {
            switch (operation.type) {
                case 'create':
                    return await this.createFile(operation.filePath, operation.content || '');
                
                case 'read':
                    return await this.readFile(operation.filePath);
                
                case 'update':
                    return await this.updateFile(operation.filePath, operation.content || '');
                
                case 'delete':
                    return await this.deleteFile(operation.filePath);
                
                case 'exists':
                    return await this.fileExists(operation.filePath);
                
                default:
                    throw new Error(`Unsupported file operation: ${operation.type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`File operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ターミナル操作を実行
     */
    async executeTerminalOperation(operation: TerminalOperation): Promise<any> {
        this.loggingService.debug(`Terminal operation: ${operation.type}`);

        try {
            switch (operation.type) {
                case 'execute':
                    return await this.executeCommand(operation.command || '', operation.cwd, operation.env);
                
                case 'sendText':
                    return await this.sendTextToTerminal(operation.terminalId || '', operation.text || '');
                
                case 'show':
                    return await this.showTerminal(operation.terminalId || '');
                
                case 'hide':
                    return await this.hideTerminal(operation.terminalId || '');
                
                case 'dispose':
                    return await this.disposeTerminal(operation.terminalId || '');
                
                default:
                    throw new Error(`Unsupported terminal operation: ${operation.type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Terminal operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ワークスペース操作を実行
     */
    async executeWorkspaceOperation(operation: WorkspaceOperation): Promise<any> {
        this.loggingService.debug(`Workspace operation: ${operation.type}`);

        try {
            switch (operation.type) {
                case 'getWorkspaceFolder':
                    return await this.getWorkspaceFolder();
                
                case 'getWorkspaceFolders':
                    return await this.getWorkspaceFolders();
                
                case 'openFolder':
                    return await this.openFolder(operation.pattern || '');
                
                case 'findFiles':
                    return await this.findFiles(operation.pattern || '');
                
                case 'getConfiguration':
                    return await this.getConfiguration(operation.section);
                
                default:
                    throw new Error(`Unsupported workspace operation: ${operation.type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Workspace operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * エディタ操作を実行
     */
    async executeEditorOperation(operation: EditorOperation): Promise<any> {
        this.loggingService.debug(`Editor operation: ${operation.type}`);

        try {
            switch (operation.type) {
                case 'openFile':
                    return await this.openFile(operation.filePath || '');
                
                case 'insertText':
                    return await this.insertText(operation.text || '', operation.position);
                
                case 'replaceText':
                    return await this.replaceText(operation.range, operation.text || '');
                
                case 'selectText':
                    return await this.selectText(operation.selection);
                
                case 'getCurrentFile':
                    return await this.getCurrentFile();
                
                case 'closeFile':
                    return await this.closeFile(operation.filePath);
                
                default:
                    throw new Error(`Unsupported editor operation: ${operation.type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Editor operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 通知操作を実行
     */
    async executeNotificationOperation(operation: NotificationOperation): Promise<any> {
        this.loggingService.debug(`Notification operation: ${operation.type}`);

        try {
            switch (operation.type) {
                case 'showInformation':
                    return await vscode.window.showInformationMessage(operation.message, operation.options);
                
                case 'showWarning':
                    return await vscode.window.showWarningMessage(operation.message, operation.options);
                
                case 'showError':
                    return await vscode.window.showErrorMessage(operation.message, operation.options);
                
                case 'showInputBox':
                    return await vscode.window.showInputBox(operation.options);
                
                case 'showQuickPick':
                    return await vscode.window.showQuickPick(operation.items || [], operation.options);
                
                default:
                    throw new Error(`Unsupported notification operation: ${operation.type}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Notification operation failed: ${errorMessage}`);
            throw error;
        }
    }

    // === ファイルシステム操作の実装 ===

    private async createFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
        this.loggingService.info(`File created: ${filePath}`);
    }

    private async readFile(filePath: string): Promise<string> {
        const uri = vscode.Uri.file(filePath);
        const data = await vscode.workspace.fs.readFile(uri);
        const decoder = new TextDecoder();
        return decoder.decode(data);
    }

    private async updateFile(filePath: string, content: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
        this.loggingService.info(`File updated: ${filePath}`);
    }

    private async deleteFile(filePath: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.delete(uri);
        this.loggingService.info(`File deleted: ${filePath}`);
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    // === ターミナル操作の実装 ===

    private async executeCommand(command: string, cwd?: string, env?: { [key: string]: string }): Promise<string> {
        const terminalId = `cmd-${++this.terminalCounter}`;
        
        const terminal = vscode.window.createTerminal({
            name: `CrewAI Command ${this.terminalCounter}`,
            cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            env: env
        });

        this.terminals.set(terminalId, terminal);

        // コマンドを実行
        terminal.sendText(command);
        terminal.show();

        // 実際の実装では、コマンドの出力を取得する必要がある
        // ここでは、ターミナルIDを返す
        return terminalId;
    }

    private async sendTextToTerminal(terminalId: string, text: string): Promise<void> {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.sendText(text);
    }

    private async showTerminal(terminalId: string): Promise<void> {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.show();
    }

    private async hideTerminal(terminalId: string): Promise<void> {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.hide();
    }

    private async disposeTerminal(terminalId: string): Promise<void> {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Terminal not found: ${terminalId}`);
        }

        terminal.dispose();
        this.terminals.delete(terminalId);
    }

    // === ワークスペース操作の実装 ===

    private async getWorkspaceFolder(): Promise<string | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        return workspaceFolder ? workspaceFolder.uri.fsPath : null;
    }

    private async getWorkspaceFolders(): Promise<string[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        return workspaceFolders.map(folder => folder.uri.fsPath);
    }

    private async openFolder(folderPath: string): Promise<void> {
        const uri = vscode.Uri.file(folderPath);
        await vscode.commands.executeCommand('vscode.openFolder', uri);
    }

    private async findFiles(pattern: string): Promise<string[]> {
        const files = await vscode.workspace.findFiles(pattern);
        return files.map(file => file.fsPath);
    }

    private async getConfiguration(section?: string): Promise<any> {
        const config = vscode.workspace.getConfiguration(section);
        return config;
    }

    // === エディタ操作の実装 ===

    private async openFile(filePath: string): Promise<void> {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
    }

    private async insertText(text: string, position?: vscode.Position): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        const insertPosition = position || editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(insertPosition, text);
        });
    }

    private async replaceText(range?: vscode.Range, text?: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        const replaceRange = range || editor.selection;
        await editor.edit(editBuilder => {
            editBuilder.replace(replaceRange, text || '');
        });
    }

    private async selectText(selection?: vscode.Selection): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        if (selection) {
            editor.selection = selection;
        }
    }

    private async getCurrentFile(): Promise<string | null> {
        const editor = vscode.window.activeTextEditor;
        return editor ? editor.document.uri.fsPath : null;
    }

    private async closeFile(filePath?: string): Promise<void> {
        if (filePath) {
            // 特定のファイルを閉じる
            const uri = vscode.Uri.file(filePath);
            await vscode.window.showTextDocument(uri);
        }
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    }

    // === ユーティリティメソッド ===

    /**
     * プロジェクト構造を取得
     */
    async getProjectStructure(): Promise<any> {
        const workspaceFolder = await this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return null;
        }

        const structure = await this.scanDirectory(workspaceFolder);
        return structure;
    }

    private async scanDirectory(dirPath: string, maxDepth: number = 3, currentDepth: number = 0): Promise<any> {
        if (currentDepth >= maxDepth) {
            return null;
        }

        try {
            const items = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirPath));
            const structure: any = {};

            for (const [name, type] of items) {
                const itemPath = path.join(dirPath, name);
                
                if (type === vscode.FileType.Directory) {
                    structure[name] = await this.scanDirectory(itemPath, maxDepth, currentDepth + 1);
                } else {
                    structure[name] = 'file';
                }
            }

            return structure;
        } catch (error) {
            this.loggingService.warn(`Failed to scan directory ${dirPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    /**
     * ターミナルのリストを取得
     */
    getTerminalList(): string[] {
        return Array.from(this.terminals.keys());
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): any {
        return {
            activeTerminals: this.terminals.size,
            terminalsList: this.getTerminalList()
        };
    }

    /**
     * すべてのターミナルを閉じる
     */
    async disposeAllTerminals(): Promise<void> {
        for (const [terminalId, terminal] of this.terminals) {
            terminal.dispose();
        }
        this.terminals.clear();
        this.loggingService.info('All terminals disposed');
    }
}
