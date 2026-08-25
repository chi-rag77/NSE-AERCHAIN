// ============================================================================
// SLA rules data layer — reads/writes the admin-editable `sla_rules` table
// and applies the rules to the in-memory SLA engine.
//
// Single global ruleset: this dashboard serves one customer (NSE), so there
// is exactly one row per priority — no per-customer overrides.
// ============================================================================

import { supabase } from "./supabase";
import { applySlaRules, SlaRule, SLA_RESOLUTION_HOURS, SLA_LABELS } from "@/lib/tickets";
import { Priority } from "@/types/freshdesk";

export interface SlaRuleRow extends SlaRule {
  ack_minutes: number;
  analysis_minutes: number;
  updated_at?: string;
}

/** Current effective rules from the in-memory engine (used as a fallback). */
export const defaultRules = (): SlaRuleRow[] =>
  ([4, 3, 2, 1] as Priority[]).map((p) => ({
    priority: p,
    severity_label: SLA_LABELS[p].severity,
    resolution_hours: SLA_RESOLUTION_HOURS[p],
    resolution_label: SLA_LABELS[p].resolution,
    ack_minutes: 15,
    analysis_minutes: 60,
  }));

/** Fetch the SLA rules from Supabase and apply them. */
export const loadSlaRules = async (): Promise<SlaRuleRow[]> => {
  if (!supabase) return defaultRules();
  const { data, error } = await supabase
    .from("sla_rules")
    .select("*")
    .order("priority", { ascending: false });
  if (error || !data?.length) return defaultRules();
  applySlaRules(data as SlaRule[]);
  return data as SlaRuleRow[];
};

/** Admin: persist a single rule, then re-apply it locally. */
export const saveSlaRule = async (rule: SlaRuleRow): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase not configured" };
  const { error } = await supabase
    .from("sla_rules")
    .upsert(
      {
        priority: rule.priority,
        severity_label: rule.severity_label,
        resolution_hours: rule.resolution_hours,
        ack_minutes: rule.ack_minutes,
        analysis_minutes: rule.analysis_minutes,
        resolution_label: rule.resolution_label,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "priority" },
    );
  if (error) return { ok: false, error: error.message };
  applySlaRules([rule]);
  return { ok: true };
};
