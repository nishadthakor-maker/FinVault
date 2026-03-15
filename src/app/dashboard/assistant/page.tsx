'use client'

import { useState, useRef, useEffect } from 'react'
import { TopNav } from '@/components/TopNav'
import { BottomNav } from '@/components/BottomNav'
import { Send } from 'lucide-react'

type Message = {
  role: 'user' | 'assistant'
  content: string
  model?: 'haiku' | 'sonnet'
}

const STARTER_CHIPS = [
  'How much have I spent this month?',
  'Am I on track with my budget?',
  'What are my biggest expenses?',
  'How is my debt health?',
  'Analyse my spending trends',
  'What bills are coming up?',
]

export default function AssistantPage() {
  const [messages, setMessages]   = useState<Message[]>([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const bottomRef                 = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed }),
      })
      const data = await res.json() as { reply?: string; model?: 'haiku' | 'sonnet'; error?: string }

      setMessages(prev => [...prev, {
        role:    'assistant',
        content: data.reply ?? data.error ?? 'Something went wrong.',
        model:   data.model,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: 'Network error — please try again.',
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#0f1923', color: '#f0f4f8' }}>
      <TopNav />

      {/* Scrollable conversation area */}
      <main
        className="flex-1 overflow-y-auto px-4 pt-6 pb-40 md:pb-24 mx-auto w-full max-w-2xl"
      >
        {messages.length === 0 && !loading ? (
          /* Empty state */
          <div className="flex flex-col items-center pt-8">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(167,139,250,0.15) 100%)', border: '1px solid rgba(0,212,255,0.2)' }}
            >
              <span className="text-2xl">✦</span>
            </div>
            <h2 className="text-lg font-semibold mb-1">FinVault AI</h2>
            <p className="text-sm mb-8" style={{ color: '#8899aa' }}>Ask anything about your finances</p>

            {/* Starter chips */}
            <div className="grid grid-cols-2 gap-2 w-full">
              {STARTER_CHIPS.map(chip => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  className="text-left rounded-xl px-3 py-3 text-xs font-medium transition-colors"
                  style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#8899aa' }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                  style={
                    msg.role === 'user'
                      ? { backgroundColor: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.2)', color: '#f0f4f8' }
                      : { backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#f0f4f8' }
                  }
                >
                  {msg.role === 'assistant' && msg.model && (
                    <span
                      className="inline-block text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full mb-2"
                      style={{
                        backgroundColor: msg.model === 'sonnet' ? 'rgba(167,139,250,0.15)' : 'rgba(0,212,255,0.12)',
                        color: msg.model === 'sonnet' ? '#A78BFA' : '#00D4FF',
                        border: `1px solid ${msg.model === 'sonnet' ? 'rgba(167,139,250,0.3)' : 'rgba(0,212,255,0.2)'}`,
                      }}
                    >
                      {msg.model === 'sonnet' ? 'Sonnet' : 'Haiku'}
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        className="block h-1.5 w-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: '#8899aa', animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      {/* Fixed input bar */}
      <div
        className="fixed bottom-16 md:bottom-0 left-0 right-0 px-4 py-3 md:py-4"
        style={{ backgroundColor: '#0f1923', borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="mx-auto max-w-2xl flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            style={{
              backgroundColor: '#1a2535',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f0f4f8',
              minHeight: '44px',
              maxHeight: '120px',
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-opacity"
            style={{
              backgroundColor: '#00D4FF',
              opacity: (!input.trim() || loading) ? 0.4 : 1,
            }}
          >
            <Send size={16} style={{ color: '#0f1923' }} />
          </button>
        </div>
      </div>
    </div>
  )
}
