import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import Anthropic from '@anthropic-ai/sdk'
import { getLast4PayPeriods, type PayPeriod } from '@/lib/payPeriod'

export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gbp(n: number) {
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
}

function niceMax(val: number): number {
  const step = val < 1000 ? 100 : val < 5000 ? 500 : val < 10000 ? 1000 : 2000
  return Math.ceil(val / step) * step || step
}

function fmtTick(val: number): string {
  if (val === 0) return '£0'
  if (val >= 1000) return `£${val / 1000 % 1 === 0 ? val / 1000 : (val / 1000).toFixed(1)}k`
  return `£${val}`
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

type PeriodSummary = { period: PayPeriod; income: number; fixed: number; discretionary: number }

function MonthlyChart({ data }: { data: PeriodSummary[] }) {
  const W = 500, H = 260
  const ml = 54, mr = 8, mt = 16, mb = 52
  const chartW = W - ml - mr
  const chartH = H - mt - mb

  const maxVal  = Math.max(...data.flatMap(d => [d.income, d.fixed, d.discretionary]), 500)
  const ceiling = niceMax(maxVal)
  const ticks   = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(ceiling * f))

  const groupW     = chartW / data.length
  const barW       = Math.min(22, (groupW - 24) / 3)
  const gap        = 3
  const groupInner = 3 * barW + 2 * gap
  const groupOff   = (groupW - groupInner) / 2

  const bx = (gi: number, bi: number) => ml + gi * groupW + groupOff + bi * (barW + gap)
  const bh = (v: number) => (v / ceiling) * chartH
  const by = (v: number) => mt + chartH - bh(v)

  const BARS = [
    { key: 'income'        as const, color: '#00FF94' },
    { key: 'fixed'         as const, color: '#A78BFA' },
    { key: 'discretionary' as const, color: '#00D4FF' },
  ]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {ticks.map(tick => {
        const y = mt + chartH - (tick / ceiling) * chartH
        return (
          <g key={tick}>
            <line x1={ml} y1={y} x2={W - mr} y2={y} stroke="#1e2a3a" strokeWidth={1} />
            <text x={ml - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#4a5568">
              {fmtTick(tick)}
            </text>
          </g>
        )
      })}

      {data.map((d, gi) => (
        <g key={d.period.start}>
          {BARS.map(({ key, color }, bi) => {
            const h = bh(d[key])
            if (h < 1) return null
            return <rect key={key} x={bx(gi, bi)} y={by(d[key])} width={barW} height={h} fill={color} rx={2} opacity={0.9} />
          })}
          <text x={ml + gi * groupW + groupW / 2} y={mt + chartH + 14} textAnchor="middle" fontSize={10} fill="#8892a4">
            {d.period.label}
          </text>
        </g>
      ))}

      {[
        { label: 'Income',        color: '#00FF94' },
        { label: 'Fixed',         color: '#A78BFA' },
        { label: 'Discretionary', color: '#00D4FF' },
      ].map(({ label, color }, i) => (
        <g key={label} transform={`translate(${ml + i * 140}, ${H - 10})`}>
          <rect width={8} height={8} fill={color} rx={1} y={-8} />
          <text x={12} y={0} fontSize={9} fill="#8892a4">{label}</text>
        </g>
      ))}
    </svg>
  )
}

// ─── Category Trends ──────────────────────────────────────────────────────────

type CatRow = { category: string; prev: number; curr: number }

function CategoryTrends({ rows, prevLabel, currLabel }: { rows: CatRow[]; prevLabel: string; currLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm px-4 py-6 text-center" style={{ color: '#4a5568' }}>No category data yet</p>
  }

  return (
    <div>
      <div className="grid grid-cols-4 px-4 pb-2" style={{ borderBottom: '1px solid #1e2a3a' }}>
        <span className="text-xs col-span-2" style={{ color: '#4a5568' }}>Category</span>
        <span className="text-xs text-right" style={{ color: '#4a5568' }}>{prevLabel}</span>
        <span className="text-xs text-right" style={{ color: '#4a5568' }}>{currLabel}</span>
      </div>
      {rows.map((row, i) => {
        const pct    = row.prev > 0 ? ((row.curr - row.prev) / row.prev) * 100 : null
        const grew   = pct !== null && pct > 20
        const shrank = pct !== null && pct < -20
        const color  = grew ? '#FF4488' : shrank ? '#00FF94' : '#f0f4f8'

        return (
          <div
            key={row.category}
            className="grid grid-cols-4 items-center px-4 py-2.5"
            style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
          >
            <div className="col-span-2 flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate" style={{ color }}>{row.category}</span>
              {pct !== null && (
                <span className="text-[10px] shrink-0 flex items-center gap-0.5" style={{ color }}>
                  {grew ? <TrendingUp size={11} /> : shrank ? <TrendingDown size={11} /> : <Minus size={11} />}
                  {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                </span>
              )}
            </div>
            <span className="text-xs text-right" style={{ color: '#8892a4', fontFamily: 'var(--font-dm-mono)' }}>
              {row.prev > 0 ? gbp(row.prev) : '—'}
            </span>
            <span className="text-xs text-right font-semibold" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
              {row.curr > 0 ? gbp(row.curr) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TrendsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const periods    = getLast4PayPeriods()
  const oldest     = periods[0]
  const newest     = periods[periods.length - 1]
  const prevPeriod = periods[periods.length - 2]
  const currPeriod = periods[periods.length - 1]

  // ── Cache check FIRST — skips transaction query entirely on hit ────────────
  let periodData: PeriodSummary[] = []
  let catRows:    CatRow[]        = []
  let insight:    string | null   = null

  try {
    const { data: cached } = await supabase
      .from('ai_insights')
      .select('body, data')
      .eq('user_id', user.id)
      .eq('type', 'spending_pattern')
      .eq('title', 'trends_insight')
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (cached?.body && cached?.data?.periodData && cached?.data?.catRows) {
      // Full cache hit — serve everything from cache, no transaction query needed
      insight    = cached.body as string
      periodData = cached.data.periodData as PeriodSummary[]
      catRows    = cached.data.catRows    as CatRow[]
    } else {
      // ── Cache miss: fetch transactions and compute ────────────────────────
      const { data: txRows } = await supabase
        .from('transactions')
        .select('date, tag, amount, category')
        .eq('user_id', user.id)
        .gte('date', oldest.start)
        .lte('date', newest.end)
        .not('tag', 'is', null)

      const rows = txRows ?? []

      function periodRows(p: PayPeriod) {
        return rows.filter(r => (r.date as string) >= p.start && (r.date as string) <= p.end)
      }

      periodData = periods.map(p => {
        const pr = periodRows(p)
        return {
          period:        p,
          income:        pr.filter(r => r.tag === 'Income').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
          fixed:         pr.filter(r => r.tag === 'Fixed').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
          discretionary: pr.filter(r => r.tag === 'Discretionary').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
        }
      })

      const allCats = Array.from(new Set(
        rows.filter(r => r.tag === 'Discretionary' && r.category).map(r => r.category as string)
      )).sort()

      function catTotal(p: PayPeriod, cat: string) {
        return rows
          .filter(r => (r.date as string) >= p.start && (r.date as string) <= p.end
                    && r.tag === 'Discretionary' && r.category === cat)
          .reduce((s, r) => s + Math.abs(Number(r.amount)), 0)
      }

      catRows = allCats
        .map(cat => ({ category: cat, prev: catTotal(prevPeriod, cat), curr: catTotal(currPeriod, cat) }))
        .filter(r => r.prev > 0 || r.curr > 0)
        .sort((a, b) => b.prev - a.prev)

      // ── Call Claude for insight ───────────────────────────────────────────
      const spendingCtx = periodData
        .map(d => `${d.period.label}: Income ${gbp(d.income)}, Fixed ${gbp(d.fixed)}, Discretionary ${gbp(d.discretionary)}, Net surplus ${gbp(d.income - d.fixed - d.discretionary)}`)
        .join('\n')

      const catCtx = catRows
        .map(r => `  ${r.category}: ${prevPeriod.label} ${gbp(r.prev)} → ${currPeriod.label} ${gbp(r.curr)}`)
        .join('\n')

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response  = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role:    'user',
          content: `You are a personal finance advisor. Pay periods run from the 20th to the 19th each month.\n\nPay period summary (last 4 periods):\n${spendingCtx}\n\nDiscretionary category trends (${prevPeriod.label} → ${currPeriod.label}, current period is partial):\n${catCtx}\n\nWrite a 3-4 sentence insight identifying the most important trends, any growing costs to watch, and one specific recommendation. Be direct and specific with pound amounts.`,
        }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (textBlock?.type === 'text') {
        insight = textBlock.text

        // Delete previous rows (cleanup) then insert fresh
        await supabase
          .from('ai_insights')
          .delete()
          .eq('user_id', user.id)
          .eq('type', 'spending_pattern')
          .eq('title', 'trends_insight')

        await supabase.from('ai_insights').insert({
          user_id:    user.id,
          type:       'spending_pattern',
          title:      'trends_insight',
          body:       insight,
          data:       { periodData, catRows },
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      }
    }
  } catch { /* insight and chart data degrade gracefully */ }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Trends</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            {oldest.label} – {newest.label} · pay period analysis
          </p>
        </div>

        {/* AI Insight */}
        {insight && (
          <section
            className="mb-6 rounded-2xl p-5"
            style={{ backgroundColor: '#131929', border: '1px solid #A78BFA40' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} style={{ color: '#A78BFA' }} />
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#A78BFA' }}>
                AI Insight
              </h2>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#c0c8d4' }}>{insight}</p>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Section A — Pay period bar chart */}
          <section className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}>
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8892a4' }}>
                Monthly Overview
              </h2>
            </div>
            <div className="px-3 pb-2">
              <MonthlyChart data={periodData} />
            </div>
            <div style={{ borderTop: '1px solid #1e2a3a' }}>
              {periodData.filter(d => d.income > 0 || d.fixed > 0 || d.discretionary > 0).map((d, i) => (
                <div
                  key={d.period.start}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
                >
                  <span className="text-xs font-medium" style={{ color: '#8892a4' }}>
                    {d.period.label}
                    <span className="ml-1 text-[9px]" style={{ color: '#4a5568' }}>
                      {d.period.start.slice(5).replace('-', '/')}–{d.period.end.slice(5).replace('-', '/')}
                    </span>
                  </span>
                  <div className="flex gap-3 text-xs" style={{ fontFamily: 'var(--font-dm-mono)' }}>
                    <span style={{ color: '#00FF94' }}>+{gbp(d.income)}</span>
                    <span style={{ color: '#A78BFA' }}>-{gbp(d.fixed)}</span>
                    <span style={{ color: '#00D4FF' }}>-{gbp(d.discretionary)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section B — Category trends */}
          <section className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}>
            <div className="px-4 pt-4 pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#8892a4' }}>
                Category Trends
              </h2>
              <p className="text-[10px]" style={{ color: '#4a5568' }}>
                {prevPeriod.label} (full) → {currPeriod.label} (partial) · discretionary
              </p>
            </div>
            <CategoryTrends rows={catRows} prevLabel={prevPeriod.label} currLabel={currPeriod.label} />
            <div className="px-4 py-3 flex gap-4 text-[10px]" style={{ borderTop: '1px solid #1e2a3a', color: '#4a5568' }}>
              <span style={{ color: '#FF4488' }}>▲ &gt;20% growth</span>
              <span style={{ color: '#00FF94' }}>▼ &gt;20% saving</span>
            </div>
          </section>

        </div>
      </main>

      <BottomNav />
    </div>
  )
}
