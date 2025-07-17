#!/usr/bin/env python3
"""
Fix tool initialization for CrewAI BaseTools
"""

import os
import re
from pathlib import Path

def fix_tool_init():
    """Fix __init__ methods in all tool files"""
    tools_dir = Path("tools")
    
    # Pattern to match the problematic line
    pattern = r'(\s+)self\.ipc_callback = ipc_callback'
    replacement = r'\1object.__setattr__(self, \'ipc_callback\', ipc_callback)'
    
    for tool_file in tools_dir.glob("*_tools.py"):
        print(f"Processing {tool_file}")
        
        with open(tool_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Replace all instances
        new_content = re.sub(pattern, replacement, content)
        
        if new_content != content:
            with open(tool_file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Fixed {tool_file}")
        else:
            print(f"No changes needed for {tool_file}")

if __name__ == "__main__":
    fix_tool_init()
