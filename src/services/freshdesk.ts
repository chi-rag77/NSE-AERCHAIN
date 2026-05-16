import { Ticket, Conversation } from "../types/freshdesk";

// Mock data for NSE tickets
const MOCK_TICKETS: Ticket[] = [
  {
    id: 10245,
    subject: "Connectivity issue with NSE primary gateway",
    description: "We are seeing intermittent drops in the primary gateway connection.",
    priority: 4,
    status: 2,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 mins ago
    updated_at: new Date().toISOString(),
    requester_id: 1,
    company_id: 101,
    company_name: "NSE",
    requester_name: "Rajesh Kumar",
    responder_id: 501,
    responder_name: "Amit Shah",
    tags: ["Infrastructure", "Critical"],
  },
  {
    id: 10246,
    subject: "Delayed trade confirmation reports",
    description: "Reports for the morning session are delayed by 15 minutes.",
    priority: 3,
    status: 3,
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
    updated_at: new Date().toISOString(),
    requester_id: 2,
    company_id: 101,
    company_name: "NSE",
    requester_name: "Sanjay Gupta",
    responder_id: null,
    tags: ["Reporting"],
  },
  {
    id: 10247,
    subject: "User access request for new terminal",
    description: "Requesting access for 5 new users in the clearing department.",
    priority: 2,
    status: 2,
    created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(), // 5 hours ago
    updated_at: new Date().toISOString(),
    requester_id: 3,
    company_id: 101,
    company_name: "NSE",
    requester_name: "Priya Sharma",
    responder_id: 502,
    responder_name: "Sarah Chen",
    tags: ["Access"],
  },
  {
    id: 10248,
    subject: "API documentation clarification",
    description: "Need details on the new websocket endpoint parameters.",
    priority: 1,
    status: 6,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    updated_at: new Date().toISOString(),
    requester_id: 4,
    company_id: 101,
    company_name: "NSE",
    requester_name: "Vikram Singh",
    responder_id: 501,
    responder_name: "Amit Shah",
    tags: ["API"],
  }
];

export const fetchTickets = async (): Promise<Ticket[]> => {
  // In a real app, this would call the Freshdesk API
  // For now, we return mock data filtered by NSE
  return new Promise((resolve) => {
    setTimeout(() => resolve(MOCK_TICKETS), 800);
  });
};

export const fetchConversations = async (ticketId: number): Promise<Conversation[]> => {
  return [
    {
      id: 1,
      body: "Hello, we are looking into the connectivity issue. Our team is checking the logs.",
      body_text: "Hello, we are looking into the connectivity issue. Our team is checking the logs.",
      incoming: false,
      private: false,
      user_id: 501,
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    },
    {
      id: 2,
      body: "Thank you. Please update as soon as possible as this is affecting live trading.",
      body_text: "Thank you. Please update as soon as possible as this is affecting live trading.",
      incoming: true,
      private: false,
      user_id: 1,
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      updated_at: new Date().toISOString(),
      attachments: [],
    }
  ];
};