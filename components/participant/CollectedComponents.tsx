import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { RequestStatus } from '../../types';
import Card from '../common/Card';

const CollectedComponents: React.FC = () => {
    const { requests, components } = useInventory();
    const { user } = useAuth();

    if (!user) return null;

    // Get all collected and returned components for this team
    const teamRequests = requests.filter(r =>
        r.teamId === user.id &&
        (r.status === RequestStatus.Collected || r.status === RequestStatus.Returned)
    );

    const collected: { [key: string]: { component: any, quantity: number } } = {};
    const returned: { [key: string]: { component: any, quantity: number } } = {};

    teamRequests.forEach(req => {
        req.items.forEach(item => {
            const comp = components.find(c => c.id === item.componentId);
            if (!comp) return;

            if (req.status === RequestStatus.Collected) {
                if (collected[item.componentId]) {
                    collected[item.componentId].quantity += item.quantity;
                } else {
                    collected[item.componentId] = { component: comp, quantity: item.quantity };
                }
            } else if (req.status === RequestStatus.Returned) {
                if (returned[item.componentId]) {
                    returned[item.componentId].quantity += item.quantity;
                } else {
                    returned[item.componentId] = { component: comp, quantity: item.quantity };
                }
            }
        });
    });

    const collectedList = Object.values(collected);
    const returnedList = Object.values(returned);
    const totalCollected = collectedList.reduce((sum, item) => sum + item.quantity, 0);
    const totalReturned = returnedList.reduce((sum, item) => sum + item.quantity, 0);

    if (collectedList.length === 0 && returnedList.length === 0) {
        return (
            <Card className="border border-gray-800 bg-gray-900/20">
                <p className="text-center text-gray-500 py-12 uppercase tracking-widest text-xs font-black">
                    No components collected yet
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Currently Collected */}
            {collectedList.length > 0 && (
                <Card className="border border-green-500/20 bg-gray-900/20">
                    <div className="mb-4">
                        <h3 className="text-lg font-black text-green-400 uppercase tracking-tighter italic">
                            Currently With You
                        </h3>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                            {totalCollected} component{totalCollected !== 1 ? 's' : ''} in your possession
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-black/40 border-b border-gray-800">
                                <tr>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Component</th>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Category</th>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Quantity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {collectedList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-green-500/5 transition-colors">
                                        <td className="p-4 font-black text-gray-100 text-xs md:text-base">{item.component.name}</td>
                                        <td className="p-4">
                                            <span className="text-[10px] md:text-xs font-bold text-amber-500 uppercase tracking-widest border border-amber-900/40 px-2 py-0.5 rounded">
                                                {item.component.category}
                                            </span>
                                        </td>
                                        <td className="p-4 text-green-400 font-mono text-xs md:text-sm font-black text-right">{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Returned Components */}
            {returnedList.length > 0 && (
                <Card className="border border-blue-500/20 bg-gray-900/20">
                    <div className="mb-4">
                        <h3 className="text-lg font-black text-blue-400 uppercase tracking-tighter italic">
                            Returned Components
                        </h3>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                            {totalReturned} component{totalReturned !== 1 ? 's' : ''} returned to inventory
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-black/40 border-b border-gray-800">
                                <tr>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Component</th>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Category</th>
                                    <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Quantity</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {returnedList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-blue-500/5 transition-colors">
                                        <td className="p-4 font-black text-gray-100 text-xs md:text-base">{item.component.name}</td>
                                        <td className="p-4">
                                            <span className="text-[10px] md:text-xs font-bold text-amber-500 uppercase tracking-widest border border-amber-900/40 px-2 py-0.5 rounded">
                                                {item.component.category}
                                            </span>
                                        </td>
                                        <td className="p-4 text-blue-400 font-mono text-xs md:text-sm font-black text-right">{item.quantity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default CollectedComponents;
