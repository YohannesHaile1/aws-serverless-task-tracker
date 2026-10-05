import type { Task, TaskInput, TaskStatus } from '../../shared/task';

// Set in frontend/.env.local (see .env.example). Trailing slashes are trimmed.
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');

/** An error with a message that is safe and useful to show the user. */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('The API URL is not configured. Set VITE_API_URL in frontend/.env.local.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    // fetch only rejects on network failures (offline, server down, or a CORS block).
    throw new ApiError('Could not reach the server. Check your connection and that the API is running.');
  }

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (response.status >= 500) {
    return 'Something went wrong on the server. Please try again.';
  }
  try {
    // The API's 4xx errors look like { "message": "title is required ..." }.
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Not JSON; fall through to the generic message.
  }
  return `Request failed (HTTP ${response.status}).`;
}

export const api = {
  listTasks: (status?: TaskStatus) =>
    request<Task[]>(status ? `/tasks?status=${encodeURIComponent(status)}` : '/tasks'),

  createTask: (input: TaskInput) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTask: (id: string, input: TaskInput) =>
    request<Task>(`/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),

  deleteTask: (id: string) => request<void>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Turns any thrown value into a message for the UI. */
export function messageFrom(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something unexpected went wrong. Please try again.';
}
