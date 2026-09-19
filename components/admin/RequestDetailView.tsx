import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Request, RequestItem, RequestStatus } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import Modal from '../common/Modal';
import InputField from '../common/InputField';
import { exportRequestReport } from '../../utils/excelExport';

interface RequestDetailViewProps {
  request: Request;
}

const RequestDetailView: React.FC<RequestDetailViewProps> = ({ request }) => {
  const { updateRequestByAdmin, approveRequest, rejectRequest, releaseComponents, reinstateInventory, deleteRequest, components } = useInventory();
  const navigate = useNavigate();
  const [editableItems, setEditableItems] = useState<{ componentId: string, quantity: number }[]>([]);
  const [notes, setNotes] = useState(request.notes || '');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedComponentToAdd, setSelectedComponentToAdd] = useState<string>('');
  const [actionError, setActionError] = useState('');
  const [showReinstateModal, setShowReinstateModal] = useState(false);
  const [returnedByName, setReturnedByName] = useState('');
  const [returnedByRegNum, setReturnedByRegNum] = useState('');
  const [reinstateQuantities, setReinstateQuantities] = useState<Record<string, number>>({});
  const [showDeleteHistoryModal, setShowDeleteHistoryModal] = useState(false);
  const [deletedByName, setDeletedByName] = useState('');
  const [deletedByRegNum, setDeletedByRegNum] = useState('');

  // Only initialize state when the request ID changes, not on every background poll update
  useEffect(() => {
    setEditableItems(request.items.map(item => ({ componentId: item.componentId, quantity: item.quantity })));
    setNotes(request.notes || '');
  }, [request.id]);

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

  const handleAction = async (
    action: 'modify' | 'approve' | 'reject' | 'release' | 'reinstate' | 'delete',
    actorInfo?: { name: string; registrationNumber: string },
    reinstateItems?: { componentId: string; quantity: number }[]
  ) => {
    setIsLoading(true);
    setActionError('');
    try {
      let reinstateResult: Request | undefined;
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
        case 'reinstate':
          if (!actorInfo) return; // guarded by the confirmation modal below
          reinstateResult = await reinstateInventory(request.id, actorInfo, reinstateItems);
          break;
        case 'delete':
          if (!actorInfo) return; // guarded by the confirmation modal below
          await deleteRequest(request.id, actorInfo);
          break;
      }
      if (action === 'reinstate' && reinstateResult?.status === RequestStatus.Collected) {
        // Partial return — the team still holds something, so stay on this page
        // (it'll show the updated outstanding amounts) instead of navigating
        // away as if the request were fully wrapped up.
        setShowReinstateModal(false);
      } else {
        navigate('/admin');
      }
    } catch (error) {
      console.error(`Failed to ${action} request`, error);
      setActionError(error instanceof Error ? error.message : `Failed to ${action} request.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Items still owed back on this request — the ones the Reinstate modal offers
  // to return. Defaults to the full outstanding amount per item (so "return
  // everything" is the zero-extra-clicks path), but each is adjustable down for
  // a partial return.
  const outstandingItems = request.items.filter(item => item.quantity - item.returnedQuantity > 0);

  const openReinstateModal = () => {
    setActionError('');
    setReturnedByName('');
    setReturnedByRegNum('');
    const defaults: Record<string, number> = {};
    outstandingItems.forEach(item => {
      defaults[item.componentId] = item.quantity - item.returnedQuantity;
    });
    setReinstateQuantities(defaults);
    setShowReinstateModal(true);
  };

  const closeReinstateModal = () => {
    setShowReinstateModal(false);
    setActionError('');
  };

  const adjustReinstateQty = (componentId: string, delta: number, outstanding: number) => {
    setReinstateQuantities(prev => {
      const current = prev[componentId] ?? outstanding;
      return { ...prev, [componentId]: Math.max(0, Math.min(outstanding, current + delta)) };
    });
  };

  const setReinstateQty = (componentId: string, rawValue: string, outstanding: number) => {
    const parsed = parseInt(rawValue, 10);
    const clamped = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(outstanding, parsed));
    setReinstateQuantities(prev => ({ ...prev, [componentId]: clamped }));
  };

  const totalReturningNow = Object.values(reinstateQuantities).reduce((sum, qty) => sum + qty, 0);

  const handleConfirmReinstate = async () => {
    const name = returnedByName.trim();
    const registrationNumber = returnedByRegNum.trim();
    if (!name || !registrationNumber) return;
    const items = Object.entries(reinstateQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([componentId, quantity]) => ({ componentId, quantity }));
    if (items.length === 0) return;
    await handleAction('reinstate', { name, registrationNumber }, items);
    // On failure handleAction sets actionError and stops here (no navigation) —
    // leave the modal open so the admin can see it and correct/retry.
  };

  const registrationMismatch =
    returnedByRegNum.trim().length > 0 &&
    returnedByRegNum.trim().toLowerCase() !== request.team.registrationNumber.toLowerCase();

  const openDeleteHistoryModal = () => {
    setActionError('');
    setDeletedByName('');
    setDeletedByRegNum('');
    setShowDeleteHistoryModal(true);
  };

  const closeDeleteHistoryModal = () => {
    setShowDeleteHistoryModal(false);
    setActionError('');
  };

  const handleConfirmDeleteHistory = async () => {
    const name = deletedByName.trim();
    const registrationNumber = deletedByRegNum.trim();
    if (!name || !registrationNumber) return;
    await handleAction('delete', { name, registrationNumber });
    // On failure handleAction sets actionError and stops here (no navigation) —
    // leave the modal open so the admin can see it and correct/retry.
  };

  // Mirrors the stock impact server-side DELETE /api/requests/:id actually applies,
  // so the warning describes what will really happen rather than a generic line.
  const deleteHistoryConsequence =
    request.status === RequestStatus.Collected
      ? 'This team is currently holding these components — deleting this record will restore them to available stock, as if they were returned, without any confirmation from the team.'
      : request.status === RequestStatus.Pending || request.status === RequestStatus.Modified || request.status === RequestStatus.Approved
      ? 'This will release the stock reserved for this request.'
      : 'This request has no remaining stock impact.';

  const isActionable = request.status === RequestStatus.Pending || request.status === RequestStatus.Modified;
  const showReturnColumns = request.status === RequestStatus.Collected || request.status === RequestStatus.Returned;

  // Filter components available to add
  const availableComponentsToAdd = components.filter(c => c.totalQuantity > 0);

  return (
    <Card className="border border-gray-800 bg-gray-900/40">
      <div className="flex justify-end p-4 pb-0">
        <button
          onClick={() => exportRequestReport(request)}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-emerald-400 border border-gray-800 hover:border-emerald-900/40 rounded px-3 py-1.5 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Generate Excel Report
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-gray-800">
            <tr>
              <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Component</th>
              {showReturnColumns ? (
                <>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Collected</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Returned</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Outstanding</th>
                </>
              ) : (
                <>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Requested</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Adjusted Qty</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Stock Status</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {showReturnColumns && request.items.map(item => {
              const component = components.find(c => c.id === item.componentId);
              const outstanding = item.quantity - item.returnedQuantity;
              return (
                <tr key={item.componentId} className="hover:bg-emerald-400/5 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-gray-100 text-sm md:text-base">{component?.name ?? 'Unknown component'}</p>
                  </td>
                  <td className="p-4 text-gray-400 font-mono text-sm md:text-base">{item.quantity}</td>
                  <td className="p-4 text-blue-400 font-mono text-sm md:text-base">{item.returnedQuantity}</td>
                  <td className={`p-4 font-mono text-sm md:text-base font-black ${outstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {outstanding}
                  </td>
                </tr>
              );
            })}
            {!showReturnColumns && editableItems.map(item => {
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
                <tr key={item.componentId} className="hover:bg-emerald-400/5 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-gray-100 text-sm md:text-base">{component.name}</p>
                    {!originalItem && <span className="text-[9px] md:text-[10px] text-emerald-400 font-black uppercase tracking-widest">NEWLY ADDED</span>}
                  </td>
                  <td className="p-4 text-gray-400 font-mono text-sm md:text-base">{originalItem ? originalItem.quantity : '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleQuantityChange(item.componentId, -1)}
                        disabled={!isActionable || isLoading || item.quantity <= 0}
                        className="w-11 h-11 rounded border border-gray-700 bg-black hover:bg-gray-800 text-emerald-400 disabled:opacity-30 flex items-center justify-center font-bold text-lg"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-black text-white text-sm md:text-base">{item.quantity}</span>
                      <button
                        onClick={() => handleQuantityChange(item.componentId, 1)}
                        disabled={!isActionable || isLoading}
                        className="w-11 h-11 rounded border border-gray-700 bg-black hover:bg-gray-800 text-emerald-400 disabled:opacity-30 flex items-center justify-center font-bold text-lg"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`font-mono text-xs md:text-sm ${isStockIssue ? 'text-red-500 font-black' : 'text-gray-400'}`}>
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
            <label className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Add Component to Request</label>
            <select
              value={selectedComponentToAdd}
              onChange={(e) => setSelectedComponentToAdd(e.target.value)}
              className="w-full bg-black border border-gray-800 rounded px-3 py-2 text-white text-xs md:text-sm focus:ring-1 focus:ring-emerald-400 outline-none"
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
          <label htmlFor="notes" className="block text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Internal Admin Notes</label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full px-4 py-3 bg-black border border-gray-800 rounded-md shadow-sm text-gray-300 placeholder-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 transition-all text-sm md:text-base"
            placeholder="Briefly explain any modifications made to this request..."
            disabled={isLoading}
          />
        </div>
      )}

      {actionError && (
        <div className="mt-6 mx-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{actionError}</p>
        </div>
      )}

      <div className="mt-10 px-4 pb-4 flex flex-wrap gap-3 justify-between items-center">
        <div>
          <Button onClick={openDeleteHistoryModal} variant="danger" size="sm" className="bg-red-950/30 hover:bg-red-900 border-red-900/50 text-red-500" disabled={isLoading}>
            Delete History
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          {isLoading ? <Spinner /> : (
            <>
              {isActionable && (
                <>
                  <Button onClick={() => handleAction('modify')} variant="secondary" className="border-emerald-900 text-emerald-400">Apply Changes</Button>
                  <Button onClick={() => handleAction('approve')} className="bg-emerald-500 hover:bg-emerald-400">Confirm & Approve</Button>
                  <Button onClick={() => handleAction('reject')} variant="danger">Deny Request</Button>
                </>
              )}
              {request.status === RequestStatus.Approved && (
                <Button onClick={() => handleAction('release')} className="bg-emerald-500 hover:bg-emerald-400 px-8">Finalize Release (Collected)</Button>
              )}
              {request.status === RequestStatus.Collected && (
                <Button onClick={openReinstateModal} className="bg-green-600 hover:bg-green-500 px-8">Reinstate Inventory</Button>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showReinstateModal}
        onClose={closeReinstateModal}
        title="Confirm Reinstatement"
        footer={
          <>
            <Button onClick={closeReinstateModal} variant="secondary" className="px-6" disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReinstate}
              className="px-8 bg-green-600 hover:bg-green-500"
              disabled={isLoading || !returnedByName.trim() || !returnedByRegNum.trim() || totalReturningNow === 0}
            >
              {isLoading ? <Spinner /> : totalReturningNow === outstandingItems.reduce((sum, i) => sum + (i.quantity - i.returnedQuantity), 0)
                ? 'Confirm Return'
                : `Confirm Partial Return (${totalReturningNow})`}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            Confirm which components are being physically returned to inventory right now — adjust
            the quantities below for a partial return. Record the name and registration number of
            the person handing them back.
          </p>

          <div className="p-3 bg-black/40 border border-gray-800 rounded-lg">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">On file for {request.team.teamName}</p>
            <p className="text-xs text-gray-400">
              {request.team.leaderName} &middot; Reg #{' '}
              <span className="text-emerald-400 font-mono">{request.team.registrationNumber}</span>
            </p>
          </div>

          <div className="space-y-2">
            {outstandingItems.map(item => {
              const component = components.find(c => c.id === item.componentId);
              const outstanding = item.quantity - item.returnedQuantity;
              const selected = reinstateQuantities[item.componentId] ?? outstanding;
              return (
                <div key={item.componentId} className="flex items-center justify-between bg-black/40 border border-gray-800 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-bold text-gray-100">{component?.name ?? 'Unknown component'}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Outstanding: {outstanding}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => adjustReinstateQty(item.componentId, -1, outstanding)}
                      disabled={isLoading || selected <= 0}
                      className="w-11 h-11 rounded border border-gray-700 bg-black hover:bg-gray-800 text-emerald-400 disabled:opacity-30 flex items-center justify-center font-bold text-lg"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={outstanding}
                      value={selected}
                      onChange={(e) => setReinstateQty(item.componentId, e.target.value, outstanding)}
                      disabled={isLoading}
                      className="w-14 h-11 text-center font-black text-white text-sm bg-black border border-gray-700 rounded outline-none focus:border-emerald-400"
                    />
                    <button
                      onClick={() => adjustReinstateQty(item.componentId, 1, outstanding)}
                      disabled={isLoading || selected >= outstanding}
                      className="w-11 h-11 rounded border border-gray-700 bg-black hover:bg-gray-800 text-emerald-400 disabled:opacity-30 flex items-center justify-center font-bold text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {actionError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{actionError}</p>
            </div>
          )}

          <InputField
            id="returnedByName"
            label="Name"
            value={returnedByName}
            onChange={(e) => setReturnedByName(e.target.value)}
            placeholder="Full name of the person returning the components"
            disabled={isLoading}
          />
          <div>
            <InputField
              id="returnedByRegNum"
              label="Registration Number"
              value={returnedByRegNum}
              onChange={(e) => setReturnedByRegNum(e.target.value)}
              placeholder="e.g. REG-2024-001"
              disabled={isLoading}
            />
            {registrationMismatch && (
              <p className="mt-2 text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                Doesn't match the registration number on file for this team — double-check before confirming.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDeleteHistoryModal}
        onClose={closeDeleteHistoryModal}
        title="Delete Request History"
        footer={
          <>
            <Button onClick={closeDeleteHistoryModal} variant="secondary" className="px-6" disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeleteHistory}
              variant="danger"
              className="px-8 bg-red-950/30 hover:bg-red-900 border-red-900/50 text-red-500"
              disabled={isLoading || !deletedByName.trim() || !deletedByRegNum.trim()}
            >
              {isLoading ? <Spinner /> : 'Delete History'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            Permanently delete this request from <span className="text-gray-200 font-bold">{request.team.teamName}</span>
            's history? This cannot be undone.
          </p>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-amber-400 text-xs font-bold uppercase tracking-wide">{deleteHistoryConsequence}</p>
          </div>

          <p className="text-xs text-gray-500">
            Record who is authorizing this deletion.
          </p>

          {actionError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{actionError}</p>
            </div>
          )}

          <InputField
            id="deletedByName"
            label="Name"
            value={deletedByName}
            onChange={(e) => setDeletedByName(e.target.value)}
            placeholder="Full name of the admin authorizing this"
            disabled={isLoading}
          />
          <InputField
            id="deletedByRegNum"
            label="Registration Number"
            value={deletedByRegNum}
            onChange={(e) => setDeletedByRegNum(e.target.value)}
            placeholder="e.g. REG-2024-001"
            disabled={isLoading}
          />
        </div>
      </Modal>
    </Card>
  );
};

export default RequestDetailView;