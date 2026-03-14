'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { type FutureEventItem, type ScenarioConfig, eventMidpoint } from '@/lib/forecastProjection'

type MonthlyActual = { income: number; fixed: number; discretionary: number }

type Props = {
  events:         FutureEventItem[]
  config:         ScenarioConfig
  monthlyActuals: Record<string, MonthlyActual>   // keyed by 'YYYY-MM'
  showAsPercent:  boolean
  onTogglePercent: () => void
}

const MONTHS_2026 = [
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12',
]
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_MONTH = '2026-03'

function gbp(n: number) {
  return `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`
}

type MonthData = {
  yearMonth:  string
  shortLabel: string
  fullLabel:  string
  status:     'actual' | 'live' | 'projected'
  income:     number
  fixed:      number
  disc:       number
  eventCost:  number
  events:     FutureEventItem[]
  surplus:    number
}

const CAT_EMOJI: Record<string, string> = {
  Car: '🚗', Holiday: '✈️', Insurance: '🛡️', Kids: '👶',
  Home: '🏠', Medical: '🏥', Christmas: '🎄', Birthday: '🎂', Other: '📦',
}

export function AnnualBudget({ events, config, monthlyActuals, showAsPercent, onTogglePercent }: Props) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null)

  // Build month data for Jan-Dec 2026
  const monthData: MonthData[] = MONTHS_2026.map((ym, i) => {
    const isPast    = ym < CURRENT_MONTH
    const isCurrent = ym === CURRENT_MONTH
    const actual    = monthlyActuals[ym]

    let income: number, fixed: number, disc: number
    if ((isPast || isCurrent) && actual) {
      income = actual.income
      fixed  = actual.fixed
      disc   = actual.discretionary
    } else {
      income = config.salary
      fixed  = config.fixedBills
      disc   = config.ccSpend + config.directDiscretionary
    }

    const monthEvents = events.filter(e => e.event_date.startsWith(ym))
    const eventCost   = monthEvents.reduce((sum, e) => sum + eventMidpoint(e), 0)
    const surplus     = income - fixed - disc - eventCost

    return {
      yearMonth:  ym,
      shortLabel: MONTH_SHORT[i],
      fullLabel:  `${MONTH_SHORT[i]} 2026`,
      status:     isPast ? 'actual' : isCurrent ? 'live' : 'projected',
      income, fixed, disc, eventCost, events: monthEvents, surplus,
    }
  })

  const totalIncome  = monthData.reduce((s, m) => s + m.income,    0)
  const totalSpend   = monthData.reduce((s, m) => s + m.fixed + m.disc + m.eventCost, 0)
  const totalSurplus = totalIncome - totalSpend

  function pct(n: number) { return `${Math.round((n / config.salary) * 100)}%` }
  function fmt(n: number)  { return showAsPercent ? pct(n) : gbp(n) }

  // ── Yearly stacked bar chart ──────────────────────────────────────────────────

  const maxTotal = Math.max(...monthData.map(m => m.income), ...monthData.map(m => m.fixed + m.disc + m.eventCost))
  const PL = 36, PR = 12, PT = 12, PB = 28, W = 600, H = 160
  const CW = W - PL - PR, CH = H - PT - PB
  const barW = CW / 12
  const innerW = barW - 6

  function barH(v: number) { return (v / (maxTotal * 1.1)) * CH }
  function barY(v: number) { return PT + CH - barH(v) }
  const incomeY = PT + CH - barH(config.salary)

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#f0f4f8' }}>2026 Annual Overview</h3>
          <p className="text-xs mt-0.5" style={{ color: '#4a5568' }}>
            {gbp(totalIncome)} income · {gbp(totalSpend)} spend · <span style={{ color: totalSurplus >= 0 ? '#00FF94' : '#FF4488' }}>{totalSurplus >= 0 ? '+' : ''}{gbp(totalSurplus)} net</span>
          </p>
        </div>
        <button
          onClick={onTogglePercent}
          className="rounded-lg px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: showAsPercent ? 'rgba(0,212,255,0.12)' : 'transparent',
            color:           showAsPercent ? '#00D4FF' : '#4a5568',
            border:          `1px solid ${showAsPercent ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
          }}
        >
          % of salary
        </button>
      </div>

      {/* Stacked bar chart */}
      <div className="rounded-2xl p-3"
        style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', display: 'block' }}>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(f => {
            const v = config.salary * f
            const y = PT + CH - barH(v)
            return (
              <g key={f}>
                <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <text x={PL - 4} y={y + 4} textAnchor="end" fontSize="8" fill="#4a5568">
                  {showAsPercent ? `${Math.round(f * 100)}%` : `£${Math.round(v / 1000)}k`}
                </text>
              </g>
            )
          })}

          {/* Stacked bars */}
          {monthData.map((m, i) => {
            const x      = PL + i * barW + 3
            const fixedH = barH(m.fixed)
            const discH  = barH(m.disc)
            const evtH   = barH(m.eventCost)
            const totalH = fixedH + discH + evtH
            const isOver = m.fixed + m.disc + m.eventCost > m.income
            const yBase  = PT + CH

            return (
              <g key={m.yearMonth}>
                {/* Events (top) — orange */}
                {m.eventCost > 0 && (
                  <rect x={x} y={yBase - totalH} width={innerW} height={evtH} rx="1"
                    fill={isOver ? '#FF4488' : '#F59E0B'} opacity="0.9" />
                )}
                {/* Discretionary — cyan */}
                <rect x={x} y={yBase - fixedH - discH} width={innerW} height={discH} rx="0"
                  fill="#00D4FF" opacity="0.7" />
                {/* Fixed — purple */}
                <rect x={x} y={yBase - fixedH} width={innerW} height={fixedH} rx="0"
                  fill="#A78BFA" opacity="0.8" />

                {/* Month label */}
                <text x={x + innerW / 2} y={H - 4} textAnchor="middle" fontSize="8"
                  fill={m.status !== 'projected' ? '#8899aa' : '#4a5568'}
                  fontWeight={m.status === 'live' ? 'bold' : 'normal'}>
                  {m.shortLabel}
                </text>
                {m.status === 'actual' && (
                  <text x={x + innerW / 2} y={H - 14} textAnchor="middle" fontSize="6.5" fill="#4a5568">•</text>
                )}
              </g>
            )
          })}

          {/* Income line */}
          <line x1={PL} y1={incomeY} x2={W - PR} y2={incomeY}
            stroke="#00FF94" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
          <text x={W - PR - 2} y={incomeY - 3} textAnchor="end" fontSize="8" fill="#00FF94" opacity="0.8">
            income
          </text>

          {/* Legend */}
          <g>
            <rect x={PL} y={H - 10} width={8} height={6} fill="#A78BFA" opacity="0.8" />
            <text x={PL + 11} y={H - 4} fontSize="8" fill="#4a5568">Fixed</text>
            <rect x={PL + 45} y={H - 10} width={8} height={6} fill="#00D4FF" opacity="0.7" />
            <text x={PL + 56} y={H - 4} fontSize="8" fill="#4a5568">Discr.</text>
            <rect x={PL + 98} y={H - 10} width={8} height={6} fill="#F59E0B" opacity="0.9" />
            <text x={PL + 109} y={H - 4} fontSize="8" fill="#4a5568">Events</text>
          </g>
        </svg>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {monthData.map(m => {
          const isExpanded = expandedMonth === m.yearMonth
          const isOver     = m.surplus < 0
          const isTight    = m.surplus >= 0 && m.surplus < 500
          const surplusColor = isOver ? '#FF4488' : isTight ? '#F59E0B' : '#00FF94'
          const borderColor  = isOver ? 'rgba(255,68,136,0.25)' : isTight ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'

          return (
            <div key={m.yearMonth}>
              <button
                onClick={() => setExpandedMonth(isExpanded ? null : m.yearMonth)}
                className="w-full rounded-xl p-2.5 text-left transition-colors"
                style={{
                  backgroundColor: isExpanded ? 'rgba(0,212,255,0.06)' : '#1a2535',
                  border:          `1px solid ${isExpanded ? 'rgba(0,212,255,0.25)' : borderColor}`,
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#f0f4f8' }}>{m.shortLabel}</span>
                  {m.status !== 'projected' && (
                    <span className="text-[9px] font-medium px-1 rounded"
                      style={{ backgroundColor: m.status === 'live' ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.06)', color: m.status === 'live' ? '#00D4FF' : '#4a5568' }}>
                      {m.status === 'live' ? 'LIVE' : 'ACT'}
                    </span>
                  )}
                </div>

                {/* Events dots */}
                {m.events.length > 0 && (
                  <div className="flex gap-0.5 mb-1 flex-wrap">
                    {m.events.map(e => (
                      <span key={e.id} className="text-[11px]" title={e.name}>
                        {CAT_EMOJI[e.category ?? ''] ?? '📅'}
                      </span>
                    ))}
                  </div>
                )}

                {/* Surplus / deficit */}
                <p className="text-sm font-bold" style={{ color: surplusColor, fontFamily: 'var(--font-dm-mono)' }}>
                  {m.surplus >= 0 ? '+' : ''}{fmt(m.surplus)}
                </p>
                <p className="text-[10px]" style={{ color: '#4a5568' }}>
                  {isOver ? 'deficit' : isTight ? 'tight' : 'surplus'}
                </p>

                {isExpanded && <ChevronUp size={11} className="mt-1.5" style={{ color: '#4a5568' }} />}
                {!isExpanded && <ChevronDown size={11} className="mt-1.5" style={{ color: '#4a5568' }} />}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-1 rounded-xl p-3 space-y-1.5"
                  style={{ backgroundColor: '#0f1923', border: '1px solid rgba(0,212,255,0.15)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: '#00D4FF' }}>{m.fullLabel}</p>
                  {[
                    { label: 'Income',        val: m.income,    col: '#00FF94' },
                    { label: 'Fixed bills',   val: -m.fixed,    col: '#A78BFA' },
                    { label: 'Discretionary', val: -m.disc,     col: '#00D4FF' },
                    ...(m.eventCost > 0 ? [{ label: 'Life events', val: -m.eventCost, col: '#F59E0B' }] : []),
                    { label: 'Net',           val: m.surplus,   col: surplusColor },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between text-xs">
                      <span style={{ color: '#8899aa' }}>{row.label}</span>
                      <span style={{ color: row.col, fontFamily: 'var(--font-dm-mono)' }}>
                        {row.val >= 0 ? '+' : ''}{gbp(row.val)}
                      </span>
                    </div>
                  ))}
                  {m.events.length > 0 && (
                    <div className="pt-1.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      {m.events.map(e => (
                        <p key={e.id} className="text-[11px]" style={{ color: '#4a5568' }}>
                          {CAT_EMOJI[e.category ?? ''] ?? '📅'} {e.name}: {gbp(eventMidpoint(e))}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
