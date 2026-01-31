
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { RequestStatus } from '../../types';
import Card from '../common/Card';
import StatusBadge from '../common/StatusBadge';

interface RequestListProps {
  statuses: RequestStatus[];
  emptyMessage: string;
}

const RequestList: React.FC<RequestListProps> = ({ statuses, emptyMessage }) => {
  const { requests } = useInventory();
  const navigate = useNavigate();

  const filteredRequests = requests
    .filter(r => statuses.includes(r.status))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (filteredRequests.length === 0) {
    return <Card className="border border-gray-800 bg-gray-900/10"><p className="text-center text-gray-500 py-10 uppercase tracking-widest text-xs font-black">{emptyMessage}</p></Card>;
  }

  return (
    <Card className="border border-gray-800 bg-gray-900/20 p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-black/40">
            <tr>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Team Name</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Reg #</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Time</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Status</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filteredRequests.map(req => (
              <tr key={req.id} className="hover:bg-amber-500/5 transition-colors group">
                <td className="p-4 font-black text-gray-100">{req.team.teamName}</td>
                <td className="p-4 text-gray-400 font-mono text-xs uppercase">{req.team.registrationNumber}</td>
                <td className="p-4 text-gray-400 text-xs font-mono">{req.timestamp.toLocaleTimeString()}</td>
                <td className="p-4"><StatusBadge status={req.status} /></td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => navigate(`/admin/request/${req.id}`)}
                    className="text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-white border border-amber-500/30 hover:bg-amber-500 px-3 py-1 rounded transition-all"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default RequestList;
