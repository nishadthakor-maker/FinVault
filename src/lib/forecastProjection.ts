// ─── Shared forecast projection logic ────────────────────────────────────────
// Used by both page.tsx (for AI prompt generation) and ForecastClient (for charts).

export type FutureEventItem = {
  id:             string
  name:           string
  amount:         number
  amount_min:     number | null
  amount_max:     number | null
  event_date:     string   // 'YYYY-MM-DD'
  category:       string | null
  recurrence_rule: string | null
  notes:          string | null
}

export type ScenarioConfig = {
  salary:               number
  fixedBills:           number
  ccSpend:              number
  directDiscretionary:  number
  extraSavings:         number
}

export type MonthPoint = {
  yearMonth:    string                // 'YYYY-MM'
  label:        string                // 'Apr 2026'
  startBalance: number
  income:       number
  expenses:     number                // fixed + cc + disc + savings
  eventCost:    number
  events:       FutureEventItem[]
  endBalance:   number
}

export type ProjectionStats = {
  endBalance:   number
  totalSaved:   number
  dangerMonths: number                // endBalance < 500
  worstMonth:   MonthPoint
  worstBalance: number
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Midpoint amount for an event (uses min/max if set, falls back to amount). */
export function eventMidpoint(e: FutureEventItem): number {
  return e.amount_min != null && e.amount_max != null
    ? (e.amount_min + e.amount_max) / 2
    : e.amount
}

/**
 * Compute 12 monthly projections starting from April 2026.
 * Returns an array of 13 MonthPoints: [Mar 2026 (start), Apr 2026, ..., Mar 2027].
 */
export function computeProjection(
  startBalance: number,
  config: ScenarioConfig,
  events: FutureEventItem[],
): { points: MonthPoint[]; stats: ProjectionStats } {
  const points: MonthPoint[] = []

  // Month 0 — current position (March 2026, no transactions applied)
  points.push({
    yearMonth:    '2026-03',
    label:        'Mar 2026',
    startBalance: startBalance,
    income:       0,
    expenses:     0,
    eventCost:    0,
    events:       [],
    endBalance:   startBalance,
  })

  let balance = startBalance

  for (let i = 1; i <= 12; i++) {
    // April 2026 = month offset 3+i-1 = 3+i; use Date to handle year rollover
    const d        = new Date(2026, 2 + i, 1)   // month is 0-indexed: March=2, April=3, …
    const year     = d.getFullYear()
    const month    = d.getMonth() + 1            // back to 1-indexed
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`
    const label    = `${MONTH_LABELS[month - 1]} ${year}`

    const monthEvents = events.filter(e => e.event_date.startsWith(yearMonth))
    const eventCost   = monthEvents.reduce((sum, e) => sum + eventMidpoint(e), 0)

    const income   = config.salary
    const expenses = config.fixedBills + config.ccSpend + config.directDiscretionary + config.extraSavings
    const endBalance = balance + income - expenses - eventCost

    points.push({ yearMonth, label, startBalance: balance, income, expenses, eventCost, events: monthEvents, endBalance })
    balance = endBalance
  }

  const projected   = points.slice(1)
  const dangerMonths = projected.filter(m => m.endBalance < 500).length
  const worstMonth   = projected.reduce((w, m) => m.endBalance < w.endBalance ? m : w, projected[0])
  const totalSaved   = config.extraSavings * 12

  return {
    points,
    stats: {
      endBalance:   points[points.length - 1].endBalance,
      totalSaved,
      dangerMonths,
      worstMonth,
      worstBalance: worstMonth.endBalance,
    },
  }
}

export function balanceColor(balance: number): string {
  if (balance < 500)  return '#FF4488'
  if (balance < 1500) return '#F59E0B'
  return '#00FF94'
}
