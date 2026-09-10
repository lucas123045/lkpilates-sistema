'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, ClipboardList, LayoutGrid, LineChart, UsersRound } from 'lucide-react'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/aulas', label: 'Aulas', icon: CalendarCheck },
  { href: '/alunos', label: 'Cadastros', icon: UsersRound },
  { href: '/relatorios', label: 'Relatórios', icon: ClipboardList },
  { href: '/resultados', label: 'Resultados', icon: LineChart }
]

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="site-header">
      <Link href="/dashboard" className="brand">
        <img src="/logo-lk-pilates.png" className="brand-logo" alt="LK Pilates" />
        <span className="brand-name">LK Pilates</span>
      </Link>

      <nav className="site-nav">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link key={href} href={href} className={`nav-link${active ? ' is-active' : ''}`}>
              <Icon size={15} strokeWidth={2} />
              {label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
