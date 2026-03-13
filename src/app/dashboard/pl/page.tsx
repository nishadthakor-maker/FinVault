import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { TagPicker } from '@/components/TagPicker'
import { ExpandableGroup } from '@/components/ExpandableGroup'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getCurrentPayPeriod } from '@/lib/payPeriod'
import { getFinancialSummary } from '@/lib/financialSummary'
import type { LineItem } from '@/lib/financialSummary'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Tx = {
  id:            string
  date:          string
  description:   string
  merchant_name: string | null
  amount:        number
  type:          string
  category:      string | null
  tag:           string | null
  transfer_flag: boolean
}

// ─── Shared row components ────────────────────────────────────────────────────

function SectionHeader({ title, total, color }: { title: string; total: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>{title}</h3>
      <span className="text-sm font-semibold" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
        {total > 0 ? '+' : ''}{total < 0 ? '-' : ''}{gbp(total)}
      </span>
    </div>
  )
}

function TxRow({ tx, borderTop = true }: { tx: Tx; borderTop?: boolean }) {
  const amt      = tx.amount
  const isCredit = amt >= 0
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: borderTop ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.merchant_name || tx.description}</p>
        <p className="text-xs" style={{ color: '#4a5568' }}>{fmtDate(tx.date)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <TagPicker txId={tx.id} tag={tx.tag} category={tx.category} />
        <span
          className="text-sm font-semibold w-24 text-right"
          style={{ color: isCredit ? '#00FF94' : '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}
        >
          {isCredit ? '+' : '-'}{gbp(amt)}
        </span>
      </div>
    </div>
  )
}

function LineItemRow({
  item,
  color = '#f0f4f8',
  borderTop = true,
}: {
  item:      LineItem
  color?:    string
  borderTop?: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: borderTop ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.category && (
          <p className="text-xs" style={{ color: '#4a5568' }}>{item.category}</p>
        )}
      </div>
      <span
        className="text-sm font-semibold w-24 text-right shrink-0"
        style={{ color, fontFamily: 'var(--font-dm-mono)' }}
      >
        -{gbp(item.amount)}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PLPage() {
  const supabase = await createSupabaseServerClient()
  const period   = getCurrentPayPeriod()

  // Get summary + full transaction lists in parallel
  const { data: accts } = await supabase.from('accounts').select('id, name')
  const nwMainId   = accts?.find(a => a.name === 'NatWest Main')?.id
  const barcId     = accts?.find(a => a.name === 'Barclaycard Rewards')?.id
  const hsbcIds    = accts?.filter(a => a.name.includes('HSBC') && a.name.includes('Credit')).map(a => a.id) ?? []
  const tescoIds   = accts?.filter(a => a.name.includes('Tesco') && a.name.includes('Credit')).map(a => a.id) ?? []

  async function fetchTxRows(ids: (string | undefined)[]) {
    const valid = ids.filter((id): id is string => !!id)
    if (valid.length === 0) return []
    const { data } = await supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, transfer_flag')
      .in('account_id', valid)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date', { ascending: false })
    return (data ?? []).map(t => ({ ...t, amount: Number(t.amount) })) as Tx[]
  }

  const [summary, nwTxns, bcTxns] = await Promise.all([
    getFinancialSummary(supabase, period.start, period.end),
    fetchTxRows([nwMainId]),
    fetchTxRows([barcId, ...hsbcIds, ...tescoIds]),
  ])

  const {
    income, rent, carFinance, fixedBills,
    directDiscretionary, creditCardSpending,
    realExpenses, creditCardRepayments, savingsMovements, cashFlow, netPosition,
  } = summary

  // Classify NatWest rows for display
  const incomeTxns   = nwTxns.filter(t => t.tag === 'Income')
  const fixedTxns    = nwTxns.filter(t => t.tag === 'Fixed')
  const discretNWTxns = nwTxns.filter(t => t.tag === 'Discretionary')
  const transferTxns = nwTxns.filter(t => t.transfer_flag)

  // Discretionary grouped by category (NatWest + CC combined)
  type Group = { cat: string; rows: Tx[]; total: number }
  function groupByCategory(txs: Tx[]): Group[] {
    const map = new Map<string, Tx[]>()
    for (const t of txs) {
      const key = t.category ?? 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries())
      .map(([cat, rows]) => ({ cat, rows, total: rows.reduce((s, t) => s + Math.abs(t.amount), 0) }))
      .sort((a, b) => b.total - a.total)
  }

  const ccSpendTxns   = bcTxns.filter(t => !t.transfer_flag && t.amount < 0)
  const discretGroups = groupByCategory([...discretNWTxns, ...ccSpendTxns])

  const surplus = netPosition.surplusDeficit

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">P&amp;L</h1>
          <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
            Pay period:{' '}
            {new Date(period.start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' '}–{' '}
            {new Date(period.end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* ── Summary box ─────────────────────────────────────────────────────── */}
        <section
          className="mb-6 rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, #1a2535 0%, #1e2d42 100%)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8899aa' }}>Income</p>
              <p className="text-lg font-semibold" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                +{gbp(income.total)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8899aa' }}>Real Spend</p>
              <p className="text-lg font-semibold" style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
                -{gbp(realExpenses.total)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8899aa' }}>Net</p>
              <p
                className="text-lg font-semibold flex items-center gap-1"
                style={{ color: surplus >= 0 ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
              >
                {surplus >= 0
                  ? <TrendingUp size={16} />
                  : surplus < -100
                    ? <TrendingDown size={16} />
                    : <Minus size={16} />}
                {surplus >= 0 ? '+' : '-'}{gbp(surplus)}
              </p>
            </div>
          </div>

          {/* Breakdown bars */}
          <div className="space-y-2 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'Fixed (rent + bills + car)', value: rent.total + carFinance.total + fixedBills.total, pct: income.salary > 0 ? ((rent.total + carFinance.total + fixedBills.total) / income.salary) * 100 : 0, color: '#A78BFA' },
              { label: 'Discretionary',              value: directDiscretionary.total + creditCardSpending.grandTotal, pct: income.salary > 0 ? ((directDiscretionary.total + creditCardSpending.grandTotal) / income.salary) * 100 : 0, color: '#00D4FF' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: '#8899aa' }}>{row.label}</span>
                  <span style={{ color: row.color, fontFamily: 'var(--font-dm-mono)' }}>
                    {gbp(row.value)} ({row.pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e2a3a' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(row.pct, 100)}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── INCOME ──────────────────────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader title="Income" total={income.total} color="#00FF94" />
            {income.isBonus && (
              <p className="text-xs px-1" style={{ color: '#00FF94' }}>
                🎉 Bonus month! Normal ~{gbp(income.normalSalary)} · Bonus +{gbp(income.bonusAmount)}
              </p>
            )}
          </div>
          {incomeTxns.map((tx, i) => <TxRow key={tx.id} tx={tx} borderTop={i > 0} />)}
          {incomeTxns.length === 0 && (
            <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No income this period</p>
          )}
          <div className="pb-1" />
        </section>

        {/* ── REAL EXPENSES ────────────────────────────────────────────────────── */}

        {/* Rent */}
        {rent.total > 0 && (
          <section
            className="mb-4 rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            <div className="px-4 pt-4 pb-2">
              <SectionHeader title="Rent" total={-rent.total} color="#A78BFA" />
            </div>
            {fixedTxns.filter(t => t.category === 'Rent').map((tx, i) => (
              <TxRow key={tx.id} tx={tx} borderTop={i > 0} />
            ))}
            <div className="pb-1" />
          </section>
        )}

        {/* Car Finance */}
        {carFinance.total > 0 && (
          <section
            className="mb-4 rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
          >
            <div className="px-4 pt-4 pb-2">
              <SectionHeader title="Car Finance" total={-carFinance.total} color="#A78BFA" />
            </div>
            {fixedTxns.filter(t => t.category === 'Car Finance').map((tx, i) => (
              <TxRow key={tx.id} tx={tx} borderTop={i > 0} />
            ))}
            <div className="pb-1" />
          </section>
        )}

        {/* Fixed Bills */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader title="Fixed Bills" total={-fixedBills.total} color="#A78BFA" />
          </div>
          <div className="pb-1">
            {fixedBills.items.map((item, i) => (
              <LineItemRow key={item.name} item={item} color="#f0f4f8" borderTop={i > 0} />
            ))}
            {fixedBills.items.length === 0 && (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No fixed bills tagged</p>
            )}
          </div>
        </section>

        {/* Discretionary (NatWest + CC combined) */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader
              title="Discretionary"
              total={-(directDiscretionary.total + creditCardSpending.grandTotal)}
              color="#00D4FF"
            />
            {creditCardSpending.grandTotal > 0 && (
              <p className="text-xs px-1" style={{ color: '#4a5568' }}>
                NatWest direct: {gbp(directDiscretionary.total)} · CC: {gbp(creditCardSpending.grandTotal)}
              </p>
            )}
          </div>
          <div className="pb-2">
            {discretGroups.map((g, i) => (
              <div key={g.cat} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <ExpandableGroup
                  label={g.cat}
                  total={g.total}
                  transactions={g.rows.map(t => ({
                    id:          t.id,
                    date:        t.date,
                    description: t.merchant_name || t.description,
                    amount:      t.amount,
                    tag:         t.tag,
                    category:    t.category,
                  }))}
                />
              </div>
            ))}
            {discretGroups.length === 0 && (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No discretionary spend</p>
            )}
          </div>
        </section>

        {/* ── CASH FLOW FROM NATWEST ──────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>
                Cash Flow — NatWest
              </h3>
              <span className="text-xs" style={{ color: '#4a5568' }}>not counted in real spend</span>
            </div>
          </div>

          {/* CC Repayments */}
          {creditCardRepayments.items.length > 0 && (
            <div>
              <p className="px-4 pb-1 text-xs" style={{ color: '#4a5568' }}>CC repayments</p>
              {creditCardRepayments.items.map((item, i) => (
                <LineItemRow key={item.name + i} item={item} color="#4a5568" borderTop={i > 0} />
              ))}
            </div>
          )}

          {/* Savings */}
          <div style={{ borderTop: creditCardRepayments.items.length > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#4a5568' }}>savings moved out</p>
            {savingsMovements.grossOut > 0 ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Savings transfers</p>
                </div>
                <span className="text-sm font-semibold w-24 text-right" style={{ color: '#A78BFA', fontFamily: 'var(--font-dm-mono)' }}>
                  -{gbp(savingsMovements.grossOut)}
                </span>
              </div>
            ) : (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No savings transfers</p>
            )}
          </div>

          {/* Transfers row */}
          {transferTxns.filter(t => t.tag === 'Transfer' && !t.category && t.amount > 0).length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#4a5568' }}>other transfers</p>
              {transferTxns
                .filter(t => t.tag === 'Transfer' && !t.category && t.amount > 0)
                .map((tx, i) => <TxRow key={tx.id} tx={tx} borderTop={i > 0} />)}
            </div>
          )}

          {/* Remaining */}
          <div className="flex items-center gap-3 px-4 py-3 mx-3 my-2 rounded-xl" style={{ backgroundColor: '#0f1923' }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">NatWest remaining</p>
              <p className="text-xs" style={{ color: '#4a5568' }}>after all outflows</p>
            </div>
            <span
              className="text-sm font-bold w-24 text-right"
              style={{
                color: cashFlow.remaining >= 0 ? '#00D4FF' : '#FF4488',
                fontFamily: 'var(--font-dm-mono)',
              }}
            >
              {cashFlow.remaining >= 0 ? '+' : '-'}{gbp(cashFlow.remaining)}
            </span>
          </div>
          <div className="pb-1" />
        </section>

      </main>
      <BottomNav />
    </div>
  )
}
