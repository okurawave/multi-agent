/**
 * LLMAPIWrapper
 * VS Code Language Model APIを使用したLLMとの通信ラッパー
 */

import * as vscode from 'vscode';
import { LoggingService } from './LoggingService';
import { ModelSelectionManager, ModelInfo } from './ModelSelectionManager';

export interface LLMRequest {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    context?: string[];
    userId?: string;
}

export interface LLMResponse {
    content: string;
    model: string;
    tokensUsed?: number;
    finishReason?: string;
    error?: string;
}

export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    retryCount?: number;
    retryDelay?: number;
}

export class LLMAPIWrapper {
    private defaultOptions: LLMOptions = {
        temperature: 0.7,
        maxTokens: 2000,
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000
    };

    private modelSelectionManager: ModelSelectionManager;

    constructor(private loggingService: LoggingService) {
        this.modelSelectionManager = new ModelSelectionManager(loggingService);
    }

    /**
     * LLMリクエストを送信
     */
    async sendRequest(request: LLMRequest, options?: LLMOptions): Promise<LLMResponse> {
        const mergedOptions = { ...this.defaultOptions, ...options };
        
        this.loggingService.debug(`LLM request: ${request.prompt.substring(0, 100)}...`);
        
        for (let attempt = 1; attempt <= mergedOptions.retryCount!; attempt++) {
            try {
                const response = await this.makeRequest(request, mergedOptions);
                
                this.loggingService.debug(`LLM response: ${response.content.substring(0, 100)}...`);
                return response;
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                this.loggingService.warn(`LLM request failed (attempt ${attempt}/${mergedOptions.retryCount}): ${errorMessage}`);
                
                if (attempt === mergedOptions.retryCount) {
                    this.loggingService.error(`LLM request failed after ${mergedOptions.retryCount} attempts`);
                    throw error;
                }
                
                // 再試行前に遅延
                await new Promise(resolve => setTimeout(resolve, mergedOptions.retryDelay! * attempt));
            }
        }
        
        throw new Error('LLM request failed after all retry attempts');
    }

    /**
     * 実際のLLMリクエストを実行
     */
    private async makeRequest(request: LLMRequest, options: LLMOptions): Promise<LLMResponse> {
        try {
            // VS Code Language Model APIの使用を試行
            const models = await vscode.lm.selectChatModels();
            
            if (models.length === 0) {
                throw new Error('No language models available');
            }
            
            // モデルを選択（指定されたモデルまたは最初の利用可能なモデル）
            const selectedModel = this.selectModel(models, request.model);
            
            // チャットリクエストを構築
            const messages = this.buildChatRequest(request);
            
            // VS Code Language Model APIを使用してリクエストを送信
            const response = await selectedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
            
            // レスポンスを処理
            return await this.processResponse(response, selectedModel);
            
        } catch (error) {
            // VS Code Language Model APIが利用できない場合のフォールバック
            return await this.fallbackRequest(request, options);
        }
    }

    /**
     * モデルを選択
     */
    private selectModel(models: readonly vscode.LanguageModelChat[], preferredModel?: string): vscode.LanguageModelChat {
        if (preferredModel && preferredModel !== 'auto' && preferredModel !== 'Auto Select') {
            // 名前、ID、またはベンダーで検索
            const preferred = models.find(m => 
                m.id.toLowerCase().includes(preferredModel.toLowerCase()) ||
                m.name.toLowerCase().includes(preferredModel.toLowerCase()) ||
                m.vendor.toLowerCase().includes(preferredModel.toLowerCase()) ||
                this.formatVSCodeModelName(m).toLowerCase().includes(preferredModel.toLowerCase())
            );
            
            if (preferred) {
                this.loggingService.info(`Selected preferred model: ${this.formatVSCodeModelName(preferred)}`);
                return preferred;
            }
        }
        
        // 自動選択の場合は品質順に選択
        const modelPriority = [
            // GPT-4系を最優先
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gpt-4') && !m.name.toLowerCase().includes('preview'),
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gpt-4'),
            // Claude系
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('claude') && m.name.toLowerCase().includes('sonnet'),
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('claude'),
            // Gemini系
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gemini') && m.name.toLowerCase().includes('pro'),
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gemini'),
            // GPT-3.5系
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gpt-3.5') && m.name.toLowerCase().includes('turbo'),
            (m: vscode.LanguageModelChat) => m.name.toLowerCase().includes('gpt-3.5'),
            // その他のOpenAIモデル
            (m: vscode.LanguageModelChat) => m.vendor.toLowerCase().includes('openai'),
            // その他のAnthropic
            (m: vscode.LanguageModelChat) => m.vendor.toLowerCase().includes('anthropic'),
            // その他のGoogle
            (m: vscode.LanguageModelChat) => m.vendor.toLowerCase().includes('google'),
            // 大きなコンテキスト窓を持つモデル
            (m: vscode.LanguageModelChat) => m.maxInputTokens > 16000,
            (m: vscode.LanguageModelChat) => m.maxInputTokens > 8000,
            // 最後の手段：最初のモデル
            () => true
        ];
        
        for (const priority of modelPriority) {
            const selectedModel = models.find(priority);
            if (selectedModel) {
                this.loggingService.info(`Auto-selected model: ${this.formatVSCodeModelName(selectedModel)}`);
                return selectedModel;
            }
        }
        
        // フォールバック：最初のモデル
        const fallbackModel = models[0];
        this.loggingService.info(`Fallback to first available model: ${this.formatVSCodeModelName(fallbackModel)}`);
        return fallbackModel;
    }

    /**
     * チャットリクエストを構築
     */
    private buildChatRequest(request: LLMRequest): vscode.LanguageModelChatMessage[] {
        const messages: vscode.LanguageModelChatMessage[] = [];
        
        // システムプロンプトを追加
        if (request.systemPrompt) {
            messages.push(vscode.LanguageModelChatMessage.User(request.systemPrompt));
        }
        
        // コンテキストを追加
        if (request.context && request.context.length > 0) {
            const contextMessage = `Context:\n${request.context.join('\n\n')}`;
            messages.push(vscode.LanguageModelChatMessage.User(contextMessage));
        }
        
        // メインプロンプトを追加
        messages.push(vscode.LanguageModelChatMessage.User(request.prompt));
        
        return messages;
    }

    /**
     * レスポンスを処理
     */
    private async processResponse(
        response: vscode.LanguageModelChatResponse, 
        model: vscode.LanguageModelChat
    ): Promise<LLMResponse> {
        let content = '';
        
        // ストリーミングレスポンスを処理
        for await (const chunk of response.text) {
            content += chunk;
        }
        
        return {
            content: content.trim(),
            model: model.name,
            tokensUsed: content.length, // 実際のトークン数の推定
            finishReason: 'stop'
        };
    }

    /**
     * フォールバック処理（VS Code Language Model APIが利用できない場合）
     */
    private async fallbackRequest(request: LLMRequest, options: LLMOptions): Promise<LLMResponse> {
        this.loggingService.warn('VS Code Language Model API not available, using fallback');
        
        // モック応答を返す（実際の実装では外部APIを使用）
        await new Promise(resolve => setTimeout(resolve, 1000)); // 遅延をシミュレート
        
        const mockResponse = this.generateMockResponse(request);
        
        return {
            content: mockResponse,
            model: 'fallback-model',
            tokensUsed: Math.floor(mockResponse.length / 4), // 大まかなトークン数の推定
            finishReason: 'stop'
        };
    }

    /**
     * モック応答を生成
     */
    private generateMockResponse(request: LLMRequest): string {
        const prompt = request.prompt.toLowerCase();
        
        if (prompt.includes('create') || prompt.includes('generate')) {
            return `I'll help you create what you need. Based on your request: "${request.prompt.substring(0, 100)}...", I would suggest starting with a structured approach and implementing it step by step.`;
        }
        
        if (prompt.includes('explain') || prompt.includes('how')) {
            return `Let me explain this for you. Regarding your question: "${request.prompt.substring(0, 100)}...", here's a comprehensive explanation with examples and best practices.`;
        }
        
        if (prompt.includes('fix') || prompt.includes('debug') || prompt.includes('error')) {
            return `I can help you fix this issue. Looking at your problem: "${request.prompt.substring(0, 100)}...", here are the steps to resolve it along with preventive measures.`;
        }
        
        if (prompt.includes('review') || prompt.includes('improve')) {
            return `I've reviewed your request: "${request.prompt.substring(0, 100)}...". Here are my suggestions for improvement and optimization.`;
        }
        
        return `Thank you for your request: "${request.prompt.substring(0, 100)}...". I'll help you with this task and provide a detailed response with actionable steps.`;
    }

    /**
     * 利用可能なモデルを取得
     */
    async getAvailableModels(): Promise<string[]> {
        try {
            await this.modelSelectionManager.updateAvailableModels();
            const models = this.modelSelectionManager.getAllModels();
            
            const modelNames = ['Auto Select', ...models.map(m => this.formatModelName(m))];
            
            this.loggingService.info(`Available models: ${modelNames.join(', ')}`);
            return modelNames;
            
        } catch (error) {
            this.loggingService.error(`Failed to get available models: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return ['Auto Select', 'Fallback Model (Mock)'];
        }
    }

    /**
     * モデル名をフォーマット（ModelInfoを使用）
     */
    private formatModelName(model: ModelInfo): string {
        const name = model.name;
        const vendor = model.vendor;
        const status = model.isAvailable ? '' : ' (Not Available)';
        const maxTokens = model.maxInputTokens ? ` (${model.maxInputTokens.toLocaleString()} tokens)` : '';
        
        return `${name} (${vendor})${maxTokens}${status}`;
    }

    /**
     * モデル名をフォーマット（VS Code APIモデルを使用）
     */
    private formatVSCodeModelName(model: vscode.LanguageModelChat): string {
        const name = model.name || model.id;
        const vendor = model.vendor || 'Unknown';
        const maxTokens = model.maxInputTokens ? ` (${model.maxInputTokens.toLocaleString()} tokens)` : '';
        
        return `${name} (${vendor})${maxTokens}`;
    }

    /**
     * モデルの詳細情報を取得
     */
    async getModelInfo(modelId?: string): Promise<ModelInfo[]> {
        try {
            await this.modelSelectionManager.updateAvailableModels();
            
            if (modelId) {
                const model = this.modelSelectionManager.getModelInfo(modelId);
                return model ? [model] : [];
            }
            
            return this.modelSelectionManager.getAllModels();
            
        } catch (error) {
            this.loggingService.error(`Failed to get model info: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // フォールバック用のモデル情報
            return [
                {
                    id: 'fallback',
                    name: 'Fallback Model',
                    vendor: 'Mock',
                    maxInputTokens: 4000,
                    isAvailable: false,
                    description: 'Mock model for testing purposes',
                    capabilities: ['text-generation', 'conversation']
                }
            ];
        }
    }

    /**
     * プロンプトを最適化
     */
    optimizePrompt(prompt: string, maxTokens: number = 2000): string {
        // 基本的なプロンプト最適化
        let optimized = prompt.trim();
        
        // 長すぎる場合は省略
        const estimatedTokens = optimized.length / 4; // 大まかな推定
        if (estimatedTokens > maxTokens * 0.8) {
            const maxChars = Math.floor(maxTokens * 0.8 * 4);
            optimized = optimized.substring(0, maxChars) + '...';
        }
        
        // 重複する空白を削除
        optimized = optimized.replace(/\s+/g, ' ');
        
        return optimized;
    }

    /**
     * バッチリクエストを処理
     */
    async sendBatchRequests(requests: LLMRequest[], options?: LLMOptions): Promise<LLMResponse[]> {
        const responses: LLMResponse[] = [];
        
        // 並列実行（最大3つまで）
        const maxConcurrent = 3;
        const chunks = [];
        
        for (let i = 0; i < requests.length; i += maxConcurrent) {
            chunks.push(requests.slice(i, i + maxConcurrent));
        }
        
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(request => this.sendRequest(request, options));
            const chunkResponses = await Promise.all(chunkPromises);
            responses.push(...chunkResponses);
        }
        
        return responses;
    }

    /**
     * 統計情報を取得
     */
    getStatistics(): {
        totalRequests: number;
        successfulRequests: number;
        failedRequests: number;
        averageResponseTime: number;
    } {
        // 実際の実装では、リクエストの統計を追跡する必要がある
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0
        };
    }

    /**
     * VS Code Language Model APIの利用可能性をチェック
     */
    async checkAPIAvailability(): Promise<{
        isAvailable: boolean;
        version?: string;
        error?: string;
        modelCount?: number;
    }> {
        try {
            this.loggingService.info('Checking VS Code Language Model API availability...');
            
            // vscode.lm が存在するかチェック
            if (!vscode.lm) {
                return {
                    isAvailable: false,
                    error: 'vscode.lm is not available in this VS Code version'
                };
            }
            
            // selectChatModels が存在するかチェック
            if (typeof vscode.lm.selectChatModels !== 'function') {
                return {
                    isAvailable: false,
                    error: 'vscode.lm.selectChatModels is not available'
                };
            }
            
            // 実際にモデルを取得してみる
            const models = await vscode.lm.selectChatModels();
            
            this.loggingService.info(`VS Code Language Model API is available with ${models.length} models`);
            
            return {
                isAvailable: true,
                modelCount: models.length,
                version: vscode.version
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.loggingService.error(`VS Code Language Model API check failed: ${errorMessage}`);
            
            return {
                isAvailable: false,
                error: errorMessage
            };
        }
    }
}
