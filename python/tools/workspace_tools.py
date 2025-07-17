"""
Workspace Analysis Tools
ワークスペース分析関連のツール
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from crewai.tools import BaseTool

class WorkspaceAnalysisTool(BaseTool):
    """ワークスペース分析ツール"""
    
    name: str = "workspace_analysis"
    description: str = "Analyze workspace structure, configuration, and project settings"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, analysis_type: str, workspace_path: str = None, **kwargs) -> str:
        """ワークスペース分析を実行"""
        try:
            # VS Code側のワークスペース分析APIを呼び出し
            params = {
                "analysis_type": analysis_type,
                "workspace_path": workspace_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "workspace_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Workspace analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Workspace analysis error: {e}")
            return f"Workspace analysis error: {str(e)}"

class DependencyAnalysisTool(BaseTool):
    """依存関係分析ツール"""
    
    name: str = "dependency_analysis"
    description: str = "Analyze project dependencies and their relationships"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, dependency_type: str, project_path: str = None, **kwargs) -> str:
        """依存関係分析を実行"""
        try:
            # VS Code側の依存関係分析APIを呼び出し
            params = {
                "dependency_type": dependency_type,
                "project_path": project_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "dependency_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Dependency analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Dependency analysis error: {e}")
            return f"Dependency analysis error: {str(e)}"

class ConfigurationAnalysisTool(BaseTool):
    """設定分析ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="configuration_analysis",
            description="Analyze project configuration files and settings"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, config_type: str, config_path: str = None, **kwargs) -> str:
        """設定分析を実行"""
        try:
            # VS Code側の設定分析APIを呼び出し
            params = {
                "config_type": config_type,
                "config_path": config_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "configuration_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Configuration analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Configuration analysis error: {e}")
            return f"Configuration analysis error: {str(e)}"

class ProjectMetricsTool(BaseTool):
    """プロジェクトメトリクスツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="project_metrics",
            description="Calculate project metrics like lines of code, complexity, etc."
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, metric_type: str, project_path: str = None, **kwargs) -> str:
        """プロジェクトメトリクスを計算"""
        try:
            # VS Code側のプロジェクトメトリクスAPIを呼び出し
            params = {
                "metric_type": metric_type,
                "project_path": project_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "project_metrics",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Project metrics calculation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Project metrics calculation error: {e}")
            return f"Project metrics calculation error: {str(e)}"

class EnvironmentAnalysisTool(BaseTool):
    """環境分析ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="environment_analysis",
            description="Analyze development environment and runtime configuration"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, environment_type: str, **kwargs) -> str:
        """環境分析を実行"""
        try:
            # VS Code側の環境分析APIを呼び出し
            params = {
                "environment_type": environment_type,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "environment_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Environment analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Environment analysis error: {e}")
            return f"Environment analysis error: {str(e)}"

class TestDiscoveryTool(BaseTool):
    """テスト発見ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="test_discovery",
            description="Discover and analyze test files and test coverage"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, discovery_type: str, project_path: str = None, **kwargs) -> str:
        """テスト発見を実行"""
        try:
            # VS Code側のテスト発見APIを呼び出し
            params = {
                "discovery_type": discovery_type,
                "project_path": project_path,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "test_discovery",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Test discovery failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Test discovery error: {e}")
            return f"Test discovery error: {str(e)}"
