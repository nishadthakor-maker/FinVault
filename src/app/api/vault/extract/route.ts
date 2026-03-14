import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const anthropic = new Anthropic()

const EXTRACTION_PROMPT = `Extract the key financial details from this document. Return ONLY a JSON object with no markdown, no explanation — just raw JSON:
{
  "provider": "string (company or authority name)",
  "document_type": "council_tax | water | energy | insurance | car | payslip | other",
  "annual_amount": number or null,
  "monthly_amount": number or null,
  "start_date": "YYYY-MM-DD or null",
  "end_date": "YYYY-MM-DD or null",
  "reference_number": "string or null",
  "notes": "brief description of key details"
}`

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const documentType = formData.get('document_type') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'

  // Upload file to Supabase Storage
  const storagePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: mimeType })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(storagePath)

  // Send to Claude Haiku for extraction
  let extracted: Record<string, unknown> = {}
  try {
      const isPdf = mimeType === 'application/pdf'
    const response = isPdf
      ? await anthropic.beta.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          betas: ['pdfs-2024-09-25'],
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          }],
        })
      : await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
              { type: 'text', text: EXTRACTION_PROMPT },
            ],
          }],
        })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      extracted = JSON.parse(jsonMatch[0])
    }
  } catch (err) {
    console.error('Claude extraction error:', err)
    // Continue with empty extraction — file is already uploaded
  }

  // Save document record
  const { data: doc, error: dbError } = await supabase
    .from('documents')
    .insert({
      user_id:   user.id,
      name:      (extracted.provider as string) || file.name,
      type:      (extracted.document_type as string) || documentType || 'other',
      file_url:  storagePath,
      file_size: file.size,
      mime_type: mimeType,
      metadata:  extracted,
      notes:     (extracted.notes as string) || null,
    })
    .select()
    .single()

  if (dbError) {
    console.error('DB insert error:', dbError)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }

  return NextResponse.json({ document: doc, extracted })
}
