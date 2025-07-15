import * as vscode from 'vscode';
import { CrewAIConnectProvider } from './providers/CrewAIConnectProvider';
import { IPCService } from './services/IPCService';
import { LoggingService } from './services/LoggingService';
import { ConfigurationService } from './services/ConfigurationService';
import { SidebarUIManager } from './ui/SidebarUIManager';

let crewAIProvider: CrewAIConnectProvider;
let ipcService: IPCService;
let loggingService: LoggingService;
let configurationService: ConfigurationService;
let sidebarUIManager: SidebarUIManager;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // ログサービスの初期化
        loggingService = new LoggingService();
        loggingService.info('CrewAI Connect extension is activating...');

        // 設定サービスの初期化
        configurationService = new ConfigurationService();

        // IPCサービスの初期化
        ipcService = new IPCService(loggingService, configurationService);

        // CrewAIプロバイダーの初期化
        crewAIProvider = new CrewAIConnectProvider(
            context,
            ipcService,
            loggingService,
            configurationService
        );

        // サイドバーUIマネージャーの初期化
        sidebarUIManager = new SidebarUIManager(
            context,
            crewAIProvider,
            loggingService,
            configurationService
        );

        // サイドバープロバイダーの登録
        vscode.window.registerTreeDataProvider('crewai-connect.sidebar', crewAIProvider);

        // コマンドの登録
        registerCommands(context);

        // 拡張機能のアクティベーション完了
        loggingService.info('CrewAI Connect extension activated successfully!');
        
        // 歓迎メッセージを表示
        vscode.window.showInformationMessage('CrewAI Connect is now active! Click the robot icon in the Activity Bar to get started.');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        loggingService.error(`Failed to activate CrewAI Connect: ${errorMessage}`);
        vscode.window.showErrorMessage(`Failed to activate CrewAI Connect: ${errorMessage}`);
    }
}

function registerCommands(context: vscode.ExtensionContext) {
    // Start New Task コマンド
    const openChatCommand = vscode.commands.registerCommand('crewai-connect.openChat', async () => {
        try {
            loggingService.info('Opening CrewAI chat interface...');
            await crewAIProvider.openChatInterface();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            loggingService.error(`Failed to open chat interface: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to open chat interface: ${errorMessage}`);
        }
    });

    // Stop All Tasks コマンド
    const stopAllTasksCommand = vscode.commands.registerCommand('crewai-connect.stopAllTasks', async () => {
        try {
            loggingService.info('Stopping all CrewAI tasks...');
            await crewAIProvider.stopAllTasks();
            vscode.window.showInformationMessage('All CrewAI tasks have been stopped.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            loggingService.error(`Failed to stop tasks: ${errorMessage}`);
            vscode.window.showErrorMessage(`Failed to stop tasks: ${errorMessage}`);
        }
    });

    // Refresh サイドバー コマンド
    const refreshCommand = vscode.commands.registerCommand('crewai-connect.refresh', () => {
        loggingService.info('Refreshing CrewAI sidebar...');
        crewAIProvider.refresh();
    });

    // Show Output コマンド
    const showOutputCommand = vscode.commands.registerCommand('crewai-connect.showOutput', () => {
        loggingService.showOutputChannel();
    });

    // 設定を開く コマンド
    const openSettingsCommand = vscode.commands.registerCommand('crewai-connect.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'crewai-connect');
    });

    // コマンドをコンテキストに追加
    context.subscriptions.push(
        openChatCommand,
        stopAllTasksCommand,
        refreshCommand,
        showOutputCommand,
        openSettingsCommand
    );

    // 設定変更の監視
    const configurationChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('crewai-connect')) {
            loggingService.info('CrewAI Connect configuration changed');
            configurationService.reloadConfiguration();
        }
    });

    context.subscriptions.push(configurationChangeListener);
}

export async function deactivate() {
    try {
        loggingService?.info('CrewAI Connect extension is deactivating...');
        
        // すべてのタスクを停止
        if (crewAIProvider) {
            await crewAIProvider.stopAllTasks();
            crewAIProvider.dispose();
        }
        
        // IPCサービスを終了
        if (ipcService) {
            await ipcService.dispose();
        }

        // サイドバーUIマネージャーを終了
        if (sidebarUIManager) {
            sidebarUIManager.dispose();
        }
        
        loggingService?.info('CrewAI Connect extension deactivated successfully');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        loggingService?.error(`Error during deactivation: ${errorMessage}`);
    }
}
