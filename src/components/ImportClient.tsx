'use client'

import { useRef, useState, useCallback } from 'react'
import { Upload, FileText, FileSpreadsheet, CheckCircle2, AlertCircle, X, ArrowRight } from 'lucide-react'
import type { ParsedTransaction } from '@/app/api/import/route'

type Account = { id: string; name: string; type: string }

type Step = 'upload' | 'preview' | 'importing' | 'done' | 'error'

const BANK_LABELS: Record<string, string> = {
  'natwest-csv':     'NatWest',
  'barclaycard-pdf': 'Barclaycard',
  'hsbc-pdf':        'HSBC',
  'tesco-pdf':       'Tesco Bank',
  'unknown':         'Unknown bank',
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ImportClient({ accounts }: { accounts: Account[] }) {
  const [step, setStep]           = useState<Step>('upload')
  const [dragging, setDragging]   = useState(false)
  const [file, setFile]           = useState<File | null>(null)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [bank, setBank]           = useState('')
  const [preview, setPreview]     = useState<ParsedTransaction[]>([])
  const [imported, setImported]   = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Drag-and-drop handlers ────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  // ── API calls ─────────────────────────────────────────────────────────────

  async function handlePreview() {
    if (!file || !accountId) return
    setLoading(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('account_id', accountId)
    fd.append('dry_run', 'true')

    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to parse file')
      setStep('error')
    } else {
      setBank(json.bank)
      setPreview(json.transactions)
      setStep('preview')
    }
    setLoading(false)
  }

  async function handleConfirm() {
    if (!file || !accountId) return
    setStep('importing')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('account_id', accountId)
    fd.append('dry_run', 'false')

    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Import failed')
      setStep('error')
    } else {
      setImported(json.imported ?? 0)
      setStep('done')
    }
  }

  function reset() {
    setStep('upload')
    setFile(null)
    setPreview([])
    setBank('')
    setError(null)
    setImported(0)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!accounts.length) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
      >
        <AlertCircle size={32} className="mb-4" style={{ color: '#FF4488' }} />
        <p className="text-sm" style={{ color: '#8892a4' }}>
          You need to add a bank account before importing transactions.
        </p>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
      >
        <CheckCircle2 size={40} className="mb-4" style={{ color: '#00FF94' }} />
        <h2 className="text-xl font-semibold mb-1">Import complete</h2>
        <p className="text-sm mb-6" style={{ color: '#8892a4' }}>
          {imported} transaction{imported !== 1 ? 's' : ''} imported successfully.
        </p>
        <button
          onClick={reset}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a', color: '#00D4FF' }}
        >
          Import another file
        </button>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
      >
        <AlertCircle size={40} className="mb-4" style={{ color: '#FF4488' }} />
        <h2 className="text-xl font-semibold mb-1">Import failed</h2>
        <p className="text-sm mb-6 max-w-sm" style={{ color: '#8892a4' }}>{error}</p>
        <button
          onClick={reset}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a', color: '#00D4FF' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Importing (spinner) ───────────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center"
        style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
      >
        <div
          className="h-10 w-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
          style={{ borderColor: '#00D4FF', borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: '#8892a4' }}>Importing {preview.length} transactions…</p>
      </div>
    )
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (step === 'preview') {
    const totalSpend  = preview.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    const totalCredit = preview.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const dates       = preview.map(t => t.date).sort()

    return (
      <div className="space-y-4">
        {/* Summary bar */}
        <div
          className="rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Bank</p>
              <p className="text-sm font-semibold">{BANK_LABELS[bank] ?? bank}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Transactions</p>
              <p className="text-sm font-semibold" style={{ fontFamily: 'var(--font-dm-mono)' }}>{preview.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Total spend</p>
              <p className="text-sm font-semibold" style={{ color: '#FF4488', fontFamily: 'var(--font-dm-mono)' }}>
                -{fmt(totalSpend)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892a4' }}>Total in</p>
              <p className="text-sm font-semibold" style={{ color: '#00FF94', fontFamily: 'var(--font-dm-mono)' }}>
                +{fmt(totalCredit)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 sm:shrink-0">
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ backgroundColor: '#0d1117', border: '1px solid #1e2a3a', color: '#8892a4' }}
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: '#00D4FF', color: '#0d1117' }}
            >
              Import {preview.length} transactions <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* Date range */}
        {dates.length > 0 && (
          <p className="text-xs px-1" style={{ color: '#4a5568' }}>
            {dateLabel(dates[0])} — {dateLabel(dates[dates.length - 1])}
          </p>
        )}

        {/* Transaction table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #1e2a3a' }}>
                  {['Date', 'Description', 'Amount', 'Type'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: '#4a5568' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((tx, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #1e2a3a' }}
                  >
                    <td
                      className="px-4 py-3 text-xs whitespace-nowrap"
                      style={{ color: '#8892a4', fontFamily: 'var(--font-dm-mono)' }}
                    >
                      {dateLabel(tx.date)}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{tx.description}</td>
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap"
                      style={{
                        color: tx.amount >= 0 ? '#00FF94' : '#f0f4f8',
                        fontFamily: 'var(--font-dm-mono)',
                      }}
                    >
                      {tx.amount >= 0 ? '+' : ''}{fmt(tx.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: tx.type === 'credit' ? '#00FF9420' : '#FF448820',
                          color: tx.type === 'credit' ? '#00FF94' : '#FF4488',
                        }}
                      >
                        {tx.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Upload (default) ──────────────────────────────────────────────────────
  const isCSV = file?.name.toLowerCase().endsWith('.csv')

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div>
        <label className="block text-sm font-medium mb-2" style={{ color: '#8892a4' }}>
          Import into account
        </label>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{
            backgroundColor: '#131929',
            border: '1px solid #1e2a3a',
            color: '#f0f4f8',
          }}
        >
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className="relative flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center cursor-pointer transition-colors"
        style={{
          backgroundColor: dragging ? '#1e2a3a' : '#131929',
          border: `2px dashed ${dragging ? '#00D4FF' : '#1e2a3a'}`,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.pdf"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <>
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: '#0d1117' }}
            >
              {isCSV
                ? <FileSpreadsheet size={22} style={{ color: '#00D4FF' }} />
                : <FileText size={22} style={{ color: '#A78BFA' }} />
              }
            </div>
            <p className="font-medium text-sm mb-1">{file.name}</p>
            <p className="text-xs" style={{ color: '#4a5568' }}>
              {(file.size / 1024).toFixed(1)} KB · Click to change
            </p>
          </>
        ) : (
          <>
            <Upload size={28} className="mb-3" style={{ color: dragging ? '#00D4FF' : '#4a5568' }} />
            <p className="font-medium text-sm mb-1">Drop your statement here</p>
            <p className="text-xs" style={{ color: '#4a5568' }}>
              NatWest CSV · Barclaycard, HSBC, or Tesco PDF
            </p>
            <p className="mt-3 text-xs" style={{ color: '#4a5568' }}>or click to browse</p>
          </>
        )}
      </div>

      {/* Format guide */}
      <div
        className="rounded-xl px-4 py-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
        style={{ backgroundColor: '#131929', border: '1px solid #1e2a3a' }}
      >
        {[
          { name: 'NatWest', ext: 'CSV', color: '#00D4FF' },
          { name: 'Barclaycard', ext: 'PDF', color: '#A78BFA' },
          { name: 'HSBC', ext: 'PDF', color: '#A78BFA' },
          { name: 'Tesco Bank', ext: 'PDF', color: '#A78BFA' },
        ].map(b => (
          <div key={b.name} className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: `${b.color}20`, color: b.color }}
            >
              {b.ext}
            </span>
            <span className="text-xs" style={{ color: '#8892a4' }}>{b.name}</span>
          </div>
        ))}
      </div>

      {/* Parse button */}
      <button
        onClick={handlePreview}
        disabled={!file || !accountId || loading}
        className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ backgroundColor: '#00D4FF', color: '#0d1117' }}
      >
        {loading
          ? <><div className="h-4 w-4 rounded-full border-2 border-[#0d1117] border-t-transparent animate-spin" /> Parsing…</>
          : <><ArrowRight size={15} /> Preview import</>
        }
      </button>
    </div>
  )
}
