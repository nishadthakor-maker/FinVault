import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { Lock, CreditCard, Landmark } from 'lucide-react'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return Number(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

const ACCOUNT_TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  credit: CreditCard,
  current: Landmark,
  savings: Landmark,
}

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, balance, type, is_active, currency')
    .order('type')
    .order('name')

  const activeAccounts = (accounts ?? []).filter(a => a.is_active)

  // Group by type
  const grouped: Record<string, typeof activeAccounts> = {}
  for (const acc of activeAccounts) {
    const t = acc.type ?? 'other'
    if (!grouped[t]) grouped[t] = []
    grouped[t].push(acc)
  }

  const typeLabels: Record<string, string> = {
    current: 'Current Accounts',
    savings: 'Savings',
    credit:  'Credit Cards',
    other:   'Other',
  }

  const typeOrder = ['current', 'savings', 'credit', 'other']

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Accounts</h1>
          <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
            Your linked accounts and balances.
          </p>
        </div>

        {/* Open Banking — Coming Soon card */}
        <section
          className="mb-8 rounded-2xl p-5 flex items-start gap-4"
          style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #1e1b3a 100%)', border: '1px solid rgba(167,139,250,0.2)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.2)' }}
          >
            <Lock size={18} style={{ color: '#A78BFA' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#A78BFA' }}>Open Banking — Coming Soon</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: '#8899aa' }}>
              Direct bank connections will be available soon. Import statements via the{' '}
              <a href="/dashboard/import" className="underline" style={{ color: '#00D4FF' }}>Import page</a>{' '}
              in the meantime.
            </p>
          </div>
        </section>

        {/* Account list */}
        {activeAccounts.length === 0 ? (
          <div
            className="rounded-2xl px-6 py-12 text-center"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-sm" style={{ color: '#4a5568' }}>No accounts found. Import a statement to add accounts.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {typeOrder.filter(t => grouped[t]?.length).map(type => {
              const accs = grouped[type]
              const Icon = ACCOUNT_TYPE_ICONS[type] ?? CreditCard
              const typeTotal = accs.reduce((s, a) => s + Number(a.balance ?? 0), 0)

              return (
                <section key={type}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>
                      {typeLabels[type] ?? type}
                    </h2>
                    <span className="text-xs font-semibold" style={{ color: type === 'credit' ? '#FF4488' : '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                      {gbp(typeTotal)}
                    </span>
                  </div>

                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                  >
                    {accs.map((acc, i) => {
                      const balance   = Number(acc.balance ?? 0)
                      const isCredit  = acc.type === 'credit'
                      const balColor  = isCredit
                        ? (balance < 0 ? '#FF4488' : '#00FF94')
                        : (balance >= 0 ? '#00D4FF' : '#FF4488')

                      return (
                        <div
                          key={acc.id}
                          className="flex items-center gap-3 px-4 py-4"
                          style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
                        >
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: '#0f1923' }}
                          >
                            <Icon size={16} style={{ color: '#8899aa' }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{acc.name}</p>
                            <p className="text-xs capitalize" style={{ color: '#4a5568' }}>
                              {acc.type ?? 'account'} · {acc.currency ?? 'GBP'}
                            </p>
                          </div>
                          <span
                            className="text-sm font-semibold shrink-0"
                            style={{ color: balColor, fontFamily: 'var(--font-dm-mono)' }}
                          >
                            {gbp(balance)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

      </main>
      <BottomNav />
    </div>
  )
}
