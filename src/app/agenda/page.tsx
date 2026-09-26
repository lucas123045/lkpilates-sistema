'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Ban, CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import {
  formatarData,
  formatarDataLonga,
  formatarHora,
  hojeEstudio,
  inicioSemana,
  somarDias
} from '@/lib/agenda/datas'
import { conflitosDeProfessor, horarioBloqueado, resumoDoDia } from '@/lib/agenda/regras'
import { carregarPeriodo, marcarStatus, marcarTodosPresentes } from '@/lib/agenda/servico'
import type { Agendamento, DadosPeriodo, Horario } from '@/lib/agenda/tipos'
import CardTurma from './componentes/CardTurma'
import ModalAdicionar from './componentes/ModalAdicionar'
import ModalAgendamento from './componentes/ModalAgendamento'
import { ModalBloqueio, ModalCancelarAula, ModalListaEspera, ModalProfessorTurma } from './componentes/ModaisTurma'
import { LegendaProfessores } from './componentes/Professores'
import ResumoDia from './componentes/ResumoDia'
import { BuscaRapidaAluno } from './componentes/Seletores'
import VisaoSemana from './componentes/VisaoSemana'
import { FILTROS_VAZIOS, mapaProfessores, montarDia, nomePessoa, turmasDoDia, type Filtros } from './util'
import '@/app/components/ui/ui.css'
import './agenda.css'

type Modo = 'dia' | 'semana'
type TurmaSel = { horario: Horario; data: string }

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/

export default function AgendaPage() {
  return (
    <Suspense fallback={<div className="ui-skeleton" style={{ height: 320 }} />}>
      <Agenda />
    </Suspense>
  )
}

function Agenda() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()

  const [modo, setModo] = useState<Modo>(params.get('modo') === 'semana' ? 'semana' : 'dia')
  const [data, setData] = useState(DATA_VALIDA.test(params.get('data') ?? '') ? params.get('data')! : hoje)
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [dados, setDados] = useState<DadosPeriodo | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<number | null>(null)
  const [destaque, setDestaque] = useState<string | null>(null)

  const [agendamentoAberto, setAgendamentoAberto] = useState<number | null>(null)
  const [turmaAdicionar, setTurmaAdicionar] = useState<TurmaSel | null>(null)
  const [turmaCancelar, setTurmaCancelar] = useState<TurmaSel | null>(null)
  const [turmaProfessor, setTurmaProfessor] = useState<TurmaSel | null>(null)
  const [turmaEspera, setTurmaEspera] = useState<TurmaSel | null>(null)
  const [bloqueioAberto, setBloqueioAberto] = useState(false)

  const inicio = modo === 'dia' ? data : inicioSemana(data)
  const fim = modo === 'dia' ? data : somarDias(inicioSemana(data), 6)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      setErro('')
      try {
        setDados(await carregarPeriodo(inicio, fim))
      } catch (e) {
        setErro(mensagemDeErro(e))
      } finally {
        setCarregando(false)
      }
    },
    [inicio, fim]
  )

  useEffect(() => {
    carregar()
  }, [carregar])

  // URL reflete a data/visao (compartilhar link, voltar do navegador)
  useEffect(() => {
    const q = new URLSearchParams()
    if (data !== hoje) q.set('data', data)
    if (modo === 'semana') q.set('modo', 'semana')
    const url = `/agenda${q.toString() ? `?${q}` : ''}`
    router.replace(url, { scroll: false })
  }, [data, modo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rola ate a turma destacada (vinda da semana ou da busca)
  useEffect(() => {
    if (!destaque || modo !== 'dia' || carregando) return
    document.getElementById(`turma-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const t = setTimeout(() => setDestaque(null), 2500)
    return () => clearTimeout(t)
  }, [destaque, modo, carregando])

  const professores = useMemo(() => mapaProfessores(dados?.professores ?? []), [dados])
  const modalidades = useMemo(() => new Map((dados?.modalidades ?? []).map(m => [m.id, m])), [dados])
  const turmas = useMemo(() => (dados && modo === 'dia' ? montarDia(dados, data, filtros) : []), [dados, data, filtros, modo])

  const resumo = useMemo(() => {
    if (!dados) return null
    const doDia = turmasDoDia(dados, data)
    const bloqueados = new Set(doDia.filter(h => horarioBloqueado(dados.bloqueios, h.id, data)).map(h => h.id))
    return resumoDoDia(doDia, dados.agendamentos.filter(a => a.data === data), bloqueados)
  }, [dados, data])

  const conflitos = useMemo(() => {
    if (!dados) return []
    const alvo = modo === 'dia' ? dados.agendamentos.filter(a => a.data === data) : dados.agendamentos
    return conflitosDeProfessor(alvo)
  }, [dados, data, modo])

  const agendamento = dados?.agendamentos.find(a => a.id === agendamentoAberto) ?? null
  const bloqueioDoDia = dados?.bloqueios.find(b => !b.horario_id && data >= b.data && data <= (b.data_fim ?? b.data))

  function irPara(novaData: string, horarioId?: string | null) {
    setData(novaData)
    setModo('dia')
    if (horarioId) setDestaque(horarioId)
  }

  function mover(passo: number) {
    setData(d => somarDias(d, modo === 'dia' ? passo : passo * 7))
  }

  async function marcarRapido(a: Agendamento, status: 'presente' | 'falta') {
    setSalvando(a.id)
    try {
      await marcarStatus(a.id, status)
      toast(`${nomePessoa(a)}: ${status === 'presente' ? 'presente' : 'falta'}.`)
      await carregar(true)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(null)
    }
  }

  async function todosPresentes(h: Horario) {
    const ok = await confirmar({
      titulo: 'Marcar todos presentes?',
      mensagem: `Todos os alunos ainda "agendados" das ${formatarHora(h.hora_inicio)} serão marcados como presentes (debita do pacote).`,
      confirmar: 'Marcar presentes'
    })
    if (!ok) return
    try {
      const r = await marcarTodosPresentes(h.id, data)
      toast(`${r.marcados} presença(s) registrada(s).`)
      for (const e of r.erros) toast(`${e.nome}: ${e.erro}`, 'erro')
      await carregar(true)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  function alternarProfessor(id: string) {
    setFiltros(f => ({
      ...f,
      professores: f.professores.includes(id) ? f.professores.filter(p => p !== id) : [...f.professores, id]
    }))
  }

  const recarregar = () => carregar(true)

  return (
    <div>
      <div className="ag-topo">
        <div>
          <h1>
            <CalendarDays size={24} /> Agenda
          </h1>
          <div className="ag-data-titulo">
            {modo === 'dia'
              ? `${formatarDataLonga(data)}${data === hoje ? ' · hoje' : ''}`
              : `Semana de ${formatarData(inicio)} a ${formatarData(fim)}`}
          </div>
        </div>
        <div className="grupo" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sec" onClick={() => setBloqueioAberto(true)}>
            <Ban size={15} /> Feriado / bloqueio
          </button>
          <Link href="/agenda/configuracoes" className="btn btn-sec" style={{ textDecoration: 'none' }}>
            <Settings size={15} /> Grade e professores
          </Link>
        </div>
      </div>

      <div className="ag-barra">
        <div className="grupo">
          <button className="btn btn-sec" onClick={() => mover(-1)} aria-label="Anterior">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn-sec" onClick={() => setData(hoje)} disabled={data === hoje}>
            Hoje
          </button>
          <button className="btn btn-sec" onClick={() => mover(1)} aria-label="Próximo">
            <ChevronRight size={16} />
          </button>
          <input type="date" value={data} onChange={e => DATA_VALIDA.test(e.target.value) && setData(e.target.value)} aria-label="Escolher data" />
        </div>
        <div className="ui-segmentos">
          <button className={modo === 'dia' ? 'ativo' : ''} onClick={() => setModo('dia')}>Dia</button>
          <button className={modo === 'semana' ? 'ativo' : ''} onClick={() => setModo('semana')}>Semana</button>
        </div>
        <select
          value={filtros.modalidadeId}
          onChange={e => setFiltros(f => ({ ...f, modalidadeId: e.target.value }))}
          aria-label="Filtrar modalidade"
        >
          <option value="">Todas as modalidades</option>
          {dados?.modalidades.filter(m => m.ativo).map(m => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
        <BuscaRapidaAluno onIrPara={irPara} />
        <span className="espaco" />
        <button className="ui-icon-btn" onClick={() => carregar()} title="Atualizar" aria-label="Atualizar">
          <RefreshCw size={17} />
        </button>
      </div>

      {dados && (
        <LegendaProfessores
          professores={dados.professores}
          selecionados={filtros.professores}
          onAlternar={alternarProfessor}
          onLimpar={() => setFiltros(f => ({ ...f, professores: [] }))}
        />
      )}

      {resumo && dados && <ResumoDia resumo={resumo} creditosAtivos={dados.creditosAtivos} />}

      {conflitos.length > 0 && (
        <div className="ui-alerta ui-alerta-aviso">
          <AlertTriangle size={16} />
          <div>
            <strong>Conflito de professor:</strong>{' '}
            {conflitos
              .map(c => `${professores.get(c.professorId)?.nome ?? 'Professor'} em ${formatarHora(c.a.hora)} e ${formatarHora(c.b.hora)} (${formatarData(c.data)})`)
              .join('; ')}
          </div>
        </div>
      )}

      {erro && (
        <div className="ui-alerta ui-alerta-erro">
          <AlertTriangle size={16} />
          <div>
            Não foi possível carregar a agenda: {erro}{' '}
            <button className="btn btn-sec btn-sm" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        </div>
      )}

      {carregando && !dados && (
        <div className="ag-dia">
          {[0, 1, 2].map(i => (
            <div key={i} className="ui-skeleton" style={{ height: 180 }} />
          ))}
        </div>
      )}

      {dados && !dados.horarios.length && (
        <div className="ui-estado">
          <CalendarDays size={32} />
          <p>Nenhuma turma cadastrada ainda.</p>
          <Link href="/agenda/configuracoes" className="btn ui-btn-azul" style={{ marginTop: 12, textDecoration: 'none' }}>
            Montar a grade de horários
          </Link>
        </div>
      )}

      {dados && dados.horarios.length > 0 && modo === 'dia' && (
        <>
          {bloqueioDoDia && (
            <div className="ui-alerta ui-alerta-info">
              <Ban size={16} /> Estúdio fechado neste dia: {bloqueioDoDia.motivo}
            </div>
          )}
          {!turmas.length ? (
            <div className="ui-estado">
              {filtros.professores.length || filtros.modalidadeId ? 'Nenhuma aula com esses filtros.' : 'Nenhuma aula neste dia.'}
            </div>
          ) : (
            <div className="ag-dia" style={{ opacity: carregando ? 0.6 : 1 }}>
              {turmas.map(t => {
                const sel = { horario: t.horario, data }
                return (
                  <CardTurma
                    key={t.horario.id}
                    turma={t}
                    professores={professores}
                    modalidades={modalidades}
                    salvando={salvando}
                    destaque={destaque === t.horario.id}
                    onAbrir={a => setAgendamentoAberto(a.id)}
                    onMarcar={marcarRapido}
                    onAdicionar={() => setTurmaAdicionar(sel)}
                    onTodosPresentes={() => todosPresentes(t.horario)}
                    onTrocarProfessor={() => setTurmaProfessor(sel)}
                    onCancelar={() => setTurmaCancelar(sel)}
                    onListaEspera={() => setTurmaEspera(sel)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {dados && dados.horarios.length > 0 && modo === 'semana' && (
        <div style={{ opacity: carregando ? 0.6 : 1 }}>
          <VisaoSemana
            dados={dados}
            dataBase={data}
            hoje={hoje}
            filtros={filtros}
            professores={professores}
            modalidades={modalidades}
            onAbrirTurma={(d, h) => irPara(d, h)}
            onAbrirDia={d => irPara(d)}
          />
        </div>
      )}

      {dados && agendamento && (
        <ModalAgendamento
          agendamento={agendamento}
          professores={dados.professores}
          configuracao={dados.configuracao}
          onFechar={() => setAgendamentoAberto(null)}
          onAlterado={recarregar}
        />
      )}
      <ModalAdicionar turma={turmaAdicionar} onFechar={() => setTurmaAdicionar(null)} onAlterado={recarregar} />
      {dados && (
        <>
          <ModalCancelarAula turma={turmaCancelar} dados={dados} onFechar={() => setTurmaCancelar(null)} onAlterado={recarregar} />
          <ModalProfessorTurma turma={turmaProfessor} dados={dados} professores={dados.professores} onFechar={() => setTurmaProfessor(null)} onAlterado={recarregar} />
          <ModalListaEspera turma={turmaEspera} dados={dados} onFechar={() => setTurmaEspera(null)} onAlterado={recarregar} />
        </>
      )}
      <ModalBloqueio aberto={bloqueioAberto} dataInicial={data} onFechar={() => setBloqueioAberto(false)} onAlterado={recarregar} />
    </div>
  )
}
