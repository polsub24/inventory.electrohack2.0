import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import InputField from '../common/InputField';
import api from '../../server/api';

const TeamManager: React.FC = () => {
    const { teams, refreshData } = useInventory();
    const [searchQuery, setSearchQuery] = useState('');
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [generatedCredentials, setGeneratedCredentials] = useState<{ teamName: string; password: string } | null>(null);

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

    const handleDeleteTeam = async (teamId: string, teamName: string) => {
        if (!confirm(`Are you sure you want to delete team "${teamName}"?\n\nThis will also delete all their requests and restore inventory stock.`)) {
            return;
        }

        setIsDeleting(teamId);
        setError('');
        setSuccess('');

        try {
            await api.deleteTeam(teamId);
            setSuccess(`Team "${teamName}" deleted successfully!`);
            await refreshData();
        } catch (err: any) {
            setError(err.message || 'Failed to delete team');
        } finally {
            setIsDeleting(null);
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
                setGeneratedCredentials({
                    teamName: newTeam.teamName,
                    password: newTeam.password
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
            {generatedCredentials && (
                <Card className="border-t-4 border-t-green-500 bg-gradient-to-br from-green-500/5 to-transparent">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="text-lg font-black text-green-400 uppercase tracking-tighter italic">
                                🎉 Team Credentials Generated
                            </h4>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">
                                Share these credentials with the team
                            </p>
                        </div>
                        <button
                            onClick={() => setGeneratedCredentials(null)}
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
                                    {generatedCredentials.teamName}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(generatedCredentials.teamName);
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
                                <code className="flex-1 bg-gray-800/50 px-4 py-2.5 rounded border border-gray-700 text-amber-400 font-mono font-semibold text-lg tracking-wider">
                                    {generatedCredentials.password}
                                </code>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(generatedCredentials.password);
                                    }}
                                    className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors text-xs font-bold uppercase"
                                    title="Copy to clipboard"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-amber-400 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Important: Save this password now. It cannot be recovered later.
                        </p>
                    </div>
                </Card>
            )}

            {/* Add Team Form */}
            {showAddForm && (
                <Card className="border-t-4 border-t-amber-500">
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
                    {filteredTeams.map((team) => (
                        <Card key={team.id} className="hover:border-amber-500/30 transition-colors">
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
                                            <span className="text-amber-500 font-mono font-semibold">{team.registrationNumber}</span>
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => handleDeleteTeam(team.id, team.teamName)}
                                    variant="danger"
                                    size="sm"
                                    disabled={isDeleting === team.id}
                                >
                                    {isDeleting === team.id ? <Spinner /> : 'Delete'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeamManager;
