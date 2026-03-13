import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react'
import Anthropic from '@anthropic-ai/sdk'

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
  if (val >= 1000) return `£${(val / 1000 % 1 === 0 ? val / 1000 : (val / 1000).toFixed(1))}k`
  return `£${val}`
}

const MONTH_LABELS: Record<string, string> = {
  '2025-10': 'Oct', '2025-11': 'Nov', '2025-12': 'Dec',
  '2026-01': 'Jan', '2026-02': 'Feb', '2026-03': 'Mar',
  '2026-04': 'Apr',
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

type MonthSummary = { key: string; label: string; income: number; fixed: number; discretionary: number }

function MonthlyChart({ data }: { data: MonthSummary[] }) {
  const W = 500, H = 260
  const ml = 54, mr = 8, mt = 16, mb = 52
  const chartW = W - ml - mr
  const chartH = H - mt - mb

  const maxVal = Math.max(...data.flatMap(d => [d.income, d.fixed, d.discretionary]), 500)
  const ceiling = niceMax(maxVal)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(ceiling * f))

  const numGroups = data.length
  const groupW    = chartW / numGroups
  const barW      = Math.min(22, (groupW - 24) / 3)
  const gap       = 3
  const groupInner = 3 * barW + 2 * gap
  const groupOffset = (groupW - groupInner) / 2

  const bx = (gi: number, bi: number) => ml + gi * groupW + groupOffset + bi * (barW + gap)
  const bh = (val: number)  => (val / ceiling) * chartH
  const by = (val: number)  => mt + chartH - bh(val)

  const BARS = [
    { key: 'income',        color: '#00FF94' },
    { key: 'fixed',         color: '#A78BFA' },
    { key: 'discretionary', color: '#00D4FF' },
  ] as const

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {/* Grid lines + y-labels */}
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

      {/* Bars */}
      {data.map((d, gi) => (
        <g key={d.key}>
          {BARS.map(({ key, color }, bi) => {
            const val = d[key]
            const h   = bh(val)
            if (h < 1) return null
            return (
              <rect
                key={key}
                x={bx(gi, bi)}
                y={by(val)}
                width={barW}
                height={h}
                fill={color}
                rx={2}
                opacity={0.9}
              />
            )
          })}
          {/* Month label */}
          <text
            x={ml + gi * groupW + groupW / 2}
            y={mt + chartH + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#8892a4"
          >
            {d.label}
          </text>
        </g>
      ))}

      {/* Legend */}
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
      {/* Header */}
      <div className="grid grid-cols-4 px-4 pb-2" style={{ borderBottom: '1px solid #1e2a3a' }}>
        <span className="text-xs col-span-2" style={{ color: '#4a5568' }}>Category</span>
        <span className="text-xs text-right" style={{ color: '#4a5568' }}>{prevLabel}</span>
        <span className="text-xs text-right" style={{ color: '#4a5568' }}>{currLabel}</span>
      </div>
      {rows.map((row, i) => {
        const pct = row.prev > 0 ? ((row.curr - row.prev) / row.prev) * 100 : null
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
                <span className="text-[10px] shrink-0" style={{ color }}>
                  {grew
                    ? <TrendingUp size={11} style={{ display: 'inline' }} />
                    : shrank
                      ? <TrendingDown size={11} style={{ display: 'inline' }} />
                      : <Minus size={11} style={{ display: 'inline' }} />}
                  {' '}{pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                </span>
              )}
            </div>
            <span
              className="text-xs text-right"
              style={{ color: '#8892a4', fontFamily: 'var(--font-dm-mono)' }}
            >
              {row.prev > 0 ? gbp(row.prev) : '—'}
            </span>
            <span
              className="text-xs text-right font-semibold"
              style={{ color, fontFamily: 'var(--font-dm-mono)' }}
            >
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

  // ── Query last 4 months of tagged transactions ─────────────────────────────
  const { data: monthlyRows } = await supabase
    .from('transactions')
    .select('date, tag, amount, category')
    .eq('user_id', user.id)
    .gte('date', '2025-12-01')
    .lte('date', '2026-03-31')
    .not('tag', 'is', null)

  // ── Build monthly summaries ────────────────────────────────────────────────
  const MONTHS = ['2025-12', '2026-01', '2026-02', '2026-03']

  const monthlyData: MonthSummary[] = MONTHS.map(key => {
    const rows = (monthlyRows ?? []).filter(r => (r.date as string).startsWith(key))
    return {
      key,
      label: MONTH_LABELS[key] ?? key,
      income:        rows.filter(r => r.tag === 'Income').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
      fixed:         rows.filter(r => r.tag === 'Fixed').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
      discretionary: rows.filter(r => r.tag === 'Discretionary').reduce((s, r) => s + Math.abs(Number(r.amount)), 0),
    }
  })

  // ── Category trends: Feb vs Mar ────────────────────────────────────────────
  const prevKey = '2026-02'
  const currKey = '2026-03'

  const allCategories = Array.from(new Set(
    (monthlyRows ?? [])
      .filter(r => r.tag === 'Discretionary' && r.category)
      .map(r => r.category as string)
  )).sort()

  function catTotal(monthKey: string, cat: string) {
    return (monthlyRows ?? [])
      .filter(r => (r.date as string).startsWith(monthKey) && r.tag === 'Discretionary' && r.category === cat)
      .reduce((s, r) => s + Math.abs(Number(r.amount)), 0)
  }

  const catRows: CatRow[] = allCategories.map(cat => ({
    category: cat,
    prev: catTotal(prevKey, cat),
    curr: catTotal(currKey, cat),
  })).filter(r => r.prev > 0 || r.curr > 0)
    .sort((a, b) => b.prev - a.prev)

  // ── AI Insight (24h cache) ────────────────────────────────────────────────
  let insight: string | null = null

  try {
    // Check cache
    const { data: cached } = await supabase
      .from('ai_insights')
      .select('body')
      .eq('user_id', user.id)
      .eq('type', 'spending_pattern')
      .eq('title', 'trends_insight')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (cached?.body) {
      insight = cached.body
    } else {
      // Build context for Claude
      const spendingCtx = monthlyData
        .map(m => `${m.label} 2026: Income ${gbp(m.income)}, Fixed costs ${gbp(m.fixed)}, Discretionary ${gbp(m.discretionary)}`)
        .join('\n')

      const catCtx = catRows
        .map(r => `  ${r.category}: Feb ${gbp(r.prev)} → Mar ${gbp(r.curr)}`)
        .join('\n')

      const feb = monthlyData.find(m => m.key === prevKey)
      const mar = monthlyData.find(m => m.key === currKey)
      const netFeb = feb ? feb.income - feb.fixed - feb.discretionary : 0
      const netMar = mar ? mar.income - mar.fixed - mar.discretionary : 0

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `You are a personal finance advisor. Based on this spending data:\n\nMonthly overview (last 4 months):\n${spendingCtx}\n\nNet surplus: Feb ${gbp(netFeb)}, Mar (partial) ${gbp(netMar)}\n\nDiscretionary category trends (Feb → Mar, partial month):\n${catCtx}\n\nWrite a 3-4 sentence insight identifying the most important trends, any growing costs to watch, and one specific recommendation. Be direct and specific with pound amounts. Note that March data is partial (up to 13th).`,
        }],
      })

      const textBlock = response.content.find(b => b.type === 'text')
      if (textBlock?.type === 'text') {
        insight = textBlock.text

        // Cache for 24 hours
        await supabase.from('ai_insights').insert({
          user_id:    user.id,
          type:       'spending_pattern',
          title:      'trends_insight',
          body:       insight,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
      }
    }
  } catch {
    // Fail silently — insight is optional
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Trends</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            Dec 2025 – Mar 2026 · monthly overview
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

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Section A — Monthly bar chart */}
          <section
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8892a4' }}>
                Monthly Overview
              </h2>
            </div>
            <div className="px-3 pb-4">
              <MonthlyChart data={monthlyData} />
            </div>

            {/* Month totals table */}
            <div style={{ borderTop: '1px solid #1e2a3a' }}>
              {monthlyData.filter(m => m.income > 0 || m.fixed > 0 || m.discretionary > 0).map((m, i) => (
                <div
                  key={m.key}
                  className="flex items-center justify-between px-4 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
                >
                  <span className="text-xs font-medium" style={{ color: '#8892a4' }}>{m.label}</span>
                  <div className="flex gap-3 text-xs" style={{ fontFamily: 'var(--font-dm-mono)' }}>
                    <span style={{ color: '#00FF94' }}>+{gbp(m.income)}</span>
                    <span style={{ color: '#A78BFA' }}>-{gbp(m.fixed)}</span>
                    <span style={{ color: '#00D4FF' }}>-{gbp(m.discretionary)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section B — Category trends */}
          <section
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            <div className="px-4 pt-4 pb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#8892a4' }}>
                Category Trends
              </h2>
              <p className="text-[10px]" style={{ color: '#4a5568' }}>
                Feb (full) → Mar (partial) · discretionary spend
              </p>
            </div>
            <CategoryTrends rows={catRows} prevLabel="Feb" currLabel="Mar" />
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
