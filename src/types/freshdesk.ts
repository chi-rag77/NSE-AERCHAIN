export type Priority = 1 | 2 | 3 | 4; // 1: Low, 2: Medium, 3: High, 4: Urgent
export type Status = 2 | 3 | 4 | 5 | 6; // 2: Open, 3: Pending, 4: Resolved, 5: Closed, 6: Waiting on Customer

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
  sla_policy_id?: number;
}

export interface Conversation {
  id: number;
  body: string;
  body_text: string;
  incoming: boolean;
  private: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
  attachments: any[];
}

export type SLAStatus = 'on_track' | 'attention' | 'breached';

export interface SLAMetrics {
  remaining_time: number; // in seconds
  status: SLAStatus;
  label: string;
}