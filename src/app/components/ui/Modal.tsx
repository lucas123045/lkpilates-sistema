'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useBloqueioRolagem } from './bloqueioRolagem'
import './ui.css'

type Props = {
  aberto: boolean
  titulo: React.ReactNode
  subtitulo?: React.ReactNode
  onFechar: () => void
  children: React.ReactNode
  rodape?: React.ReactNode
  largura?: number
}

/** Modal simples; no celular vira uma "gaveta" que sobe de baixo. */
export default function Modal({ aberto, titulo, subtitulo, onFechar, children, rodape, largura = 520 }: Props) {
  // onFechar costuma ser funcao inline: guardado num ref para o efeito nao rodar a cada render
  const fechar = useRef(onFechar)
  fechar.current = onFechar

  useBloqueioRolagem(aberto)

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto])

  if (!aberto) return null

  return (
    <div className="ui-overlay" onMouseDown={e => e.target === e.currentTarget && onFechar()}>
      <div className="ui-modal" role="dialog" aria-modal="true" style={{ maxWidth: largura }}>
        <div className="ui-modal-header">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="ui-modal-sub">{subtitulo}</p>}
          </div>
          <button className="ui-icon-btn" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="ui-modal-body">{children}</div>
        {rodape && <div className="ui-modal-footer">{rodape}</div>}
      </div>
    </div>
  )
}
