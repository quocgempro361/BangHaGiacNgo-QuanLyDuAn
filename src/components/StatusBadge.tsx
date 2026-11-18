import React from 'react';
import { TaskStatus } from '../types/project';
import { getStatusMeta } from '../utils/taskHelpers';

interface StatusBadgeProps {
  status: TaskStatus | null;
  compact?: boolean;
  soft?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  compact = false,
  soft = false,
  className = '',
}) => {
  const meta = getStatusMeta(status);

  const badgeStyle: React.CSSProperties = soft
    ? {
        backgroundColor: `color-mix(in srgb, ${meta.bg} 74%, #FFFDFC)`,
        color: meta.text,
        borderColor: `color-mix(in srgb, ${meta.border} 58%, transparent)`,
      }
    : {
        backgroundColor: meta.bg,
        color: meta.text,
        borderColor: meta.border,
      };

  return (
    <span
      style={badgeStyle}
      className={`inline-flex items-center justify-center font-semibold border whitespace-nowrap shrink-0 leading-none tracking-[0.005em] ${
        soft ? 'rounded-lg' : 'rounded-md'
      } ${
        compact
          ? soft
            ? 'px-2.5 h-[27px] text-[11.5px]'
            : 'px-2.5 h-[26px] text-[11px]'
          : 'px-3 h-[30px] text-xs'
      } ${className}`}
    >
      {meta.label}
    </span>
  );
};
