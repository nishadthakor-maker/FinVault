'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Props = {
  salary:            number
  fixedTotal:        number   // rent + carFinance + fixedBills
  ccRepayments:      number
  savingsNet:        number   // gross out minus gross in
  monzoTransferNet:  number   // positive = net outflow, negative = net inflow
  familyTransferNet: number   // positive = net outflow, negative = net inflow
  directSpend:       number   // NatWest direct discretionary
  cashRemaining:     number
  ccCardSpend:       number   // actual CC spending (accounting view)
  accountingSurplus: number
}

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
}

function Row({
  label,
  amount,
  color,
  divider = false,
}: {
  label:    string
  amount:   number
  color:    string
  divider?: boolean
}) {
  return (
    <div
      className="flex justify-between items-baseline py-1"
      style={divider ? { borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '4px', paddingTop: '8px' } : undefined}
    >
      <span className="text-xs" style={{ color: '#8899aa' }}>{label}</span>
      <span className="text-xs font-semibold tabular-nums" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
        {amount >= 0 ? '+' : '−'}{gbp(amount)}
      </span>
    </div>
  )
}

export function SurplusBreakdown({
  salary, fixedTotal, ccRepayments, savingsNet,
  monzoTransferNet, familyTransferNet, directSpend,
  cashRemaining, ccCardSpend, accountingSurplus,
}: Props) {
  const [open, setOpen] = useState(false)

  const cashColor    = cashRemaining >= 0 ? '#00D4FF' : '#FF4488'
  const surplusColor = accountingSurplus >= 0 ? '#00FF94' : '#FF4488'

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs"
        style={{ color: '#4a5568' }}
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? 'Hide calculation' : 'How is this calculated?'}
      </button>

      {open && (
        <div
          className="mt-3 rounded-2xl p-4 space-y-4"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* ── Cash view ───────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: '#00D4FF', letterSpacing: '0.08em' }}>
              Cash view — what actually left NatWest
            </p>

            <Row label="Salary received"         amount={salary}        color="#00FF94" />
            <Row label="− Fixed bills"            amount={-fixedTotal}   color="#A78BFA" />
            {ccRepayments > 0 && (
              <Row label="− CC repayments"        amount={-ccRepayments} color="#FF4488" />
            )}
            {savingsNet !== 0 && (
              <Row
                label={savingsNet > 0 ? '− Savings transferred' : 'Savings returned'}
                amount={-savingsNet}
                color="#A78BFA"
              />
            )}
            {monzoTransferNet !== 0 && (
              <Row
                label={monzoTransferNet > 0 ? '− Monzo/other transfers' : 'Monzo/other transfers in'}
                amount={-monzoTransferNet}
                color={monzoTransferNet > 0 ? '#8899aa' : '#00FF94'}
              />
            )}
            {familyTransferNet !== 0 && (
              <Row
                label={familyTransferNet > 0 ? '− Family transfers' : 'Family transfers in'}
                amount={-familyTransferNet}
                color={familyTransferNet > 0 ? '#8899aa' : '#00FF94'}
              />
            )}
            {directSpend > 0 && (
              <Row label="− Direct spending"      amount={-directSpend}  color="#00D4FF" />
            )}
            <Row
              label="Cash remaining"
              amount={cashRemaining}
              color={cashColor}
              divider
            />
          </div>

          {/* ── Accounting view ─────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: '#00FF94', letterSpacing: '0.08em' }}>
              Accounting view — are you living within your means?
            </p>
            <p className="text-[10px] mb-2" style={{ color: '#4a5568' }}>
              Uses actual CC spend charged, not what was repaid this period.
            </p>

            <Row label="Salary"                   amount={salary}               color="#00FF94" />
            <Row label="− Fixed bills"            amount={-fixedTotal}          color="#A78BFA" />
            {ccCardSpend > 0 && (
              <Row label="− CC card spending"     amount={-ccCardSpend}         color="#00D4FF" />
            )}
            {directSpend > 0 && (
              <Row label="− Direct spending"      amount={-directSpend}         color="#00D4FF" />
            )}
            <Row
              label="Accounting surplus"
              amount={accountingSurplus}
              color={surplusColor}
              divider
            />
          </div>
        </div>
      )}
    </div>
  )
}
