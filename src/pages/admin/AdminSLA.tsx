import { useEffect, useState } from "react";
import { Loader2, Save, SlidersHorizontal, Info } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/utils/toast";
import { SlaRuleRow, loadSlaRules, saveSlaRule, defaultRules } from "@/services/sla";
import { PRIORITY_META } from "@/lib/tickets";
import { Priority } from "@/types/freshdesk";

const AdminSLA = () => {
  const [rules, setRules] = useState<SlaRuleRow[]>(defaultRules());
  const [loading, setLoading] = useState(true);
  const [savingP, setSavingP] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setRules(await loadSlaRules());
      setLoading(false);
    })();
  }, []);

  const update = (priority: number, patch: Partial<SlaRuleRow>) =>
    setRules((rs) => rs.map((r) => (r.priority === priority ? { ...r, ...patch } : r)));

  const onSave = async (rule: SlaRuleRow) => {
    if (rule.resolution_hours <= 0) { showError("Resolution hours must be greater than 0."); return; }
    setSavingP(rule.priority);
    const res = await saveSlaRule(rule);
    setSavingP(null);
    if (res.ok) showSuccess(`${PRIORITY_META[rule.priority as Priority]?.label ?? "Rule"} SLA saved`);
    else showError(res.error ?? "Failed to save");
  };

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[12.5px] text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            These resolution targets (in calendar hours) drive the SLA gauge, compliance
            trends, the at-risk list, and the downloadable reports across the whole dashboard.
            Changes take effect on the next data refresh.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-secondary/20 px-5 py-4">
            <SlidersHorizontal className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            <div>
              <h2 className="text-[14px] font-bold">SLA Rules by Severity</h2>
              <p className="text-[12px] text-muted-foreground">Resolution, acknowledgment & analysis targets</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {rules.map((r) => {
                const meta = PRIORITY_META[r.priority as Priority];
                const saving = savingP === r.priority;
                return (
                  <div key={r.priority} className="p-5">
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase", meta?.tone)}>
                        {meta?.label ?? `P${r.priority}`}
                      </span>
                      <Input
                        value={r.severity_label}
                        onChange={(e) => update(r.priority, { severity_label: e.target.value })}
                        className="h-8 max-w-xs text-[13px] font-semibold"
                      />
                    </div>

                    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
                      <Field label="Resolution (hours)">
                        <Input type="number" min={1} value={r.resolution_hours}
                          onChange={(e) => update(r.priority, { resolution_hours: Number(e.target.value) })} />
                      </Field>
                      <Field label="Ack (minutes)">
                        <Input type="number" min={1} value={r.ack_minutes}
                          onChange={(e) => update(r.priority, { ack_minutes: Number(e.target.value) })} />
                      </Field>
                      <Field label="Analysis (minutes)">
                        <Input type="number" min={1} value={r.analysis_minutes}
                          onChange={(e) => update(r.priority, { analysis_minutes: Number(e.target.value) })} />
                      </Field>
                      <Field label="Resolution label">
                        <Input value={r.resolution_label ?? ""} placeholder="e.g. 8 business hours"
                          onChange={(e) => update(r.priority, { resolution_label: e.target.value })} />
                      </Field>
                      <Button onClick={() => onSave(r)} disabled={saving} className="w-full lg:w-auto">
                        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Save className="mr-2 h-4 w-4" /> Save</>}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default AdminSLA;
