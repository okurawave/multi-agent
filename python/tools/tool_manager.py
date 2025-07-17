"""
Tool Manager for CrewAI Agents
AIエージェント用のツール管理システム
"""

import logging
from typing import Dict, Any, List, Optional, Callable
from .file_tools import FileOperationTool, ProjectAnalysisTool
from .command_tools import CommandExecutionTool, TerminalTool
from .workspace_tools import WorkspaceAnalysisTool, DependencyAnalysisTool
from .code_tools import CodeAnalysisTool, CodeGenerationTool

class ToolManager:
    """ツール管理システム"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        self.ipc_callback = ipc_callback
        self.logger = logging.getLogger(__name__)
        self.tools: Dict[str, Any] = {}
        self._initialize_tools()
    
    def _initialize_tools(self):
        """ツールを初期化"""
        try:
            # ファイル操作ツール
            self.tools["file_operations"] = FileOperationTool(self.ipc_callback)
            self.tools["project_analysis"] = ProjectAnalysisTool(self.ipc_callback)
            
            # コマンド実行ツール
            self.tools["command_execution"] = CommandExecutionTool(self.ipc_callback)
            self.tools["terminal"] = TerminalTool(self.ipc_callback)
            
            # ワークスペース分析ツール
            self.tools["workspace_analysis"] = WorkspaceAnalysisTool(self.ipc_callback)
            self.tools["dependency_analysis"] = DependencyAnalysisTool(self.ipc_callback)
            
            # コード分析・生成ツール
            self.tools["code_analysis"] = CodeAnalysisTool(self.ipc_callback)
            self.tools["code_generation"] = CodeGenerationTool(self.ipc_callback)
            
            self.logger.info(f"Initialized {len(self.tools)} tools")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize tools: {e}")
            raise
    
    def get_tool(self, tool_name: str) -> Optional[Any]:
        """ツールを取得"""
        return self.tools.get(tool_name)
    
    def execute_tool(self, tool_name: str, **kwargs) -> str:
        """ツールを実行"""
        try:
            tool = self.get_tool(tool_name)
            if tool is None:
                return f"Tool '{tool_name}' not found"
            
            return tool.execute(**kwargs)
            
        except Exception as e:
            self.logger.error(f"Tool execution error: {e}")
            return f"Tool execution error: {str(e)}"
    
    def list_tools(self) -> List[Dict[str, str]]:
        """利用可能なツールのリストを取得"""
        return [
            {
                "name": tool.name,
                "description": tool.description
            }
            for tool in self.tools.values()
        ]
    
    def get_tools_for_agent(self, agent_role: str) -> List[Any]:
        """エージェントの役割に応じたツールセットを取得"""
        try:
            if agent_role == "Project Planner":
                return [
                    self.tools["project_analysis"],
                    self.tools["workspace_analysis"],
                    self.tools["dependency_analysis"],
                    self.tools["configuration_analysis"],
                    self.tools["project_metrics"],
                    self.tools["environment_analysis"],
                    self.tools["test_discovery"]
                ]
            elif agent_role == "Software Developer":
                return [
                    self.tools["file_operations"],
                    self.tools["directory_navigation"],
                    self.tools["code_generation"],
                    self.tools["code_formatter"],
                    self.tools["package_manager"],
                    self.tools["git_operations"],
                    self.tools["command_execution"],
                    self.tools["terminal"]
                ]
            elif agent_role == "Quality Assurance Tester":
                return [
                    self.tools["test_generator"],
                    self.tools["test_discovery"],
                    self.tools["command_execution"],
                    self.tools["terminal"],
                    self.tools["file_operations"],
                    self.tools["code_analysis"],
                    self.tools["process_monitor"]
                ]
            elif agent_role == "Code Reviewer":
                return [
                    self.tools["code_analysis"],
                    self.tools["code_linter"],
                    self.tools["refactoring"],
                    self.tools["documentation_generator"],
                    self.tools["file_operations"],
                    self.tools["directory_navigation"],
                    self.tools["git_operations"]
                ]
            else:
                # デフォルトの基本ツールセット
                return [
                    self.tools["file_operations"],
                    self.tools["directory_navigation"],
                    self.tools["command_execution"],
                    self.tools["project_analysis"]
                ]
                
        except Exception as e:
            self.logger.error(f"Error getting tools for agent {agent_role}: {e}")
            return []
    
    def get_tool_descriptions(self) -> Dict[str, str]:
        """ツールの説明を取得"""
        return {
            name: tool.description
            for name, tool in self.tools.items()
        }
    
    def validate_tool_availability(self) -> Dict[str, bool]:
        """ツールの利用可能性を検証"""
        availability = {}
        
        for name, tool in self.tools.items():
            try:
                # 基本的な検証（実際の実行は行わない）
                availability[name] = tool is not None and hasattr(tool, 'execute')
            except Exception as e:
                self.logger.warning(f"Tool {name} validation failed: {e}")
                availability[name] = False
        
        return availability
    
    def get_tool_usage_stats(self) -> Dict[str, Dict[str, Any]]:
        """ツールの使用統計を取得（今後の実装用）"""
        # 将来的にツールの使用統計を追跡する機能
        return {
            name: {
                "usage_count": 0,
                "last_used": None,
                "avg_execution_time": 0.0
            }
            for name in self.tools.keys()
        }
