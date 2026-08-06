// ============================================================================
// Per-customer configuration.
//
// This codebase is deployed once per customer (NSE, Meta, Danone, Unilever, …).
// Each deployment points at that customer's own Supabase project and sets the
// company name below via env, so all user-facing copy reads correctly. The
// matching data scope lives in the sync-freshdesk Edge Function's
// FRESHDESK_COMPANY_NAME secret (must equal the cf_company value in Freshdesk).
//
//   VITE_COMPANY_NAME       short label shown in the UI (e.g. "Meta"); default "NSE"
//   VITE_COMPANY_FULL_NAME  full legal name for the login subtitle (optional)
// ============================================================================

export const COMPANY_NAME =
  ((import.meta.env.VITE_COMPANY_NAME as string | undefined) ?? "").trim() || "NSE";

export const COMPANY_FULL_NAME =
  ((import.meta.env.VITE_COMPANY_FULL_NAME as string | undefined) ?? "").trim() || COMPANY_NAME;
