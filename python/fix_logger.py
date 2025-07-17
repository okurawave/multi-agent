import re

# Fix all tool files for logger
files = ['tools/file_tools.py', 'tools/command_tools.py', 'tools/workspace_tools.py', 'tools/code_tools.py']

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix self.logger
    content = content.replace("self.logger = logging.getLogger(__name__)", "object.__setattr__(self, 'logger', logging.getLogger(__name__))")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fixed logger in {file_path}")

print("All tool files fixed for logger")
