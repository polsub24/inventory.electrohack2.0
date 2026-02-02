import { Component, Team, Request, CartItem, RequestStatus } from '../types';

// Robust BASE_URL detection: 
// In development (port 5173), we explicitly try to hit the backend port 3000 if proxy fails.
// In production, we use relative paths.
const isDev = window.location.port === '5173';
const BASE_URL = isDev ? 'http://localhost:3000' : '';

const api = {
  // --- AUTH ---
  async loginOrRegisterTeam(teamData: { teamName: string; leaderName: string; registrationNumber: string }): Promise<Team> {
    try {
      const response = await fetch(`${BASE_URL}/api/teams/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Login failed (Status: ${response.status})`);
      }
      return response.json();
    } catch (err) {
      console.error("Auth API Error:", err);
      throw err;
    }
  },

  // --- DATA FETCHING ---
  async getInventoryData(): Promise<{ components: Component[], teams: Team[], requests: Request[] }> {
    try {
      const response = await fetch(`${BASE_URL}/api/inventory`);
      
      if (!response.ok) {
        // Handle 404 specifically to help debugging
        if (response.status === 404) {
          throw new Error(`Inventory endpoint not found (404). Ensure backend server is running and routes are registered correctly.`);
        }
        const errorText = await response.text();
        throw new Error(`Server Error (Status: ${response.status}). ${errorText.substring(0, 100)}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.components) {
        throw new Error('Invalid data structure received from server');
      }

      // Map MongoDB _id to frontend id and fix dates
      return {
        ...data,
        requests: data.requests.map((r: any) => ({
          ...r,
          id: r.id || r._id,
          timestamp: new Date(r.timestamp),
          items: r.items.map((i: any) => ({
              ...i,
              component: i.component ? { ...i.component, id: i.component._id || i.component.id } : null
          }))
        })),
        components: data.components.map((c: any) => ({ ...c, id: c._id || c.id }))
      };
    } catch (error: any) {
      console.error("Critical Inventory Fetch Failure:", error.message);
      throw error;
    }
  },

  // --- PARTICIPANT ACTIONS ---
  async submitRequest(teamId: string, cart: CartItem[]): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, cart }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Submission failed');
    }
    return response.json();
  },

  // --- ADMIN ACTIONS ---
  async updateRequest(requestId: string, status: RequestStatus, items?: { componentId: string, quantity: number }[], notes?: string): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, items, notes }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Update failed');
    }
    return response.json();
  },

  async upsertComponent(componentData: Omit<Component, 'reservedQuantity'>): Promise<Component> {
    const response = await fetch(`${BASE_URL}/api/components`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(componentData),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Save failed');
    }
    return response.json();
  }
};

export default api;