import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import {
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'

// ─── Placeholder data ────────────────────────────────────────────────────────

const summaryCards = [
  {
    label: 'Net Worth',
    value: '£12,450.00',
    sub: '+£320 this month',
    positive: true,
    color: '#00FF94',
  },
  {
    label: 'Safe to Spend',
    value: '£840.00',
    sub: 'Until payday',
    positive: true,
    color: '#00D4FF',
  },
  {
    label: 'Monthly Spent',
    value: '£1,240.00',
    sub: '£560 remaining',
    positive: false,
    color: '#FF4488',
  },
  {
    label: 'Days to Payday',
    value: '8',
    sub: '25th March',
    positive: true,
    color: '#A78BFA',
  },
]

const transactions = [
  {
    id: 1,
    merchant: 'Tesco Express',
    category: 'Groceries',
    amount: -24.5,
    date: 'Today',
    icon: '🛒',
  },
  {
    id: 2,
    merchant: 'Salary — ACME Ltd',
    category: 'Income',
    amount: 3200.0,
    date: 'Yesterday',
    icon: '💼',
  },
  {
    id: 3,
    merchant: 'Spotify',
    category: 'Subscriptions',
    amount: -11.99,
    date: '11 Mar',
    icon: '🎵',
  },
  {
    id: 4,
    merchant: 'Amazon',
    category: 'Shopping',
    amount: -38.99,
    date: '10 Mar',
    icon: '📦',
  },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>

      {/* ── Top nav ── */}
      <TopNav />

      {/* ── Main content ── */}
      <main className="mx-auto w-full max-w-4xl px-4 pt-6 md:px-8">

        {/* Welcome */}
        <section className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">
            {greeting}, Nishad
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </section>

        {/* Summary cards */}
        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl p-4 md:p-5"
              style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
            >
              <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: '#8892a4' }}>
                {card.label}
              </p>
              <p
                className="text-xl font-semibold leading-none md:text-2xl"
                style={{ color: card.color, fontFamily: 'var(--font-dm-mono)' }}
              >
                {card.value}
              </p>
              <p className="mt-2 text-xs" style={{ color: '#4a5568' }}>
                {card.sub}
              </p>
            </div>
          ))}
        </section>

        {/* Recent transactions */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold md:text-lg">Recent Transactions</h2>
            <button className="text-xs font-medium" style={{ color: '#00D4FF' }}>
              See all
            </button>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
          >
            {transactions.map((tx, i) => {
              const isPositive = tx.amount > 0
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid #1e2a3a',
                  }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: '#0d1117' }}
                  >
                    {tx.icon}
                  </div>

                  {/* Merchant + category */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tx.merchant}</p>
                    <p className="text-xs" style={{ color: '#4a5568' }}>{tx.category}</p>
                  </div>

                  {/* Amount + date */}
                  <div className="text-right">
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color: isPositive ? '#00FF94' : '#f0f4f8',
                        fontFamily: 'var(--font-dm-mono)',
                      }}
                    >
                      {isPositive ? '+' : ''}
                      {tx.amount.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                    </p>
                    <p className="text-xs" style={{ color: '#4a5568' }}>{tx.date}</p>
                  </div>

                  {/* Direction icon */}
                  <div className="shrink-0 ml-1">
                    {isPositive ? (
                      <ArrowDownLeft size={14} style={{ color: '#00FF94' }} />
                    ) : (
                      <ArrowUpRight size={14} style={{ color: '#8892a4' }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

      </main>

      {/* ── Bottom nav (mobile) ── */}
      <BottomNav />
    </div>
  )
}
