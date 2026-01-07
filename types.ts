
export type Station = 'Tompobulu' | 'Biringbulu' | 'Bungaya';

export interface Assignment {
  id: string;
  courierName: string;
  packageCount: number;
  station: Station;
  taskId: string;
  status: 'Pending' | 'Ongoing' | 'Completed' | 'Deleted';
  lastUpdated: string;
  deletionReason?: string;
  deletedAt?: string;
  completedAt?: string;
}

export interface AssignmentActionRequest {
  id: string;
  assignmentIds: string[];
  taskIds: string[];
  requesterId: string;
  requesterName: string;
  reason: string;
  type: 'Delete' | 'Restore';
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  approvedBy?: string;
}

export interface GroupedAssignment {
  id: string;
  courierName: string;
  station: Station;
  totalPackages: number;
  tasks: Assignment[];
  status: 'Pending' | 'Ongoing' | 'Completed' | 'Deleted';
  lastUpdated: string;
}

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'operator' | 'courier';
  position: string;
  password?: string;
  station?: Station;
  nickname?: string;
  whatsapp?: string;
  photoUrl?: string;
  dateOfBirth?: string;
  hasCompletedProfile?: boolean;
  status?: 'Active' | 'Inactive';
}

export interface LeaveRequest {
  id: string;
  courierId: string;
  courierName: string;
  type: 'Tahunan' | 'Sakit' | 'Izin';
  duration: string;
  reason: string;
  photoUrl?: string;
  status: 'Pending' | 'Approved_L1' | 'Approved' | 'Rejected';
  createdAt: string;
  submissionDate: string; // Added for tracking leave date
  approvedByL1?: string;
  approvedByFinal?: string;
}

export interface DeactivationRequest {
  id: string;
  targetUserId: string;
  targetUserName: string;
  requesterId: string;
  requesterName: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  createdAt: string;
}

export interface ReactivationRequest {
  id: string;
  targetUserId: string;
  targetUserName: string;
  requesterId: string;
  requesterName: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  createdAt: string;
}

export interface PositionChangeRequest {
  id: string;
  targetUserId: string;
  targetUserName: string;
  oldPosition: string;
  newPosition: string;
  type: 'Promotion' | 'Demotion';
  requesterId: string;
  requesterName: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  createdAt: string;
}

export interface UserSession {
  user: User;
}

export interface StationSummary {
  totalPackages: number;
  totalCouriers: number;
  completedTasks: number;
}
