declare module '@supabase/ssr' {
  // Minimal declarations to allow builds/tests without installing @supabase/ssr
  export type SupabaseClient = any;

  export function createBrowserClient(supabaseUrl: string, supabaseKey: string): SupabaseClient;

  export function createServerClient(supabaseUrl: string, supabaseKey: string): SupabaseClient;

  // Commonly used helpers may be added here if needed later
}

declare module '@supabase/supabase-js' {
  export type SupabaseClient = any;
  export function createClient(url: string, key: string): SupabaseClient;
}
