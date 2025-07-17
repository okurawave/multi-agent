"""
File Operation Tools
ファイル操作関連のツール
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from pydantic import BaseModel, Field
from crewai.tools import BaseTool

class FileOperationTool(BaseTool):
    """ファイル操作ツール"""
    
    name: str = "file_operations"
    description: str = "Perform file operations like read, write, create, delete files and directories"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, operation: str, file_path: str, content: str = None, **kwargs) -> str:
        """ファイル操作を実行"""
        try:
            # VS Code側のファイル操作APIを呼び出し
            params = {
                "operation": operation,
                "file_path": file_path,
                "content": content,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "file_operations",
                "tool_params": params
            })
            
            if response.get("success"):
                return f"File operation '{operation}' completed successfully for {file_path}"
            else:
                return f"File operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"File operation error: {e}")
            return f"File operation error: {str(e)}"

class ProjectAnalysisTool(BaseTool):
    """プロジェクト分析ツール"""
    
    name: str = "project_analysis"
    description: str = "Analyze project structure, dependencies, and codebase"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, analysis_type: str, project_path: str = None, **kwargs) -> str:
        """プロジェクト分析を実行"""
        try:
            # VS Code側のプロジェクト分析APIを呼び出し
            params = {
                "analysis_type": analysis_type,
                "project_path": project_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "project_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                analysis_result = response.get("data", {})
                return json.dumps(analysis_result, indent=2)
            else:
                return f"Project analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Project analysis error: {e}")
            return f"Project analysis error: {str(e)}"

class DirectoryNavigationTool(BaseTool):
    """ディレクトリナビゲーションツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="directory_navigation",
            description="Navigate directories, list files, and explore project structure"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, action: str, directory_path: str = None, **kwargs) -> str:
        """ディレクトリナビゲーションを実行"""
        try:
            # VS Code側のディレクトリ操作APIを呼び出し
            params = {
                "action": action,
                "directory_path": directory_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "directory_navigation",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                if isinstance(result, dict) and "files" in result:
                    # ファイルリストを整形
                    files = result["files"]
                    formatted_files = []
                    for file in files:
                        if file.endswith("/"):
                            formatted_files.append(f"📁 {file}")
                        else:
                            formatted_files.append(f"📄 {file}")
                    return "\n".join(formatted_files)
                else:
                    return json.dumps(result, indent=2)
            else:
                return f"Directory navigation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Directory navigation error: {e}")
            return f"Directory navigation error: {str(e)}"

class FileWatcherTool(BaseTool):
    """ファイル監視ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="file_watcher",
            description="Monitor file changes and modifications in the workspace"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, action: str, file_path: str = None, **kwargs) -> str:
        """ファイル監視を実行"""
        try:
            # VS Code側のファイル監視APIを呼び出し
            params = {
                "action": action,
                "file_path": file_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "file_watcher",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"File watcher failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"File watcher error: {e}")
            return f"File watcher error: {str(e)}"
        """ファイル操作を実行"""
        try:
            # VS Code側のファイル操作APIを呼び出し
            params = {
                "operation": operation,
                "file_path": file_path,
                "content": content,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "file_operations",
                "tool_params": params
            })
            
            if response.get("success"):
                return f"File operation '{operation}' completed successfully for {file_path}"
            else:
                return f"File operation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"File operation error: {e}")
            return f"File operation error: {str(e)}"

class ProjectAnalysisTool(BaseTool):
    """プロジェクト分析ツール"""
    
    name: str = "project_analysis"
    description: str = "Analyze project structure, dependencies, and codebase"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
        object.__setattr__(self, 'logger', logging.getLogger(__name__))
    
    def _run(self, analysis_type: str, project_path: str = None, **kwargs) -> str:
        """プロジェクト分析を実行"""
        try:
            # VS Code側のプロジェクト分析APIを呼び出し
            params = {
                "analysis_type": analysis_type,
                "project_path": project_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "project_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                analysis_result = response.get("data", {})
                return json.dumps(analysis_result, indent=2)
            else:
                return f"Project analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Project analysis error: {e}")
            return f"Project analysis error: {str(e)}"

class DirectoryNavigationTool(BaseTool):
    """ディレクトリナビゲーションツール"""
    
    name: str = "directory_navigation"
    description: str = "Navigate directories, list files, and explore project structure"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
        object.__setattr__(self, 'logger', logging.getLogger(__name__))
    
    def _run(self, action: str, directory_path: str = None, **kwargs) -> str:
        """ディレクトリナビゲーションを実行"""
        try:
            # VS Code側のディレクトリ操作APIを呼び出し
            params = {
                "action": action,
                "directory_path": directory_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "directory_navigation",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                if isinstance(result, dict) and "files" in result:
                    # ファイルリストを整形
                    files = result["files"]
                    formatted_files = []
                    for file in files:
                        if file.endswith("/"):
                            formatted_files.append(f"📁 {file}")
                        else:
                            formatted_files.append(f"📄 {file}")
                    return "\n".join(formatted_files)
                else:
                    return json.dumps(result, indent=2)
            else:
                return f"Directory navigation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Directory navigation error: {e}")
            return f"Directory navigation error: {str(e)}"

class FileWatcherTool(BaseTool):
    """ファイル監視ツール"""
    
    name: str = "file_watcher"
    description: str = "Monitor file changes and modifications in the workspace"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
        object.__setattr__(self, 'logger', logging.getLogger(__name__))
    
    def _run(self, action: str, file_path: str = None, **kwargs) -> str:
        """ファイル監視を実行"""
        try:
            # VS Code側のファイル監視APIを呼び出し
            params = {
                "action": action,
                "file_path": file_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "file_watcher",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"File watcher failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"File watcher error: {e}")
            return f"File watcher error: {str(e)}"
