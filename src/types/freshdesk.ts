export type Priority = 1 | 2 | 3 | 4; // 1: Low, 2: Medium, 3: High, 4: Critical
export type Status = 2 | 3 | 4 | 5; // 2: Open, 3: Pending, 4: Resolved, 5: Closed

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  priority: Priority;
  status: Status;
  created_at: string;
  updated_at: string;
  requester_id: number;
  company_id: number;
  responder_id: number | null;
  tags: string[];
  company_name?: string;
  requester_name?: string;
  responder_name?: string;
}

export interface Conversation {
  id: number;
  body: string;
  user_id: number;
  incoming: boolean;
  created_at: string;
}

export type SLAStatus = 'on-track' | 'attention' | 'immediate';

export interface SLAMetrics {
  status: SLAStatus;
  remainingTime: string; // e.g., "2h 15m"
  percentRemaining: number;
}