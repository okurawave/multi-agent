/**
 * IPCMessageTypes
 * IPC通信で使用するメッセージタイプの定義
 */

export enum IPCMessageType {
    // Request types
    START_TASK = 'start_task',
    STOP_TASK = 'stop_task',
    GET_TASK_STATUS = 'get_task_status',
    LIST_TASKS = 'list_tasks',
    LLM_REQUEST = 'llm_request',
    TOOL_REQUEST = 'tool_request',
    HEALTH_CHECK = 'health_check',
    SHUTDOWN = 'shutdown',
    
    // Notification types
    TASK_PROGRESS = 'task_progress',
    TASK_COMPLETED = 'task_completed',
    TASK_FAILED = 'task_failed',
    LOG_MESSAGE = 'log_message',
    STATUS_UPDATE = 'status_update'
}

export interface IPCRequest {
    id: string;
    method: IPCMessageType;
    params: any;
    timestamp: number;
}

export interface IPCResponse {
    id: string;
    result?: any;
    error?: string;
    timestamp: number;
}

export interface IPCNotification {
    method: IPCMessageType;
    params: any;
    timestamp: number;
}

export interface TaskProgressNotification {
    taskId: string;
    progress: number;
    status: string;
    message?: string;
    currentAgent?: string;
    currentAction?: string;
}

export interface TaskCompletedNotification {
    taskId: string;
    result: any;
    duration: number;
    summary?: string;
}

export interface TaskFailedNotification {
    taskId: string;
    error: string;
    duration: number;
    stackTrace?: string;
}

export interface LogMessageNotification {
    level: 'debug' | 'info' | 'warning' | 'error';
    message: string;
    source?: string;
    timestamp: number;
}

export interface StatusUpdateNotification {
    systemStatus: 'idle' | 'busy' | 'error';
    activeTaskCount: number;
    totalTasksCompleted: number;
    memoryUsage?: number;
    cpuUsage?: number;
}
