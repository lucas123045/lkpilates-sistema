'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useBloqueioRolagem } from './bloqueioRolagem'
import './ui.css'

export type Ancora = { x: number; y: number; largura?: number; altura?: number }

type Props = {
  ancora: Ancora
  onFechar: () => void
  children: React.ReactNode
  largura?: number
  cabecalho?: React.ReactNode
  corTopo?: string
}

const MOBILE = 640

/** Popover flutuante (desktop) que vira bottom sheet no celular. */
export default function Popover({ ancora, onFechar, children, largura = 380, cabecalho, corTopo }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [mobile, setMobile] = useState(false)

  useLayoutEffect(() => {
    const ehMobile = window.innerWidth < MOBILE
    setMobile(ehMobile)
    if (ehMobile || !caixa.current) return
    const w = caixa.current.offsetWidth
    const h = caixa.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const aw = ancora.largura ?? 0
    // prefere a direita da ancora; se nao couber, a esquerda
    let left = ancora.x + aw + 8
    if (left + w > vw - 8) left = ancora.x - w - 8
    if (left < 8) left = Math.max(8, Math.min(vw - w - 8, ancora.x))
    let top = ancora.y
    if (top + h > vh - 8) top = vh - h - 8
    if (top < 8) top = 8
    setPos({ left, top })
  }, [ancora, children])

  const fechar = useRef(onFechar)
  fechar.current = onFechar

  // no celular vira bottom sheet sobre a pagina: trava a rolagem do fundo
  useBloqueioRolagem(mobile)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current()
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar.current()
    }
    document.addEventListener('keydown', tecla)
    // adia para nao capturar o proprio clique que abriu o popover
    const t = setTimeout(() => document.addEventListener('mousedown', fora), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('mousedown', fora)
    }
  }, [])

  const conteudo = (
    <div
      ref={caixa}
      className={mobile ? 'ui-sheet' : 'ui-popover'}
      role="dialog"
      style={mobile ? undefined : { width: largura, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {corTopo && <div className="ui-popover-cor" style={{ background: corTopo }} />}
      <div className="ui-popover-topo">
        <div style={{ flex: 1, minWidth: 0 }}>{cabecalho}</div>
        <button className="ui-icon-btn" onClick={onFechar} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>
      <div className="ui-popover-corpo">{children}</div>
    </div>
  )

  return mobile ? <div className="ui-overlay ui-overlay-sheet">{conteudo}</div> : conteudo
}
