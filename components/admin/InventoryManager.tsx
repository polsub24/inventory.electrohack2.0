import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Component, ComponentCategory } from '../../types';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';

const InventoryManager: React.FC = () => {
  const { components, requests, upsertComponent } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Partial<Component> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewingCollections, setViewingCollections] = useState<Component | null>(null);

  const openAddModal = () => {
    setEditingComponent({
      id: `c${Date.now()}`,
      name: '',
      category: ComponentCategory.Modules,
      totalQuantity: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (component: Component) => {
    setEditingComponent({ ...component });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingComponent && editingComponent.id && editingComponent.name && editingComponent.category) {
      setIsSaving(true);
      try {
        await upsertComponent({
          id: editingComponent.id,
          name: editingComponent.name,
          category: editingComponent.category as ComponentCategory,
          totalQuantity: editingComponent.totalQuantity || 0,
        });
        setIsModalOpen(false);
        setEditingComponent(null);
      } catch (error) {
        console.error("Failed to save component", error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Get teams that have collected a specific component
  const getTeamsWithComponent = (componentId: string) => {
    const collectedRequests = requests.filter(r =>
      (r.status === 'COLLECTED' || r.status === 'RETURNED_TO_INVENTORY') &&
      r.items.some(item => item.componentId === componentId)
    );

    return collectedRequests.map(req => ({
      teamName: req.team.teamName,
      leaderName: req.team.leaderName,
      registrationNumber: req.team.registrationNumber,
      quantity: req.items.find(item => item.componentId === componentId)?.quantity || 0,
      status: req.status,
      timestamp: req.timestamp
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={openAddModal} className="bg-amber-600 hover:bg-amber-500 font-black tracking-widest text-xs px-6">
          + Add New Component
        </Button>
      </div>

      <Card className="border border-gray-800 bg-gray-900/20 p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/40">
              <tr>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Component Name</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Category</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Total Qty</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Reserved</th>
                <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {components.map((c) => (
                <tr key={c.id} className="hover:bg-amber-500/5 transition-colors group">
                  <td className="p-4 font-black text-gray-100 text-xs md:text-base">{c.name}</td>
                  <td className="p-4">
                    <span className="text-[10px] md:text-xs font-bold text-amber-500 uppercase tracking-widest border border-amber-900/40 px-2 py-0.5 rounded">
                      {c.category}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 font-mono text-xs md:text-sm">{c.totalQuantity}</td>
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
                        className="text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-400 hover:text-amber-500 transition-colors"
                      >
                        Edit
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
            <Button onClick={handleSave} className="px-8 bg-amber-600 hover:bg-amber-500" disabled={isSaving}>
              {isSaving ? <Spinner /> : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {editingComponent && (
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Component Name</label>
              <input
                type="text"
                value={editingComponent.name}
                onChange={(e) => setEditingComponent({ ...editingComponent, name: e.target.value })}
                className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white focus:ring-1 focus:ring-amber-500 outline-none"
                placeholder="e.g. Arduino Uno"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Category</label>
                <select
                  value={editingComponent.category}
                  onChange={(e) => setEditingComponent({ ...editingComponent, category: e.target.value as ComponentCategory })}
                  className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white focus:ring-1 focus:ring-amber-500 outline-none uppercase text-xs font-bold"
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
                  className="w-full bg-black border border-gray-800 rounded px-4 py-3 text-white font-mono focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>
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
                    <tr key={idx} className="hover:bg-amber-500/5 transition-colors">
                      <td className="p-3 font-bold text-gray-100 text-xs">{team.teamName}</td>
                      <td className="p-3 text-gray-400 text-xs">{team.leaderName}</td>
                      <td className="p-3 text-gray-500 font-mono text-xs uppercase">{team.registrationNumber}</td>
                      <td className="p-3 text-amber-500 font-mono text-xs font-black">{team.quantity}</td>
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
              <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/20 rounded">
                <p className="text-xs text-gray-400">
                  <span className="font-black text-amber-500">Total Collected:</span>{' '}
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
    </div>
  );
};

export default InventoryManager;