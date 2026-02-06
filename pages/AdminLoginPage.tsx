import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

// --- CONFIGURATION ---
// CHANGE YOUR ADMIN PASSWORD HERE
const ADMIN_SECRET = 'electrocaspaglus2026';
// ---------------------

const AdminLoginPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { loginAdmin } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_SECRET) {
      loginAdmin();
      navigate('/admin');
    } else {
      setError('Incorrect password.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="w-full max-w-sm border border-amber-900/30">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-black text-amber-500 uppercase tracking-tighter italic">Admin Portal</h2>
          <p className="text-gray-500 text-xs uppercase tracking-widest mt-1">Authorized Access Only</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Passkey</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-4 py-3 bg-black border border-gray-800 rounded-md shadow-sm text-white placeholder-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs font-bold uppercase tracking-tight">{error}</p>}
          <Button type="submit" className="w-full mt-4 bg-amber-600 hover:bg-amber-500 py-3">
            Unlock Console
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default AdminLoginPage;