import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { AuditLogEntry } from '../../server/api';
import Card from '../common/Card';
import Spinner from '../common/Spinner';

const ACTION_LABELS: Record<AuditLogEntry['action'], string> = {
  REINSTATE_REQUEST: 'Reinstate',
  DELETE_COMPONENT: 'Delete Resource',
  DELETE_REQUEST: 'Delete History',
  DELETE_TEAM: 'Delete Team',
  ADD_TEAM_MEMBER: 'Add Member',
  REMOVE_TEAM_MEMBER: 'Remove Member',
  EDIT_TEAM_LEADER: 'Edit Leader Name',
  EDIT_TEAM_MEMBER: 'Edit Member Name',
};

const ACTION_STYLES: Record<AuditLogEntry['action'], string> = {
  REINSTATE_REQUEST: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  DELETE_COMPONENT: 'text-red-400 border-red-500/30 bg-red-500/5',
  DELETE_REQUEST: 'text-red-400 border-red-500/30 bg-red-500/5',
  DELETE_TEAM: 'text-red-400 border-red-500/30 bg-red-500/5',
  ADD_TEAM_MEMBER: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  REMOVE_TEAM_MEMBER: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
  EDIT_TEAM_LEADER: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
  EDIT_TEAM_MEMBER: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
};

// Each action this logs stores a slightly different `details` shape (see
// server.js's recordAuditLog calls) — this pulls the most informative summary
// out of whichever fields that action actually populated, rather than
// dumping raw JSON in the table.
const summarizeDetails = (entry: AuditLogEntry): string => {
  const d = entry.details as Record<string, any> | null;
  if (!d) return '—';
  switch (entry.action) {
    case 'REINSTATE_REQUEST': {
      const items = Array.isArray(d.items) ? d.items : [];
      const totalQty = items.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);
      return `${d.teamName ?? 'Unknown team'} · returned ${totalQty} unit${totalQty === 1 ? '' : 's'} across ${items.length} item${items.length === 1 ? '' : 's'}${d.fullyReturned ? ' · fully returned' : ' · partial return'}`;
    }
    case 'DELETE_COMPONENT': {
      const notified = Array.isArray(d.notifiedTeams) ? d.notifiedTeams.length : 0;
      return `"${d.componentName ?? 'Unknown component'}"${d.category ? ` · ${d.category}` : ''}${notified > 0 ? ` · notified ${notified} team${notified === 1 ? '' : 's'}` : ''}`;
    }
    case 'DELETE_REQUEST': {
      const items = Array.isArray(d.items) ? d.items : [];
      return `${d.teamName ?? 'Unknown team'} · was ${d.status ?? 'unknown status'} · ${items.length} item${items.length === 1 ? '' : 's'}`;
    }
    case 'DELETE_TEAM':
      return `${d.teamName ?? 'Unknown team'} · led by ${d.leaderName ?? '?'} · ${d.requestsDeleted ?? 0} request${d.requestsDeleted === 1 ? '' : 's'} deleted with it`;
    case 'ADD_TEAM_MEMBER':
      return `${d.teamName ?? 'Unknown team'} · added "${d.memberName ?? 'Unknown'}"${d.memberRegistrationNumber ? ` (${d.memberRegistrationNumber})` : ''}`;
    case 'REMOVE_TEAM_MEMBER':
      return `${d.teamName ?? 'Unknown team'} · removed "${d.memberName ?? 'Unknown'}"${d.memberRegistrationNumber ? ` (${d.memberRegistrationNumber})` : ''}`;
    case 'EDIT_TEAM_LEADER':
    case 'EDIT_TEAM_MEMBER':
      return `${d.teamName ?? 'Unknown team'} · "${d.previousName ?? '?'}" → "${d.newName ?? '?'}"`;
    default:
      return JSON.stringify(d);
  }
};

const AuditLog: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.getAuditLog(200);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log.');
    } finally {
      setIsLoading(false);
    }
  };

  // Loaded on demand rather than through InventoryContext's 2s poll — this is
  // an admin audit trail, not live inventory state, so a manual refresh fits
  // better than a background timer.
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
            Audit Log
          </h3>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
            Who authorized reinstates, deletions, and team removals
          </p>
        </div>
        <button
          onClick={load}
          disabled={isLoading}
          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-emerald-400 border border-gray-800 hover:border-emerald-900/40 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
        >
          {isLoading ? <Spinner /> : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
        </div>
      )}

      {!isLoading && !error && entries.length === 0 && (
        <Card className="text-center py-12">
          <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">
            No audited actions yet
          </p>
        </Card>
      )}

      {entries.length > 0 && (
        <Card className="border border-gray-800 bg-gray-900/20 p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black/40">
                <tr>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Action</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Authorized By</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">Details</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500">When</th>
                  <th className="p-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-emerald-400/5 transition-colors">
                    <td className="p-4">
                      <span className={`text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded ${ACTION_STYLES[entry.action]}`}>
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="font-bold text-gray-100 text-xs">{entry.actorName}</p>
                      <p className="text-gray-500 font-mono text-[10px] uppercase">{entry.actorRegistrationNumber}</p>
                    </td>
                    <td className="p-4 text-gray-400 text-xs max-w-md">{summarizeDetails(entry)}</td>
                    <td className="p-4 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      {entry.targetType === 'request' && entry.targetId && entry.action === 'REINSTATE_REQUEST' && (
                        <button
                          onClick={() => navigate(`/admin/request/${entry.targetId}`)}
                          className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          View →
                        </button>
                      )}
                    </td>
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

export default AuditLog;
