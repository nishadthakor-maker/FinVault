import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { ImportClient } from '@/components/ImportClient'

export default async function ImportPage() {
  const supabase = await createSupabaseServerClient()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, type')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0d1117', color: '#f0f4f8' }}>

      {/* Top nav */}
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Import Statement</h1>
          <p className="mt-1 text-sm" style={{ color: '#8892a4' }}>
            Upload a bank statement CSV or PDF to import your transactions.
          </p>
        </div>

        <ImportClient accounts={accounts ?? []} />
      </main>

      <BottomNav />
    </div>
  )
}
