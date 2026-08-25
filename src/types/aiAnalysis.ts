// Shape returned by the analyze-ticket Edge Function ("SLA Autopsy").
// Segments/attribution/benchmark are computed deterministically server-side;
// only narrative/formal_narrative/prevention_tip come from the model.

export type AttributionTeam = "aerchain" | "nse" | "engineering";

export interface AIAnalysisSegment {
  index: number;
  status: number;
  label: string;
  team: AttributionTeam;
  startsAt: string;
  endsAt: string;
  minutes: number;
  confidence: "exact" | "approximate";
}

export interface AIAnalysisAttribution {
  aerchain: number;
  nse: number;
  engineering: number;
}

export interface AIAnalysisBenchmark {
  medianHours: number;
  sampleSize: number;
  ticketHours: number;
  multiple: number | null;
}

export interface AIAnalysisCitation {
  marker: string;                                                   // "S1", "M2", …
  type: "segment" | "note" | "customer_message" | "agent_reply";
  label: string;
  detail: string;
  at?: string;
}

export interface AIAnalysis {
  ticket_id: number;
  generated: boolean;          // true if Gemini actually ran this call, false if served from cache
  generated_at: string;
  generated_by?: string | null;
  model: string;
  confidence: "high" | "partial" | "low";
  completeness_note: string;
  segments: AIAnalysisSegment[];
  attribution: AIAnalysisAttribution;
  benchmark: AIAnalysisBenchmark | null;
  /** Short, concrete "the real reason" label — e.g. "Multi-team documentation verification". */
  primary_cause: string | null;
  narrative: string | null;
  formal_narrative: string | null;
  prevention_tip: string | null;
  citations: AIAnalysisCitation[];
  stale?: boolean;             // true when a fresh generation failed and this is the last good result
  warning?: string;
}
