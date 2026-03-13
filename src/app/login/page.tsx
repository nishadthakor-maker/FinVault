'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0d1117' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <span
            className="text-3xl font-bold tracking-tight"
            style={{ color: '#00D4FF' }}
          >
            FinVault
          </span>
          <p className="mt-2 text-sm" style={{ color: '#8892a4' }}>
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-6 sm:p-8"
          style={{ backgroundColor: '#131929', borderColor: '#1e2a3a' }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#8892a4' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-[#4a5568]"
                style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #1e2a3a',
                  color: '#f0f4f8',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#00D4FF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2a3a')}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#8892a4' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-[#4a5568]"
                style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #1e2a3a',
                  color: '#f0f4f8',
                  fontFamily: 'var(--font-dm-mono)',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#00D4FF')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2a3a')}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm rounded-lg px-4 py-2.5" style={{ color: '#FF4488', backgroundColor: '#FF448815' }}>
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#00D4FF', color: '#0d1117' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
