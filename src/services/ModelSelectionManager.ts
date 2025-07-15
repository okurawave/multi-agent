/**
 * ModelSelectionManager
 * モデル選択とモデル情報の管理を行うクラス
 */

import * as vscode from 'vscode';
import { LoggingService } from './LoggingService';

export interface ModelInfo {
    id: string;
    name: string;
    vendor: string;
    maxInputTokens: number;
    isAvailable: boolean;
    description?: string;
    capabilities?: string[];
}

export interface ModelCategory {
    name: string;
    models: ModelInfo[];
}

export class ModelSelectionManager {
    private availableModels: ModelInfo[] = [];
    private selectedModel: string = 'auto';
    private eventEmitter = new vscode.EventEmitter<string>();
    
    constructor(private loggingService: LoggingService) {}

    /**
     * モデル選択変更イベント
     */
    public readonly onModelChanged = this.eventEmitter.event;

    /**
     * 利用可能なモデルを更新
     */
    async updateAvailableModels(): Promise<void> {
        try {
            this.loggingService.info('Updating available models...');
            
            // VS Code Language Model APIから取得
            const vsCodeModels = await this.getVSCodeModels();
            
            // 外部APIモデルを追加（将来の拡張用）
            const externalModels = await this.getExternalModels();
            
            // フォールバックモデルを追加
            const fallbackModels = await this.getFallbackModels();
            
            this.availableModels = [...vsCodeModels, ...externalModels, ...fallbackModels];
            
            this.loggingService.info(`Updated ${this.availableModels.length} models`);
        } catch (error) {
            this.loggingService.error(`Failed to update models: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.availableModels = await this.getFallbackModels();
        }
    }

    /**
     * VS Code Language Model APIからモデルを取得
     */
    private async getVSCodeModels(): Promise<ModelInfo[]> {
        try {
            if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
                this.loggingService.warn('VS Code Language Model API not available');
                return [];
            }

            const models = await vscode.lm.selectChatModels();
            
            return models.map(model => ({
                id: model.id,
                name: model.name,
                vendor: model.vendor,
                maxInputTokens: model.maxInputTokens,
                isAvailable: true,
                description: `${model.name} by ${model.vendor}`,
                capabilities: this.getModelCapabilities(model.name, model.vendor)
            }));
        } catch (error) {
            this.loggingService.error(`Failed to get VS Code models: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }

    /**
     * 外部APIモデルを取得（将来の拡張用）
     */
    private async getExternalModels(): Promise<ModelInfo[]> {
        // 将来的にOpenAI API、Anthropic API等を直接呼び出す場合に使用
        return [];
    }

    /**
     * フォールバックモデルを取得
     */
    private async getFallbackModels(): Promise<ModelInfo[]> {
        return [
            {
                id: 'mock-gpt4',
                name: 'GPT-4 (Mock)',
                vendor: 'OpenAI',
                maxInputTokens: 8192,
                isAvailable: false,
                description: 'Mock GPT-4 model for testing',
                capabilities: ['text-generation', 'code-generation', 'reasoning']
            },
            {
                id: 'mock-claude',
                name: 'Claude 3 Sonnet (Mock)',
                vendor: 'Anthropic',
                maxInputTokens: 200000,
                isAvailable: false,
                description: 'Mock Claude model for testing',
                capabilities: ['text-generation', 'reasoning', 'analysis']
            },
            {
                id: 'mock-gemini',
                name: 'Gemini Pro (Mock)',
                vendor: 'Google',
                maxInputTokens: 32768,
                isAvailable: false,
                description: 'Mock Gemini model for testing',
                capabilities: ['text-generation', 'multimodal', 'reasoning']
            }
        ];
    }

    /**
     * モデルの機能を推定
     */
    private getModelCapabilities(name: string, vendor: string): string[] {
        const capabilities: string[] = ['text-generation', 'conversation'];
        const lowerName = name.toLowerCase();
        const lowerVendor = vendor.toLowerCase();
        
        if (lowerName.includes('gpt') || lowerVendor.includes('openai')) {
            capabilities.push('code-generation', 'analysis', 'debugging');
        }
        
        if (lowerName.includes('claude') || lowerVendor.includes('anthropic')) {
            capabilities.push('reasoning', 'analysis', 'code-review');
        }
        
        if (lowerName.includes('gemini') || lowerVendor.includes('google')) {
            capabilities.push('multimodal', 'reasoning', 'code-analysis');
        }
        
        if (lowerName.includes('codellama') || lowerName.includes('code')) {
            capabilities.push('code-generation', 'code-completion');
        }
        
        return capabilities;
    }

    /**
     * モデルをカテゴリー別に取得
     */
    getModelsByCategory(): ModelCategory[] {
        const categories: ModelCategory[] = [
            { name: 'Available Models', models: this.availableModels.filter(m => m.isAvailable) },
            { name: 'OpenAI Models', models: this.availableModels.filter(m => m.vendor.toLowerCase().includes('openai')) },
            { name: 'Anthropic Models', models: this.availableModels.filter(m => m.vendor.toLowerCase().includes('anthropic')) },
            { name: 'Google Models', models: this.availableModels.filter(m => m.vendor.toLowerCase().includes('google')) },
            { name: 'Mock Models', models: this.availableModels.filter(m => !m.isAvailable) }
        ];

        return categories.filter(cat => cat.models.length > 0);
    }

    /**
     * 選択されたモデルを設定
     */
    setSelectedModel(modelId: string): void {
        if (modelId === this.selectedModel) {
            return;
        }

        this.selectedModel = modelId;
        this.eventEmitter.fire(modelId);
        this.loggingService.info(`Selected model changed to: ${modelId}`);
    }

    /**
     * 選択されたモデルを取得
     */
    getSelectedModel(): string {
        return this.selectedModel;
    }

    /**
     * モデル情報を取得
     */
    getModelInfo(modelId: string): ModelInfo | undefined {
        return this.availableModels.find(m => m.id === modelId);
    }

    /**
     * 全てのモデル情報を取得
     */
    getAllModels(): ModelInfo[] {
        return [...this.availableModels];
    }

    /**
     * 利用可能なモデルのみを取得
     */
    getAvailableModels(): ModelInfo[] {
        return this.availableModels.filter(m => m.isAvailable);
    }

    /**
     * モデルの詳細情報を文字列で取得
     */
    getModelDetails(modelId: string): string {
        const model = this.getModelInfo(modelId);
        if (!model) {
            return 'Model not found';
        }

        return `**${model.name}** (${model.vendor})\n` +
               `- ID: ${model.id}\n` +
               `- Max Tokens: ${model.maxInputTokens.toLocaleString()}\n` +
               `- Available: ${model.isAvailable ? 'Yes' : 'No'}\n` +
               `- Capabilities: ${model.capabilities?.join(', ') || 'Unknown'}\n` +
               `- Description: ${model.description || 'No description'}`;
    }

    /**
     * 最適なモデルを自動選択
     */
    selectBestModel(): string {
        const availableModels = this.getAvailableModels();
        
        if (availableModels.length === 0) {
            return 'auto';
        }

        // 優先度順に選択
        const priorities = [
            (m: ModelInfo) => m.name.toLowerCase().includes('gpt-4') && !m.name.toLowerCase().includes('preview'),
            (m: ModelInfo) => m.name.toLowerCase().includes('gpt-4'),
            (m: ModelInfo) => m.name.toLowerCase().includes('claude') && m.name.toLowerCase().includes('sonnet'),
            (m: ModelInfo) => m.name.toLowerCase().includes('claude'),
            (m: ModelInfo) => m.name.toLowerCase().includes('gemini') && m.name.toLowerCase().includes('pro'),
            (m: ModelInfo) => m.name.toLowerCase().includes('gemini'),
            (m: ModelInfo) => m.maxInputTokens > 16000,
            (m: ModelInfo) => m.maxInputTokens > 8000,
            () => true
        ];

        for (const priority of priorities) {
            const selected = availableModels.find(priority);
            if (selected) {
                return selected.id;
            }
        }

        return availableModels[0].id;
    }

    /**
     * リソースをクリーンアップ
     */
    dispose(): void {
        this.eventEmitter.dispose();
    }
}
