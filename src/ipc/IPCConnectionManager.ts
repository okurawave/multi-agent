/**
 * IPCConnectionManager
 * IPC通信の接続管理と高度な機能を提供
 */

import { EventEmitter } from 'events';
import { 
    IPCRequest, 
    IPCResponse, 
    IPCNotification, 
    IPCMessageType,
    TaskProgressNotification,
    TaskCompletedNotification,
    TaskFailedNotification,
    LogMessageNotification,
    StatusUpdateNotification
} from './IPCTypes';
import { LoggingService } from '../services/LoggingService';

export class IPCConnectionManager extends EventEmitter {
    private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 1000;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private lastHeartbeat: number = 0;
    private pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

    constructor(
        private loggingService: LoggingService,
        private requestTimeout: number = 30000
    ) {
        super();
    }

    /**
     * 接続状態を設定
     */
    setConnectionState(state: 'disconnected' | 'connecting' | 'connected' | 'error'): void {
        const oldState = this.connectionState;
        this.connectionState = state;
        
        if (oldState !== state) {
            this.emit('connectionStateChanged', state);
            this.loggingService.info(`IPC Connection state changed: ${oldState} -> ${state}`);
        }
    }

    /**
     * 接続状態を取得
     */
    getConnectionState(): string {
        return this.connectionState;
    }

    /**
     * リクエストを送信
     */
    async sendRequest(method: IPCMessageType, params: any = {}): Promise<any> {
        if (this.connectionState !== 'connected') {
            throw new Error(`Cannot send request: connection is ${this.connectionState}`);
        }

        const requestId = this.generateRequestId();
        const request: IPCRequest = {
            id: requestId,
            method,
            params,
            timestamp: Date.now()
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${method} (${requestId})`));
            }, this.requestTimeout);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            
            this.emit('sendRequest', request);
            this.loggingService.debug(`Sent IPC request: ${method} (ID: ${requestId})`);
        });
    }

    /**
     * レスポンスを処理
     */
    handleResponse(response: IPCResponse): void {
        const pendingRequest = this.pendingRequests.get(response.id);
        if (pendingRequest) {
            clearTimeout(pendingRequest.timeout);
            this.pendingRequests.delete(response.id);
            
            if (response.error) {
                pendingRequest.reject(new Error(response.error));
            } else {
                pendingRequest.resolve(response.result);
            }
        } else {
            this.loggingService.warn(`Received response for unknown request: ${response.id}`);
        }
    }

    /**
     * 通知を処理
     */
    handleNotification(notification: IPCNotification): void {
        this.loggingService.debug(`Received IPC notification: ${notification.method}`);
        
        switch (notification.method) {
            case IPCMessageType.TASK_PROGRESS:
                this.emit('taskProgress', notification.params as TaskProgressNotification);
                break;
            case IPCMessageType.TASK_COMPLETED:
                this.emit('taskCompleted', notification.params as TaskCompletedNotification);
                break;
            case IPCMessageType.TASK_FAILED:
                this.emit('taskFailed', notification.params as TaskFailedNotification);
                break;
            case IPCMessageType.LOG_MESSAGE:
                this.emit('logMessage', notification.params as LogMessageNotification);
                break;
            case IPCMessageType.STATUS_UPDATE:
                this.emit('statusUpdate', notification.params as StatusUpdateNotification);
                break;
            default:
                this.loggingService.warn(`Unknown notification type: ${notification.method}`);
        }
    }

    /**
     * ハートビートを開始
     */
    startHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(async () => {
            if (this.connectionState === 'connected') {
                try {
                    await this.sendRequest(IPCMessageType.HEALTH_CHECK);
                    this.lastHeartbeat = Date.now();
                } catch (error) {
                    this.loggingService.error(`Heartbeat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    this.setConnectionState('error');
                    this.emit('heartbeatFailed');
                }
            }
        }, 10000); // 10秒間隔
    }

    /**
     * ハートビートを停止
     */
    stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * 再接続を試行
     */
    async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.loggingService.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
            this.setConnectionState('error');
            return;
        }

        this.reconnectAttempts++;
        this.setConnectionState('connecting');
        
        this.loggingService.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        try {
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
            this.emit('reconnectAttempt', this.reconnectAttempts);
            
            // 再接続の遅延を指数バックオフで増加
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
            
        } catch (error) {
            this.loggingService.error(`Reconnection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setTimeout(() => this.attemptReconnect(), this.reconnectDelay);
        }
    }

    /**
     * 接続をリセット
     */
    resetConnection(): void {
        this.setConnectionState('disconnected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.stopHeartbeat();
        
        // 保留中のリクエストをすべてキャンセル
        this.pendingRequests.forEach((request, id) => {
            clearTimeout(request.timeout);
            request.reject(new Error('Connection reset'));
        });
        this.pendingRequests.clear();
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): {
        connectionState: string;
        reconnectAttempts: number;
        pendingRequests: number;
        lastHeartbeat: number;
    } {
        return {
            connectionState: this.connectionState,
            reconnectAttempts: this.reconnectAttempts,
            pendingRequests: this.pendingRequests.size,
            lastHeartbeat: this.lastHeartbeat
        };
    }

    /**
     * リクエストIDを生成
     */
    private generateRequestId(): string {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 接続が成功したときの処理
     */
    onConnected(): void {
        this.setConnectionState('connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.lastHeartbeat = Date.now();
        this.startHeartbeat();
        this.emit('connected');
    }

    /**
     * 接続が失敗したときの処理
     */
    onDisconnected(): void {
        this.setConnectionState('disconnected');
        this.stopHeartbeat();
        this.emit('disconnected');
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        this.stopHeartbeat();
        this.resetConnection();
        this.removeAllListeners();
    }
}
