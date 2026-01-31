
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { Component, Team, Request, CartItem, RequestStatus, RequestItem, ComponentCategory } from '../types';
import { MOCK_COMPONENTS, MOCK_TEAMS, MOCK_REQUESTS } from '../components/participant/constants';

interface InventoryContextType {
  components: Component[];
  teams: Team[];
  requests: Request[];
  findTeamByRegNum: (regNum: string) => Team | undefined;
  registerTeam: (teamData: Omit<Team, 'id'>) => Team;
  getRequestsForTeam: (teamId: string) => Request[];
  submitRequest: (teamId: string, cart: CartItem[]) => Promise<void>;
  updateRequestByAdmin: (requestId: string, updatedItems: { componentId: string, quantity: number }[], notes: string) => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  releaseComponents: (requestId: string) => Promise<void>;
  getComponentById: (id: string) => Component | undefined;
  upsertComponent: (componentData: Omit<Component, 'reservedQuantity'>) => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [components, setComponents] = useState<Component[]>(MOCK_COMPONENTS);
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [requests, setRequests] = useState<Request[]>(MOCK_REQUESTS);

  const getComponentById = useCallback((id: string) => components.find(c => c.id === id), [components]);

  const findTeamByRegNum = useCallback((regNum: string) => teams.find(t => t.registrationNumber === regNum), [teams]);

  const registerTeam = useCallback((teamData: Omit<Team, 'id'>) => {
    const newTeam: Team = { ...teamData, id: `t${teams.length + 1}` };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  }, [teams.length]);

  const getRequestsForTeam = useCallback((teamId: string) => {
    return requests.filter(r => r.teamId === teamId).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [requests]);

  const submitRequest = useCallback(async (teamId: string, cart: CartItem[]) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setComponents(prevComponents => {
          const newComponents = [...prevComponents];
          for (const item of cart) {
            const compIndex = newComponents.findIndex(c => c.id === item.componentId);
            if (compIndex !== -1) {
              newComponents[compIndex].reservedQuantity += item.quantity;
            }
          }
          return newComponents;
        });

        const team = teams.find(t => t.id === teamId);
        if (!team) return;

        const newRequest: Request = {
          id: `r${requests.length + 1}`,
          teamId,
          team,
          status: RequestStatus.Pending,
          items: cart.map(item => ({
            componentId: item.componentId,
            quantity: item.quantity,
            component: components.find(c => c.id === item.componentId)!,
          })),
          timestamp: new Date(),
        };
        setRequests(prev => [newRequest, ...prev]);
        resolve();
      }, 500);
    });
  }, [components, requests.length, teams]);

  const updateRequestByAdmin = useCallback(async (requestId: string, updatedItems: { componentId: string, quantity: number }[], notes: string) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setRequests(prevReqs => {
          return prevReqs.map(req => {
            if (req.id === requestId) {
              const newItems = updatedItems.map(item => ({
                ...item,
                component: components.find(c => c.id === item.componentId)!
              }));
              return { ...req, items: newItems, status: RequestStatus.Modified, notes };
            }
            return req;
          });
        });
        resolve();
      }, 500);
    });
  }, [components]);

  const approveRequest = useCallback(async (requestId: string) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: RequestStatus.Approved } : r));
        resolve();
      }, 500);
    });
  }, []);

  const rejectRequest = useCallback(async (requestId: string) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const request = requests.find(r => r.id === requestId);
        if (!request) return;

        setComponents(prevComponents => {
          const newComponents = [...prevComponents];
          for (const item of request.items) {
            const compIndex = newComponents.findIndex(c => c.id === item.componentId);
            if (compIndex !== -1) {
              newComponents[compIndex].reservedQuantity -= item.quantity;
            }
          }
          return newComponents;
        });

        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: RequestStatus.Rejected } : r));
        resolve();
      }, 500);
    });
  }, [requests]);

  const releaseComponents = useCallback(async (requestId: string) => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const request = requests.find(r => r.id === requestId);
        if (!request) return;

        setComponents(prevComponents => {
          const newComponents = [...prevComponents];
          for (const item of request.items) {
            const compIndex = newComponents.findIndex(c => c.id === item.componentId);
            if (compIndex !== -1) {
              newComponents[compIndex].totalQuantity -= item.quantity;
              newComponents[compIndex].reservedQuantity -= item.quantity;
            }
          }
          return newComponents;
        });

        setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: RequestStatus.Collected } : r));
        resolve();
      }, 500);
    });
  }, [requests]);

  const upsertComponent = useCallback((componentData: Omit<Component, 'reservedQuantity'>) => {
    setComponents(prev => {
      const existingIndex = prev.findIndex(c => c.id === componentData.id);
      if (existingIndex !== -1) {
        const newComponents = [...prev];
        newComponents[existingIndex] = { ...prev[existingIndex], ...componentData };
        return newComponents;
      }
      return [...prev, { ...componentData, reservedQuantity: 0 }];
    });
  }, []);

  return (
    <InventoryContext.Provider value={{
      components, teams, requests, findTeamByRegNum, registerTeam, getRequestsForTeam, submitRequest,
      updateRequestByAdmin, approveRequest, rejectRequest, releaseComponents, getComponentById, upsertComponent
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
