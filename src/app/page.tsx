import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { getCurrentPayPeriod } from '@/lib/payPeriod'
import { getFinancialSummary } from '@/lib/financialSummary'
import { SurplusBreakdown } from '@/components/SurplusBreakdown'
import { DashboardWaterfall, type WaterfallTx } from '@/components/DashboardWaterfall'
import { FinancialSnapshot } from '@/components/FinancialSnapshot'

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase   = await createSupabaseServerClient()
  const period     = getCurrentPayPeriod()

  // Resolve account IDs for the waterfall drilldown
  const { data: accts } = await supabase.from('accounts').select('id, name')
  const nwMainId  = accts?.find(a => a.name === 'NatWest Main')?.id
  const barcId    = accts?.find(a => a.name === 'Barclaycard Rewards')?.id
  const hsbcIds   = (accts ?? []).filter(a => a.name.includes('HSBC') && a.name.includes('Credit')).map(a => a.id)
  const tescoIds  = (accts ?? []).filter(a => a.name.includes('Tesco') && a.name.includes('Credit')).map(a => a.id)

  async function fetchPeriodTxns(ids: (string | undefined)[]): Promise<WaterfallTx[]> {
    const valid = ids.filter((id): id is string => !!id)
    if (!valid.length) return []
    const { data } = await supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, category, tag, transfer_flag')
      .in('account_id', valid)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date', { ascending: false })
    return (data ?? []).map(t => ({
      id:            t.id as string,
      date:          t.date as string,
      merchant:      (t.merchant_name || t.description) as string,
      amount:        Number(t.amount),
      category:      t.category as string | null,
      tag:           t.tag as string | null,
      transfer_flag: t.transfer_flag as boolean,
    }))
  }

  const [summary, recentRes, nwPeriodTxns, ccPeriodTxns, savingsAcctsRes] = await Promise.all([
    getFinancialSummary(supabase, period.start, period.end),
    supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, account_id')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    fetchPeriodTxns([nwMainId]),
    fetchPeriodTxns([barcId, ...hsbcIds, ...tescoIds]),
    supabase.from('accounts').select('balance').eq('type', 'savings').eq('is_active', true),
  ])

  const savingsBalance = (savingsAcctsRes.data ?? []).reduce((s, a) => s + Number(a.balance), 0)

  const { income, committedCosts, spendingView, cashFlowView, debtHealthIndicator, savings } = summary

  const cashRemaining     = cashFlowView.cashRemaining
  const accountingSurplus = spendingView.spendingSurplus
  const realSpendTotal    = committedCosts.total + spendingView.totalSpending

  // ── Summary cards ─────────────────────────────────────────────────────────
  const cards = [
    {
      label: income.isBonus ? 'Salary 🎉 Bonus' : 'Salary',
      value: gbp(income.total),
      sub:   income.isBonus
        ? `Normal ~${gbp0(income.normalSalary)} · Bonus +${gbp0(income.bonusAmount)}`
        : 'Normal £3,494',
      color: '#00FF94',
    },
    {
      label: 'Spending Surplus',
      value: (accountingSurplus < 0 ? '-' : '+') + gbp(accountingSurplus),
      sub:   `${income.total > 0 ? Math.round((realSpendTotal / income.total) * 100) : 0}% of salary on goods/services`,
      color: accountingSurplus >= 0 ? '#00D4FF' : '#FF4488',
    },
    {
      label: 'Debt Health',
      value: debtHealthIndicator.trend === 'paying_down'
        ? `Paying down £${Math.round(debtHealthIndicator.trendAmount)}`
        : debtHealthIndicator.trend === 'accumulating'
        ? `Accumulating £${Math.round(debtHealthIndicator.trendAmount)}`
        : 'Neutral',
      sub:   `CC spend ${gbp0(debtHealthIndicator.ccSpendingThisPeriod)} · repaid ${gbp0(debtHealthIndicator.ccRepaymentsThisPeriod)}`,
      color: debtHealthIndicator.trend === 'paying_down' ? '#00FF94'
           : debtHealthIndicator.trend === 'accumulating' ? '#FF4488'
           : '#8899aa',
    },
    {
      label: cashRemaining >= 0 ? 'Cash Remaining' : 'Cash Deficit',
      value: (cashRemaining < 0 ? '-' : '') + gbp(cashRemaining),
      sub:   'After all NatWest outflows',
      color: cashRemaining >= 0 ? '#00D4FF' : '#FF4488',
    },
  ]

  const recent = recentRes.data ?? []
  const hour   = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Financial Snapshot */}
        <FinancialSnapshot summary={summary} savingsBalance={savingsBalance} />

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

        {/* Surplus breakdown (collapsible) */}
        <section className="mb-8 -mt-4">
          <SurplusBreakdown
            salary={income.salary}
            fixedTotal={committedCosts.total}
            ccRepayments={cashFlowView.ccRepayments.total}
            savingsNet={savings.net}
            monzoTransferNet={cashFlowView.cashMovements.monzoTransfer}
            familyTransferNet={cashFlowView.cashMovements.familyTransfers}
            directSpend={spendingView.directFromNatwest.total}
            cashRemaining={cashRemaining}
            ccCardSpend={debtHealthIndicator.ccSpendingThisPeriod}
            accountingSurplus={accountingSurplus}
          />
        </section>

        {/* Money flow waterfall */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold md:text-lg">Money Flow</h2>
            <span className="text-xs" style={{ color: '#8899aa' }}>
              {period.start.slice(5).replace('-', '/')} – {period.end.slice(5).replace('-', '/')}
            </span>
          </div>
          <DashboardWaterfall
            summary={summary}
            nwTxns={nwPeriodTxns}
            ccTxns={ccPeriodTxns}
            periodStr={`${period.start.slice(5).replace('-', '/')} – ${period.end.slice(5).replace('-', '/')}`}
          />
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
