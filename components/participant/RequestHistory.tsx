
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

  const TabButton: React.FC<{tab: Tab, label: string, icon: React.ReactElement}> = ({ tab, label, icon }) => (
    <button 
      onClick={() => setActiveTab(tab)}
      className={`flex-1 flex items-center justify-center p-3 text-[10px] font-black uppercase tracking-widest transition-all duration-200 border-b-2 ${
        activeTab === tab 
          ? 'bg-amber-500/5 text-amber-500 border-amber-500' 
          : 'text-gray-500 hover:text-gray-300 border-transparent'
      }`}
    >
        {icon}
        <span className="ml-2">{label}</span>
    </button>
  );

  return (
    <Card className="h-full border border-gray-800 bg-gray-900/20">
      <div className="flex border-b border-gray-800">
        <TabButton tab="pending" label="ACTIVE" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>} />
        <TabButton tab="collected" label="HISTORY" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm2 3a1 1 0 000 2h6a1 1 0 100-2H7z" /><path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm2-1a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1H4z" clipRule="evenodd" /></svg>} />
        <TabButton tab="rejected" label="CANCELLED" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>} />
      </div>
      <div className="mt-6 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {filteredRequests.length > 0 ? (
          filteredRequests.map(req => (
            <div key={req.id} className="bg-black/40 border border-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] text-gray-500 font-mono">{req.timestamp.toLocaleString()}</span>
                <StatusBadge status={req.status} />
              </div>
              <ul className="space-y-1">
                {req.items.map(item => {
                  const component = getComponentById(item.componentId);
                  return (
                    <li key={item.componentId} className="flex justify-between text-xs">
                      <span className="text-gray-300">{component?.name || 'Unknown Item'}</span>
                      <span className="text-amber-500 font-black">x {item.quantity}</span>
                    </li>
                  );
                })}
              </ul>
              {req.notes && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <p className="text-[10px] uppercase font-black text-amber-400">Moderator Note:</p>
                  <p className="text-xs text-gray-400 italic mt-1">"{req.notes}"</p>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 uppercase tracking-widest text-[10px] py-12">No requests found in this category.</p>
        )}
      </div>
    </Card>
  );
};

export default RequestHistory;
