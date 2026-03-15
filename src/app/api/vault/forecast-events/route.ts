import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { document_id } = await req.json() as { document_id: string }
  if (!document_id) return NextResponse.json({ error: 'No document_id' }, { status: 400 })

  // Fetch document
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', document_id)
    .eq('user_id', user.id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Check for existing events from this document
  const { data: existing } = await supabase
    .from('future_events')
    .select('id')
    .eq('document_id', document_id)
    .eq('user_id', user.id)

  if (existing && existing.length > 0) {
    return NextResponse.json({ message: 'Events already exist', count: existing.length })
  }

  const meta = doc.metadata as {
    annual_amount?: number | null
    monthly_amount?: number | null
    start_date?: string | null
    end_date?: string | null
    provider?: string
    document_type?: string
  } | null

  const docType  = doc.type as string
  const provider = (meta?.provider || doc.name) as string
  const events: Record<string, unknown>[] = []

  if (docType === 'council_tax' && meta?.start_date) {
    // Single annual summary event — UK council tax is 10 monthly payments (Apr–Jan, no Feb/Mar)
    const monthly     = meta.monthly_amount ?? (meta.annual_amount ? meta.annual_amount / 10 : 0)
    const annualTotal = meta.annual_amount ?? monthly * 10

    // Build schedule note from start date
    const start    = new Date(meta.start_date)
    const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const schedule: string[] = []
    const cur = new Date(start)
    for (let i = 0; i < 10; i++) {
      schedule.push(`${months[cur.getMonth()]} £${monthly.toFixed(2)}`)
      cur.setMonth(cur.getMonth() + 1)
    }
    const scheduleNote = schedule.join(', ') + '. No payment Feb–Mar.'

    events.push({
      user_id:      user.id,
      document_id,
      name:         `${provider} Annual Bill`,
      amount:       annualTotal,
      amount_min:   annualTotal,
      amount_max:   annualTotal,
      event_date:   meta.start_date,
      type:         'expense',
      category:     'Council Tax',
      recurrence_rule: 'annual',
      notes:        scheduleNote,
      is_recurring: false,
      is_confirmed: true,
    })

  } else if (docType === 'insurance' && meta?.end_date) {
    const amount = meta.annual_amount ?? meta.monthly_amount ?? 0
    events.push({
      user_id:     user.id,
      document_id,
      name:        `${provider} Renewal`,
      amount,
      amount_min:  amount,
      amount_max:  amount,
      event_date:  meta.end_date,
      type:        'expense',
      category:    'Insurance',
      recurrence_rule: 'annual',
      is_recurring: false,
      is_confirmed: false,
    })

  } else if ((docType === 'water' || docType === 'energy') && meta?.start_date) {
    const monthly     = meta.monthly_amount ?? (meta.annual_amount ? meta.annual_amount / 12 : 0)
    const annualTotal = meta.annual_amount ?? monthly * 12
    const start = new Date(meta.start_date)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const schedule: string[] = []
    const cur = new Date(start)
    for (let i = 0; i < 12; i++) {
      schedule.push(`${months[cur.getMonth()]} £${monthly.toFixed(2)}`)
      cur.setMonth(cur.getMonth() + 1)
    }
    events.push({
      user_id:      user.id,
      document_id,
      name:         `${provider} Annual`,
      amount:       annualTotal,
      amount_min:   annualTotal,
      amount_max:   annualTotal,
      event_date:   meta.start_date,
      type:         'expense',
      category:     docType === 'water' ? 'Water' : 'Energy',
      recurrence_rule: 'annual',
      notes:        schedule.join(', '),
      is_recurring: false,
      is_confirmed: false,
    })

  } else {
    // Generic single event
    const amount    = meta?.annual_amount ?? meta?.monthly_amount ?? 0
    const eventDate = meta?.end_date ?? meta?.start_date ?? new Date().toISOString().slice(0, 10)
    events.push({
      user_id:     user.id,
      document_id,
      name:        provider,
      amount,
      amount_min:  amount,
      amount_max:  amount,
      event_date:  eventDate,
      type:        'expense',
      category:    docType,
      recurrence_rule: 'one-off',
      is_recurring: false,
      is_confirmed: false,
    })
  }

  if (events.length === 0) {
    return NextResponse.json({ message: 'No events to create — check document has dates and amounts', count: 0 })
  }

  const { error } = await supabase.from('future_events').insert(events)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ message: 'Events created', count: events.length })
}
