
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

const ParticipantLoginPage: React.FC = () => {
  const [teamName, setTeamName] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [regNum, setRegNum] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginParticipant } = useAuth();
  const { findTeamByRegNum, registerTeam } = useInventory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName || !leaderName || !regNum) {
      setError('All fields are mandatory.');
      return;
    }

    let team = findTeamByRegNum(regNum);
    if (team) {
      loginParticipant(team);
    } else {
      const newTeam = registerTeam({ teamName, leaderName, registrationNumber: regNum });
      loginParticipant(newTeam);
    }
    navigate('/dashboard');
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="w-full max-w-md border border-amber-500/20 shadow-amber-500/5">
        <div className="flex flex-col items-center mb-6">
           <h2 className="text-2xl font-black text-center text-amber-500 uppercase tracking-tighter italic">Plug into Innovation</h2>
           <p className="text-gray-400 text-sm mt-1">Team Identification</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="teamName" className="block text-sm font-medium text-gray-400 uppercase tracking-widest">Team Name</label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-black border border-gray-800 rounded-md shadow-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              required
            />
          </div>
          <div>
            <label htmlFor="leaderName" className="block text-sm font-medium text-gray-400 uppercase tracking-widest">Team Leader</label>
            <input
              id="leaderName"
              type="text"
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-black border border-gray-800 rounded-md shadow-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              required
            />
          </div>
          <div>
            <label htmlFor="regNum" className="block text-sm font-medium text-gray-400 uppercase tracking-widest">Registration #</label>
            <input
              id="regNum"
              type="text"
              value={regNum}
              onChange={(e) => setRegNum(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-black border border-gray-800 rounded-md shadow-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm font-bold">{error}</p>}
          <Button type="submit" className="w-full mt-4 py-3">
            Enter Dashboard
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ParticipantLoginPage;
