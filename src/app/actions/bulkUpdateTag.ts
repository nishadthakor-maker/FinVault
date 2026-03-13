'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function bulkUpdateTag(ids: string[], tag: string, category: string) {
  if (!ids.length) return
  console.log('[bulkUpdateTag]', { count: ids.length, tag, category, ids })

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('transactions')
    .update({ tag, category, transfer_flag: tag === 'Transfer' })
    .in('id', ids)
    .eq('user_id', user.id)

  if (error) {
    console.error('[bulkUpdateTag] error:', error)
    throw new Error(error.message)
  }

  console.log('[bulkUpdateTag] success — updated', ids.length, 'rows')
  revalidatePath('/dashboard/transactions')
  revalidatePath('/')
  revalidatePath('/dashboard/pl')
}
