import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { BottomNav } from '@/components/BottomNav'
import { SignOutButton } from '@/components/SignOutButton'
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
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-4 md:px-8"
        style={{ backgroundColor: '#0d1117', borderBottom: '1px solid #1e2a3a' }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold tracking-tight" style={{ color: '#00D4FF' }}>
            FinVault
          </Link>
          <span style={{ color: '#1e2a3a' }}>/</span>
          <span className="text-sm font-medium" style={{ color: '#8892a4' }}>Import</span>
        </div>
        <SignOutButton />
      </header>

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
