'use client'

import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react'
import { MessageCircle, X, Send, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role:    'user' | 'assistant'
  content: string
  model?:  'haiku' | 'sonnet'
}

// ─── Context (persists state across page navigations) ─────────────────────────

type AICtx = {
  messages:    Message[]
  isOpen:      boolean
  hasUnread:   boolean
  setIsOpen:   (v: boolean) => void
  sendMessage: (text: string) => Promise<void>
  loading:     boolean
}

const AIContext = createContext<AICtx | null>(null)

export function AIAssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [isOpen,    setIsOpenRaw] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [loading,   setLoading]   = useState(false)

  const setIsOpen = useCallback((v: boolean) => {
    setIsOpenRaw(v)
    if (v) setHasUnread(false)
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setLoading(true)

    try {
      const res  = await fetch('/api/assistant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: trimmed }),
      })
      const data = await res.json() as { reply?: string; model?: 'haiku' | 'sonnet'; error?: string }

      const reply: Message = {
        role:    'assistant',
        content: data.reply ?? data.error ?? 'Something went wrong.',
        model:   data.model,
      }

      setMessages(prev => [...prev, reply])

      // Mark unread only if panel is closed
      setIsOpenRaw(open => {
        if (!open) setHasUnread(true)
        return open
      })
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — please try again.' }])
    } finally {
      setLoading(false)
    }
  }, [loading])

  return (
    <AIContext.Provider value={{ messages, isOpen, hasUnread, setIsOpen, sendMessage, loading }}>
      {children}
    </AIContext.Provider>
  )
}

function useAI() {
  const ctx = useContext(AIContext)
  if (!ctx) throw new Error('useAI must be inside AIAssistantProvider')
  return ctx
}

// ─── Starter chips ────────────────────────────────────────────────────────────

const STARTERS = [
  'How much have I spent this month?',
  'Am I on track with my budget?',
  'What are my biggest expenses?',
  'How is my debt health?',
  'Analyse my spending trends',
  'What bills are coming up?',
]

// ─── Chat panel ───────────────────────────────────────────────────────────────

function ChatPanel({ onClose }: { onClose: () => void }) {
  const { messages, sendMessage, loading } = useAI()
  const [input,   setInput]   = useState('')
  const bottomRef             = useRef<HTMLDivElement>(null)
  const inputRef              = useRef<HTMLTextAreaElement>(null)
  const lastModel             = [...messages].reverse().find(m => m.role === 'assistant')?.model

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    // tiny delay so the panel animation finishes first
    const t = setTimeout(() => inputRef.current?.focus(), 200)
    return () => clearTimeout(t)
  }, [])

  async function submit(text: string) {
    if (!text.trim() || loading) return
    setInput('')
    // reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
  }

  return (
    <div
      className="ai-panel-in flex flex-col"
      style={{
        position:        'fixed',
        // Desktop: 320×480 above button; Mobile: full screen
        bottom:          'clamp(80px, 80px, 80px)',
        right:           '0',
        width:           '100%',
        height:          '100%',
        zIndex:          50,
        pointerEvents:   'none',
      }}
    >
      {/* Actual panel box */}
      <div
        className="flex flex-col"
        style={{
          position:        'absolute',
          bottom:          'var(--panel-bottom, 16px)',
          right:           'var(--panel-right, 16px)',
          width:           'min(340px, calc(100vw - 32px))',
          height:          'min(520px, calc(100dvh - 120px))',
          backgroundColor: '#131929',
          border:          '1px solid rgba(255,255,255,0.08)',
          borderRadius:    '20px',
          boxShadow:       '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
          overflow:        'hidden',
          pointerEvents:   'auto',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: 'linear-gradient(135deg, #00D4FF 0%, #A78BFA 100%)' }}
            >
              <MessageCircle size={13} style={{ color: '#0f1923' }} />
            </div>
            <span className="text-sm font-semibold">FinVault AI</span>
            {lastModel && (
              <span
                className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: lastModel === 'sonnet' ? 'rgba(167,139,250,0.15)' : 'rgba(0,212,255,0.1)',
                  color:           lastModel === 'sonnet' ? '#A78BFA' : '#00D4FF',
                  border:          `1px solid ${lastModel === 'sonnet' ? 'rgba(167,139,250,0.25)' : 'rgba(0,212,255,0.2)'}`,
                }}
              >
                {lastModel === 'sonnet' ? 'Sonnet' : 'Haiku'}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            <X size={14} style={{ color: '#8899aa' }} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 && !loading ? (
            <div className="pt-2">
              <p className="text-xs text-center mb-3" style={{ color: '#4a5568' }}>
                Ask anything about your finances
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {STARTERS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => submit(chip)}
                    className="text-left rounded-xl px-3 py-2.5 text-xs font-medium transition-colors"
                    style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#8899aa', lineHeight: '1.3' }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[88%] rounded-2xl px-3 py-2.5 text-xs leading-relaxed"
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.18)', color: '#f0f4f8' }
                        : { backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)', color: '#f0f4f8' }
                    }
                  >
                    {msg.role === 'assistant' && msg.model && (
                      <span
                        className="inline-block text-[8px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full mb-1.5"
                        style={{
                          backgroundColor: msg.model === 'sonnet' ? 'rgba(167,139,250,0.15)' : 'rgba(0,212,255,0.1)',
                          color:           msg.model === 'sonnet' ? '#A78BFA' : '#00D4FF',
                          border:          `1px solid ${msg.model === 'sonnet' ? 'rgba(167,139,250,0.25)' : 'rgba(0,212,255,0.2)'}`,
                        }}
                      >
                        {msg.model === 'sonnet' ? 'Sonnet' : 'Haiku'}
                      </span>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div
                    className="rounded-2xl px-3 py-3"
                    style={{ backgroundColor: '#1a2535', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex gap-1 items-center">
                      <span className="block h-1.5 w-1.5 rounded-full dot-bounce dot-bounce-1" style={{ backgroundColor: '#8899aa' }} />
                      <span className="block h-1.5 w-1.5 rounded-full dot-bounce dot-bounce-2" style={{ backgroundColor: '#8899aa' }} />
                      <span className="block h-1.5 w-1.5 rounded-full dot-bounce dot-bounce-3" style={{ backgroundColor: '#8899aa' }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="shrink-0 px-3 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your finances…"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-xl px-3 py-2.5 text-xs outline-none"
              style={{
                backgroundColor: '#1a2535',
                border:          '1px solid rgba(255,255,255,0.1)',
                color:           '#f0f4f8',
                minHeight:       '38px',
                maxHeight:       '100px',
              }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 100)}px`
              }}
            />
            <button
              onClick={() => submit(input)}
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-opacity"
              style={{ backgroundColor: '#00D4FF', opacity: (!input.trim() || loading) ? 0.35 : 1 }}
            >
              <Send size={13} style={{ color: '#0f1923' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Floating bubble + orchestrator ──────────────────────────────────────────

export function AIAssistantBubble() {
  const { isOpen, setIsOpen, hasUnread } = useAI()
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef   = useRef<HTMLButtonElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        btnRef.current    && !btnRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, setIsOpen])

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <div ref={panelRef}>
          <ChatPanel onClose={() => setIsOpen(false)} />
        </div>
      )}

      {/* Floating bubble */}
      <button
        ref={btnRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open AI assistant"
        className={`ai-pulse fixed z-50 flex items-center justify-center rounded-full shadow-2xl transition-transform active:scale-95`}
        style={{
          bottom:          'var(--bubble-bottom, 24px)',
          right:           '24px',
          width:           '56px',
          height:          '56px',
          background:      isOpen
            ? 'linear-gradient(135deg, #00D4FF 0%, #A78BFA 100%)'
            : '#00D4FF',
          boxShadow:       '0 4px 24px rgba(0,212,255,0.4)',
          // On mobile: lift above bottom nav (~64px tall + 16px gap)
          // CSS custom property overridden via inline style on wrapper
        }}
        // Responsive bottom via Tailwind would need a wrapper; use CSS var trick below
      >
        {/* Unread dot */}
        {hasUnread && !isOpen && (
          <span
            className="absolute top-0 right-0 h-3.5 w-3.5 rounded-full"
            style={{ backgroundColor: '#FF4488', border: '2px solid #0f1923', top: '2px', right: '2px' }}
          />
        )}
        <MessageCircle size={22} style={{ color: '#0f1923' }} />
      </button>

      {/* Responsive bottom offset — mobile: 80px, desktop: 24px */}
      <style>{`
        @media (max-width: 767px) {
          .ai-pulse { bottom: 80px !important; }
          [style*="--panel-bottom"] { --panel-bottom: 148px; }
        }
        @media (min-width: 768px) {
          .ai-pulse { bottom: 24px !important; }
        }
        .ai-panel-in > div {
          --panel-bottom: 88px;
          --panel-right: 24px;
        }
        @media (max-width: 767px) {
          .ai-panel-in > div {
            --panel-bottom: 148px;
            --panel-right: 16px;
            width: calc(100vw - 32px) !important;
            height: min(520px, calc(100dvh - 180px)) !important;
          }
        }
      `}</style>
    </>
  )
}
