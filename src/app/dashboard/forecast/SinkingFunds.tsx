'use client'

import { AlertTriangle, PiggyBank } from 'lucide-react'
import { type FutureEventItem, eventMidpoint } from '@/lib/forecastProjection'

const CAT_EMOJI: Record<string, string> = {
  Car: '🚗', Holiday: '✈️', Insurance: '🛡️', Kids: '👶',
  Home: '🏠', Medical: '🏥', Christmas: '🎄', Birthday: '🎂', Other: '📦',
}

function gbp(n: number) {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

// Calculate months from today (Mar 14, 2026) to event_date
function monthsUntil(eventDate: string): number {
  const today     = new Date('2026-03-14')
  const date      = new Date(eventDate)
  const raw       = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth())
  return Math.max(1, raw)
}

type Props = {
  events: FutureEventItem[]
  salary: number
}

export function SinkingFunds({ events, salary }: Props) {
  if (events.length === 0) return null

  const items = events
    .map(e => {
      const amount  = eventMidpoint(e)
      const months  = monthsUntil(e.event_date)
      const monthly = amount / months
      return { event: e, amount, months, monthly }
    })
    .sort((a, b) => a.months - b.months)

  const totalMonthly   = items.reduce((sum, f) => sum + f.monthly, 0)
  const threshold      = salary * 0.20
  const overBudget     = totalMonthly > threshold
  const pctOfSalary    = (totalMonthly / salary) * 100

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <PiggyBank size={16} style={{ color: '#00FF94' }} />
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#00FF94', letterSpacing: '0.08em' }}>
          Sinking Funds
        </h2>
      </div>

      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>

        {/* Total callout */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
              Total monthly sinking fund
            </p>
            <p className="text-2xl font-bold" style={{ color: overBudget ? '#F59E0B' : '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
              {gbp(totalMonthly)}<span className="text-sm font-medium" style={{ color: '#4a5568' }}>/mo</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: '#8899aa' }}>
              {pctOfSalary.toFixed(1)}% of salary
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#4a5568' }}>
              {gbp(salary - totalMonthly)} left after sinking
            </p>
          </div>
        </div>

        {/* Warning */}
        {overBudget && (
          <div className="px-4 py-2.5 flex items-center gap-2"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
            <AlertTriangle size={13} className="shrink-0" style={{ color: '#F59E0B' }} />
            <p className="text-xs" style={{ color: '#F59E0B' }}>
              Your sinking fund target ({pctOfSalary.toFixed(0)}% of salary) exceeds the recommended 20%. Consider spreading costs over more months or adjusting event budgets.
            </p>
          </div>
        )}

        {/* Per-event rows */}
        {items.map(({ event, amount, months, monthly }) => {
          const emoji = CAT_EMOJI[event.category ?? ''] ?? '📅'
          const pct   = Math.min(100, (monthly / (salary / items.length)) * 100)

          return (
            <div key={event.id} className="px-4 py-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{event.name}</p>
                    <p className="text-[11px]" style={{ color: '#4a5568' }}>
                      {gbp(amount)} total · {months} month{months !== 1 ? 's' : ''} away
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
                    {gbp(monthly)}<span className="text-[10px] font-normal" style={{ color: '#4a5568' }}>/mo</span>
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#00D4FF' }} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
