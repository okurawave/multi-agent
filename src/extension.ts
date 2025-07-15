import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('CrewAI Connect extension is now active!');

    // Hello Worldコマンドを登録
    const disposable = vscode.commands.registerCommand('crewai-connect.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from CrewAI Connect!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}
