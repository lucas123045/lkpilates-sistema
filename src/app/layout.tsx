import './globals.css'
import type { Metadata } from 'next'
import SiteHeader from './components/SiteHeader'
import { FeedbackProvider } from './components/ui/Feedback'

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
        <FeedbackProvider>
          <SiteHeader />

          <main className="container">
            {children}
          </main>
        </FeedbackProvider>
      </body>
    </html>
  )
}