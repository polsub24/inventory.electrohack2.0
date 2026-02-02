import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Request, RequestItem, RequestStatus } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';

interface RequestDetailViewProps {
  request: Request;
}

const RequestDetailView: React.FC<RequestDetailViewProps> = ({ request }) => {
  const { updateRequestByAdmin, approveRequest, rejectRequest, releaseComponents, deleteRequest, components } = useInventory();
  const navigate = useNavigate();
  const [editableItems, setEditableItems] = useState<{componentId: string, quantity: number}[]>([]);
  const [notes, setNotes] = useState(request.notes || '');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedComponentToAdd, setSelectedComponentToAdd] = useState<string>('');

  useEffect(() => {
    setEditableItems(request.items.map(item => ({ componentId: item.componentId, quantity: item.quantity })));
    setNotes(request.notes || '');
  }, [request]);

  const handleQuantityChange = (componentId: string, delta: number) => {
    setEditableItems(items =>
      items.map(item => {
        if (item.componentId === componentId) {
            const newQty = Math.max(0, item.quantity + delta);
            return { ...item, quantity: newQty };
        }
        return item;
      }).filter(item => item.quantity > 0) // Optional: remove if 0? Let's keep 0 to allow manual removal or clear intent
    );
  };
  
  const handleAddNewComponent = () => {
      if (!selectedComponentToAdd) return;
      
      const exists = editableItems.find(item => item.componentId === selectedComponentToAdd);
      if (exists) {
          // If already in list, just increment
          handleQuantityChange(selectedComponentToAdd, 1);
      } else {
          setEditableItems([...editableItems, { componentId: selectedComponentToAdd, quantity: 1 }]);
      }
      setSelectedComponentToAdd('');
  };

  const handleAction = async (action: 'modify' | 'approve' | 'reject' | 'release' | 'delete') => {
    if (action === 'delete') {
        if (!window.confirm("Are you sure? This will delete the request history and restore any relevant stock.")) return;
    }
    
    setIsLoading(true);
    try {
      switch (action) {
        case 'modify':
          await updateRequestByAdmin(request.id, editableItems, notes);
          break;
        case 'approve':
          await approveRequest(request.id);
          break;
        case 'reject':
          await rejectRequest(request.id);
          break;
        case 'release':
          await releaseComponents(request.id);
          break;
        case 'delete':
          await deleteRequest(request.id);
          break;
      }
      navigate('/admin');
    } catch (error) {
        console.error(`Failed to ${action} request`, error);
    } finally {
        setIsLoading(false);
    }
  };

  const isActionable = request.status === RequestStatus.Pending || request.status === RequestStatus.Modified;

  // Filter components available to add (excluding ones already in the original request to avoid duplicate rows, though logic handles it)
  // Better: Show all components in dropdown.
  const availableComponentsToAdd = components.filter(c => c.totalQuantity > 0);

  return (
    <Card className="border border-gray-800 bg-gray-900/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-gray-800">
            <tr>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Component</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Requested</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Adjusted Qty</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Stock Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {editableItems.map(item => {
              const originalItem = request.items.find(i => i.componentId === item.componentId);
              const component = components.find(c => c.id === item.componentId);
              
              if (!component) return null;

              // Calculate available based on current stock + what this request is already holding (if any)
              // If request is pending, it holds `originalItem.quantity` in reserved.
              // So real available for *this* request to increase is (Total - Reserved) + (ReservedByThisRequest)
              const reservedByThisRequest = originalItem ? originalItem.quantity : 0;
              const trueAvailable = (component.totalQuantity - component.reservedQuantity) + reservedByThisRequest;
              const isStockIssue = item.quantity > trueAvailable;

              return (
                <tr key={item.componentId} className="hover:bg-amber-500/5 transition-colors">
                  <td className="p-4">
                      <p className="font-bold text-gray-100">{component.name}</p>
                      {!originalItem && <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest">NEWLY ADDED</span>}
                  </td>
                  <td className="p-4 text-gray-400 font-mono">{originalItem ? originalItem.quantity : '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                         <button 
                            onClick={() => handleQuantityChange(item.componentId, -1)}
                            disabled={!isActionable || isLoading || item.quantity <= 0}
                            className="w-8 h-8 rounded border border-gray-700 bg-black hover:bg-gray-800 text-amber-500 disabled:opacity-30 flex items-center justify-center font-bold"
                         >
                             -
                         </button>
                         <span className="w-8 text-center font-black text-white">{item.quantity}</span>
                         <button 
                            onClick={() => handleQuantityChange(item.componentId, 1)}
                            disabled={!isActionable || isLoading}
                            className="w-8 h-8 rounded border border-gray-700 bg-black hover:bg-gray-800 text-amber-500 disabled:opacity-30 flex items-center justify-center font-bold"
                         >
                             +
                         </button>
                    </div>
                  </td>
                  <td className="p-4">
                      <span className={`font-mono text-xs ${isStockIssue ? 'text-red-500 font-black' : 'text-gray-400'}`}>
                          {trueAvailable} Available
                      </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {isActionable && (
        <div className="p-4 bg-black/20 border-t border-gray-800 flex flex-col sm:flex-row gap-4 items-end sm:items-center">
             <div className="flex-grow w-full sm:w-auto">
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Add Component to Request</label>
                 <select 
                    value={selectedComponentToAdd}
                    onChange={(e) => setSelectedComponentToAdd(e.target.value)}
                    className="w-full bg-black border border-gray-800 rounded px-3 py-2 text-white text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                 >
                     <option value="">Select a component...</option>
                     {availableComponentsToAdd.map(c => (
                         <option key={c.id} value={c.id}>{c.name} ({c.totalQuantity - c.reservedQuantity} avail)</option>
                     ))}
                 </select>
             </div>
             <Button 
                onClick={handleAddNewComponent} 
                disabled={!selectedComponentToAdd || isLoading}
                size="sm"
                className="whitespace-nowrap h-9 w-full sm:w-auto"
             >
                 Add Item
             </Button>
        </div>
      )}
      
      {isActionable && (
        <div className="mt-6 px-4">
            <label htmlFor="notes" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Internal Admin Notes</label>
            <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-black border border-gray-800 rounded-md shadow-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                placeholder="Briefly explain any modifications made to this request..."
                disabled={isLoading}
            />
        </div>
      )}

      <div className="mt-10 px-4 pb-4 flex flex-wrap gap-3 justify-between items-center">
        <div>
            <Button onClick={() => handleAction('delete')} variant="danger" size="sm" className="bg-red-950/30 hover:bg-red-900 border-red-900/50 text-red-500" disabled={isLoading}>
                Delete History
            </Button>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
            {isLoading ? <Spinner /> : (
                <>
                {isActionable && (
                    <>
                        <Button onClick={() => handleAction('modify')} variant="secondary" className="border-amber-900 text-amber-500">Apply Changes</Button>
                        <Button onClick={() => handleAction('approve')} className="bg-amber-600 hover:bg-amber-500">Confirm & Approve</Button>
                        <Button onClick={() => handleAction('reject')} variant="danger">Deny Request</Button>
                    </> 
                )}
                {request.status === RequestStatus.Approved && (
                    <Button onClick={() => handleAction('release')} className="bg-amber-600 hover:bg-amber-500 px-8">Finalize Release (Collected)</Button>
                )}
                </>
            )}
        </div>
      </div>
    </Card>
  );
};

export default RequestDetailView;