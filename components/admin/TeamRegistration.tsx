import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import InputField from '../common/InputField';
import api from '../../server/api';

const TeamRegistration: React.FC = () => {
    const [teamName, setTeamName] = useState('');
    const [leaderName, setLeaderName] = useState('');
    const [regNum, setRegNum] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName || !leaderName || !regNum) {
            setError('All fields are mandatory.');
            return;
        }
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            await api.registerTeam({ teamName, leaderName, registrationNumber: regNum });
            setSuccess(`Team "${teamName}" registered successfully!`);
            // Clear form
            setTeamName('');
            setLeaderName('');
            setRegNum('');
        } catch (err: any) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <Card className="border-t-4 border-t-amber-500 shadow-2xl">
                <div className="mb-8">
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic mb-2">
                        Register New Team
                    </h3>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                        Add teams to the inventory system
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <InputField
                        id="teamName"
                        label="Team Name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. RoboTitans"
                        disabled={isLoading}
                    />
                    <InputField
                        id="leaderName"
                        label="Team Leader"
                        value={leaderName}
                        onChange={(e) => setLeaderName(e.target.value)}
                        placeholder="Full Name"
                        disabled={isLoading}
                    />
                    <InputField
                        id="regNum"
                        label="Registration Number"
                        value={regNum}
                        onChange={(e) => setRegNum(e.target.value)}
                        placeholder="e.g. REG-2024-001"
                        disabled={isLoading}
                    />

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                            <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                            <p className="text-green-400 text-xs font-bold uppercase tracking-wide">{success}</p>
                        </div>
                    )}

                    <Button type="submit" className="w-full py-3.5 mt-2" disabled={isLoading} size="lg">
                        {isLoading ? <Spinner /> : 'Register Team'}
                    </Button>
                </form>
            </Card>
        </div>
    );
};

export default TeamRegistration;
