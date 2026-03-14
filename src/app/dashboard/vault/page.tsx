import { createSupabaseServerClient } from '@/lib/supabase-server'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { VaultClient } from './VaultClient'

export const dynamic = 'force-dynamic'

export default async function VaultPage() {
  const supabase = await createSupabaseServerClient()

  const { data: docs } = await supabase
    .from('documents')
    .select('id, name, type, file_url, file_size, mime_type, metadata, notes, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen pb-24 md:pb-8" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      <main className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold md:text-3xl">Document Vault</h1>
          <p className="mt-1 text-sm" style={{ color: '#8899aa' }}>
            Upload bills and documents — Claude extracts key details automatically
          </p>
        </div>

        <VaultClient initialDocs={docs ?? []} />
      </main>

      <BottomNav />
    </div>
  )
}
