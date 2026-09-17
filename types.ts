
export enum UserRole {
  Participant = 'PARTICIPANT',
  Admin = 'ADMIN',
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface TeamMember {
  id: string;
  name: string;
  registrationNumber: string;
  addedAt: string;
}

export interface Team {
  id: string;
  teamName: string;
  leaderName: string;
  registrationNumber: string;
  password?: string; // Only returned during registration
  members: TeamMember[];
  // Once true, only an admin (not the team's own login) can add/remove members —
  // set by the team finalizing its roster at 3-4 total participants (leader + members).
  rosterLocked: boolean;
}

export enum ComponentCategory {
  Sensors = 'Sensors',
  ICs = 'ICs',
  Passives = 'Passives',
  Modules = 'Modules',
}

export interface Component {
  id: string;
  name: string;
  category: ComponentCategory;
  totalQuantity: number;
  reservedQuantity: number;
  hasQuantityLimit?: boolean; // If false, component is unlimited (just available/out of stock)
}

export interface CartItem {
  componentId: string;
  quantity: number;
}

export enum RequestStatus {
  Pending = 'PENDING_APPROVAL',
  Modified = 'MODIFIED_BY_ADMIN',
  Approved = 'APPROVED_READY',
  Rejected = 'REJECTED',
  Collected = 'COLLECTED',
  Returned = 'RETURNED_TO_INVENTORY',
}

export interface RequestItem {
  componentId: string;
  quantity: number;
  // Cumulative units of `quantity` returned so far — a request can be partially
  // returned (some units back, some still with the team) before its status
  // flips from Collected to Returned, which only happens once every item's
  // returnedQuantity reaches its quantity.
  returnedQuantity: number;
  component: Component;
}

export interface Request {
  id: string;
  teamId: string;
  team: Team;
  status: RequestStatus;
  items: RequestItem[];
  timestamp: Date;
  notes?: string;
}
