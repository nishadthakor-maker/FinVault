import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { encrypt } from '@/lib/encrypt'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const errorParam = searchParams.get('error')

  const accountsUrl = new URL('/dashboard/accounts', request.url)

  if (errorParam || !code) {
    accountsUrl.searchParams.set('error', errorParam ?? 'auth_failed')
    return NextResponse.redirect(accountsUrl)
  }

  // Verify CSRF state
  const cookieStore = await cookies()
  const storedState = cookieStore.get('tl_state')?.value

  if (!storedState || storedState !== state) {
    accountsUrl.searchParams.set('error', 'invalid_state')
    return NextResponse.redirect(accountsUrl)
  }

  // Exchange authorisation code for tokens
  const tokenRes = await fetch('https://auth.truelayer-sandbox.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      redirect_uri: process.env.TRUELAYER_REDIRECT_URI!,
      code,
    }),
  })

  if (!tokenRes.ok) {
    accountsUrl.searchParams.set('error', 'token_exchange_failed')
    return NextResponse.redirect(accountsUrl)
  }

  const { access_token, refresh_token, expires_in } = await tokenRes.json()

  // Build response early so we can attach Set-Cookie headers
  const response = NextResponse.redirect(accountsUrl)

  // Create Supabase client that can read the session from the request cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Encrypt tokens before storage
  const encryptedAccess = encrypt(access_token)
  const encryptedRefresh = refresh_token ? encrypt(refresh_token) : null
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  const { error: dbError } = await supabase.from('tokens').upsert(
    {
      user_id: user.id,
      provider: 'truelayer',
      access_token: encryptedAccess,
      refresh_token: encryptedRefresh,
      expires_at: expiresAt,
    },
    { onConflict: 'user_id,provider' }
  )

  if (dbError) {
    accountsUrl.searchParams.set('error', 'db_error')
    return NextResponse.redirect(accountsUrl)
  }

  // Clear the CSRF state cookie
  response.cookies.delete('tl_state')

  return response
}
