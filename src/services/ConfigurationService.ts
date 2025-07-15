/**
 * ConfigurationService
 * 拡張機能の設定管理を行うサービス
 */

import * as vscode from 'vscode';

export class ConfigurationService {
    private configuration: vscode.WorkspaceConfiguration;

    constructor() {
        this.configuration = vscode.workspace.getConfiguration('crewai-connect');
    }

    /**
     * 設定の再読み込み
     */
    reloadConfiguration(): void {
        this.configuration = vscode.workspace.getConfiguration('crewai-connect');
    }

    /**
     * Pythonパスを取得
     */
    getPythonPath(): string {
        return this.configuration.get('pythonPath', 'python');
    }

    /**
     * ログレベルを取得
     */
    getLogLevel(): string {
        return this.configuration.get('logLevel', 'info');
    }

    /**
     * 最大同時タスク数を取得
     */
    getMaxConcurrentTasks(): number {
        return this.configuration.get('maxConcurrentTasks', 3);
    }

    /**
     * 設定値を取得（汎用）
     */
    get<T>(key: string, defaultValue: T): T {
        return this.configuration.get(key, defaultValue);
    }

    /**
     * 設定値を更新
     */
    async update(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void> {
        await this.configuration.update(key, value, target);
    }

    /**
     * 設定の検証
     */
    validateConfiguration(): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        // Pythonパスの検証
        const pythonPath = this.getPythonPath();
        if (!pythonPath || pythonPath.trim() === '') {
            errors.push('Python path is not configured');
        }

        // ログレベルの検証
        const logLevel = this.getLogLevel();
        const validLogLevels = ['debug', 'info', 'warning', 'error'];
        if (!validLogLevels.includes(logLevel)) {
            errors.push(`Invalid log level: ${logLevel}`);
        }

        // 最大同時タスク数の検証
        const maxTasks = this.getMaxConcurrentTasks();
        if (maxTasks < 1 || maxTasks > 10) {
            errors.push(`Invalid maxConcurrentTasks: ${maxTasks} (must be between 1 and 10)`);
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}
