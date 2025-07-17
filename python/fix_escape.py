import re

# Fix all tool files
files = ['tools/file_tools.py', 'tools/command_tools.py', 'tools/workspace_tools.py', 'tools/code_tools.py']

for file_path in files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the escape character issue
    content = content.replace("\\'", "'")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Fixed {file_path}")

print("All tool files fixed")
