import React from 'react';
import { TaskStatus } from '../types/project';
import { getStatusMeta } from '../utils/taskHelpers';

interface StatusBadgeProps {
  status: TaskStatus | null;
  compact?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  compact = false,
}) => {
  const meta = getStatusMeta(status);

  return (
    <span
      style={{
        backgroundColor: meta.bg,
        color: meta.text,
        borderColor: meta.border,
      }}
      className={`inline-flex items-center font-medium border rounded-md whitespace-nowrap shrink-0 ${
        compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {meta.label}
    </span>
  );
};
