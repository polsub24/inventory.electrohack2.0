import React, { useState } from 'react';
import DashboardMetrics from '../components/admin/DashboardMetrics';
import RequestList from '../components/admin/RequestList';
import InventoryManager from '../components/admin/InventoryManager';
import TeamRegistration from '../components/admin/TeamRegistration';
import { RequestStatus } from '../types';
import { useInventory } from '../context/InventoryContext';

const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'approved' | 'released' | 'inventory' | 'register'>('active');
  const { lastSync } = useInventory();

  const TabButton: React.FC<{ tab: 'active' | 'approved' | 'released' | 'inventory' | 'register', label: string }> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`whitespace-nowrap py-4 px-6 sm:px-10 font-black text-xs sm:text-sm uppercase tracking-widest transition-all duration-200 focus:outline-none border-b-2 ${activeTab === tab
        ? 'border-amber-500 text-amber-500 bg-amber-500/5'
        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 sm:space-y-12 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-black text-amber-500 uppercase italic tracking-tighter">Admin Dashboard</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mt-1 font-bold">Control & Monitoring System</p>
        </div>
        <div className="flex items-center space-x-2 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Live Sync: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>

      <DashboardMetrics />

      <div>
        <div className="border-b border-gray-800 overflow-x-auto no-scrollbar scroll-smooth">
          <nav className="flex min-w-max sm:min-w-0" aria-label="Tabs">
            <TabButton tab="active" label="Queue" />
            <TabButton tab="approved" label="Approved" />
            <TabButton tab="released" label="History" />
            <TabButton tab="inventory" label="Manage Items" />
            <TabButton tab="register" label="Register Teams" />
          </nav>
        </div>

        <div className="mt-6 sm:mt-10">
          {activeTab === 'active' && (
            <div className="fade-in">
              <RequestList statuses={[RequestStatus.Pending, RequestStatus.Modified]} emptyMessage="No incoming requests found." />
            </div>
          )}
          {activeTab === 'approved' && (
            <div className="fade-in">
              <RequestList statuses={[RequestStatus.Approved]} emptyMessage="No approved requests awaiting collection." />
            </div>
          )}
          {activeTab === 'released' && (
            <div className="fade-in">
              <RequestList statuses={[RequestStatus.Collected]} emptyMessage="No release history available." />
            </div>
          )}
          {activeTab === 'inventory' && (
            <div className="fade-in">
              <InventoryManager />
            </div>
          )}
          {activeTab === 'register' && (
            <div className="fade-in">
              <TeamRegistration />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;