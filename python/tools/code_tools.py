"""
Code Analysis and Generation Tools
コード分析・生成関連のツール
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from crewai.tools import BaseTool

class CodeAnalysisTool(BaseTool):
    """コード分析ツール"""
    
    name: str = "code_analysis"
    description: str = "Analyze code structure, complexity, and quality"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, analysis_type: str, file_path: str = None, code_content: str = None, **kwargs) -> str:
        """コード分析を実行"""
        try:
            # VS Code側のコード分析APIを呼び出し
            params = {
                "analysis_type": analysis_type,
                "file_path": file_path,
                "code_content": code_content,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "code_analysis",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Code analysis failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Code analysis error: {e}")
            return f"Code analysis error: {str(e)}"

class CodeGenerationTool(BaseTool):
    """コード生成ツール"""
    
    name: str = "code_generation"
    description: str = "Generate code based on specifications and templates"
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__()
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def _run(self, generation_type: str, specification: str, target_language: str = None, **kwargs) -> str:
        """コード生成を実行"""
        try:
            # VS Code側のコード生成APIを呼び出し
            params = {
                "generation_type": generation_type,
                "specification": specification,
                "target_language": target_language,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "code_generation",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                generated_code = result.get("generated_code", "")
                return f"Generated code:\n\n```{target_language or 'text'}\n{generated_code}\n```"
            else:
                return f"Code generation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Code generation error: {e}")
            return f"Code generation error: {str(e)}"

class RefactoringTool(BaseTool):
    """リファクタリングツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="refactoring",
            description="Perform code refactoring and optimization"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, refactoring_type: str, file_path: str, target_code: str = None, **kwargs) -> str:
        """リファクタリングを実行"""
        try:
            # VS Code側のリファクタリングAPIを呼び出し
            params = {
                "refactoring_type": refactoring_type,
                "file_path": file_path,
                "target_code": target_code,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "refactoring",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Refactoring failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Refactoring error: {e}")
            return f"Refactoring error: {str(e)}"

class CodeLinterTool(BaseTool):
    """コードリンターツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="code_linter",
            description="Lint code for style and potential issues"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, linter_type: str, file_path: str = None, code_content: str = None, **kwargs) -> str:
        """コードリンティングを実行"""
        try:
            # VS Code側のコードリンターAPIを呼び出し
            params = {
                "linter_type": linter_type,
                "file_path": file_path,
                "code_content": code_content,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "code_linter",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                return json.dumps(result, indent=2)
            else:
                return f"Code linting failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Code linting error: {e}")
            return f"Code linting error: {str(e)}"

class DocumentationGeneratorTool(BaseTool):
    """ドキュメント生成ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="documentation_generator",
            description="Generate documentation from code"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, doc_type: str, source_path: str, output_format: str = "markdown", **kwargs) -> str:
        """ドキュメント生成を実行"""
        try:
            # VS Code側のドキュメント生成APIを呼び出し
            params = {
                "doc_type": doc_type,
                "source_path": source_path,
                "output_format": output_format,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "documentation_generator",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                generated_doc = result.get("generated_documentation", "")
                return f"Generated documentation:\n\n{generated_doc}"
            else:
                return f"Documentation generation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Documentation generation error: {e}")
            return f"Documentation generation error: {str(e)}"

class CodeFormatterTool(BaseTool):
    """コードフォーマッターツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="code_formatter",
            description="Format code according to style guidelines"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, formatter_type: str, file_path: str = None, code_content: str = None, **kwargs) -> str:
        """コードフォーマットを実行"""
        try:
            # VS Code側のコードフォーマッターAPIを呼び出し
            params = {
                "formatter_type": formatter_type,
                "file_path": file_path,
                "code_content": code_content,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "code_formatter",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                formatted_code = result.get("formatted_code", "")
                return f"Formatted code:\n\n```\n{formatted_code}\n```"
            else:
                return f"Code formatting failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Code formatting error: {e}")
            return f"Code formatting error: {str(e)}"

class TestGeneratorTool(BaseTool):
    """テスト生成ツール"""
    
    def __init__(self, ipc_callback: Callable[[str, Dict[str, Any]], Dict[str, Any]]):
        super().__init__(
            name="test_generator",
            description="Generate unit tests for code"
        )
        object.__setattr__(self, 'ipc_callback', ipc_callback)
    
    def execute(self, test_type: str, source_file: str, test_framework: str = None, **kwargs) -> str:
        """テスト生成を実行"""
        try:
            # VS Code側のテスト生成APIを呼び出し
            params = {
                "test_type": test_type,
                "source_file": source_file,
                "test_framework": test_framework,
                **kwargs
            }
            
            response = self.ipc_callback("tool_request", {
                "tool_name": "test_generator",
                "tool_params": params
            })
            
            if response.get("success"):
                result = response.get("data", {})
                generated_tests = result.get("generated_tests", "")
                return f"Generated tests:\n\n```\n{generated_tests}\n```"
            else:
                return f"Test generation failed: {response.get('error', 'Unknown error')}"
                
        except Exception as e:
            self.logger.error(f"Test generation error: {e}")
            return f"Test generation error: {str(e)}"
