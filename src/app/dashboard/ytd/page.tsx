import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { getLast4PayPeriods, getCurrentPayPeriod, type PayPeriod } from '@/lib/payPeriod'
import { getFinancialSummary, type FinancialSummary } from '@/lib/financialSummary'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
}
function sign(n: number) { return n >= 0 ? '+' : '' }

type PeriodRow = {
  period:   PayPeriod
  summary:  FinancialSummary
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

function SurplusChart({ rows }: { rows: PeriodRow[] }) {
  if (rows.length < 2) return null

  const W = 500, H = 180
  const ml = 60, mr = 16, mt = 16, mb = 40
  const chartW = W - ml - mr
  const chartH = H - mt - mb

  const values = rows.map(r => r.summary.cashFlowView.cashRemaining)
  const maxAbs = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 100)
  const ceiling = Math.ceil(maxAbs / 500) * 500 || 500

  const x = (i: number) => ml + (i / (rows.length - 1)) * chartW
  const y = (v: number) => mt + chartH / 2 - (v / ceiling) * (chartH / 2)

  const zero = mt + chartH / 2

  const points = rows.map((r, i) => `${x(i)},${y(r.summary.cashFlowView.cashRemaining)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: '180px' }}
    >
      {/* Zero line */}
      <line x1={ml} y1={zero} x2={W - mr} y2={zero} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {/* Positive fill */}
      <defs>
        <linearGradient id="surplusGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00FF94" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#00FF94" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="deficitGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF4488" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#FF4488" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fills */}
      {rows.length >= 2 && (
        <>
          <polyline
            points={`${x(0)},${zero} ${points} ${x(rows.length - 1)},${zero}`}
            fill="url(#surplusGrad)"
            stroke="none"
          />
        </>
      )}

      {/* Line */}
      <polyline points={points} fill="none" stroke="#00D4FF" strokeWidth="2" strokeLinejoin="round" />

      {/* Dots */}
      {rows.map((r, i) => {
        const v = r.summary.cashFlowView.cashRemaining
        return (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r="4"
            fill={v >= 0 ? '#00FF94' : '#FF4488'}
            stroke="#1a2535"
            strokeWidth="2"
          />
        )
      })}

      {/* Labels */}
      {rows.map((r, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          fontSize="11"
          fill="#8892a4"
        >
          {r.period.label}
        </text>
      ))}

      {/* Y axis */}
      <text x={ml - 4} y={mt + 4}   textAnchor="end" fontSize="10" fill="#4a5568">+{gbp(ceiling)}</text>
      <text x={ml - 4} y={zero + 4} textAnchor="end" fontSize="10" fill="#4a5568">£0</text>
      <text x={ml - 4} y={mt + chartH + 4} textAnchor="end" fontSize="10" fill="#4a5568">{gbp(-ceiling)}</text>
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function YTDPage() {
  const supabase = await createSupabaseServerClient()

  // Get last 4 pay periods (or more for YTD — up to 12)
  // For now use 4 periods matching the trends page
  const periods = getLast4PayPeriods(4)

  // Fetch all period summaries in parallel
  const rows: PeriodRow[] = await Promise.all(
    periods.map(async period => ({
      period,
      summary: await getFinancialSummary(supabase, period.start, period.end),
    }))
  )

  const current = getCurrentPayPeriod()
  const isCurrentPeriod = (p: PayPeriod) => p.start === current.start

  // Totals
  const ytdSalary        = rows.reduce((s, r) => s + r.summary.income.total, 0)
  const ytdSpend         = rows.reduce((s, r) => s + r.summary.committedCosts.total + r.summary.spendingView.totalSpending, 0)
  const ytdSaved         = rows.reduce((s, r) => s + r.summary.savings.net, 0)
  const ytdCashLeft      = rows.reduce((s, r) => s + r.summary.cashFlowView.cashRemaining, 0)
  const ytdCommitted     = rows.reduce((s, r) => s + r.summary.committedCosts.total, 0)
  const ytdCCSpend       = rows.reduce((s, r) => s + (r.summary.spendingView.totalSpending - r.summary.spendingView.directFromNatwest.total), 0)
  const ytdDirectSpend   = rows.reduce((s, r) => s + r.summary.spendingView.directFromNatwest.total, 0)
  const ytdSpendSurplus  = rows.reduce((s, r) => s + r.summary.spendingView.spendingSurplus, 0)
  const ytdDebtChange    = rows.reduce((s, r) => s + r.summary.debtHealthIndicator.netDebtChange, 0)

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Year to Date</h1>
          <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
            Last {rows.length} pay periods · {periods[0].label} – {periods[periods.length - 1].label}
          </p>
        </div>

        {/* YTD summary cards */}
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[
            { label: 'Total Income',  value: ytdSalary,      color: '#00FF94' },
            { label: 'Total Spend',   value: ytdSpend,       color: '#FF4488' },
            { label: 'Total Saved',   value: ytdSaved,       color: '#A78BFA' },
            { label: 'Cash Left',     value: ytdCashLeft,    color: ytdCashLeft >= 0 ? '#00D4FF' : '#FF4488' },
          ].map(card => (
            <div
              key={card.label}
              className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(135deg, #1a2535 0%, #1e2d42 100%)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>
                {card.label}
              </p>
              <p
                className="text-lg font-semibold leading-none"
                style={{ color: card.color, fontFamily: 'var(--font-dm-mono)' }}
              >
                {gbp(card.value)}
              </p>
            </div>
          ))}
        </section>

        {/* Surplus/Deficit trend chart */}
        <section
          className="mb-6 rounded-2xl p-4 md:p-5"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#8899aa' }}>
            Surplus / Deficit Trend
          </h2>
          <SurplusChart rows={rows} />
        </section>

        {/* Per-period breakdown table */}
        <section
          className="mb-2 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="overflow-x-auto">
            <div style={{ minWidth: '640px' }}>

              {/* Table header */}
              <div
                className="grid grid-cols-7 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#4a5568', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span>Period</span>
                <span className="text-right">Salary</span>
                <span className="text-right">Committed</span>
                <span className="text-right">CC Spend</span>
                <span className="text-right">Direct</span>
                <span className="text-right">Surplus</span>
                <span className="text-right">Debt Δ</span>
              </div>

              {rows.map((row, i) => {
                const { period, summary: s } = row
                const isCurrent      = isCurrentPeriod(period)
                const surplus        = s.spendingView.spendingSurplus
                const debtChange     = s.debtHealthIndicator.netDebtChange
                const ccSpend        = s.spendingView.totalSpending - s.spendingView.directFromNatwest.total

                return (
                  <div
                    key={period.start}
                    className="grid grid-cols-7 px-4 py-3.5 items-center"
                    style={{
                      borderTop:       i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                      backgroundColor: isCurrent ? 'rgba(0,212,255,0.04)' : 'transparent',
                    }}
                  >
                    {/* Period */}
                    <div>
                      <p className="text-sm font-semibold" style={{ color: isCurrent ? '#00D4FF' : '#f0f4f8' }}>
                        {period.label}
                        {isCurrent && <span className="ml-1 text-xs" style={{ color: '#4a5568' }}>●</span>}
                      </p>
                      <p className="text-xs" style={{ color: '#4a5568' }}>
                        {new Date(period.start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' – '}
                        {new Date(period.end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>

                    {/* Salary */}
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                        {gbp(s.income.total)}
                      </p>
                      {s.income.isBonus && (
                        <p className="text-xs" style={{ color: '#4a5568' }}>🎉 bonus</p>
                      )}
                    </div>

                    {/* Committed */}
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                        {gbp(s.committedCosts.total)}
                      </p>
                    </div>

                    {/* CC Spend */}
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                        {gbp(ccSpend)}
                      </p>
                    </div>

                    {/* Direct Spend */}
                    <div className="text-right">
                      <p className="text-sm font-semibold" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                        {gbp(s.spendingView.directFromNatwest.total)}
                      </p>
                    </div>

                    {/* Spending Surplus */}
                    <div className="text-right">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: surplus >= 0 ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
                      >
                        {sign(surplus)}{gbp(surplus)}
                      </p>
                    </div>

                    {/* CC Debt Change */}
                    <div className="text-right">
                      <p
                        className="text-sm font-semibold"
                        style={{
                          color: debtChange > 50 ? '#00FF94' : debtChange < -50 ? '#FF4488' : '#8899aa',
                          fontFamily: 'var(--font-dm-mono)',
                        }}
                      >
                        {debtChange > 50 ? '↓ ' : debtChange < -50 ? '↑ ' : ''}{sign(debtChange)}{gbp(debtChange)}
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* Totals row */}
              <div
                className="grid grid-cols-7 px-4 py-3.5 items-center text-sm font-bold"
                style={{ borderTop: '2px solid rgba(255,255,255,0.1)' }}
              >
                <span style={{ color: '#8899aa' }}>Total</span>
                <span className="text-right" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(ytdSalary)}
                </span>
                <span className="text-right" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(ytdCommitted)}
                </span>
                <span className="text-right" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(ytdCCSpend)}
                </span>
                <span className="text-right" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(ytdDirectSpend)}
                </span>
                <span
                  className="text-right"
                  style={{ color: ytdSpendSurplus >= 0 ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
                >
                  {sign(ytdSpendSurplus)}{gbp(ytdSpendSurplus)}
                </span>
                <span
                  className="text-right"
                  style={{ color: ytdDebtChange > 50 ? '#00FF94' : ytdDebtChange < -50 ? '#FF4488' : '#8899aa', fontFamily: 'var(--font-dm-mono)' }}
                >
                  {sign(ytdDebtChange)}{gbp(ytdDebtChange)}
                </span>
              </div>

            </div>
          </div>
        </section>

        {/* Table legend */}
        <p className="mb-6 px-1 text-xs" style={{ color: '#4a5568' }}>
          <span style={{ color: '#8899aa' }}>Spending Surplus</span> = income minus actual goods/services consumed.{' '}
          <span style={{ color: '#8899aa' }}>CC Debt Δ</span> = repayments minus CC spending this period (↓ green = paying down, ↑ red = accumulating).
        </p>

      </main>
      <BottomNav />
    </div>
  )
}
