'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function updateTransactionTag(
  txId:     string,
  tag:      string,
  category: string,
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase
    .from('transactions')
    .update({ tag, category, transfer_flag: tag === 'Transfer' })
    .eq('id', txId)
    .eq('user_id', user.id)

  revalidatePath('/')
  revalidatePath('/dashboard/pl')
  revalidatePath('/dashboard/transactions')
}

/** Link (or unlink) a transaction to a future event for budget tracking. */
export async function linkTransactionToEvent(
  txId:    string,
  eventId: string | null,
) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase
    .from('transactions')
    .update({ event_id: eventId })
    .eq('id', txId)
    .eq('user_id', user.id)

  revalidatePath('/dashboard/transactions')
  revalidatePath('/dashboard/forecast')
}
