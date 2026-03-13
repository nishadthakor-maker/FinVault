import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TRUELAYER_CLIENT_ID!,
    scope: 'accounts balance transactions offline_access',
    redirect_uri: process.env.TRUELAYER_REDIRECT_URI!,
    providers: 'uk-cs-mock',
    state,
  })

  const authUrl = `https://auth.truelayer-sandbox.com/?${params.toString()}`

  const response = NextResponse.redirect(authUrl)

  response.cookies.set('tl_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
