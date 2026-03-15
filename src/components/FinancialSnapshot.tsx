'use client'

import { useState } from 'react'
import type { FinancialSummary } from '@/lib/financialSummary'

function gbp0(n: number) {
  return '£' + Math.abs(Math.round(n)).toLocaleString('en-GB')
}

function p1(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
}

function fixedRating(r: number) {
  if (r < 38) return { icon: '✅', label: 'Excellent', color: '#00FF94' }
  if (r < 55) return { icon: '⚠️', label: 'Moderate',  color: '#F59E0B' }
  return        { icon: '🔴', label: 'Pressure',  color: '#FF4488' }
}

function bufferRating(mo: number) {
  if (mo >= 3) return { icon: '✅', label: `${mo.toFixed(1)} months`, color: '#00FF94' }
  if (mo >= 1) return { icon: '⚠️', label: `${mo.toFixed(1)} months`, color: '#F59E0B' }
  return        { icon: '🔴', label: `${mo.toFixed(1)} months`, color: '#FF4488' }
}

function savingsRating(r: number) {
  if (r >= 15) return { icon: '✅', label: 'Strong',   color: '#00FF94' }
  if (r >= 5)  return { icon: '⚠️', label: 'Moderate', color: '#F59E0B' }
  return        { icon: '🔴', label: 'Low',      color: '#FF4488' }
}

function debtRating(trend: string) {
  if (trend === 'paying_down')  return { icon: '✅', label: 'Paying down',   color: '#00FF94' }
  if (trend === 'neutral')      return { icon: '⚠️', label: 'Neutral',       color: '#F59E0B' }
  return                         { icon: '🔴', label: 'Accumulating', color: '#FF4488' }
}

export function FinancialSnapshot({
  summary,
  savingsBalance,
}: {
  summary: FinancialSummary
  savingsBalance: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  const { income, committedCosts, spendingView, cashFlowView, debtHealthIndicator, savings } = summary
  const inc = income.total || 1
  const ccSpend   = debtHealthIndicator.ccSpendingThisPeriod
  const ccRepay   = cashFlowView.ccRepayments.total
  const direct    = spendingView.directFromNatwest.total
  const savingsAmt = Math.max(0, savings.net)

  // ── Stacked bar ────────────────────────────────────────────────────────────
  // Cash-flow view: fixed + ccRepay + direct + savings = cash out; surplus = rest
  const rawSegs = [
    { label: 'Fixed',    amount: committedCosts.total, color: '#A78BFA' },
    { label: 'CC Spend', amount: ccSpend,              color: '#00D4FF' },
    { label: 'CC Repay', amount: ccRepay,              color: '#F59E0B' },
    { label: 'Direct',   amount: direct,               color: '#FF4488' },
    { label: 'Savings',  amount: savingsAmt,            color: '#00FF94' },
  ]
  const totalUsed = rawSegs.reduce((s, r) => s + r.amount, 0)
  const surplus   = Math.max(0, inc - totalUsed)
  const allSegs   = [...rawSegs, { label: 'Surplus', amount: surplus, color: 'rgba(255,255,255,0.12)' }]
  const barTotal  = Math.max(allSegs.reduce((s, r) => s + r.amount, 0), 1)
  const segs      = allSegs.map(s => ({ ...s, pct: (s.amount / barTotal) * 100 }))

  // ── Ratios ────────────────────────────────────────────────────────────────
  const fixedPct      = p1(committedCosts.total, inc)
  const committedPct  = p1(committedCosts.total + ccRepay, inc)
  const savRate       = income.salary > 0 ? p1(savings.net, income.salary) : 0
  const trueSurplus   = spendingView.spendingSurplus

  const fcR  = fixedRating(fixedPct)
  const savR = savingsRating(savRate)
  const drR  = debtRating(debtHealthIndicator.trend)
  const bufR = bufferRating(committedCosts.total > 0 ? savingsBalance / committedCosts.total : 0)

  const greenCount    = [bufR, savR, drR].filter(r => r.color === '#00FF94').length
  const overallHealth = greenCount >= 2
    ? { label: 'Strong',   color: '#00FF94' }
    : greenCount === 1
    ? { label: 'Moderate', color: '#F59E0B' }
    : { label: 'Low',      color: '#FF4488' }

  return (
    <section className="mb-8 rounded-2xl p-4 md:p-5 space-y-4"
      style={{ backgroundColor: '#131929', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 2px 16px rgba(0,0,0,0.4)' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8899aa', letterSpacing: '0.1em' }}>
          Financial Snapshot
        </h2>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: `${overallHealth.color}15`, color: overallHealth.color, border: `1px solid ${overallHealth.color}30` }}
        >
          {overallHealth.label}
        </span>
      </div>

      {/* Row 1: 4 metric tiles */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[
          {
            label: 'Monthly Income',
            value: gbp0(income.total),
            sub:   null,
            color: '#00FF94',
          },
          {
            label: 'Fixed Costs',
            value: gbp0(committedCosts.total),
            sub:   `${fixedPct}% of income`,
            color: fcR.color,
          },
          {
            label: 'CC Spending',
            value: gbp0(ccSpend),
            sub:   `${p1(ccSpend, inc)}% of income`,
            color: '#00D4FF',
          },
          {
            label: 'CC Repayments',
            value: gbp0(ccRepay),
            sub:   `${p1(ccRepay, inc)}% of income`,
            color: '#F59E0B',
          },
        ].map(tile => (
          <div
            key={tile.label}
            className="rounded-xl p-3"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
              {tile.label}
            </p>
            <p className="text-base font-bold leading-none md:text-lg" style={{ color: tile.color, fontFamily: 'var(--font-dm-mono)' }}>
              {tile.value}
            </p>
            {tile.sub && (
              <p className="mt-1 text-[11px]" style={{ color: tile.color, opacity: 0.7 }}>
                {tile.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Row 2: Stacked bar */}
      <div>
        <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
          Income Allocation
        </p>
        <div className="flex h-8 rounded-lg overflow-hidden w-full">
          {segs.map((seg, i) => (
            <div
              key={i}
              className="flex items-center justify-center overflow-hidden cursor-default transition-opacity"
              style={{
                width:           `${seg.pct}%`,
                backgroundColor: seg.color,
                opacity:         hovered === null || hovered === i ? 1 : 0.5,
                minWidth:        seg.pct > 0.5 ? 2 : 0,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(i)}
              onTouchEnd={() => setHovered(null)}
            >
              {seg.pct >= 8 && (
                <span
                  className="text-[9px] font-bold select-none"
                  style={{ color: seg.label === 'Surplus' ? 'rgba(255,255,255,0.4)' : '#0f1923' }}
                >
                  {Math.round(seg.pct)}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        <div className="h-4 mt-1">
          {hovered !== null && (
            <p className="text-[11px]" style={{ color: segs[hovered].color }}>
              {segs[hovered].label}: {p1(segs[hovered].amount, barTotal)}% — {gbp0(segs[hovered].amount)}
            </p>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {segs.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 text-[9px]" style={{ color: '#4a5568' }}>
              <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
              {seg.label}
            </span>
          ))}
        </div>
      </div>

      {/* Row 3: Key ratios */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Fixed Cost Ratio</p>
          <p className="text-lg font-bold" style={{ color: fcR.color, fontFamily: 'var(--font-dm-mono)' }}>{fixedPct}%</p>
          <p className="text-[10px] mt-0.5" style={{ color: fcR.color }}>{fcR.icon} {fcR.label}</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Total Committed</p>
          <p className="text-lg font-bold" style={{ color: committedPct > 65 ? '#FF4488' : '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}>{committedPct}%</p>
          <p className="text-[10px] mt-0.5" style={{ color: '#4a5568' }}>Fixed + CC repayments</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>Savings Rate</p>
          <p className="text-lg font-bold" style={{ color: savR.color, fontFamily: 'var(--font-dm-mono)' }}>{Math.max(0, savRate)}%</p>
          <p className="text-[10px] mt-0.5" style={{ color: '#4a5568' }}>Net savings / salary</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>True Surplus</p>
          <p className="text-lg font-bold" style={{ color: trueSurplus >= 0 ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
            {trueSurplus >= 0 ? '' : '−'}{gbp0(trueSurplus)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: '#4a5568' }}>After all spending</p>
        </div>
      </div>

      {/* Stability indicators */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Emergency Buffer', rating: bufR,  sub: `${committedCosts.total > 0 ? (savingsBalance / committedCosts.total).toFixed(1) : '—'} months` },
          { label: 'Savings Rate',     rating: savR,  sub: `${Math.max(0, savRate)}% of salary` },
          { label: 'CC Debt Trend',    rating: drR,   sub: `${debtHealthIndicator.netDebtChange >= 0 ? '+' : ''}${gbp0(debtHealthIndicator.netDebtChange)}` },
        ].map(ind => (
          <div
            key={ind.label}
            className="rounded-xl p-3"
            style={{ backgroundColor: '#1a2535', border: `1px solid ${ind.rating.color}22` }}
          >
            <p className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#4a5568', letterSpacing: '0.08em' }}>
              {ind.label}
            </p>
            <p className="text-sm font-bold leading-none" style={{ color: ind.rating.color }}>
              {ind.rating.icon}
            </p>
            <p className="mt-1 text-[11px] font-semibold" style={{ color: ind.rating.color }}>
              {ind.rating.label}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#4a5568', fontFamily: 'var(--font-dm-mono)' }}>
              {ind.sub}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
