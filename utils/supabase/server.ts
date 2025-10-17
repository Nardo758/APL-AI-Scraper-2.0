import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

/**
 * Create a Supabase server client attached to a NextResponse so cookies set
 * by Supabase (session refresh) are propagated to the outgoing response.
 *
 * Returns an object { supabase, response } where `supabase` is the client
 * and `response` is a NextResponse instance you can return from your handler.
 */
export const createClientFromRequest = (request: NextRequest) => {
  // Create an initial response object that mirrors the incoming request
  let supabaseResponse = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          // Recreate response so cookie changes are captured
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as CookieOptions)
          )
        },
      },
    },
  )

  return { supabase, response: supabaseResponse }
}

export default createClientFromRequest

// Convenience helper for Next.js Server Components that call `cookies()`
// Usage: const supabase = createClient(cookieStore)
export const createClient = (cookieStore: ReturnType<typeof cookies>) => {
  // Prefer the publishable default key if provided (matches your snippet); fall back to anon key
  const keyToUse = supabasePublishableKey || supabaseKey

  return createServerClient(
    supabaseUrl!,
    keyToUse!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as CookieOptions))
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  )
}
