'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import { AlertTriangle, CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, Repeat, Search, SlidersHorizontal, UsersRound, X } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import {
  agoraEstudioMs,
  FUSO_ESTUDIO,
  formatarHora,
  hojeEstudio,
  horaFim,
  horaParaMinutos,
  momentoMs,
  somarDias
} from '@/lib/agenda/datas'
import { ROTULO_STATUS } from '@/lib/agenda/regras'
import { carregarPeriodo, editarAulaCliente, ErroAgenda } from '@/lib/agenda/servico'
import type { Agendamento, DadosPeriodo, Modalidade } from '@/lib/agenda/tipos'
import ModalAula, { type InicialAula } from './ModalAula'
import ModalDetalheAula, { useEscopoAula } from './ModalDetalheAula'
import '@/app/components/ui/ui.css'
import './agenda.css'

type Visao = 'timeGridDay' | 'timeGridWeek'
type Servico = Modalidade & { duracao_padrao_min?: number; cor?: string }

// Agendada usa a cor escolhida na aula (ou a do profissional); as demais cores indicam o status.
const COR_AGENDADA_PADRAO = '#1f4fd8'
const COR_STATUS: Record<string, string> = {
  presente: '#16a34a',
  falta: '#dc2626',
  falta_justificada: '#6b7280',
  desmarcado: '#6b7280',
  cancelado_estudio: '#6b7280'
}

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/

/** Texto escuro em fundo claro, branco em fundo escuro (legivel com qualquer cor escolhida). */
function corDoTexto(fundo: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(fundo)
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
  return lum > 0.45 ? '#12172b' : '#fff'
}

function corDoCard(a: Agendamento, corProfissional: string | undefined) {
  if (a.status === 'agendado') return a.cor ?? corProfissional ?? COR_AGENDADA_PADRAO
  return COR_STATUS[a.status] ?? COR_AGENDADA_PADRAO
}

export default function AgendaPage() {
  return (
    <Suspense fallback={<div className="ui-skeleton" style={{ height: 420, marginTop: 24 }} />}>
      <Agenda />
    </Suspense>
  )
}

function Agenda() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast, confirmar } = useFeedback()
  const escopo = useEscopoAula()
  const cal = useRef<FullCalendar>(null)
  const hoje = hojeEstudio()

  const [visao, setVisao] = useState<Visao>('timeGridDay')
  const [titulo, setTitulo] = useState('')
  const [intervalo, setIntervalo] = useState<{ inicio: string; fim: string } | null>(null)
  const [dados, setDados] = useState<DadosPeriodo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [profissionalId, setProfissionalId] = useState('')
  const [mobile, setMobile] = useState(false)
  const [verFiltros, setVerFiltros] = useState(false)
  const [nova, setNova] = useState<InicialAula | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [editando, setEditando] = useState<Agendamento | null>(null)
  const requisicao = useRef(0)
  const rolou = useRef(false)

  const dataInicial = DATA_VALIDA.test(params.get('data') ?? '') ? params.get('data')! : hoje
  const api = () => cal.current?.getApi()

  useEffect(() => {
    const medir = () => setMobile(window.innerWidth < 700)
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  // Nova aula vinda da ficha do cliente (?novo=<id do cliente>)
  useEffect(() => {
    const alunoId = params.get('novo')
    if (!alunoId) return
    setNova({ data: dataInicial, horaInicio: proximaHora(), alunoId })
    router.replace('/agenda', { scroll: false })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const carregar = useCallback(async (inicio: string, fimExcl: string) => {
    const id = ++requisicao.current
    setCarregando(true)
    setErro('')
    try {
      const d = await carregarPeriodo(inicio, somarDias(fimExcl, -1))
      if (id === requisicao.current) setDados(d)
    } catch (e) {
      if (id === requisicao.current) setErro(mensagemDeErro(e))
    } finally {
      if (id === requisicao.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (intervalo) carregar(intervalo.inicio, intervalo.fim)
  }, [intervalo, carregar])

  const recarregar = useCallback(() => {
    if (intervalo) carregar(intervalo.inicio, intervalo.fim)
  }, [intervalo, carregar])

  // Ao abrir, centraliza a hora atual na tela
  useEffect(() => {
    if (!dados || rolou.current) return
    rolou.current = true
    const h = new Date(agoraEstudioMs()).getUTCHours()
    setTimeout(() => {
      const alvo = document.querySelector(`.agm .fc-timegrid-slot[data-time="${String(Math.max(h - 1, 5)).padStart(2, '0')}:00:00"]`)
      alvo?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }, 150)
  }, [dados])

  const professores = useMemo(() => new Map((dados?.professores ?? []).map(p => [p.id, p])), [dados])
  const servicos = (dados?.modalidades ?? []) as Servico[]
  const servicoPorId = useMemo(() => new Map(servicos.map(s => [s.id, s])), [servicos])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (dados?.agendamentos ?? []).filter(
      a =>
        !a.excluida &&
        (!termo || (a.aluno?.nome ?? a.experimental_nome ?? '').toLowerCase().includes(termo)) &&
        (!servicoId || a.servico_id === servicoId) &&
        (!profissionalId || (profissionalId === '__sem' ? !a.professor_id : a.professor_id === profissionalId))
    )
  }, [dados, busca, servicoId, profissionalId])

  const agora = agoraEstudioMs()
  const eventos: EventInput[] = useMemo(() => {
    const lista: EventInput[] = visiveis.map(a => {
      const fim = horaFim(a.hora, a.duracao_min)
      const passada = momentoMs(a.data, fim) < agora
      const cor = corDoCard(a, a.professor_id ? professores.get(a.professor_id)?.cor : undefined)
      return {
        id: String(a.id),
        start: `${a.data}T${a.hora.slice(0, 5)}`,
        end: `${a.data}T${fim}`,
        backgroundColor: cor,
        borderColor: cor,
        textColor: corDoTexto(cor),
        classNames: ['agm-ev', `st-${a.status}`, ...(passada ? ['passada'] : [])],
        editable: a.status === 'agendado' && !passada && !a.horario_id,
        extendedProps: { a }
      }
    })
    for (const b of dados?.bloqueios ?? []) {
      if (b.horario_id) continue
      for (let d = b.data; d <= (b.data_fim ?? b.data); d = somarDias(d, 1)) {
        lista.push({ id: `b${b.id}${d}`, start: d, end: somarDias(d, 1), allDay: true, display: 'background', classNames: ['agm-bloqueio'], extendedProps: { motivo: b.motivo } })
      }
    }
    return lista
  }, [visiveis, dados, agora, professores])

  const detalhe = detalheId !== null ? dados?.agendamentos.find(a => a.id === detalheId) ?? null : null

  function mudarVisao(v: Visao) {
    api()?.changeView(v)
  }

  function proximaHora() {
    const h = new Date(agoraEstudioMs()).getUTCHours() + 1
    return `${String(Math.min(Math.max(h, 5), 22)).padStart(2, '0')}:00`
  }

  function abrirNova(data?: string, hora?: string, fim?: string) {
    setNova({ data: data ?? intervalo?.inicio ?? hoje, horaInicio: hora ?? proximaHora(), horaFim: fim })
  }

  async function aoMover(info: EventDropArg | EventResizeDoneArg) {
    const a = info.event.extendedProps.a as Agendamento | undefined
    if (!a || !info.event.start || !info.event.end) return info.revert()
    const data = info.event.startStr.slice(0, 10)
    const das = info.event.startStr.slice(11, 16)
    const ate = info.event.endStr.slice(11, 16)
    let esc: 'esta' | 'proximas' = 'esta'
    if (a.recorrencia_id) {
      const r = await escopo.perguntar('Mover aula recorrente')
      if (!r) return info.revert()
      esc = r
    }
    const campos = { data, horaInicio: das, horaFim: ate, profissionalId: a.professor_id, servicoId: a.servico_id ?? null, cor: a.cor ?? null, observacao: a.observacao ?? '' }
    try {
      await editarAulaCliente(a.id, esc, campos)
      toast('Aula movida.')
      recarregar()
    } catch (e) {
      if (e instanceof ErroAgenda && e.codigo === 'CONFLITO') {
        const ok = await confirmar({ titulo: 'Conflito de horário', mensagem: `${e.message.replace('Conflito de horario do cliente:', 'O cliente já tem aula em:')}. Mover mesmo assim?`, confirmar: 'Mover' })
        if (ok) {
          try {
            await editarAulaCliente(a.id, esc, campos, true)
            toast('Aula movida.')
            return recarregar()
          } catch (e2) {
            toast(mensagemDeErro(e2), 'erro')
          }
        }
      } else {
        toast(mensagemDeErro(e), 'erro')
      }
      info.revert()
    }
  }

  const bloqueioDoDia = visao === 'timeGridDay' && intervalo ? dados?.bloqueios.find(b => !b.horario_id && intervalo.inicio >= b.data && intervalo.inicio <= (b.data_fim ?? b.data)) : null
  const profsAtivos = (dados?.professores ?? []).filter(p => p.ativo)
  const semCadastro = dados && !dados.professores.length

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Agenda' }]}
        acao={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" href="/agenda/horarios-fixos">
              <UsersRound size={15} /> Horários fixos
            </Link>
            <button className="btn" onClick={() => abrirNova()}>
              <CalendarPlus size={15} /> Nova aula
            </button>
          </div>
        }
      />

      <div className="ph-corpo">
        <div className="painel agm">
          <div className="agm-topo">
            <div className="agm-nav">
              <button className="ui-icon-btn" onClick={() => api()?.prev()} aria-label="Anterior"><ChevronLeft size={20} /></button>
              <button className="btn btn-sec btn-sm" onClick={() => api()?.today()} disabled={!!intervalo && hoje >= intervalo.inicio && hoje < intervalo.fim}>Hoje</button>
              <button className="ui-icon-btn" onClick={() => api()?.next()} aria-label="Próximo"><ChevronRight size={20} /></button>
              <h2 className="agm-titulo">{titulo}</h2>
              {carregando && <span className="agm-carregando" aria-label="Carregando" />}
              <button className={`btn btn-sec btn-sm agm-btn-filtros${busca || servicoId || profissionalId ? ' ativo' : ''}`} onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}>
                <SlidersHorizontal size={14} /> Filtros
              </button>
              <div className="ui-segmentos agm-visao-mobile">
                <button className={visao === 'timeGridDay' ? 'ativo' : ''} onClick={() => mudarVisao('timeGridDay')}>Dia</button>
                <button className={visao === 'timeGridWeek' ? 'ativo' : ''} onClick={() => mudarVisao('timeGridWeek')}>Semana</button>
              </div>
            </div>
            <div className={`painel-filtros agm-filtros${verFiltros ? ' aberto' : ''}`}>
              <div className="busca">
                <Search size={16} />
                <input placeholder="Buscar por nome..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <select value={servicoId} onChange={e => setServicoId(e.target.value)} aria-label="Filtrar por serviço">
                <option value="">Filtrar por serviço</option>
                {servicos.filter(s => s.ativo).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <select value={profissionalId} onChange={e => setProfissionalId(e.target.value)} aria-label="Profissional">
                <option value="">Todos os profissionais</option>
                <option value="__sem">Sem profissional</option>
                {profsAtivos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <input type="date" value={intervalo?.inicio ?? hoje} onChange={e => DATA_VALIDA.test(e.target.value) && api()?.gotoDate(e.target.value)} aria-label="Ir para data" />
              <div className="ui-segmentos agm-visao-desktop">
                <button className={visao === 'timeGridDay' ? 'ativo' : ''} onClick={() => mudarVisao('timeGridDay')}>Dia</button>
                <button className={visao === 'timeGridWeek' ? 'ativo' : ''} onClick={() => mudarVisao('timeGridWeek')}>Semana</button>
              </div>
              {(busca || servicoId || profissionalId) && (
                <button className="btn btn-sec" onClick={() => { setBusca(''); setServicoId(''); setProfissionalId('') }}><X size={14} /> Limpar</button>
              )}
            </div>
          </div>

          {profsAtivos.length > 0 && (
            <div className="agm-legenda">
              {profsAtivos.map(p => (
                <button key={p.id} className={`agm-legenda-item${profissionalId === p.id ? ' ativo' : ''}`} onClick={() => setProfissionalId(v => (v === p.id ? '' : p.id))}>
                  <span style={{ background: p.cor }} /> {p.nome}
                </button>
              ))}
              <span className="agm-legenda-status">
                <i style={{ background: 'conic-gradient(#1f4fd8, #9333ea, #ea580c, #db2777, #1f4fd8)' }} /> Agendada (cor escolhida)
                <i style={{ background: COR_STATUS.presente }} /> Presente
                <i style={{ background: COR_STATUS.falta }} /> Falta
                <i style={{ background: COR_STATUS.desmarcado }} /> Desmarcada
              </span>
            </div>
          )}

          {erro && (
            <div className="ui-alerta ui-alerta-erro" style={{ margin: '0 20px 12px' }}>
              <AlertTriangle size={16} /> Não foi possível carregar a agenda: {erro}{' '}
              <button className="btn btn-sec btn-sm" onClick={recarregar}>Tentar de novo</button>
            </div>
          )}
          {semCadastro && (
            <div className="ui-alerta ui-alerta-info" style={{ margin: '0 20px 12px' }}>
              Cadastre os <Link href="/profissionais">profissionais</Link> (cada um com sua cor) e depois crie as aulas — clique num horário vazio ou use <Link href="/agenda/horarios-fixos">Horários fixos</Link> para montar a semana de todos os alunos.
            </div>
          )}
          {bloqueioDoDia && <div className="ui-alerta ui-alerta-info" style={{ margin: '0 20px 12px' }}>Estúdio fechado: {bloqueioDoDia.motivo}</div>}

          <div className="agm-grade">
            <FullCalendar
              ref={cal}
              plugins={[luxonPlugin, timeGridPlugin, interactionPlugin]}
              locale={ptBrLocale}
              timeZone={FUSO_ESTUDIO}
              initialView="timeGridDay"
              initialDate={dataInicial}
              headerToolbar={false}
              height="auto"
              firstDay={1}
              allDaySlot={false}
              nowIndicator
              slotMinTime="05:00:00"
              slotMaxTime="23:00:00"
              slotDuration="00:30:00"
              slotLabelInterval="01:00"
              slotLabelFormat={{ hour: '2-digit', hour12: false }}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              dayHeaderFormat={visao === 'timeGridDay' ? { weekday: 'long' } : { weekday: 'short', day: '2-digit', month: '2-digit' }}
              slotEventOverlap={false}
              eventMinHeight={26}
              expandRows
              selectable
              selectMirror
              selectMinDistance={8}
              editable
              eventResizableFromStart={false}
              longPressDelay={450}
              eventLongPressDelay={350}
              navLinks
              navLinkDayClick={d => api()?.changeView('timeGridDay', d)}
              events={eventos}
              eventAllow={drop => drop.start.getTime() >= Date.now()}
              eventContent={(arg: EventContentArg) => {
                if (arg.event.display === 'background') return <div className="agm-bloqueio-rotulo">{arg.event.extendedProps.motivo}</div>
                const a = arg.event.extendedProps.a as Agendamento
                const prof = a.professor_id ? professores.get(a.professor_id) : undefined
                const atrasado = !!a.aluno?.vencimento && a.aluno.vencimento < hoje
                const nome = a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome'
                const serv = a.servico_id ? servicoPorId.get(a.servico_id) : undefined
                return (
                  <div
                    className="agm-card"
                    style={(() => {
                      const fundo = corDoCard(a, prof?.cor)
                      // faixa lateral = profissional; se for a mesma cor do fundo, uma faixa escurecida
                      const faixa = prof?.cor && prof.cor.toLowerCase() !== fundo.toLowerCase() ? prof.cor : 'rgba(0, 0, 0, 0.28)'
                      return { ['--faixa' as string]: faixa, color: corDoTexto(fundo) }
                    })()}
                    title={`${nome} · ${formatarHora(a.hora)}–${horaFim(a.hora, a.duracao_min)}${prof ? ` · ${prof.nome}` : ''}${serv ? ` · ${serv.nome}` : ''} · ${ROTULO_STATUS[a.status]}${atrasado ? ' · pagamento atrasado' : ''}`}
                  >
                    <span className="agm-hora">
                      {formatarHora(a.hora).replace(/^0/, '')}
                      {a.recorrencia_id && <Repeat size={10} />}
                    </span>
                    <span className="agm-nome">
                      {atrasado && <span className="agm-cifrao" aria-label="Pagamento atrasado">$</span>}
                      {a.status === 'presente' && <Check size={12} />}
                      {nome}
                    </span>
                  </div>
                )
              }}
              datesSet={arg => {
                setVisao(arg.view.type as Visao)
                const t = arg.view.type === 'timeGridDay' ? tituloDia(arg.startStr.slice(0, 10)) : arg.view.title
                setTitulo(t.charAt(0).toUpperCase() + t.slice(1))
                setIntervalo({ inicio: arg.startStr.slice(0, 10), fim: arg.endStr.slice(0, 10) })
              }}
              eventClick={(info: EventClickArg) => {
                const a = info.event.extendedProps.a as Agendamento | undefined
                if (a) setDetalheId(a.id)
              }}
              dateClick={(info: DateClickArg) => abrirNova(info.dateStr.slice(0, 10), info.dateStr.slice(11, 16))}
              select={(info: DateSelectArg) => {
                api()?.unselect()
                const ini = info.startStr.slice(11, 16)
                const fim = info.endStr.slice(11, 16)
                abrirNova(info.startStr.slice(0, 10), ini, horaParaMinutos(fim) > horaParaMinutos(ini) ? fim : undefined)
              }}
              eventDrop={aoMover}
              eventResize={aoMover}
            />
          </div>
        </div>
      </div>

      {mobile && (
        <button className="agm-fab" onClick={() => abrirNova()} aria-label="Nova aula">
          <Plus size={26} />
        </button>
      )}

      {nova && dados && (
        <ModalAula
          inicial={nova}
          professores={dados.professores}
          servicos={servicos}
          perguntarEscopo={escopo.perguntar}
          onFechar={() => setNova(null)}
          onSalvo={() => {
            setNova(null)
            recarregar()
          }}
        />
      )}
      {editando && dados && (
        <ModalAula
          inicial={{ agendamento: editando, data: editando.data, horaInicio: editando.hora }}
          professores={dados.professores}
          servicos={servicos}
          perguntarEscopo={escopo.perguntar}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            recarregar()
          }}
        />
      )}
      {detalhe && dados && (
        <ModalDetalheAula
          agendamento={detalhe}
          professor={detalhe.professor_id ? professores.get(detalhe.professor_id) : undefined}
          servico={detalhe.servico_id ? servicoPorId.get(detalhe.servico_id) : undefined}
          configuracao={dados.configuracao}
          perguntarEscopo={escopo.perguntar}
          onEditar={() => {
            setEditando(detalhe)
            setDetalheId(null)
          }}
          onFechar={() => setDetalheId(null)}
          onAlterado={recarregar}
        />
      )}
      {escopo.elemento}
    </>
  )
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "28 de setembro de 2026" */
function tituloDia(data: string) {
  const [a, m, d] = data.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}
