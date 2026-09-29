import './globals.css'
import type { Metadata } from 'next'
import AppShell from './components/shell/AppShell'
import { FeedbackProvider } from './components/ui/Feedback'

/* ================== METADATA ================== */

export const metadata: Metadata = {
  title: 'LK Pilates',
  description: 'Sistema de gestão do estúdio LK Pilates',
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
          <AppShell>{children}</AppShell>
        </FeedbackProvider>
      </body>
    </html>
  )
}