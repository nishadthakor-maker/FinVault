import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Papa from 'papaparse'
import Anthropic from '@anthropic-ai/sdk'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParsedTransaction = {
  date: string         // ISO YYYY-MM-DD
  description: string
  merchant_name: string
  amount: number       // positive = credit, negative = debit
  type: 'debit' | 'credit'
  category: string | null
}

type ImportResponse = {
  transactions: ParsedTransaction[]
  bank: string
  count: number
  imported?: number
  errors?: string[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseDMY(str: string): string | null {
  // DD/MM/YYYY or DD/MM/YY
  const m = str.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseDMonY(str: string): string | null {
  // DD Mon YY or DD Mon YYYY (e.g. "15 Mar 24" or "15 Mar 2024")
  const m = str.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})$/)
  if (!m) return null
  const [, d, mon, y] = m
  const mo = MONTHS[mon.toLowerCase()]
  if (!mo) return null
  const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y
  return `${year}-${mo}-${d.padStart(2, '0')}`
}

function toISO(str: string): string | null {
  return parseDMY(str) ?? parseDMonY(str)
}

function parseAmount(str: string): number {
  return parseFloat(str.replace(/[£,\s]/g, '').replace(/[()]/g, m => m === '(' ? '-' : ''))
}

// ─── NatWest CSV ──────────────────────────────────────────────────────────────
//
// Format:
//   Date,Type,Description,Value,Balance,Account Name,Account Number
//   15/03/2024,DD,SPOTIFY UK,-9.99,1234.56,Current Account,60-01-01 12345678

function parseNatWestCSV(text: string): ParsedTransaction[] {
  const { data, errors } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (errors.length && !data.length) throw new Error('CSV parse failed')

  // Find header row
  const headerIdx = data.findIndex(r =>
    r.some(c => c.toLowerCase().includes('date')) &&
    r.some(c => c.toLowerCase().includes('description'))
  )
  const rows = headerIdx >= 0 ? data.slice(headerIdx + 1) : data.slice(1)

  return rows.flatMap((row): ParsedTransaction[] => {
    if (row.length < 4) return []
    const date = toISO(row[0]?.trim() ?? '')
    if (!date) return []
    const description = row[2]?.trim() ?? ''
    const amount = parseAmount(row[3] ?? '0')
    if (isNaN(amount)) return []
    return [{
      date,
      description,
      merchant_name: description,
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      category: null,
    }]
  })
}

// ─── Claude PDF parser ────────────────────────────────────────────────────────

const CLAUDE_SYSTEM_PROMPT =
  'You are a UK bank statement parser. Extract all transactions from this bank statement PDF as a JSON array. ' +
  'Each transaction must have: date (YYYY-MM-DD), description (string), amount (negative for debits, positive for credits, as a number), ' +
  'type (the transaction type if shown e.g. Direct Debit, Standing Order, Debit Card Transaction, Automated Credit). ' +
  'Return ONLY a valid JSON array, no other text.'

async function parseWithClaude(buffer: Buffer): Promise<ParsedTransaction[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const base64 = buffer.toString('base64')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: CLAUDE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          } as Anthropic.DocumentBlockParam,
          {
            type: 'text',
            text: 'Extract all transactions from this bank statement.',
          },
        ],
      },
    ],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  // Strip markdown code fences if present
  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  let parsed: Array<{ date: string; description: string; amount: number; type?: string }>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude response is not valid JSON: ${raw.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Claude response is not a JSON array')
  }

  return parsed.flatMap((t): ParsedTransaction[] => {
    const date = t.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? t.date : toISO(t.date ?? '')
    if (!date) return []
    const amount = typeof t.amount === 'number' ? t.amount : parseAmount(String(t.amount ?? '0'))
    if (isNaN(amount)) return []
    const description = String(t.description ?? '').trim()
    return [{
      date,
      description,
      merchant_name: description,
      amount,
      type: amount >= 0 ? 'credit' : 'debit',
      category: null,
    }]
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<ImportResponse>> {
  const cookieStore = await cookies()
  const response = new NextResponse<ImportResponse>()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' } as never, { status: 401 })
  }

  const formData = await request.formData()
  const file       = formData.get('file') as File | null
  const accountId  = formData.get('account_id') as string | null
  const dryRun     = formData.get('dry_run') === 'true'

  if (!file) return NextResponse.json({ error: 'No file provided' } as never, { status: 400 })
  if (!accountId) return NextResponse.json({ error: 'No account_id provided' } as never, { status: 400 })

  // Verify account belongs to this user
  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (!account) return NextResponse.json({ error: 'Account not found' } as never, { status: 404 })

  // Parse
  let transactions: ParsedTransaction[] = []
  let bank = 'unknown'

  try {
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      bank = 'natwest-csv'
      transactions = parseNatWestCSV(text)
    } else {
      const buffer = Buffer.from(await file.arrayBuffer())
      bank = 'claude-pdf'
      transactions = await parseWithClaude(buffer)
    }
  } catch (err) {
    return NextResponse.json({ error: `Parse error: ${String(err)}` } as never, { status: 422 })
  }

  if (transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions could be parsed from this file' } as never, { status: 422 })
  }

  if (dryRun) {
    return NextResponse.json({ transactions, bank, count: transactions.length })
  }

  // Insert into DB (upsert on date+description+amount to avoid duplicates)
  const rows = transactions.map(t => ({
    user_id:       user.id,
    account_id:    accountId,
    date:          t.date,
    description:   t.description,
    merchant_name: t.merchant_name,
    amount:        t.amount,
    type:          t.type,
    category:      t.category,
  }))

  const errors: string[] = []
  let imported = 0

  // Batch insert in chunks of 100
  for (let i = 0; i < rows.length; i += 100) {
    const { error: dbErr, data } = await supabase
      .from('transactions')
      .insert(rows.slice(i, i + 100))
      .select('id')

    if (dbErr) {
      errors.push(dbErr.message)
    } else {
      imported += data?.length ?? 0
    }
  }

  return NextResponse.json({ transactions, bank, count: transactions.length, imported, errors })
}
