'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Sparkles, CalendarDays, TrendingDown, BarChart3 } from 'lucide-react'
import { addFutureEvent, updateFutureEvent, deleteFutureEvent } from '@/app/actions/futureEvents'
import { saveScenarioAssumptions } from '@/app/actions/scenarioAssumptions'
import { computeProjection, balanceColor, eventMidpoint, type FutureEventItem, type ScenarioConfig, type MonthPoint } from '@/lib/forecastProjection'
import { SinkingFunds } from './SinkingFunds'
import { AnnualBudget } from './AnnualBudget'
import { MonthlyImpact } from './MonthlyImpact'

type MonthlyActual = { income: number; fixed: number; discretionary: number }

// ─── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  events:         FutureEventItem[]
  totalBalance:   number
  configs:        Record<'A' | 'B' | 'C', ScenarioConfig>
  insights:       Record<'A' | 'B' | 'C', string | null>
  eventSpend:     Record<string, number>          // txn spend per event id
  monthlyActuals: Record<string, MonthlyActual>  // keyed 'YYYY-MM'
}

type FormState = {
  name:           string
  amountMin:      string
  amountMax:      string
  eventDate:      string   // 'YYYY-MM'
  category:       string
  recurrenceRule: string
  notes:          string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['Car','Holiday','Insurance','Kids','Home','Medical','Christmas','Birthday','Other']

const CAT_EMOJI: Record<string, string> = {
  Car: '🚗', Holiday: '✈️', Insurance: '🛡️', Kids: '👶',
  Home: '🏠', Medical: '🏥', Christmas: '🎄', Birthday: '🎂', Other: '📦',
}

const RECURRENCE_LABELS: Record<string, string> = {
  'one-off':       'One-off',
  'annual':        'Annual',
  'every-6-months':'Every 6 months',
  'custom':        'Custom',
}

const SCENARIO_META = {
  A: { label: 'Current Trajectory',    accentColor: '#FF4488', bg: 'rgba(255,68,136,0.06)',  border: 'rgba(255,68,136,0.18)'  },
  B: { label: 'Controlled Spending',   accentColor: '#F59E0B', bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.18)'  },
  C: { label: 'Optimised',             accentColor: '#00FF94', bg: 'rgba(0,255,148,0.06)',   border: 'rgba(0,255,148,0.18)'   },
}

const EMPTY_FORM: FormState = {
  name: '', amountMin: '', amountMax: '', eventDate: '', category: 'Car', recurrenceRule: 'one-off', notes: '',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function gbp(n: number) {
  return `£${Math.round(n).toLocaleString('en-GB')}`
}

function urgencyColor(eventDate: string): string {
  const today = new Date('2026-03-14')
  const date  = new Date(eventDate)
  const months = (date.getFullYear() - today.getFullYear()) * 12 + (date.getMonth() - today.getMonth())
  if (months < 3)  return '#FF4488'
  if (months < 6)  return '#F59E0B'
  return '#00FF94'
}

function fmtEventDate(d: string): string {
  const [y, m] = d.split('-')
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y}`
}

function toFormDate(isoDate: string): string {
  return isoDate.slice(0, 7)   // 'YYYY-MM-DD' → 'YYYY-MM'
}

// ─── Cash Flow Chart ───────────────────────────────────────────────────────────

function CashFlowChart({ points, displayMonths }: { points: MonthPoint[]; displayMonths: number }) {
  const visible = points.slice(0, displayMonths + 1)  // month 0 + N months
  const N = visible.length

  const PL = 60, PR = 20, PT = 24, PB = 44
  const W  = 600, H  = 220
  const CW = W - PL - PR
  const CH = H - PT - PB

  const balances  = visible.map(m => m.endBalance)
  const rawMin    = Math.min(...balances)
  const rawMax    = Math.max(...balances)
  const pad       = Math.max((rawMax - rawMin) * 0.15, 400)
  const yMin      = Math.floor((rawMin - pad) / 500) * 500
  const yMax      = Math.ceil((rawMax + pad) / 500) * 500
  const yRange    = yMax - yMin

  function getX(i: number) { return PL + (i / (N - 1)) * CW }
  function getY(v: number)  { return PT + (1 - (v - yMin) / yRange) * CH }

  // Y grid labels
  const ySteps = 5
  const yStep  = (yMax - yMin) / ySteps
  const gridYs = Array.from({ length: ySteps + 1 }, (_, i) => yMin + i * yStep)

  // Threshold reference lines
  const thresholds = [
    { value: 0,    color: 'rgba(255,68,136,0.25)',  label: '£0'     },
    { value: 500,  color: 'rgba(255,68,136,0.35)',  label: '£500'   },
    { value: 1500, color: 'rgba(245,158,11,0.35)',  label: '£1,500' },
  ]

  // Event annotations (months with events)
  const eventMonths = visible.filter((m, i) => i > 0 && m.events.length > 0)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 'auto', display: 'block' }}
    >
      {/* Grid lines */}
      {gridYs.map(v => {
        const y = getY(v)
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#4a5568">
              {v >= 1000 ? `£${(v/1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${v}`}
            </text>
          </g>
        )
      })}

      {/* Threshold reference lines */}
      {thresholds.map(t => {
        if (t.value < yMin || t.value > yMax) return null
        const y = getY(t.value)
        return (
          <g key={t.value}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke={t.color} strokeWidth="1" strokeDasharray="4 3" />
          </g>
        )
      })}

      {/* Colored line segments */}
      {visible.slice(1).map((m, i) => {
        const prev = visible[i]
        const x1 = getX(i), y1 = getY(prev.endBalance)
        const x2 = getX(i + 1), y2 = getY(m.endBalance)
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={balanceColor(m.endBalance)} strokeWidth="2.5" strokeLinecap="round" />
        )
      })}

      {/* Event dots */}
      {visible.map((m, i) => {
        if (i === 0 || m.events.length === 0) return null
        const x = getX(i), y = getY(m.endBalance)
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="5" fill="#1a2535" stroke={balanceColor(m.endBalance)} strokeWidth="2" />
            <circle cx={x} cy={y} r="2" fill={balanceColor(m.endBalance)} />
          </g>
        )
      })}

      {/* Start dot */}
      <circle cx={getX(0)} cy={getY(visible[0].endBalance)} r="4" fill="#00D4FF" />

      {/* X-axis labels */}
      {visible.map((m, i) => {
        const x       = getX(i)
        const label   = m.label.split(' ')[0]          // 'Apr'
        const hasEvent = i > 0 && m.events.length > 0
        return (
          <g key={i}>
            <text
              x={x} y={H - PB + 14}
              textAnchor="middle" fontSize="9"
              fill={hasEvent ? balanceColor(m.endBalance) : '#4a5568'}
              fontWeight={hasEvent ? 'bold' : 'normal'}
            >
              {label}
            </text>
            {hasEvent && (
              <text x={x} y={H - PB + 24} textAnchor="middle" fontSize="7.5" fill="#4a5568">
                {m.events.length === 1 ? m.events[0].name.split(' ')[0] : `${m.events.length} events`}
              </text>
            )}
          </g>
        )
      })}

      {/* Legend: threshold lines */}
      <g>
        <circle cx={PL + 4} cy={H - 6} r="3" fill="#FF4488" />
        <text x={PL + 10} y={H - 2} fontSize="8" fill="#4a5568">Danger &lt;£500</text>
        <circle cx={PL + 80} cy={H - 6} r="3" fill="#F59E0B" />
        <text x={PL + 86} y={H - 2} fontSize="8" fill="#4a5568">Caution &lt;£1,500</text>
        <circle cx={PL + 168} cy={H - 6} r="3" fill="#00FF94" />
        <text x={PL + 174} y={H - 2} fontSize="8" fill="#4a5568">Healthy</text>
      </g>
    </svg>
  )
}

// ─── Scenario Card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  config,
  defaultConfig,
  totalBalance,
  events,
  insight,
  baseStats,
}: {
  scenario:      'A' | 'B' | 'C'
  config:        ScenarioConfig
  defaultConfig: ScenarioConfig
  totalBalance:  number
  events:        FutureEventItem[]
  insight:       string | null
  baseStats:     ReturnType<typeof computeProjection>['stats'] | null   // Scenario A stats for diff
}) {
  const router = useRouter()
  const meta   = SCENARIO_META[scenario]

  const [showEdit, setShowEdit]     = useState(false)
  const [isPending, setIsPending]   = useState(false)
  const [form, setForm]             = useState({
    salary:              String(config.salary),
    fixedBills:          String(config.fixedBills),
    ccSpend:             String(config.ccSpend),
    directDiscretionary: String(config.directDiscretionary),
    extraSavings:        String(config.extraSavings),
  })

  // Keep form in sync if parent props change (after refresh)
  useEffect(() => {
    if (!showEdit) {
      setForm({
        salary:              String(config.salary),
        fixedBills:          String(config.fixedBills),
        ccSpend:             String(config.ccSpend),
        directDiscretionary: String(config.directDiscretionary),
        extraSavings:        String(config.extraSavings),
      })
    }
  }, [config, showEdit])

  const { stats } = useMemo(() => computeProjection(totalBalance, config, events), [totalBalance, config, events])

  const endDiff     = baseStats ? stats.endBalance - baseStats.endBalance : null
  const dangerDiff  = baseStats ? baseStats.dangerMonths - stats.dangerMonths : null

  async function handleSave() {
    setIsPending(true)
    try {
      await saveScenarioAssumptions({
        scenario,
        salary:              Number(form.salary),
        fixedBills:          Number(form.fixedBills),
        ccSpend:             Number(form.ccSpend),
        directDiscretionary: Number(form.directDiscretionary),
        extraSavings:        Number(form.extraSavings),
      })
      setShowEdit(false)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  function handleReset() {
    setForm({
      salary:              String(defaultConfig.salary),
      fixedBills:          String(defaultConfig.fixedBills),
      ccSpend:             String(defaultConfig.ccSpend),
      directDiscretionary: String(defaultConfig.directDiscretionary),
      extraSavings:        String(defaultConfig.extraSavings),
    })
  }

  const monthlySurplus = config.salary - config.fixedBills - config.ccSpend - config.directDiscretionary - config.extraSavings

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ backgroundColor: '#1a2535', border: `1px solid ${meta.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold rounded-md px-2 py-0.5"
            style={{ backgroundColor: meta.bg, color: meta.accentColor, border: `1px solid ${meta.border}` }}>
            {scenario}
          </span>
          <span className="text-sm font-semibold" style={{ color: '#f0f4f8' }}>{meta.label}</span>
        </div>
        <span className="text-xs font-mono"
          style={{ color: monthlySurplus >= 0 ? '#00FF94' : '#FF4488' }}>
          {monthlySurplus >= 0 ? '+' : ''}{gbp(monthlySurplus)}/mo
        </span>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>12-mo balance</p>
          <p className="text-lg font-bold" style={{ color: balanceColor(stats.endBalance), fontFamily: 'var(--font-dm-mono)' }}>
            {gbp(stats.endBalance)}
          </p>
          {endDiff !== null && (
            <p className="text-[10px] mt-0.5" style={{ color: endDiff >= 0 ? '#00FF94' : '#FF4488' }}>
              {endDiff >= 0 ? '+' : ''}{gbp(endDiff)} vs A
            </p>
          )}
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Saved</p>
          <p className="text-lg font-bold" style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-mono)' }}>
            {gbp(stats.totalSaved)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#4a5568' }}>over 12 months</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Danger months</p>
          <p className="text-lg font-bold" style={{ color: stats.dangerMonths > 0 ? '#FF4488' : '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
            {stats.dangerMonths}
          </p>
          {dangerDiff !== null && dangerDiff > 0 && (
            <p className="text-[10px] mt-0.5" style={{ color: '#00FF94' }}>
              -{dangerDiff} vs A
            </p>
          )}
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Worst month</p>
          <p className="text-sm font-bold truncate" style={{ color: balanceColor(stats.worstBalance), fontFamily: 'var(--font-dm-mono)' }}>
            {gbp(stats.worstBalance)}
          </p>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: '#4a5568' }}>{stats.worstMonth.label}</p>
        </div>
      </div>

      {/* AI insight */}
      {insight && (
        <div className="rounded-xl px-3 py-2.5 flex gap-2"
          style={{ backgroundColor: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
          <Sparkles size={13} className="shrink-0 mt-0.5" style={{ color: '#A78BFA' }} />
          <p className="text-xs leading-relaxed" style={{ color: '#c0c8d4' }}>{insight}</p>
        </div>
      )}

      {/* Edit assumptions toggle */}
      <button
        onClick={() => setShowEdit(v => !v)}
        className="flex items-center gap-1 text-xs font-medium self-start"
        style={{ color: '#4a5568' }}
      >
        {showEdit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Edit assumptions
      </button>

      {showEdit && (
        <div className="space-y-2 pt-1">
          {[
            { key: 'salary',              label: 'Monthly salary',       readOnly: false },
            { key: 'fixedBills',          label: 'Fixed bills/mo',       readOnly: scenario !== 'A' ? false : false },
            { key: 'ccSpend',             label: 'CC spend/mo',          readOnly: false },
            { key: 'directDiscretionary', label: 'Direct spend/mo',      readOnly: false },
            { key: 'extraSavings',        label: 'Extra savings/mo',     readOnly: false },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <label className="text-xs shrink-0" style={{ color: '#8899aa' }}>{label}</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#4a5568' }}>£</span>
                <input
                  type="number"
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-24 rounded-lg pl-6 pr-2 py-1 text-xs text-right outline-none"
                  style={{ backgroundColor: '#0f1923', border: '1px solid rgba(255,255,255,0.1)', color: '#f0f4f8' }}
                />
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleReset}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ color: '#4a5568', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              Reset defaults
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-40"
              style={{ backgroundColor: meta.accentColor, color: '#0f1923' }}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Event Card ────────────────────────────────────────────────────────────────

const COUNCIL_TAX_EMOJI = '🏛️'

function EventCard({
  event,
  spent,
  onEdit,
  onDelete,
}: {
  event:    FutureEventItem
  spent:    number
  onEdit:   (e: FutureEventItem) => void
  onDelete: (id: string) => void
}) {
  const [deleting,  setDeleting]  = useState(false)
  const [expanded,  setExpanded]  = useState(false)

  const isCouncilTax = event.category === 'Council Tax'
  const color    = urgencyColor(event.event_date)
  const emoji    = isCouncilTax ? COUNCIL_TAX_EMOJI : (CAT_EMOJI[event.category ?? ''] ?? '📦')
  const budget   = eventMidpoint(event)
  const hasRange = event.amount_min != null && event.amount_max != null && event.amount_min !== event.amount_max
  const spentPct  = Math.min(100, budget > 0 ? (spent / budget) * 100 : 0)
  const remaining = Math.max(0, budget - spent)

  // Parse monthly schedule from notes — entries like "Apr £188.99, May £187.00, ..."
  const scheduleItems: string[] = event.notes
    ? event.notes.split(',').map(s => s.trim()).filter(Boolean)
    : []

  async function handleDelete() {
    setDeleting(true)
    try { await onDelete(event.id) } finally { setDeleting(false) }
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}>

      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-lg shrink-0">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{event.name}</p>
            <span className="text-[10px] rounded px-1.5 py-0.5 font-medium"
              style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}>
              {RECURRENCE_LABELS[event.recurrence_rule ?? 'one-off'] ?? event.recurrence_rule}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: '#4a5568' }}>{fmtEventDate(event.event_date)}</span>
            <span className="text-xs font-semibold" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
              {hasRange ? `${gbp(event.amount_min!)}–${gbp(event.amount_max!)}` : gbp(budget)}
            </span>
            {isCouncilTax && (
              <span className="text-[10px]" style={{ color: '#4a5568' }}>10 monthly payments</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {scheduleItems.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: '#4a5568' }}
              title="Show payment schedule"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          <button onClick={() => onEdit(event)} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: '#4a5568' }}>
            <Pencil size={12} />
          </button>
          <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-40" style={{ color: '#FF4488' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Budget vs actuals */}
      {spent > 0 && (
        <div className="px-3 pb-2.5">
          <div className="flex justify-between text-[10px] mb-1">
            <span style={{ color: '#4a5568' }}>Budgeted {gbp(budget)} · Spent {gbp(spent)} · Remaining <span style={{ color: remaining > 0 ? '#00FF94' : '#FF4488' }}>{gbp(remaining)}</span></span>
            <span style={{ color: spentPct > 80 ? '#FF4488' : '#4a5568' }}>{Math.round(spentPct)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${spentPct}%`, backgroundColor: spentPct > 80 ? '#FF4488' : spentPct > 50 ? '#F59E0B' : '#00FF94' }} />
          </div>
        </div>
      )}

      {/* Expandable schedule */}
      {expanded && scheduleItems.length > 0 && (
        <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
            Payment schedule
          </p>
          <div className="flex flex-wrap gap-1.5">
            {scheduleItems.map((item, i) => {
              const isNoPayment = item.toLowerCase().includes('no payment')
              return (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-lg"
                  style={{
                    backgroundColor: isNoPayment ? 'rgba(255,255,255,0.03)' : 'rgba(0,212,255,0.06)',
                    color:           isNoPayment ? '#4a5568' : '#8899aa',
                    border:          `1px solid ${isNoPayment ? 'rgba(255,255,255,0.04)' : 'rgba(0,212,255,0.1)'}`,
                    fontFamily:      isNoPayment ? undefined : 'var(--font-dm-mono)',
                  }}
                >
                  {item}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Event Form ────────────────────────────────────────────────────────────────

function EventForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: FutureEventItem | null
  onSave:   (form: FormState) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm]       = useState<FormState>(() => {
    if (initial) {
      return {
        name:           initial.name,
        amountMin:      String(initial.amount_min ?? initial.amount),
        amountMax:      String(initial.amount_max ?? initial.amount),
        eventDate:      toFormDate(initial.event_date),
        category:       initial.category ?? 'Car',
        recurrenceRule: initial.recurrence_rule ?? 'one-off',
        notes:          initial.notes ?? '',
      }
    }
    return EMPTY_FORM
  })
  const [isPending, setIsPending] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  function f(k: keyof FormState, v: string) { setForm(s => ({ ...s, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.amountMin || !form.amountMax || !form.eventDate) {
      setError('Name, amount range, and date are required.')
      return
    }
    setError(null)
    setIsPending(true)
    try { await onSave(form) } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally { setIsPending(false) }
  }

  const inputStyle = {
    backgroundColor: '#0f1923',
    border:          '1px solid rgba(255,255,255,0.1)',
    color:           '#f0f4f8',
    borderRadius:    '10px',
    padding:         '6px 10px',
    fontSize:        '13px',
    width:           '100%',
    outline:         'none',
  }
  const labelStyle = { color: '#8899aa', fontSize: '11px', fontWeight: 500 as const }

  return (
    <form onSubmit={handleSubmit}
      className="rounded-2xl p-4 space-y-3"
      style={{ backgroundColor: '#1a2535', border: '1px solid rgba(0,212,255,0.2)' }}>

      <p className="text-sm font-semibold" style={{ color: '#f0f4f8' }}>
        {initial ? 'Edit event' : 'Add planned expense'}
      </p>

      {/* Name */}
      <div>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Summer Holiday" />
      </div>

      {/* Amount range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label style={labelStyle}>Min (£)</label>
          <input type="number" min="0" style={inputStyle} value={form.amountMin} onChange={e => f('amountMin', e.target.value)} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Max (£)</label>
          <input type="number" min="0" style={inputStyle} value={form.amountMax} onChange={e => f('amountMax', e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* Date + Category */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label style={labelStyle}>Month</label>
          <input type="month" style={inputStyle} value={form.eventDate} onChange={e => f('eventDate', e.target.value)} min="2026-03" />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={form.category} onChange={e => f('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
          </select>
        </div>
      </div>

      {/* Recurrence */}
      <div>
        <label style={labelStyle}>Recurrence</label>
        <select style={inputStyle} value={form.recurrenceRule} onChange={e => f('recurrenceRule', e.target.value)}>
          {Object.entries(RECURRENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea rows={2} style={{ ...inputStyle, resize: 'none' }} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Any extra details…" />
      </div>

      {error && <p className="text-xs" style={{ color: '#FF4488' }}>{error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#4a5568' }}>
          Cancel
        </button>
        <button type="submit" disabled={isPending}
          className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: '#00D4FF', color: '#0f1923' }}>
          {isPending ? 'Saving…' : initial ? 'Update event' : 'Add event'}
        </button>
      </div>
    </form>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ForecastClient({ events: initialEvents, totalBalance, configs, insights, eventSpend, monthlyActuals }: Props) {
  const router = useRouter()

  // Sync events from server props
  const [events, setEvents] = useState<FutureEventItem[]>(initialEvents)
  useEffect(() => { setEvents(initialEvents) }, [initialEvents])

  const [showAsPercent, setShowAsPercent] = useState(false)

  // UI state
  const [showForm,      setShowForm]      = useState(false)
  const [editingEvent,  setEditingEvent]  = useState<FutureEventItem | null>(null)
  const [displayMonths, setDisplayMonths] = useState<6 | 12>(12)

  // Projection for main chart (uses Scenario A assumptions = current trajectory)
  const { points: chartPoints } = useMemo(
    () => computeProjection(totalBalance, configs.A, events),
    [totalBalance, configs.A, events],
  )

  // Scenario A stats for diff comparison
  const { stats: statsA } = useMemo(
    () => computeProjection(totalBalance, configs.A, events),
    [totalBalance, configs.A, events],
  )

  async function handleAddEvent(form: FormState) {
    await addFutureEvent({
      name:           form.name,
      amountMin:      Number(form.amountMin),
      amountMax:      Number(form.amountMax),
      eventDate:      form.eventDate,
      category:       form.category,
      recurrenceRule: form.recurrenceRule,
      notes:          form.notes,
    })
    setShowForm(false)
    router.refresh()
  }

  async function handleUpdateEvent(form: FormState) {
    if (!editingEvent) return
    await updateFutureEvent(editingEvent.id, {
      name:           form.name,
      amountMin:      Number(form.amountMin),
      amountMax:      Number(form.amountMax),
      eventDate:      form.eventDate,
      category:       form.category,
      recurrenceRule: form.recurrenceRule,
      notes:          form.notes,
    })
    setEditingEvent(null)
    router.refresh()
  }

  async function handleDeleteEvent(id: string) {
    await deleteFutureEvent(id)
    setEvents(ev => ev.filter(e => e.id !== id))
    router.refresh()
  }

  const totalEventCost = events.reduce((sum, e) => sum + eventMidpoint(e), 0)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-8 md:px-8 space-y-10">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">Forecast</h1>
        <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
          Future planning · 12-month cash flow · scenario modelling
        </p>
      </div>

      {/* ══ SECTION 1: FUTURE EVENTS PLANNER ══════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} style={{ color: '#A78BFA' }} />
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#A78BFA', letterSpacing: '0.08em' }}>
              Planned Expenses
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {totalEventCost > 0 && (
              <span className="text-xs" style={{ color: '#8899aa' }}>
                Total: <span style={{ color: '#F59E0B', fontFamily: 'var(--font-dm-mono)' }}>{gbp(totalEventCost)}</span>
              </span>
            )}
            {!showForm && !editingEvent && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: 'rgba(0,212,255,0.1)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)' }}
              >
                <Plus size={12} /> Add Event
              </button>
            )}
          </div>
        </div>

        {/* Add form */}
        {showForm && !editingEvent && (
          <EventForm
            onSave={handleAddEvent}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Events list */}
        {events.length === 0 && !showForm ? (
          <div className="rounded-2xl py-10 text-center"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm" style={{ color: '#4a5568' }}>No planned expenses yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-2 text-sm" style={{ color: '#00D4FF' }}>
              + Add your first event
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(event => (
              editingEvent?.id === event.id ? (
                <EventForm
                  key={event.id}
                  initial={editingEvent}
                  onSave={handleUpdateEvent}
                  onCancel={() => setEditingEvent(null)}
                />
              ) : (
                <EventCard
                  key={event.id}
                  event={event}
                  spent={eventSpend[event.id] ?? 0}
                  onEdit={setEditingEvent}
                  onDelete={handleDeleteEvent}
                />
              )
            ))}
          </div>
        )}
      </section>

      {/* ══ SECTION 1b: SINKING FUNDS ═════════════════════════════════════════ */}
      <SinkingFunds events={events} salary={configs.A.salary} />

      {/* ══ SECTION 2: 12-MONTH CASH FLOW TIMELINE ════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} style={{ color: '#00D4FF' }} />
            <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#00D4FF', letterSpacing: '0.08em' }}>
              12-Month Cash Flow
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {([6, 12] as const).map(n => (
              <button
                key={n}
                onClick={() => setDisplayMonths(n)}
                className="rounded-lg px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: displayMonths === n ? 'rgba(0,212,255,0.12)' : 'transparent',
                  color:           displayMonths === n ? '#00D4FF' : '#4a5568',
                  border:          `1px solid ${displayMonths === n ? 'rgba(0,212,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {n}m
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-4"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>

          {/* Starting balance callout */}
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <p className="text-xs" style={{ color: '#8899aa' }}>
              Starting balance:&nbsp;
              <span style={{ color: '#f0f4f8', fontFamily: 'var(--font-dm-mono)', fontWeight: 600 }}>
                {gbp(totalBalance)}
              </span>
            </p>
            <p className="text-xs" style={{ color: '#8899aa' }}>
              Monthly surplus:&nbsp;
              <span style={{
                color: (configs.A.salary - configs.A.fixedBills - configs.A.ccSpend - configs.A.directDiscretionary) >= 0
                  ? '#00FF94' : '#FF4488',
                fontFamily: 'var(--font-dm-mono)', fontWeight: 600,
              }}>
                {gbp(configs.A.salary - configs.A.fixedBills - configs.A.ccSpend - configs.A.directDiscretionary)}/mo
              </span>
            </p>
          </div>

          <CashFlowChart points={chartPoints} displayMonths={displayMonths} />
        </div>
      </section>

      {/* ══ SECTION 3: SCENARIO MODELLING ══════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: '#A78BFA' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#A78BFA', letterSpacing: '0.08em' }}>
            Scenario Modelling
          </h2>
        </div>

        <p className="text-xs" style={{ color: '#4a5568' }}>
          Three 12-month projections with different spending assumptions. Edit any scenario to model your own plan.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['A', 'B', 'C'] as const).map(s => (
            <ScenarioCard
              key={s}
              scenario={s}
              config={configs[s]}
              defaultConfig={{ salary: 3494, fixedBills: 1338, ccSpend: s === 'A' ? 143 : s === 'B' ? 107 : 72, directDiscretionary: s === 'A' ? 419 : s === 'B' ? 356 : 314, extraSavings: s === 'A' ? 0 : s === 'B' ? 200 : 400 }}
              totalBalance={totalBalance}
              events={events}
              insight={insights[s]}
              baseStats={s === 'A' ? null : statsA}
            />
          ))}
        </div>
      </section>

      {/* ══ SECTION 4: ANNUAL BUDGET VIEW + YEARLY CHART ═══════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} style={{ color: '#F59E0B' }} />
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#F59E0B', letterSpacing: '0.08em' }}>
            Annual Budget View
          </h2>
        </div>
        <div className="rounded-2xl p-4"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}>
          <AnnualBudget
            events={events}
            config={configs.A}
            monthlyActuals={monthlyActuals}
            showAsPercent={showAsPercent}
            onTogglePercent={() => setShowAsPercent(v => !v)}
          />
        </div>
      </section>

      {/* ══ SECTION 5: MONTHLY FORECAST IMPACT ════════════════════════════════ */}
      <MonthlyImpact
        events={events}
        config={configs.A}
        monthlyActuals={monthlyActuals}
      />

    </main>
  )
}
