
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import RequestDetailView from '../components/admin/RequestDetailView';
import { useInventory } from '../context/InventoryContext';

const AdminRequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { requests } = useInventory();
  const request = requests.find(r => r.id === id);

  if (!request) {
    return (
      <div className="text-center py-10">
        <p className="text-xl text-red-500 font-black uppercase tracking-widest">Request Not Found</p>
        <Link to="/admin" className="mt-4 inline-block text-amber-500 hover:text-amber-400 font-bold uppercase text-xs tracking-widest">
          &larr; Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div>
       <Link to="/admin" className="mb-8 inline-flex items-center text-gray-500 hover:text-amber-500 transition-colors uppercase text-xs font-black tracking-widest">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Back to Console
      </Link>
      <div className="mb-8">
        <h1 className="text-3xl font-black text-amber-500 uppercase italic tracking-tighter">Request Management</h1>
        <p className="text-sm text-gray-500 uppercase tracking-widest mt-1">
            Team: <span className="text-gray-100 font-black">{request.team.teamName}</span> • Reg: <span className="text-gray-100 font-black">{request.team.registrationNumber}</span>
        </p>
      </div>
      <RequestDetailView request={request} />
    </div>
  );
};

export default AdminRequestDetailPage;
