'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Upload, CreditCard, TrendingUp, BarChart2 } from 'lucide-react'
import { SignOutButton } from '@/components/SignOutButton'

const navItems = [
  { href: '/',                    label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/import',    label: 'Import',    icon: Upload },
  { href: '/dashboard/accounts',  label: 'Accounts',  icon: CreditCard },
  { href: '/dashboard/pl',        label: 'P&L',       icon: TrendingUp },
  { href: '/dashboard/trends',    label: 'Trends',    icon: BarChart2 },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:px-8"
      style={{ backgroundColor: '#0d1117', borderBottom: '1px solid #1e2a3a' }}
    >
      {/* Left: wordmark + desktop nav links */}
      <div className="flex items-center gap-8">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight shrink-0"
          style={{ color: '#00D4FF', fontFamily: 'var(--font-dm-sans)' }}
        >
          FinVault
        </Link>

        {/* Desktop nav — hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color:           active ? '#00D4FF' : '#8892a4',
                  backgroundColor: active ? 'rgba(0,212,255,0.08)' : 'transparent',
                }}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right: sign out */}
      <SignOutButton />
    </header>
  )
}
