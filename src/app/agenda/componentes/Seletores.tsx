'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { formatarDataLonga, formatarHora, hojeEstudio } from '@/lib/agenda/datas'
import { horarioBloqueado, ocupacao } from '@/lib/agenda/regras'
import { buscarAlunos, carregarPeriodo, proximasAulasAluno } from '@/lib/agenda/servico'
import type { AlunoResumo, DadosPeriodo } from '@/lib/agenda/tipos'
import { agendamentosDaTurma, turmasDoDia } from '../util'

function useAlunosBusca(termo: string, apenasAtivos = false) {
  const [alunos, setAlunos] = useState<AlunoResumo[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    if (termo.trim().length < 2) {
      setAlunos([])
      return
    }
    let vivo = true
    setCarregando(true)
    const t = setTimeout(async () => {
      try {
        const r = await buscarAlunos(termo, apenasAtivos)
        if (vivo) setAlunos(r)
      } finally {
        if (vivo) setCarregando(false)
      }
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [termo, apenasAtivos])

  return { alunos, carregando }
}

/** Campo de busca de aluno para formularios. */
export function SeletorAluno({
  selecionado,
  onSelecionar
}: {
  selecionado: AlunoResumo | null
  onSelecionar: (a: AlunoResumo | null) => void
}) {
  const [termo, setTermo] = useState('')
  const { alunos, carregando } = useAlunosBusca(termo)

  if (selecionado) {
    return (
      <div className="ui-alerta ui-alerta-info" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          <strong>{selecionado.nome}</strong>
          {selecionado.plano ? ` · ${selecionado.plano}` : ''}
          {!selecionado.ativo && ' · inativo'}
        </span>
        <button className="btn btn-sec btn-sm" onClick={() => onSelecionar(null)}>
          Trocar
        </button>
      </div>
    )
  }

  return (
    <div className="ui-campo">
      <input className="input" placeholder="Digite o nome do aluno..." value={termo} onChange={e => setTermo(e.target.value)} autoFocus />
      {termo.trim().length >= 2 && (
        <div className="ui-lista-opcoes" style={{ marginTop: 6 }}>
          {carregando && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Buscando...</div>}
          {!carregando && !alunos.length && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Nenhum aluno encontrado.</div>}
          {alunos.map(a => (
            <button key={a.id} onClick={() => onSelecionar(a)}>
              <span>{a.nome}</span>
              <span className={`ui-chip ${a.ativo ? '' : 'ui-chip-vermelho'}`}>{a.ativo ? a.plano || 'sem plano' : 'inativo'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Busca rapida da barra: "em que horarios a Maria esta?". */
export function BuscaRapidaAluno({ onIrPara }: { onIrPara: (data: string, horarioId: string | null) => void }) {
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [escolhido, setEscolhido] = useState<AlunoResumo | null>(null)
  const [proximas, setProximas] = useState<{ id: number; data: string; hora: string; horario_id: string | null }[] | null>(null)
  const { alunos, carregando } = useAlunosBusca(termo)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false)
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  async function escolher(a: AlunoResumo) {
    setEscolhido(a)
    setProximas(null)
    setProximas(await proximasAulasAluno(a.id, hojeEstudio()))
  }

  return (
    <div className="ag-busca" ref={caixa}>
      <Search size={15} />
      <input
        placeholder="Buscar aluno na agenda..."
        value={termo}
        onFocus={() => setAberto(true)}
        onChange={e => {
          setTermo(e.target.value)
          setEscolhido(null)
          setAberto(true)
        }}
      />
      {aberto && termo.trim().length >= 2 && (
        <div className="ui-lista-opcoes ag-busca-resultado">
          {carregando && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Buscando...</div>}
          {!carregando && !alunos.length && <div style={{ padding: 10, color: 'var(--ink-500)' }}>Nenhum aluno encontrado.</div>}
          {alunos.map(a => (
            <div key={a.id}>
              <button className={escolhido?.id === a.id ? 'selecionado' : ''} onClick={() => escolher(a)}>
                <span>{a.nome}</span>
                {!a.ativo && <span className="ui-chip ui-chip-vermelho">inativo</span>}
              </button>
              {escolhido?.id === a.id && (
                <div className="ag-proximas">
                  {proximas === null && 'Carregando...'}
                  {proximas?.length === 0 && 'Sem aulas agendadas a partir de hoje.'}
                  {proximas?.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        onIrPara(p.data, p.horario_id)
                        setAberto(false)
                      }}
                    >
                      {formatarDataLonga(p.data)} às {formatarHora(p.hora)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Escolha de data + turma com vagas (para remarcar e para lista de espera/adicionar em outro dia). */
export function SeletorHorario({
  dataInicial,
  horarioSelecionado,
  onSelecionar,
  ignorarHorarioId,
  permitirLotado = true
}: {
  dataInicial: string
  horarioSelecionado: { data: string; horarioId: string } | null
  onSelecionar: (s: { data: string; horarioId: string; lotado: boolean } | null) => void
  ignorarHorarioId?: { data: string; horarioId: string }
  permitirLotado?: boolean
}) {
  const [data, setData] = useState(dataInicial)
  const [dados, setDados] = useState<DadosPeriodo | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setDados(null)
    setErro('')
    carregarPeriodo(data, data)
      .then(d => vivo && setDados(d))
      .catch(e => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [data])

  const turmas = dados ? turmasDoDia(dados, data).filter(h => h.ativo) : []

  return (
    <div>
      <div className="ui-campo">
        <label className="label">Data</label>
        <input
          className="input"
          type="date"
          value={data}
          onChange={e => {
            setData(e.target.value)
            onSelecionar(null)
          }}
        />
      </div>
      {erro && <div className="ui-alerta ui-alerta-erro">{erro}</div>}
      {!dados && !erro && <div className="ui-skeleton" style={{ height: 64 }} />}
      {dados && !turmas.length && <p style={{ color: 'var(--ink-500)' }}>Nenhuma turma neste dia.</p>}
      {dados && turmas.length > 0 && (
        <div className="ag-opcoes-horario">
          {turmas.map(h => {
            const bloqueio = horarioBloqueado(dados.bloqueios, h.id, data)
            const oc = ocupacao(h.capacidade, agendamentosDaTurma(dados, h.id, data), !!bloqueio)
            const mesmo = ignorarHorarioId?.data === data && ignorarHorarioId?.horarioId === h.id
            const desabilitado = !!bloqueio || mesmo || (!permitirLotado && oc.nivel === 'lotado')
            const sel = horarioSelecionado?.data === data && horarioSelecionado?.horarioId === h.id
            return (
              <button
                key={h.id}
                className={`ag-opcao-horario${sel ? ' selecionado' : ''}`}
                disabled={desabilitado}
                onClick={() => onSelecionar({ data, horarioId: h.id, lotado: oc.nivel === 'lotado' })}
              >
                <strong>{formatarHora(h.hora_inicio)}</strong>
                <span className={`ag-ocupacao ag-nivel-${oc.nivel}`} style={{ fontSize: 11.5, padding: '2px 7px' }}>
                  {bloqueio ? 'Bloqueado' : mesmo ? 'Atual' : `${oc.vagas} vaga${oc.vagas === 1 ? '' : 's'}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
