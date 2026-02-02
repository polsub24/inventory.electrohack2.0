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
  const { updateRequestByAdmin, approveRequest, rejectRequest, releaseComponents } = useInventory();
  const navigate = useNavigate();
  const [editableItems, setEditableItems] = useState<{componentId: string, quantity: number}[]>([]);
  const [notes, setNotes] = useState(request.notes || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEditableItems(request.items.map(item => ({ componentId: item.componentId, quantity: item.quantity })));
    setNotes(request.notes || '');
  }, [request]);

  const handleQuantityChange = (componentId: string, newQuantity: number) => {
    setEditableItems(items =>
      items.map(item => (item.componentId === componentId ? { ...item, quantity: newQuantity } : item))
    );
  };
  
  const handleAction = async (action: 'modify' | 'approve' | 'reject' | 'release') => {
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
      }
      navigate('/admin');
    } catch (error) {
        console.error(`Failed to ${action} request`, error);
    } finally {
        setIsLoading(false);
    }
  };

  const isActionable = request.status === RequestStatus.Pending || request.status === RequestStatus.Modified;

  return (
    <Card className="border border-gray-800 bg-gray-900/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-gray-800">
            <tr>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Component</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Requested</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Adjusted Qty</th>
              <th className="p-4 text-[10px] font-black uppercase tracking-widest text-gray-500">Available Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {request.items.map(item => {
              const available = item.component.totalQuantity - item.component.reservedQuantity + item.quantity;
              const editableItem = editableItems.find(ei => ei.componentId === item.componentId);
              return (
                <tr key={item.componentId} className="hover:bg-amber-500/5 transition-colors">
                  <td className="p-4 font-bold text-gray-100">{item.component.name}</td>
                  <td className="p-4 text-gray-400 font-mono">{item.quantity}</td>
                  <td className="p-4">
                    <input
                      type="number"
                      value={editableItem?.quantity || 0}
                      onChange={(e) => handleQuantityChange(item.componentId, Math.max(0, parseInt(e.target.value, 10)))}
                      min="0"
                      max={available}
                      className="w-20 px-3 py-2 bg-black border border-gray-700 rounded text-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 font-bold"
                      disabled={!isActionable || isLoading}
                    />
                  </td>
                  <td className="p-4 text-gray-400 font-mono">{available}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {isActionable && (
        <div className="mt-8 px-4">
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

      <div className="mt-10 px-4 pb-4 flex flex-wrap gap-3 justify-end items-center">
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
    </Card>
  );
};

export default RequestDetailView;
