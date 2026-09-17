import { Component, Team, Request, CartItem, RequestStatus } from '../types';

const BASE_URL = ''; // This is correct for proxy in dev and same-origin in prod

// Helper to create descriptive error messages from fetch responses
const createApiError = async (response: Response, defaultMessage: string): Promise<Error> => {
  try {
    const errorData = await response.json();
    return new Error(errorData.error || `${defaultMessage} (Status: ${response.status})`);
  } catch {
    return new Error(`${defaultMessage} (Status: ${response.status})`);
  }
};

const api = {
  // --- AUTH ---
  async registerTeam(teamData: { teamName: string; leaderName: string; registrationNumber: string }): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(teamData),
    });
    if (!response.ok) throw await createApiError(response, 'Registration failed');
    return response.json();
  },

  async loginTeam(teamName: string, password: string): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, password }),
    });
    if (!response.ok) throw await createApiError(response, 'Login failed');
    return response.json();
  },

  async loginAdmin(password: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw await createApiError(response, 'Admin login failed');
  },

  // --- DATA FETCHING ---
  async getInventoryData(): Promise<{ components: Component[], teams: Team[], requests: Request[] }> {
    const response = await fetch(`${BASE_URL}/api/inventory`);
    if (!response.ok) throw await createApiError(response, 'Failed to fetch inventory data');
    const data = await response.json();

    // Map dates and ensure IDs are strings
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
  },

  // --- PARTICIPANT ACTIONS ---
  async submitRequest(teamId: string, cart: CartItem[]): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, cart }),
    });
    if (!response.ok) throw await createApiError(response, 'Request submission failed');
    return response.json();
  },

  // --- ADMIN ACTIONS ---
  async updateRequest(requestId: string, status: RequestStatus, items?: { componentId: string, quantity: number }[], notes?: string): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, items, notes }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to update request');
    return response.json();
  },

  async reinstateInventory(requestId: string): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}/reinstate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw await createApiError(response, 'Failed to reinstate inventory');
    return response.json();
  },

  async deleteRequest(requestId: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw await createApiError(response, 'Failed to delete request');
  },

  async upsertComponent(componentData: Omit<Component, 'reservedQuantity'>): Promise<Component> {
    const response = await fetch(`${BASE_URL}/api/components`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(componentData),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to save component');
    return response.json();
  },

  async deleteTeam(teamId: string): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw await createApiError(response, 'Failed to delete team');
  }
};

export default api;