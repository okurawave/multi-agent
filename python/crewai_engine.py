"""
CrewAI Engine for VS Code Extension
AIエージェントの管理とタスク実行
"""

import logging
import asyncio
import uuid
from typing import Dict, Any, Optional, List, Callable
from pathlib import Path
from datetime import datetime
import json
import time

# CrewAI関連のインポート
from crewai import Agent, Task, Crew

# ツールマネージャーをインポート
from tools.tool_manager import ToolManager

# ツールマネージャーのインポート
from tools.tool_manager import ToolManager
from pydantic import BaseModel, Field

class TaskProgress(BaseModel):
    """タスクの進捗情報"""
    task_id: str
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    status: str = Field(default="pending")
    current_agent: Optional[str] = None
    current_action: Optional[str] = None
    message: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class VSCodeLLMWrapper:
    """VS Code の vscode.lm API を使用するラッパー"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        self.ipc_callback = ipc_callback
        self.logger = logging.getLogger(__name__)
        
    def call(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """LLMの呼び出し"""
        try:
            # VS Code側のLLM APIを呼び出し
            response = self.ipc_callback("llm_request", {
                "messages": messages,
                "kwargs": kwargs
            })
            
            if response.get("success"):
                return response.get("data", {}).get("content", "")
            else:
                self.logger.error(f"LLM API error: {response.get('error')}")
                return "Error: Failed to get response from LLM"
                
        except Exception as e:
            self.logger.error(f"LLM call error: {e}")
            return f"Error: {str(e)}"

class CrewAIEngine:
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        self.logger = logging.getLogger(__name__)
        self.ipc_callback = ipc_callback
        self.active_tasks: Dict[str, TaskProgress] = {}
        self.crews: Dict[str, Crew] = {}
        
        # VS Code LLMラッパーを初期化
        self.llm_wrapper = VSCodeLLMWrapper(ipc_callback)
        
        # ツールマネージャーを初期化
        self.tool_manager = ToolManager(ipc_callback)
        
        # 基本的なAIエージェントを初期化
        self.planner_agent = None
        self.coder_agent = None
        self.tester_agent = None
        self.reviewer_agent = None
        
    async def initialize(self):
        """エンジンの初期化"""
        try:
            self.logger.info("CrewAI Engine initializing...")
            
            # 基本的なAIエージェントを作成
            # プランナーエージェント用のツール
            planner_tools = [
                self.tool_manager.get_tool("project_analysis"),
                self.tool_manager.get_tool("workspace_analysis"),
                self.tool_manager.get_tool("dependency_analysis"),
                self.tool_manager.get_tool("file_operations")
            ]
            
            self.planner_agent = Agent(
                role="Project Planner",
                goal="Analyze user requirements and create comprehensive development plans",
                backstory="You are an experienced project manager and software architect who specializes in breaking down complex development tasks into manageable components.",
                verbose=True,
                allow_delegation=False,
                tools=planner_tools
            )
            
            # コーダーエージェント用のツール
            coder_tools = [
                self.tool_manager.get_tool("file_operations"),
                self.tool_manager.get_tool("code_analysis"),
                self.tool_manager.get_tool("code_generation"),
                self.tool_manager.get_tool("command_execution"),
                self.tool_manager.get_tool("terminal")
            ]
            
            self.coder_agent = Agent(
                role="Software Developer",
                goal="Implement code solutions based on the project plan",
                backstory="You are a skilled software developer with expertise in multiple programming languages and frameworks. You write clean, efficient, and well-documented code.",
                verbose=True,
                allow_delegation=False,
                tools=coder_tools
            )
            
            # テスターエージェント用のツール
            tester_tools = [
                self.tool_manager.get_tool("command_execution"),
                self.tool_manager.get_tool("terminal"),
                self.tool_manager.get_tool("file_operations"),
                self.tool_manager.get_tool("code_analysis")
            ]
            
            self.tester_agent = Agent(
                role="Quality Assurance Tester",
                goal="Test and validate the implemented solutions",
                backstory="You are a meticulous QA engineer who ensures software quality through comprehensive testing strategies and bug detection.",
                verbose=True,
                allow_delegation=False,
                tools=tester_tools
            )
            
            # レビューエージェント用のツール
            reviewer_tools = [
                self.tool_manager.get_tool("file_operations"),
                self.tool_manager.get_tool("code_analysis"),
                self.tool_manager.get_tool("project_analysis"),
                self.tool_manager.get_tool("workspace_analysis")
            ]
            
            self.reviewer_agent = Agent(
                role="Code Reviewer",
                goal="Review code for quality, security, and best practices",
                backstory="You are a senior developer with extensive experience in code review, focusing on maintainability, performance, and security.",
                verbose=True,
                allow_delegation=False,
                tools=reviewer_tools
            )
            
            self.logger.info("CrewAI Engine initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize CrewAI Engine: {e}")
            raise
    
    async def create_development_crew(self, task_description: str, task_id: str) -> Crew:
        """開発タスク用のクルーを作成"""
        try:
            # タスクを作成
            planning_task = Task(
                description=f"Analyze the following requirement and create a detailed development plan: {task_description}",
                expected_output="A comprehensive development plan with clear steps and requirements",
                agent=self.planner_agent
            )
            
            coding_task = Task(
                description="Implement the solution based on the planning task results",
                expected_output="Working code implementation with proper documentation",
                agent=self.coder_agent
            )
            
            testing_task = Task(
                description="Test the implemented solution for functionality and quality",
                expected_output="Test results and quality assurance report",
                agent=self.tester_agent
            )
            
            review_task = Task(
                description="Review the implemented code for quality and best practices",
                expected_output="Code review report with recommendations and approval",
                agent=self.reviewer_agent
            )
            
            # クルーを作成
            crew = Crew(
                agents=[self.planner_agent, self.coder_agent, self.tester_agent, self.reviewer_agent],
                tasks=[planning_task, coding_task, testing_task, review_task],
                verbose=True
            )
            
            self.crews[task_id] = crew
            return crew
            
        except Exception as e:
            self.logger.error(f"Failed to create development crew: {e}")
            raise
    
    async def start_task(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """タスクを開始"""
        try:
            task_id = params.get("task_id", str(uuid.uuid4()))
            task_description = params.get("description", "")
            
            self.logger.info(f"Starting task: {task_id} - {task_description}")
            
            # タスクの進捗を初期化
            task_progress = TaskProgress(
                task_id=task_id,
                status="starting",
                message="Initializing task"
            )
            self.active_tasks[task_id] = task_progress
            
            # クルーを作成
            crew = await self.create_development_crew(task_description, task_id)
            
            # タスクを実行（バックグラウンドで）
            asyncio.create_task(self._execute_crew_task(crew, task_id, task_description))
            
            return {
                "success": True,
                "message": f"Task {task_id} started",
                "task_id": task_id
            }
            
        except Exception as e:
            self.logger.error(f"Start task error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _execute_crew_task(self, crew: Crew, task_id: str, task_description: str):
        """クルーのタスクを実行"""
        try:
            # タスクステータスを更新
            if task_id in self.active_tasks:
                self.active_tasks[task_id].status = "running"
                self.active_tasks[task_id].message = "Executing crew task"
                self.active_tasks[task_id].updated_at = datetime.now()
            
            # 進捗通知を送信
            await self._send_progress_notification(task_id, 0.1, "starting", "Task execution started")
            
            # クルーのタスクを実行
            # 注意: 実際のLLM呼び出しはVS Code側で行われるため、モックまたはカスタム実装が必要
            result = await self._execute_crew_with_vscode_llm(crew, task_description)
            
            # 完了通知
            await self._send_completion_notification(task_id, result)
            
            # タスクステータスを更新
            if task_id in self.active_tasks:
                self.active_tasks[task_id].status = "completed"
                self.active_tasks[task_id].progress = 1.0
                self.active_tasks[task_id].message = "Task completed successfully"
                self.active_tasks[task_id].updated_at = datetime.now()
            
        except Exception as e:
            self.logger.error(f"Crew task execution error: {e}")
            
            # エラー通知
            await self._send_failure_notification(task_id, str(e))
            
            # タスクステータスを更新
            if task_id in self.active_tasks:
                self.active_tasks[task_id].status = "failed"
                self.active_tasks[task_id].message = f"Task failed: {str(e)}"
                self.active_tasks[task_id].updated_at = datetime.now()
    
    async def _execute_crew_with_vscode_llm(self, crew: Crew, task_description: str) -> Dict[str, Any]:
        """VS Code LLMを使用してクルーのタスクを実行"""
        try:
            # 各エージェントのタスクを順次実行
            results = []
            
            for i, task in enumerate(crew.tasks):
                # 進捗更新
                progress = (i + 1) / len(crew.tasks)
                await self._send_progress_notification(
                    task.agent.role if hasattr(task, 'agent') else "Unknown",
                    progress,
                    "running",
                    f"Executing task: {task.description[:50]}..."
                )
                
                # LLMを呼び出してタスクを実行
                llm_response = self.llm_wrapper.call([
                    {
                        "role": "system",
                        "content": f"You are a {task.agent.role}. {task.agent.backstory}"
                    },
                    {
                        "role": "user",
                        "content": task.description
                    }
                ])
                
                results.append({
                    "agent": task.agent.role,
                    "task": task.description,
                    "result": llm_response
                })
                
                # 少し待機
                await asyncio.sleep(0.1)
            
            return {
                "success": True,
                "results": results,
                "task_description": task_description
            }
            
        except Exception as e:
            self.logger.error(f"Crew execution error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _send_progress_notification(self, task_id: str, progress: float, status: str, message: str):
        """進捗通知を送信"""
        try:
            notification_data = {
                "task_id": task_id,
                "progress": progress,
                "status": status,
                "message": message,
                "timestamp": datetime.now().isoformat()
            }
            
            # IPC経由で通知を送信
            self.ipc_callback("task_progress", notification_data)
            
        except Exception as e:
            self.logger.error(f"Failed to send progress notification: {e}")
    
    async def _send_completion_notification(self, task_id: str, result: Dict[str, Any]):
        """完了通知を送信"""
        try:
            notification_data = {
                "task_id": task_id,
                "result": result,
                "timestamp": datetime.now().isoformat()
            }
            
            # IPC経由で通知を送信
            self.ipc_callback("task_completed", notification_data)
            
        except Exception as e:
            self.logger.error(f"Failed to send completion notification: {e}")
    
    async def _send_failure_notification(self, task_id: str, error: str):
        """失敗通知を送信"""
        try:
            notification_data = {
                "task_id": task_id,
                "error": error,
                "timestamp": datetime.now().isoformat()
            }
            
            # IPC経由で通知を送信
            self.ipc_callback("task_failed", notification_data)
            
        except Exception as e:
            self.logger.error(f"Failed to send failure notification: {e}")
    
    async def stop_task(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """タスクを停止"""
        try:
            task_id = params.get("task_id")
            
            if task_id in self.active_tasks:
                self.active_tasks[task_id].status = "stopped"
                self.active_tasks[task_id].message = "Task stopped by user"
                self.active_tasks[task_id].updated_at = datetime.now()
                
                # クルーも停止
                if task_id in self.crews:
                    del self.crews[task_id]
                
                self.logger.info(f"Task {task_id} stopped")
                
                return {
                    "success": True,
                    "message": f"Task {task_id} stopped"
                }
            else:
                return {
                    "success": False,
                    "error": f"Task {task_id} not found"
                }
                
        except Exception as e:
            self.logger.error(f"Stop task error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_task_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """タスクのステータスを取得"""
        try:
            task_id = params.get("task_id")
            
            if task_id in self.active_tasks:
                task_progress = self.active_tasks[task_id]
                return {
                    "success": True,
                    "task_id": task_id,
                    "status": task_progress.status,
                    "progress": task_progress.progress,
                    "message": task_progress.message,
                    "current_agent": task_progress.current_agent,
                    "current_action": task_progress.current_action,
                    "created_at": task_progress.created_at.isoformat(),
                    "updated_at": task_progress.updated_at.isoformat()
                }
            else:
                return {
                    "success": False,
                    "error": f"Task {task_id} not found"
                }
                
        except Exception as e:
            self.logger.error(f"Get task status error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def list_tasks(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """すべてのタスクをリスト表示"""
        try:
            tasks = []
            for task_id, task_progress in self.active_tasks.items():
                tasks.append({
                    "task_id": task_id,
                    "status": task_progress.status,
                    "progress": task_progress.progress,
                    "message": task_progress.message,
                    "current_agent": task_progress.current_agent,
                    "current_action": task_progress.current_action,
                    "created_at": task_progress.created_at.isoformat(),
                    "updated_at": task_progress.updated_at.isoformat()
                })
            
            return {
                "success": True,
                "tasks": tasks
            }
            
        except Exception as e:
            self.logger.error(f"List tasks error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def handle_llm_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """LLMリクエストを処理"""
        try:
            # VS Code側のLLM APIを呼び出すためのリクエストを転送
            return {
                "success": True,
                "message": "LLM request processed",
                "data": params
            }
            
        except Exception as e:
            self.logger.error(f"LLM request error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    async def handle_tool_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """ツールリクエストを処理"""
        try:
            tool_name = params.get("tool_name")
            tool_params = params.get("tool_params", {})
            
            # ツールの実行結果を返す
            return {
                "success": True,
                "message": f"Tool {tool_name} executed",
                "data": tool_params
            }
            
        except Exception as e:
            self.logger.error(f"Tool request error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_active_tasks(self) -> List[Dict[str, Any]]:
        """アクティブなタスクを取得"""
        return [
            {
                "task_id": task_id,
                "status": task_progress.status,
                "progress": task_progress.progress,
                "message": task_progress.message,
                "current_agent": task_progress.current_agent,
                "current_action": task_progress.current_action,
                "created_at": task_progress.created_at.isoformat(),
                "updated_at": task_progress.updated_at.isoformat()
            }
            for task_id, task_progress in self.active_tasks.items()
        ]
    
    async def dispose(self):
        """リソースを解放"""
        try:
            # すべてのタスクを停止
            for task_id in list(self.active_tasks.keys()):
                await self.stop_task({"task_id": task_id})
            
            # クルーをクリア
            self.crews.clear()
            self.active_tasks.clear()
            
            self.logger.info("CrewAI Engine disposed")
            
        except Exception as e:
            self.logger.error(f"Error during disposal: {e}")
        
    async def initialize(self):
        """エンジンの初期化"""
        self.logger.info("CrewAI Engine initialized")
        
    async def handle_llm_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """LLMリクエストを処理"""
        try:
            # VS Code側のLLM APIを呼び出すためのリクエストを作成
            return {
                "success": True,
                "message": "LLM request processed",
                "data": params
            }
            
        except Exception as e:
            self.logger.error(f"LLM request error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    async def handle_tool_request(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """ツールリクエストを処理"""
        try:
            tool_name = params.get("tool_name")
            tool_params = params.get("tool_params", {})
            
            # ツールの実行結果を返す
            return {
                "success": True,
                "message": f"Tool {tool_name} executed",
                "data": tool_params
            }
            
        except Exception as e:
            self.logger.error(f"Tool request error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    async def start_task(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """タスクを開始"""
        try:
            task_id = params.get("task_id")
            task_description = params.get("description", "")
            
            self.logger.info(f"Starting task: {task_id} - {task_description}")
            
            # タスクを追加
            self.active_tasks[task_id] = {
                "id": task_id,
                "description": task_description,
                "status": "running",
                "created_at": asyncio.get_event_loop().time()
            }
            
            return {
                "success": True,
                "message": f"Task {task_id} started",
                "task_id": task_id
            }
            
        except Exception as e:
            self.logger.error(f"Start task error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    async def stop_task(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """タスクを停止"""
        try:
            task_id = params.get("task_id")
            
            if task_id in self.active_tasks:
                self.active_tasks[task_id]["status"] = "stopped"
                self.logger.info(f"Task {task_id} stopped")
                
                return {
                    "success": True,
                    "message": f"Task {task_id} stopped"
                }
            else:
                return {
                    "success": False,
                    "error": f"Task {task_id} not found"
                }
                
        except Exception as e:
            self.logger.error(f"Stop task error: {e}")
            return {
                "success": False,
                "error": str(e)
            }
            
    def get_active_tasks(self) -> List[Dict[str, Any]]:
        """アクティブなタスクを取得"""
        return list(self.active_tasks.values())
