"""
Command Execution Tools
コマンド実行関連のツール
"""

import os
import json
import asyncio
import logging
import subprocess
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from crewai.tools import BaseTool

class CommandExecutionTool(BaseTool):
    """コマンド実行ツール"""
    
    name: str = "command_execution"
    description: str = "Execute system commands and shell scripts"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, command: str, working_directory: str = None, shell: bool = True, **kwargs) -> str:
        """コマンドを実行"""
        try:
            # VS Code側のコマンド実行APIを呼び出し
            params = {
                "command": command,
                "working_directory": working_directory,
                "shell": shell,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "command_execution",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                output = result.get("output", "")
                error = result.get("error", "")
                return_code = result.get("return_code", 0)
                
                if return_code == 0:
                    return f"Command executed successfully:\n{output}"
                else:
                    return f"Command failed with return code {return_code}:\n{error}"
            else:
                return f"Command execution failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Command execution error: {e}")
            return f"Command execution error: {str(e)}"

class TerminalTool(BaseTool):
    """ターミナル操作ツール"""
    
    name: str = "terminal"
    description: str = "Interact with VS Code integrated terminal"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, action: str, command: str = None, terminal_name: str = None, **kwargs) -> str:
        """ターミナル操作を実行"""
        try:
            # VS Code側のターミナルAPIを呼び出し
            params = {
                "action": action,
                "command": command,
                "terminal_name": terminal_name,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "terminal",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Terminal operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Terminal operation error: {e}")
            return f"Terminal operation error: {str(e)}"

class PackageManagerTool(BaseTool):
    """パッケージマネージャーツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="package_manager",
            description="Manage packages with npm, pip, yarn, etc."
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, manager: str, action: str, package_name: str = None, **kwargs) -> str:
        """パッケージマネージャー操作を実行"""
        try:
            # VS Code側のパッケージマネージャーAPIを呼び出し
            params = {
                "manager": manager,
                "action": action,
                "package_name": package_name,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "package_manager",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Package manager operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Package manager operation error: {e}")
            return f"Package manager operation error: {str(e)}"

class GitOperationTool(BaseTool):
    """Git操作ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="git_operations",
            description="Perform Git operations like commit, push, pull, etc."
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, git_command: str, repository_path: str = None, **kwargs) -> str:
        """Git操作を実行"""
        try:
            # VS Code側のGit操作APIを呼び出し
            params = {
                "git_command": git_command,
                "repository_path": repository_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "git_operations",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Git operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Git operation error: {e}")
            return f"Git operation error: {str(e)}"

class ProcessMonitorTool(BaseTool):
    """プロセス監視ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="process_monitor",
            description="Monitor running processes and system resources"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, action: str, process_id: int = None, **kwargs) -> str:
        """プロセス監視を実行"""
        try:
            # VS Code側のプロセス監視APIを呼び出し
            params = {
                "action": action,
                "process_id": process_id,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "process_monitor",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Process monitor operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Process monitor operation error: {e}")
            return f"Process monitor operation error: {str(e)}"
