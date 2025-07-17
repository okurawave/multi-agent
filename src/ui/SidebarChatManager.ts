/**
 * SidebarChatManager
 * サイドバー内でチャット機能を提供するクラス
 */

import * as vscode from 'vscode';
import { LoggingService } from '../services/LoggingService';
import { CrewAIConnectProvider } from '../providers/CrewAIConnectProvider';
import { IPCService } from '../services/IPCService';

export interface ChatMessage {
    id: string;
    content: string;
    timestamp: Date;
    isUser: boolean;
    isTyping?: boolean;
    taskId?: string;
}

export class SidebarChatManager implements vscode.WebviewViewProvider {
    public static readonly viewType = 'crewai-connect.sidebar';
    private view?: vscode.WebviewView;
    private messages: ChatMessage[] = [];
    private messageCounter = 0;
    private selectedModel: string = 'auto';

    constructor(
        private context: vscode.ExtensionContext,
        private loggingService: LoggingService,
        private crewAIProvider: CrewAIConnectProvider,
        private ipcService: IPCService
    ) {}

    /**
     * WebviewViewProviderのresolveWebviewView実装
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this.getWebviewContent();
        this.setupMessageHandlers();

        // 初期化
        this.initializeChat();
    }

    /**
     * チャットを初期化
     */
    private async initializeChat(): Promise<void> {
        try {
            await this.updateAvailableModels();
            await this.checkAndNotifyAPIStatus();
        } catch (error) {
            this.loggingService.error(`Failed to initialize chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * メッセージハンドラーを設定
     */
    private setupMessageHandlers(): void {
        if (!this.view) {
            return;
        }

        this.view.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'userMessage':
                        await this.handleUserMessage(message.content);
                        break;
                    case 'clearChat':
                        await this.clearChat();
                        break;
                    case 'modelChanged':
                        await this.handleModelChange(message.model);
                        break;
                    case 'ready':
                        await this.refreshMessages();
                        await this.updateAvailableModels();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * ユーザーメッセージを処理
     */
    private async handleUserMessage(content: string): Promise<void> {
        if (!content.trim()) {
            return;
        }

        try {
            // ユーザーメッセージを追加
            const userMessage: ChatMessage = {
                id: this.generateMessageId(),
                content: content,
                timestamp: new Date(),
                isUser: true
            };

            await this.addMessage(userMessage);

            // AIの応答を生成
            await this.processUserRequest(content);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`Error handling user message: ${errorMessage}`);
            
            await this.addMessage({
                id: this.generateMessageId(),
                content: `Error: ${errorMessage}`,
                timestamp: new Date(),
                isUser: false
            });
        }
    }

    /**
     * ユーザーリクエストを処理
     */
    private async processUserRequest(content: string): Promise<void> {
        const lowerContent = content.toLowerCase();

        // ヘルプメッセージ
        if (lowerContent.includes('help')) {
            const helpMessage = `## CrewAI Connect Help

**Available Commands:**
- \`help\` - Show this help message
- \`clear\` - Clear the chat
- \`status\` - Show system status
- \`models\` - Show available models

**Usage:**
Just type your request in natural language. For example:
- "Create a Python web API"
- "Fix the error in my code"
- "Explain how to use React hooks"

**Features:**
- Model selection from dropdown
- Real-time AI assistance
- File and terminal operations
- Project structure analysis`;

            await this.addMessage({
                id: this.generateMessageId(),
                content: helpMessage,
                timestamp: new Date(),
                isUser: false
            });
            return;
        }

        // ステータス表示
        if (lowerContent.includes('status')) {
            const stats = this.crewAIProvider.getStatistics();
            const statusMessage = `## System Status

**Active Tasks:** ${stats.running}
**Completed Tasks:** ${stats.completed}
**Failed Tasks:** ${stats.failed}
**Total Tasks:** ${stats.total}
**Selected Model:** ${this.selectedModel}`;

            await this.addMessage({
                id: this.generateMessageId(),
                content: statusMessage,
                timestamp: new Date(),
                isUser: false
            });
            return;
        }

        // モデル情報表示
        if (lowerContent.includes('models')) {
            try {
                const models = await this.ipcService.getAvailableLLMModels();
                const modelInfo = await this.ipcService.getLLMModelInfo();
                
                let modelsMessage = `## Available Models\n\n`;
                modelInfo.forEach((info: any) => {
                    modelsMessage += `**${info.name}** (${info.vendor})\n`;
                    modelsMessage += `- Available: ${info.isAvailable ? 'Yes' : 'No'}\n`;
                    modelsMessage += `- Max Tokens: ${info.maxInputTokens.toLocaleString()}\n`;
                    modelsMessage += `- Capabilities: ${info.capabilities?.join(', ') || 'Unknown'}\n\n`;
                });

                await this.addMessage({
                    id: this.generateMessageId(),
                    content: modelsMessage,
                    timestamp: new Date(),
                    isUser: false
                });
                return;
            } catch (error) {
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `Failed to get model information: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    timestamp: new Date(),
                    isUser: false
                });
                return;
            }
        }

        // 一般的な質問の場合はLLMを使用
        try {
            const llmResponse = await this.ipcService.sendLLMRequest(content, {
                model: this.selectedModel === 'auto' ? undefined : this.selectedModel,
                systemPrompt: `You are CrewAI Connect, a helpful AI assistant integrated into VS Code. 
                You help developers with coding, project management, and technical questions.
                Be concise but helpful, and always provide actionable advice.
                Format your response with markdown for better readability.
                You are running inside a VS Code extension sidebar, so keep responses focused and practical.`,
                temperature: 0.7,
                maxTokens: 1000
            });

            await this.addMessage({
                id: this.generateMessageId(),
                content: llmResponse.content,
                timestamp: new Date(),
                isUser: false
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`LLM request failed: ${errorMessage}`);
            
            await this.addMessage({
                id: this.generateMessageId(),
                content: `I apologize, but I'm having trouble processing your request right now. Please try again or check the LLM API status.`,
                timestamp: new Date(),
                isUser: false
            });
        }
    }

    /**
     * モデル変更を処理
     */
    private async handleModelChange(model: string): Promise<void> {
        this.selectedModel = model;
        this.loggingService.info(`Selected model changed to: ${model}`);
    }

    /**
     * 利用可能なモデルをWebviewに送信
     */
    private async updateAvailableModels(): Promise<void> {
        try {
            const models = await this.ipcService.getAvailableLLMModels();
            const modelInfos = await this.ipcService.getLLMModelInfo();
            
            this.loggingService.info(`Updating available models: ${models.length} models, ${modelInfos.length} infos`);
            
            if (this.view) {
                this.view.webview.postMessage({
                    type: 'updateModels',
                    models: models,
                    modelInfos: modelInfos
                });
            }
            
            this.loggingService.info(`Updated available models: ${models.length} models found`);
        } catch (error) {
            this.loggingService.error(`Failed to update available models: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * APIステータスをチェックして通知
     */
    private async checkAndNotifyAPIStatus(): Promise<void> {
        try {
            const apiStatus = await this.ipcService.checkLLMAPIAvailability();
            
            if (!apiStatus.isAvailable) {
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `⚠️ **LLM API Status**: ${apiStatus.error}\n\n` +
                        `To use language models, please:\n` +
                        `1. Update VS Code to the latest version\n` +
                        `2. Install GitHub Copilot extension\n` +
                        `3. Sign in to your GitHub account\n\n` +
                        `Currently using fallback responses only.`,
                    timestamp: new Date(),
                    isUser: false
                });
            } else if (apiStatus.modelCount === 0) {
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `⚠️ **LLM API Status**: Connected but no models available\n\n` +
                        `Please check your language model access and try again.`,
                    timestamp: new Date(),
                    isUser: false
                });
            } else {
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `✅ **CrewAI Connect Ready**\n\n` +
                        `Connected with ${apiStatus.modelCount} models available.\n` +
                        `Type your request or \`help\` for assistance.`,
                    timestamp: new Date(),
                    isUser: false
                });
            }
        } catch (error) {
            this.loggingService.error(`Failed to check API status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * メッセージを追加
     */
    private async addMessage(message: ChatMessage): Promise<void> {
        this.messages.push(message);
        
        if (this.view) {
            this.view.webview.postMessage({
                type: 'addMessage',
                data: message
            });
        }
    }

    /**
     * チャットをクリア
     */
    private async clearChat(): Promise<void> {
        this.messages = [];
        
        if (this.view) {
            this.view.webview.postMessage({
                type: 'clearMessages'
            });
        }

        await this.checkAndNotifyAPIStatus();
    }

    /**
     * メッセージを更新
     */
    private async refreshMessages(): Promise<void> {
        if (this.view) {
            this.view.webview.postMessage({
                type: 'refreshMessages',
                data: this.messages
            });
        }
    }

    /**
     * メッセージIDを生成
     */
    private generateMessageId(): string {
        return `msg-${Date.now()}-${++this.messageCounter}`;
    }

    /**
     * WebviewのHTMLコンテンツを取得
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CrewAI Connect</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-header {
            background-color: var(--vscode-sideBarSectionHeader-background);
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        .chat-title {
            font-weight: bold;
            font-size: 13px;
            color: var(--vscode-sideBarSectionHeader-foreground);
        }

        .model-selector {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        }

        .model-selector select {
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 11px;
            cursor: pointer;
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .message {
            max-width: 100%;
            word-wrap: break-word;
            padding: 8px;
            border-radius: 6px;
            font-size: 12px;
            line-height: 1.4;
        }

        .message.user {
            background-color: var(--vscode-textLink-foreground);
            color: var(--vscode-editor-background);
            align-self: flex-end;
            margin-left: 20px;
        }

        .message.ai {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            align-self: flex-start;
            margin-right: 20px;
        }

        .message.system {
            background-color: var(--vscode-statusBar-background);
            color: var(--vscode-statusBar-foreground);
            align-self: center;
            font-size: 11px;
            padding: 4px 8px;
            margin: 2px 0;
        }

        .input-container {
            background-color: var(--vscode-input-background);
            border-top: 1px solid var(--vscode-input-border);
            padding: 8px;
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }

        .input-field {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 12px;
            resize: none;
            min-height: 20px;
            max-height: 80px;
        }

        .send-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            white-space: nowrap;
        }

        .send-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .actions {
            display: flex;
            gap: 4px;
            margin-top: 8px;
        }

        .action-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
        }

        .action-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .empty-state {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        /* Markdown styles */
        .message h1, .message h2, .message h3 {
            margin: 8px 0 4px 0;
            color: var(--vscode-textLink-foreground);
        }
        
        .message p {
            margin: 4px 0;
        }
        
        .message ul, .message ol {
            margin: 4px 0;
            padding-left: 16px;
        }
        
        .message code {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 1px 3px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
        }
        
        .message strong {
            font-weight: bold;
        }
        
        .message em {
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="chat-title">🤖 CrewAI Chat</div>
        <div class="model-selector">
            <select id="modelSelect" onchange="onModelChange()">
                <option value="auto">Auto</option>
            </select>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <p>Welcome to CrewAI Connect!</p>
            <p>Type your message below to get started.</p>
        </div>
    </div>

    <div class="input-container">
        <textarea 
            id="messageInput" 
            class="input-field" 
            placeholder="Type your message here..."
            rows="1"
        ></textarea>
        <button class="send-btn" onclick="sendMessage()" id="sendButton">Send</button>
    </div>

    <div class="actions">
        <button class="action-btn" onclick="clearChat()">Clear</button>
        <button class="action-btn" onclick="showHelp()">Help</button>
        <button class="action-btn" onclick="showStatus()">Status</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let messages = [];

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            vscode.postMessage({ type: 'ready' });
        });

        function setupEventListeners() {
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');

            messageInput.addEventListener('input', adjustTextareaHeight);
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });

            sendButton.addEventListener('click', sendMessage);
        }

        function adjustTextareaHeight() {
            const textarea = document.getElementById('messageInput');
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
        }

        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            
            if (message) {
                vscode.postMessage({
                    type: 'userMessage',
                    content: message
                });
                input.value = '';
                adjustTextareaHeight();
            }
        }

        function clearChat() {
            vscode.postMessage({ type: 'clearChat' });
        }

        function showHelp() {
            vscode.postMessage({
                type: 'userMessage',
                content: 'help'
            });
        }

        function showStatus() {
            vscode.postMessage({
                type: 'userMessage',
                content: 'status'
            });
        }

        function onModelChange() {
            const modelSelect = document.getElementById('modelSelect');
            const selectedModel = modelSelect.value;
            
            vscode.postMessage({
                type: 'modelChanged',
                model: selectedModel
            });
        }

        function formatMessageContent(content) {
            // Basic markdown-like formatting
            return content
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
                .replace(/\`(.+?)\`/g, '<code>$1</code>')
                .replace(/## (.+)/g, '<h2>$1</h2>')
                .replace(/\\n/g, '<br>');
        }

        function addMessage(message) {
            const container = document.getElementById('chatContainer');
            const emptyState = container.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${message.isUser ? 'user' : 'ai'}\`;
            messageDiv.innerHTML = formatMessageContent(message.content);

            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function clearMessages() {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '<div class="empty-state"><p>Chat cleared</p></div>';
        }

        function refreshMessages(messageList) {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '';
            
            if (messageList.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No messages yet</p></div>';
                return;
            }
            
            messageList.forEach(message => addMessage(message));
        }

        function updateAvailableModels(models, modelInfos) {
            console.log('Updating available models:', models, modelInfos);
            
            const modelSelect = document.getElementById('modelSelect');
            const currentValue = modelSelect.value;
            
            modelSelect.innerHTML = '';
            
            const autoOption = document.createElement('option');
            autoOption.value = 'auto';
            autoOption.textContent = 'Auto';
            modelSelect.appendChild(autoOption);
            
            if (modelInfos && modelInfos.length > 0) {
                console.log('Adding model infos:', modelInfos);
                const availableModels = modelInfos.filter(info => info.isAvailable);
                if (availableModels.length > 0) {
                    const availableGroup = document.createElement('optgroup');
                    availableGroup.label = 'Available';
                    
                    availableModels.forEach(info => {
                        const option = document.createElement('option');
                        option.value = info.id;
                        option.textContent = info.name;
                        option.title = info.description;
                        availableGroup.appendChild(option);
                    });
                    
                    modelSelect.appendChild(availableGroup);
                }
                
                const unavailableModels = modelInfos.filter(info => !info.isAvailable);
                if (unavailableModels.length > 0) {
                    const unavailableGroup = document.createElement('optgroup');
                    unavailableGroup.label = 'Unavailable';
                    
                    unavailableModels.forEach(info => {
                        const option = document.createElement('option');
                        option.value = info.id;
                        option.textContent = info.name + ' (Not Available)';
                        option.title = info.description;
                        option.disabled = true;
                        unavailableGroup.appendChild(option);
                    });
                    
                    modelSelect.appendChild(unavailableGroup);
                }
            } else {
                console.log('No model infos available, using models array:', models);
                // フォールバック: models配列を使用
                if (models && models.length > 0) {
                    models.forEach(model => {
                        if (model !== 'Auto Select') {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            modelSelect.appendChild(option);
                        }
                    });
                }
            }
            
            if (currentValue) {
                modelSelect.value = currentValue;
            }
            
            console.log('Model select updated, options:', modelSelect.options.length);
        }

        // Message handling from extension
        window.addEventListener('message', event => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'addMessage':
                    addMessage(data);
                    break;
                case 'clearMessages':
                    clearMessages();
                    break;
                case 'refreshMessages':
                    refreshMessages(data);
                    break;
                case 'updateModels':
                    updateAvailableModels(data.models || event.data.models, data.modelInfos || event.data.modelInfos);
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
