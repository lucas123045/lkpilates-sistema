'use client'

import { useCallback, useRef, useState } from 'react'
import Modal from '@/app/components/ui/Modal'
import type { EscopoRecorrencia } from '@/lib/agenda/servico'

const OPCOES: { id: EscopoRecorrencia; rotulo: string; ajuda: string }[] = [
  { id: 'esta', rotulo: 'Somente esta aula', ajuda: 'As outras semanas continuam iguais.' },
  { id: 'seguintes', rotulo: 'Esta e as seguintes', ajuda: 'A turma muda a partir desta data; as anteriores ficam como estão.' },
  { id: 'todas', rotulo: 'Todas as aulas', ajuda: 'Muda a turma inteira. Aulas passadas e já marcadas nunca são alteradas.' }
]

/** Pergunta "Somente esta / Esta e as seguintes / Todas" e devolve a escolha (ou null). */
export function useRecorrencia() {
  const [pedido, setPedido] = useState<{ titulo: string } | null>(null)
  const [escolha, setEscolha] = useState<EscopoRecorrencia>('esta')
  const resolver = useRef<((v: EscopoRecorrencia | null) => void) | null>(null)

  const perguntar = useCallback((titulo: string) => {
    setEscolha('esta')
    setPedido({ titulo })
    return new Promise<EscopoRecorrencia | null>(r => {
      resolver.current = r
    })
  }, [])

  function responder(v: EscopoRecorrencia | null) {
    resolver.current?.(v)
    resolver.current = null
    setPedido(null)
  }

  const elemento = (
    <Modal
      aberto={!!pedido}
      titulo={pedido?.titulo ?? ''}
      onFechar={() => responder(null)}
      largura={420}
      rodape={
        <>
          <button className="btn btn-sec" onClick={() => responder(null)}>
            Cancelar
          </button>
          <button className="btn ui-btn-azul" onClick={() => responder(escolha)} autoFocus>
            OK
          </button>
        </>
      }
    >
      {OPCOES.map(o => (
        <label key={o.id} className="ui-check" style={{ marginBottom: 12 }}>
          <input type="radio" name="recorrencia" checked={escolha === o.id} onChange={() => setEscolha(o.id)} />
          <span>
            <strong style={{ color: 'var(--ink-900)' }}>{o.rotulo}</strong>
            <br />
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{o.ajuda}</span>
          </span>
        </label>
      ))}
    </Modal>
  )

  return { elemento, perguntar }
}
