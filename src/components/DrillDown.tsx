'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

export type DrillDownTx = {
  id:       string
  date:     string
  merchant: string
  amount:   number
  category: string | null
}

type Props = {
  title:        string
  total:        number
  transactions: DrillDownTx[]
  onClose:      () => void
}

const CAT_COLORS: Record<string, string> = {
  Rent:          '#A78BFA',
  'Car Finance': '#A78BFA',
  Energy:        '#A78BFA',
  Broadband:     '#A78BFA',
  Mobile:        '#A78BFA',
  Insurance:     '#A78BFA',
  'TV & News':   '#A78BFA',
  Subscriptions: '#A78BFA',
  'Bank Charges':'#A78BFA',
  'Car Tax':     '#A78BFA',
  Fuel:          '#00D4FF',
  Groceries:     '#00D4FF',
  'Dining Out':  '#00D4FF',
  'Staff Shop':  '#00D4FF',
  Entertainment: '#00D4FF',
  Transport:     '#00D4FF',
  Parking:       '#00D4FF',
  'Personal Care':'#00D4FF',
  Holiday:       '#00D4FF',
  Gifts:         '#00D4FF',
  Medical:       '#00D4FF',
  Home:          '#00D4FF',
  Christmas:     '#00D4FF',
  Salary:        '#00FF94',
  Rewards:       '#00FF94',
}

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function DrillDown({ title, total, transactions, onClose }: Props) {
  // Lock scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isCredit = total >= 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Panel — full-width bottom sheet on mobile, centred card on md+ */}
      <div
        className="fixed z-50 bottom-0 left-0 right-0 md:inset-0 md:flex md:items-center md:justify-center md:p-6"
      >
        <div
          className="w-full md:max-w-md rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
          style={{
            backgroundColor: '#131929',
            border: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '80vh',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
                Breakdown
              </p>
              <p className="text-base font-semibold mt-0.5">{title}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-xl font-bold"
                style={{ color: isCredit ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
              >
                {isCredit ? '+' : '−'}{gbp(total)}
              </span>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
              >
                <X size={16} style={{ color: '#8899aa' }} />
              </button>
            </div>
          </div>

          {/* Transaction list */}
          <div className="overflow-y-auto flex-1">
            {transactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm" style={{ color: '#4a5568' }}>
                No transactions in this period
              </p>
            ) : (
              transactions
                .slice()
                .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
                .map((tx, i) => {
                  const catColor = CAT_COLORS[tx.category ?? ''] ?? '#8899aa'
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{tx.merchant}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: '#4a5568' }}>{fmtDate(tx.date)}</span>
                          {tx.category && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: `${catColor}18`, color: catColor }}
                            >
                              {tx.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-sm font-semibold shrink-0"
                        style={{
                          color: tx.amount >= 0 ? '#00FF94' : '#f0f4f8',
                          fontFamily: 'var(--font-dm-mono)',
                        }}
                      >
                        {tx.amount >= 0 ? '+' : '−'}{gbp(tx.amount)}
                      </span>
                    </div>
                  )
                })
            )}
          </div>

          {/* Count footer */}
          <div
            className="px-5 py-3 shrink-0 flex justify-between items-center"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-xs" style={{ color: '#4a5568' }}>
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={onClose}
              className="text-xs font-medium px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#8899aa' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
