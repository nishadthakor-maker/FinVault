import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { ForecastClient } from './ForecastClient'
import { computeProjection, type ScenarioConfig, type FutureEventItem } from '@/lib/forecastProjection'

export const dynamic = 'force-dynamic'

// ─── Default scenario assumptions ─────────────────────────────────────────────

const DEFAULTS: Record<'A' | 'B' | 'C', ScenarioConfig> = {
  A: { salary: 3494, fixedBills: 1338, ccSpend: 143, directDiscretionary: 419, extraSavings: 0   },
  B: { salary: 3494, fixedBills: 1338, ccSpend: 107, directDiscretionary: 356, extraSavings: 200 },
  C: { salary: 3494, fixedBills: 1338, ccSpend: 72,  directDiscretionary: 314, extraSavings: 400 },
}

const SCENARIO_LABELS: Record<'A' | 'B' | 'C', string> = {
  A: 'Current Trajectory',
  B: 'Controlled Spending',
  C: 'Optimised',
}

function gbp(n: number) {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

// ─── AI insight generation ────────────────────────────────────────────────────

async function getScenarioInsight(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  scenario: 'A' | 'B' | 'C',
  config: ScenarioConfig,
  startBalance: number,
  events: FutureEventItem[],
): Promise<string | null> {
  const cacheTitle = `forecast_scenario_${scenario}`

  // Check cache
  const { data: cached } = await supabase
    .from('ai_insights')
    .select('body, expires_at')
    .eq('user_id', userId)
    .eq('type', 'forecast')
    .eq('title', cacheTitle)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (cached?.body) return cached.body

  // Generate fresh
  try {
    const { stats } = computeProjection(startBalance, config, events)
    const monthlySurplus = config.salary - config.fixedBills - config.ccSpend - config.directDiscretionary - config.extraSavings
    const prompt = [
      `Scenario ${scenario} (${SCENARIO_LABELS[scenario]}) for Nishad's finances over the next 12 months:`,
      `Starting balance: ${gbp(startBalance)}`,
      `Monthly surplus/deficit: ${gbp(monthlySurplus)} (salary ${gbp(config.salary)} minus ${gbp(config.fixedBills)} fixed bills, ${gbp(config.ccSpend)} CC spend, ${gbp(config.directDiscretionary)} discretionary, ${gbp(config.extraSavings)} savings)`,
      `Projected 12-month end balance: ${gbp(stats.endBalance)}`,
      `Danger months (balance below £500): ${stats.dangerMonths}`,
      `Worst month: ${stats.worstMonth.label} at ${gbp(stats.worstBalance)} (events: ${stats.worstMonth.events.map(e => e.name).join(', ') || 'none'})`,
      `Total saved over 12 months: ${gbp(stats.totalSaved)}`,
      `\nIn one sentence, summarise what this scenario means for Nishad's finances. Be specific with pound amounts. No markdown.`,
    ].join('\n')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response  = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 120,
      messages:   [{ role: 'user', content: prompt }],
    })
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return null

    const insight = textBlock.text.trim()

    // Cache for 7 days
    await supabase.from('ai_insights').delete()
      .eq('user_id', userId).eq('type', 'forecast').eq('title', cacheTitle)
    await supabase.from('ai_insights').insert({
      user_id:    userId,
      type:       'forecast',
      title:      cacheTitle,
      body:       insight,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })

    return insight
  } catch {
    return null
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ForecastPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [eventsRes, accountsRes, assumptionsRes, linkedTxRes, pastTxRes] = await Promise.all([
    supabase.from('future_events')
      .select('id, name, amount, amount_min, amount_max, event_date, category, recurrence_rule, notes')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('event_date', '2026-03-01')
      .order('event_date'),
    supabase.from('accounts')
      .select('balance')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('scenario_assumptions')
      .select('scenario, salary, fixed_bills, cc_spend, direct_discretionary, extra_savings')
      .eq('user_id', user.id),
    // Transactions linked to future events (for budget vs actuals)
    supabase.from('transactions')
      .select('event_id, amount')
      .eq('user_id', user.id)
      .not('event_id', 'is', null)
      .lt('amount', 0),   // expenses only
    // Past transactions for monthly actuals (Jan–Mar 2026)
    supabase.from('transactions')
      .select('date, tag, amount')
      .eq('user_id', user.id)
      .gte('date', '2026-01-01')
      .lte('date', '2026-03-31')
      .eq('transfer_flag', false),
  ])

  const events       = (eventsRes.data ?? []) as FutureEventItem[]
  const totalBalance = (accountsRes.data ?? []).reduce((sum, a) => sum + Number(a.balance), 0)

  // Aggregate event spend from linked transactions
  const eventSpend: Record<string, number> = {}
  for (const tx of linkedTxRes.data ?? []) {
    if (tx.event_id) {
      eventSpend[tx.event_id] = (eventSpend[tx.event_id] ?? 0) + Math.abs(Number(tx.amount))
    }
  }

  // Aggregate monthly actuals from past transactions
  type MonthlyActual = { income: number; fixed: number; discretionary: number }
  const monthlyActuals: Record<string, MonthlyActual> = {}
  for (const tx of pastTxRes.data ?? []) {
    const ym = tx.date.slice(0, 7)   // 'YYYY-MM'
    if (!monthlyActuals[ym]) monthlyActuals[ym] = { income: 0, fixed: 0, discretionary: 0 }
    const amt = Number(tx.amount)
    if (tx.tag === 'Income')           monthlyActuals[ym].income        += amt
    else if (tx.tag === 'Fixed')       monthlyActuals[ym].fixed         += Math.abs(amt)
    else if (tx.tag === 'Discretionary') monthlyActuals[ym].discretionary += Math.abs(amt)
  }

  // Merge saved assumptions with defaults
  const saved = assumptionsRes.data ?? []
  function getConfig(s: 'A' | 'B' | 'C'): ScenarioConfig {
    const row = saved.find(r => r.scenario === s)
    if (!row) return DEFAULTS[s]
    return {
      salary:               Number(row.salary),
      fixedBills:           Number(row.fixed_bills),
      ccSpend:              Number(row.cc_spend),
      directDiscretionary:  Number(row.direct_discretionary),
      extraSavings:         Number(row.extra_savings),
    }
  }
  const configs = { A: getConfig('A'), B: getConfig('B'), C: getConfig('C') }

  // Generate AI insights in parallel
  const [insightA, insightB, insightC] = await Promise.all([
    getScenarioInsight(supabase, user.id, 'A', configs.A, totalBalance, events),
    getScenarioInsight(supabase, user.id, 'B', configs.B, totalBalance, events),
    getScenarioInsight(supabase, user.id, 'C', configs.C, totalBalance, events),
  ])

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />
      <ForecastClient
        events={events}
        totalBalance={totalBalance}
        configs={configs}
        insights={{ A: insightA, B: insightB, C: insightC }}
        eventSpend={eventSpend}
        monthlyActuals={monthlyActuals}
      />
      <BottomNav />
    </div>
  )
}
