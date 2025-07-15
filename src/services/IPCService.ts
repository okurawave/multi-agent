/**
 * IPCService
 * TypeScript-Python間の統合IPC通信サービス
 */

import * as vscode from 'vscode';
import { LoggingService } from '../services/LoggingService';
import { ConfigurationService } from '../services/ConfigurationService';
import { EnhancedPythonProcessManager } from '../services/EnhancedPythonProcessManager';
import { LLMAPIWrapper, LLMRequest, LLMResponse } from '../services/LLMAPIWrapper';
import { 
    IPCMessageType, 
    TaskProgressNotification,
    TaskCompletedNotification,
    TaskFailedNotification,
    StatusUpdateNotification
} from '../ipc/IPCTypes';

export interface TaskInfo {
    id: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
    startTime?: Date;
    endTime?: Date;
    error?: string;
    result?: any;
}

export class IPCService {
    private processManager: EnhancedPythonProcessManager;
    private llmWrapper: LLMAPIWrapper;
    private tasks: Map<string, TaskInfo> = new Map();
    private eventListeners: { [event: string]: Function[] } = {};

    constructor(
        private loggingService: LoggingService,
        private configurationService: ConfigurationService
    ) {
        this.processManager = new EnhancedPythonProcessManager(
            configurationService,
            loggingService
        );
        
        this.llmWrapper = new LLMAPIWrapper(loggingService);

        this.setupEventHandlers();
    }

    /**
     * イベントハンドラーの設定
     */
    private setupEventHandlers(): void {
        // タスク進捗の更新
        this.processManager.on('taskProgress', (notification: TaskProgressNotification) => {
            this.updateTaskProgress(notification);
        });

        // タスク完了の処理
        this.processManager.on('taskCompleted', (notification: TaskCompletedNotification) => {
            this.handleTaskCompleted(notification);
        });

        // タスク失敗の処理
        this.processManager.on('taskFailed', (notification: TaskFailedNotification) => {
            this.handleTaskFailed(notification);
        });

        // ステータス更新の処理
        this.processManager.on('statusUpdate', (notification: StatusUpdateNotification) => {
            this.emit('statusUpdate', notification);
        });
    }

    /**
     * IPCサービスを初期化
     */
    async initialize(): Promise<void> {
        this.loggingService.info('Initializing IPC service...');
        
        try {
            await this.processManager.initialize();
            this.loggingService.info('IPC service initialized successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to initialize IPC service: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * タスクを開始
     */
    async startTask(description: string, parameters?: any): Promise<string> {
        const taskId = this.generateTaskId();
        
        const taskInfo: TaskInfo = {
            id: taskId,
            description,
            status: 'pending',
            progress: 0,
            startTime: new Date()
        };

        this.tasks.set(taskId, taskInfo);
        
        try {
            const result = await this.processManager.sendRequest(IPCMessageType.START_TASK, {
                task_id: taskId,
                description,
                parameters
            });

            taskInfo.status = 'running';
            this.emit('taskStarted', taskInfo);
            
            this.loggingService.info(`Task started: ${taskId} - ${description}`);
            return taskId;
            
        } catch (error) {
            taskInfo.status = 'failed';
            taskInfo.error = error instanceof Error ? error.message : 'Unknown error';
            taskInfo.endTime = new Date();
            
            this.emit('taskFailed', taskInfo);
            throw error;
        }
    }

    /**
     * タスクを停止
     */
    async stopTask(taskId: string): Promise<void> {
        const taskInfo = this.tasks.get(taskId);
        if (!taskInfo) {
            throw new Error(`Task not found: ${taskId}`);
        }

        try {
            await this.processManager.sendRequest(IPCMessageType.STOP_TASK, {
                task_id: taskId
            });

            taskInfo.status = 'failed';
            taskInfo.error = 'Stopped by user';
            taskInfo.endTime = new Date();
            
            this.emit('taskStopped', taskInfo);
            this.loggingService.info(`Task stopped: ${taskId}`);
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to stop task: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * タスクのステータスを取得
     */
    async getTaskStatus(taskId: string): Promise<TaskInfo | null> {
        const localTask = this.tasks.get(taskId);
        if (!localTask) {
            return null;
        }

        try {
            const remoteStatus = await this.processManager.sendRequest(IPCMessageType.GET_TASK_STATUS, {
                task_id: taskId
            });

            // リモートの状態でローカルの状態を更新
            if (remoteStatus) {
                localTask.status = remoteStatus.status;
                localTask.progress = remoteStatus.progress || localTask.progress;
                if (remoteStatus.endTime) {
                    localTask.endTime = new Date(remoteStatus.endTime);
                }
            }

            return localTask;
            
        } catch (error) {
            this.loggingService.error(`Failed to get task status: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return localTask;
        }
    }

    /**
     * すべてのタスクを取得
     */
    async getAllTasks(): Promise<TaskInfo[]> {
        try {
            const remoteTasks = await this.processManager.sendRequest(IPCMessageType.LIST_TASKS);
            
            // リモートの状態でローカルの状態を更新
            if (remoteTasks && Array.isArray(remoteTasks)) {
                remoteTasks.forEach((remoteTask: any) => {
                    const localTask = this.tasks.get(remoteTask.id);
                    if (localTask) {
                        localTask.status = remoteTask.status;
                        localTask.progress = remoteTask.progress || localTask.progress;
                        if (remoteTask.endTime) {
                            localTask.endTime = new Date(remoteTask.endTime);
                        }
                    }
                });
            }

            return Array.from(this.tasks.values());
            
        } catch (error) {
            this.loggingService.error(`Failed to get all tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return Array.from(this.tasks.values());
        }
    }

    /**
     * LLMリクエストを送信
     */
    async sendLLMRequest(prompt: string, options?: any): Promise<any> {
        try {
            const llmRequest: LLMRequest = {
                prompt,
                model: options?.model,
                temperature: options?.temperature,
                maxTokens: options?.maxTokens,
                systemPrompt: options?.systemPrompt,
                context: options?.context,
                userId: options?.userId
            };

            const result = await this.llmWrapper.sendRequest(llmRequest, options);

            this.loggingService.debug(`LLM request completed: ${prompt.substring(0, 100)}...`);
            return result;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`LLM request failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * バッチLLMリクエストを送信
     */
    async sendBatchLLMRequests(requests: LLMRequest[]): Promise<LLMResponse[]> {
        try {
            const results = await this.llmWrapper.sendBatchRequests(requests);
            this.loggingService.debug(`Batch LLM requests completed: ${requests.length} requests`);
            return results;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Batch LLM requests failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 利用可能なLLMモデルを取得
     */
    async getAvailableLLMModels(): Promise<string[]> {
        try {
            return await this.llmWrapper.getAvailableModels();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to get available LLM models: ${errorMessage}`);
            return [];
        }
    }

    /**
     * LLMモデルの情報を取得
     */
    async getLLMModelInfo(modelId?: string): Promise<any> {
        try {
            return await this.llmWrapper.getModelInfo(modelId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to get LLM model info: ${errorMessage}`);
            return null;
        }
    }

    /**
     * プロンプトを最適化
     */
    optimizePrompt(prompt: string, maxTokens?: number): string {
        return this.llmWrapper.optimizePrompt(prompt, maxTokens);
    }

    /**
     * ツールリクエストを送信
     */
    async sendToolRequest(toolName: string, parameters: any): Promise<any> {
        try {
            const result = await this.processManager.sendRequest(IPCMessageType.TOOL_REQUEST, {
                tool_name: toolName,
                parameters
            });

            this.loggingService.debug(`Tool request completed: ${toolName}`);
            return result;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Tool request failed: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * ヘルスチェックを実行
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.processManager.sendRequest(IPCMessageType.HEALTH_CHECK);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): any {
        const processStats = this.processManager.getStatistics();
        const llmStats = this.llmWrapper.getStatistics();
        const taskStats = this.getTaskStatistics();
        
        return {
            ...processStats,
            llm: llmStats,
            tasks: taskStats
        };
    }

    /**
     * タスクの統計情報を取得
     */
    private getTaskStatistics(): any {
        const tasks = Array.from(this.tasks.values());
        
        return {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length
        };
    }

    /**
     * タスクの進捗を更新
     */
    private updateTaskProgress(notification: TaskProgressNotification): void {
        const taskInfo = this.tasks.get(notification.taskId);
        if (taskInfo) {
            taskInfo.progress = notification.progress;
            taskInfo.status = notification.status as TaskInfo['status'];
            
            this.emit('taskProgress', {
                taskId: notification.taskId,
                progress: notification.progress,
                status: notification.status,
                message: notification.message
            });
        }
    }

    /**
     * タスク完了を処理
     */
    private handleTaskCompleted(notification: TaskCompletedNotification): void {
        const taskInfo = this.tasks.get(notification.taskId);
        if (taskInfo) {
            taskInfo.status = 'completed';
            taskInfo.progress = 100;
            taskInfo.endTime = new Date();
            taskInfo.result = notification.result;
            
            this.emit('taskCompleted', taskInfo);
            this.loggingService.info(`Task completed: ${notification.taskId} (${notification.duration}ms)`);
        }
    }

    /**
     * タスク失敗を処理
     */
    private handleTaskFailed(notification: TaskFailedNotification): void {
        const taskInfo = this.tasks.get(notification.taskId);
        if (taskInfo) {
            taskInfo.status = 'failed';
            taskInfo.endTime = new Date();
            taskInfo.error = notification.error;
            
            this.emit('taskFailed', taskInfo);
            this.loggingService.error(`Task failed: ${notification.taskId} - ${notification.error}`);
        }
    }

    /**
     * IPCサービスの接続状態を取得
     */
    getConnectionState(): string {
        return this.processManager.getConnectionState();
    }

    /**
     * IPCサービスが実行中かどうかを確認
     */
    isRunning(): boolean {
        return this.processManager.isRunning();
    }

    /**
     * IPCサービスを再起動
     */
    async restart(): Promise<void> {
        await this.processManager.restart();
    }

    /**
     * タスクIDを生成
     */
    private generateTaskId(): string {
        return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * イベントリスナーを追加
     */
    on(event: string, listener: Function): void {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(listener);
    }

    /**
     * イベントリスナーを削除
     */
    off(event: string, listener: Function): void {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
        }
    }

    /**
     * イベントを発行
     */
    private emit(event: string, ...args: any[]): void {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(listener => listener(...args));
        }
    }

    /**
     * リソースの解放
     */
    async dispose(): Promise<void> {
        await this.processManager.dispose();
        this.tasks.clear();
        this.eventListeners = {};
    }
}
