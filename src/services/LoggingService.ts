/**
 * LoggingService
 * 拡張機能のログ管理を行うサービス
 */

import * as vscode from 'vscode';

export class LoggingService {
    private outputChannel: vscode.OutputChannel;
    private logLevel: string;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CrewAI Connect');
        this.logLevel = vscode.workspace.getConfiguration('crewai-connect').get('logLevel', 'info');
    }

    /**
     * 情報レベルのログを出力
     */
    info(message: string): void {
        this.log('INFO', message);
    }

    /**
     * エラーレベルのログを出力
     */
    error(message: string): void {
        this.log('ERROR', message);
    }

    /**
     * デバッグレベルのログを出力
     */
    debug(message: string): void {
        if (this.logLevel === 'debug') {
            this.log('DEBUG', message);
        }
    }

    /**
     * 警告レベルのログを出力
     */
    warn(message: string): void {
        this.log('WARN', message);
    }

    /**
     * ログを出力
     */
    private log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        this.outputChannel.appendLine(logMessage);
        
        // コンソールにも出力
        console.log(logMessage);
    }

    /**
     * 出力チャンネルを表示
     */
    showOutputChannel(): void {
        this.outputChannel.show();
    }

    /**
     * ログレベルを更新
     */
    updateLogLevel(newLevel: string): void {
        this.logLevel = newLevel;
    }

    /**
     * リソースの解放
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}
