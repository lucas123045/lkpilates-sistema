'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarPlus, History, Save, Search } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { DIAS_SEMANA, DIAS_SEMANA_CURTO, formatarHora, hojeEstudio, somarDias } from '@/lib/agenda/datas'
import { excedePlano, frequenciaDoPlano, sugerirDiasFixos, type SugestaoDia } from '@/lib/agenda/regras'
import {
  adicionarHorarioFixo,
  alunosAtivos,
  datasDeAulasPorAluno,
  horariosFixosVigentes,
  listarGrade
} from '@/lib/agenda/servico'
import type { AlunoResumo, Horario, HorarioFixo, Modalidade } from '@/lib/agenda/tipos'
import '@/app/components/ui/ui.css'
import '../agenda.css'

const SEMANAS_HISTORICO = 8

export default function HorariosFixosEmLote() {
  const { toast } = useFeedback()
  const hoje = hojeEstudio()

  const [alunos, setAlunos] = useState<AlunoResumo[]>([])
  const [turmas, setTurmas] = useState<Horario[]>([])
  const [modalidades, setModalidades] = useState<Map<string, Modalidade>>(new Map())
  const [fixos, setFixos] = useState<HorarioFixo[]>([])
  const [historico, setHistorico] = useState<Record<string, string[]>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [soSemHorario, setSoSemHorario] = useState(true)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [a, g, f, h] = await Promise.all([
        alunosAtivos(),
        listarGrade(),
        horariosFixosVigentes(hoje),
        datasDeAulasPorAluno(somarDias(hoje, -SEMANAS_HISTORICO * 7))
      ])
      setAlunos(a)
      setTurmas(g.horarios.filter(t => t.ativo && t.origem !== 'aula_unica'))
      setModalidades(new Map(g.modalidades.map(m => [m.id, m])))
      setFixos(f)
      setHistorico(h)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [hoje])

  useEffect(() => {
    carregar()
  }, [carregar])

  const idsAtivos = useMemo(() => new Set(alunos.map(a => a.id)), [alunos])
  const fixosPorAluno = useMemo(() => {
    const m = new Map<string, HorarioFixo[]>()
    for (const f of fixos) if (f.horario_id) m.set(f.aluno_id, [...(m.get(f.aluno_id) ?? []), f])
    return m
  }, [fixos])
  const ocupacao = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of fixos) if (f.horario_id && idsAtivos.has(f.aluno_id)) m[f.horario_id] = (m[f.horario_id] ?? 0) + 1
    return m
  }, [fixos, idsAtivos])
  const sugestoes = useMemo(() => {
    const m = new Map<string, SugestaoDia[]>()
    for (const a of alunos) m.set(a.id, sugerirDiasFixos(historico[a.id] ?? [], hoje, SEMANAS_HISTORICO))
    return m
  }, [alunos, historico, hoje])

  // Quantos alunos costumam vir em cada dia (ajuda a dimensionar a grade)
  const demandaPorDia = useMemo(() => {
    const c = Array(7).fill(0)
    for (const s of sugestoes.values()) for (const d of s) c[d.dia - 1]++
    return c
  }, [sugestoes])

  const comHorario = alunos.filter(a => fixosPorAluno.has(a.id)).length
  const lista = alunos.filter(
    a => (!soSemHorario || !fixosPorAluno.has(a.id)) && a.nome.toLowerCase().includes(busca.trim().toLowerCase())
  )

  if (carregando) return <div className="ui-skeleton" style={{ height: 320 }} />

  return (
    <div>
      <Link href="/agenda" className="btn btn-sec" style={{ textDecoration: 'none', marginBottom: 14 }}>
        <ArrowLeft size={15} /> Voltar para a agenda
      </Link>
      <h1>Horários fixos dos alunos</h1>
      <p style={{ marginBottom: 14 }}>
        O sistema ainda não tinha o dia e o horário de cada aluno. Os <b>dias sugeridos</b> vêm das aulas registradas nas últimas {SEMANAS_HISTORICO} semanas; escolha a turma de cada dia e salve.
      </p>

      {erro && <div className="ui-alerta ui-alerta-erro">{erro}</div>}

      <div className="ag-resumo">
        <div className="ag-kpi">
          <span>Com horário fixo</span>
          <strong>{comHorario}</strong>
          <small>de {alunos.length} ativos</small>
        </div>
        {DIAS_SEMANA_CURTO.map((d, i) =>
          demandaPorDia[i] ? (
            <div key={d} className="ag-kpi" title={`Alunos que costumam vir às ${DIAS_SEMANA[i].toLowerCase()}s`}>
              <span>Costumam vir {d}</span>
              <strong>{demandaPorDia[i]}</strong>
              <small>{turmas.filter(t => t.dia_semana === i + 1).length} turma(s)</small>
            </div>
          ) : null
        )}
      </div>

      {!turmas.length && (
        <div className="ui-alerta ui-alerta-aviso">
          <CalendarPlus size={16} />
          <div>
            Primeiro cadastre as turmas da grade (dia, hora, capacidade). Os números acima mostram quantos alunos costumam vir em cada dia.{' '}
            <Link href="/agenda/configuracoes" className="btn ui-btn-azul btn-sm" style={{ textDecoration: 'none', marginLeft: 6 }}>
              Montar a grade
            </Link>
          </div>
        </div>
      )}

      <div className="ag-barra">
        <div className="ag-busca">
          <Search size={15} />
          <input placeholder="Buscar aluno..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <label className="ui-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={soSemHorario} onChange={e => setSoSemHorario(e.target.checked)} />
          Só quem ainda não tem horário
        </label>
      </div>

      {!lista.length && <div className="ui-estado">{soSemHorario ? 'Todos os alunos ativos já têm horário fixo.' : 'Nenhum aluno encontrado.'}</div>}

      <div className="lista">
        {lista.map(a => (
          <LinhaAluno
            key={a.id}
            aluno={a}
            sugestoes={sugestoes.get(a.id) ?? []}
            fixos={fixosPorAluno.get(a.id) ?? []}
            turmas={turmas}
            modalidades={modalidades}
            ocupacao={ocupacao}
            onSalvar={async horarioIds => {
              try {
                for (const id of horarioIds) await adicionarHorarioFixo({ alunoId: a.id, horarioId: id, dataInicio: hoje })
                toast(`${a.nome}: ${horarioIds.length} horário(s) salvo(s).`)
                setFixos(await horariosFixosVigentes(hoje))
              } catch (e) {
                toast(mensagemDeErro(e), 'erro')
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function LinhaAluno({
  aluno,
  sugestoes,
  fixos,
  turmas,
  modalidades,
  ocupacao,
  onSalvar
}: {
  aluno: AlunoResumo
  sugestoes: SugestaoDia[]
  fixos: HorarioFixo[]
  turmas: Horario[]
  modalidades: Map<string, Modalidade>
  ocupacao: Record<string, number>
  onSalvar: (horarioIds: string[]) => Promise<void>
}) {
  const { confirmar } = useFeedback()
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const freq = aluno.frequencia_semanal ?? frequenciaDoPlano(aluno.plano)
  const turmasFixas = new Set(fixos.map(f => f.horario_id))
  const diasComFixo = new Set(turmas.filter(t => turmasFixas.has(t.id)).map(t => t.dia_semana))
  const diasSugeridos = sugestoes.map(s => s.dia).filter(d => !diasComFixo.has(d))
  const selecionados = Object.values(escolhas).filter(Boolean)

  function rotulo(t: Horario, comDia = false) {
    const vagas = t.capacidade - (ocupacao[t.id] ?? 0)
    const mod = t.modalidade_id ? modalidades.get(t.modalidade_id)?.nome : ''
    return `${comDia ? DIAS_SEMANA_CURTO[t.dia_semana - 1] + ' ' : ''}${formatarHora(t.hora_inicio)}${mod ? ` · ${mod}` : ''} · ${vagas > 0 ? `${vagas} vaga${vagas === 1 ? '' : 's'}` : 'lotado'}`
  }

  async function salvar() {
    const novos = [...new Set(selecionados)]
    const avisos: string[] = []
    const lotados = novos.map(id => turmas.find(t => t.id === id)!).filter(t => (ocupacao[t.id] ?? 0) >= t.capacidade)
    if (lotados.length) avisos.push(`Turma lotada: ${lotados.map(t => rotulo(t, true)).join(', ')}.`)
    if (excedePlano(freq, fixos.length + novos.length)) avisos.push(`Ficará com ${fixos.length + novos.length} horários para um plano de ${freq}x.`)
    if (avisos.length && !(await confirmar({ titulo: 'Salvar mesmo assim?', mensagem: avisos.join(' '), confirmar: 'Salvar' }))) return
    setSalvando(true)
    await onSalvar(novos)
    setEscolhas({})
    setSalvando(false)
  }

  return (
    <div className="card" style={{ marginBottom: 0, padding: 14 }}>
      <div className="card-header" style={{ flexWrap: 'wrap' }}>
        <Link href={`/alunos/${aluno.id}`} style={{ textDecoration: 'none' }}>
          <strong>{aluno.nome}</strong>
        </Link>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {aluno.plano && <span className="plano">{aluno.plano}</span>}
          <span className={`ui-chip ${freq ? '' : 'ui-chip-amarelo'}`}>{freq ? `${freq}x/semana` : 'frequência ?'}</span>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0', fontSize: 13, color: 'var(--ink-500)' }}>
        <History size={14} />
        {sugestoes.length
          ? sugestoes.map(s => (
              <span key={s.dia} className="ui-chip ui-chip-azul" title={`Veio em ${s.vezes} das ${s.semanas} semanas com aula`}>
                {DIAS_SEMANA_CURTO[s.dia - 1]} ({s.vezes}/{s.semanas} sem.)
              </span>
            ))
          : 'Sem padrão nas últimas semanas'}
        {fixos.length > 0 && (
          <>
            <span style={{ marginLeft: 8 }}>Fixo:</span>
            {fixos.map(f => {
              const t = turmas.find(x => x.id === f.horario_id)
              return (
                <span key={f.id} className="ui-chip ui-chip-verde">
                  {t ? `${DIAS_SEMANA_CURTO[t.dia_semana - 1]} ${formatarHora(t.hora_inicio)}` : 'turma inativa'}
                </span>
              )
            })}
          </>
        )}
      </div>

      {turmas.length > 0 && (
        <div className="ui-linha" style={{ alignItems: 'flex-end' }}>
          {diasSugeridos.map(dia => {
            const doDia = turmas.filter(t => t.dia_semana === dia)
            return (
              <div key={dia} className="ui-campo" style={{ marginBottom: 0 }}>
                <label className="label">{DIAS_SEMANA[dia - 1]}</label>
                <select className="ui-select" value={escolhas[dia] ?? ''} onChange={e => setEscolhas(x => ({ ...x, [dia]: e.target.value }))}>
                  <option value="">{doDia.length ? 'Escolha a turma...' : 'Sem turma neste dia'}</option>
                  {doDia.map(t => (
                    <option key={t.id} value={t.id} disabled={turmasFixas.has(t.id)}>
                      {rotulo(t)}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
          <div className="ui-campo" style={{ marginBottom: 0 }}>
            <label className="label">{diasSugeridos.length ? 'Outro dia' : 'Turma'}</label>
            <select className="ui-select" value={escolhas.outro ?? ''} onChange={e => setEscolhas(x => ({ ...x, outro: e.target.value }))}>
              <option value="">Escolha...</option>
              {turmas.map(t => (
                <option key={t.id} value={t.id} disabled={turmasFixas.has(t.id)}>
                  {rotulo(t, true)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="btn ui-btn-azul" disabled={!selecionados.length || salvando} onClick={salvar}>
              <Save size={15} /> Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
