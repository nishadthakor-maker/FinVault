import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { TransactionsClient } from './TransactionsClient'

export const dynamic = 'force-dynamic'

export default async function TransactionsPage() {
  const supabase = await createSupabaseServerClient()

  const [{ data: txns }, { data: accts }, { data: futureEvents }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, date, description, merchant_name, amount, type, category, tag, transfer_flag, account_id, event_id')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('accounts').select('id, name'),
    supabase.from('future_events')
      .select('id, name, category, event_date')
      .eq('type', 'expense')
      .order('event_date'),
  ])

  const transactions = (txns ?? []).map(t => ({ ...t, amount: Number(t.amount) }))

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />
      <TransactionsClient
        transactions={transactions}
        accounts={accts ?? []}
        futureEvents={futureEvents ?? []}
      />
      <BottomNav />
    </div>
  )
}
