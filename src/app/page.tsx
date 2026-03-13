import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { getCurrentPayPeriod, getNextPayday } from '@/lib/payPeriod'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function formatTxDate(dateStr: string): string {
  const txDate = new Date(dateStr + 'T00:00:00')
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - txDate.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return txDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function txIcon(category: string | null, type: string): string {
  const c = (category ?? '').toLowerCase()
  if (c.includes('salary'))        return '💼'
  if (c.includes('business'))      return '📈'
  if (c.includes('groceries'))     return '🛒'
  if (c.includes('fuel'))          return '⛽'
  if (c.includes('parking'))       return '🅿️'
  if (c.includes('entertainment')) return '🎵'
  if (c.includes('dining'))        return '🍽️'
  if (c.includes('personal care')) return '💇'
  if (c.includes('transport'))     return '🚂'
  if (c.includes('energy'))        return '⚡'
  if (c.includes('broadband'))     return '📡'
  if (c.includes('mobile'))        return '📱'
  if (c.includes('insurance'))     return '🛡️'
  if (c.includes('rent'))          return '🏠'
  if (c.includes('council'))       return '🏛️'
  if (c.includes('car finance'))   return '🚗'
  if (c.includes('transfer'))      return '↔️'
  if (c.includes('family'))        return '👨‍👩‍👧'
  return type === 'credit' ? '💰' : '💸'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const period      = getCurrentPayPeriod()
  const nextPayday  = getNextPayday()

  // ── Fetch in parallel ──────────────────────────────────────────────────────
  const [accountsRes, periodRes, recentRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('type, balance')
      .eq('is_active', true),

    supabase
      .from('transactions')
      .select('amount, tag, type, transfer_flag')
      .gte('date', period.start)
      .lte('date', period.end),

    supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, account_id')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // ── Net Worth ──────────────────────────────────────────────────────────────
  const accounts = accountsRes.data ?? []
  const checkingTotal = accounts
    .filter(a => a.type !== 'credit')
    .reduce((s, a) => s + Number(a.balance), 0)
  const creditTotal = accounts
    .filter(a => a.type === 'credit')
    .reduce((s, a) => s + Number(a.balance), 0)
  const netWorth = checkingTotal - creditTotal

  // ── Pay period totals ──────────────────────────────────────────────────────
  const periodTxs = periodRes.data ?? []
  const totalIncome = periodTxs
    .filter(t => t.tag === 'Income')
    .reduce((s, t) => s + Number(t.amount), 0)
  const fixedCosts = periodTxs
    .filter(t => t.tag === 'Fixed')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const discretionary = periodTxs
    .filter(t => t.tag === 'Discretionary')
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

  const monthlySpent  = fixedCosts + discretionary
  const safeToSpend   = totalIncome - fixedCosts - discretionary

  // ── Days to payday ─────────────────────────────────────────────────────────
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const daysToPayday = Math.max(0, Math.ceil((nextPayday.getTime() - now.getTime()) / 86400000))

  // ── Summary cards ─────────────────────────────────────────────────────────
  const cards = [
    {
      label: 'Net Worth',
      value: (netWorth < 0 ? '-' : '') + gbp(netWorth),
      sub: `${gbp(checkingTotal)} assets · ${gbp(creditTotal)} owed`,
      color: netWorth >= 0 ? '#00FF94' : '#FF4488',
    },
    {
      label: 'Safe to Spend',
      value: (safeToSpend < 0 ? '-' : '') + gbp(safeToSpend),
      sub: `Payday ${nextPayday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      color: safeToSpend >= 0 ? '#00D4FF' : '#FF4488',
    },
    {
      label: 'Monthly Spent',
      value: gbp(monthlySpent),
      sub: `Of ${gbp(totalIncome)} income this period`,
      color: '#FF4488',
    },
    {
      label: 'Days to Payday',
      value: String(daysToPayday),
      sub: nextPayday.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      color: '#A78BFA',
    },
  ]

  const recent = recentRes.data ?? []
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Welcome */}
        <section className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">{greeting}, Nishad</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </section>

        {/* Summary cards */}
        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {cards.map(card => (
            <div
              key={card.label}
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: '#8892a4' }}>
                {card.label}
              </p>
              <p
                className="text-xl font-semibold leading-none md:text-2xl"
                style={{ color: card.color, fontFamily: 'var(--font-dm-mono)' }}
              >
                {card.value}
              </p>
              <p className="mt-2 text-xs" style={{ color: '#4a5568' }}>{card.sub}</p>
            </div>
          ))}
        </section>

        {/* Recent transactions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold md:text-lg">Recent Transactions</h2>
            <Link href="/dashboard/pl" className="text-xs font-medium" style={{ color: '#00D4FF' }}>
              View P&amp;L →
            </Link>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#4a5568' }}>
                No transactions yet — <Link href="/dashboard/import" style={{ color: '#00D4FF' }}>import a statement</Link>
              </p>
            ) : recent.map((tx, i) => {
              const isCredit = Number(tx.amount) >= 0
              const amt = Number(tx.amount)
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: '#0d1117' }}
                  >
                    {txIcon(tx.category, tx.type)}
                  </div>

                  {/* Merchant + category */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tx.merchant_name || tx.description}</p>
                    <p className="text-xs" style={{ color: '#4a5568' }}>
                      {tx.category ?? tx.tag ?? tx.type}
                    </p>
                  </div>

                  {/* Amount + date */}
                  <div className="text-right">
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color: isCredit ? '#00FF94' : '#f0f4f8',
                        fontFamily: 'var(--font-dm-mono)',
                      }}
                    >
                      {isCredit ? '+' : ''}
                      {amt.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                    </p>
                    <p className="text-xs" style={{ color: '#4a5568' }}>{formatTxDate(tx.date)}</p>
                  </div>

                  {/* Direction icon */}
                  <div className="ml-1 shrink-0">
                    {isCredit
                      ? <ArrowDownLeft size={14} style={{ color: '#00FF94' }} />
                      : <ArrowUpRight  size={14} style={{ color: '#8892a4' }} />
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  )
}
