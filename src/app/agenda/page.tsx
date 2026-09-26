'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import { AlertTriangle, CalendarDays, Plus } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import type { Ancora } from '@/app/components/ui/Popover'
import Modal from '@/app/components/ui/Modal'
import { agoraEstudioMs, FUSO_ESTUDIO, formatarHora, hojeEstudio, horaParaMinutos, somarDias } from '@/lib/agenda/datas'
import { montarEventos, type EventoAula, type TipoFiltro } from '@/lib/agenda/eventos'
import { conflitosDeProfessor, horarioBloqueado, resumoDoDia } from '@/lib/agenda/regras'
import {
  carregarPeriodo,
  definirTurmaAtiva,
  desfazerBloqueio,
  desfazerMovimento,
  marcarStatus,
  marcarTodosPresentes,
  moverAula
} from '@/lib/agenda/servico'
import type { Agendamento, DadosPeriodo, Horario } from '@/lib/agenda/tipos'
import ModalAdicionar from './componentes/ModalAdicionar'
import ModalAgendamento from './componentes/ModalAgendamento'
import { ModalBloqueio, ModalCancelarAula, ModalListaEspera, ModalProfessorTurma } from './componentes/ModaisTurma'
import BarraLateral from './calendario/BarraLateral'
import BarraSuperior, { type BarraSuperiorRef } from './calendario/BarraSuperior'
import ConteudoEvento from './calendario/ConteudoEvento'
import { useRecorrencia } from './calendario/DialogoRecorrencia'
import FormCriar, { type Rascunho } from './calendario/FormCriar'
import ModalEditarAula from './calendario/ModalEditarAula'
import PopoverEvento from './calendario/PopoverEvento'
import Popover from '@/app/components/ui/Popover'
import { usePreferencias, type Visao } from './calendario/preferencias'
import { turmasDoDia } from './util'
import '@/app/components/ui/ui.css'
import './agenda.css'
import './calendario/calendario.css'

type Turma = { horario: Horario; data: string }
const MARGEM_DIAS = 7
const MAX_JANELA = 62

export default function AgendaPage() {
  return (
    <Suspense fallback={<div className="ui-skeleton" style={{ height: 420 }} />}>
      <Agenda />
    </Suspense>
  )
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function horaCheia(offsetHoras = 0) {
  const agora = new Date(agoraEstudioMs())
  return `${String(Math.max(agora.getUTCHours() + offsetHoras, 0)).padStart(2, '0')}:00:00`
}

function Agenda() {
  const params = useSearchParams()
  const { toast, confirmar } = useFeedback()
  const recorrencia = useRecorrencia()
  const { prefs, atualizar, pronto } = usePreferencias()
  const cal = useRef<FullCalendar>(null)
  const barra = useRef<BarraSuperiorRef>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const hoje = hojeEstudio()

  const [mobile, setMobile] = useState(false)
  const [lateralMobile, setLateralMobile] = useState(false)
  const [visao, setVisao] = useState<Visao>('timeGridWeek')
  const [titulo, setTitulo] = useState('')
  const [intervalo, setIntervalo] = useState<{ inicio: string; fim: string } | null>(null)
  const [dados, setDados] = useState<DadosPeriodo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [agoraMs, setAgoraMs] = useState(() => agoraEstudioMs())
  const [salvando, setSalvando] = useState<number | null>(null)
  const [rolarPara] = useState(() => horaCheia(-1))
  const cache = useRef(new Map<string, DadosPeriodo>())
  const requisicao = useRef(0)
  const arrastando = useRef(false)
  const toque = useRef<{ x: number; y: number; t: number; emEvento: boolean } | null>(null)

  // popovers e modais
  const [popEvento, setPopEvento] = useState<{ id: string; ancora: Ancora } | null>(null)
  const [popCriar, setPopCriar] = useState<{ rascunho: Rascunho; ancora: Ancora } | null>(null)
  const [modalCriar, setModalCriar] = useState<{ rascunho: Rascunho; aba?: 'aula' | 'aluno' | 'bloqueio' } | null>(null)
  const [editando, setEditando] = useState<EventoAula | null>(null)
  const [agendamentoAberto, setAgendamentoAberto] = useState<number | null>(null)
  const [turmaAdicionar, setTurmaAdicionar] = useState<Turma | null>(null)
  const [turmaCancelar, setTurmaCancelar] = useState<Turma | null>(null)
  const [turmaProfessor, setTurmaProfessor] = useState<Turma | null>(null)
  const [turmaEspera, setTurmaEspera] = useState<Turma | null>(null)
  const [bloqueioAberto, setBloqueioAberto] = useState(false)

  const api = () => cal.current?.getApi()

  /* ---------------- preferencias / dispositivo ---------------- */

  useEffect(() => {
    const medir = () => {
      setMobile(window.innerWidth < 768)
      const topo = document.querySelector('.site-header') as HTMLElement | null
      raiz.current?.style.setProperty('--gc-topo', `${topo?.offsetHeight ?? 64}px`)
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])

  const visaoInicial: Visao = prefs.visao ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 'tresDias' : 'timeGridWeek')
  const dataInicial = /^\d{4}-\d{2}-\d{2}$/.test(params.get('data') ?? '') ? params.get('data')! : hoje

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(agoraEstudioMs()), 60000)
    return () => clearInterval(t)
  }, [])

  /* ---------------- dados do periodo visivel (com cache) ---------------- */

  const carregar = useCallback(async (inicio: string, fimExcl: string, forcar = false) => {
    let de = somarDias(inicio, -MARGEM_DIAS)
    let ate = somarDias(fimExcl, MARGEM_DIAS - 1)
    if ((Date.parse(ate) - Date.parse(de)) / 86400000 > MAX_JANELA) {
      de = inicio
      ate = somarDias(inicio, MAX_JANELA)
    }
    // reaproveita uma janela ja carregada que cubra o periodo visivel
    if (!forcar) {
      for (const [chave, d] of cache.current) {
        const [ci, cf] = chave.split('|')
        if (ci <= inicio && cf >= somarDias(fimExcl, -1)) {
          setDados(d)
          return
        }
      }
    }
    const id = ++requisicao.current
    setCarregando(true)
    setErro('')
    try {
      const d = await carregarPeriodo(de, ate)
      cache.current.set(`${de}|${ate}`, d)
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

  // Ao abrir, rola a grade ate a hora atual (depois que a faixa de horas e definida pelos dados)
  const rolouInicio = useRef(false)
  useEffect(() => {
    if (!dados || rolouInicio.current) return
    rolouInicio.current = true
    setTimeout(() => api()?.scrollToTime(rolarPara), 0)
  }, [dados, rolarPara])

  const recarregar = useCallback(() => {
    cache.current.clear()
    if (intervalo) return carregar(intervalo.inicio, intervalo.fim, true)
  }, [intervalo, carregar])

  /* ---------------- eventos ---------------- */

  const filtros = useMemo(
    () => ({ professoresOcultos: prefs.professoresOcultos, tiposOcultos: prefs.tiposOcultos }),
    [prefs.professoresOcultos, prefs.tiposOcultos]
  )
  const professores = useMemo(() => new Map((dados?.professores ?? []).map(p => [p.id, p])), [dados])
  const modalidades = useMemo(() => new Map((dados?.modalidades ?? []).map(m => [m.id, m])), [dados])

  const { aulas, bloqueios } = useMemo(() => {
    if (!dados || !intervalo) return { aulas: [] as EventoAula[], bloqueios: [] }
    return montarEventos(dados, intervalo.inicio, intervalo.fim, filtros, agoraMs)
  }, [dados, intervalo, filtros, agoraMs])

  const eventos: EventInput[] = useMemo(() => {
    const lista: EventInput[] = aulas.map(e => {
      const prof = e.professorId ? professores.get(e.professorId) : undefined
      const cor = prof?.cor ?? '#7a8699'
      const editavel = !e.passada && !e.cancelada
      const classes = ['ev']
      if (e.passada) classes.push('ev-passado')
      if (e.cancelada) classes.push(e.bloqueio ? 'ev-bloqueado' : 'ev-cancelado')
      if (e.lotado && !e.cancelada) classes.push('ev-lotado')
      if (!e.alunos.length && !e.cancelada) classes.push('ev-vazio')
      return {
        id: e.id,
        start: e.inicio,
        end: e.fim,
        backgroundColor: cor,
        borderColor: cor,
        textColor: '#fff',
        classNames: classes,
        startEditable: editavel,
        durationEditable: editavel,
        extendedProps: { evento: e }
      }
    })
    for (const b of bloqueios) {
      lista.push({
        id: b.id,
        start: b.data,
        end: somarDias(b.data, 1),
        allDay: true,
        display: 'background',
        classNames: ['ev-bloqueio-fundo'],
        extendedProps: { motivo: b.bloqueio.motivo }
      })
    }
    if (popCriar) {
      const r = popCriar.rascunho
      const fim = horaParaMinutos(r.hora) + r.duracao
      lista.push({
        id: 'rascunho',
        start: `${r.data}T${r.hora}`,
        end: `${r.data}T${String(Math.floor(fim / 60)).padStart(2, '0')}:${String(fim % 60).padStart(2, '0')}`,
        classNames: ['ev-rascunho'],
        title: '(Nova aula)',
        editable: false
      })
    }
    return lista
  }, [aulas, bloqueios, professores, popCriar])

  const eventoAberto = popEvento ? aulas.find(a => a.id === popEvento.id) ?? null : null
  useEffect(() => {
    if (popEvento && dados && !eventoAberto) setPopEvento(null)
  }, [popEvento, eventoAberto, dados])

  /* ---------------- faixa de horas ---------------- */

  const faixa = useMemo(() => {
    if (prefs.dia24h) return { min: '00:00:00', max: '24:00:00' }
    const cfg = dados?.configuracao
    let min = horaParaMinutos(cfg?.hora_abertura ?? '06:00')
    let max = horaParaMinutos(cfg?.hora_fechamento ?? '21:00')
    for (const h of dados?.horarios ?? []) {
      min = Math.min(min, horaParaMinutos(h.hora_inicio))
      max = Math.max(max, horaParaMinutos(h.hora_inicio) + h.duracao_min)
    }
    const f = (m: number) => `${String(Math.min(Math.floor(m / 60), 24)).padStart(2, '0')}:00:00`
    return { min: f(min), max: f(Math.ceil(max / 60) * 60) }
  }, [dados, prefs.dia24h])

  /* ---------------- resumo e conflitos ---------------- */

  const dataResumo = intervalo ? (hoje >= intervalo.inicio && hoje < intervalo.fim ? hoje : intervalo.inicio) : hoje
  const resumo = useMemo(() => {
    if (!dados) return null
    const doDia = turmasDoDia(dados, dataResumo)
    const bloqueados = new Set(doDia.filter(h => horarioBloqueado(dados.bloqueios, h.id, dataResumo)).map(h => h.id))
    return { data: dataResumo, valores: resumoDoDia(doDia, dados.agendamentos.filter(a => a.data === dataResumo), bloqueados) }
  }, [dados, dataResumo])

  const conflitos = useMemo(() => {
    if (!dados || !intervalo) return []
    return conflitosDeProfessor(dados.agendamentos.filter(a => a.data >= intervalo.inicio && a.data < intervalo.fim))
  }, [dados, intervalo])

  /* ---------------- acoes ---------------- */

  function fecharPopovers() {
    setPopEvento(null)
    if (popCriar) {
      setPopCriar(null)
      api()?.unselect()
    }
  }

  function irPara(data: string, horarioId?: string | null) {
    fecharPopovers()
    const a = api()
    if (!a) return
    if (a.view.type === 'dayGridMonth' || a.view.type === 'programacao') a.changeView(mobile ? 'tresDias' : 'timeGridDay', data)
    else a.gotoDate(data)
    if (horarioId && dados) {
      const h = dados.horarios.find(x => x.id === horarioId)
      if (h) setTimeout(() => a.scrollToTime(`${String(Math.max(Number(h.hora_inicio.slice(0, 2)) - 1, 0)).padStart(2, '0')}:00:00`), 50)
    }
  }

  function mudarVisao(v: Visao) {
    fecharPopovers()
    api()?.changeView(v)
  }

  function irHoje() {
    fecharPopovers()
    api()?.today()
    api()?.scrollToTime(horaCheia(-1))
  }

  async function marcarRapido(a: Agendamento, status: 'presente' | 'falta') {
    const anterior = a.status
    const aplicar = (s: Agendamento['status']) =>
      setDados(d => (d ? { ...d, agendamentos: d.agendamentos.map(x => (x.id === a.id ? { ...x, status: s } : x)) } : d))
    aplicar(status) // otimista
    setSalvando(a.id)
    try {
      await marcarStatus(a.id, status)
      const nome = a.aluno?.nome ?? a.experimental_nome
      toast(`${nome}: ${status === 'presente' ? 'presente' : 'falta'}.`, 'sucesso', {
        rotulo: 'Desfazer',
        onClick: () => marcarStatus(a.id, anterior as 'agendado').then(recarregar).catch(e => toast(mensagemDeErro(e), 'erro'))
      })
      cache.current.clear()
      recarregar()
    } catch (e) {
      aplicar(anterior) // desfaz a atualizacao otimista
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(null)
    }
  }

  async function todosPresentes(e: EventoAula) {
    const ok = await confirmar({
      titulo: 'Marcar todos presentes?',
      mensagem: `Todos os alunos ainda "agendados" das ${formatarHora(e.horario.hora_inicio)} serão marcados como presentes (debita do pacote).`,
      confirmar: 'Marcar presentes'
    })
    if (!ok) return
    try {
      const r = await marcarTodosPresentes(e.horario.id, e.data)
      toast(`${r.marcados} presença(s) registrada(s).`)
      for (const x of r.erros) toast(`${x.nome}: ${x.erro}`, 'erro')
      recarregar()
    } catch (err) {
      toast(mensagemDeErro(err), 'erro')
    }
  }

  async function aoMover(info: EventDropArg | EventResizeDoneArg, redimensionou: boolean) {
    const e = info.event.extendedProps.evento as EventoAula | undefined
    if (!e || !info.event.start || !info.event.end) return info.revert()
    const novaData = info.event.startStr.slice(0, 10)
    const novaHora = info.event.startStr.slice(11, 16)
    const novaDuracao = Math.round((info.event.end.getTime() - info.event.start.getTime()) / 60000)
    const escopo = e.unica ? 'esta' : await recorrencia.perguntar(redimensionou ? 'Alterar a duração da aula recorrente' : 'Mover aula recorrente')
    if (!escopo) return info.revert()
    try {
      const r = await moverAula({ horarioId: e.horario.id, data: e.data, novaData, novaHora, novaDuracao, escopo })
      toast(
        `${redimensionou ? 'Duração alterada' : 'Aula movida'}${e.blocos > 1 ? ' (turma inteira)' : ''}.`,
        'sucesso',
        { rotulo: 'Desfazer', onClick: () => desfazerMovimento(r.movimento_id).then(recarregar).catch(err => toast(mensagemDeErro(err), 'erro')) }
      )
      recarregar()
    } catch (err) {
      info.revert()
      toast(mensagemDeErro(err), 'erro')
    }
  }

  function abrirCriar(rascunho: Rascunho, ancora: Ancora | null) {
    setPopEvento(null)
    if (!ancora || mobile) {
      setModalCriar({ rascunho })
      return
    }
    setPopCriar({ rascunho, ancora })
  }

  function criarAgora() {
    const agora = new Date(agoraEstudioMs())
    const hora = `${String(Math.min(agora.getUTCHours() + 1, 23)).padStart(2, '0')}:00`
    const d = intervalo && !(hoje >= intervalo.inicio && hoje < intervalo.fim) ? intervalo.inicio : hoje
    abrirCriar({ data: d, hora, duracao: dados?.configuracao.duracao_padrao_min ?? 55 }, null)
  }

  async function reativar(e: EventoAula) {
    if (!e.bloqueio) return
    try {
      const r = await desfazerBloqueio(e.bloqueio.id)
      toast(`Aula reativada (${r.restaurados} aluno(s)).`)
      setPopEvento(null)
      recarregar()
    } catch (err) {
      toast(mensagemDeErro(err), 'erro')
    }
  }

  async function excluir(e: EventoAula) {
    try {
      await definirTurmaAtiva(e.horario.id, false)
      setPopEvento(null)
      toast('Aula excluída.', 'sucesso', {
        rotulo: 'Desfazer',
        onClick: () => definirTurmaAtiva(e.horario.id, true).then(recarregar).catch(err => toast(mensagemDeErro(err), 'erro'))
      })
      recarregar()
    } catch (err) {
      toast(mensagemDeErro(err), 'erro')
    }
  }

  /* ---------------- atalhos de teclado ---------------- */

  useEffect(() => {
    function tecla(ev: KeyboardEvent) {
      const alvo = ev.target as HTMLElement
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return
      if (alvo.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('.ui-overlay')) return // modal aberto
      const a = api()
      if (!a) return
      switch (ev.key) {
        case 't': irHoje(); break
        case 'j': case 'ArrowRight': fecharPopovers(); a.next(); break
        case 'k': case 'ArrowLeft': fecharPopovers(); a.prev(); break
        case 'd': mudarVisao('timeGridDay'); break
        case 'w': mudarVisao('timeGridWeek'); break
        case 'm': mudarVisao('dayGridMonth'); break
        case 'a': mudarVisao('programacao'); break
        case 'x': mudarVisao('tresDias'); break
        case 'c': criarAgora(); break
        case '/': ev.preventDefault(); barra.current?.focarBusca(); break
        case 'Escape': fecharPopovers(); break
        default: return
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  /* ---------------- swipe no celular ---------------- */

  function inicioToque(ev: React.TouchEvent) {
    const t = ev.touches[0]
    toque.current = { x: t.clientX, y: t.clientY, t: Date.now(), emEvento: !!(ev.target as HTMLElement).closest('.fc-event') }
  }

  function fimToque(ev: React.TouchEvent) {
    const ini = toque.current
    toque.current = null
    if (!ini || arrastando.current || ini.emEvento) return
    const t = ev.changedTouches[0]
    const dx = t.clientX - ini.x
    const dy = t.clientY - ini.y
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - ini.t < 600) {
      fecharPopovers()
      if (dx < 0) api()?.next()
      else api()?.prev()
    }
  }

  /* ---------------- render ---------------- */

  const lateralAberta = mobile ? lateralMobile : prefs.lateralAberta

  function alternarLista<T>(lista: T[], item: T) {
    return lista.includes(item) ? lista.filter(x => x !== item) : [...lista, item]
  }

  return (
    <div className={`gc${lateralAberta ? '' : ' sem-lateral'}`} ref={raiz}>
      <BarraSuperior
        ref={barra}
        titulo={titulo}
        visao={visao}
        professores={dados?.professores ?? []}
        carregando={carregando}
        onMenu={() => (mobile ? setLateralMobile(v => !v) : atualizar(p => ({ lateralAberta: !p.lateralAberta })))}
        onHoje={irHoje}
        onAnterior={() => { fecharPopovers(); api()?.prev() }}
        onProximo={() => { fecharPopovers(); api()?.next() }}
        onVisao={mudarVisao}
        onIrPara={irPara}
      />

      <div className="gc-corpo">
        <BarraLateral
          aberta={lateralAberta}
          hoje={hoje}
          referencia={intervalo ? (hoje >= intervalo.inicio && hoje < intervalo.fim ? hoje : intervalo.inicio) : hoje}
          inicioVisivel={intervalo?.inicio ?? hoje}
          fimVisivel={intervalo?.fim ?? hoje}
          professores={dados?.professores ?? []}
          professoresOcultos={prefs.professoresOcultos}
          tiposOcultos={prefs.tiposOcultos}
          dia24h={prefs.dia24h}
          resumo={resumo}
          creditosAtivos={dados?.creditosAtivos ?? 0}
          onEscolherData={d => {
            irPara(d)
            if (mobile) setLateralMobile(false)
          }}
          onCriar={() => {
            if (mobile) setLateralMobile(false)
            criarAgora()
          }}
          onBloqueio={() => setBloqueioAberto(true)}
          onAlternarProfessor={id => atualizar(p => ({ professoresOcultos: alternarLista(p.professoresOcultos, id) }))}
          onSomenteProfessor={id =>
            atualizar({ professoresOcultos: [...(dados?.professores ?? []).map(p => p.id), '__sem__'].filter(x => x !== id) })
          }
          onAlternarTipo={(id: TipoFiltro) => atualizar(p => ({ tiposOcultos: alternarLista(p.tiposOcultos, id) }))}
          onAlternar24h={() => atualizar(p => ({ dia24h: !p.dia24h }))}
          onFechar={() => setLateralMobile(false)}
        />

        <main className="gc-main" onTouchStart={inicioToque} onTouchEnd={fimToque}>
          {erro && (
            <div className="ui-alerta ui-alerta-erro gc-aviso">
              <AlertTriangle size={16} />
              <div>
                Não foi possível carregar a agenda: {erro}{' '}
                <button className="btn btn-sec btn-sm" onClick={() => recarregar()}>Tentar de novo</button>
              </div>
            </div>
          )}
          {dados && !dados.horarios.length && (
            <div className="ui-alerta ui-alerta-info gc-aviso">
              <CalendarDays size={16} />
              <div>
                Nenhuma turma cadastrada ainda.{' '}
                <Link href="/agenda/configuracoes">Monte a grade</Link> e depois{' '}
                <Link href="/agenda/horarios-fixos">ligue os alunos às turmas</Link> — ou clique num horário vazio para criar uma aula.
              </div>
            </div>
          )}
          {conflitos.length > 0 && (
            <div className="ui-alerta ui-alerta-aviso gc-aviso">
              <AlertTriangle size={16} />
              <div>
                <strong>Conflito de professor:</strong>{' '}
                {conflitos
                  .slice(0, 3)
                  .map(c => `${professores.get(c.professorId)?.nome ?? 'Professor'} às ${formatarHora(c.a.hora)} e ${formatarHora(c.b.hora)} (${c.data.split('-').reverse().slice(0, 2).join('/')})`)
                  .join('; ')}
                {conflitos.length > 3 && ` e mais ${conflitos.length - 3}`}
              </div>
            </div>
          )}

          {pronto && (
            <FullCalendar
              ref={cal}
              plugins={[luxonPlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              locale={ptBrLocale}
              timeZone={FUSO_ESTUDIO}
              initialView={visaoInicial}
              initialDate={dataInicial}
              headerToolbar={false}
              height="100%"
              firstDay={1}
              allDaySlot={false}
              nowIndicator
              navLinks
              navLinkDayClick={d => api()?.changeView('timeGridDay', d)}
              slotMinTime={faixa.min}
              slotMaxTime={faixa.max}
              scrollTime={rolarPara}
              scrollTimeReset={false}
              slotDuration="00:30:00"
              slotLabelInterval="01:00"
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              slotEventOverlap={false}
              eventMinHeight={22}
              dayMaxEvents
              moreLinkContent={arg => `+${arg.num} mais`}
              editable
              eventResizableFromStart={false}
              selectable
              selectMirror
              selectMinDistance={8}
              longPressDelay={450}
              eventLongPressDelay={350}
              selectLongPressDelay={450}
              views={{
                tresDias: { type: 'timeGrid', duration: { days: 3 }, buttonText: '3 dias' },
                programacao: {
                  type: 'list',
                  duration: { days: 30 },
                  listDayFormat: { weekday: 'long', day: 'numeric', month: 'long' },
                  listDaySideFormat: false,
                  noEventsContent: 'Nenhuma aula neste período.'
                },
                timeGrid: { dayHeaderFormat: { weekday: 'short', day: 'numeric' } }
              }}
              dayHeaderContent={arg => {
                if (!arg.view.type.startsWith('timeGrid') && arg.view.type !== 'tresDias') return arg.text
                const num = arg.text.match(/\d+/)?.[0] ?? ''
                const dia = arg.text.replace(/[\d.,]/g, '').trim()
                return (
                  <span className="gc-dia-cab">
                    <span className="gc-dia-sem">{dia}</span>
                    <span className="gc-dia-num">{num}</span>
                  </span>
                )
              }}
              events={eventos}
              eventContent={(arg: EventContentArg) => {
                if (arg.event.display === 'background') {
                  return <div className="ev-bloq-rotulo">{arg.event.extendedProps.motivo}</div>
                }
                const e = arg.event.extendedProps.evento as EventoAula | undefined
                if (!e) return <div className="ev-grade"><span className="ev-titulo">{arg.event.title}</span></div>
                return (
                  <ConteudoEvento
                    evento={e}
                    tipoVisao={arg.view.type}
                    professor={e.professorId ? professores.get(e.professorId) : undefined}
                    modalidade={e.horario.modalidade_id ? modalidades.get(e.horario.modalidade_id) : undefined}
                  />
                )
              }}
              eventAllow={drop => drop.start.getTime() >= Date.now()}
              datesSet={arg => {
                setTitulo(capitalizar(arg.view.title))
                setVisao(arg.view.type as Visao)
                setIntervalo({ inicio: arg.startStr.slice(0, 10), fim: arg.endStr.slice(0, 10) })
                if (pronto && arg.view.type !== prefs.visao) atualizar({ visao: arg.view.type as Visao })
              }}
              eventClick={(info: EventClickArg) => {
                info.jsEvent.preventDefault()
                const e = info.event.extendedProps.evento as EventoAula | undefined
                if (!e) return
                setPopCriar(null)
                const r = info.el.getBoundingClientRect()
                setPopEvento({ id: e.id, ancora: { x: r.left, y: r.top, largura: r.width } })
              }}
              dateClick={(info: DateClickArg) => {
                if (popEvento || popCriar) return fecharPopovers()
                const data = info.dateStr.slice(0, 10)
                const hora = info.allDay ? horaCheia(1).slice(0, 5) : info.dateStr.slice(11, 16)
                abrirCriar(
                  { data, hora, duracao: dados?.configuracao.duracao_padrao_min ?? 55 },
                  { x: info.jsEvent.clientX, y: info.jsEvent.clientY }
                )
              }}
              select={(info: DateSelectArg) => {
                if (info.allDay) return api()?.unselect()
                const data = info.startStr.slice(0, 10)
                const hora = info.startStr.slice(11, 16)
                const duracao = Math.round((info.end.getTime() - info.start.getTime()) / 60000)
                const ev = info.jsEvent as MouseEvent | null
                abrirCriar({ data, hora, duracao }, ev ? { x: ev.clientX, y: ev.clientY } : null)
              }}
              eventDragStart={() => { arrastando.current = true; fecharPopovers() }}
              eventDragStop={() => { setTimeout(() => (arrastando.current = false), 50) }}
              eventDrop={info => aoMover(info, false)}
              eventResize={info => aoMover(info, true)}
            />
          )}
        </main>
      </div>

      {mobile && (
        <button className="gc-fab" onClick={criarAgora} aria-label="Criar">
          <Plus size={26} />
        </button>
      )}

      {/* ---------- popovers ---------- */}
      {popEvento && eventoAberto && dados && (
        <PopoverEvento
          evento={eventoAberto}
          ancora={popEvento.ancora}
          professores={professores}
          modalidade={eventoAberto.horario.modalidade_id ? modalidades.get(eventoAberto.horario.modalidade_id) : undefined}
          espera={dados.listaEspera.filter(x => x.horario_id === eventoAberto.horario.id && (!x.data || x.data === eventoAberto.data)).length}
          salvando={salvando}
          onFechar={() => setPopEvento(null)}
          onAbrirAluno={a => setAgendamentoAberto(a.id)}
          onMarcar={marcarRapido}
          onAdicionar={() => { setTurmaAdicionar({ horario: eventoAberto.horario, data: eventoAberto.data }); setPopEvento(null) }}
          onTodosPresentes={() => todosPresentes(eventoAberto)}
          onTrocarProfessor={() => { setTurmaProfessor({ horario: eventoAberto.horario, data: eventoAberto.data }); setPopEvento(null) }}
          onListaEspera={() => { setTurmaEspera({ horario: eventoAberto.horario, data: eventoAberto.data }); setPopEvento(null) }}
          onEditar={() => { setEditando(eventoAberto); setPopEvento(null) }}
          onCancelar={() => { setTurmaCancelar({ horario: eventoAberto.horario, data: eventoAberto.data }); setPopEvento(null) }}
          onReativar={() => reativar(eventoAberto)}
          onExcluir={() => excluir(eventoAberto)}
        />
      )}

      {popCriar && (
        <Popover ancora={popCriar.ancora} onFechar={fecharPopovers} largura={400} cabecalho={<strong>Novo</strong>}>
          <FormCriar
            key={`${popCriar.rascunho.data}${popCriar.rascunho.hora}`}
            inicial={popCriar.rascunho}
            dados={dados}
            onMaisOpcoes={r => {
              fecharPopovers()
              setModalCriar({ rascunho: r })
            }}
            onAdicionarAluno={(h, data) => setTurmaAdicionar({ horario: h, data })}
            onConcluido={fecharPopovers}
            onAlterado={recarregar}
          />
        </Popover>
      )}

      {modalCriar && (
        <Modal aberto titulo="Criar" onFechar={() => setModalCriar(null)} largura={520}>
          <FormCriar
            inicial={modalCriar.rascunho}
            dados={dados}
            completo
            abaInicial={modalCriar.aba}
            onAdicionarAluno={(h, data) => setTurmaAdicionar({ horario: h, data })}
            onConcluido={() => setModalCriar(null)}
            onAlterado={recarregar}
          />
        </Modal>
      )}

      {/* ---------- modais ---------- */}
      {editando && dados && (
        <ModalEditarAula
          evento={editando}
          professores={dados.professores}
          modalidades={dados.modalidades}
          perguntarRecorrencia={recorrencia.perguntar}
          onFechar={() => setEditando(null)}
          onAlterado={recarregar}
        />
      )}
      {recorrencia.elemento}

      {dados && agendamentoAberto !== null && dados.agendamentos.some(a => a.id === agendamentoAberto) && (
        <ModalAgendamento
          agendamento={dados.agendamentos.find(a => a.id === agendamentoAberto)!}
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
      <ModalBloqueio aberto={bloqueioAberto} dataInicial={intervalo?.inicio ?? hoje} onFechar={() => setBloqueioAberto(false)} onAlterado={recarregar} />
    </div>
  )
}
