/**
 * CrewAIConnectProvider
 * VS Codeのサイドバーとコマンドを管理するプロバイダー
 */

import * as vscode from 'vscode';
import { PythonProcessManager } from '../services/PythonProcessManager';
import { IPCService } from '../services/IPCService';
import { LoggingService } from '../services/LoggingService';
import { ConfigurationService } from '../services/ConfigurationService';
import { ChatWebviewManager } from '../webview/ChatWebviewManager';

export interface TaskStatus {
    id: string;
    title: string;
    status: 'running' | 'completed' | 'failed' | 'stopped';
    progress?: number;
    description?: string;
    startTime?: Date;
    endTime?: Date;
}

export class CrewAIConnectProvider implements vscode.TreeDataProvider<TaskStatus> {
    private _onDidChangeTreeData: vscode.EventEmitter<TaskStatus | undefined | null | void> = new vscode.EventEmitter<TaskStatus | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TaskStatus | undefined | null | void> = this._onDidChangeTreeData.event;

    private activeTasks: Map<string, TaskStatus> = new Map();
    private taskCounter: number = 0;
    private chatWebviewManager: ChatWebviewManager;

    constructor(
        private context: vscode.ExtensionContext,
        private ipcService: IPCService,
        private loggingService: LoggingService,
        private configurationService: ConfigurationService
    ) {
        // ChatWebviewManagerの初期化
        this.chatWebviewManager = new ChatWebviewManager(
            context,
            loggingService,
            this,
            ipcService
        );
    }

    /**
     * TreeDataProviderの実装
     */
    getTreeItem(element: TaskStatus): vscode.TreeItem {
        const item = new vscode.TreeItem(element.title);
        
        // アイコンの設定
        switch (element.status) {
            case 'running':
                item.iconPath = new vscode.ThemeIcon('loading~spin');
                item.description = 'Running...';
                break;
            case 'completed':
                item.iconPath = new vscode.ThemeIcon('check');
                item.description = 'Completed';
                break;
            case 'failed':
                item.iconPath = new vscode.ThemeIcon('error');
                item.description = 'Failed';
                break;
            case 'stopped':
                item.iconPath = new vscode.ThemeIcon('stop');
                item.description = 'Stopped';
                break;
        }

        // プログレスバーの表示
        if (element.progress !== undefined) {
            item.description = `${item.description} (${element.progress}%)`;
        }

        // ツールチップの設定
        item.tooltip = new vscode.MarkdownString(`
**Task ID:** ${element.id}
**Status:** ${element.status}
**Description:** ${element.description || 'No description'}
**Start Time:** ${element.startTime?.toLocaleString() || 'Unknown'}
${element.endTime ? `**End Time:** ${element.endTime.toLocaleString()}` : ''}
        `);

        return item;
    }

    /**
     * 子要素を取得
     */
    getChildren(element?: TaskStatus): Thenable<TaskStatus[]> {
        if (!element) {
            // ルートレベル - すべてのタスクを返す
            return Promise.resolve(Array.from(this.activeTasks.values()));
        }
        
        // 子要素はない
        return Promise.resolve([]);
    }

    /**
     * データの更新
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * チャットインターフェースを開く
     */
    async openChatInterface(): Promise<void> {
        this.loggingService.info('Opening chat interface...');
        await this.chatWebviewManager.showChatPanel();
    }

    /**
     * 新しいタスクを開始
     */
    async startTask(description: string): Promise<string> {
        const taskId = `task-${++this.taskCounter}`;
        const task: TaskStatus = {
            id: taskId,
            title: `Task ${this.taskCounter}`,
            status: 'running',
            description,
            startTime: new Date(),
            progress: 0
        };

        this.activeTasks.set(taskId, task);
        this.refresh();

        try {
            // IPCサービスにタスク開始を通知
            await this.ipcService.startTask(description);

            this.loggingService.info(`Task started: ${taskId} - ${description}`);
            return taskId;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to start task: ${errorMessage}`);
            
            // タスクを失敗状態に更新
            task.status = 'failed';
            task.endTime = new Date();
            this.refresh();
            
            throw error;
        }
    }

    /**
     * タスクを停止
     */
    async stopTask(taskId: string): Promise<void> {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        try {
            // IPCサービスにタスク停止を通知
            await this.ipcService.stopTask(taskId);

            // タスクを停止状態に更新
            task.status = 'stopped';
            task.endTime = new Date();
            this.refresh();

            this.loggingService.info(`Task stopped: ${taskId}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to stop task: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * すべてのタスクを停止
     */
    async stopAllTasks(): Promise<void> {
        const runningTasks = Array.from(this.activeTasks.values()).filter(task => task.status === 'running');
        
        if (runningTasks.length === 0) {
            this.loggingService.info('No running tasks to stop');
            return;
        }

        this.loggingService.info(`Stopping ${runningTasks.length} running tasks...`);

        // 並列でタスクを停止
        const stopPromises = runningTasks.map(task => this.stopTask(task.id));
        
        try {
            await Promise.all(stopPromises);
            this.loggingService.info('All tasks stopped successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Error stopping some tasks: ${errorMessage}`);
        }
    }

    /**
     * タスクの状態を更新
     */
    updateTaskStatus(taskId: string, status: TaskStatus['status'], progress?: number): void {
        const task = this.activeTasks.get(taskId);
        if (task) {
            task.status = status;
            if (progress !== undefined) {
                task.progress = progress;
            }
            if (status === 'completed' || status === 'failed') {
                task.endTime = new Date();
            }
            this.refresh();
        }
    }

    /**
     * 完了したタスクをクリア
     */
    clearCompletedTasks(): void {
        const completedTasks = Array.from(this.activeTasks.entries())
            .filter(([, task]) => task.status === 'completed' || task.status === 'failed')
            .map(([id]) => id);

        completedTasks.forEach(taskId => {
            this.activeTasks.delete(taskId);
        });

        if (completedTasks.length > 0) {
            this.refresh();
            this.loggingService.info(`Cleared ${completedTasks.length} completed tasks`);
        }
    }

    /**
     * アクティブなタスクの数を取得
     */
    getActiveTaskCount(): number {
        return Array.from(this.activeTasks.values()).filter(task => task.status === 'running').length;
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): {
        total: number;
        running: number;
        completed: number;
        failed: number;
        stopped: number;
    } {
        const tasks = Array.from(this.activeTasks.values());
        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            stopped: tasks.filter(t => t.status === 'stopped').length
        };
    }

    /**
     * プロジェクト構造を取得
     */
    async getProjectStructure(): Promise<any> {
        try {
            return await this.ipcService.getProjectStructure();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to get project structure: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ファイルシステム操作を実行
     */
    async executeFileOperation(operation: any): Promise<any> {
        try {
            return await this.ipcService.executeFileOperation(operation);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`File operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ターミナル操作を実行
     */
    async executeTerminalOperation(operation: any): Promise<any> {
        try {
            return await this.ipcService.executeTerminalOperation(operation);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Terminal operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ワークスペース操作を実行
     */
    async executeWorkspaceOperation(operation: any): Promise<any> {
        try {
            return await this.ipcService.executeWorkspaceOperation(operation);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Workspace operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * エディタ操作を実行
     */
    async executeEditorOperation(operation: any): Promise<any> {
        try {
            return await this.ipcService.executeEditorOperation(operation);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Editor operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 通知操作を実行
     */
    async executeNotificationOperation(operation: any): Promise<any> {
        try {
            return await this.ipcService.executeNotificationOperation(operation);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Notification operation failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 利用可能なLLMモデルを取得
     */
    async getAvailableLLMModels(): Promise<string[]> {
        try {
            return await this.ipcService.getAvailableLLMModels();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to get available LLM models: ${errorMessage}`);
            return [];
        }
    }

    /**
     * LLMモデル情報を取得
     */
    async getLLMModelInfo(modelId?: string): Promise<any> {
        try {
            return await this.ipcService.getLLMModelInfo(modelId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to get LLM model info: ${errorMessage}`);
            return null;
        }
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        if (this.chatWebviewManager) {
            this.chatWebviewManager.dispose();
        }
    }
}
