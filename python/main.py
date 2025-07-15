#!/usr/bin/env python3
"""
CrewAI Connect Main Entry Point
AIエージェントのメインエントリーポイント
"""

import sys
import json
import asyncio
import logging
import time
import threading
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime
import traceback

# プロジェクトパスを追加
sys.path.insert(0, str(Path(__file__).parent))

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('crewai_connect.log'),
        logging.StreamHandler(sys.stderr)
    ]
)

logger = logging.getLogger(__name__)

class SimpleIPCHandler:
    """シンプルなIPC通信処理クラス（テスト用）"""
    
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.is_running = True
        logger.info("Simple IPC Handler initialized")
    
    def send_notification(self, method: str, params: Any) -> None:
        """通知をVS Codeに送信"""
        notification = {
            "method": method,
            "params": params,
            "timestamp": int(time.time() * 1000)
        }
        
        try:
            message = json.dumps(notification)
            print(message, flush=True)
            logger.debug(f"Sent notification: {method}")
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
    
    def send_response(self, request_id: str, result: Any = None, error: str = None) -> None:
        """レスポンスをVS Codeに送信"""
        response = {
            "id": request_id,
            "timestamp": int(time.time() * 1000)
        }
        
        if error:
            response["error"] = error
        else:
            response["result"] = result
        
        try:
            message = json.dumps(response)
            print(message, flush=True)
            logger.debug(f"Sent response for request: {request_id}")
        except Exception as e:
            logger.error(f"Failed to send response: {e}")
    
    def handle_start_task(self, request_id: str, params: Dict[str, Any]) -> None:
        """タスク開始を処理"""
        task_id = params.get("task_id")
        description = params.get("description", "No description")
        
        if not task_id:
            self.send_response(request_id, error="task_id is required")
            return
        
        # タスクを作成
        task = {
            "id": task_id,
            "description": description,
            "status": "running",
            "progress": 0,
            "start_time": datetime.now().isoformat(),
            "parameters": params.get("parameters", {})
        }
        
        self.tasks[task_id] = task
        
        # タスク開始の通知
        self.send_notification("task_progress", {
            "taskId": task_id,
            "progress": 0,
            "status": "running",
            "message": f"Started task: {description}"
        })
        
        # 成功レスポンス
        self.send_response(request_id, {"task_id": task_id, "status": "started"})
        
        # バックグラウンドでタスクを実行
        self.simulate_task_execution(task_id)
        
        logger.info(f"Task started: {task_id} - {description}")
    
    def simulate_task_execution(self, task_id: str) -> None:
        """タスクの実行をシミュレート"""
        def execute_task():
            try:
                task = self.tasks.get(task_id)
                if not task:
                    return
                
                # 進捗を段階的に更新
                for progress in [10, 30, 50, 70, 90]:
                    if task["status"] != "running":
                        break
                    
                    time.sleep(1)  # 1秒待機
                    task["progress"] = progress
                    
                    self.send_notification("task_progress", {
                        "taskId": task_id,
                        "progress": progress,
                        "status": "running",
                        "message": f"Task progress: {progress}%"
                    })
                
                # タスク完了
                if task["status"] == "running":
                    task["status"] = "completed"
                    task["progress"] = 100
                    task["end_time"] = datetime.now().isoformat()
                    
                    self.send_notification("task_completed", {
                        "taskId": task_id,
                        "result": f"Task '{task['description']}' completed successfully",
                        "duration": 5000  # 5秒（実際は計算）
                    })
                    
                    logger.info(f"Task completed: {task_id}")
                
            except Exception as e:
                logger.error(f"Task execution error: {e}")
                self.send_notification("task_failed", {
                    "taskId": task_id,
                    "error": str(e),
                    "duration": 0
                })
        
        # 別スレッドで実行
        thread = threading.Thread(target=execute_task)
        thread.daemon = True
        thread.start()
    
    def handle_health_check(self, request_id: str, params: Dict[str, Any]) -> None:
        """ヘルスチェック"""
        self.send_response(request_id, {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "tasks_count": len(self.tasks)
        })
    
    def handle_request(self, request: Dict[str, Any]) -> None:
        """リクエストを処理"""
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params", {})
        
        if not request_id or not method:
            logger.error("Invalid request format")
            return
        
        try:
            # メソッドごとの処理
            if method == "start_task":
                self.handle_start_task(request_id, params)
            elif method == "health_check":
                self.handle_health_check(request_id, params)
            elif method == "shutdown":
                self.is_running = False
                self.send_response(request_id, {"status": "shutting_down"})
                logger.info("Shutdown requested")
            else:
                self.send_response(request_id, error=f"Unknown method: {method}")
                
        except Exception as e:
            logger.error(f"Error handling request {method}: {e}")
            logger.error(traceback.format_exc())
            self.send_response(request_id, error=str(e))
    
    def run(self) -> None:
        """メインループ"""
        logger.info("CrewAI Connect Python process started")
        
        # 起動通知
        self.send_notification("status_update", {
            "systemStatus": "idle",
            "activeTaskCount": 0,
            "totalTasksCompleted": 0
        })
        
        try:
            while self.is_running:
                line = sys.stdin.readline()
                if not line:
                    break
                
                line = line.strip()
                if not line:
                    continue
                
                try:
                    request = json.loads(line)
                    self.handle_request(request)
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    continue
                except Exception as e:
                    logger.error(f"Error processing line: {e}")
                    continue
        
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
        
        finally:
            logger.info("CrewAI Connect Python process stopped")

def main():
    """メイン関数"""
    # テスト用のシンプルなハンドラーを使用
    handler = SimpleIPCHandler()
    handler.run()

if __name__ == "__main__":
    main()
