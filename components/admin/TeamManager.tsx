import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/InventoryContext';
import { Component, RequestStatus } from '../../types';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import InputField from '../common/InputField';
import Modal from '../common/Modal';
import api, { TeamHasUnreturnedComponentsError, UnreturnedComponentRequest } from '../../server/api';

const TeamManager: React.FC = () => {
    const navigate = useNavigate();
    const { teams, requests, components, refreshData } = useInventory();
    const [searchQuery, setSearchQuery] = useState('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [credentialsPanel, setCredentialsPanel] = useState<{ teamName: string; password: string; source: 'generated' | 'retrieved' } | null>(null);
    const [revealingTeamId, setRevealingTeamId] = useState<string | null>(null);
    const [viewingTeamId, setViewingTeamId] = useState<string | null>(null);
    const [blockedDeletion, setBlockedDeletion] = useState<{ teamName: string; requests: UnreturnedComponentRequest[] } | null>(null);
    const [confirmingDeletion, setConfirmingDeletion] = useState<{ teamId: string; teamName: string } | null>(null);
    const [deletedByName, setDeletedByName] = useState('');
    const [deletedByRegNum, setDeletedByRegNum] = useState('');

    // Manage Roster modal — a single admin-credentials pair gates every add/remove
    // action taken while the modal is open, rather than a separate confirm card per
    // action, since these are lower-stakes than deleting a whole team.
    const [manageRosterTeamId, setManageRosterTeamId] = useState<string | null>(null);
    const [rosterAdminName, setRosterAdminName] = useState('');
    const [rosterAdminRegNum, setRosterAdminRegNum] = useState('');
    const [rosterNewMemberName, setRosterNewMemberName] = useState('');
    const [rosterNewMemberRegNum, setRosterNewMemberRegNum] = useState('');
    const [rosterActionPending, setRosterActionPending] = useState<string | null>(null);
    const [rosterError, setRosterError] = useState('');

    // Add team form state
    const [teamName, setTeamName] = useState('');
    const [leaderName, setLeaderName] = useState('');
    const [regNum, setRegNum] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const filteredTeams = teams.filter(team =>
        team.teamName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.leaderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        team.registrationNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDeleteTeam = (teamId: string, teamName: string) => {
        setError('');
        setSuccess('');

        // Check locally first, off the already-polled data — catches the common
        // case instantly without a round trip. The server enforces the same rule
        // independently below in case stock moved between this check and the click.
        const stillCollected = requests.filter(r => r.teamId === teamId && r.status === RequestStatus.Collected);
        if (stillCollected.length > 0) {
            setBlockedDeletion({
                teamName,
                requests: stillCollected.map(r => ({
                    requestId: r.id,
                    timestamp: r.timestamp.toISOString(),
                    items: r.items.map(i => ({
                        componentId: i.componentId,
                        name: i.component?.name ?? 'Unknown component',
                        category: i.component?.category ?? '',
                        quantity: i.quantity
                    }))
                }))
            });
            return;
        }

        setDeletedByName('');
        setDeletedByRegNum('');
        setConfirmingDeletion({ teamId, teamName });
    };

    const closeDeleteConfirm = () => {
        setConfirmingDeletion(null);
        setError('');
    };

    const handleConfirmDeleteTeam = async () => {
        if (!confirmingDeletion) return;
        const name = deletedByName.trim();
        const registrationNumber = deletedByRegNum.trim();
        if (!name || !registrationNumber) return;

        const { teamId, teamName } = confirmingDeletion;
        setIsDeleting(teamId);
        setError('');

        try {
            await api.deleteTeam(teamId, { name, registrationNumber });
            setConfirmingDeletion(null);
            setSuccess(`Team "${teamName}" deleted successfully!`);
            await refreshData();
        } catch (err: any) {
            if (err instanceof TeamHasUnreturnedComponentsError) {
                setConfirmingDeletion(null);
                setBlockedDeletion({ teamName, requests: err.requests });
            } else {
                // Leave the confirmation card open so the admin can see the error and retry.
                setError(err.message || 'Failed to delete team');
            }
        } finally {
            setIsDeleting(null);
        }
    };

    const goToRequest = (requestId: string) => {
        setBlockedDeletion(null);
        navigate(`/admin/request/${requestId}`);
    };

    const openManageRoster = (teamId: string) => {
        setManageRosterTeamId(teamId);
        setRosterAdminName('');
        setRosterAdminRegNum('');
        setRosterNewMemberName('');
        setRosterNewMemberRegNum('');
        setRosterError('');
    };

    const closeManageRoster = () => {
        setManageRosterTeamId(null);
        setRosterError('');
    };

    const rosterCredentialsReady = !!rosterAdminName.trim() && !!rosterAdminRegNum.trim();

    const handleRosterAddMember = async () => {
        if (!manageRosterTeamId || !rosterCredentialsReady) return;
        const name = rosterNewMemberName.trim();
        const registrationNumber = rosterNewMemberRegNum.trim();
        if (!name || !registrationNumber) return;
        setRosterActionPending('add');
        setRosterError('');
        try {
            await api.addTeamMember(manageRosterTeamId, name, registrationNumber, {
                name: rosterAdminName.trim(),
                registrationNumber: rosterAdminRegNum.trim(),
            });
            setRosterNewMemberName('');
            setRosterNewMemberRegNum('');
            await refreshData();
        } catch (err: any) {
            setRosterError(err.message || 'Failed to add member.');
        } finally {
            setRosterActionPending(null);
        }
    };

    const handleRosterRemoveMember = async (memberId: string) => {
        if (!manageRosterTeamId || !rosterCredentialsReady) return;
        setRosterActionPending(memberId);
        setRosterError('');
        try {
            await api.removeTeamMember(manageRosterTeamId, memberId, {
                name: rosterAdminName.trim(),
                registrationNumber: rosterAdminRegNum.trim(),
            });
            await refreshData();
        } catch (err: any) {
            setRosterError(err.message || 'Failed to remove member.');
        } finally {
            setRosterActionPending(null);
        }
    };

    const handleAddTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName || !leaderName || !regNum) {
            setError('All fields are mandatory.');
            return;
        }

        setError('');
        setSuccess('');
        setIsAdding(true);

        try {
            const newTeam = await api.registerTeam({ teamName, leaderName, registrationNumber: regNum });

            // Store the credentials to display
            if (newTeam.password) {
                setCredentialsPanel({
                    teamName: newTeam.teamName,
                    password: newTeam.password,
                    source: 'generated'
                });
            }

            setSuccess(`Team "${teamName}" registered successfully!`);
            // Clear form
            setTeamName('');
            setLeaderName('');
            setRegNum('');
            setShowAddForm(false);
            await refreshData();
        } catch (err: any) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsAdding(false);
        }
    };

    const handleViewCredentials = async (teamId: string) => {
        setRevealingTeamId(teamId);
        setError('');
        setSuccess('');
        try {
            const credentials = await api.getTeamCredentials(teamId);
            setCredentialsPanel({ ...credentials, source: 'retrieved' });
        } catch (err: any) {
            setError(err.message || 'Failed to retrieve credentials');
        } finally {
            setRevealingTeamId(null);
        }
    };

    // Get team's collected and returned components. A single Collected request
    // can itself be partially returned — some units still with the team, some
    // already back — so this sums per item (quantity - returnedQuantity) into
    // "collected" and returnedQuantity into "returned", rather than bucketing
    // whole requests by status. A Returned request just has returnedQuantity
    // caught up to quantity on every item, so it falls out of this the same way.
    const getTeamInventory = (teamId: string) => {
        const teamRequests = requests.filter(r =>
            r.teamId === teamId &&
            (r.status === RequestStatus.Collected || r.status === RequestStatus.Returned)
        );

        const collected: { [key: string]: { component: Component, quantity: number } } = {};
        const returned: { [key: string]: { component: Component, quantity: number } } = {};

        teamRequests.forEach(req => {
            req.items.forEach(item => {
                const comp = components.find(c => c.id === item.componentId);
                if (!comp) return;

                const outstandingQty = item.quantity - item.returnedQuantity;
                if (outstandingQty > 0) {
                    if (collected[item.componentId]) {
                        collected[item.componentId].quantity += outstandingQty;
                    } else {
                        collected[item.componentId] = { component: comp, quantity: outstandingQty };
                    }
                }
                if (item.returnedQuantity > 0) {
                    if (returned[item.componentId]) {
                        returned[item.componentId].quantity += item.returnedQuantity;
                    } else {
                        returned[item.componentId] = { component: comp, quantity: item.returnedQuantity };
                    }
                }
            });
        });

        return {
            collected: Object.values(collected),
            returned: Object.values(returned)
        };
    };

    return (
        <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
                        Manage Teams
                    </h3>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                        {teams.length} team{teams.length !== 1 ? 's' : ''} registered
                    </p>
                </div>
                <Button
                    onClick={() => setShowAddForm(!showAddForm)}
                    variant={showAddForm ? 'secondary' : 'primary'}
                    size="sm"
                >
                    {showAddForm ? 'Cancel' : '+ Add New Team'}
                </Button>
            </div>

            {/* Success/Error Messages */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
                </div>
            )}

            {success && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-green-400 text-xs font-bold uppercase tracking-wide">{success}</p>
                </div>
            )}

            {/* Credentials Panel */}
            {credentialsPanel && (
                <Card className="border-t-4 border-t-green-500 bg-gradient-to-br from-green-500/5 to-transparent">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="text-lg font-black text-green-400 uppercase tracking-tighter italic">
                                {credentialsPanel.source === 'generated' ? '🎉 Team Credentials Generated' : 'Team Credentials'}
                            </h4>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                                Share these credentials with the team
                            </p>
                        </div>
                        <button
                            onClick={() => setCredentialsPanel(null)}
                            className="text-gray-500 hover:text-gray-300 transition-colors"
                            title="Dismiss"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-4 bg-gray-900/50 p-4 rounded-lg border border-green-500/20">
                        <div>
                            <label className="text-gray-600 uppercase text-xs font-bold tracking-wider block mb-2">
                                Team Name
                            </label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-gray-800/50 px-4 py-2.5 rounded border border-gray-700 text-green-400 font-mono font-semibold text-sm">
                                    {credentialsPanel.teamName}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(credentialsPanel.teamName);
                                    }}
                                    className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors text-xs font-bold uppercase"
                                    title="Copy to clipboard"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-gray-600 uppercase text-xs font-bold tracking-wider block mb-2">
                                Password
                            </label>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 bg-gray-800/50 px-4 py-2.5 rounded border border-gray-700 text-emerald-300 font-mono font-semibold text-lg tracking-wider">
                                    {credentialsPanel.password}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(credentialsPanel.password);
                                    }}
                                    className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors text-xs font-bold uppercase"
                                    title="Copy to clipboard"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>

                    {credentialsPanel.source === 'generated' && (
                        <div className="mt-4 p-3 bg-emerald-400/10 border border-emerald-400/20 rounded-lg">
                            <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Tip: You can always view this password again from "Credentials" on the team's row.
                            </p>
                        </div>
                    )}
                </Card>
            )}

            {/* Add Team Form */}
            {showAddForm && (
                <Card className="border-t-4 border-t-emerald-400">
                    <h4 className="text-lg font-black text-white uppercase tracking-tighter italic mb-4">
                        Register New Team
                    </h4>
                    <form onSubmit={handleAddTeam} className="space-y-4">
                        <InputField
                            id="teamName"
                            label="Team Name"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            placeholder="e.g. RoboTitans"
                            disabled={isAdding}
                        />
                        <InputField
                            id="leaderName"
                            label="Team Leader"
                            value={leaderName}
                            onChange={(e) => setLeaderName(e.target.value)}
                            placeholder="Full Name"
                            disabled={isAdding}
                        />
                        <InputField
                            id="regNum"
                            label="Registration Number"
                            value={regNum}
                            onChange={(e) => setRegNum(e.target.value)}
                            placeholder="e.g. REG-2024-001"
                            disabled={isAdding}
                        />
                        <Button type="submit" className="w-full" disabled={isAdding}>
                            {isAdding ? <Spinner /> : 'Register Team'}
                        </Button>
                    </form>
                </Card>
            )}

            {/* Search Bar */}
            <div>
                <InputField
                    id="search"
                    label="Search Teams"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by team name, leader, or registration number..."
                />
            </div>

            {/* Teams List */}
            {filteredTeams.length === 0 ? (
                <Card className="text-center py-12">
                    <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">
                        {searchQuery ? 'No teams found matching your search' : 'No teams registered yet'}
                    </p>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredTeams.map((team) => {
                        const inventory = getTeamInventory(team.id);
                        const collectedCount = inventory.collected.reduce((sum, item) => sum + item.quantity, 0);
                        const returnedCount = inventory.returned.reduce((sum, item) => sum + item.quantity, 0);

                        return (
                            <Card key={team.id} className="hover:border-emerald-400/30 transition-colors">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div className="flex-1">
                                        <h4 className="text-lg font-black text-white uppercase tracking-tight italic">
                                            {team.teamName}
                                        </h4>
                                        <div className="mt-2 space-y-1">
                                            <p className="text-sm text-gray-400">
                                                <span className="text-gray-600 uppercase text-xs font-bold tracking-wider">Leader:</span>{' '}
                                                <span className="text-gray-300 font-semibold">{team.leaderName}</span>
                                            </p>
                                            <p className="text-sm text-gray-400">
                                                <span className="text-gray-600 uppercase text-xs font-bold tracking-wider">Reg #:</span>{' '}
                                                <span className="text-emerald-400 font-mono font-semibold">{team.registrationNumber}</span>
                                            </p>
                                            <div className="flex gap-4 mt-2">
                                                <p className="text-xs text-gray-500">
                                                    <span className="text-green-400 font-black">{collectedCount}</span> collected
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    <span className="text-blue-400 font-black">{returnedCount}</span> returned
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => handleViewCredentials(team.id)}
                                            variant="secondary"
                                            size="sm"
                                            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                                            disabled={revealingTeamId === team.id}
                                        >
                                            {revealingTeamId === team.id ? <Spinner /> : 'Credentials'}
                                        </Button>
                                        <Button
                                            onClick={() => setViewingTeamId(team.id)}
                                            variant="secondary"
                                            size="sm"
                                            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                        >
                                            View Inventory
                                        </Button>
                                        <Button
                                            onClick={() => openManageRoster(team.id)}
                                            variant="secondary"
                                            size="sm"
                                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                        >
                                            Roster ({1 + team.members.length}){team.rosterLocked ? ' 🔒' : ''}
                                        </Button>
                                        <Button
                                            onClick={() => handleDeleteTeam(team.id, team.teamName)}
                                            variant="danger"
                                            size="sm"
                                            disabled={isDeleting === team.id}
                                        >
                                            {isDeleting === team.id ? <Spinner /> : 'Delete'}
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Team Inventory Modal */}
            {viewingTeamId && (() => {
                const team = teams.find(t => t.id === viewingTeamId);
                if (!team) return null;

                const inventory = getTeamInventory(viewingTeamId);

                return (
                    <Modal
                        isOpen={true}
                        onClose={() => setViewingTeamId(null)}
                        title={`${team.teamName} - Inventory`}
                    >
                        <div className="space-y-6">
                            {/* Collected Components */}
                            <div>
                                <h4 className="text-sm font-black text-green-400 uppercase tracking-widest mb-3">
                                    Collected Components ({inventory.collected.length})
                                </h4>
                                {inventory.collected.length === 0 ? (
                                    <p className="text-center text-gray-500 py-4 text-xs uppercase tracking-widest">
                                        No components collected
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="border-b border-gray-800">
                                                <tr>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Component</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Category</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800">
                                                {inventory.collected.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-green-500/5 transition-colors">
                                                        <td className="p-3 font-bold text-gray-100 text-xs">{item.component.name}</td>
                                                        <td className="p-3">
                                                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-900/40 px-2 py-0.5 rounded">
                                                                {item.component.category}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-green-400 font-mono text-xs font-black text-right">{item.quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Returned Components */}
                            <div>
                                <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-3">
                                    Returned Components ({inventory.returned.length})
                                </h4>
                                {inventory.returned.length === 0 ? (
                                    <p className="text-center text-gray-500 py-4 text-xs uppercase tracking-widest">
                                        No components returned
                                    </p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="border-b border-gray-800">
                                                <tr>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Component</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Category</th>
                                                    <th className="p-3 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800">
                                                {inventory.returned.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-blue-500/5 transition-colors">
                                                        <td className="p-3 font-bold text-gray-100 text-xs">{item.component.name}</td>
                                                        <td className="p-3">
                                                            <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-900/40 px-2 py-0.5 rounded">
                                                                {item.component.category}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-blue-400 font-mono text-xs font-black text-right">{item.quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Summary */}
                            <div className="p-3 bg-emerald-400/5 border border-emerald-400/20 rounded">
                                <p className="text-xs text-gray-400">
                                    <span className="font-black text-green-400">Total Collected:</span>{' '}
                                    {inventory.collected.reduce((sum, item) => sum + item.quantity, 0)} units
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    <span className="font-black text-blue-400">Total Returned:</span>{' '}
                                    {inventory.returned.reduce((sum, item) => sum + item.quantity, 0)} units
                                </p>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {/* Blocked Deletion Modal — components still out with this team */}
            {blockedDeletion && (
                <Modal
                    isOpen={true}
                    onClose={() => setBlockedDeletion(null)}
                    title="Cannot Delete Team"
                    footer={
                        <Button onClick={() => setBlockedDeletion(null)} variant="secondary" className="px-6">
                            Close
                        </Button>
                    }
                >
                    <div className="space-y-5">
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-xs font-bold uppercase tracking-wide">
                                "{blockedDeletion.teamName}" is still holding collected components that haven't
                                been returned to inventory. Reinstate each request below before deleting this team.
                            </p>
                        </div>

                        {blockedDeletion.requests.map((req) => (
                            <div key={req.requestId} className="border border-gray-800 rounded-lg overflow-hidden">
                                <div className="flex justify-between items-center bg-black/40 px-4 py-2.5">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                        Collected {new Date(req.timestamp).toLocaleDateString()}
                                    </span>
                                    <button
                                        onClick={() => goToRequest(req.requestId)}
                                        className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
                                    >
                                        Reinstate →
                                    </button>
                                </div>
                                <table className="w-full text-left">
                                    <tbody className="divide-y divide-gray-800">
                                        {req.items.map((item) => (
                                            <tr key={item.componentId}>
                                                <td className="p-3 font-bold text-gray-100 text-xs">{item.name}</td>
                                                <td className="p-3">
                                                    <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest border border-emerald-900/40 px-2 py-0.5 rounded">
                                                        {item.category}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-gray-400 font-mono text-xs font-black text-right">
                                                    x{item.quantity}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </Modal>
            )}

            {/* Manage Roster Modal — admin add/remove of team members, credentialed + audit-logged */}
            {manageRosterTeamId && (() => {
                const team = teams.find(t => t.id === manageRosterTeamId);
                if (!team) return null;
                const totalSize = 1 + team.members.length;
                const atMax = totalSize >= 4;

                return (
                    <Modal
                        isOpen={true}
                        onClose={closeManageRoster}
                        title={`Manage Roster — ${team.teamName}`}
                    >
                        <div className="space-y-5">
                            {team.rosterLocked && (
                                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                                    <p className="text-blue-300 text-xs font-bold uppercase tracking-wide">
                                        This team's roster is locked. Changes made here are recorded to the audit log.
                                    </p>
                                </div>
                            )}

                            {rosterError && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{rosterError}</p>
                                </div>
                            )}

                            <div>
                                <p className="text-xs text-gray-500 mb-3">
                                    Record who is authorizing changes to this roster.
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <InputField
                                        id="rosterAdminName"
                                        label="Name"
                                        value={rosterAdminName}
                                        onChange={(e) => setRosterAdminName(e.target.value)}
                                        placeholder="Admin's full name"
                                        disabled={!!rosterActionPending}
                                    />
                                    <InputField
                                        id="rosterAdminRegNum"
                                        label="Registration Number"
                                        value={rosterAdminRegNum}
                                        onChange={(e) => setRosterAdminRegNum(e.target.value)}
                                        placeholder="e.g. REG-2024-001"
                                        disabled={!!rosterActionPending}
                                    />
                                </div>
                            </div>

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
                                        <button
                                            onClick={() => handleRosterRemoveMember(member.id)}
                                            disabled={!rosterCredentialsReady || !!rosterActionPending}
                                            className="text-[10px] font-black uppercase tracking-widest text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-40"
                                        >
                                            {rosterActionPending === member.id ? <Spinner /> : 'Remove'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {!atMax && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex-1">
                                        <InputField
                                            id="rosterNewMemberName"
                                            label="Add Participant"
                                            value={rosterNewMemberName}
                                            onChange={(e) => setRosterNewMemberName(e.target.value)}
                                            placeholder="Full name"
                                            disabled={!!rosterActionPending}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <InputField
                                            id="rosterNewMemberRegNum"
                                            label="Registration Number"
                                            value={rosterNewMemberRegNum}
                                            onChange={(e) => setRosterNewMemberRegNum(e.target.value)}
                                            placeholder="e.g. REG-2024-002"
                                            disabled={!!rosterActionPending}
                                        />
                                    </div>
                                    <Button
                                        onClick={handleRosterAddMember}
                                        disabled={!rosterCredentialsReady || !rosterNewMemberName.trim() || !rosterNewMemberRegNum.trim() || !!rosterActionPending}
                                        className="self-end"
                                    >
                                        {rosterActionPending === 'add' ? <Spinner /> : 'Add'}
                                    </Button>
                                </div>
                            )}
                            {atMax && (
                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                                    Team is at the maximum of 4 participants.
                                </p>
                            )}
                        </div>
                    </Modal>
                );
            })()}

            {/* Confirm Deletion Modal — requires the authorizing admin's name + reg # */}
            {confirmingDeletion && (
                <Modal
                    isOpen={true}
                    onClose={closeDeleteConfirm}
                    title="Confirm Deletion"
                    footer={
                        <>
                            <Button onClick={closeDeleteConfirm} variant="secondary" className="px-6" disabled={isDeleting === confirmingDeletion.teamId}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmDeleteTeam}
                                variant="danger"
                                className="px-8 bg-red-950/30 hover:bg-red-900 border-red-900/50 text-red-500"
                                disabled={isDeleting === confirmingDeletion.teamId || !deletedByName.trim() || !deletedByRegNum.trim()}
                            >
                                {isDeleting === confirmingDeletion.teamId ? <Spinner /> : 'Delete Team'}
                            </Button>
                        </>
                    }
                >
                    <div className="space-y-5">
                        <p className="text-sm text-gray-400">
                            Delete team "<span className="text-gray-200 font-bold">{confirmingDeletion.teamName}</span>"?
                            This will also delete all their request history and cannot be undone.
                        </p>

                        <p className="text-xs text-gray-500">
                            Record who is authorizing this deletion.
                        </p>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
                            </div>
                        )}

                        <InputField
                            id="deletedByName"
                            label="Name"
                            value={deletedByName}
                            onChange={(e) => setDeletedByName(e.target.value)}
                            placeholder="Full name of the admin authorizing this"
                            disabled={isDeleting === confirmingDeletion.teamId}
                        />
                        <InputField
                            id="deletedByRegNum"
                            label="Registration Number"
                            value={deletedByRegNum}
                            onChange={(e) => setDeletedByRegNum(e.target.value)}
                            placeholder="e.g. REG-2024-001"
                            disabled={isDeleting === confirmingDeletion.teamId}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default TeamManager;
