// Pay period utility — payday is nominally the 20th of each month.
// UK banking rules: if the 20th falls on a weekend or bank holiday, payday moves
// back to the last working day before.
// A period runs from the actual payday of one month to the day before the actual
// payday of the following month.

// UK bank holidays hardcoded for 2025–2026
const UK_BANK_HOLIDAYS = new Set([
  '2025-12-25', '2025-12-26',
  '2026-01-01',
  '2026-04-03', '2026-04-06',
  '2026-05-04', '2026-05-25',
  '2026-08-31',
  '2026-12-25', '2026-12-26',
])

export type PayPeriod = {
  start: string  // YYYY-MM-DD (inclusive)
  end:   string  // YYYY-MM-DD (inclusive)
  label: string  // Short month name of the end month, e.g. "Mar"
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Returns the actual payday for a given year + month (0-indexed month).
 * Nominally the 20th — moves back to the last working day if the 20th
 * falls on Saturday, Sunday, or a UK bank holiday.
 */
export function getActualPayday(year: number, month: number): Date {
  const candidate = new Date(year, month, 20)
  while (
    candidate.getDay() === 0 ||   // Sunday
    candidate.getDay() === 6 ||   // Saturday
    UK_BANK_HOLIDAYS.has(toISO(candidate))
  ) {
    candidate.setDate(candidate.getDate() - 1)
  }
  return candidate
}

/** Returns the pay period that contains `date`. */
export function getPayPeriodForDate(date: Date): PayPeriod {
  const year  = date.getFullYear()
  const month = date.getMonth()   // 0-indexed

  const paydayThisMonth = getActualPayday(year, month)

  // If date is before this month's actual payday, period started last month
  let startMonth = month
  let startYear  = year

  if (date < paydayThisMonth) {
    startMonth -= 1
    if (startMonth < 0) { startMonth = 11; startYear -= 1 }
  }

  let endMonth = startMonth + 1
  let endYear  = startYear
  if (endMonth > 11) { endMonth = 0; endYear += 1 }

  const start   = getActualPayday(startYear, startMonth)
  const nextPay = getActualPayday(endYear, endMonth)

  // End = one day before the next actual payday
  const end = new Date(nextPay)
  end.setDate(end.getDate() - 1)

  const label = end.toLocaleDateString('en-GB', { month: 'short' })

  return { start: toISO(start), end: toISO(end), label }
}

/** Returns the pay period that contains today. */
export function getCurrentPayPeriod(): PayPeriod {
  return getPayPeriodForDate(new Date())
}

/** Returns the next actual payday (the day after the current period ends). */
export function getNextPayday(): Date {
  const period  = getCurrentPayPeriod()
  // end is one day before next payday, so end + 1 = next payday
  const endDate = new Date(period.end + 'T00:00:00')
  endDate.setDate(endDate.getDate() + 1)
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
    dayBefore.setDate(dayBefore.getDate() - 1)
    periods.push(getPayPeriodForDate(dayBefore))
  }

  return periods.reverse()  // oldest → newest
}
