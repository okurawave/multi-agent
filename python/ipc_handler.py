"""
IPC Handler for CrewAI Connect
VS Code拡張機能との通信を管理
"""

import sys
import json
import asyncio
import logging
from typing import Dict, Any, Optional

class IPCHandler:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        
    async def initialize(self):
        """IPC通信の初期化"""
        self.logger.info("IPC Handler initialized")
        
    async def receive_request(self) -> Optional[Dict[str, Any]]:
        """VS Codeからのリクエストを受信"""
        try:
            # 標準入力から1行読み取り
            line = await asyncio.get_event_loop().run_in_executor(
                None, sys.stdin.readline
            )
            
            if not line.strip():
                return None
                
            # JSON形式で解析
            request = json.loads(line.strip())
            self.logger.debug(f"Received request: {request}")
            
            return request
            
        except json.JSONDecodeError as e:
            self.logger.error(f"JSON decode error: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Error receiving request: {e}")
            return None
            
    async def send_response(self, response: Dict[str, Any]):
        """VS Codeにレスポンスを送信"""
        try:
            # JSON形式で標準出力に送信
            response_json = json.dumps(response)
            print(response_json, flush=True)
            
            self.logger.debug(f"Sent response: {response}")
            
        except Exception as e:
            self.logger.error(f"Error sending response: {e}")
            
    async def send_notification(self, method: str, params: Dict[str, Any]):
        """VS Codeに通知を送信"""
        notification = {
            "method": method,
            "params": params
        }
        
        try:
            notification_json = json.dumps(notification)
            print(notification_json, flush=True)
            
            self.logger.debug(f"Sent notification: {notification}")
            
        except Exception as e:
            self.logger.error(f"Error sending notification: {e}")
