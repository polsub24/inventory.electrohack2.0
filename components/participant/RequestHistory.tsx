import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { RequestStatus, Request } from '../../types';
import Card from '../common/Card';
import StatusBadge from '../common/StatusBadge';

type Tab = 'pending' | 'collected' | 'rejected';

const RequestHistory: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const { user } = useAuth();
  const { getRequestsForTeam, getComponentById } = useInventory();

  const requests = useMemo(() => {
    if (!user) return [];
    return getRequestsForTeam(user.id);
  }, [user, getRequestsForTeam]);

  const filteredRequests = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return requests.filter(r => 
          r.status === RequestStatus.Pending || 
          r.status === RequestStatus.Modified || 
          r.status === RequestStatus.Approved
        );
      case 'collected':
        return requests.filter(r => r.status === RequestStatus.Collected);
      case 'rejected':
        return requests.filter(r => r.status === RequestStatus.Rejected);
      default:
        return [];
    }
  }, [activeTab, requests]);

  const TabButton: React.FC<{tab: Tab, label: string}> = ({ tab, label }) => (
    <button 
      onClick={() => setActiveTab(tab)}
      className={`flex-1 py-3 text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-200 border-b-2 ${
        activeTab === tab 
          ? 'bg-amber-500/5 text-amber-500 border-amber-500' 
          : 'text-gray-500 hover:text-gray-300 border-transparent'
      }`}
    >
        {label}
    </button>
  );

  return (
    <Card className="h-full border border-gray-800 bg-gray-900/20 p-0 overflow-hidden">
      <div className="flex border-b border-gray-800 bg-black/20">
        <TabButton tab="pending" label="ACTIVE" />
        <TabButton tab="collected" label="HISTORY" />
        <TabButton tab="rejected" label="CANCELLED" />
      </div>
      <div className="p-4 sm:p-6 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {filteredRequests.length > 0 ? (
          filteredRequests.map(req => (
            <div key={req.id} className="bg-black/40 border border-gray-800/50 p-3 sm:p-4 rounded-lg fade-in">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[9px] text-gray-500 font-mono">{req.timestamp.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                <StatusBadge status={req.status} />
              </div>
              <ul className="space-y-1">
                {req.items.map(item => {
                  const component = getComponentById(item.componentId);
                  return (
                    <li key={item.componentId} className="flex justify-between text-[11px] sm:text-xs">
                      <span className="text-gray-300 line-clamp-1 mr-2">{component?.name || 'Unknown Item'}</span>
                      <span className="text-amber-500 font-black flex-shrink-0">x{item.quantity}</span>
                    </li>
                  );
                })}
              </ul>
              {req.notes && (
                <div className="mt-3 pt-3 border-t border-gray-800/50">
                  <p className="text-[9px] uppercase font-black text-amber-500/80">Staff Note:</p>
                  <p className="text-[10px] sm:text-xs text-gray-400 italic mt-1 leading-relaxed">"{req.notes}"</p>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 opacity-30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-center text-gray-500 uppercase tracking-widest text-[9px] sm:text-[10px] font-black">No requests in this queue</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default RequestHistory;