import { createBrowserClient } from '@supabase/ssr'

// Prefer Expo env vars when running in an Expo/React Native context,
// fall back to Next.js NEXT_PUBLIC_* variables for web builds.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishable = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    // prefer publishable key when available, otherwise fall back to anon
    (supabasePublishable ?? supabaseAnonKey)!,
  )

export default createClient
