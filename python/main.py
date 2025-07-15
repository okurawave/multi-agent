#!/usr/bin/env python3
"""
CrewAI Connect Main Entry Point
AIエージェントのメインエントリーポイント
"""

import sys
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from pathlib import Path

# プロジェクトパスを追加
sys.path.insert(0, str(Path(__file__).parent))

from crewai_engine import CrewAIEngine
from ipc_handler import IPCHandler

class CrewAIConnectMain:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.engine = CrewAIEngine()
        self.ipc_handler = IPCHandler()
        
    async def start(self):
        """メインプロセスを開始"""
        self.logger.info("CrewAI Connect starting...")
        
        # IPC通信の初期化
        await self.ipc_handler.initialize()
        
        # エンジンの初期化
        await self.engine.initialize()
        
        # メインループ
        await self.main_loop()
        
    async def main_loop(self):
        """メインループ - VS Codeからのリクエストを処理"""
        while True:
            try:
                # VS Codeからのリクエストを待機
                request = await self.ipc_handler.receive_request()
                
                if request is None:
                    continue
                    
                # リクエストを処理
                response = await self.handle_request(request)
                
                # レスポンスを送信
                await self.ipc_handler.send_response(response)
                
            except KeyboardInterrupt:
                self.logger.info("Shutting down...")
                break
            except Exception as e:
                self.logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(1)
                
    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """リクエストを処理"""
        try:
            method = request.get("method")
            params = request.get("params", {})
            request_id = request.get("id")
            
            if method == "llm_request":
                # LLMリクエスト
                result = await self.engine.handle_llm_request(params)
            elif method == "tool_request":
                # ツールリクエスト
                result = await self.engine.handle_tool_request(params)
            elif method == "start_task":
                # タスク開始
                result = await self.engine.start_task(params)
            elif method == "stop_task":
                # タスク停止
                result = await self.engine.stop_task(params)
            else:
                result = {"error": f"Unknown method: {method}"}
                
            return {
                "id": request_id,
                "result": result
            }
            
        except Exception as e:
            return {
                "id": request.get("id"),
                "error": str(e)
            }

def setup_logging():
    """ログ設定"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stderr)
        ]
    )

async def main():
    """メイン関数"""
    setup_logging()
    
    app = CrewAIConnectMain()
    await app.start()

if __name__ == "__main__":
    asyncio.run(main())
