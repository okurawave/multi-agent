/**
 * PythonProcessManager
 * Pythonプロセスの管理を行うサービス
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { LoggingService } from './LoggingService';
import { ConfigurationService } from './ConfigurationService';

export interface PythonProcessOptions {
    cwd?: string;
    env?: { [key: string]: string };
}

export class PythonProcessManager {
    private pythonProcess: ChildProcess | null = null;
    private isInitialized: boolean = false;
    private requestCounter: number = 0;
    private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

    constructor(
        private configurationService: ConfigurationService,
        private loggingService: LoggingService
    ) {}

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
                PYTHONPATH: path.join(workspaceFolder.uri.fsPath, 'python')
            }
        };

        this.loggingService.info(`Starting Python process: ${pythonPath} ${pythonScriptPath}`);

        try {
            this.pythonProcess = spawn(pythonPath, [pythonScriptPath], {
                cwd: options.cwd,
                env: options.env,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.setupProcessHandlers();
            this.isInitialized = true;
            
            this.loggingService.info('Python process initialized successfully');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Failed to initialize Python process: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * プロセスのイベントハンドラーを設定
     */
    private setupProcessHandlers(): void {
        if (!this.pythonProcess) {
            return;
        }

        // 標準出力からの応答を処理
        this.pythonProcess.stdout?.on('data', (data) => {
            const response = data.toString().trim();
            if (response) {
                this.handleResponse(response);
            }
        });

        // 標準エラー出力を処理
        this.pythonProcess.stderr?.on('data', (data) => {
            const error = data.toString().trim();
            if (error) {
                this.loggingService.error(`Python process stderr: ${error}`);
            }
        });

        // プロセス終了を処理
        this.pythonProcess.on('close', (code) => {
            this.loggingService.info(`Python process exited with code ${code}`);
            this.isInitialized = false;
            this.pythonProcess = null;
            
            // 保留中のリクエストをエラーで終了
            this.pendingRequests.forEach((request, id) => {
                request.reject(new Error(`Python process terminated (code: ${code})`));
            });
            this.pendingRequests.clear();
        });

        // プロセスエラーを処理
        this.pythonProcess.on('error', (error) => {
            this.loggingService.error(`Python process error: ${error.message}`);
            this.isInitialized = false;
        });
    }

    /**
     * Pythonプロセスからの応答を処理
     */
    private handleResponse(response: string): void {
        try {
            const parsedResponse = JSON.parse(response);
            
            if (parsedResponse.id) {
                // レスポンスの場合
                const request = this.pendingRequests.get(parsedResponse.id);
                if (request) {
                    this.pendingRequests.delete(parsedResponse.id);
                    
                    if (parsedResponse.error) {
                        request.reject(new Error(parsedResponse.error));
                    } else {
                        request.resolve(parsedResponse.result);
                    }
                }
            } else {
                // 通知の場合
                this.handleNotification(parsedResponse);
            }
        } catch (error) {
            this.loggingService.error(`Failed to parse Python response: ${response}`);
        }
    }

    /**
     * Pythonプロセスからの通知を処理
     */
    private handleNotification(notification: any): void {
        this.loggingService.debug(`Received notification: ${JSON.stringify(notification)}`);
        
        // 通知の処理をここに実装
        // 例: 進捗更新、エラー通知など
    }

    /**
     * Pythonプロセスにリクエストを送信
     */
    async sendRequest(method: string, params: any = {}): Promise<any> {
        if (!this.isInitialized || !this.pythonProcess) {
            await this.initialize();
        }

        const requestId = `req-${++this.requestCounter}`;
        const request = {
            id: requestId,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            
            const requestJson = JSON.stringify(request) + '\n';
            this.pythonProcess?.stdin?.write(requestJson);
            
            this.loggingService.debug(`Sent request: ${method} (ID: ${requestId})`);
            
            // タイムアウトを設定
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 30000); // 30秒のタイムアウト
        });
    }

    /**
     * プロセスが実行中かどうかを確認
     */
    isRunning(): boolean {
        return this.isInitialized && this.pythonProcess !== null;
    }

    /**
     * プロセスを終了
     */
    async dispose(): Promise<void> {
        if (this.pythonProcess) {
            this.loggingService.info('Terminating Python process...');
            
            // グレースフルシャットダウンを試行
            this.pythonProcess.stdin?.end();
            
            // プロセスが終了するまで待機
            await new Promise<void>((resolve) => {
                if (!this.pythonProcess) {
                    resolve();
                    return;
                }
                
                const timeout = setTimeout(() => {
                    this.pythonProcess?.kill('SIGKILL');
                    resolve();
                }, 5000); // 5秒でタイムアウト
                
                this.pythonProcess.on('close', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
            
            this.pythonProcess = null;
            this.isInitialized = false;
        }
    }
}
