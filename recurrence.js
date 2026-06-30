/**
 * Recurrence expansion — re-exports from the canonical shared module.
 *
 * Single source of truth: supabase/functions/_shared/recurrence-core.js
 * That module is also imported by the send-push-notifications Edge Function,
 * guaranteeing frontend and backend always use identical recurrence logic.
 */
export { expandEvents, expandEvent } from "./supabase/functions/_shared/recurrence-core.js";
