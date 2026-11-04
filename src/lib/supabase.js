import { createClient } from '@supabase/supabase-js';

// Cloud sync is on only when both values are set (in .env locally, or in the
// hosting provider's environment variables). Without them the app stays local-only.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
