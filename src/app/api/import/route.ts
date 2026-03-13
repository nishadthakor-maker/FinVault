import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Papa from 'papaparse'
import Anthropic from '@anthropic-ai/sdk'
import { getCurrentPayPeriod } from '@/lib/payPeriod'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParsedTransaction = {
  date: string         // ISO YYYY-MM-DD
  description: string
  merchant_name: string
  amount: number       // positive = credit, negative = debit
  type: 'debit' | 'credit'
  category: string | null
}

export type NeedsReviewItem = {
  date: string
  description: string
  amount: number
  reason: string
}

type ImportResponse = {
  transactions: ParsedTransaction[]
  bank: string
  count: number
  imported?: number
  duplicates_skipped?: number
  needs_review?: NeedsReviewItem[]
  total_in_file?: number
  errors?: string[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseDMY(str: string): string | null {
  const m = str.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const year = y.length === 2 ? (parseInt(y) > 50 ? `19${y}` : `20${y}`) : y
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseDMonY(str: string): string | null {
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

// ─── Auto-tagger ──────────────────────────────────────────────────────────────

type AutoTagResult = { tag: string | null; category: string | null; transfer_flag: boolean }

function autoTag(description: string): AutoTagResult {
  const d = description.toUpperCase()

  // ── Income ──────────────────────────────────────────────────────────────────
  if (d.includes('PAYROLL') || d.includes('SALARY'))
    return { tag: 'Income', category: 'Salary', transfer_flag: false }
  if (d.includes('MYREWARDS'))
    return { tag: 'Income', category: 'Rewards', transfer_flag: false }

  // ── Transfers ────────────────────────────────────────────────────────────────
  if (d.includes('GROCERYINTEL') || d.includes('GROCERY INTEL'))
    return { tag: 'Transfer', category: 'Transfer', transfer_flag: true }
  if (d.includes('THAKER'))
    return { tag: 'Transfer', category: 'Family Transfer', transfer_flag: true }
  if (d.includes('CHASE'))
    return { tag: 'Transfer', category: 'Savings Transfer', transfer_flag: true }
  if (d.includes('ACC-NWBNECTAR2') || d.includes('NWBNECTAR'))
    return { tag: 'Transfer', category: 'Savings Transfer', transfer_flag: true }
  if (d.includes('N AND P THAKOR') || d.includes('N & P THAKOR'))
    return { tag: 'Transfer', category: 'Family Transfer', transfer_flag: true }
  if (d.includes('NISHAD'))
    return { tag: 'Transfer', category: 'Savings Transfer', transfer_flag: true }
  if (d.includes('CLC'))
    return { tag: 'Transfer', category: 'Transfer', transfer_flag: true }
  if (d.includes('TO A/C') || d.includes('FROM A/C'))
    return { tag: 'Transfer', category: 'Transfer', transfer_flag: true }
  if (d.includes('BARCLAYCARD') || d.includes('BCARD'))
    return { tag: 'Transfer', category: 'Transfer', transfer_flag: true }

  // ── Fixed ────────────────────────────────────────────────────────────────────
  if (d.includes('RENT'))
    return { tag: 'Fixed', category: 'Rent', transfer_flag: false }
  if (d.includes('COUNCIL TAX') || d.includes('COUNCILTAX'))
    return { tag: 'Fixed', category: 'Council Tax', transfer_flag: false }
  if (d.includes('BRITISH GAS') || d.includes('OVO ') || d.includes('OCTOPUS') || d.includes('BULB'))
    return { tag: 'Fixed', category: 'Energy', transfer_flag: false }
  if (d.includes('BROADBAND') || d.includes('VIRGIN MEDIA') || d.includes('OPENREACH'))
    return { tag: 'Fixed', category: 'Broadband', transfer_flag: false }
  if (d.includes('VODAFONE') || d.includes('GIFFGAFF') || d.includes('EE LTD') || d.includes('THREE'))
    return { tag: 'Fixed', category: 'Mobile', transfer_flag: false }
  if (d.includes('INSURANCE') || d.includes('AVIVA') || d.includes('ADMIRAL') || d.includes('HASTINGS'))
    return { tag: 'Fixed', category: 'Insurance', transfer_flag: false }
  if (d.includes('CAR FINANCE') || d.includes('VOLKSWAGEN') || d.includes('BMW FINANCIAL'))
    return { tag: 'Fixed', category: 'Car Finance', transfer_flag: false }
  if (d.includes('NETFLIX') || d.includes('SPOTIFY') || d.includes('DISNEY') || d.includes('NOW TV') || d.includes('PRIME VIDEO'))
    return { tag: 'Fixed', category: 'TV & News', transfer_flag: false }

  // ── Discretionary ────────────────────────────────────────────────────────────
  if (d.includes('TESCO') || d.includes('SAINSBURY') || d.includes('ASDA') || d.includes('MORRISONS') || d.includes('ALDI') || d.includes('LIDL') || d.includes('WAITROSE') || d.includes('CO-OP'))
    return { tag: 'Discretionary', category: 'Groceries', transfer_flag: false }
  if (d.includes('PETROL') || d.includes('FUEL') || d.includes('BP ') || d.includes('SHELL') || d.includes('ESSO') || d.includes('TEXACO'))
    return { tag: 'Discretionary', category: 'Fuel', transfer_flag: false }
  if (d.includes('PARKING') || d.includes('CAR PARK') || d.includes('NCP '))
    return { tag: 'Discretionary', category: 'Parking', transfer_flag: false }
  if (d.includes('RESTAURANT') || d.includes('CAFE') || d.includes('COFFEE') || d.includes('MCDONALD') || d.includes('SUBWAY') || d.includes('PIZZA') || d.includes('NANDO'))
    return { tag: 'Discretionary', category: 'Dining Out', transfer_flag: false }
  if (d.includes('AMAZON') || d.includes('EBAY'))
    return { tag: 'Discretionary', category: 'Other', transfer_flag: false }
  if (d.includes('TRAIN') || d.includes('RAIL') || d.includes('TFL') || d.includes('BUS ') || d.includes('UBER'))
    return { tag: 'Discretionary', category: 'Transport', transfer_flag: false }

  return { tag: null, category: null, transfer_flag: false }
}

// ─── Dedup helpers ────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Returns a similarity score 0–1 between two transaction descriptions.
 * 1.0 = identical or one contains the other
 * 0.85 = share 3+ consecutive words
 * else = word-overlap ratio (words longer than 2 chars)
 */
function descSimilarity(a: string, b: string): number {
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return 1.0
  if (na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na))) return 1.0

  const wa = na.split(' ').filter(w => w.length > 0)
  const wb = nb.split(' ').filter(w => w.length > 0)

  // Check for 3+ consecutive words in common
  if (wa.length >= 3 && wb.length >= 3) {
    for (let i = 0; i <= wa.length - 3; i++) {
      const trigram = wa.slice(i, i + 3).join(' ')
      if (nb.includes(trigram)) return 0.85
    }
  }

  // Word-overlap ratio (meaningful words only)
  const setA = new Set(wa.filter(w => w.length > 2))
  const setB = new Set(wb.filter(w => w.length > 2))
  if (setA.size === 0 && setB.size === 0) return na === nb ? 1.0 : 0
  if (setA.size === 0 || setB.size === 0) return 0

  let shared = 0
  for (const w of setA) if (setB.has(w)) shared++
  return shared / Math.max(setA.size, setB.size)
}

type ExistingTx = { date: string; description: string; amount: number }
type DedupResult =
  | { action: 'insert' }
  | { action: 'skip_exact' }
  | { action: 'skip_fuzzy'; reason: string }

function classify(incoming: ParsedTransaction, existing: ExistingTx[]): DedupResult {
  // Only compare transactions on the same date with the same amount
  const candidates = existing.filter(e =>
    e.date === incoming.date &&
    Math.abs(e.amount - incoming.amount) < 0.005
  )

  for (const c of candidates) {
    const sim = descSimilarity(incoming.description, c.description)
    if (sim >= 0.9) return { action: 'skip_exact' }
    if (sim >= 0.6) return {
      action: 'skip_fuzzy',
      reason: `Possible duplicate of "${c.description}" (${Math.round(sim * 100)}% match)`,
    }
  }
  return { action: 'insert' }
}

// ─── NatWest CSV ──────────────────────────────────────────────────────────────

function parseNatWestCSV(text: string): ParsedTransaction[] {
  const { data, errors } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (errors.length && !data.length) throw new Error('CSV parse failed')

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
    return [{ date, description, merchant_name: description, amount, type: amount >= 0 ? 'credit' : 'debit', category: null }]
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
            source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
          } as Anthropic.DocumentBlockParam,
          { type: 'text', text: 'Extract all transactions from this bank statement.' },
        ],
      },
    ],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Claude returned no text content')

  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')

  let parsed: Array<{ date: string; description: string; amount: number; type?: string }>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude response is not valid JSON: ${raw.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) throw new Error('Claude response is not a JSON array')

  return parsed.flatMap((t): ParsedTransaction[] => {
    const date = t.date?.match(/^\d{4}-\d{2}-\d{2}$/) ? t.date : toISO(t.date ?? '')
    if (!date) return []
    const amount = typeof t.amount === 'number' ? t.amount : parseAmount(String(t.amount ?? '0'))
    if (isNaN(amount)) return []
    const description = String(t.description ?? '').trim()
    return [{ date, description, merchant_name: description, amount, type: amount >= 0 ? 'credit' : 'debit', category: null }]
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
  if (!user) return NextResponse.json({ error: 'Unauthorised' } as never, { status: 401 })

  const formData  = await request.formData()
  const file      = formData.get('file') as File | null
  const accountId = formData.get('account_id') as string | null
  const dryRun    = formData.get('dry_run') === 'true'

  if (!file)      return NextResponse.json({ error: 'No file provided' } as never, { status: 400 })
  if (!accountId) return NextResponse.json({ error: 'No account_id provided' } as never, { status: 400 })

  const { data: account } = await supabase
    .from('accounts').select('id')
    .eq('id', accountId).eq('user_id', user.id).single()
  if (!account) return NextResponse.json({ error: 'Account not found' } as never, { status: 404 })

  // ── Parse file ────────────────────────────────────────────────────────────
  let transactions: ParsedTransaction[] = []
  let bank = 'unknown'

  try {
    if (file.name.toLowerCase().endsWith('.csv')) {
      transactions = parseNatWestCSV(await file.text())
      bank = 'natwest-csv'
    } else {
      transactions = await parseWithClaude(Buffer.from(await file.arrayBuffer()))
      bank = 'claude-pdf'
    }
  } catch (err) {
    return NextResponse.json({ error: `Parse error: ${String(err)}` } as never, { status: 422 })
  }

  if (transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions could be parsed from this file' } as never, { status: 422 })
  }

  if (dryRun) {
    return NextResponse.json({ transactions, bank, count: transactions.length, total_in_file: transactions.length })
  }

  // ── Dedup: fetch existing transactions covering the statement's date range ─
  const sortedDates = transactions.map(t => t.date).sort()
  const rangeStart  = sortedDates[0]
  const rangeEnd    = sortedDates[sortedDates.length - 1]

  const { data: existingRows } = await supabase
    .from('transactions')
    .select('date, description, amount')
    .eq('account_id', accountId)
    .gte('date', rangeStart)
    .lte('date', rangeEnd)

  const existing: ExistingTx[] = (existingRows ?? []).map(r => ({
    date: r.date as string,
    description: r.description as string,
    amount: Number(r.amount),
  }))

  // ── Classify each incoming transaction ────────────────────────────────────
  const toInsert:    ParsedTransaction[] = []
  const needsReview: NeedsReviewItem[]   = []
  let duplicatesSkipped = 0

  for (const tx of transactions) {
    const result = classify(tx, existing)
    if (result.action === 'skip_exact') {
      duplicatesSkipped++
    } else if (result.action === 'skip_fuzzy') {
      needsReview.push({ date: tx.date, description: tx.description, amount: tx.amount, reason: result.reason })
    } else {
      toInsert.push(tx)
    }
  }

  // ── Insert rows with auto-tagging ─────────────────────────────────────────
  const rows = toInsert.map(t => {
    const tagged = autoTag(t.description)
    return {
      user_id:       user.id,
      account_id:    accountId,
      date:          t.date,
      description:   t.description,
      merchant_name: t.merchant_name,
      amount:        t.amount,
      type:          t.type,
      category:      tagged.category ?? t.category,
      tag:           tagged.tag,
      transfer_flag: tagged.transfer_flag,
    }
  })

  const errors: string[] = []
  let imported = 0

  for (let i = 0; i < rows.length; i += 100) {
    const { error: dbErr, data } = await supabase
      .from('transactions')
      .insert(rows.slice(i, i + 100))
      .select('id')

    if (dbErr) errors.push(dbErr.message)
    else imported += data?.length ?? 0
  }

  // ── Invalidate time-limited caches after a successful import ─────────────
  // Deletes current-period financial summary + trends insight so the next
  // page load recomputes with the newly imported transactions.
  // Historical period caches (expires_at IS NULL) are intentionally preserved.
  if (imported > 0) {
    const period = getCurrentPayPeriod()
    await supabase
      .from('ai_insights')
      .delete()
      .eq('user_id', user.id)
      .not('expires_at', 'is', null)
      .or(
        `title.eq.trends_insight,title.eq.financial_summary_${period.start}_${period.end}`
      )
  }

  return NextResponse.json({
    transactions,
    bank,
    count: transactions.length,
    total_in_file: transactions.length,
    imported,
    duplicates_skipped: duplicatesSkipped,
    needs_review: needsReview,
    errors,
  })
}
