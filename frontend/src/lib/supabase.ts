import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://swgtmvsscaervhahzfjh.supabase.co";

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3Z3RtdnNzY2FlcnZoYWh6ZmpoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA1Nzk0OCwiZXhwIjoyMTA0NjMzOTQ4fQ.4IeujwGZiMLvnrVw9oMWMJmbWEuAwfL3PPSPbMFMYPw";

const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3Z3RtdnNzY2FlcnZoYWh6ZmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNTc5NDgsImV4cCI6MjEwNDYzMzk0OH0.H5lyJQaN0VZqWZB_rSKJAowaPunGPuA96bOXJNzhmOc";

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const supabaseAnon = createClient(supabaseUrl, anonKey);

export function toInternalEmail(username: string): string {
  const sanitized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${sanitized}@internal.tradeflow.local`;
}
