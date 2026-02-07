
import React from 'react';
import { RequestStatus } from '../../types';

interface StatusBadgeProps {
  status: RequestStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const statusConfig = {
    [RequestStatus.Pending]: { text: 'PENDING', color: 'border-yellow-500/30 text-yellow-400' },
    [RequestStatus.Modified]: { text: 'MODIFIED', color: 'border-amber-400/30 text-amber-300' },
    [RequestStatus.Approved]: { text: 'READY', color: 'border-green-500/30 text-green-400' },
    [RequestStatus.Rejected]: { text: 'REJECTED', color: 'border-red-500/30 text-red-400' },
    [RequestStatus.Collected]: { text: 'COLLECTED', color: 'border-gray-500/30 text-gray-400' },
    [RequestStatus.Returned]: { text: 'RETURNED', color: 'border-blue-500/30 text-blue-400' },
  };

  const { text, color } = statusConfig[status] || { text: 'UNKNOWN', color: 'border-gray-700 text-gray-500' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 border rounded text-[8px] font-black tracking-widest uppercase ${color}`}>
      {text}
    </span>
  );
};

export default StatusBadge;
