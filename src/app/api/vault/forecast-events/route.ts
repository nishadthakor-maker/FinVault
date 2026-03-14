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

  const docType = doc.type as string
  const provider = (meta?.provider || doc.name) as string
  const events: Record<string, unknown>[] = []

  if (docType === 'council_tax' && meta?.start_date) {
    // Monthly events from start to end (or 12 months if no end)
    const start = new Date(meta.start_date)
    const end   = meta.end_date ? new Date(meta.end_date) : new Date(start.getFullYear() + 1, start.getMonth(), 1)
    const amount = meta.monthly_amount ?? (meta.annual_amount ? meta.annual_amount / 10 : 0)
    const cur = new Date(start)
    while (cur <= end) {
      events.push({
        user_id:     user.id,
        document_id,
        name:        `${provider} ${cur.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,
        amount,
        amount_min:  amount,
        amount_max:  amount,
        event_date:  cur.toISOString().slice(0, 10),
        type:        'expense',
        category:    'Council Tax',
        is_recurring: false,
        is_confirmed: true,
      })
      cur.setMonth(cur.getMonth() + 1)
    }
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
      is_recurring: false,
      is_confirmed: false,
    })
  } else if ((docType === 'water' || docType === 'energy') && meta?.start_date) {
    const amount = meta.monthly_amount ?? (meta.annual_amount ? meta.annual_amount / 12 : 0)
    for (let m = 0; m < 12; m++) {
      const d = new Date(meta.start_date)
      d.setMonth(d.getMonth() + m)
      events.push({
        user_id:     user.id,
        document_id,
        name:        `${provider} ${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,
        amount,
        amount_min:  amount,
        amount_max:  amount,
        event_date:  d.toISOString().slice(0, 10),
        type:        'expense',
        category:    docType === 'water' ? 'Water' : 'Energy',
        is_recurring: false,
        is_confirmed: false,
      })
    }
  } else {
    // Generic single event
    const amount = meta?.annual_amount ?? meta?.monthly_amount ?? 0
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
