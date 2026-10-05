import { STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '../../../shared/task';

export type Filter = TaskStatus | 'ALL';

interface StatusFilterProps {
  value: Filter;
  onChange: (value: Filter) => void;
}

const OPTIONS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...TASK_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
];

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className="status-filter" role="group" aria-label="Filter tasks by status">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="filter-button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
