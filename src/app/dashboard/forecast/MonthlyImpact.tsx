'use client'

import { useState } from 'react'
import type { FutureEventItem, ScenarioConfig } from '@/lib/forecastProjection'
import { eventMidpoint } from '@/lib/forecastProjection'

type MonthlyActual = { income: number; fixed: number; discretionary: number }

function gbp(n: number) {
  return `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`
}

function remainingColor(n: number): string {
  if (n >= 1500) return '#00FF94'
  if (n >= 500)  return '#F59E0B'
  if (n >= 0)    return '#FF4488'
  return '#FF4488'
}

// Apr 2026 → Mar 2027 (12 months)
const FORECAST_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const d     = new Date(2026, 3 + i, 1)  // 3 = April (0-indexed)
  const year  = d.getFullYear()
  const month = d.getMonth() + 1
  const ym    = `${year}-${String(month).padStart(2, '0')}`
  const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return { yearMonth: ym, label: `${LABELS[month - 1]} ${year}`, shortLabel: LABELS[month - 1] }
})

export function MonthlyImpact({
  events,
  config,
  monthlyActuals,
}: {
  events:         FutureEventItem[]
  config:         ScenarioConfig
  monthlyActuals: Record<string, MonthlyActual>
}) {
  const [activeTab, setActiveTab] = useState<'avg' | 'worst' | 'best'>('avg')

  // Derive spending scenarios from Jan–Mar 2026 actuals
  const actualDiscretionary = ['2026-01', '2026-02', '2026-03']
    .map(ym => monthlyActuals[ym]?.discretionary ?? 0)
    .filter(v => v > 0)

  const fallback = config.ccSpend + config.directDiscretionary

  const avgSpend   = actualDiscretionary.length > 0
    ? actualDiscretionary.reduce((s, v) => s + v, 0) / actualDiscretionary.length
    : fallback
  const worstSpend = actualDiscretionary.length > 0
    ? Math.max(...actualDiscretionary)
    : fallback * 1.3
  const bestSpend  = actualDiscretionary.length > 0
    ? Math.min(...actualDiscretionary)
    : fallback * 0.75

  // Which month had worst/best
  const worstIdx = actualDiscretionary.indexOf(worstSpend)
  const bestIdx  = actualDiscretionary.indexOf(bestSpend)
  const monthNames = ['Jan', 'Feb', 'Mar']

  const spendMap = { avg: avgSpend, worst: worstSpend, best: bestSpend }

  const tabs = [
    {
      id:    'avg'   as const,
      label: 'Current Trajectory',
      sub:   `avg ${gbp(avgSpend)}/mo`,
      color: '#00D4FF',
    },
    {
      id:    'worst' as const,
      label: 'If Overspending',
      sub:   actualDiscretionary.length > 0
        ? `${gbp(worstSpend)} (${monthNames[worstIdx]})`
        : `max ${gbp(worstSpend)}/mo`,
      color: '#FF4488',
    },
    {
      id:    'best'  as const,
      label: 'Controlled',
      sub:   actualDiscretionary.length > 0
        ? `${gbp(bestSpend)} (${monthNames[bestIdx]})`
        : `target ${gbp(bestSpend)}/mo`,
      color: '#00FF94',
    },
  ]

  const tabSpend = spendMap[activeTab]

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base">📊</span>
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#F59E0B', letterSpacing: '0.08em' }}>
          Monthly Forecast Impact
        </h2>
      </div>

      <p className="text-xs leading-relaxed" style={{ color: '#4a5568' }}>
        {actualDiscretionary.length > 0
          ? `Spending scenarios derived from ${actualDiscretionary.length}-month actual data (Jan–Mar 2026). Fixed costs and planned events are certain.`
          : 'Spending scenarios based on scenario assumptions. Import statements to see actuals-based projections.'}
      </p>

      {/* Scenario tabs */}
      <div className="grid grid-cols-3 gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="rounded-xl px-3 py-2.5 text-left transition-all"
            style={{
              backgroundColor: activeTab === tab.id ? `${tab.color}10` : 'rgba(255,255,255,0.02)',
              border:          `1px solid ${activeTab === tab.id ? `${tab.color}35` : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            <p className="text-[11px] font-semibold leading-tight" style={{ color: activeTab === tab.id ? tab.color : '#4a5568' }}>
              {tab.label}
            </p>
            <p className="text-[9px] mt-0.5" style={{ color: '#4a5568', fontFamily: 'var(--font-dm-mono)' }}>
              {tab.sub}
            </p>
          </button>
        ))}
      </div>

      {/* 12-month grid */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#1a2535' }}
      >
        {/* Column headers */}
        <div
          className="grid grid-cols-12 px-4 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          <div className="col-span-2 text-[9px] uppercase tracking-wider" style={{ color: '#4a5568' }}>Month</div>
          <div className="col-span-2 text-right text-[9px] uppercase tracking-wider" style={{ color: '#4a5568' }}>Income</div>
          <div className="col-span-3 text-right text-[9px] uppercase tracking-wider" style={{ color: '#4a5568' }}>Committed</div>
          <div className="col-span-3 text-right text-[9px] uppercase tracking-wider" style={{ color: '#4a5568' }}>Spending</div>
          <div className="col-span-2 text-right text-[9px] uppercase tracking-wider" style={{ color: '#4a5568' }}>Left</div>
        </div>

        {FORECAST_MONTHS.map(({ yearMonth, shortLabel }, rowIdx) => {
          const monthEvents = events.filter(e => e.event_date.startsWith(yearMonth))
          const eventTotal  = monthEvents.reduce((s, e) => s + eventMidpoint(e), 0)
          const committed   = config.fixedBills + eventTotal
          const remaining   = config.salary - committed - tabSpend
          const rColor      = remainingColor(remaining)

          return (
            <div
              key={yearMonth}
              className="grid grid-cols-12 items-center px-4 py-3"
              style={{ borderTop: rowIdx === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
            >
              {/* Month */}
              <div className="col-span-2">
                <p className="text-xs font-semibold" style={{ color: '#f0f4f8' }}>{shortLabel}</p>
                {monthEvents.length > 0 && (
                  <p className="text-[9px] mt-0.5" style={{ color: '#F59E0B' }}>
                    {monthEvents.length} event{monthEvents.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Income */}
              <div className="col-span-2 text-right">
                <p className="text-xs font-mono" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                  +{gbp(config.salary)}
                </p>
              </div>

              {/* Committed */}
              <div className="col-span-3 text-right">
                <p className="text-xs font-mono" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                  −{gbp(config.fixedBills)}
                </p>
                {eventTotal > 0 && (
                  <p className="text-[9px]" style={{ color: '#F59E0B', fontFamily: 'var(--font-dm-mono)' }}>
                    −{gbp(eventTotal)}
                  </p>
                )}
              </div>

              {/* Spending */}
              <div className="col-span-3 text-right">
                <p className="text-xs font-mono" style={{ color: '#8899aa', fontFamily: 'var(--font-dm-mono)' }}>
                  ~−{gbp(tabSpend)}
                </p>
              </div>

              {/* Remaining */}
              <div className="col-span-2 text-right">
                <p
                  className="text-sm font-bold"
                  style={{ color: rColor, fontFamily: 'var(--font-dm-mono)' }}
                >
                  {gbp(remaining)}
                </p>
              </div>
            </div>
          )
        })}

        {/* Footer summary */}
        <div
          className="grid grid-cols-12 items-center px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}
        >
          <div className="col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#4a5568' }}>12-mo</p>
          </div>
          <div className="col-span-2 text-right">
            <p className="text-xs font-semibold" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
              +{gbp(config.salary * 12)}
            </p>
          </div>
          <div className="col-span-3 text-right">
            <p className="text-xs font-semibold" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
              −{gbp(config.fixedBills * 12 + events.reduce((s, e) => s + eventMidpoint(e), 0))}
            </p>
          </div>
          <div className="col-span-3 text-right">
            <p className="text-xs font-semibold" style={{ color: '#8899aa', fontFamily: 'var(--font-dm-mono)' }}>
              ~−{gbp(tabSpend * 12)}
            </p>
          </div>
          <div className="col-span-2 text-right">
            {(() => {
              const totalEvents = events.reduce((s, e) => s + eventMidpoint(e), 0)
              const annualRemaining = config.salary * 12 - config.fixedBills * 12 - totalEvents - tabSpend * 12
              return (
                <p
                  className="text-sm font-bold"
                  style={{ color: remainingColor(annualRemaining / 12), fontFamily: 'var(--font-dm-mono)' }}
                >
                  {gbp(annualRemaining)}
                </p>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Actuals accuracy tracker (forward-looking) */}
      <p className="text-[10px]" style={{ color: '#4a5568' }}>
        💡 As you import monthly statements, actual vs projected bars will appear here — tracking forecast accuracy over time.
      </p>
    </section>
  )
}
