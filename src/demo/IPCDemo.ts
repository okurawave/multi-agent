/**
 * IPC Demo Script
 * TypeScript-Python間のIPC通信をテストするためのデモスクリプト
 */

import { IPCService } from '../services/IPCService';
import { LoggingService } from '../services/LoggingService';
import { ConfigurationService } from '../services/ConfigurationService';

export class IPCDemo {
    private ipcService: IPCService;

    constructor() {
        const loggingService = new LoggingService();
        const configService = new ConfigurationService();
        
        this.ipcService = new IPCService(loggingService, configService);
        
        // イベントリスナーの設定
        this.setupEventListeners();
    }

    /**
     * イベントリスナーの設定
     */
    private setupEventListeners(): void {
        this.ipcService.on('taskStarted', (taskInfo: any) => {
            console.log('Task started:', taskInfo);
        });

        this.ipcService.on('taskProgress', (progress: any) => {
            console.log('Task progress:', progress);
        });

        this.ipcService.on('taskCompleted', (taskInfo: any) => {
            console.log('Task completed:', taskInfo);
        });

        this.ipcService.on('taskFailed', (taskInfo: any) => {
            console.log('Task failed:', taskInfo);
        });

        this.ipcService.on('statusUpdate', (status: any) => {
            console.log('Status update:', status);
        });
    }

    /**
     * デモを実行
     */
    async runDemo(): Promise<void> {
        console.log('Starting IPC Demo...');

        try {
            // IPCサービスの初期化
            await this.ipcService.initialize();
            console.log('IPC Service initialized');

            // ヘルスチェック
            const isHealthy = await this.ipcService.healthCheck();
            console.log('Health check result:', isHealthy);

            // タスクの開始
            const taskId = await this.ipcService.startTask('Demo task: Create a simple Python script');
            console.log('Task started with ID:', taskId);

            // タスクの進捗を定期的に確認
            const progressInterval = setInterval(async () => {
                const status = await this.ipcService.getTaskStatus(taskId);
                console.log('Task status:', status);
                
                if (status && (status.status === 'completed' || status.status === 'failed')) {
                    clearInterval(progressInterval);
                }
            }, 2000);

            // 10秒後にタスクを停止（テスト用）
            setTimeout(async () => {
                try {
                    await this.ipcService.stopTask(taskId);
                    console.log('Task stopped');
                } catch (error) {
                    console.log('Task already completed or failed');
                }
                clearInterval(progressInterval);
            }, 10000);

            // LLMリクエストのテスト
            setTimeout(async () => {
                try {
                    const llmResult = await this.ipcService.sendLLMRequest(
                        'Hello, can you help me create a Python function?'
                    );
                    console.log('LLM result:', llmResult);
                } catch (error) {
                    console.log('LLM request failed:', error);
                }
            }, 5000);

            // ツールリクエストのテスト
            setTimeout(async () => {
                try {
                    const toolResult = await this.ipcService.sendToolRequest('file_create', {
                        filename: 'demo.py',
                        content: 'print("Hello from IPC demo!")'
                    });
                    console.log('Tool result:', toolResult);
                } catch (error) {
                    console.log('Tool request failed:', error);
                }
            }, 7000);

            // 統計情報の表示
            setTimeout(() => {
                const stats = this.ipcService.getStatistics();
                console.log('IPC Statistics:', stats);
            }, 15000);

        } catch (error) {
            console.error('Demo failed:', error);
        }
    }

    /**
     * リソースの解放
     */
    async cleanup(): Promise<void> {
        await this.ipcService.dispose();
        console.log('IPC Demo cleanup completed');
    }
}

// 使用例
export async function runIPCDemo(): Promise<void> {
    const demo = new IPCDemo();
    
    try {
        await demo.runDemo();
        
        // 20秒後にクリーンアップ
        setTimeout(async () => {
            await demo.cleanup();
        }, 20000);
        
    } catch (error) {
        console.error('Demo execution failed:', error);
        await demo.cleanup();
    }
}
