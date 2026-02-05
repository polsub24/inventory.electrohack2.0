import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';
import InputField from '../components/common/InputField';

const ParticipantLoginPage: React.FC = () => {
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginParticipant, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName) {
      setError('Team Name is required.');
      return;
    }
    setError('');

    try {
      await loginParticipant(teamName);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your team name.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md border-t-4 border-t-amber-500 shadow-2xl">
        <div className="flex flex-col items-center mb-8 pt-2">
          <div className="w-12 h-12 mb-4 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-center text-white uppercase tracking-tighter italic">Team Login</h2>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">Electrohack Inventory System</p>
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

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
              <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full py-3.5 mt-2" disabled={isLoading} size="lg">
            {isLoading ? <Spinner /> : 'Login'}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-[10px] text-gray-600 uppercase tracking-widest font-bold">Protected System • Authorized Personnel Only</p>
    </div>
  );
};

export default ParticipantLoginPage;