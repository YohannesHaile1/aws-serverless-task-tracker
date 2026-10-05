import type { Task, TaskStatus } from '../../shared/task';
import type { TaskRepository } from '../src/taskRepository';
import type { ValidTaskInput } from '../src/validation';

/** Test double for TaskRepository: stores tasks in a Map instead of DynamoDB. */
export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks = new Map<string, Task>();

  async list(status?: TaskStatus): Promise<Task[]> {
    return [...this.tasks.values()]
      .filter((task) => !status || task.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async create(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async update(id: string, input: ValidTaskInput, updatedAt: string): Promise<Task | undefined> {
    const existing = this.tasks.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...input, updatedAt };
    this.tasks.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }
}
