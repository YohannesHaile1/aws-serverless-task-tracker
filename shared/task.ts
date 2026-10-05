// Shared between the backend (Lambda) and the frontend (React).
// Plain TypeScript with no dependencies, so both sides can import it directly.

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Calendar date in YYYY-MM-DD format, or null when the task has no due date. */
  dueDate: string | null;
  /** ISO 8601 timestamps, set by the server. */
  createdAt: string;
  updatedAt: string;
}

/** The fields a client sends for POST /tasks and PUT /tasks/{id}. */
export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  dueDate?: string | null;
}

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 2000;

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}
