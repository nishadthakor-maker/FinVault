'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

async function invalidateForecastCache(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  await supabase
    .from('ai_insights')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'forecast')
    .like('title', 'forecast_scenario_%')
}

export async function addFutureEvent(data: {
  name:           string
  amountMin:      number
  amountMax:      number
  eventDate:      string   // 'YYYY-MM'
  category:       string
  recurrenceRule: string
  notes:          string
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const midpoint = (data.amountMin + data.amountMax) / 2
  const { error } = await supabase.from('future_events').insert({
    user_id:        user.id,
    name:           data.name.trim(),
    amount:         midpoint,
    amount_min:     data.amountMin,
    amount_max:     data.amountMax,
    event_date:     `${data.eventDate}-01`,
    type:           'expense',
    category:       data.category,
    recurrence_rule: data.recurrenceRule,
    notes:          data.notes.trim() || null,
    is_confirmed:   false,
  })
  if (error) throw new Error(error.message)

  await invalidateForecastCache(supabase, user.id)
  revalidatePath('/dashboard/forecast')
}

export async function updateFutureEvent(id: string, data: {
  name:           string
  amountMin:      number
  amountMax:      number
  eventDate:      string   // 'YYYY-MM'
  category:       string
  recurrenceRule: string
  notes:          string
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const midpoint = (data.amountMin + data.amountMax) / 2
  const { error } = await supabase
    .from('future_events')
    .update({
      name:            data.name.trim(),
      amount:          midpoint,
      amount_min:      data.amountMin,
      amount_max:      data.amountMax,
      event_date:      `${data.eventDate}-01`,
      category:        data.category,
      recurrence_rule: data.recurrenceRule,
      notes:           data.notes.trim() || null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  await invalidateForecastCache(supabase, user.id)
  revalidatePath('/dashboard/forecast')
}

export async function deleteFutureEvent(id: string) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('future_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) throw new Error(error.message)

  await invalidateForecastCache(supabase, user.id)
  revalidatePath('/dashboard/forecast')
}
