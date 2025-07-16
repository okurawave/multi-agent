/**
 * SidebarUIManager
 * サイドバーUIの管理とイベント処理を行う
 */

import * as vscode from 'vscode';
import { CrewAIConnectProvider, TaskStatus } from '../providers/CrewAIConnectProvider';
import { LoggingService } from '../services/LoggingService';
import { ConfigurationService } from '../services/ConfigurationService';
import { SidebarChatManager } from './SidebarChatManager';

export class SidebarUIManager {
    private statusBarItem: vscode.StatusBarItem;
    private taskCountWatcher: vscode.Disposable | undefined;
    private sidebarChatManager: SidebarChatManager;

    constructor(
        private context: vscode.ExtensionContext,
        private crewAIProvider: CrewAIConnectProvider,
        private loggingService: LoggingService,
        private configurationService: ConfigurationService
    ) {
        // SidebarChatManagerの初期化
        this.sidebarChatManager = new SidebarChatManager(
            context,
            loggingService,
            crewAIProvider,
            crewAIProvider.getIPCService()
        );
        
        // ステータスバーアイテムの作成
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'crewai-connect.openChat';
        this.context.subscriptions.push(this.statusBarItem);

        this.setupUI();
        this.setupEventHandlers();
    }

    /**
     * UIの初期設定
     */
    private setupUI(): void {
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    /**
     * イベントハンドラーの設定
     */
    private setupEventHandlers(): void {
        // 定期的にタスクカウントを更新
        const intervalId = setInterval(() => {
            this.updateStatusBar();
        }, 1000);

        this.taskCountWatcher = {
            dispose: () => {
                clearInterval(intervalId);
            }
        };

        // 拡張機能のアクティベーションイベント
        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.showStatistics', () => {
                this.showStatistics();
            })
        );

        // 完了したタスクをクリアするコマンド
        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.clearCompleted', () => {
                this.clearCompletedTasks();
            })
        );

        // タスク詳細を表示するコマンド
        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.showTaskDetails', (task: TaskStatus) => {
                this.showTaskDetails(task);
            })
        );

        // 新しいタスクを開始するクイックコマンド
        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.quickStartTask', () => {
                this.quickStartTask();
            })
        );

        // VS Code API連携のコマンドを追加
        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.showProjectStructure', async () => {
                await this.showProjectStructure();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.openTerminal', async () => {
                await this.openTerminal();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.createFile', async () => {
                await this.createFile();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.showModelInfo', async () => {
                await this.showModelInfo();
            })
        );

        this.context.subscriptions.push(
            vscode.commands.registerCommand('crewai-connect.checkLLMAPI', async () => {
                await this.checkLLMAPI();
            })
        );
    }

    /**
     * ステータスバーの更新
     */
    private updateStatusBar(): void {
        const stats = this.crewAIProvider.getStatistics();
        const activeCount = stats.running;
        
        if (activeCount > 0) {
            this.statusBarItem.text = `$(robot) CrewAI: ${activeCount} running`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.text = `$(robot) CrewAI: Ready`;
            this.statusBarItem.backgroundColor = undefined;
        }
        
        this.statusBarItem.tooltip = this.createStatusTooltip(stats);
    }

    /**
     * ステータスツールチップの作成
     */
    private createStatusTooltip(stats: any): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown('**CrewAI Connect Status**\n\n');
        tooltip.appendMarkdown(`- **Total Tasks:** ${stats.total}\n`);
        tooltip.appendMarkdown(`- **Running:** ${stats.running}\n`);
        tooltip.appendMarkdown(`- **Completed:** ${stats.completed}\n`);
        tooltip.appendMarkdown(`- **Failed:** ${stats.failed}\n`);
        tooltip.appendMarkdown(`- **Stopped:** ${stats.stopped}\n\n`);
        tooltip.appendMarkdown('*Click to start a new task*');
        return tooltip;
    }

    /**
     * 統計情報を表示
     */
    private async showStatistics(): Promise<void> {
        const stats = this.crewAIProvider.getStatistics();
        const maxTasks = this.configurationService.getMaxConcurrentTasks();
        
        const message = `
**CrewAI Connect Statistics**

📊 **Task Overview:**
- Total Tasks: ${stats.total}
- Running: ${stats.running}
- Completed: ${stats.completed}
- Failed: ${stats.failed}
- Stopped: ${stats.stopped}

⚙️ **Configuration:**
- Max Concurrent Tasks: ${maxTasks}
- Python Path: ${this.configurationService.getPythonPath()}
- Log Level: ${this.configurationService.getLogLevel()}

📈 **Performance:**
- Success Rate: ${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
- Active Usage: ${stats.running}/${maxTasks} slots
        `;

        const panel = vscode.window.createWebviewPanel(
            'crewai-statistics',
            'CrewAI Connect Statistics',
            vscode.ViewColumn.One,
            { enableScripts: false }
        );

        panel.webview.html = this.getStatisticsWebviewContent(message);
    }

    /**
     * 統計情報のWebviewコンテンツを取得
     */
    private getStatisticsWebviewContent(message: string): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CrewAI Connect Statistics</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
        }
        .stat-label {
            font-weight: bold;
        }
        .stat-value {
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 CrewAI Connect Statistics</h1>
        <div class="section">
            <pre style="white-space: pre-wrap; font-family: var(--vscode-editor-font-family);">${message}</pre>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * 完了したタスクをクリア
     */
    private async clearCompletedTasks(): Promise<void> {
        const stats = this.crewAIProvider.getStatistics();
        const completedCount = stats.completed + stats.failed + stats.stopped;
        
        if (completedCount === 0) {
            vscode.window.showInformationMessage('No completed tasks to clear.');
            return;
        }

        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to clear ${completedCount} completed tasks?`,
            'Yes',
            'No'
        );

        if (result === 'Yes') {
            this.crewAIProvider.clearCompletedTasks();
            vscode.window.showInformationMessage(`Cleared ${completedCount} completed tasks.`);
        }
    }

    /**
     * タスク詳細を表示
     */
    private async showTaskDetails(task: TaskStatus): Promise<void> {
        const duration = task.endTime && task.startTime 
            ? task.endTime.getTime() - task.startTime.getTime()
            : task.startTime 
                ? Date.now() - task.startTime.getTime()
                : 0;

        const durationText = duration > 0 ? `${Math.round(duration / 1000)}s` : 'N/A';

        const details = `
**Task Details**

**ID:** ${task.id}
**Title:** ${task.title}
**Status:** ${task.status}
**Description:** ${task.description || 'No description'}
**Duration:** ${durationText}
**Start Time:** ${task.startTime?.toLocaleString() || 'Unknown'}
**End Time:** ${task.endTime?.toLocaleString() || 'Still running'}
**Progress:** ${task.progress !== undefined ? `${task.progress}%` : 'N/A'}
        `;

        const panel = vscode.window.createWebviewPanel(
            'crewai-task-details',
            `Task Details - ${task.id}`,
            vscode.ViewColumn.One,
            { enableScripts: false }
        );

        panel.webview.html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Task Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        pre {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <h1>📋 Task Details</h1>
    <pre>${details}</pre>
</body>
</html>
        `;
    }

    /**
     * クイックタスク開始
     */
    private async quickStartTask(): Promise<void> {
        const taskDescription = await vscode.window.showInputBox({
            prompt: 'Enter a description for the new task',
            placeHolder: 'e.g., Create a simple Python script...',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Task description cannot be empty';
                }
                if (value.length > 200) {
                    return 'Task description is too long (max 200 characters)';
                }
                return null;
            }
        });

        if (taskDescription) {
            try {
                const taskId = await this.crewAIProvider.startTask(taskDescription);
                vscode.window.showInformationMessage(`Task started: ${taskId}`);
                this.loggingService.info(`Quick task started: ${taskId} - ${taskDescription}`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to start task: ${errorMessage}`);
            }
        }
    }

    /**
     * プロジェクト構造を表示
     */
    private async showProjectStructure(): Promise<void> {
        try {
            const structure = await this.crewAIProvider.getProjectStructure();
            
            if (structure) {
                const structureString = JSON.stringify(structure, null, 2);
                
                // 新しいエディタでプロジェクト構造を表示
                const document = await vscode.workspace.openTextDocument({
                    content: structureString,
                    language: 'json'
                });
                
                await vscode.window.showTextDocument(document);
                
                vscode.window.showInformationMessage('Project structure displayed');
            } else {
                vscode.window.showWarningMessage('No workspace folder found');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to show project structure: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to show project structure: ${errorMessage}`);
        }
    }

    /**
     * ターミナルを開く
     */
    private async openTerminal(): Promise<void> {
        try {
            const terminalId = await this.crewAIProvider.executeTerminalOperation({
                type: 'execute',
                command: 'echo "CrewAI Connect Terminal Ready"'
            });
            
            vscode.window.showInformationMessage(`Terminal opened: ${terminalId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to open terminal: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to open terminal: ${errorMessage}`);
        }
    }

    /**
     * ファイルを作成
     */
    private async createFile(): Promise<void> {
        try {
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter file name',
                placeHolder: 'example.txt'
            });
            
            if (!fileName) {
                return;
            }
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }
            
            const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName).fsPath;
            
            await this.crewAIProvider.executeFileOperation({
                type: 'create',
                filePath: filePath,
                content: '// Created by CrewAI Connect\n'
            });
            
            vscode.window.showInformationMessage(`File created: ${fileName}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to create file: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
        }
    }

    /**
     * モデル情報を表示
     */
    private async showModelInfo(): Promise<void> {
        try {
            const modelInfos = await this.crewAIProvider.executeNotificationOperation({
                type: 'info',
                message: 'Fetching model information...'
            });
            
            const models = await this.crewAIProvider.getAvailableLLMModels();
            const infos = await this.crewAIProvider.getLLMModelInfo();
            
            if (infos && infos.length > 0) {
                const infoString = infos.map((info: any) => 
                    `**${info.name}** (${info.vendor})\n` +
                    `  - ID: ${info.id}\n` +
                    `  - Max Tokens: ${info.maxInputTokens}\n` +
                    `  - Available: ${info.isAvailable ? 'Yes' : 'No'}\n` +
                    `  - Capabilities: ${info.capabilities?.join(', ') || 'Unknown'}\n`
                ).join('\n');
                
                const document = await vscode.workspace.openTextDocument({
                    content: `# Available Language Models\n\n${infoString}`,
                    language: 'markdown'
                });
                
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage(`Found ${infos.length} available models`);
            } else {
                vscode.window.showWarningMessage('No model information available');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to show model info: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to show model info: ${errorMessage}`);
        }
    }

    /**
     * LLM APIのチェック
     */
    private async checkLLMAPI(): Promise<void> {
        try {
            vscode.window.showInformationMessage('Checking LLM API availability...');
            
            const result = await this.crewAIProvider.checkLLMAPIAvailability();
            
            const statusMessage = result.isAvailable 
                ? `✅ LLM API is available (${result.modelCount} models found)`
                : `❌ LLM API is not available: ${result.error}`;
            
            const details = `**LLM API Status Check**\n\n` +
                `**Available:** ${result.isAvailable ? 'Yes' : 'No'}\n` +
                `**VS Code Version:** ${result.version || 'Unknown'}\n` +
                `**Model Count:** ${result.modelCount || 0}\n` +
                `**Error:** ${result.error || 'None'}\n\n` +
                `**Recommendations:**\n` +
                (!result.isAvailable ? 
                    `- Update VS Code to the latest version\n` +
                    `- Install GitHub Copilot extension\n` +
                    `- Check if you have access to language models` 
                    : `- ${result.modelCount} models are available for use`);
            
            const document = await vscode.workspace.openTextDocument({
                content: details,
                language: 'markdown'
            });
            
            await vscode.window.showTextDocument(document);
            
            if (result.isAvailable) {
                vscode.window.showInformationMessage(statusMessage);
            } else {
                vscode.window.showWarningMessage(statusMessage);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to check LLM API: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to check LLM API: ${errorMessage}`);
        }
    }

    /**
     * 進捗の表示を更新
     */
    updateProgress(taskId: string, progress: number): void {
        this.crewAIProvider.updateTaskStatus(taskId, 'running', progress);
        this.updateStatusBar();
    }

    /**
     * SidebarChatManagerを取得
     */
    getSidebarChatManager(): SidebarChatManager {
        return this.sidebarChatManager;
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        if (this.taskCountWatcher) {
            this.taskCountWatcher.dispose();
        }
        this.statusBarItem.dispose();
    }
}
