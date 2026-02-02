import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Component, ComponentCategory } from '../../types';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';

const InventoryManager: React.FC = () => {
  const { components, upsertComponent } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Partial<Component> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
                    <button
                      onClick={() => openEditModal(c)}
                      className="text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-400 hover:text-amber-500 transition-colors"
                    >
                      Edit
                    </button>
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
                {isSaving ? <Spinner/> : 'Save Changes'}
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
    </div>
  );
};

export default InventoryManager;