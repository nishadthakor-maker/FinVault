'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronLeft, ChevronRight, Eye, EyeOff, CheckSquare, Square } from 'lucide-react'
import { TagPicker } from '@/components/TagPicker'
import { getCurrentPayPeriod, getLast4PayPeriods } from '@/lib/payPeriod'
import { bulkUpdateTag } from '@/app/actions/bulkUpdateTag'

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  account_id:    string
  event_id:      string | null
}

type Account = { id: string; name: string }
type FutureEventOption = { id: string; name: string; category: string | null; event_date: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

const TAG_COLORS: Record<string, string> = {
  Income:        '#00FF94',
  Fixed:         '#A78BFA',
  Discretionary: '#00D4FF',
  Transfer:      '#4a5568',
}

// Matches TagPicker OPTIONS — used for bulk action
const BULK_OPTIONS = [
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
  { tag: 'Discretionary', category: 'Family',          label: '👨‍👩‍👧 Family' },
  { tag: 'Discretionary', category: 'Staff Shop',       label: '🏪 Staff Shop' },
  { tag: 'Discretionary', category: 'Holiday',         label: '🏖️ Holiday' },
  { tag: 'Discretionary', category: 'Christmas',       label: '🎄 Christmas' },
  { tag: 'Discretionary', category: 'Gifts',           label: '🎁 Gifts' },
  { tag: 'Discretionary', category: 'Kids Birthday',   label: '🎂 Kids Birthday' },
  { tag: 'Discretionary', category: 'Education',       label: '🎓 Education' },
  { tag: 'Discretionary', category: 'Family Events',   label: '💒 Family Events' },
  { tag: 'Discretionary', category: 'Medical',         label: '🏥 Medical' },
  { tag: 'Discretionary', category: 'Home',            label: '🏠 Home' },
  { tag: 'Discretionary', category: 'Other',           label: '📦 Other' },
  { tag: 'Transfer',      category: 'Transfer',        label: '↔️ Transfer' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function shortAcct(name: string): string {
  if (name.includes('NatWest Main'))     return 'NatWest'
  if (name.includes('Barclaycard'))      return 'Barclaycard'
  if (name.includes('HSBC'))            return 'HSBC'
  if (name.includes('Tesco'))           return 'Tesco'
  if (name.includes('Chase'))           return 'Chase'
  if (name.includes('NatWest Credit'))  return 'NW CC'
  if (name.includes('Savings'))         return 'Savings'
  return name.split(' ')[0]
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TransactionsClient({
  transactions,
  accounts,
  futureEvents = [],
}: {
  transactions: Tx[]
  accounts:     Account[]
  futureEvents?: FutureEventOption[]
}) {
  const router = useRouter()

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('')
  const [accountFilter,  setAccountFilter]  = useState('all')
  const [tagFilter,      setTagFilter]      = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dateRange,      setDateRange]      = useState<'this' | 'last' | '3m' | 'all'>('all')
  const [showTransfers,  setShowTransfers]  = useState(false)
  const [page,           setPage]           = useState(1)

  // ── Bulk action state ────────────────────────────────────────────────────────
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [bulkOption,    setBulkOption]    = useState('')
  const [isBulkPending, setIsBulkPending] = useState(false)

  // ── Reset page when filters change ─────────────────────────────────────────
  useEffect(() => { setPage(1) }, [search, accountFilter, tagFilter, categoryFilter, dateRange, showTransfers])

  // ── Derived: account map ────────────────────────────────────────────────────
  const accountMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of accounts) m[a.id] = a.name
    return m
  }, [accounts])

  // ── Derived: date range bounds ──────────────────────────────────────────────
  const { dateStart, dateEnd } = useMemo(() => {
    if (dateRange === 'all') return { dateStart: null, dateEnd: null }
    const current = getCurrentPayPeriod()
    const periods = getLast4PayPeriods(4)
    if (dateRange === 'this') return { dateStart: current.start, dateEnd: current.end }
    if (dateRange === 'last') {
      const last = periods[periods.length - 2]
      return { dateStart: last?.start ?? current.start, dateEnd: last?.end ?? current.end }
    }
    // '3m' — last 3 periods
    return { dateStart: periods[0].start, dateEnd: periods[periods.length - 1].end }
  }, [dateRange])

  // ── Derived: unique categories for filter dropdown ──────────────────────────
  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const t of transactions) {
      if (t.category && !t.transfer_flag) cats.add(t.category)
    }
    return Array.from(cats).sort()
  }, [transactions])

  // ── Derived: account options for dropdown ───────────────────────────────────
  const accountOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { id: string; label: string }[] = []
    for (const t of transactions) {
      if (!seen.has(t.account_id)) {
        seen.add(t.account_id)
        opts.push({ id: t.account_id, label: shortAcct(accountMap[t.account_id] ?? t.account_id) })
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [transactions, accountMap])

  // ── Derived: filtered transactions ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter(t => {
      if (!showTransfers && t.transfer_flag)                                       return false
      if (q && !(t.merchant_name ?? t.description).toLowerCase().includes(q))     return false
      if (accountFilter  !== 'all' && t.account_id !== accountFilter)              return false
      if (tagFilter      !== 'all' && t.tag        !== tagFilter)                  return false
      if (categoryFilter !== 'all' && t.category   !== categoryFilter)             return false
      if (dateStart && t.date < dateStart)                                         return false
      if (dateEnd   && t.date > dateEnd)                                           return false
      return true
    })
  }, [transactions, search, accountFilter, tagFilter, categoryFilter, dateStart, dateEnd, showTransfers])

  // ── Derived: summary stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    let income = 0, spent = 0
    for (const t of filtered) {
      if (t.amount > 0) income += t.amount
      else spent += Math.abs(t.amount)
    }
    return { count: filtered.length, income, spent }
  }, [filtered])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Bulk select helpers ─────────────────────────────────────────────────────
  const allPageSelected = paginated.length > 0 && paginated.every(t => selected.has(t.id))

  function toggleAll() {
    const next = new Set(selected)
    if (allPageSelected) {
      for (const t of paginated) next.delete(t.id)
    } else {
      for (const t of paginated) next.add(t.id)
    }
    setSelected(next)
  }

  function toggleOne(id: string) {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  // ── Bulk apply ──────────────────────────────────────────────────────────────
  async function handleBulkApply() {
    if (!bulkOption || selected.size === 0) return
    const [tag, ...catParts] = bulkOption.split(':')
    const category = catParts.join(':')
    setIsBulkPending(true)
    try {
      await bulkUpdateTag(Array.from(selected), tag, category)
      setSelected(new Set())
      setBulkOption('')
      router.refresh()
    } catch (err) {
      console.error('[handleBulkApply] failed:', err)
    } finally {
      setIsBulkPending(false)
    }
  }

  // ── Clear filters ──────────────────────────────────────────────────────────
  const hasFilters = !!(search || accountFilter !== 'all' || tagFilter !== 'all' || categoryFilter !== 'all' || dateRange !== 'all')

  function clearFilters() {
    setSearch(''); setAccountFilter('all'); setTagFilter('all')
    setCategoryFilter('all'); setDateRange('all')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Sticky filter bar ───────────────────────────────────────────────── */}
      <div
        className="sticky z-20 px-4 py-3 md:px-8"
        style={{ top: '57px', backgroundColor: '#0f1923', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Summary + transfer toggle */}
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-xs min-w-0 truncate" style={{ color: '#8899aa' }}>
            <span className="font-medium" style={{ color: '#f0f4f8' }}>{stats.count}</span> transactions
            {' · '}
            <span style={{ color: '#FF4488' }}>-{fmt(stats.spent)}</span>
            {' · '}
            <span style={{ color: '#00FF94' }}>+{fmt(stats.income)}</span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowTransfers(v => !v)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
              style={{
                color:           showTransfers ? '#00D4FF' : '#4a5568',
                backgroundColor: showTransfers ? 'rgba(0,212,255,0.08)' : 'transparent',
                border:          '1px solid ' + (showTransfers ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.06)'),
              }}
            >
              {showTransfers ? <Eye size={11} /> : <EyeOff size={11} />}
              <span className="hidden sm:inline ml-1">Transfers</span>
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
                style={{ color: '#FF4488', border: '1px solid rgba(255,68,136,0.2)' }}
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative min-w-[160px] flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#4a5568' }} />
            <input
              type="text"
              placeholder="Search merchant…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg pl-7 pr-3 py-1.5 text-xs outline-none"
              style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#f0f4f8' }}
            />
          </div>

          {/* Account */}
          <select
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: accountFilter === 'all' ? '#4a5568' : '#f0f4f8' }}
          >
            <option value="all">All accounts</option>
            {accountOptions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>

          {/* Tag */}
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: tagFilter === 'all' ? '#4a5568' : '#f0f4f8' }}
          >
            <option value="all">All tags</option>
            <option value="Income">Income</option>
            <option value="Fixed">Fixed</option>
            <option value="Discretionary">Discretionary</option>
            <option value="Transfer">Transfer</option>
          </select>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: categoryFilter === 'all' ? '#4a5568' : '#f0f4f8' }}
          >
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Date range */}
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value as 'this' | 'last' | '3m' | 'all')}
            className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
            style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: dateRange === 'all' ? '#4a5568' : '#f0f4f8' }}
          >
            <option value="all">All time</option>
            <option value="this">This period</option>
            <option value="last">Last period</option>
            <option value="3m">Last 3 months</option>
          </select>
        </div>
      </div>

      {/* ── Bulk action bar (visible when rows are selected) ─────────────────── */}
      {selected.size > 0 && (
        <div
          className="px-4 py-2.5 flex items-center gap-2.5 flex-wrap"
          style={{ backgroundColor: '#1a2535', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-xs font-semibold" style={{ color: '#00D4FF' }}>
            {selected.size} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs"
            style={{ color: '#4a5568' }}
          >
            Deselect all
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={bulkOption}
              onChange={e => setBulkOption(e.target.value)}
              className="rounded-lg px-2.5 py-1.5 text-xs outline-none"
              style={{ backgroundColor: '#0f1923', border: '1px solid rgba(255,255,255,0.06)', color: bulkOption ? '#f0f4f8' : '#4a5568' }}
            >
              <option value="">Set tag + category…</option>
              {BULK_OPTIONS.map(o => (
                <option key={`${o.tag}:${o.category}`} value={`${o.tag}:${o.category}`}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleBulkApply}
              disabled={!bulkOption || isBulkPending}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#00D4FF', color: '#0f1923' }}
            >
              {isBulkPending ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-2 md:px-8">
        <h1 className="text-2xl font-semibold md:text-3xl">Transactions</h1>
        <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
          All imported transactions · click any tag to reassign
        </p>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl px-4 pb-6 md:px-8">

        {paginated.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm" style={{ color: '#4a5568' }}>
              {hasFilters ? 'No transactions match your filters.' : 'No transactions yet.'}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-sm" style={{ color: '#00D4FF' }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ── Desktop table ─────────────────────────────────────────────── */}
            <div
              className="hidden md:block rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="pl-4 pr-2 py-3 w-8">
                      <button onClick={toggleAll} className="flex items-center">
                        {allPageSelected
                          ? <CheckSquare size={14} style={{ color: '#00D4FF' }} />
                          : <Square      size={14} style={{ color: '#4a5568' }} />
                        }
                      </button>
                    </th>
                    {['Date', 'Account', 'Merchant', 'Category', 'Amount'].map(h => (
                      <th
                        key={h}
                        className={'px-3 py-3 text-left text-xs font-semibold uppercase' + (h === 'Amount' ? ' text-right' : '')}
                        style={{ color: '#4a5568', letterSpacing: '0.08em' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((tx, i) => {
                    const isCredit   = tx.amount > 0
                    const acctName   = shortAcct(accountMap[tx.account_id] ?? '')
                    const isSelected = selected.has(tx.id)
                    const isTransfer = tx.transfer_flag

                    return (
                      <tr
                        key={tx.id}
                        style={{
                          borderTop:       i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                          backgroundColor: isSelected ? 'rgba(0,212,255,0.04)' : 'transparent',
                          opacity:         isTransfer && !isSelected ? 0.45 : 1,
                        }}
                      >
                        {/* Checkbox */}
                        <td className="pl-4 pr-2 py-3">
                          <button onClick={() => toggleOne(tx.id)} className="flex items-center">
                            {isSelected
                              ? <CheckSquare size={14} style={{ color: '#00D4FF' }} />
                              : <Square      size={14} style={{ color: '#4a5568' }} />
                            }
                          </button>
                        </td>

                        {/* Date */}
                        <td
                          className="px-3 py-3 text-xs whitespace-nowrap"
                          style={{ color: '#4a5568', fontFamily: 'var(--font-dm-mono)' }}
                        >
                          {fmtDate(tx.date)}
                        </td>

                        {/* Account badge */}
                        <td className="px-3 py-3">
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap"
                            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#8899aa' }}
                          >
                            {acctName}
                          </span>
                        </td>

                        {/* Merchant */}
                        <td className="px-3 py-3 max-w-[220px]">
                          <p className="truncate text-sm font-medium">{tx.merchant_name || tx.description}</p>
                        </td>

                        {/* Category — TagPicker inline editor */}
                        <td className="px-3 py-3">
                          <TagPicker txId={tx.id} tag={tx.tag} category={tx.category} eventId={tx.event_id} events={futureEvents} />
                        </td>

                        {/* Amount */}
                        <td className="px-3 py-3 text-right">
                          <span
                            className="text-sm font-semibold whitespace-nowrap"
                            style={{ color: isCredit ? '#00FF94' : '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}
                          >
                            {isCredit ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards ──────────────────────────────────────────────── */}
            <div className="md:hidden space-y-2">
              {paginated.map(tx => {
                const isCredit   = tx.amount > 0
                const acctName   = shortAcct(accountMap[tx.account_id] ?? '')
                const isSelected = selected.has(tx.id)
                const tagColor   = tx.tag ? (TAG_COLORS[tx.tag] ?? '#4a5568') : '#4a5568'

                return (
                  <div
                    key={tx.id}
                    className="rounded-xl px-3 py-3"
                    style={{
                      backgroundColor: isSelected ? 'rgba(0,212,255,0.06)' : '#1a2535',
                      border:          isSelected
                        ? '1px solid rgba(0,212,255,0.25)'
                        : '1px solid rgba(255,255,255,0.06)',
                      opacity: tx.transfer_flag && !isSelected ? 0.45 : 1,
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Checkbox */}
                      <button onClick={() => toggleOne(tx.id)} className="mt-0.5 shrink-0">
                        {isSelected
                          ? <CheckSquare size={14} style={{ color: '#00D4FF' }} />
                          : <Square      size={14} style={{ color: '#4a5568' }} />
                        }
                      </button>

                      <div className="min-w-0 flex-1">
                        {/* Top row: merchant + amount */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="truncate text-sm font-medium">
                            {tx.merchant_name || tx.description}
                          </p>
                          <span
                            className="shrink-0 text-sm font-semibold"
                            style={{ color: isCredit ? '#00FF94' : '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}
                          >
                            {isCredit ? '+' : '-'}{fmt(tx.amount)}
                          </span>
                        </div>

                        {/* Bottom row: date, account, TagPicker */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs" style={{ color: '#4a5568', fontFamily: 'var(--font-dm-mono)' }}>
                            {fmtDate(tx.date)}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[11px]"
                            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#8899aa' }}
                          >
                            {acctName}
                          </span>
                          <TagPicker txId={tx.id} tag={tx.tag} category={tx.category} eventId={tx.event_id} events={futureEvents} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Pagination ────────────────────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#8899aa' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-xs" style={{ color: '#4a5568' }}>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#8899aa' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
