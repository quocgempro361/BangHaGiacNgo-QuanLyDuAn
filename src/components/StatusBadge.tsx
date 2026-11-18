import React from 'react';
import { TaskStatus } from '../types/project';
import { getStatusMeta } from '../utils/taskHelpers';

interface StatusBadgeProps {
  status: TaskStatus | null;
  compact?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  compact = false,
  className = '',
}) => {
  const meta = getStatusMeta(status);

  return (
    <span
      style={{
        backgroundColor: meta.bg,
        color: meta.text,
        borderColor: meta.border,
      }}
      className={`inline-flex items-center justify-center font-semibold border rounded-md whitespace-nowrap shrink-0 leading-none ${
        compact
          ? 'px-2.5 h-[26px] text-[11px]'
          : 'px-3 h-[30px] text-xs'
      } ${className}`}
    >
      {meta.label}
    </span>
  );
};
