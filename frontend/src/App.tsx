import { useEffect, useState } from 'react';
import { STATUS_LABELS, type Task, type TaskInput, type TaskStatus } from '../../shared/task';
import { ApiError, api, messageFrom } from './api';
import { StatusFilter, type Filter } from './components/StatusFilter';
import { TaskForm } from './components/TaskForm';
import { TaskItem } from './components/TaskItem';

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch the list whenever the filter changes (or on "Try again").
  // The filtering itself happens in the API, via the DynamoDB status index.
  useEffect(() => {
    let ignore = false; // drop responses that arrive after the filter changed again
    setLoadState({ kind: 'loading' });
    api.listTasks(filter === 'ALL' ? undefined : filter).then(
      (result) => {
        if (ignore) return;
        setTasks(result);
        setLoadState({ kind: 'ready' });
      },
      (error) => {
        if (!ignore) setLoadState({ kind: 'error', message: messageFrom(error) });
      },
    );
    return () => {
      ignore = true;
    };
  }, [filter, reloadCount]);

  const matchesFilter = (task: Task) => filter === 'ALL' || task.status === filter;

  /** Puts an updated task into the list, or removes it if it no longer matches the filter. */
  function applyUpdate(updated: Task) {
    setTasks((current) =>
      matchesFilter(updated)
        ? current.map((task) => (task.id === updated.id ? updated : task))
        : current.filter((task) => task.id !== updated.id),
    );
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** A 404 on an existing row means it was deleted elsewhere (another tab, curl...). */
  function removeMissingTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
    setEditingId((current) => (current === id ? null : current));
    setActionError('That task no longer exists. It may have been deleted somewhere else.');
  }

  // Errors from these two propagate to TaskForm, which shows them next to the form.
  async function createTask(input: TaskInput) {
    const task = await api.createTask(input);
    if (matchesFilter(task)) setTasks((current) => [task, ...current]);
  }

  async function saveEdit(id: string, input: TaskInput) {
    try {
      applyUpdate(await api.updateTask(id, input));
      setEditingId(null);
    } catch (error) {
      if (!isNotFound(error)) throw error;
      removeMissingTask(id);
    }
  }

  // Status changes and deletes happen from the list row; their errors show in a banner.
  async function runTaskAction(id: string, action: () => Promise<void>) {
    setBusy(id, true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      if (isNotFound(error)) removeMissingTask(id);
      else setActionError(messageFrom(error));
    } finally {
      setBusy(id, false);
    }
  }

  function changeStatus(task: Task, status: TaskStatus) {
    void runTaskAction(task.id, async () => {
      const { title, description, dueDate } = task;
      applyUpdate(await api.updateTask(task.id, { title, description, status, dueDate }));
    });
  }

  function deleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    void runTaskAction(task.id, async () => {
      try {
        await api.deleteTask(task.id);
      } catch (error) {
        // Already gone is the outcome the user wanted, so a 404 counts as success.
        if (!isNotFound(error)) throw error;
      }
      setTasks((current) => current.filter((t) => t.id !== task.id));
    });
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    setEditingId(null);
  }

  function renderList() {
    if (loadState.kind === 'loading') {
      return (
        <p className="list-message" role="status">
          Loading tasks…
        </p>
      );
    }

    if (loadState.kind === 'error') {
      return (
        <div className="banner error" role="alert">
          <span>Couldn't load tasks. {loadState.message}</span>
          <button type="button" className="button" onClick={() => setReloadCount((n) => n + 1)}>
            Try again
          </button>
        </div>
      );
    }

    if (tasks.length === 0) {
      return (
        <div className="empty-state">
          {filter === 'ALL' ? (
            <>
              <p className="empty-title">No tasks yet</p>
              <p>Add your first task using the form above.</p>
            </>
          ) : (
            <p className="empty-title">No tasks with status “{STATUS_LABELS[filter]}”</p>
          )}
        </div>
      );
    }

    return (
      <ul className="task-list">
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            isEditing={editingId === task.id}
            busy={busyIds.has(task.id)}
            onEdit={() => setEditingId(task.id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(input) => saveEdit(task.id, input)}
            onStatusChange={(status) => changeStatus(task, status)}
            onDelete={() => deleteTask(task)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Tracker</h1>
        <p>React → API Gateway → Lambda → DynamoDB</p>
      </header>

      <main>
        <section className="card" aria-labelledby="new-task-heading">
          <h2 id="new-task-heading">New task</h2>
          <TaskForm submitLabel="Add task" onSubmit={createTask} />
        </section>

        <section className="card" aria-labelledby="tasks-heading">
          <div className="list-header">
            <h2 id="tasks-heading">
              Tasks
              {loadState.kind === 'ready' && <span className="count">{tasks.length}</span>}
            </h2>
            <StatusFilter value={filter} onChange={changeFilter} />
          </div>

          {actionError && (
            <div className="banner error" role="alert">
              <span>{actionError}</span>
              <button type="button" className="button" onClick={() => setActionError(null)}>
                Dismiss
              </button>
            </div>
          )}

          {renderList()}
        </section>
      </main>
    </div>
  );
}
