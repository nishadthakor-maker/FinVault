import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { TagPicker } from '@/components/TagPicker'
import { ExpandableGroup } from '@/components/ExpandableGroup'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getCurrentPayPeriod } from '@/lib/payPeriod'

export const dynamic = 'force-dynamic'

function gbp(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Tx = {
  id: string
  date: string
  description: string
  merchant_name: string | null
  amount: number
  type: string
  category: string | null
  tag: string | null
  transfer_flag: boolean
}

// ─── Section components ────────────────────────────────────────────────────

function SectionHeader({ title, total, color }: { title: string; total: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8892a4' }}>{title}</h3>
      <span className="text-sm font-semibold" style={{ color, fontFamily: 'var(--font-dm-mono)' }}>
        {total > 0 ? '+' : ''}{total < 0 ? '-' : ''}{gbp(total)}
      </span>
    </div>
  )
}

function TxRow({ tx, borderTop = true }: { tx: Tx; borderTop?: boolean }) {
  const amt = tx.amount
  const isCredit = amt >= 0
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderTop: borderTop ? '1px solid #1e2a3a' : 'none' }}
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PLPage() {
  const supabase = await createSupabaseServerClient()
  const period   = getCurrentPayPeriod()

  // Get account IDs by name
  const { data: accts } = await supabase
    .from('accounts')
    .select('id, name')
    .in('name', ['NatWest Main', 'Barclaycard Rewards'])

  const natwestId     = accts?.find(a => a.name === 'NatWest Main')?.id
  const barclaycardId = accts?.find(a => a.name === 'Barclaycard Rewards')?.id

  // Fetch both accounts' transactions in parallel
  const [nwRes, bcRes] = await Promise.all([
    natwestId ? supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, transfer_flag')
      .eq('account_id', natwestId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date', { ascending: false }) : { data: [] },

    barclaycardId ? supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, transfer_flag')
      .eq('account_id', barclaycardId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date', { ascending: false }) : { data: [] },
  ])

  const nwTxns: Tx[] = (nwRes.data ?? []).map(t => ({ ...t, amount: Number(t.amount) }))
  const bcTxns: Tx[] = (bcRes.data ?? []).map(t => ({ ...t, amount: Number(t.amount) }))

  // ── NatWest buckets ────────────────────────────────────────────────────────
  const income       = nwTxns.filter(t => t.tag === 'Income')
  const fixed        = nwTxns.filter(t => t.tag === 'Fixed')
  const discretNW    = nwTxns.filter(t => t.tag === 'Discretionary')
  const transfers    = nwTxns.filter(t => t.tag === 'Transfer' || t.transfer_flag)

  // ── Barclaycard spend (exclude transfer credits = card payments) ────────────
  const bcSpend = bcTxns.filter(t => !t.transfer_flag && t.amount < 0)

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalIncome       = income.reduce((s, t) => s + t.amount, 0)
  const totalFixed        = fixed.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalDiscretNW    = discretNW.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalBcSpend      = bcSpend.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalDiscret      = totalDiscretNW + totalBcSpend
  const netSurplus        = totalIncome - totalFixed - totalDiscret

  // ── Group discretionary by category ───────────────────────────────────────
  function groupByCategory(txs: Tx[]) {
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

  const discretGroups = groupByCategory([...discretNW, ...bcSpend])

  // ── Group fixed by merchant ────────────────────────────────────────────────
  function groupByMerchant(txs: Tx[]) {
    const map = new Map<string, Tx[]>()
    for (const t of txs) {
      const key = t.merchant_name || t.description
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries())
      .map(([name, rows]) => ({ name, rows, total: rows.reduce((s, t) => s + Math.abs(t.amount), 0), category: rows[0].category }))
      .sort((a, b) => b.total - a.total)
  }

  const fixedGroups = groupByMerchant(fixed)

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">P&amp;L</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            Pay period:{' '}
            {new Date(period.start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' '}–{' '}
            {new Date(period.end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {/* ── Summary box ───────────────────────────────────────────────────── */}
        <section
          className="mb-6 rounded-2xl p-5"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Income</p>
              <p className="text-lg font-semibold" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                +{gbp(totalIncome)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Outgoings</p>
              <p className="text-lg font-semibold" style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
                -{gbp(totalFixed + totalDiscret)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Net</p>
              <p
                className="text-lg font-semibold flex items-center gap-1"
                style={{ color: netSurplus >= 0 ? '#00FF94' : '#FF4488', fontFamily: 'var(--font-dm-mono)' }}
              >
                {netSurplus >= 0
                  ? <TrendingUp size={16} />
                  : netSurplus < -100
                    ? <TrendingDown size={16} />
                    : <Minus size={16} />}
                {netSurplus >= 0 ? '+' : '-'}{gbp(netSurplus)}
              </p>
            </div>
          </div>

          {/* Bar breakdown */}
          <div className="space-y-2 pt-3" style={{ borderTop: '1px solid #1e2a3a' }}>
            {[
              { label: 'Fixed',         value: totalFixed,     pct: totalIncome > 0 ? (totalFixed / totalIncome) * 100 : 0,     color: '#A78BFA' },
              { label: 'Discretionary', value: totalDiscret,   pct: totalIncome > 0 ? (totalDiscret / totalIncome) * 100 : 0,   color: '#00D4FF' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{ color: '#8892a4' }}>{row.label}</span>
                  <span style={{ color: row.color, fontFamily: 'var(--font-dm-mono)' }}>
                    {gbp(row.value)} ({row.pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#1e2a3a' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(row.pct, 100)}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── INCOME ────────────────────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader title="Income" total={totalIncome} color="#00FF94" />
          </div>
          {income.map((tx, i) => <TxRow key={tx.id} tx={tx} borderTop={i > 0} />)}
          {income.length === 0 && (
            <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No income transactions tagged</p>
          )}
          <div className="pb-1" />
        </section>

        {/* ── FIXED COSTS ───────────────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader title="Fixed Costs" total={-totalFixed} color="#A78BFA" />
          </div>
          <div className="pb-1">
            {fixedGroups.map((g, i) => (
              <div
                key={g.name}
                className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid #1e2a3a' : 'none' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <p className="text-xs" style={{ color: '#4a5568' }}>{g.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TagPicker txId={g.rows[0].id} tag={g.rows[0].tag} category={g.rows[0].category} />
                  <span className="text-sm font-semibold w-24 text-right" style={{ color: '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}>
                    -{gbp(g.total)}
                  </span>
                </div>
              </div>
            ))}
            {fixedGroups.length === 0 && (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No fixed costs tagged</p>
            )}
          </div>
        </section>

        {/* ── DISCRETIONARY ─────────────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="px-4 pt-4 pb-2">
            <SectionHeader title="Discretionary" total={-totalDiscret} color="#00D4FF" />
          </div>
          <div className="pb-2">
            {discretGroups.map((g, i) => (
              <div key={g.cat} style={{ borderTop: i > 0 ? '1px solid #1e2a3a' : 'none' }}>
                <ExpandableGroup
                  label={g.cat}
                  total={g.total}
                  transactions={g.rows.map(t => ({
                    id: t.id,
                    date: t.date,
                    description: t.merchant_name || t.description,
                    amount: t.amount,
                    tag: t.tag,
                    category: t.category,
                  }))}
                />
              </div>
            ))}
            {discretGroups.length === 0 && (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No discretionary spend tagged</p>
            )}
          </div>
        </section>

        {/* ── CREDIT CARD SPENDING (Barclaycard) ────────────────────────────── */}
        {bcSpend.length > 0 && (
          <section
            className="mb-4 rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            <div className="px-4 pt-4 pb-2">
              <SectionHeader title="Credit Card Spending — Barclaycard" total={-totalBcSpend} color="#00D4FF" />
            </div>
            <div className="pb-1">
              {bcSpend.map((tx, i) => <TxRow key={tx.id} tx={tx} borderTop={i > 0} />)}
            </div>
          </section>
        )}

        {/* ── TRANSFERS ─────────────────────────────────────────────────────── */}
        <section
          className="mb-4 rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center justify-between px-1 mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8892a4' }}>
                Transfers (not counted in P&amp;L)
              </h3>
              <span className="text-xs" style={{ color: '#4a5568' }}>{transfers.length} rows</span>
            </div>
          </div>
          <div className="pb-1">
            {transfers.map((tx, i) => <TxRow key={tx.id} tx={tx} borderTop={i > 0} />)}
            {transfers.length === 0 && (
              <p className="px-4 pb-4 text-sm" style={{ color: '#4a5568' }}>No transfers</p>
            )}
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  )
}
