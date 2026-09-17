import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import api from '../../server/api';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import InputField from '../common/InputField';
import Spinner from '../common/Spinner';

const MIN_TEAM_SIZE = 3;
const MAX_TEAM_SIZE = 4;

const TeamRoster: React.FC = () => {
  const { user } = useAuth();
  const { teams, refreshData } = useInventory();
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRegNum, setNewMemberRegNum] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [error, setError] = useState('');
  const [showLockConfirm, setShowLockConfirm] = useState(false);

  const team = teams.find((t) => t.id === user?.id);
  if (!user || !team) return null;

  const totalSize = 1 + team.members.length;
  const canAddMore = !team.rosterLocked && totalSize < MAX_TEAM_SIZE;
  const canFinalize = !team.rosterLocked && totalSize >= MIN_TEAM_SIZE && totalSize <= MAX_TEAM_SIZE;

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMemberName.trim();
    const registrationNumber = newMemberRegNum.trim();
    if (!name || !registrationNumber) return;
    setIsAdding(true);
    setError('');
    try {
      await api.addTeamMember(team.id, name, registrationNumber);
      setNewMemberName('');
      setNewMemberRegNum('');
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setRemovingId(memberId);
    setError('');
    try {
      await api.removeTeamMember(team.id, memberId);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleConfirmLock = async () => {
    setIsLocking(true);
    setError('');
    try {
      await api.lockTeamRoster(team.id);
      setShowLockConfirm(false);
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize team roster.');
    } finally {
      setIsLocking(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border border-gray-800 bg-gray-900/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
              {team.teamName}
            </h3>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
              {totalSize} of {MIN_TEAM_SIZE}–{MAX_TEAM_SIZE} participants
            </p>
          </div>
          {team.rosterLocked ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 rounded">
              Roster Locked
            </span>
          ) : (
            <Button
              onClick={() => setShowLockConfirm(true)}
              disabled={!canFinalize}
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-400"
            >
              Finalize Team
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        {team.rosterLocked && (
          <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
            <p className="text-blue-300 text-xs font-bold uppercase tracking-wide">
              This roster is finalized. Only an admin can add or remove participants now.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between bg-black/40 border border-gray-800 rounded-lg p-3">
            <div>
              <p className="text-sm font-bold text-gray-100">{team.leaderName}</p>
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-black">Team Leader</p>
            </div>
          </div>
          {team.members.map((member) => (
            <div key={member.id} className="flex items-center justify-between bg-black/40 border border-gray-800 rounded-lg p-3">
              <div>
                <p className="text-sm font-bold text-gray-100">{member.name}</p>
                <p className="text-[10px] text-gray-500 font-mono uppercase">{member.registrationNumber}</p>
              </div>
              {!team.rosterLocked && (
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  disabled={removingId === member.id}
                  className="text-[10px] font-black uppercase tracking-widest text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {removingId === member.id ? <Spinner /> : 'Remove'}
                </button>
              )}
            </div>
          ))}
        </div>

        {canAddMore && (
          <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2 mt-4">
            <div className="flex-1">
              <InputField
                id="newMemberName"
                label="Add Participant"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Full name"
                disabled={isAdding}
              />
            </div>
            <div className="flex-1">
              <InputField
                id="newMemberRegNum"
                label="Registration Number"
                value={newMemberRegNum}
                onChange={(e) => setNewMemberRegNum(e.target.value)}
                placeholder="e.g. REG-2024-002"
                disabled={isAdding}
              />
            </div>
            <Button
              type="submit"
              disabled={isAdding || !newMemberName.trim() || !newMemberRegNum.trim()}
              className="self-end"
            >
              {isAdding ? <Spinner /> : 'Add'}
            </Button>
          </form>
        )}

        {!team.rosterLocked && !canAddMore && (
          <p className="mt-4 text-[10px] font-bold text-amber-500 uppercase tracking-wide">
            Team is at the maximum of {MAX_TEAM_SIZE} participants.
          </p>
        )}
      </Card>

      <Modal
        isOpen={showLockConfirm}
        onClose={() => setShowLockConfirm(false)}
        title="Finalize Team Roster"
        footer={
          <>
            <Button onClick={() => setShowLockConfirm(false)} variant="secondary" className="px-6" disabled={isLocking}>
              Cancel
            </Button>
            <Button onClick={handleConfirmLock} className="px-8 bg-emerald-500 hover:bg-emerald-400" disabled={isLocking}>
              {isLocking ? <Spinner /> : 'Finalize'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-400">
          Lock in your team of {totalSize} participants? After this, only an event admin will be
          able to add or remove team members — this cannot be undone from your side.
        </p>
      </Modal>
    </div>
  );
};

export default TeamRoster;
