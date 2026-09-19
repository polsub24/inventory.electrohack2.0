import { Component, Team, TeamMember, Request, CartItem, RequestStatus } from '../types';

const BASE_URL = ''; // This is correct for proxy in dev and same-origin in prod

export interface UnreturnedComponentRequest {
  requestId: string;
  timestamp: string;
  items: { componentId: string; name: string; category: string; quantity: number }[];
}

// Thrown by deleteTeam when the server blocks deletion because the team is still
// physically holding collected components. Carries the same per-request breakdown
// the server computed, so the UI can show exactly what needs to come back first
// instead of just a generic error string.
export class TeamHasUnreturnedComponentsError extends Error {
  requests: UnreturnedComponentRequest[];
  constructor(message: string, requests: UnreturnedComponentRequest[]) {
    super(message);
    this.name = 'TeamHasUnreturnedComponentsError';
    this.requests = requests;
  }
}

export interface AuditLogEntry {
  id: string;
  action: 'REINSTATE_REQUEST' | 'DELETE_COMPONENT' | 'DELETE_REQUEST' | 'DELETE_TEAM' | 'ADD_TEAM_MEMBER' | 'REMOVE_TEAM_MEMBER' | 'EDIT_TEAM_LEADER' | 'EDIT_TEAM_MEMBER';
  actorName: string;
  actorRegistrationNumber: string;
  targetType: 'request' | 'component' | 'team';
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ComponentHolder {
  requestId: string;
  teamId: string;
  teamName: string;
  leaderName: string;
  registrationNumber: string;
  quantity: number;
  timestamp: string;
}

// Thrown by deleteComponent when the server blocks deletion because one or more
// teams are still physically holding the component (collected, not returned).
// Carries the holder list the server computed, so the UI can show exactly who
// needs to bring it back instead of just a generic error string.
export class ComponentStillHeldError extends Error {
  holders: ComponentHolder[];
  constructor(message: string, holders: ComponentHolder[]) {
    super(message);
    this.name = 'ComponentStillHeldError';
    this.holders = holders;
  }
}

// A short-lived, revocable session token is cached in sessionStorage after a
// successful admin login — never the ADMIN_SECRET itself. The server issues this
// token in exchange for the secret and independently verifies it via requireAdmin
// on every admin-only request; it does not trust the client's login UI alone.
// Storing a token here (rather than the raw shared secret) means a leaked token
// can be revoked server-side without rotating ADMIN_SECRET and logging out every
// other admin, and it can't be replayed once its TTL or an explicit logout expires it.
const ADMIN_TOKEN_STORAGE_KEY = 'electrohack_admin_token';

// Called whenever an admin-authenticated request comes back 401 — e.g. the token
// expired, was revoked, or sessionStorage silently failed to persist it after
// login (private browsing). Wired up by AuthContext so a failed admin action
// always surfaces as "you've been signed out", never as a silent no-op.
let onAdminUnauthorized: (() => void) | null = null;
const setAdminUnauthorizedHandler = (handler: (() => void) | null) => {
  onAdminUnauthorized = handler;
};

const getAdminToken = (): string | null => {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

const setAdminToken = (token: string) => {
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage failed (e.g. private browsing with storage disabled) — the login
    // response still says "ok", but every subsequent admin call has no token to
    // send and will 401, which onAdminUnauthorized turns into a visible sign-out
    // instead of leaving admin actions silently doing nothing forever.
  }
};

const clearAdminToken = () => {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore.
  }
};

const adminHeaders = (): Record<string, string> => {
  const token = getAdminToken();
  return token ? { 'x-admin-token': token } : {};
};

// Helper to create descriptive error messages from fetch responses. For an
// admin-authenticated request that came back 401, this also fires the
// unauthorized handler so the session is torn down instead of silently retried
// forever by whatever screen made the call.
const createApiError = async (response: Response, defaultMessage: string, isAdminRequest = false): Promise<Error> => {
  if (isAdminRequest && response.status === 401) {
    clearAdminToken();
    onAdminUnauthorized?.();
    return new Error('Your admin session has expired. Please log in again.');
  }
  try {
    const errorData = await response.json();
    return new Error(errorData.error || `${defaultMessage} (Status: ${response.status})`);
  } catch {
    return new Error(`${defaultMessage} (Status: ${response.status})`);
  }
};

const api = {
  // --- AUTH ---
  // Admin-only: there is no participant self-registration flow, so this is
  // called exclusively from the admin "Manage Teams" panel.
  async registerTeam(teamData: { teamName: string; leaderName: string; registrationNumber: string }): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(teamData),
    });
    if (!response.ok) throw await createApiError(response, 'Registration failed', true);
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
    const { token } = await response.json();
    setAdminToken(token);
  },

  // Best-effort: revokes the session token server-side so it can't be replayed
  // after logout. Local state is cleared either way — if this fails (e.g.
  // offline), the token still expires on its own after ADMIN_SESSION_TTL_MS.
  async logoutAdmin(): Promise<void> {
    const headers = adminHeaders();
    clearAdminToken();
    if (!headers['x-admin-token']) return;
    try {
      await fetch(`${BASE_URL}/api/admin/logout`, { method: 'POST', headers });
    } catch {
      // Ignore — token will expire on its own.
    }
  },

  setAdminUnauthorizedHandler,

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
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ status, items, notes }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to update request', true);
    return response.json();
  },

  async reinstateInventory(
    requestId: string,
    returnedBy: { name: string; registrationNumber: string },
    items?: { componentId: string; quantity: number }[]
  ): Promise<Request> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}/reinstate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ returnedBy, items }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to reinstate inventory', true);
    return response.json();
  },

  async deleteRequest(requestId: string, deletedBy: { name: string; registrationNumber: string }): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/requests/${requestId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ deletedBy }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to delete request', true);
  },

  async upsertComponent(componentData: Omit<Component, 'reservedQuantity'>): Promise<Component> {
    const response = await fetch(`${BASE_URL}/api/components`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify(componentData),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to save component', true);
    return response.json();
  },

  async deleteComponent(
    componentId: string,
    deletedBy: { name: string; registrationNumber: string }
  ): Promise<{ message: string; notifiedTeams: { requestId: string; teamName: string; quantity: number }[] }> {
    const response = await fetch(`${BASE_URL}/api/components/${componentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ deletedBy }),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => null);
      if (body?.holders) {
        throw new ComponentStillHeldError(body.error, body.holders);
      }
    }
    if (!response.ok) throw await createApiError(response, 'Failed to delete component', true);
    return response.json();
  },

  async getTeamCredentials(teamId: string): Promise<{ teamName: string; password: string }> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/credentials`, {
      headers: { ...adminHeaders() },
    });
    if (!response.ok) throw await createApiError(response, 'Failed to retrieve credentials', true);
    return response.json();
  },

  async deleteTeam(teamId: string, deletedBy: { name: string; registrationNumber: string }): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ deletedBy }),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => null);
      if (body?.requests) {
        throw new TeamHasUnreturnedComponentsError(body.error, body.requests);
      }
    }
    if (!response.ok) throw await createApiError(response, 'Failed to delete team', true);
  },

  // No `changedBy` → open call, only succeeds while the team's roster is
  // unlocked (this is how the team's own leader adds members). Passing
  // `changedBy` sends the stored admin token automatically via adminHeaders()
  // and authorizes the change regardless of lock state — used by the admin
  // "Manage Roster" UI, where it's also required and audit-logged server-side.
  async addTeamMember(teamId: string, name: string, registrationNumber: string, changedBy?: { name: string; registrationNumber: string }): Promise<TeamMember> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ name, registrationNumber, changedBy }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to add team member', !!changedBy);
    return response.json();
  },

  async removeTeamMember(teamId: string, memberId: string, changedBy?: { name: string; registrationNumber: string }): Promise<void> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ changedBy }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to remove team member', !!changedBy);
  },

  // The leader's one-way "we're done adding people" action — always open
  // (never needs admin auth), since it's the team locking its own roster.
  async lockTeamRoster(teamId: string): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/lock`, {
      method: 'POST',
    });
    if (!response.ok) throw await createApiError(response, 'Failed to finalize team roster');
    return response.json();
  },

  // Admin-only correction, unlike add/remove — always requires changedBy and
  // is always sent with the admin token, regardless of roster lock state.
  async editTeamLeaderName(teamId: string, leaderName: string, changedBy: { name: string; registrationNumber: string }): Promise<Team> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/leader-name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ leaderName, changedBy }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to edit leader name', true);
    return response.json();
  },

  async editTeamMemberName(teamId: string, memberId: string, name: string, changedBy: { name: string; registrationNumber: string }): Promise<TeamMember> {
    const response = await fetch(`${BASE_URL}/api/teams/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminHeaders() },
      body: JSON.stringify({ name, changedBy }),
    });
    if (!response.ok) throw await createApiError(response, 'Failed to edit member name', true);
    return response.json();
  },

  async getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
    const response = await fetch(`${BASE_URL}/api/audit-log?limit=${limit}`, {
      headers: { ...adminHeaders() },
    });
    if (!response.ok) throw await createApiError(response, 'Failed to retrieve audit log', true);
    return response.json();
  }
};

export default api;