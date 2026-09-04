// ============================================================================
// AnalysisOverlay — "Analyze Similar Cases", the manual/on-demand counterpart
// to the auto-analyze-ticket webhook.
//
// Flow: open → run the dry-run pipeline (real embeddings, real semantic
// search, real Gemini synthesis) → show the note exactly as it would be
// posted → a SEPARATE, explicit click sends it to Freshdesk as a private
// note. Nothing reaches Freshdesk without that second click.
// ============================================================================

import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, Loader2, Send, CheckCircle2, AlertTriangle, RotateCcw, Lock, DatabaseZap } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeSimilarCases, postAnalysisNote, SimilarCasesResult } from "@/services/ticketAnalysis";

const sanitizeNote = (html: string) =>
  DOMPurify.sanitize(html, { FORBID_TAGS: ["style"], FORBID_ATTR: ["style"] });

const CONFIDENCE_TONE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  low: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

type Status = "loading" | "ready" | "empty" | "error" | "posting" | "posted" | "post_error";

interface Props {
  ticketId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "This came from cache, generated 3h ago — Regenerate for a fresh look."
 *  Surfaced so it's never a mystery why a click came back instantly, and so
 *  the AI-credit cost of a forced re-run is a visible, deliberate choice. */
const CacheLine = ({ result, canRegenerate, onRegenerate }: {
  result: SimilarCasesResult; canRegenerate: boolean; onRegenerate: () => void;
}) => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
    <DatabaseZap className="h-3 w-3" />
    {result.generated_at
      ? <>Cached · generated {formatDistanceToNow(new Date(result.generated_at), { addSuffix: true })}</>
      : "Cached"}
    <span className="text-border">·</span>
    {canRegenerate ? (
      <button onClick={onRegenerate} className="inline-flex items-center gap-1 font-semibold text-[#6B4EFF] dark:text-violet-300">
        <RotateCcw className="h-3 w-3" /> Regenerate
      </button>
    ) : (
      <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-[#6B4EFF] dark:text-violet-300">
        <Lock className="h-3 w-3" /> Sign in to regenerate
      </Link>
    )}
  </div>
);

export const AnalysisOverlay = ({ ticketId, open, onOpenChange }: Props) => {
  // Regenerating spends a real Gemini call, same reasoning as the SLA
  // Autopsy panel's "Refresh": open to anyone, but a forced re-run needs a
  // real identity behind it rather than a dead-end error for anon visitors.
  const { session } = useAuth();
  const canRegenerate = !!session;
  const [status, setStatus] = useState<Status>("loading");
  const [result, setResult] = useState<SimilarCasesResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postedNoteId, setPostedNoteId] = useState<number | null>(null);

  const run = async (force = false) => {
    if (!ticketId) return;
    setStatus("loading");
    setError(null);
    const res = await analyzeSimilarCases(ticketId, { force });
    if (!res.ok) {
      setError(res.error ?? "Analysis failed");
      setStatus("error");
      return;
    }
    setResult(res);
    setStatus(res.similar_count && res.similar_count > 0 ? "ready" : "empty");
  };

  // On open: the CACHED result for this ticket if one exists (near-free) —
  // never a forced fresh run. A different ticket_id always gets its own
  // lookup, so switching tickets never shows a stale note under a new id.
  useEffect(() => {
    if (open && ticketId) {
      setResult(null);
      setPostedNoteId(null);
      run(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketId]);

  const post = async () => {
    if (!ticketId || !result?.note_markdown || !result?.note_html) return;
    setStatus("posting");
    const res = await postAnalysisNote(ticketId, result.note_markdown, result.note_html);
    if (!res.ok) {
      setError(res.error ?? "Posting to Freshdesk failed");
      setStatus("post_error");
      return;
    }
    setPostedNoteId(res.freshdesk_note_id ?? null);
    setStatus("posted");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Sparkles className="h-4 w-4 text-[#6B4EFF]" /> Analyze Similar Cases
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Searches already-resolved tickets for the closest matches, then summarizes how those were solved. Nothing is sent to Freshdesk until you post it.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {status === "loading" && (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#6B4EFF]" />
              <div className="text-[13px] font-medium text-foreground">Searching resolved tickets…</div>
              <div className="text-[11.5px] text-muted-foreground">Embedding, semantic search, and synthesis — this can take up to ~20s.</div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertTriangle className="h-6 w-6 text-rose-500" />
              <div className="text-[13px] font-medium text-foreground">Analysis failed</div>
              <div className="max-w-md text-[12px] text-muted-foreground">{error}</div>
              <Button size="sm" variant="outline" onClick={() => run(false)} className="mt-1 gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          )}

          {status === "empty" && (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="text-[13px] font-medium text-foreground">No similar resolved tickets found</div>
              <div className="max-w-sm text-[12px] text-muted-foreground">
                Nothing in the resolved-ticket history cleared the similarity threshold — this may be a genuinely new kind of issue.
              </div>
              {result?.cached && <CacheLine result={result} canRegenerate={canRegenerate} onRegenerate={() => run(true)} />}
            </div>
          )}

          {(status === "ready" || status === "posting" || status === "posted" || status === "post_error") && result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {result.similar_count} similar {result.similar_count === 1 ? "case" : "cases"} found
                </span>
                <div className="flex items-center gap-2">
                  {result.confidence && (
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", CONFIDENCE_TONE[result.confidence])}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      {result.confidence} confidence
                    </span>
                  )}
                </div>
              </div>
              {result.cached && status !== "posting" && status !== "posted" && (
                <CacheLine result={result} canRegenerate={canRegenerate} onRegenerate={() => run(true)} />
              )}

              {status === "posted" ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Posted to Freshdesk as a private note{postedNoteId ? ` (#${postedNoteId})` : ""}.
                </div>
              ) : status === "post_error" ? (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              ) : null}

              <div
                className="fd-html rounded-xl border border-border/50 bg-secondary/20 px-4 py-3 text-[13px] leading-relaxed text-foreground/90 [&_hr]:my-2.5 [&_hr]:border-border/60 [&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-4 [&_ul]:list-disc [&_ul]:space-y-1"
                dangerouslySetInnerHTML={{ __html: sanitizeNote(result.note_html ?? "") }}
              />
            </div>
          )}
        </div>

        {(status === "ready" || status === "posting" || status === "post_error") && (
          <DialogFooter className="border-t border-border/60 px-5 py-3.5">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" onClick={post} disabled={status === "posting"} className="gap-1.5 bg-[#6B4EFF] hover:bg-[#5B3EEF]">
              {status === "posting" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post to Freshdesk
            </Button>
          </DialogFooter>
        )}

        {(status === "posted" || status === "empty" || status === "error") && (
          <DialogFooter className="border-t border-border/60 px-5 py-3.5">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
