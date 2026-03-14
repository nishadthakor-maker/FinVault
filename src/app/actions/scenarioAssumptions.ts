'use server'

import { createSupabaseServerClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

export async function saveScenarioAssumptions(data: {
  scenario:            'A' | 'B' | 'C'
  salary:              number
  fixedBills:          number
  ccSpend:             number
  directDiscretionary: number
  extraSavings:        number
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('scenario_assumptions')
    .upsert({
      user_id:              user.id,
      scenario:             data.scenario,
      salary:               data.salary,
      fixed_bills:          data.fixedBills,
      cc_spend:             data.ccSpend,
      direct_discretionary: data.directDiscretionary,
      extra_savings:        data.extraSavings,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'user_id,scenario' })

  if (error) throw new Error(error.message)

  // Invalidate AI insight for this scenario so it regenerates with new numbers
  await supabase
    .from('ai_insights')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'forecast')
    .eq('title', `forecast_scenario_${data.scenario}`)

  revalidatePath('/dashboard/forecast')
}
