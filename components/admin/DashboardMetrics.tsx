
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

  const MetricCard: React.FC<{title: string, value: number | string, icon: React.ReactElement}> = ({ title, value, icon }) => (
    <Card className="flex items-center p-5 border border-amber-500/10 hover:border-amber-500/30 transition-colors">
        <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500 mr-4 border border-amber-500/20">
            {icon}
        </div>
        <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{title}</p>
            <p className="text-2xl font-black text-white">{value}</p>
        </div>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mt-6">
      <MetricCard title="Total Inventory" value={metrics.totalComponents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V3m0 18v-3" /></svg>} />
      <MetricCard title="Reserved" value={metrics.reservedComponents} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      <MetricCard title="Awaiting Approval" value={metrics.activeRequests} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>} />
      <MetricCard title="Ready to Collect" value={metrics.approvedRequests} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      <MetricCard title="Low Stock" value={metrics.lowStockAlerts} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
    </div>
  );
};

export default DashboardMetrics;
