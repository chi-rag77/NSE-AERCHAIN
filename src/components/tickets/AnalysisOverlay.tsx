// ============================================================================
// AnalysisOverlay — "Analyze Similar Cases".
//
// One-shot, same pipeline the "ticket created" webhook uses: click → embed,
// search, synthesize → post straight to Freshdesk as a private note. No
// preview-then-confirm step — see ticketAnalysis.ts's header for why. Only
// ever mounted for a signed-in user; TicketDrawer doesn't render the trigger
// button at all in guest/public mode.
// ============================================================================

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/tickets";
import { fetchAutoAnalysis, triggerAnalysis, AutoAnalysisRow, MatchedTicket } from "@/services/ticketAnalysis";

const sanitizeNote = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

// Mirrors auto-analyze-ticket/index.ts's markdownToHtml — same small, known
// subset (headings via **bold**, `- ` bullets, `1. ` steps, `---` rules).
// Duplicated on purpose: an Edge Function can't be imported into the
// frontend, and ticket_auto_analysis stores the canonical markdown, not
// HTML — this is only needed for a row read back after the fact, not for a
// note this overlay just posted itself (that comes back with HTML already).
function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const openList = (kind: "ul" | "ol") => { if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; } };
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^---+$/.test(line.trim())) { closeList(); out.push("<hr />"); continue; }
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet) { openList("ul"); out.push(`<li>${inline(bullet[1])}</li>`); continue; }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) { openList("ol"); out.push(`<li>${inline(numbered[1])}</li>`); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

// The dashboard renders matched tickets as a table (below), not the bullet
// list baked into note_html for the Freshdesk note — strip that one section
// out of the displayed HTML so the same tickets aren't shown twice. The
// edge function's markdownToHtml always emits this heading as exactly
// `<p><strong>Matched tickets</strong></p>` immediately followed by the `<ul>`
// of bullets; if a row predates matched_tickets (no structured data to build
// a table from), this deliberately does nothing, so the bullets still show.
function stripMatchedTicketsSection(html: string, haveTable: boolean): string {
  if (!haveTable) return html;
  return html.replace(/<p><strong>Matched tickets<\/strong><\/p>\s*<ul>[\s\S]*?<\/ul>/, "");
}

const fmtDuration = (mins: number) => {
  const m = Math.max(0, Math.round(mins));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
};

const MatchedTicketsTable = ({ matches }: { matches: MatchedTicket[] }) => (
  <div className="overflow-x-auto rounded-xl border border-border/50">
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-border/50 bg-secondary/30 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2">Ticket</th>
          <th className="px-3 py-2">Match</th>
          <th className="px-3 py-2">Resolved in</th>
          <th className="px-3 py-2">Assignee</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m, i) => (
          <tr key={m.ticket_id} className={cn(i > 0 && "border-t border-border/40")}>
            <td className="max-w-[280px] px-3 py-2">
              <span className="font-semibold text-foreground">#{m.ticket_id}</span>{" "}
              <span className="text-muted-foreground">— {m.subject}</span>
              <span className="ml-1.5 text-[10.5px] text-muted-foreground/70">({statusLabel(m.status)})</span>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{Math.round(m.similarity * 100)}%</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDuration(m.resolve_minutes)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{m.responder_name ?? "Unassigned"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CONFIDENCE_TONE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  low: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

type Status = "loading" | "none" | "in_progress" | "posted" | "skipped" | "failed" | "triggering" | "trigger_error";

interface Props {
  ticketId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AnalysisOverlay = ({ ticketId, open, onOpenChange }: Props) => {
  const [status, setStatus] = useState<Status>("loading");
  const [row, setRow] = useState<AutoAnalysisRow | null>(null);
  const [noteHtml, setNoteHtml] = useState<string>("");
  const [matchedTickets, setMatchedTickets] = useState<MatchedTicket[]>([]);
  const [freshNoteId, setFreshNoteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (): Promise<AutoAnalysisRow | null> => {
    if (!ticketId) return null;
    setStatus("loading");
    const r = await fetchAutoAnalysis(ticketId);
    setRow(r);
    if (r?.note_body) setNoteHtml(markdownToHtml(r.note_body));
    setMatchedTickets(r?.matched_tickets ?? []);
    setStatus(r ? r.status : "none");
    return r;
  };

  // Ticket-scoped: opening the drawer for a different ticket always looks up
  // that ticket's own row, never a stale one left over from the last ticket.
  useEffect(() => {
    if (open && ticketId) {
      setRow(null);
      setNoteHtml("");
      setMatchedTickets([]);
      setFreshNoteId(null);
      setError(null);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId]);

  const run = async () => {
    if (!ticketId) return;
    setStatus("triggering");
    setError(null);
    const res = await triggerAnalysis(ticketId);
    if (!res.ok) {
      setError(res.error ?? "Analysis failed");
      setStatus("trigger_error");
      return;
    }
    if (res.posted && res.note_html) {
      setNoteHtml(res.note_html);
      setMatchedTickets(res.matched_tickets ?? []);
      setFreshNoteId(res.freshdesk_note_id ?? null);
    }
    // The ledger row is the source of truth either way — re-read it rather
    // than trusting this response's shape to cover every outcome (posted,
    // skipped, or "someone/something else already claimed it" in between).
    const r = await refresh();
    if (r) return;
    // No row exists even after a real attempt — this is a skip that happens
    // BEFORE the claim (e.g. the ticket is already Resolved/Closed on
    // Freshdesk), so there's nothing in the ledger to explain it. Surface the
    // reason directly instead of silently reverting to "no analysis yet".
    setError(res.reason ?? "This ticket can't be analyzed right now.");
    setStatus("trigger_error");
  };

  const generatedAt = row?.completed_at ?? row?.created_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Sparkles className="h-4 w-4 text-[#6B4EFF]" /> Analyze Similar Cases
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Searches already-resolved tickets for the closest matches, summarizes how those were solved, and posts the result to Freshdesk as a private note.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#6B4EFF]" />
              <div className="text-[12.5px] text-muted-foreground">Checking this ticket's analysis…</div>
            </div>
          )}

          {status === "none" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="text-[13px] font-medium text-foreground">No analysis yet for this ticket</div>
              <div className="max-w-sm text-[12px] text-muted-foreground">
                This runs the same search used automatically on new tickets, then posts the result straight to Freshdesk as a private note.
              </div>
            </div>
          )}

          {status === "in_progress" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <div className="text-[12.5px] text-muted-foreground">An analysis is already running for this ticket — check back shortly.</div>
            </div>
          )}

          {status === "triggering" && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#6B4EFF]" />
              <div className="text-[13px] font-medium text-foreground">Searching resolved tickets…</div>
              <div className="text-[11.5px] text-muted-foreground">Embedding, semantic search, and synthesis — this can take up to ~20s. Posts to Freshdesk automatically if it finds anything.</div>
            </div>
          )}

          {status === "trigger_error" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <div className="text-[13px] font-medium text-foreground">Analysis failed</div>
              <div className="max-w-md text-[12px] text-muted-foreground">{error}</div>
            </div>
          )}

          {status === "skipped" && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="text-[13px] font-medium text-foreground">No similar resolved tickets found</div>
              <div className="max-w-sm text-[12px] text-muted-foreground">
                Nothing in the resolved-ticket history cleared the similarity threshold — this may be a genuinely new kind of issue. Nothing was posted to Freshdesk.
              </div>
              {generatedAt && (
                <div className="text-[11px] text-muted-foreground/70">Checked {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}</div>
              )}
            </div>
          )}

          {status === "failed" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <div className="text-[13px] font-medium text-foreground">The last attempt failed</div>
              <div className="max-w-md text-[12px] text-muted-foreground">{row?.error ?? "Unknown error"}</div>
            </div>
          )}

          {status === "posted" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {row?.similar_count ?? 0} similar {row?.similar_count === 1 ? "case" : "cases"} found
                </span>
                {row?.confidence && (
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", CONFIDENCE_TONE[row.confidence])}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                    {row.confidence} confidence
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Posted to Freshdesk as a private note{(freshNoteId ?? row?.freshdesk_note_id) ? ` (#${freshNoteId ?? row?.freshdesk_note_id})` : ""}
                {generatedAt ? ` · ${formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}` : ""}.
              </div>

              <div
                className="fd-html rounded-xl border border-border/50 bg-secondary/20 px-4 py-3 text-[13px] leading-relaxed text-foreground/90 [&_hr]:my-2.5 [&_hr]:border-border/60 [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1"
                dangerouslySetInnerHTML={{ __html: sanitizeNote(stripMatchedTicketsSection(noteHtml, matchedTickets.length > 0)) }}
              />

              {matchedTickets.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Matched tickets</div>
                  <MatchedTicketsTable matches={matchedTickets} />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-3.5">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {status === "none" && (
            <Button size="sm" onClick={run} className="gap-1.5 bg-[#6B4EFF] hover:bg-[#5B3EEF]">
              <Send className="h-3.5 w-3.5" /> Analyze &amp; Post to Freshdesk
            </Button>
          )}
          {(status === "failed" || status === "trigger_error") && (
            <Button size="sm" onClick={run} disabled={status === "triggering"} className="gap-1.5 bg-[#6B4EFF] hover:bg-[#5B3EEF]">
              <RotateCcw className="h-3.5 w-3.5" /> Retry
            </Button>
          )}
          {status === "in_progress" && (
            <Button size="sm" variant="outline" onClick={refresh} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Check again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
