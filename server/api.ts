
import { Component, Team, Request, CartItem, RequestStatus } from '../types';

const BASE_URL = ''; // Relative path because we serve from same origin on Render

const api = {
  // --- AUTH ---
  async loginOrRegisterTeam(teamData: { teamName: string; leaderName: string; registrationNumber: string }): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamData),
    });
    if (!response.ok) throw new Error('Login failed');
    return response.json();
  },

  // --- DATA FETCHING ---
  async getInventoryData(): Promise<{ components: Component[], teams: Team[], requests: Request[] }> {
    const response = await fetch(`${BASE_URL}/api/inventory`);
    if (!response.ok) throw new Error('Failed to fetch inventory');
    const data = await response.json();
    
    // Map dates and ensure IDs are strings
    return {
      ...data,
      requests: data.requests.map((r: any) => ({
        ...r,
        timestamp: new Date(r.timestamp),
        items: r.items.map((i: any) => ({
            ...i,
            component: i.component ? { ...i.component, id: i.component._id } : null
        }))
      })),
      components: data.components.map((c: any) => ({ ...c, id: c._id }))
    };
  },

  // --- PARTICIPANT ACTIONS ---
  async submitRequest(teamId: string, cart: CartItem[]): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, cart }),
    });
    if (!response.ok) throw new Error('Request submission failed');
    return response.json();
  },

  // --- ADMIN ACTIONS ---
  async updateRequest(requestId: string, status: RequestStatus, items?: { componentId: string, quantity: number }[], notes?: string): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, items, notes }),
    });
    if (!response.ok) throw new Error('Failed to update request');
    return response.json();
  },

  async upsertComponent(componentData: Omit<Component, 'reservedQuantity'>): Promise<Component> {
    const response = await fetch(`${BASE_URL}/api/components`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(componentData),
    });
    if (!response.ok) throw new Error('Failed to upsert component');
    return response.json();
  }
};

export default api;
