import { useId, useState, type FormEvent } from 'react';
import {
  DESCRIPTION_MAX_LENGTH,
  STATUS_LABELS,
  TASK_STATUSES,
  TITLE_MAX_LENGTH,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '../../../shared/task';
import { messageFrom } from '../api';

interface TaskFormProps {
  /** When given, the form edits this task; otherwise it creates a new one. */
  initialTask?: Task;
  submitLabel: string;
  /** Should throw on failure; the form shows the error message. */
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel?: () => void;
}

export function TaskForm({ initialTask, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initialTask?.title ?? '');
  const [description, setDescription] = useState(initialTask?.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(initialTask?.dueDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Quick check for instant feedback; the API validates everything again.
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), status, dueDate: dueDate || null });
      if (!initialTask) {
        setTitle('');
        setDescription('');
        setStatus('TODO');
        setDueDate('');
      }
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX_LENGTH}
          placeholder="What needs doing?"
          required
        />
      </div>

      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={2}
          placeholder="Optional details"
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`${id}-status`}>Status</label>
          <select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${id}-due`}>Due date</label>
          <input id={`${id}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="button primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
