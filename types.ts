
export enum UserRole {
  Participant = 'PARTICIPANT',
  Admin = 'ADMIN',
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface Team {
  id: string;
  teamName: string;
  leaderName: string;
  registrationNumber: string;
  password?: string; // Only returned during registration
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
}

export interface RequestItem {
  componentId: string;
  quantity: number;
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
