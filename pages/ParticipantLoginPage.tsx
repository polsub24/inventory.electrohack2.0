import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Spinner from '../components/common/Spinner';

const ParticipantLoginPage: React.FC = () => {
  const [teamName, setTeamName] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [regNum, setRegNum] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginParticipant, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName || !leaderName || !regNum) {
      setError('All fields are mandatory.');
      return;
    }
    setError('');

    try {
      await loginParticipant({ teamName, leaderName, registrationNumber: regNum });
      navigate('/dashboard');
    } catch (err) {
      setError('Login failed. Please verify your details.');
    }
  };

  const InputField = ({ id, label, value, onChange, placeholder }: any) => (
      <div className="group">
        <label htmlFor={id} className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 transition-colors group-focus-within:text-amber-500">{label}</label>
        <div className="relative">
            <input
              id={id}
              type="text"
              value={value}
              onChange={onChange}
              className="block w-full pl-4 pr-3 py-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all text-sm font-medium"
              placeholder={placeholder}
              required
              disabled={isLoading}
            />
        </div>
      </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <Card className="w-full max-w-md border-t-4 border-t-amber-500 shadow-2xl">
        <div className="flex flex-col items-center mb-8 pt-2">
           <div className="w-12 h-12 mb-4 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
             </svg>
           </div>
           <h2 className="text-3xl font-black text-center text-white uppercase tracking-tighter italic">Team Access</h2>
           <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">Electrohack Inventory System</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <InputField id="teamName" label="Team Name" value={teamName} onChange={(e: any) => setTeamName(e.target.value)} placeholder="e.g. RoboTitans" />
          <InputField id="leaderName" label="Team Leader" value={leaderName} onChange={(e: any) => setLeaderName(e.target.value)} placeholder="Full Name" />
          <InputField id="regNum" label="Registration Number" value={regNum} onChange={(e: any) => setRegNum(e.target.value)} placeholder="e.g. REG-2024-001" />
          
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                <p className="text-red-400 text-xs font-bold uppercase tracking-wide">{error}</p>
            </div>
          )}
          
          <Button type="submit" className="w-full py-3.5 mt-2" disabled={isLoading} size="lg">
            {isLoading ? <Spinner /> : 'Initialize Session'}
          </Button>
        </form>
      </Card>
      
      <p className="mt-6 text-[10px] text-gray-600 uppercase tracking-widest font-bold">Protected System • Authorized Personnel Only</p>
    </div>
  );
};

export default ParticipantLoginPage;