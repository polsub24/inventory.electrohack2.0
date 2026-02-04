import React, { useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { RequestStatus } from '../../types';
import Card from '../common/Card';

const DashboardMetrics: React.FC = () => {
  const { components, requests } = useInventory();

  const metrics = useMemo(() => {
    const totalComponents = components.reduce((sum, c) => sum + c.totalQuantity, 0);
    const reservedComponents = components.reduce((sum, c) => sum + c.reservedQuantity, 0);
    const activeRequests = requests.filter(r => r.status === RequestStatus.Pending || r.status === RequestStatus.Modified).length;
    const approvedRequests = requests.filter(r => r.status === RequestStatus.Approved).length;
    const lowStockAlerts = components.filter(c => (c.totalQuantity - c.reservedQuantity) > 0 && (c.totalQuantity - c.reservedQuantity) < 10).length;

    return { totalComponents, reservedComponents, activeRequests, approvedRequests, lowStockAlerts };
  }, [components, requests]);

  const MetricCard: React.FC<{title: string, value: number | string, icon: React.ReactElement, highlight?: boolean}> = ({ title, value, icon, highlight }) => (
    <div className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 group hover:shadow-lg ${highlight ? 'bg-amber-500/5 border-amber-500/30' : 'bg-gray-900/40 border-white/5 hover:border-white/10'}`}>
        <div className="flex justify-between items-start mb-4">
            <div className={`p-2.5 rounded-lg ${highlight ? 'bg-amber-500/20 text-amber-500' : 'bg-white/5 text-gray-400 group-hover:text-white group-hover:bg-white/10'} transition-colors`}>
                {icon}
            </div>
            {highlight && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span></span>}
        </div>
        <div>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none mb-1">{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 group-hover:text-gray-400 transition-colors">{title}</p>
        </div>
    </div>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <MetricCard title="Total Units" value={metrics.totalComponents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
      <MetricCard title="Reserved" value={metrics.reservedComponents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>} />
      <MetricCard title="Queue" value={metrics.activeRequests} highlight={metrics.activeRequests > 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      <MetricCard title="Ready" value={metrics.approvedRequests} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      <div className="col-span-2 lg:col-span-1">
        <MetricCard title="Low Stock" value={metrics.lowStockAlerts} highlight={metrics.lowStockAlerts > 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
      </div>
    </div>
  );
};

export default DashboardMetrics;