'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TagPicker } from '@/components/TagPicker'

type Tx = {
  id: string
  date: string
  description: string
  amount: number
  tag: string | null
  category: string | null
}

type Props = {
  label: string
  total: number
  transactions: Tx[]
  defaultOpen?: boolean
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function ExpandableGroup({ label, total, transactions, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-white/3"
        style={{ color: '#f0f4f8' }}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={14} style={{ color: '#8892a4' }} /> : <ChevronRight size={14} style={{ color: '#8892a4' }} />}
          <span className="font-medium">{label}</span>
          <span className="text-xs" style={{ color: '#4a5568' }}>({transactions.length})</span>
        </div>
        <span style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
          -{fmt(total)}
        </span>
      </button>

      {open && (
        <div className="ml-6 mb-1">
          {transactions.map((tx, i) => (
            <div
              key={tx.id}
              className="flex items-center justify-between py-2 px-3"
              style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a1a' }}
            >
              <div className="min-w-0 flex-1 mr-3">
                <p className="truncate text-xs font-medium" style={{ color: '#c0c8d4' }}>{tx.description}</p>
                <p className="text-[10px]" style={{ color: '#4a5568' }}>{fmtDate(tx.date)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <TagPicker txId={tx.id} tag={tx.tag} category={tx.category} />
                <span className="text-xs" style={{ color: '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}>
                  -{fmt(tx.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
