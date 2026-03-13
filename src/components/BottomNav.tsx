'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Upload, CreditCard, TrendingUp, BarChart2 } from 'lucide-react'

const navItems = [
  { href: '/',                    label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/import',    label: 'Import',    icon: Upload },
  { href: '/dashboard/accounts',  label: 'Accounts',  icon: CreditCard },
  { href: '/dashboard/pl',        label: 'P&L',       icon: TrendingUp },
  { href: '/dashboard/trends',    label: 'Trends',    icon: BarChart2 },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 md:hidden"
      style={{ backgroundColor: '#131929', borderTop: '1px solid #1e2a3a' }}
    >
      <ul className="flex items-center justify-around px-1 py-2 pb-safe">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition-colors"
              >
                <Icon
                  size={19}
                  style={{ color: active ? '#00D4FF' : '#4a5568' }}
                />
                <span
                  className="text-[9px] font-medium"
                  style={{ color: active ? '#00D4FF' : '#4a5568' }}
                >
                  {label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
