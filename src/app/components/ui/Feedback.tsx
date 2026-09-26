'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import Modal from './Modal'
import './ui.css'

type TipoToast = 'sucesso' | 'erro' | 'aviso' | 'info'
type AcaoToast = { rotulo: string; onClick: () => void }
type Toast = { id: number; mensagem: string; tipo: TipoToast; acao?: AcaoToast }

type PedidoConfirmacao = {
  titulo: string
  mensagem?: React.ReactNode
  confirmar?: string
  cancelar?: string
  perigo?: boolean
}

type Feedback = {
  toast: (mensagem: string, tipo?: TipoToast, acao?: AcaoToast) => void
  confirmar: (pedido: PedidoConfirmacao) => Promise<boolean>
}

const Contexto = createContext<Feedback | null>(null)

const ICONES = {
  sucesso: CheckCircle2,
  erro: XCircle,
  aviso: AlertTriangle,
  info: Info
}

/** Toasts e dialogo de confirmacao (substituem alert/confirm nas telas novas). */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const proximoId = useRef(1)

  const toast = useCallback((mensagem: string, tipo: TipoToast = 'sucesso', acao?: AcaoToast) => {
    const id = proximoId.current++
    setToasts(t => [...t, { id, mensagem, tipo, acao }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), acao ? 9000 : tipo === 'erro' ? 7000 : 3800)
  }, [])

  const confirmar = useCallback((p: PedidoConfirmacao) => {
    setPedido(p)
    return new Promise<boolean>(resolve => {
      resolver.current = resolve
    })
  }, [])

  function responder(v: boolean) {
    resolver.current?.(v)
    setPedido(null)
  }

  return (
    <Contexto.Provider value={{ toast, confirmar }}>
      {children}

      <div className="ui-toasts" aria-live="polite">
        {toasts.map(t => {
          const Icone = ICONES[t.tipo]
          return (
            <div key={t.id} className={`ui-toast ui-toast-${t.tipo}`} onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}>
              <Icone size={18} />
              <span style={{ flex: 1 }}>{t.mensagem}</span>
              {t.acao && (
                <button
                  className="ui-toast-acao"
                  onClick={e => {
                    e.stopPropagation()
                    setToasts(x => x.filter(y => y.id !== t.id))
                    t.acao!.onClick()
                  }}
                >
                  {t.acao.rotulo}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <Modal
        aberto={!!pedido}
        titulo={pedido?.titulo}
        onFechar={() => responder(false)}
        largura={420}
        rodape={
          <>
            <button className="btn btn-sec" onClick={() => responder(false)}>
              {pedido?.cancelar ?? 'Cancelar'}
            </button>
            <button className={`btn ${pedido?.perigo ? 'btn-danger' : 'ui-btn-azul'}`} onClick={() => responder(true)} autoFocus>
              {pedido?.confirmar ?? 'Confirmar'}
            </button>
          </>
        }
      >
        {typeof pedido?.mensagem === 'string' ? <p>{pedido.mensagem}</p> : pedido?.mensagem}
      </Modal>
    </Contexto.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useFeedback precisa estar dentro de FeedbackProvider')
  return ctx
}

export function mensagemDeErro(e: unknown) {
  return e instanceof Error ? e.message : 'Não foi possível concluir a operação.'
}
