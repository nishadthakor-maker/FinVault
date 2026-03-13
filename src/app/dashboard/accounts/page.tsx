import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { BottomNav } from '@/components/BottomNav'
import { SignOutButton } from '@/components/SignOutButton'
import { Building2, Plus, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'

// Error messages surfaced from the OAuth callback
const ERROR_MESSAGES: Record<string, string> = {
  auth_failed:           'Authorisation was cancelled or failed. Please try again.',
  invalid_state:         'Session mismatch — please try connecting again.',
  token_exchange_failed: 'Could not retrieve tokens from TrueLayer. Please try again.',
  db_error:              'Tokens were received but could not be saved. Please try again.',
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  const supabase = await createSupabaseServerClient()

  const { data: tokenRow } = await supabase
    .from('tokens')
    .select('provider, expires_at, updated_at')
    .eq('provider', 'truelayer')
    .maybeSingle()

  const isConnected = !!tokenRow

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>

      {/* Top nav */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 md:px-8"
        style={{ backgroundColor: '#0d1117', borderBottom: '1px solid #1e2a3a' }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold tracking-tight" style={{ color: '#00D4FF' }}>
            FinVault
          </Link>
          <span style={{ color: '#1e2a3a' }}>/</span>
          <span className="text-sm font-medium" style={{ color: '#8892a4' }}>Accounts</span>
        </div>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Error banner */}
        {error && ERROR_MESSAGES[error] && (
          <div
            className="mb-6 flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#FF448815', border: '1px solid #FF448840' }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" style={{ color: '#FF4488' }} />
            <p className="text-sm" style={{ color: '#FF4488' }}>{ERROR_MESSAGES[error]}</p>
          </div>
        )}

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold md:text-3xl">Connected Accounts</h1>
            <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
              Link your bank to sync balances and transactions.
            </p>
          </div>
          {isConnected && (
            <Link
              href="/api/truelayer/connect"
              className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a', color: '#00D4FF' }}
            >
              <Plus size={14} />
              Add bank
            </Link>
          )}
        </div>

        {isConnected ? (
          /* ── Connected state ── */
          <div
            className="rounded-2xl p-5 md:p-6"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            {/* Connection status row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#0d1117' }}
                >
                  <Building2 size={18} style={{ color: '#00D4FF' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">TrueLayer (Sandbox)</p>
                  <p className="text-xs" style={{ color: '#8892a4' }}>
                    Connected ·{' '}
                    {tokenRow.updated_at
                      ? `Last synced ${new Date(tokenRow.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : 'Just connected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={16} style={{ color: '#00FF94' }} />
                <span className="text-xs font-medium" style={{ color: '#00FF94' }}>Active</span>
              </div>
            </div>

            <div className="mt-5 pt-5" style={{ borderTop: '1px solid #1e2a3a' }}>
              <div className="flex items-center gap-2 mb-3">
                <RefreshCw size={14} style={{ color: '#8892a4' }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#8892a4' }}>
                  Accounts — sync coming in Phase 1
                </p>
              </div>
              {/* Placeholder skeleton rows */}
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-4 py-3 mb-2 last:mb-0"
                  style={{ backgroundColor: '#0d1117' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full animate-pulse" style={{ backgroundColor: '#1e2a3a' }} />
                    <div className="space-y-1.5">
                      <div className="h-3 w-28 rounded animate-pulse" style={{ backgroundColor: '#1e2a3a' }} />
                      <div className="h-2.5 w-16 rounded animate-pulse" style={{ backgroundColor: '#1e2a3a' }} />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded animate-pulse" style={{ backgroundColor: '#1e2a3a' }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Empty state ── */
          <div
            className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            <div
              className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: '#0d1117' }}
            >
              <Building2 size={28} style={{ color: '#00D4FF' }} />
            </div>
            <h2 className="mb-2 text-lg font-semibold">No bank connected yet</h2>
            <p className="mb-8 max-w-xs text-sm" style={{ color: '#8892a4' }}>
              Connect your bank account via TrueLayer to start syncing your balances and transactions.
            </p>
            <Link
              href="/api/truelayer/connect"
              className="rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#00D4FF', color: '#0d1117' }}
            >
              Connect your bank
            </Link>
            <p className="mt-4 text-xs" style={{ color: '#4a5568' }}>
              Secured with AES-256 encryption · Powered by TrueLayer
            </p>
          </div>
        )}

      </main>

      <BottomNav />
    </div>
  )
}
