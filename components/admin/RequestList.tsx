import React, { useState, useEffect, useRef, createRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { useAnimation } from '../../context/AnimationContext';
import { RequestStatus } from '../../types';
import Card from '../common/Card';
import StatusBadge from '../common/StatusBadge';

interface RequestListProps {
  statuses: RequestStatus[];
  emptyMessage: string;
}

const RequestList: React.FC<RequestListProps> = ({ statuses, emptyMessage }) => {
  const { requests } = useInventory();
  const { triggerSpark } = useAnimation();
  const navigate = useNavigate();
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  
  const rowRefs = useRef<Map<string, React.RefObject<HTMLTableRowElement>>>(new Map());

  const filteredRequests = requests
    .filter(r => statuses.includes(r.status))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Ensure refs are created for each request
  filteredRequests.forEach(req => {
    if (!rowRefs.current.has(req.id)) {
      rowRefs.current.set(req.id, createRef<HTMLTableRowElement>());
    }
  });

  const prevFilteredIdsRef = useRef<Set<string>>(new Set(filteredRequests.map(r => r.id)));

  useEffect(() => {
      const currentIds = new Set(filteredRequests.map(r => r.id));
      const prevIds = prevFilteredIdsRef.current;

      const newlyAddedIds = [...currentIds].filter(id => !prevIds.has(id));

      if (newlyAddedIds.length > 0) {
          setNewRequestIds(current => new Set([...current, ...newlyAddedIds]));
          
          newlyAddedIds.forEach(id => {
              const rowRef = rowRefs.current.get(id);
              if (rowRef?.current) {
                  const rect = rowRef.current.getBoundingClientRect();
                  triggerSpark(rect.left + 30, rect.top + rect.height / 2);
              }
          });

          const timer = setTimeout(() => {
              setNewRequestIds(current => {
                  const newSet = new Set(current);
                  newlyAddedIds.forEach(id => newSet.delete(id));
                  return newSet;
              });
          }, 5000); // Highlight duration
          
          return () => clearTimeout(timer);
      }

      prevFilteredIdsRef.current = currentIds;
  }, [filteredRequests, triggerSpark]);


  if (filteredRequests.length === 0) {
    return <Card className="border border-white/5 bg-gray-900/10 backdrop-blur-sm"><p className="text-center text-gray-500 py-12 uppercase tracking-widest text-[10px] sm:text-xs md:text-sm font-black">{emptyMessage}</p></Card>;
  }

  return (
    <Card className="border border-white/5 bg-gray-900/20 p-0 overflow-hidden backdrop-blur-sm">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left min-w-[700px]">
          <thead className="bg-white/5 border-b border-white/5">
            <tr>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Team Name</th>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Leader</th>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Reg #</th>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Time</th>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Status</th>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredRequests.map(req => (
              <tr 
                key={req.id} 
                ref={rowRefs.current.get(req.id)}
                className={`group transition-all duration-300 ${newRequestIds.has(req.id) ? 'bg-amber-500/10' : 'hover:bg-white/5'}`}
              >
                <td className="p-4 font-bold text-gray-100 text-xs md:text-base">{req.team.teamName}</td>
                <td className="p-4 text-gray-400 text-xs md:text-sm">{req.team.leaderName}</td>
                <td className="p-4 text-gray-500 font-mono text-xs md:text-sm uppercase">{req.team.registrationNumber}</td>
                <td className="p-4 text-gray-500 text-xs md:text-sm font-mono">{req.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="p-4"><StatusBadge status={req.status} /></td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => navigate(`/admin/request/${req.id}`)}
                    className="text-[10px] font-bold uppercase tracking-widest text-amber-500 hover:text-white border border-amber-500/30 hover:bg-amber-500 px-3 py-1.5 rounded transition-all opacity-80 group-hover:opacity-100"
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