'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, MoreVertical } from 'lucide-react'
import { PALETA_PROFESSORES } from '@/lib/agenda/regras'

/** Menu de acoes da linha (tres pontinhos). */
export function MenuAcoes({ itens }: { itens: { rotulo: string; icone?: React.ReactNode; perigo?: boolean; onClick: () => void }[] }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false)
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  return (
    <div className="acoes" ref={caixa} onClick={e => e.stopPropagation()}>
      <button className="acoes-botao" onClick={() => setAberto(v => !v)} aria-label="Ações" aria-expanded={aberto}>
        <MoreVertical size={18} />
      </button>
      {aberto && (
        <div className="acoes-menu" role="menu">
          {itens.map(i => (
            <button
              key={i.rotulo}
              role="menuitem"
              className={i.perigo ? 'perigo' : ''}
              onClick={() => {
                setAberto(false)
                i.onClick()
              }}
            >
              {i.icone}
              {i.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export const PALETA_SERVICOS = ['#0ea5e9', '#16a34a', '#f97316', '#e11d48', '#d946ef', '#7c3aed', '#1f4fd8', '#ca8a04', '#0f172a', '#64748b']

/** Seletor de cor: paleta acessivel + cor livre. */
export function SeletorCor({ valor, onChange, paleta = PALETA_PROFESSORES, permitirVazio }: {
  valor: string | null
  onChange: (cor: string | null) => void
  paleta?: string[]
  permitirVazio?: boolean
}) {
  return (
    <div className="paleta">
      {permitirVazio && (
        <button
          type="button"
          className={!valor ? 'selecionada' : ''}
          style={{ background: '#fff', color: 'var(--ink-500)', fontSize: 11 }}
          onClick={() => onChange(null)}
          title="Padrão (cor do profissional)"
        >
          {!valor ? <Check size={14} /> : 'A'}
        </button>
      )}
      {paleta.map(c => (
        <button
          key={c}
          type="button"
          className={valor?.toLowerCase() === c ? 'selecionada' : ''}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={`Cor ${c}`}
        >
          {valor?.toLowerCase() === c && <Check size={14} />}
        </button>
      ))}
      <input type="color" value={valor ?? '#1f4fd8'} onChange={e => onChange(e.target.value)} title="Outra cor" />
    </div>
  )
}

export type FiltroAtivos = 'ativos' | 'inativos' | 'todos'

export function SelectAtivos({ valor, onChange, comInativos }: { valor: FiltroAtivos; onChange: (v: FiltroAtivos) => void; comInativos?: boolean }) {
  return (
    <select value={valor} onChange={e => onChange(e.target.value as FiltroAtivos)} aria-label="Status">
      <option value="ativos">Somente ativos</option>
      {comInativos && <option value="inativos">Somente inativos</option>}
      <option value="todos">Todos</option>
    </select>
  )
}

export function passaAtivos(ativo: boolean, f: FiltroAtivos) {
  return f === 'todos' || (f === 'ativos' ? ativo : !ativo)
}

/** Estado de carregamento/erro/vazio padrao das tabelas. */
export function EstadoTabela({ carregando, erro, vazio, onTentar }: { carregando: boolean; erro: string; vazio: React.ReactNode; onTentar?: () => void }) {
  if (carregando) return <div className="ui-skeleton" style={{ height: 160, margin: 20 }} />
  if (erro)
    return (
      <div className="ui-alerta ui-alerta-erro" style={{ margin: 20 }}>
        {erro} {onTentar && <button className="btn btn-sec btn-sm" onClick={onTentar}>Tentar de novo</button>}
      </div>
    )
  return <>{vazio}</>
}
