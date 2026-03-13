// Pay period utility — payday is always the 20th of each month.
// A period runs from the 20th of one month through the 19th of the next.
// Label = the month containing the 19th (end month), e.g. 20 Feb–19 Mar = "Mar"

const PAYDAY_DATE = 20

export type PayPeriod = {
  start: string  // YYYY-MM-DD (inclusive)
  end:   string  // YYYY-MM-DD (inclusive)
  label: string  // Short month name of the end month, e.g. "Mar"
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Returns the pay period that contains `date`. */
export function getPayPeriodForDate(date: Date): PayPeriod {
  const day   = date.getDate()
  const month = date.getMonth()   // 0-indexed
  const year  = date.getFullYear()

  // If day >= 20, period started on the 20th of THIS month
  // If day < 20,  period started on the 20th of LAST month
  let startMonth = month
  let startYear  = year

  if (day < PAYDAY_DATE) {
    startMonth -= 1
    if (startMonth < 0) { startMonth = 11; startYear -= 1 }
  }

  let endMonth = startMonth + 1
  let endYear  = startYear
  if (endMonth > 11) { endMonth = 0; endYear += 1 }

  const start = new Date(startYear, startMonth, PAYDAY_DATE)
  const end   = new Date(endYear,   endMonth,   19)
  const label = end.toLocaleDateString('en-GB', { month: 'short' })

  return { start: toISO(start), end: toISO(end), label }
}

/** Returns the pay period that contains today. */
export function getCurrentPayPeriod(): PayPeriod {
  return getPayPeriodForDate(new Date())
}

/** Returns the next payday (the 20th after the current period ends). */
export function getNextPayday(): Date {
  const period  = getCurrentPayPeriod()
  const endDate = new Date(period.end + 'T00:00:00')
  endDate.setDate(endDate.getDate() + 1)  // 19 → 20
  return endDate
}

/**
 * Returns the last N pay periods in chronological order (oldest first).
 * Default N = 4.
 */
export function getLast4PayPeriods(n = 4): PayPeriod[] {
  const periods: PayPeriod[] = [getCurrentPayPeriod()]

  for (let i = 1; i < n; i++) {
    const prev      = periods[periods.length - 1]
    const dayBefore = new Date(prev.start + 'T00:00:00')
    dayBefore.setDate(dayBefore.getDate() - 1)  // one day before the 20th = 19th of prev month
    periods.push(getPayPeriodForDate(dayBefore))
  }

  return periods.reverse()  // oldest → newest
}
