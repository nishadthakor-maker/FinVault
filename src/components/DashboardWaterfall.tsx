'use client'

import { useState } from 'react'
import { DrillDown, type DrillDownTx } from '@/components/DrillDown'
import type { FinancialSummary } from '@/lib/financialSummary'

export type WaterfallTx = {
  id:            string
  date:          string
  merchant:      string
  amount:        number
  category:      string | null
  tag:           string | null
  transfer_flag: boolean
}

type Props = {
  summary:   FinancialSummary
  nwTxns:    WaterfallTx[]
  ccTxns:    WaterfallTx[]
  periodStr: string
}

function gbp0(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
}

function WaterfallBar({
  label,
  amount,
  color,
  pct,
  clickable,
  onClick,
}: {
  label:     string
  amount:    number
  color:     string
  pct:       number
  clickable: boolean
  onClick:   () => void
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 py-2 text-left rounded-lg px-1 -mx-1 transition-colors ${clickable ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className="w-28 shrink-0 flex items-center gap-1.5">
        <p className="text-xs" style={{ color: '#8899aa' }}>{label}</p>
        {clickable && (
          <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#4a5568' }}>↗</span>
        )}
      </div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-20 text-right text-sm font-semibold shrink-0"
        style={{ color, fontFamily: 'var(--font-dm-mono)' }}
      >
        -{gbp0(amount)}
      </span>
    </button>
  )
}

export function DashboardWaterfall({ summary, nwTxns, ccTxns, periodStr }: Props) {
  const [tab, setTab]           = useState<'spending' | 'cashflow'>('spending')
  const [drillLabel, setDrillLabel] = useState<string | null>(null)

  const { income, committedCosts, spendingView, cashFlowView, savings } = summary
  const baseForPct  = income.total || 1
  const ccSpendTotal = spendingView.totalSpending - spendingView.directFromNatwest.total

  // ── Spending View rows ─────────────────────────────────────────────────────
  const spendingRows: { label: string; amount: number; color: string; txns: WaterfallTx[] }[] = [
    {
      label:  'Committed',
      amount: committedCosts.total,
      color:  '#A78BFA',
      txns:   nwTxns.filter(t => t.tag === 'Fixed'),
    },
    {
      label:  'CC Spend',
      amount: ccSpendTotal,
      color:  '#00D4FF',
      txns:   ccTxns.filter(t => !t.transfer_flag && t.amount < 0),
    },
    {
      label:  'Direct',
      amount: spendingView.directFromNatwest.total,
      color:  '#00D4FF',
      txns:   nwTxns.filter(t => t.tag === 'Discretionary'),
    },
  ].filter(r => r.amount > 0)

  // ── Cash Flow rows ─────────────────────────────────────────────────────────
  const cashFlowRows: { label: string; amount: number; color: string; txns: WaterfallTx[] }[] = [
    {
      label:  'Committed',
      amount: committedCosts.total,
      color:  '#A78BFA',
      txns:   nwTxns.filter(t => t.tag === 'Fixed'),
    },
    {
      label:  'CC Repayments',
      amount: cashFlowView.ccRepayments.total,
      color:  '#FF4488',
      txns:   nwTxns.filter(t => t.transfer_flag && !t.category && t.amount < 0),
    },
    {
      label:  'Direct',
      amount: spendingView.directFromNatwest.total,
      color:  '#00D4FF',
      txns:   nwTxns.filter(t => t.tag === 'Discretionary'),
    },
    {
      label:  'Saved',
      amount: savings.net,
      color:  '#00FF94',
      txns:   nwTxns.filter(t => t.transfer_flag && t.category === 'Savings Transfer'),
    },
  ].filter(r => r.amount > 0)

  const rows      = tab === 'spending' ? spendingRows : cashFlowRows
  const remaining = tab === 'spending' ? spendingView.spendingSurplus : cashFlowView.cashRemaining
  const remainingColor = remaining >= 0 ? '#00D4FF' : '#FF4488'

  const active = rows.find(r => r.label === drillLabel)
  const activeTxns: DrillDownTx[] = (active?.txns ?? []).map(t => ({
    id:       t.id,
    date:     t.date,
    merchant: t.merchant,
    amount:   t.amount,
    category: t.category,
  }))

  return (
    <>
      <div
        className="rounded-2xl p-4 md:p-5"
        style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
      >
        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
          {(['spending', 'cashflow'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setDrillLabel(null) }}
              className="flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: tab === t ? '#1e2d42' : 'transparent',
                color: tab === t ? '#f0f4f8' : '#8899aa',
              }}
            >
              {t === 'spending' ? 'Spending View' : 'Cash Flow'}
            </button>
          ))}
        </div>

        {/* Income bar */}
        <div className="flex items-center gap-3 pb-3 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-28 shrink-0">
            <p className="text-xs font-medium" style={{ color: '#00FF94' }}>Salary In</p>
          </div>
          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#00FF9430' }}>
            <div className="h-full rounded-full w-full" style={{ backgroundColor: '#00FF94' }} />
          </div>
          <span className="w-20 text-right text-sm font-semibold shrink-0"
            style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
            +{gbp0(income.total)}
          </span>
        </div>

        {/* Outflow rows */}
        {rows.map(row => (
          <WaterfallBar
            key={row.label}
            label={row.label}
            amount={row.amount}
            color={row.color}
            pct={(row.amount / baseForPct) * 100}
            clickable={row.txns.length > 0}
            onClick={() => setDrillLabel(drillLabel === row.label ? null : row.label)}
          />
        ))}

        {/* Remaining / Surplus */}
        <div className="flex items-center gap-3 pt-3 mt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-28 shrink-0">
            <p className="text-xs font-medium" style={{ color: remainingColor }}>
              {tab === 'spending' ? 'Surplus' : 'Remaining'}
            </p>
          </div>
          <div className="flex-1" />
          <span className="w-20 text-right text-sm font-bold shrink-0"
            style={{ color: remainingColor, fontFamily: 'var(--font-dm-mono)' }}>
            {remaining >= 0 ? '+' : '−'}{gbp0(remaining)}
          </span>
        </div>
      </div>

      {/* DrillDown modal */}
      {drillLabel && active && (
        <DrillDown
          title={`${drillLabel} · ${periodStr}`}
          total={active.amount}
          transactions={activeTxns}
          onClose={() => setDrillLabel(null)}
        />
      )}
    </>
  )
}
