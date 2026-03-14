'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Image as ImageIcon, Sparkles, Calendar, PoundSterling, X, Check, AlertCircle } from 'lucide-react'

type DocMeta = {
  provider?: string | null
  document_type?: string | null
  annual_amount?: number | null
  monthly_amount?: number | null
  start_date?: string | null
  end_date?: string | null
  reference_number?: string | null
  notes?: string | null
}

type Document = {
  id: string
  name: string
  type: string
  file_url: string
  file_size: number
  mime_type: string
  metadata: DocMeta | null
  notes: string | null
  created_at: string
}

const DOC_TYPES = [
  { value: 'council_tax', label: 'Council Tax' },
  { value: 'water',       label: 'Water Bill' },
  { value: 'energy',      label: 'Energy Bill' },
  { value: 'insurance',   label: 'Insurance' },
  { value: 'car',         label: 'Car' },
  { value: 'payslip',     label: 'Payslip' },
  { value: 'other',       label: 'Other' },
]

const TYPE_COLORS: Record<string, string> = {
  council_tax: '#A78BFA',
  water:       '#00D4FF',
  energy:      '#FFB800',
  insurance:   '#00FF94',
  car:         '#FF8C00',
  payslip:     '#00FF94',
  other:       '#8899aa',
}

function gbp(n: number) {
  return n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(d: string): number {
  const diff = new Date(d + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86400000)
}

function urgencyColor(days: number): string {
  if (days < 0)   return '#8899aa'
  if (days <= 30) return '#FF4488'
  if (days <= 90) return '#FFB800'
  return '#00FF94'
}

export function VaultClient({ initialDocs }: { initialDocs: Document[] }) {
  const [docs, setDocs]               = useState<Document[]>(initialDocs)
  const [dragging, setDragging]       = useState(false)
  const [docType, setDocType]         = useState('other')
  const [uploading, setUploading]     = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg]     = useState('')
  const [forecastingId, setForecastingId] = useState<string | null>(null)
  const [forecastResults, setForecastResults] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowed.includes(file.type)) {
      setUploadStatus('error')
      setStatusMsg('Only PDF, JPG, and PNG files are supported')
      return
    }

    setUploading(true)
    setUploadStatus('idle')
    setStatusMsg(`Uploading and extracting from ${file.name}…`)

    const form = new FormData()
    form.append('file', file)
    form.append('document_type', docType)

    try {
      const res = await fetch('/api/vault/extract', { method: 'POST', body: form })
      const json = await res.json() as { document?: Document; error?: string }

      if (!res.ok || json.error) {
        setUploadStatus('error')
        setStatusMsg(json.error ?? 'Upload failed')
      } else if (json.document) {
        setDocs(prev => [json.document!, ...prev])
        setUploadStatus('success')
        setStatusMsg(`Extracted: ${json.document.name}`)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch {
      setUploadStatus('error')
      setStatusMsg('Network error — please try again')
    } finally {
      setUploading(false)
    }
  }, [docType])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const createForecastEvents = async (docId: string) => {
    setForecastingId(docId)
    try {
      const res = await fetch('/api/vault/forecast-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      })
      const json = await res.json() as { message?: string; count?: number; error?: string }
      setForecastResults(prev => ({
        ...prev,
        [docId]: json.error ? `Error: ${json.error}` : `${json.message} (${json.count ?? 0} events)`,
      }))
    } catch {
      setForecastResults(prev => ({ ...prev, [docId]: 'Failed — please try again' }))
    } finally {
      setForecastingId(null)
    }
  }

  return (
    <div className="space-y-6">

      {/* Upload area */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: '#8899aa', letterSpacing: '0.08em' }}>
          Upload Document
        </h2>

        {/* Type selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {DOC_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setDocType(t.value)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: docType === t.value ? `${TYPE_COLORS[t.value]}20` : 'rgba(255,255,255,0.04)',
                color:           docType === t.value ? TYPE_COLORS[t.value] : '#8899aa',
                border:          `1px solid ${docType === t.value ? TYPE_COLORS[t.value] + '60' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          className="relative flex flex-col items-center justify-center gap-3 rounded-xl py-10 px-4 cursor-pointer transition-colors"
          style={{
            border:          `2px dashed ${dragging ? '#00D4FF' : 'rgba(255,255,255,0.12)'}`,
            backgroundColor: dragging ? 'rgba(0,212,255,0.05)' : 'rgba(255,255,255,0.02)',
          }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          <Upload size={28} style={{ color: dragging ? '#00D4FF' : '#4a5568' }} />
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: dragging ? '#00D4FF' : '#f0f4f8' }}>
              {uploading ? 'Processing…' : 'Drop file here or click to browse'}
            </p>
            <p className="text-xs mt-1" style={{ color: '#4a5568' }}>PDF, JPG, PNG supported</p>
          </div>
          {uploading && (
            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: '#00D4FF' }} />
          )}
        </div>

        {/* Status */}
        {statusMsg && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: uploadStatus === 'error'   ? 'rgba(255,68,136,0.1)'
                             : uploadStatus === 'success' ? 'rgba(0,255,148,0.1)'
                             : 'rgba(255,255,255,0.05)',
              color: uploadStatus === 'error'   ? '#FF4488'
                   : uploadStatus === 'success' ? '#00FF94'
                   : '#8899aa',
            }}
          >
            {uploadStatus === 'success' && <Check size={14} />}
            {uploadStatus === 'error'   && <AlertCircle size={14} />}
            {uploadStatus === 'idle'    && <Sparkles size={14} />}
            {statusMsg}
          </div>
        )}
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}>
          <FileText size={32} className="mx-auto mb-3" style={{ color: '#4a5568' }} />
          <p className="text-sm" style={{ color: '#4a5568' }}>No documents yet — upload one above</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {docs.map(doc => {
            const meta       = doc.metadata
            const typeColor  = TYPE_COLORS[doc.type] ?? '#8899aa'
            const typeLabel  = DOC_TYPES.find(t => t.value === doc.type)?.label ?? doc.type
            const endDate    = meta?.end_date
            const days       = endDate ? daysUntil(endDate) : null
            const renewColor = days !== null ? urgencyColor(days) : '#8899aa'
            const isImage    = doc.mime_type?.startsWith('image/')
            const forecastResult = forecastResults[doc.id]

            return (
              <div
                key={doc.id}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${typeColor}18` }}
                    >
                      {isImage
                        ? <ImageIcon size={15} style={{ color: typeColor }} />
                        : <FileText  size={15} style={{ color: typeColor }} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{doc.name}</p>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${typeColor}18`, color: typeColor }}
                      >
                        {typeLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Amounts */}
                {(meta?.annual_amount || meta?.monthly_amount) && (
                  <div className="flex items-center gap-4">
                    {meta.annual_amount && (
                      <div className="flex items-center gap-1.5">
                        <PoundSterling size={12} style={{ color: '#8899aa' }} />
                        <span className="text-xs" style={{ color: '#8899aa' }}>Annual</span>
                        <span className="text-sm font-semibold" style={{ color: '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}>
                          {gbp(meta.annual_amount)}
                        </span>
                      </div>
                    )}
                    {meta.monthly_amount && (
                      <div className="flex items-center gap-1.5">
                        <PoundSterling size={12} style={{ color: '#8899aa' }} />
                        <span className="text-xs" style={{ color: '#8899aa' }}>/mo</span>
                        <span className="text-sm font-semibold" style={{ color: '#f0f4f8', fontFamily: 'var(--font-dm-mono)' }}>
                          {gbp(meta.monthly_amount)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Dates */}
                <div className="flex flex-wrap gap-3">
                  {meta?.start_date && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} style={{ color: '#4a5568' }} />
                      <span className="text-xs" style={{ color: '#4a5568' }}>From {fmtDate(meta.start_date)}</span>
                    </div>
                  )}
                  {endDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} style={{ color: renewColor }} />
                      <span className="text-xs" style={{ color: renewColor }}>
                        {days !== null && days >= 0
                          ? `Renews ${fmtDate(endDate)} · ${days}d`
                          : `Expired ${fmtDate(endDate)}`
                        }
                      </span>
                    </div>
                  )}
                  {meta?.reference_number && (
                    <span className="text-xs" style={{ color: '#4a5568' }}>Ref: {meta.reference_number}</span>
                  )}
                </div>

                {/* Notes */}
                {meta?.notes && (
                  <p className="text-xs leading-relaxed" style={{ color: '#8899aa' }}>{meta.notes}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 mt-auto">
                  <button
                    onClick={() => createForecastEvents(doc.id)}
                    disabled={forecastingId === doc.id || !!forecastResult}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: forecastResult ? 'rgba(0,255,148,0.08)' : 'rgba(0,212,255,0.1)',
                      color:           forecastResult ? '#00FF94' : '#00D4FF',
                    }}
                  >
                    {forecastingId === doc.id ? (
                      <>
                        <div className="w-3 h-3 rounded-full border border-transparent animate-spin" style={{ borderTopColor: '#00D4FF' }} />
                        Creating…
                      </>
                    ) : forecastResult ? (
                      <><Check size={12} /> Events created</>
                    ) : (
                      <><Calendar size={12} /> Create Forecast Events</>
                    )}
                  </button>
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#4a5568' }}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
                {forecastResult && (
                  <p className="text-xs" style={{ color: '#00FF94' }}>{forecastResult}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
