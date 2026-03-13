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

  const values = rows.map(r => r.summary.netPosition.surplusDeficit)
  const maxAbs = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 100)
  const ceiling = Math.ceil(maxAbs / 500) * 500 || 500

  const x = (i: number) => ml + (i / (rows.length - 1)) * chartW
  const y = (v: number) => mt + chartH / 2 - (v / ceiling) * (chartH / 2)

  const zero = mt + chartH / 2

  const points = rows.map((r, i) => `${x(i)},${y(r.summary.netPosition.surplusDeficit)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: '180px' }}
    >
      {/* Zero line */}
      <line x1={ml} y1={zero} x2={W - mr} y2={zero} stroke="#1e2a3a" strokeWidth="1" />

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
        const v = r.summary.netPosition.surplusDeficit
        return (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r="4"
            fill={v >= 0 ? '#00FF94' : '#FF4488'}
            stroke="#131929"
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
  const ytdSalary  = rows.reduce((s, r) => s + r.summary.income.salary, 0)
  const ytdSpend   = rows.reduce((s, r) => s + r.summary.realExpenses.total, 0)
  const ytdSaved   = rows.reduce((s, r) => s + r.summary.savingsMovements.net, 0)
  const ytdSurplus = rows.reduce((s, r) => s + r.summary.netPosition.surplusDeficit, 0)

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Year to Date</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            Last {rows.length} pay periods · {periods[0].label} – {periods[periods.length - 1].label}
          </p>
        </div>

        {/* YTD summary cards */}
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[
            { label: 'Total Income',  value: ytdSalary,  color: '#00FF94' },
            { label: 'Total Spend',   value: ytdSpend,   color: '#FF4488' },
            { label: 'Total Saved',   value: ytdSaved,   color: '#A78BFA' },
            { label: 'Net Surplus',   value: ytdSurplus, color: ytdSurplus >= 0 ? '#00D4FF' : '#FF4488' },
          ].map(card => (
            <div
              key={card.label}
              className="rounded-2xl p-4"
              style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: '#8892a4' }}>
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
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#8892a4' }}>
            Surplus / Deficit Trend
          </h2>
          <SurplusChart rows={rows} />
        </section>

        {/* Per-period breakdown table */}
        <section
          className="mb-6 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-5 px-4 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#4a5568', borderBottom: '1px solid #1e2a3a' }}
          >
            <span>Period</span>
            <span className="text-right">Salary</span>
            <span className="text-right">Real Spend</span>
            <span className="text-right">Saved</span>
            <span className="text-right">Surplus</span>
          </div>

          {rows.map((row, i) => {
            const { period, summary: s } = row
            const isCurrent = isCurrentPeriod(period)
            const surplus   = s.netPosition.surplusDeficit

            return (
              <div
                key={period.start}
                className="grid grid-cols-5 px-4 py-3.5 items-center"
                style={{
                  borderTop:       i === 0 ? 'none' : '1px solid #1e2a3a',
                  backgroundColor: isCurrent ? '#0d1117' : 'transparent',
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
                    {gbp(s.income.salary)}
                  </p>
                  {s.income.isBonus && (
                    <p className="text-xs" style={{ color: '#4a5568' }}>🎉 bonus</p>
                  )}
                </div>

                {/* Real Spend */}
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
                    {gbp(s.realExpenses.total)}
                  </p>
                  {s.income.salary > 0 && (
                    <p className="text-xs" style={{ color: '#4a5568' }}>
                      {Math.round((s.realExpenses.total / s.income.salary) * 100)}%
                    </p>
                  )}
                </div>

                {/* Saved */}
                <div className="text-right">
                  <p className="text-sm font-semibold" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                    {gbp(s.savingsMovements.net)}
                  </p>
                  {s.income.salary > 0 && (
                    <p className="text-xs" style={{ color: '#4a5568' }}>
                      {Math.round(s.netPosition.savingsRate * 100)}%
                    </p>
                  )}
                </div>

                {/* Surplus */}
                <div className="text-right">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: surplus >= 0 ? '#00D4FF' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
                  >
                    {sign(surplus)}{gbp(surplus)}
                  </p>
                </div>
              </div>
            )
          })}

          {/* Totals row */}
          <div
            className="grid grid-cols-5 px-4 py-3.5 items-center text-sm font-bold"
            style={{ borderTop: '2px solid #1e2a3a' }}
          >
            <span style={{ color: '#8892a4' }}>Total</span>
            <span className="text-right" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
              {gbp(ytdSalary)}
            </span>
            <span className="text-right" style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
              {gbp(ytdSpend)}
            </span>
            <span className="text-right" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
              {gbp(ytdSaved)}
            </span>
            <span
              className="text-right"
              style={{ color: ytdSurplus >= 0 ? '#00D4FF' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
            >
              {sign(ytdSurplus)}{gbp(ytdSurplus)}
            </span>
          </div>
        </section>

        {/* Per-period spend breakdown */}
        <section
          className="mb-6 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8892a4' }}>
              Spend Breakdown
            </h2>
          </div>

          {/* Header */}
          <div
            className="grid grid-cols-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#4a5568', borderBottom: '1px solid #1e2a3a', borderTop: '1px solid #1e2a3a' }}
          >
            <span>Period</span>
            <span className="text-right">Fixed</span>
            <span className="text-right">Discretionary</span>
            <span className="text-right">CC Spend</span>
          </div>

          {rows.map((row, i) => {
            const { period, summary: s } = row
            const fixedTotal  = s.rent.total + s.carFinance.total + s.fixedBills.total
            const directTotal = s.directDiscretionary.total
            const ccTotal     = s.creditCardSpending.grandTotal

            return (
              <div
                key={period.start}
                className="grid grid-cols-4 px-4 py-3 items-center"
                style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
              >
                <span className="text-sm font-medium">{period.label}</span>
                <span className="text-right text-sm" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(fixedTotal)}
                </span>
                <span className="text-right text-sm" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(directTotal)}
                </span>
                <span className="text-right text-sm" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                  {gbp(ccTotal)}
                </span>
              </div>
            )
          })}
        </section>

      </main>
      <BottomNav />
    </div>
  )
}
