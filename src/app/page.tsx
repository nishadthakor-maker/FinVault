import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { getCurrentPayPeriod, getNextPayday } from '@/lib/payPeriod'
import { getFinancialSummary } from '@/lib/financialSummary'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function gbp0(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
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
  if (c.includes('rewards'))       return '🎁'
  return type === 'credit' ? '💰' : '💸'
}

// ─── Waterfall row ─────────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  amount,
  color,
  pct,
  indent = false,
}: {
  label:  string
  amount: number
  color:  string
  pct:    number
  indent?: boolean
}) {
  return (
    <div className={`flex items-center gap-3 py-2 ${indent ? 'pl-4' : ''}`}>
      <div className="w-28 shrink-0">
        <p className="text-xs" style={{ color: '#8899aa' }}>{label}</p>
      </div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-20 text-right text-sm font-semibold shrink-0"
        style={{ color, fontFamily: 'var(--font-dm-mono)' }}
      >
        -{gbp0(amount)}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase   = await createSupabaseServerClient()
  const period     = getCurrentPayPeriod()
  const nextPayday = getNextPayday()

  const [summary, recentRes] = await Promise.all([
    getFinancialSummary(supabase, period.start, period.end),
    supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, account_id')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // ── Days to payday ─────────────────────────────────────────────────────────
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const daysToPayday = Math.max(0, Math.ceil((nextPayday.getTime() - now.getTime()) / 86400000))

  const { income, realExpenses, savingsMovements, netPosition } = summary

  // ── Summary cards ─────────────────────────────────────────────────────────
  const cards = [
    {
      label: income.isBonus ? 'Salary 🎉 Bonus' : 'Salary',
      value: gbp(income.salary),
      sub:   income.isBonus
        ? `Normal ~${gbp0(income.normalSalary)} · Bonus +${gbp0(income.bonusAmount)}`
        : `Pay period ends ${nextPayday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      color: '#00FF94',
    },
    {
      label: 'Real Spend',
      value: gbp(realExpenses.total),
      sub:   `${income.salary > 0 ? Math.round((realExpenses.total / income.salary) * 100) : 0}% of salary`,
      color: realExpenses.total <= income.salary ? '#FF4488' : '#FF2222',
    },
    {
      label: 'Net Saved',
      value: gbp(savingsMovements.net),
      sub:   `${income.salary > 0 ? Math.round(netPosition.savingsRate * 100) : 0}% savings rate`,
      color: '#A78BFA',
    },
    {
      label: netPosition.surplusDeficit >= 0 ? 'Surplus' : 'Deficit',
      value: (netPosition.surplusDeficit < 0 ? '-' : '') + gbp(netPosition.surplusDeficit),
      sub:   `${daysToPayday} days to payday`,
      color: netPosition.surplusDeficit >= 0 ? '#00D4FF' : '#FF4488',
    },
  ]

  // ── Waterfall bars ─────────────────────────────────────────────────────────
  const baseForPct = income.salary || 1
  const waterfall = [
    { label: 'Rent',          amount: summary.rent.total,                     color: '#A78BFA' },
    { label: 'Car Finance',   amount: summary.carFinance.total,               color: '#A78BFA' },
    { label: 'Bills',         amount: summary.fixedBills.total,               color: '#A78BFA' },
    { label: 'Discretionary', amount: summary.directDiscretionary.total,      color: '#00D4FF' },
    { label: 'CC Spend',      amount: summary.creditCardSpending.grandTotal,  color: '#00D4FF' },
    { label: 'Saved',         amount: summary.savingsMovements.net,           color: '#FF4488' },
    { label: 'CC Repayments', amount: summary.creditCardRepayments.total,     color: '#4a5568' },
  ].filter(row => row.amount > 0)

  const recent = recentRes.data ?? []
  const hour   = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Welcome */}
        <section className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">{greeting}, Nishad</h1>
          <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </section>

        {/* Summary cards */}
        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {cards.map(card => (
            <div
              key={card.label}
              className="rounded-2xl p-4 md:p-5"
              style={{ background: 'linear-gradient(135deg, #1a2535 0%, #1e2d42 100%)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>
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

        {/* Money flow waterfall */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold md:text-lg">Money Flow</h2>
            <span className="text-xs" style={{ color: '#8899aa' }}>
              {period.start.slice(5).replace('-', '/')} – {period.end.slice(5).replace('-', '/')}
            </span>
          </div>

          <div
            className="rounded-2xl p-4 md:p-5"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            {/* Income bar */}
            <div className="flex items-center gap-3 pb-3 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-28 shrink-0">
                <p className="text-xs font-medium" style={{ color: '#00FF94' }}>Salary In</p>
              </div>
              <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#00FF9430' }}>
                <div className="h-full rounded-full w-full" style={{ backgroundColor: '#00FF94' }} />
              </div>
              <span
                className="w-20 text-right text-sm font-semibold shrink-0"
                style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}
              >
                +{gbp0(income.salary)}
              </span>
            </div>

            {/* Outflows */}
            {waterfall.map(row => (
              <WaterfallRow
                key={row.label}
                label={row.label}
                amount={row.amount}
                color={row.color}
                pct={(row.amount / baseForPct) * 100}
              />
            ))}

            {/* Remaining */}
            <div className="flex items-center gap-3 pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-28 shrink-0">
                <p className="text-xs font-medium" style={{ color: summary.cashFlow.remaining >= 0 ? '#00D4FF' : '#FF4488' }}>
                  Remaining
                </p>
              </div>
              <div className="flex-1" />
              <span
                className="w-20 text-right text-sm font-bold shrink-0"
                style={{
                  color: summary.cashFlow.remaining >= 0 ? '#00D4FF' : '#FF4488',
                  fontFamily: 'var(--font-dm-mono)',
                }}
              >
                {summary.cashFlow.remaining >= 0 ? '+' : '-'}{gbp0(summary.cashFlow.remaining)}
              </span>
            </div>
          </div>
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
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            {recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#4a5568' }}>
                No transactions yet — <Link href="/dashboard/import" style={{ color: '#00D4FF' }}>import a statement</Link>
              </p>
            ) : recent.map((tx, i) => {
              const isCredit = Number(tx.amount) >= 0
              const amt      = Number(tx.amount)
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base"
                    style={{ backgroundColor: '#0f1923' }}
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
                      : <ArrowUpRight  size={14} style={{ color: '#8899aa' }} />
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
