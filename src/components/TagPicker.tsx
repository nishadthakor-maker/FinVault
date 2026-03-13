'use client'

import { useTransition, useState, useRef, useEffect } from 'react'
import { updateTransactionTag } from '@/app/actions/updateTag'
import { ChevronDown } from 'lucide-react'

type Option = { tag: string; category: string; label: string }

const OPTIONS: Option[] = [
  { tag: 'Income',        category: 'Salary',          label: '💼 Salary' },
  { tag: 'Income',        category: 'Business Income', label: '📈 Business Income' },
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

type Props = {
  txId: string
  tag: string | null
  category: string | null
}

export function TagPicker({ txId, tag: initialTag, category: initialCategory }: Props) {
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState(initialTag)
  const [category, setCategory] = useState(initialCategory)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(opt: Option) {
    setTag(opt.tag)
    setCategory(opt.category)
    setOpen(false)
    startTransition(() => updateTransactionTag(txId, opt.tag, opt.category))
  }

  const colour = tag ? TAG_COLOURS[tag] ?? '#4a5568' : '#4a5568'
  const label = tag && category ? `${tag} · ${category}` : tag ?? 'Untagged'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium transition-opacity"
        style={{
          backgroundColor: `${colour}18`,
          color: colour,
          border: `1px solid ${colour}30`,
          opacity: isPending ? 0.5 : 1,
        }}
      >
        {isPending ? '…' : label}
        <ChevronDown size={10} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-48 rounded-xl overflow-hidden py-1 shadow-2xl"
          style={{ backgroundColor: '#1a2535', border: '1px solid #2a3a4a' }}
        >
          {OPTIONS.map(opt => {
            const active = opt.tag === tag && opt.category === category
            return (
              <button
                key={`${opt.tag}-${opt.category}`}
                onClick={() => select(opt)}
                className="w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                style={{ color: active ? TAG_COLOURS[opt.tag] : '#8892a4' }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
