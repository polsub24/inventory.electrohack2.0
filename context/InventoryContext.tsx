import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { Component, Team, Request, CartItem, RequestStatus } from '../types';
import api from '../server/api';

interface InventoryContextType {
  components: Component[];
  teams: Team[];
  requests: Request[];
  isLoading: boolean;
  lastSync: Date;
  refreshData: () => Promise<void>;
  submitRequest: (teamId: string, cart: CartItem[]) => Promise<Request>;
  updateRequestByAdmin: (requestId: string, updatedItems: { componentId: string, quantity: number }[], notes: string) => Promise<Request>;
  approveRequest: (requestId: string) => Promise<Request>;
  rejectRequest: (requestId: string) => Promise<Request>;
  releaseComponents: (requestId: string) => Promise<Request>;
  reinstateInventory: (requestId: string) => Promise<Request>;
  deleteRequest: (requestId: string) => Promise<void>;
  getComponentById: (id: string) => Component | undefined;
  getRequestsForTeam: (teamId: string) => Request[];
  upsertComponent: (componentData: Omit<Component, 'reservedQuantity'>) => Promise<Component>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [components, setComponents] = useState<Component[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const refreshData = useCallback(async () => {
    // To avoid flashing a loading state on every poll, we don't set isLoading to true here.
    // It's initialized as true and set to false after the first fetch.
    try {
      const { components, teams, requests } = await api.getInventoryData();
      setComponents(components);
      setTeams(teams);
      setRequests(requests);
      setLastSync(new Date());
    } catch (error) {
      console.error("Failed to fetch inventory data", error);
    } finally {
      setIsLoading(false); // This ensures loading is false after the first fetch.
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 2000); // Reduced interval to 2 seconds for a more "real-time" feel.
    return () => clearInterval(interval);
  }, [refreshData]);

  const getComponentById = useCallback((id: string) => components.find(c => c.id === id), [components]);

  const getRequestsForTeam = useCallback(
    (teamId: string) => {
      return requests
        .filter((r) => r.teamId === teamId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    },
    [requests]
  );

  const submitRequest = async (teamId: string, cart: CartItem[]) => {
    const newRequest = await api.submitRequest(teamId, cart);
    await refreshData(); // Refresh all data to ensure consistency
    return newRequest;
  };

  const updateRequestByAdmin = async (requestId: string, updatedItems: { componentId: string, quantity: number }[], notes: string) => {
    const updatedRequest = await api.updateRequest(requestId, RequestStatus.Modified, updatedItems, notes);
    await refreshData();
    return updatedRequest;
  };

  const approveRequest = async (requestId: string) => {
    const updatedRequest = await api.updateRequest(requestId, RequestStatus.Approved);
    await refreshData();
    return updatedRequest;
  };

  const rejectRequest = async (requestId: string) => {
    const updatedRequest = await api.updateRequest(requestId, RequestStatus.Rejected);
    await refreshData();
    return updatedRequest;
  };

  const releaseComponents = async (requestId: string) => {
    const updatedRequest = await api.updateRequest(requestId, RequestStatus.Collected);
    await refreshData();
    return updatedRequest;
  };

  const reinstateInventory = async (requestId: string) => {
    const updatedRequest = await api.reinstateInventory(requestId);
    await refreshData();
    return updatedRequest;
  };

  const deleteRequest = async (requestId: string) => {
    await api.deleteRequest(requestId);
    await refreshData();
  };

  const upsertComponent = async (componentData: Omit<Component, 'reservedQuantity'>) => {
    const savedComponent = await api.upsertComponent(componentData);
    await refreshData();
    return savedComponent;
  };

  return (
    <InventoryContext.Provider value={{
      components, teams, requests, isLoading, lastSync, refreshData, getComponentById,
      getRequestsForTeam,
      submitRequest, updateRequestByAdmin, approveRequest, rejectRequest, releaseComponents, reinstateInventory, deleteRequest, upsertComponent
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (context === undefined) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};