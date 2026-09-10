import './globals.css'
import type { Metadata } from 'next'
import SiteHeader from './components/SiteHeader'

/* ================== METADATA ================== */

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
        <SiteHeader />

        <main className="container">
          {children}
        </main>
      </body>
    </html>
  )
}