import './globals.css'
import Link from 'next/link'
import type { Metadata } from 'next'

/* ================== METADATA (ÍCONE / TÍTULO) ================== */

export const metadata: Metadata = {
  title: 'LK Pilates',
  description: 'Sistema de controle de alunos e aulas',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png'
  }
}

/* ================== LAYOUT ================== */

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>
        {/* HEADER */}
        <header className="header">
          <img src="/logo-lk-pilates.png" className="logo" alt="LK Pilates" />
          <h1>LK Pilates – Sistema</h1>
        </header>

        {/* MENU */}
        <nav className="menu">
          <Link href="/dashboard" className="menu-btn">Dashboard</Link>
          <Link href="/aulas" className="menu-btn">Aulas</Link>
          <Link href="/alunos" className="menu-btn">Cadastros</Link>
          <Link href="/relatorios" className="menu-btn">Relatórios</Link>
        </nav>

        {/* CONTEÚDO */}
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  )
}
