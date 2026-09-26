'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Menu, Search, X } from 'lucide-react'
import { formatarDataLonga, formatarHora, hojeEstudio } from '@/lib/agenda/datas'
import { iniciais } from '@/lib/agenda/regras'
import { buscarAlunos, proximasAulasAluno, proximasAulasProfessor } from '@/lib/agenda/servico'
import type { Agendamento, AlunoResumo, Professor } from '@/lib/agenda/tipos'
import type { Visao } from './preferencias'

export const VISOES: { id: Visao; rotulo: string; tecla: string }[] = [
  { id: 'timeGridDay', rotulo: 'Dia', tecla: 'D' },
  { id: 'timeGridWeek', rotulo: 'Semana', tecla: 'W' },
  { id: 'dayGridMonth', rotulo: 'Mês', tecla: 'M' },
  { id: 'programacao', rotulo: 'Programação', tecla: 'A' },
  { id: 'tresDias', rotulo: '3 dias', tecla: '' }
]

export type BarraSuperiorRef = { focarBusca: () => void }

type Props = {
  titulo: string
  visao: Visao
  professores: Professor[]
  carregando: boolean
  onMenu: () => void
  onHoje: () => void
  onAnterior: () => void
  onProximo: () => void
  onVisao: (v: Visao) => void
  onIrPara: (data: string, horarioId: string | null) => void
}

const BarraSuperior = forwardRef<BarraSuperiorRef, Props>(function BarraSuperior(p, ref) {
  const [buscaAberta, setBuscaAberta] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    focarBusca: () => {
      setBuscaAberta(true)
      setTimeout(() => input.current?.focus(), 0)
    }
  }))

  return (
    <header className="gc-topo">
      <button className="ui-icon-btn gc-menu" onClick={p.onMenu} aria-label="Menu principal">
        <Menu size={20} />
      </button>
      <button className="btn btn-sec gc-hoje" onClick={p.onHoje} title="Hoje (T)">
        Hoje
      </button>
      <div className="gc-setas">
        <button className="ui-icon-btn" onClick={p.onAnterior} aria-label="Anterior" title="Anterior (K)">
          <ChevronLeft size={20} />
        </button>
        <button className="ui-icon-btn" onClick={p.onProximo} aria-label="Próximo" title="Próximo (J)">
          <ChevronRight size={20} />
        </button>
      </div>
      <h1 className="gc-titulo">{p.titulo}</h1>
      {p.carregando && <span className="gc-carregando" aria-label="Carregando" />}

      <div className="gc-topo-direita">
        <BuscaAgenda
          aberta={buscaAberta}
          onAbrir={() => setBuscaAberta(true)}
          onFechar={() => setBuscaAberta(false)}
          input={input}
          professores={p.professores}
          onIrPara={(d, h) => {
            setBuscaAberta(false)
            p.onIrPara(d, h)
          }}
        />
        <select className="gc-visao" value={p.visao} onChange={e => p.onVisao(e.target.value as Visao)} aria-label="Visualização">
          {VISOES.map(v => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
              {v.tecla ? ` (${v.tecla})` : ''}
            </option>
          ))}
        </select>
      </div>
    </header>
  )
})

export default BarraSuperior

/* ---------------- Busca por aluno ou professor ---------------- */

function BuscaAgenda({
  aberta,
  onAbrir,
  onFechar,
  input,
  professores,
  onIrPara
}: {
  aberta: boolean
  onAbrir: () => void
  onFechar: () => void
  input: React.RefObject<HTMLInputElement>
  professores: Professor[]
  onIrPara: (data: string, horarioId: string | null) => void
}) {
  const [termo, setTermo] = useState('')
  const [alunos, setAlunos] = useState<AlunoResumo[]>([])
  const [escolhido, setEscolhido] = useState<{ tipo: 'aluno' | 'professor'; id: string; nome: string } | null>(null)
  const [aulas, setAulas] = useState<Agendamento[] | null>(null)
  const caixa = useRef<HTMLDivElement>(null)

  const profs = termo.trim().length >= 2 ? professores.filter(p => p.nome.toLowerCase().includes(termo.trim().toLowerCase())) : []

  useEffect(() => {
    if (termo.trim().length < 2) return setAlunos([])
    let vivo = true
    const t = setTimeout(() => buscarAlunos(termo).then(r => vivo && setAlunos(r)).catch(() => {}), 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [termo])

  useEffect(() => {
    if (!aberta) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node) && !termo) onFechar()
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberta, termo, onFechar])

  async function escolher(tipo: 'aluno' | 'professor', id: string, nome: string) {
    setEscolhido({ tipo, id, nome })
    setAulas(null)
    const hoje = hojeEstudio()
    setAulas(tipo === 'aluno' ? await proximasAulasAluno(id, hoje, 12) : await proximasAulasProfessor(id, hoje, 15))
  }

  function limpar() {
    setTermo('')
    setEscolhido(null)
    setAulas(null)
    onFechar()
  }

  if (!aberta) {
    return (
      <button className="ui-icon-btn" onClick={onAbrir} aria-label="Buscar" title="Buscar (/)">
        <Search size={20} />
      </button>
    )
  }

  return (
    <div className="gc-busca" ref={caixa}>
      <Search size={16} />
      <input
        ref={input}
        placeholder="Buscar aluno ou professor"
        value={termo}
        onChange={e => {
          setTermo(e.target.value)
          setEscolhido(null)
        }}
        onKeyDown={e => e.key === 'Escape' && limpar()}
        autoFocus
      />
      <button className="ui-icon-btn" onClick={limpar} aria-label="Fechar busca">
        <X size={16} />
      </button>

      {termo.trim().length >= 2 && (
        <div className="gc-busca-resultado">
          {escolhido ? (
            <>
              <button className="gc-busca-voltar" onClick={() => setEscolhido(null)}>
                ← {escolhido.nome}
              </button>
              {aulas === null && <p className="gc-busca-vazio">Carregando...</p>}
              {aulas?.length === 0 && <p className="gc-busca-vazio">Nenhuma aula a partir de hoje.</p>}
              {aulas?.map(a => (
                <button key={a.id} className="gc-busca-item" onClick={() => onIrPara(a.data, a.horario_id)}>
                  <span>{formatarDataLonga(a.data)}</span>
                  <b>{formatarHora(a.hora)}</b>
                </button>
              ))}
            </>
          ) : (
            <>
              {profs.length > 0 && <div className="gc-busca-grupo">Professores</div>}
              {profs.map(p => (
                <button key={p.id} className="gc-busca-item" onClick={() => escolher('professor', p.id, p.nome)}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="ag-avatar pequeno" style={{ background: p.cor }}>{iniciais(p.nome)}</span>
                    {p.nome}
                  </span>
                </button>
              ))}
              {alunos.length > 0 && <div className="gc-busca-grupo">Alunos</div>}
              {alunos.map(a => (
                <button key={a.id} className="gc-busca-item" onClick={() => escolher('aluno', a.id, a.nome)}>
                  <span>{a.nome}</span>
                  {!a.ativo && <span className="ui-chip ui-chip-vermelho">inativo</span>}
                </button>
              ))}
              {!profs.length && !alunos.length && <p className="gc-busca-vazio">Nada encontrado.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
