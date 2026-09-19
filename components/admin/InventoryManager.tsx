import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { Component, ComponentCategory, RequestStatus } from '../../types';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import InputField from '../common/InputField';
import { ComponentHolder, ComponentStillHeldError } from '../../server/api';

const ACTIVE_STATUSES = [RequestStatus.Pending, RequestStatus.Modified, RequestStatus.Approved];

const InventoryManager: React.FC = () => {
  const navigate = useNavigate();
  const { components, requests, upsertComponent, deleteComponent } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Partial<Component> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [viewingCollections, setViewingCollections] = useState<Component | null>(null);
  const [deletingComponentId, setDeletingComponentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [blockedDeletion, setBlockedDeletion] = useState<{ component: Component; holders: ComponentHolder[] } | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState<{ component: Component; activeCount: number } | null>(null);
  const [deletedByName, setDeletedByName] = useState('');
  const [deletedByRegNum, setDeletedByRegNum] = useState('');

  const openAddModal = () => {
    setSaveError('');
    setEditingComponent({
      id: `c${Date.now()}`,
      name: '',
      category: ComponentCategory.Modules,
      totalQuantity: 0,
      hasQuantityLimit: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (component: Component) => {
    setSaveError('');
    setEditingComponent({ ...component });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingComponent && editingComponent.id && editingComponent.name && editingComponent.category) {
      setIsSaving(true);
      setSaveError('');
      try {
        await upsertComponent({
          id: editingComponent.id,
          name: editingComponent.name,
          category: editingComponent.category as ComponentCategory,
          totalQuantity: editingComponent.totalQuantity || 0,
          hasQuantityLimit: editingComponent.hasQuantityLimit !== false,
        });
        setIsModalOpen(false);
        setEditingComponent(null);
      } catch (error) {
        console.error("Failed to save component", error);
        setSaveError(error instanceof Error ? error.message : 'Failed to save component.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Get teams that have collected a specific component. A single Collected
  // request can itself be partially returned, so one request can produce up to
  // two rows here — its still-outstanding portion (Collected) and its
  // already-returned portion (Returned) — rather than one row keyed only on
  // the request's overall status.
  const getTeamsWithComponent = (componentId: string) => {
    const matchingRequests = requests.filter(r =>
      (r.status === 'COLLECTED' || r.status === 'RETURNED_TO_INVENTORY') &&
      r.items.some(item => item.componentId === componentId)
    );

    const rows: { teamName: string; leaderName: string; registrationNumber: string; quantity: number; status: string; timestamp: Date }[] = [];
    matchingRequests.forEach(req => {
      const item = req.items.find(item => item.componentId === componentId);
      if (!item) return;
      const outstandingQty = item.quantity - item.returnedQuantity;
      const base = { teamName: req.team.teamName, leaderName: req.team.leaderName, registrationNumber: req.team.registrationNumber, timestamp: req.timestamp };
      if (outstandingQty > 0) rows.push({ ...base, quantity: outstandingQty, status: 'COLLECTED' });
      if (item.returnedQuantity > 0) rows.push({ ...base, quantity: item.returnedQuantity, status: 'RETURNED_TO_INVENTORY' });
    });
    return rows;
  };

  const handleDeleteComponent = async (component: Component) => {
    setDeleteError('');
    setDeleteSuccess('');

    // Check locally first, off the already-polled data — catches the common
    // case instantly with no round trip. The server enforces the same rule
    // independently in case stock moved between this check and the click.
    const stillHeld = requests.filter(r =>
      r.status === RequestStatus.Collected && r.items.some(item => item.componentId === component.id)
    );
    if (stillHeld.length > 0) {
      setBlockedDeletion({
        component,
        holders: stillHeld.map(r => ({
          requestId: r.id,
          teamId: r.teamId,
          teamName: r.team.teamName,
          leaderName: r.team.leaderName,
          registrationNumber: r.team.registrationNumber,
          quantity: r.items.find(item => item.componentId === component.id)?.quantity ?? 0,
          timestamp: r.timestamp.toISOString()
        }))
      });
      return;
    }

    const activeCount = requests.filter(r =>
      ACTIVE_STATUSES.includes(r.status) && r.items.some(item => item.componentId === component.id)
    ).length;
    setDeletedByName('');
    setDeletedByRegNum('');
    setConfirmingDeletion({ component, activeCount });
  };

  const closeDeleteConfirm = () => {
    setConfirmingDeletion(null);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!confirmingDeletion) return;
    const name = deletedByName.trim();
    const registrationNumber = deletedByRegNum.trim();
    if (!name || !registrationNumber) return;

    const { component } = confirmingDeletion;
    setDeletingComponentId(component.id);
    setDeleteError('');
    try {
      const result = await deleteComponent(component.id, { name, registrationNumber });
      setConfirmingDeletion(null);
      setDeleteSuccess(
        result.notifiedTeams.length > 0
          ? `"${component.name}" deleted. Notified ${result.notifiedTeams.length} team${result.notifiedTeams.length === 1 ? '' : 's'} whose request could no longer include it.`
          : `"${component.name}" deleted.`
      );
    } catch (err) {
      if (err instanceof ComponentStillHeldError) {
        setConfirmingDeletion(null);
        setBlockedDeletion({ component, holders: err.holders });
      } else {
        // Leave the confirmation card open so the admin can see the error and retry.
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete component.');
      }
    } finally {
      setDeletingComponentId(null);
    }
  };

  const goToRequest = (requestId: string) => {
    setBlockedDeletion(null);
    navigate(`/admin/request/${requestId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openAddModal} className="bg-emerald-500 hover:bg-emerald-400 font-black tracking-widest text-xs px-6">
          + Add New Component
        </Button>
      </div>

      {deleteError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{deleteError}</p>
        </div>
      )}

      {deleteSuccess && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-green-400 text-xs font-bold uppercase tracking-wide">{deleteSuccess}</p>
        </div>
      )}

      <Card className="border border-gray-800 bg-gray-900/20 p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/40">
              <tr>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Component Name</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Category</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Type</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Total Qty</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Requested Qty</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {components.map((c) => (
                <tr key={c.id} className="hover:bg-emerald-400/5 transition-colors group">
                  <td className="p-4 font-black text-gray-100 text-xs md:text-base">{c.name}</td>
                  <td className="p-4">
                    <span className="text-[10px] md:text-xs font-bold text-emerald-400 uppercase tracking-widest border border-emerald-900/40 px-2 py-0.5 rounded">
                      {c.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] md:text-xs font-bold uppercase tracking-widest border px-2 py-0.5 rounded ${c.hasQuantityLimit === false
                        ? 'text-blue-400 border-blue-500/40'
                        : 'text-gray-400 border-gray-700/40'
                      }`}>
                      {c.hasQuantityLimit === false ? 'Unlimited' : 'Limited'}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 font-mono text-xs md:text-sm">
                    {c.hasQuantityLimit === false ? '∞' : c.totalQuantity}
                  </td>
                  <td className="p-4 text-gray-500 font-mono text-xs md:text-sm">{c.reservedQuantity}</td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setViewingCollections(c)}
                        className="text-[10px] md:text-xs font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Collections
                      </button>
                      <button
                        onClick={() => openEditModal(c)}
                        className="text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-400 hover:text-emerald-400 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteComponent(c)}
                        disabled={deletingComponentId === c.id}
                        className="text-[10px] md:text-xs font-black uppercase tracking-widest text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {deletingComponentId === c.id ? <Spinner /> : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingComponent?.name ? "Edit Component" : "Add New Component"}
        footer={
          <div className="flex space-x-3">
            <Button onClick={() => setIsModalOpen(false)} variant="secondary" className="px-6" disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} className="px-8 bg-emerald-500 hover:bg-emerald-400" disabled={isSaving}>
              {isSaving ? <Spinner /> : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {editingComponent && (
          <div className="space-y-5">
            {saveError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{saveError}</p>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Component Name</label>
              <input
                type="text"
                value={editingComponent.name}
                onChange={(e) => setEditingComponent({ ...editingComponent, name: e.target.value })}
                className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white focus:ring-1 focus:ring-emerald-400 outline-none"
                placeholder="e.g. Arduino Uno"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Category</label>
                <select
                  value={editingComponent.category}
                  onChange={(e) => setEditingComponent({ ...editingComponent, category: e.target.value as ComponentCategory })}
                  className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white focus:ring-1 focus:ring-emerald-400 outline-none uppercase text-xs font-bold"
                >
                  {Object.values(ComponentCategory).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Units</label>
                <input
                  type="number"
                  value={editingComponent.totalQuantity}
                  onChange={(e) => setEditingComponent({ ...editingComponent, totalQuantity: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white font-mono focus:ring-1 focus:ring-emerald-400 outline-none"
                  disabled={editingComponent.hasQuantityLimit === false}
                />
              </div>
            </div>
            <div className="border-t border-gray-800 pt-4">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={editingComponent.hasQuantityLimit === false}
                  onChange={(e) => setEditingComponent({
                    ...editingComponent,
                    hasQuantityLimit: !e.target.checked,
                  })}
                  className="w-5 h-5 bg-black border-2 border-gray-700 rounded checked:bg-blue-500 checked:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-sm font-black text-gray-300 uppercase tracking-wide group-hover:text-blue-400 transition-colors">Unlimited Stock</span>
                  <p className="text-[10px] text-gray-500 mt-0.5">Component is always available (no quantity tracking)</p>
                </div>
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* Collections Modal */}
      <Modal
        isOpen={!!viewingCollections}
        onClose={() => setViewingCollections(null)}
        title={viewingCollections ? `Teams with ${viewingCollections.name}` : 'Collections'}
      >
        {viewingCollections && (() => {
          const teams = getTeamsWithComponent(viewingCollections.id);

          if (teams.length === 0) {
            return (
              <p className="text-center text-gray-500 py-8 uppercase tracking-widest text-xs font-black">
                No teams have collected this component yet
              </p>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Team Name</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Leader</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Reg #</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Qty</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Status</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {teams.map((team, idx) => (
                    <tr key={idx} className="hover:bg-emerald-400/5 transition-colors">
                      <td className="p-3 font-bold text-gray-100 text-xs">{team.teamName}</td>
                      <td className="p-3 text-gray-400 text-xs">{team.leaderName}</td>
                      <td className="p-3 text-gray-500 font-mono text-xs uppercase">{team.registrationNumber}</td>
                      <td className="p-3 text-emerald-400 font-mono text-xs font-black">{team.quantity}</td>
                      <td className="p-3">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${team.status === 'COLLECTED'
                          ? 'border-gray-500/30 text-gray-400'
                          : 'border-blue-500/30 text-blue-400'
                          }`}>
                          {team.status === 'COLLECTED' ? 'Collected' : 'Returned'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500 text-xs font-mono">
                        {team.timestamp.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 p-3 bg-emerald-400/5 border border-emerald-400/20 rounded">
                <p className="text-xs text-gray-400">
                  <span className="font-black text-emerald-400">Total Collected:</span>{' '}
                  {teams.reduce((sum, t) => sum + (t.status === 'COLLECTED' ? t.quantity : 0), 0)} units
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  <span className="font-black text-blue-400">Total Returned:</span>{' '}
                  {teams.reduce((sum, t) => sum + (t.status === 'RETURNED_TO_INVENTORY' ? t.quantity : 0), 0)} units
                </p>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Confirm Deletion Modal — requires the authorizing admin's name + reg # */}
      {confirmingDeletion && (
        <Modal
          isOpen={true}
          onClose={closeDeleteConfirm}
          title="Confirm Deletion"
          footer={
            <>
              <Button onClick={closeDeleteConfirm} variant="secondary" className="px-6" disabled={deletingComponentId === confirmingDeletion.component.id}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirmDelete}
                variant="danger"
                className="px-8 bg-red-950/30 hover:bg-red-900 border-red-900/50 text-red-500"
                disabled={deletingComponentId === confirmingDeletion.component.id || !deletedByName.trim() || !deletedByRegNum.trim()}
              >
                {deletingComponentId === confirmingDeletion.component.id ? <Spinner /> : 'Delete Resource'}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <p className="text-sm text-gray-400">
              Delete "<span className="text-gray-200 font-bold">{confirmingDeletion.component.name}</span>"? This
              cannot be undone.
              {confirmingDeletion.activeCount > 0 && (
                <>
                  {' '}
                  <span className="text-amber-400">
                    {confirmingDeletion.activeCount} pending request{confirmingDeletion.activeCount === 1 ? '' : 's'} currently
                    include this component and will be notified that it's no longer available.
                  </span>
                </>
              )}
            </p>

            <p className="text-xs text-gray-500">
              Record who is authorizing this deletion.
            </p>

            {deleteError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{deleteError}</p>
              </div>
            )}

            <InputField
              id="deletedByName"
              label="Name"
              value={deletedByName}
              onChange={(e) => setDeletedByName(e.target.value)}
              placeholder="Full name of the admin authorizing this"
              disabled={deletingComponentId === confirmingDeletion.component.id}
            />
            <InputField
              id="deletedByRegNum"
              label="Registration Number"
              value={deletedByRegNum}
              onChange={(e) => setDeletedByRegNum(e.target.value)}
              placeholder="e.g. REG-2024-001"
              disabled={deletingComponentId === confirmingDeletion.component.id}
            />
          </div>
        </Modal>
      )}

      {/* Blocked Deletion Modal — components still out with some team */}
      {blockedDeletion && (
        <Modal
          isOpen={true}
          onClose={() => setBlockedDeletion(null)}
          title="Cannot Delete Resource"
          footer={
            <Button onClick={() => setBlockedDeletion(null)} variant="secondary" className="px-6">
              Close
            </Button>
          }
        >
          <div className="space-y-5">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs font-bold uppercase tracking-wide">
                "{blockedDeletion.component.name}" is still collected by {blockedDeletion.holders.length}{' '}
                team{blockedDeletion.holders.length === 1 ? '' : 's'}. Collect it back from each team below
                before deleting this resource.
              </p>
            </div>

            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-black/40">
                  <tr>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Team</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Reg #</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Qty</th>
                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {blockedDeletion.holders.map((holder) => (
                    <tr key={holder.requestId}>
                      <td className="p-3">
                        <p className="font-bold text-gray-100 text-xs">{holder.teamName}</p>
                        <p className="text-[10px] text-gray-500">{holder.leaderName}</p>
                      </td>
                      <td className="p-3 text-gray-400 font-mono text-xs">{holder.registrationNumber}</td>
                      <td className="p-3 text-red-400 font-mono text-xs font-black text-right">x{holder.quantity}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => goToRequest(holder.requestId)}
                          className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          Reinstate →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default InventoryManager;