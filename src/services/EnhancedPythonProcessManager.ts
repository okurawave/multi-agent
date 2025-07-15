/**
 * EnhancedPythonProcessManager
 * 高度なIPC通信機能を持つPythonプロセス管理クラス
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { LoggingService } from '../services/LoggingService';
import { ConfigurationService } from '../services/ConfigurationService';
import { IPCConnectionManager } from '../ipc/IPCConnectionManager';
import { 
    IPCMessageType, 
    IPCRequest, 
    IPCResponse, 
    IPCNotification,
    TaskProgressNotification,
    TaskCompletedNotification,
    TaskFailedNotification,
    LogMessageNotification,
    StatusUpdateNotification
} from '../ipc/IPCTypes';

export interface PythonProcessOptions {
    cwd?: string;
    env?: { [key: string]: string };
}

export class EnhancedPythonProcessManager {
    private pythonProcess: ChildProcess | null = null;
    private connectionManager: IPCConnectionManager;
    private isInitialized: boolean = false;
    private processStartTime: number = 0;
    private messageBuffer: string = '';
    private healthCheckInterval: NodeJS.Timeout | null = null;

    constructor(
        private configurationService: ConfigurationService,
        private loggingService: LoggingService
    ) {
        this.connectionManager = new IPCConnectionManager(loggingService);
        this.setupConnectionManagerEvents();
    }

    /**
     * 接続マネージャーのイベントを設定
     */
    private setupConnectionManagerEvents(): void {
        this.connectionManager.on('sendRequest', (request: IPCRequest) => {
            this.sendToProcess(request);
        });

        this.connectionManager.on('connectionStateChanged', (state: string) => {
            this.loggingService.info(`Python process connection state: ${state}`);
        });

        this.connectionManager.on('taskProgress', (notification: TaskProgressNotification) => {
            this.emit('taskProgress', notification);
        });

        this.connectionManager.on('taskCompleted', (notification: TaskCompletedNotification) => {
            this.emit('taskCompleted', notification);
        });

        this.connectionManager.on('taskFailed', (notification: TaskFailedNotification) => {
            this.emit('taskFailed', notification);
        });

        this.connectionManager.on('logMessage', (notification: LogMessageNotification) => {
            this.handleRemoteLogMessage(notification);
        });

        this.connectionManager.on('statusUpdate', (notification: StatusUpdateNotification) => {
            this.emit('statusUpdate', notification);
        });

        this.connectionManager.on('heartbeatFailed', () => {
            this.handleHeartbeatFailure();
        });

        this.connectionManager.on('reconnectAttempt', (attempt: number) => {
            this.loggingService.info(`Reconnection attempt ${attempt}`);
        });
    }

    /**
     * Pythonプロセスを初期化
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const pythonPath = this.configurationService.getPythonPath();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const pythonScriptPath = path.join(workspaceFolder.uri.fsPath, 'python', 'main.py');
        
        const options: PythonProcessOptions = {
            cwd: workspaceFolder.uri.fsPath,
            env: {
                ...process.env,
                PYTHONPATH: path.join(workspaceFolder.uri.fsPath, 'python'),
                PYTHONUNBUFFERED: '1'
            }
        };

        this.loggingService.info(`Starting Python process: ${pythonPath} ${pythonScriptPath}`);
        this.connectionManager.setConnectionState('connecting');

        try {
            this.pythonProcess = spawn(pythonPath, [pythonScriptPath], {
                cwd: options.cwd,
                env: options.env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.processStartTime = Date.now();
            this.setupProcessHandlers();
            this.isInitialized = true;
            
            // 初期化完了を待機
            await this.waitForInitialization();
            
            this.connectionManager.onConnected();
            this.loggingService.info('Python process initialized successfully');
            
        } catch (error) {
            this.connectionManager.setConnectionState('error');
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to initialize Python process: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * 初期化完了を待機
     */
    private async waitForInitialization(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Python process initialization timeout'));
            }, 30000);

            const checkInit = async () => {
                try {
                    await this.sendRequest(IPCMessageType.HEALTH_CHECK);
                    clearTimeout(timeout);
                    resolve();
                } catch (error) {
                    setTimeout(checkInit, 1000);
                }
            };

            setTimeout(checkInit, 2000); // 2秒後に確認開始
        });
    }

    /**
     * プロセスのイベントハンドラーを設定
     */
    private setupProcessHandlers(): void {
        if (!this.pythonProcess) {
            return;
        }

        // 標準出力からのメッセージを処理
        this.pythonProcess.stdout?.on('data', (data) => {
            this.handleProcessOutput(data.toString());
        });

        // 標準エラー出力を処理
        this.pythonProcess.stderr?.on('data', (data) => {
            const error = data.toString().trim();
            if (error) {
                this.loggingService.error(`Python process stderr: ${error}`);
            }
        });

        // プロセス終了を処理
        this.pythonProcess.on('close', (code, signal) => {
            const uptime = Date.now() - this.processStartTime;
            this.loggingService.info(`Python process exited: code=${code}, signal=${signal}, uptime=${uptime}ms`);
            
            this.isInitialized = false;
            this.pythonProcess = null;
            this.connectionManager.onDisconnected();
            
            // 異常終了の場合は再接続を試行
            if (code !== 0 && this.connectionManager.getConnectionState() !== 'error') {
                this.handleProcessCrash(code, signal);
            }
        });

        // プロセスエラーを処理
        this.pythonProcess.on('error', (error) => {
            this.loggingService.error(`Python process error: ${error.message}`);
            this.connectionManager.setConnectionState('error');
            this.isInitialized = false;
        });
    }

    /**
     * プロセス出力を処理
     */
    private handleProcessOutput(data: string): void {
        this.messageBuffer += data;
        
        // 行ごとに分割して処理
        const lines = this.messageBuffer.split('\n');
        this.messageBuffer = lines.pop() || ''; // 最後の（未完了の）行を保持
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                this.parseMessage(trimmedLine);
            }
        }
    }

    /**
     * メッセージを解析
     */
    private parseMessage(message: string): void {
        try {
            const parsed = JSON.parse(message);
            
            if (parsed.id) {
                // レスポンス
                this.connectionManager.handleResponse(parsed as IPCResponse);
            } else if (parsed.method) {
                // 通知
                this.connectionManager.handleNotification(parsed as IPCNotification);
            } else {
                this.loggingService.warn(`Unknown message format: ${message}`);
            }
        } catch (error) {
            this.loggingService.error(`Failed to parse message: ${message}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * プロセスにメッセージを送信
     */
    private sendToProcess(message: IPCRequest): void {
        if (!this.pythonProcess?.stdin) {
            throw new Error('Python process is not available');
        }

        const messageJson = JSON.stringify(message) + '\n';
        this.pythonProcess.stdin.write(messageJson);
        this.loggingService.debug(`Sent to Python process: ${message.method} (${message.id})`);
    }

    /**
     * リクエストを送信
     */
    async sendRequest(method: IPCMessageType, params: any = {}): Promise<any> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return await this.connectionManager.sendRequest(method, params);
    }

    /**
     * リモートログメッセージを処理
     */
    private handleRemoteLogMessage(notification: LogMessageNotification): void {
        const message = `[Python] ${notification.message}`;
        
        switch (notification.level) {
            case 'debug':
                this.loggingService.debug(message);
                break;
            case 'info':
                this.loggingService.info(message);
                break;
            case 'warning':
                this.loggingService.warn(message);
                break;
            case 'error':
                this.loggingService.error(message);
                break;
        }
    }

    /**
     * ハートビート失敗を処理
     */
    private handleHeartbeatFailure(): void {
        this.loggingService.warn('Heartbeat failed, attempting to restart Python process');
        this.restart();
    }

    /**
     * プロセスクラッシュを処理
     */
    private handleProcessCrash(code: number | null, signal: string | null): void {
        this.loggingService.error(`Python process crashed: code=${code}, signal=${signal}`);
        
        // 自動再起動を試行
        setTimeout(() => {
            this.connectionManager.attemptReconnect();
        }, 2000);
    }

    /**
     * プロセスを再起動
     */
    async restart(): Promise<void> {
        this.loggingService.info('Restarting Python process...');
        
        await this.dispose();
        this.connectionManager.resetConnection();
        
        try {
            await this.initialize();
            this.loggingService.info('Python process restarted successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to restart Python process: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * プロセスが実行中かどうかを確認
     */
    isRunning(): boolean {
        return this.isInitialized && this.pythonProcess !== null;
    }

    /**
     * 接続状態を取得
     */
    getConnectionState(): string {
        return this.connectionManager.getConnectionState();
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): any {
        const connectionStats = this.connectionManager.getStatistics();
        return {
            ...connectionStats,
            processId: this.pythonProcess?.pid,
            uptime: this.processStartTime > 0 ? Date.now() - this.processStartTime : 0,
            isRunning: this.isRunning()
        };
    }

    /**
     * イベントエミッター機能
     */
    private listeners: { [event: string]: Function[] } = {};

    on(event: string, listener: Function): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(listener);
    }

    off(event: string, listener: Function): void {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(l => l !== listener);
        }
    }

    private emit(event: string, ...args: any[]): void {
        if (this.listeners[event]) {
            this.listeners[event].forEach(listener => listener(...args));
        }
    }

    /**
     * プロセスを終了
     */
    async dispose(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (this.pythonProcess) {
            this.loggingService.info('Terminating Python process...');
            
            try {
                // グレースフルシャットダウンを試行
                await this.sendRequest(IPCMessageType.SHUTDOWN);
                
                // プロセスが終了するまで待機
                await new Promise<void>((resolve) => {
                    if (!this.pythonProcess) {
                        resolve();
                        return;
                    }
                    
                    const timeout = setTimeout(() => {
                        this.pythonProcess?.kill('SIGKILL');
                        resolve();
                    }, 5000);
                    
                    this.pythonProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            } catch (error) {
                this.loggingService.warn('Failed to shutdown gracefully, forcing termination');
                this.pythonProcess?.kill('SIGKILL');
            }
            
            this.pythonProcess = null;
            this.isInitialized = false;
        }

        this.connectionManager.dispose();
    }
}
