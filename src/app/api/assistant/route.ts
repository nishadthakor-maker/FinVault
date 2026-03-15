import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getFinancialSummary } from '@/lib/financialSummary'
import { getCurrentPayPeriod, getLast4PayPeriods } from '@/lib/payPeriod'

const COMPLEX_KEYWORDS = [
  'why', 'how is', 'how are', 'what would', 'should i',
  'explain', 'analys', 'analyz', 'scenario', 'what if',
  'on track', 'recommend',
]

function classifyMessage(message: string): 'sonnet' | 'haiku' {
  const lower = message.toLowerCase()
  for (const kw of COMPLEX_KEYWORDS) {
    if (lower.includes(kw)) return 'sonnet'
  }
  return 'haiku'
}

function gbp(n: number) {
  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { message } = await req.json() as { message: string }
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  const modelType = classifyMessage(message)
  const modelId   = modelType === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'

  // ── Fetch financial context ───────────────────────────────────────────────
  const currentPeriod = getCurrentPayPeriod()
  const last4         = getLast4PayPeriods(4)

  const [currentSummary, last4Summaries] = await Promise.all([
    getFinancialSummary(supabase, currentPeriod.start, currentPeriod.end),
    Promise.all(last4.slice(0, 3).map(p => getFinancialSummary(supabase, p.start, p.end))),
  ])

  // Top spending categories for current period
  const { data: topCats } = await supabase
    .from('transactions')
    .select('category, amount')
    .gte('date', currentPeriod.start)
    .lte('date', currentPeriod.end)
    .lt('amount', 0)
    .eq('transfer_flag', false)

  const catMap = new Map<string, number>()
  for (const t of topCats ?? []) {
    if (!t.category) continue
    catMap.set(t.category, (catMap.get(t.category) ?? 0) + Math.abs(Number(t.amount)))
  }
  const topCategories = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, amt]) => ({ category: cat, amount: amt }))

  // Next 3 future events
  const { data: futureEvents } = await supabase
    .from('future_events')
    .select('name, amount, event_date, category')
    .eq('user_id', user.id)
    .gte('event_date', currentPeriod.start)
    .order('event_date')
    .limit(3)

  // ── Build system prompt ───────────────────────────────────────────────────
  const cs = currentSummary
  const systemPrompt = `You are FinVault AI, a personal finance assistant for Nishad.

NISHAD'S FINANCIAL PROFILE:
- Monthly salary: ~£3,494 (normal). Payday ~20th of each month.
- Rent: ~£850/month
- Car finance: ~£350/month
- Key credit cards: Barclaycard (main spending), NatWest CC (fuel), HSBC, Tesco
- Savings via NatWest to linked savings accounts
- Location: Oadby/Wigston, Leicestershire, UK

CURRENT PERIOD (${cs.period.label} — ${cs.period.start} to ${cs.period.end}):
- Salary: ${gbp(cs.income.salary)}${cs.income.isBonus ? ` (includes ~${gbp(cs.income.bonusAmount)} bonus)` : ''}
- Committed costs: ${gbp(cs.committedCosts.total)} (rent ${gbp(cs.committedCosts.rent)}, car finance ${gbp(cs.committedCosts.carFinance)}, bills ${gbp(cs.committedCosts.total - cs.committedCosts.rent - cs.committedCosts.carFinance)})
- CC Spending: ${gbp(cs.spendingView.barclaycard.total + cs.spendingView.natwestCC.total + cs.spendingView.hsbc.total + cs.spendingView.tesco.total)} (Barclaycard ${gbp(cs.spendingView.barclaycard.total)}, others ${gbp(cs.spendingView.natwestCC.total + cs.spendingView.hsbc.total + cs.spendingView.tesco.total)})
  - Barclaycard breakdown: Groceries ${gbp(cs.spendingView.barclaycard.groceries)}, Dining ${gbp(cs.spendingView.barclaycard.dining)}, Fuel ${gbp(cs.spendingView.barclaycard.fuel)}, Medical ${gbp(cs.spendingView.barclaycard.medical)}, Personal ${gbp(cs.spendingView.barclaycard.personal)}, Other ${gbp(cs.spendingView.barclaycard.other)}
- Direct NatWest spend: ${gbp(cs.spendingView.directFromNatwest.total)}
- SPENDING SURPLUS: ${gbp(cs.spendingView.spendingSurplus)} (${cs.spendingView.spendingSurplusPercent.toFixed(1)}% of income)
- CC Repayments this period: ${gbp(cs.cashFlowView.ccRepayments.total)}
- CASH REMAINING: ${gbp(cs.cashFlowView.cashRemaining)}
- DEBT HEALTH: ${cs.debtHealthIndicator.trend === 'paying_down' ? '✅ Paying down' : cs.debtHealthIndicator.trend === 'accumulating' ? '❌ Accumulating' : '➖ Neutral'} — net change ${gbp(cs.debtHealthIndicator.netDebtChange)}

TOP SPENDING CATEGORIES THIS PERIOD:
${topCategories.map(c => `- ${c.category}: ${gbp(c.amount)}`).join('\n')}

LAST 3 PERIODS (for trend context):
${last4Summaries.map(s => `- ${s.period.label}: Salary ${gbp(s.income.total)}, Committed ${gbp(s.committedCosts.total)}, Spending ${gbp(s.spendingView.totalSpending)}, Surplus ${gbp(s.spendingView.spendingSurplus)}, Debt Δ ${gbp(s.debtHealthIndicator.netDebtChange)}`).join('\n')}

UPCOMING EVENTS:
${(futureEvents ?? []).map(e => `- ${e.event_date}: ${e.name} ${gbp(e.amount)}`).join('\n') || '- None upcoming'}

INSTRUCTIONS:
- Be concise and specific. Use £ amounts from the data.
- Answer in plain English — no need to restate all the data unless asked.
- If asked about trends, compare current vs prior periods.
- Format currency as £X,XXX.XX.
- Keep responses under 200 words unless a detailed analysis is requested.`

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic()

  const response = await client.messages.create({
    model:      modelId,
    max_tokens: modelType === 'sonnet' ? 1024 : 512,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: message }],
  })

  const reply = response.content.find(b => b.type === 'text')?.text ?? 'Sorry, I could not generate a response.'

  return NextResponse.json({ reply, model: modelType })
}
