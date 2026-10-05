import { useId } from 'react';
import { STATUS_LABELS, TASK_STATUSES, type Task, type TaskInput, type TaskStatus } from '../../../shared/task';
import { TaskForm } from './TaskForm';

interface TaskItemProps {
  task: Task;
  isEditing: boolean;
  /** True while a status change or delete for this task is in flight. */
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
}

export function TaskItem({ task, isEditing, busy, onEdit, onCancelEdit, onSave, onStatusChange, onDelete }: TaskItemProps) {
  const statusId = useId();

  if (isEditing) {
    return (
      <li className="task editing">
        <TaskForm initialTask={task} submitLabel="Save changes" onSubmit={onSave} onCancel={onCancelEdit} />
      </li>
    );
  }

  const overdue = task.dueDate !== null && task.status !== 'COMPLETED' && task.dueDate < today();

  return (
    <li className={`task status-${task.status.toLowerCase()}`} aria-busy={busy}>
      <div className="task-main">
        <h3 className="task-title">{task.title}</h3>
        {task.description && <p className="task-description">{task.description}</p>}
        {task.dueDate && (
          <p className={overdue ? 'task-due overdue' : 'task-due'}>
            Due {formatDate(task.dueDate)}
            {overdue && ' (overdue)'}
          </p>
        )}
      </div>

      <div className="task-actions">
        <label className="visually-hidden" htmlFor={statusId}>
          Status for {task.title}
        </label>
        <select
          id={statusId}
          className="status-select"
          value={task.status}
          disabled={busy}
          onChange={(e) => onStatusChange(e.target.value as TaskStatus)}
        >
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <button type="button" className="button" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button type="button" className="button danger" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </li>
  );
}

/** Today's date as YYYY-MM-DD in the user's time zone. */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

function formatDate(date: string): string {
  // Parse as local midnight so the date doesn't shift by a day in some time zones.
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
