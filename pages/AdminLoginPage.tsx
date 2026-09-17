import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import api from '../server/api';

const AdminLoginPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { loginAdmin, adminAuthMessage, clearAdminAuthMessage } = useAuth();

  // Surfaces a forced-logout ("your session expired") once, then clears it so
  // it doesn't linger on this screen after the next successful login.
  useEffect(() => {
    if (adminAuthMessage) {
      setError(adminAuthMessage);
      clearAdminAuthMessage();
    }
  }, [adminAuthMessage, clearAdminAuthMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await api.loginAdmin(password);
      loginAdmin();
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="w-full max-w-sm border border-emerald-900/30 z-10">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-black text-emerald-400 uppercase tracking-tighter italic">Admin Portal</h2>
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
              className="mt-1 block w-full px-4 py-3 bg-black border border-gray-800 rounded-md shadow-sm text-white placeholder-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs font-bold uppercase tracking-tight">{error}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 py-3 disabled:opacity-50">
            {isSubmitting ? 'Verifying...' : 'Unlock Console'}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default AdminLoginPage;