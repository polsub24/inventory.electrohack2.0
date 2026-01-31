
import React, { useState } from 'react';
import DashboardMetrics from '../components/admin/DashboardMetrics';
import RequestList from '../components/admin/RequestList';
import InventoryManager from '../components/admin/InventoryManager';
import { RequestStatus } from '../types';

const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'approved' | 'released' | 'inventory'>('active');

  const TabButton: React.FC<{tab: 'active' | 'approved' | 'released' | 'inventory', label: string}> = ({ tab, label }) => (
    <button
        onClick={() => setActiveTab(tab)}
        className={`whitespace-nowrap py-3 px-6 font-black text-xs uppercase tracking-widest transition-all duration-200 focus:outline-none border-b-2 ${
            activeTab === tab
            ? 'border-amber-500 text-amber-500 bg-amber-500/5'
            : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
        }`}
    >
        {label}
    </button>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-amber-500 uppercase italic tracking-tighter">Command Center</h1>
        <DashboardMetrics />
      </div>
      <div>
        <div className="border-b border-gray-800 overflow-x-auto">
            <nav className="flex space-x-1" aria-label="Tabs">
                <TabButton tab="active" label="Incoming Requests" />
                <TabButton tab="approved" label="Ready for Collection" />
                <TabButton tab="released" label="Released History" />
                <TabButton tab="inventory" label="Inventory Control" />
            </nav>
        </div>
        
        <div className="mt-6">
            {activeTab === 'active' && (
                <div className="fade-in">
                    <RequestList statuses={[RequestStatus.Pending, RequestStatus.Modified]} emptyMessage="NO PENDING REQUESTS IN QUEUE." />
                </div>
            )}
            {activeTab === 'approved' && (
                <div className="fade-in">
                    <RequestList statuses={[RequestStatus.Approved]} emptyMessage="NO APPROVED REQUESTS AWAITING COLLECTION." />
                </div>
            )}
            {activeTab === 'released' && (
                <div className="fade-in">
                    <RequestList statuses={[RequestStatus.Collected]} emptyMessage="NO REQUESTS HAVE BEEN RELEASED YET." />
                </div>
            )}
            {activeTab === 'inventory' && (
                <div className="fade-in">
                    <InventoryManager />
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
