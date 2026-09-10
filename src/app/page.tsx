'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const DESTINO = '/dashboard'
const DURACAO_MS = 1400

export default function HomePage() {
  const router = useRouter()
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    const fim = setTimeout(() => setPronto(true), DURACAO_MS)
    const vai = setTimeout(() => router.push(DESTINO), DURACAO_MS + 350)
    return () => {
      clearTimeout(fim)
      clearTimeout(vai)
    }
  }, [router])

  return (
    <div className="splash">
      <div className="splash-glow splash-glow-a" />
      <div className="splash-glow splash-glow-b" />

      <div className="splash-content">
        <div className="splash-logo-ring">
          <img src="/logo-lk-pilates.png" alt="LK Pilates" className="splash-logo" />
        </div>

        <h1 className="splash-title">LK Pilates</h1>
        <p className="splash-subtitle">Sistema de gestão do estúdio</p>

        <div className="splash-progress">
          <div className="splash-progress-fill" />
        </div>

        <button
          className={`splash-enter${pronto ? ' is-visible' : ''}`}
          onClick={() => router.push(DESTINO)}
        >
          Entrar no sistema
        </button>
      </div>
    </div>
  )
}
