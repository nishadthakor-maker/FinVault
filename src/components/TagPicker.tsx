'use client'

import { useTransition, useState, useRef, useEffect } from 'react'
import { updateTransactionTag, linkTransactionToEvent } from '@/app/actions/updateTag'
import { ChevronDown, Link2, Link2Off } from 'lucide-react'

type Option = { tag: string; category: string; label: string }

export const OPTIONS: Option[] = [
  { tag: 'Income',        category: 'Salary',          label: '💼 Salary' },
  { tag: 'Income',        category: 'Business Income', label: '📈 Business Income' },
  { tag: 'Income',        category: 'Rewards',         label: '🎁 Rewards' },
  { tag: 'Income',        category: 'Family',          label: '👨‍👩‍👧 Family Income' },
  { tag: 'Fixed',         category: 'Rent',            label: '🏠 Rent' },
  { tag: 'Fixed',         category: 'Council Tax',     label: '🏛️ Council Tax' },
  { tag: 'Fixed',         category: 'Energy',          label: '⚡ Energy' },
  { tag: 'Fixed',         category: 'Broadband',       label: '📡 Broadband' },
  { tag: 'Fixed',         category: 'Mobile',          label: '📱 Mobile' },
  { tag: 'Fixed',         category: 'Insurance',       label: '🛡️ Insurance' },
  { tag: 'Fixed',         category: 'Car Finance',     label: '🚗 Car Finance' },
  { tag: 'Fixed',         category: 'TV & News',       label: '📺 TV & News' },
  { tag: 'Discretionary', category: 'Groceries',       label: '🛒 Groceries' },
  { tag: 'Discretionary', category: 'Fuel',            label: '⛽ Fuel' },
  { tag: 'Discretionary', category: 'Parking',         label: '🅿️ Parking' },
  { tag: 'Discretionary', category: 'Entertainment',   label: '🎵 Entertainment' },
  { tag: 'Discretionary', category: 'Dining Out',      label: '🍽️ Dining Out' },
  { tag: 'Discretionary', category: 'Personal Care',   label: '💇 Personal Care' },
  { tag: 'Discretionary', category: 'Transport',       label: '🚂 Transport' },
  { tag: 'Discretionary', category: 'Staff Shop',      label: '🏪 Staff Shop' },
  { tag: 'Discretionary', category: 'Holiday',         label: '🏖️ Holiday' },
  { tag: 'Discretionary', category: 'Christmas',       label: '🎄 Christmas' },
  { tag: 'Discretionary', category: 'Gifts',           label: '🎁 Gifts' },
  { tag: 'Discretionary', category: 'Kids Birthday',   label: '🎂 Kids Birthday' },
  { tag: 'Discretionary', category: 'Education',       label: '🎓 Education' },
  { tag: 'Discretionary', category: 'Family Events',   label: '💒 Family Events' },
  { tag: 'Discretionary', category: 'Medical',         label: '🏥 Medical' },
  { tag: 'Discretionary', category: 'Home',            label: '🏠 Home' },
  { tag: 'Discretionary', category: 'Family',          label: '👨‍👩‍👧 Family' },
  { tag: 'Discretionary', category: 'Other',           label: '📦 Other' },
  { tag: 'Transfer',      category: 'Transfer',        label: '↔️ Transfer' },
]

const TAG_COLOURS: Record<string, string> = {
  Income:        '#00FF94',
  Fixed:         '#A78BFA',
  Discretionary: '#00D4FF',
  Transfer:      '#4a5568',
}

type EventOption = { id: string; name: string; category: string | null; event_date: string }

type Props = {
  txId:     string
  tag:      string | null
  category: string | null
  eventId?: string | null
  events?:  EventOption[]
}

const CAT_EMOJI: Record<string, string> = {
  Car: '🚗', Holiday: '✈️', Insurance: '🛡️', Kids: '👶',
  Home: '🏠', Medical: '🏥', Christmas: '🎄', Birthday: '🎂', Other: '📦',
}

function eventEmoji(cat: string | null) {
  return CAT_EMOJI[cat ?? ''] ?? '📅'
}

function fmtEventMonth(d: string) {
  const [y, m] = d.split('-')
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y}`
}

export function TagPicker({ txId, tag: initialTag, category: initialCategory, eventId: initialEventId, events }: Props) {
  const [open, setOpen]              = useState(false)
  const [tag, setTag]                = useState(initialTag)
  const [category, setCategory]      = useState(initialCategory)
  const [eventId, setEventId]        = useState(initialEventId ?? null)
  const [isPending, startTransition] = useTransition()
  const [rect, setRect]              = useState<DOMRect | null>(null)

  const triggerRef  = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ── Track trigger position while open ─────────────────────────────────────
  useEffect(() => {
    if (!open || !triggerRef.current) return
    function update() {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect())
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(triggerRef.current)
    document.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); document.removeEventListener('scroll', update, true); window.removeEventListener('resize', update) }
  }, [open])

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !dropdownRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function select(opt: Option) {
    setTag(opt.tag)
    setCategory(opt.category)
    setOpen(false)
    startTransition(() => updateTransactionTag(txId, opt.tag, opt.category))
  }

  function selectEvent(id: string | null) {
    setEventId(id)
    setOpen(false)
    startTransition(() => linkTransactionToEvent(txId, id))
  }

  const linkedEvent = events?.find(e => e.id === eventId)
  const colour = tag ? TAG_COLOURS[tag] ?? '#4a5568' : '#4a5568'
  const label  = tag && category ? `${tag} · ${category}` : tag ?? 'Untagged'

  const openUp = rect ? (window.innerHeight - rect.bottom) < 340 : false
  const dropdownStyle: React.CSSProperties | undefined = rect
    ? {
        position:        'fixed',
        top:             openUp ? undefined : rect.bottom + 4,
        bottom:          openUp ? (window.innerHeight - rect.top + 4) : undefined,
        left:            Math.max(4, rect.right - 216),
        width:           216,
        maxHeight:       openUp
                           ? Math.min(340, rect.top - 8)
                           : Math.min(340, window.innerHeight - rect.bottom - 8),
        zIndex:          9999,
        backgroundColor: '#1a2535',
        border:          '1px solid #2a3a4a',
        borderRadius:    '12px',
        overflowY:       'auto',
        overflowX:       'hidden',
        padding:         '4px 0',
        boxShadow:       '0 8px 32px rgba(0,0,0,0.6)',
      }
    : undefined

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-opacity"
        style={{
          backgroundColor: `${colour}18`,
          color:           colour,
          border:          `1px solid ${colour}30`,
          opacity:         isPending ? 0.5 : 1,
        }}
      >
        {isPending ? '…' : label}
        {linkedEvent && <Link2 size={8} style={{ opacity: 0.7 }} />}
        <ChevronDown size={10} />
      </button>

      {open && rect && (
        <div ref={dropdownRef} style={dropdownStyle}>
          {/* ── Tag / category options ──────────────────────────────────── */}
          {OPTIONS.map(opt => {
            const active = opt.tag === tag && opt.category === category
            return (
              <button
                key={`${opt.tag}-${opt.category}`}
                onClick={() => select(opt)}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                style={{ color: active ? TAG_COLOURS[opt.tag] : '#8899aa' }}
              >
                {opt.label}
              </button>
            )
          })}

          {/* ── Event linking section ───────────────────────────────────── */}
          {events && events.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
              <p className="px-3 py-1 text-[9px] font-semibold uppercase tracking-widest"
                style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
                Link to event
              </p>
              {events.map(ev => {
                const active = ev.id === eventId
                return (
                  <button
                    key={ev.id}
                    onClick={() => selectEvent(ev.id)}
                    className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 flex items-center gap-2"
                    style={{ color: active ? '#00D4FF' : '#8899aa' }}
                  >
                    <span>{eventEmoji(ev.category)}</span>
                    <span className="flex-1 truncate">{ev.name}</span>
                    <span style={{ color: '#4a5568', fontSize: '10px' }}>{fmtEventMonth(ev.event_date)}</span>
                  </button>
                )
              })}
              {eventId && (
                <button
                  onClick={() => selectEvent(null)}
                  className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5 flex items-center gap-1.5"
                  style={{ color: '#FF4488' }}
                >
                  <Link2Off size={11} /> Remove link
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
