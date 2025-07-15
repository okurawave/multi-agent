/**
 * ChatWebviewManager
 * チャットWebviewの管理とメッセージ処理を行う
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

export class ChatWebviewManager {
    private panel: vscode.WebviewPanel | undefined;
    private messages: ChatMessage[] = [];
    private messageCounter = 0;

    constructor(
        private context: vscode.ExtensionContext,
        private loggingService: LoggingService,
        private crewAIProvider: CrewAIConnectProvider,
        private ipcService: IPCService
    ) {}

    /**
     * チャットパネルを表示
     */
    public async showChatPanel(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'crewai-chat',
            'CrewAI Connect Chat',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat-dark.svg')
        };

        this.panel.webview.html = this.getWebviewContent();
        this.setupMessageHandlers();

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // 初期歓迎メッセージ
        await this.addMessage({
            id: this.generateMessageId(),
            content: "👋 Welcome to CrewAI Connect! I'm your AI assistant. You can ask me to help with various development tasks. What would you like to work on today?",
            timestamp: new Date(),
            isUser: false
        });

        this.loggingService.info('Chat panel opened');
    }

    /**
     * メッセージハンドラーの設定
     */
    private setupMessageHandlers(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'userMessage':
                        await this.handleUserMessage(message.content);
                        break;
                    case 'clearChat':
                        await this.clearChat();
                        break;
                    case 'stopTask':
                        await this.stopCurrentTask(message.taskId);
                        break;
                    case 'ready':
                        // Webviewの準備完了通知
                        await this.refreshMessages();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    /**
     * ユーザーメッセージの処理
     */
    private async handleUserMessage(content: string): Promise<void> {
        // ユーザーメッセージを追加
        const userMessage: ChatMessage = {
            id: this.generateMessageId(),
            content,
            timestamp: new Date(),
            isUser: true
        };

        await this.addMessage(userMessage);

        // タイピング中のメッセージを表示
        const typingMessage: ChatMessage = {
            id: this.generateMessageId(),
            content: "Thinking...",
            timestamp: new Date(),
            isUser: false,
            isTyping: true
        };

        await this.addMessage(typingMessage);

        try {
            // AI処理を実行
            const response = await this.processUserRequest(content);
            
            // タイピング中のメッセージを削除
            await this.removeMessage(typingMessage.id);
            
            // AI応答を追加
            await this.addMessage({
                id: this.generateMessageId(),
                content: response.content,
                timestamp: new Date(),
                isUser: false,
                taskId: response.taskId
            });

        } catch (error) {
            // タイピング中のメッセージを削除
            await this.removeMessage(typingMessage.id);
            
            // エラーメッセージを追加
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            await this.addMessage({
                id: this.generateMessageId(),
                content: `❌ Error: ${errorMessage}`,
                timestamp: new Date(),
                isUser: false
            });

            this.loggingService.error(`Chat error: ${errorMessage}`);
        }
    }

    /**
     * ユーザーリクエストの処理
     */
    private async processUserRequest(content: string): Promise<{content: string; taskId?: string}> {
        // 簡単なキーワード検出とタスク開始
        const normalizedContent = content.toLowerCase();
        
        if (normalizedContent.includes('create') || normalizedContent.includes('build') || 
            normalizedContent.includes('generate') || normalizedContent.includes('make')) {
            
            // タスクを開始
            const taskId = await this.crewAIProvider.startTask(content);
            
            return {
                content: `🚀 Great! I've started a new task for you: "${content}"\n\n**Task ID:** ${taskId}\n\nI'll work on this in the background. You can monitor the progress in the sidebar panel. I'll let you know when it's completed!`,
                taskId
            };
        }
        
        if (normalizedContent.includes('help') || normalizedContent.includes('what can you do')) {
            return {
                content: `🤖 I'm CrewAI Connect, your AI development assistant! Here's what I can help you with:

**🔧 Development Tasks:**
- Create new files and projects
- Generate code snippets
- Write documentation
- Create test files
- Refactor existing code

**📊 Project Management:**
- Analyze project structure
- Suggest improvements
- Create task plans
- Monitor progress

**💡 Examples:**
- "Create a simple Python web API"
- "Generate a React component for user authentication"
- "Write unit tests for my functions"
- "Create a README file for this project"

Just describe what you'd like to work on, and I'll get started!`
            };
        }

        if (normalizedContent.includes('status') || normalizedContent.includes('progress')) {
            const stats = this.crewAIProvider.getStatistics();
            return {
                content: `📊 **Current Status:**

- **Running Tasks:** ${stats.running}
- **Completed:** ${stats.completed}
- **Total:** ${stats.total}

${stats.running > 0 ? 'I have tasks running in the background. Check the sidebar for more details!' : 'No tasks currently running. What would you like me to work on?'}`
            };
        }

        // デフォルトの応答
        return {
            content: `I understand you want me to: "${content}"

Let me start working on this task for you. I'll analyze your request and begin implementation.`
        };
    }

    /**
     * メッセージを追加
     */
    private async addMessage(message: ChatMessage): Promise<void> {
        this.messages.push(message);
        await this.sendMessageToWebview('addMessage', message);
    }

    /**
     * メッセージを削除
     */
    private async removeMessage(messageId: string): Promise<void> {
        this.messages = this.messages.filter(msg => msg.id !== messageId);
        await this.sendMessageToWebview('removeMessage', { id: messageId });
    }

    /**
     * チャットをクリア
     */
    private async clearChat(): Promise<void> {
        this.messages = [];
        await this.sendMessageToWebview('clearMessages', {});
        
        // 歓迎メッセージを再度表示
        await this.addMessage({
            id: this.generateMessageId(),
            content: "Chat cleared! How can I help you today?",
            timestamp: new Date(),
            isUser: false
        });
    }

    /**
     * タスクを停止
     */
    private async stopCurrentTask(taskId: string): Promise<void> {
        if (taskId) {
            try {
                await this.crewAIProvider.stopTask(taskId);
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `⏹️ Task ${taskId} has been stopped.`,
                    timestamp: new Date(),
                    isUser: false
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await this.addMessage({
                    id: this.generateMessageId(),
                    content: `❌ Failed to stop task: ${errorMessage}`,
                    timestamp: new Date(),
                    isUser: false
                });
            }
        }
    }

    /**
     * メッセージを更新
     */
    private async refreshMessages(): Promise<void> {
        await this.sendMessageToWebview('refreshMessages', { messages: this.messages });
    }

    /**
     * Webviewにメッセージを送信
     */
    private async sendMessageToWebview(type: string, data: any): Promise<void> {
        if (this.panel) {
            await this.panel.webview.postMessage({ type, data });
        }
    }

    /**
     * メッセージIDを生成
     */
    private generateMessageId(): string {
        return `msg-${++this.messageCounter}-${Date.now()}`;
    }

    /**
     * WebviewのHTMLコンテンツを取得
     */
    private getWebviewContent(): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CrewAI Connect Chat</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .chat-header {
            background-color: var(--vscode-panel-background);
            padding: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .chat-title {
            font-weight: bold;
            font-size: 16px;
            color: var(--vscode-textLink-foreground);
        }

        .chat-controls {
            display: flex;
            gap: 10px;
        }

        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 12px;
            word-wrap: break-word;
            position: relative;
        }

        .message.user {
            align-self: flex-end;
            background-color: var(--vscode-textLink-foreground);
            color: var(--vscode-editor-background);
        }

        .message.ai {
            align-self: flex-start;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
        }

        .message.typing {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            font-style: italic;
        }

        .message-content {
            line-height: 1.5;
        }

        .message-meta {
            font-size: 11px;
            opacity: 0.7;
            margin-top: 5px;
        }

        .message-actions {
            margin-top: 8px;
            display: flex;
            gap: 8px;
        }

        .message-actions .btn {
            font-size: 10px;
            padding: 4px 8px;
        }

        .input-container {
            padding: 20px;
            background-color: var(--vscode-panel-background);
            border-top: 1px solid var(--vscode-panel-border);
        }

        .input-box {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }

        .input-field {
            flex: 1;
            min-height: 40px;
            max-height: 120px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: vertical;
        }

        .input-field:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .send-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
        }

        .send-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .send-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .typing-indicator {
            display: inline-block;
            margin-left: 5px;
        }

        .typing-indicator::after {
            content: '●●●';
            animation: typing 1.5s infinite;
        }

        @keyframes typing {
            0%, 60% { opacity: 1; }
            30% { opacity: 0.5; }
        }

        .task-badge {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            margin-left: 8px;
        }

        /* Markdown-like styling */
        .message-content pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 8px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 8px 0;
        }

        .message-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
        }

        .message-content strong {
            font-weight: bold;
        }

        .message-content em {
            font-style: italic;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state h3 {
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
    </style>
</head>
<body>
    <div class="chat-header">
        <div class="chat-title">🤖 CrewAI Connect Chat</div>
        <div class="chat-controls">
            <button class="btn secondary" onclick="clearChat()">Clear Chat</button>
            <button class="btn secondary" onclick="showHelp()">Help</button>
        </div>
    </div>

    <div class="chat-container" id="chatContainer">
        <div class="empty-state">
            <h3>Welcome to CrewAI Connect!</h3>
            <p>Start a conversation with your AI assistant.</p>
        </div>
    </div>

    <div class="input-container">
        <div class="input-box">
            <textarea 
                id="messageInput" 
                class="input-field" 
                placeholder="Type your message here... (e.g., 'Create a simple Python web API')"
                rows="1"
            ></textarea>
            <button class="send-btn" onclick="sendMessage()" id="sendButton">Send</button>
        </div>
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
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
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

        function stopTask(taskId) {
            vscode.postMessage({
                type: 'stopTask',
                taskId: taskId
            });
        }

        function formatMessageContent(content) {
            // Basic markdown-like formatting
            return content
                .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
                .replace(/\`(.+?)\`/g, '<code>$1</code>')
                .replace(/\\n/g, '<br>');
        }

        function addMessage(message) {
            const container = document.getElementById('chatContainer');
            const emptyState = container.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }

            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${message.isUser ? 'user' : 'ai'}\${message.isTyping ? ' typing' : ''}\`;
            messageDiv.id = \`message-\${message.id}\`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.innerHTML = formatMessageContent(message.content);

            if (message.isTyping) {
                const typingIndicator = document.createElement('span');
                typingIndicator.className = 'typing-indicator';
                contentDiv.appendChild(typingIndicator);
            }

            messageDiv.appendChild(contentDiv);

            const metaDiv = document.createElement('div');
            metaDiv.className = 'message-meta';
            metaDiv.textContent = new Date(message.timestamp).toLocaleTimeString();
            
            if (message.taskId) {
                const badge = document.createElement('span');
                badge.className = 'task-badge';
                badge.textContent = message.taskId;
                metaDiv.appendChild(badge);
            }

            messageDiv.appendChild(metaDiv);

            // Add actions for AI messages with tasks
            if (!message.isUser && message.taskId) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                
                const stopBtn = document.createElement('button');
                stopBtn.className = 'btn secondary';
                stopBtn.textContent = 'Stop Task';
                stopBtn.onclick = () => stopTask(message.taskId);
                
                actionsDiv.appendChild(stopBtn);
                messageDiv.appendChild(actionsDiv);
            }

            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }

        function removeMessage(messageId) {
            const messageElement = document.getElementById(\`message-\${messageId}\`);
            if (messageElement) {
                messageElement.remove();
            }
        }

        function clearMessages() {
            const container = document.getElementById('chatContainer');
            container.innerHTML = '';
        }

        function refreshMessages(messageList) {
            clearMessages();
            messageList.forEach(message => addMessage(message));
        }

        // Message handling from VS Code
        window.addEventListener('message', event => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'addMessage':
                    addMessage(data);
                    break;
                case 'removeMessage':
                    removeMessage(data.id);
                    break;
                case 'clearMessages':
                    clearMessages();
                    break;
                case 'refreshMessages':
                    refreshMessages(data.messages);
                    break;
            }
        });
    </script>
</body>
</html>
        `;
    }

    /**
     * リソースの解放
     */
    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}
