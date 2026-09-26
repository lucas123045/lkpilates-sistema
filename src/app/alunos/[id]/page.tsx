'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CalendarDays, Plus, Save } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import Modal from '@/app/components/ui/Modal'
import { DIAS_SEMANA, formatarData, formatarDataLonga, formatarHora, hojeEstudio, horaFim, somarDias } from '@/lib/agenda/datas'
import { excedePlano, frequenciaDoPlano, iniciais, ROTULO_STATUS, ROTULO_TIPO, situacaoCredito } from '@/lib/agenda/regras'
import {
  adicionarHorarioFixo,
  atualizarAluno,
  atualizarProfessorDoFixo,
  carregarAluno,
  creditosDoAluno,
  encerrarHorarioFixo,
  fixosPorHorario,
  historicoAgendaAluno,
  horariosFixosDoAluno,
  listarGrade
} from '@/lib/agenda/servico'
import type { Agendamento, AlunoResumo, Credito, Horario, HorarioFixo, Modalidade, Professor } from '@/lib/agenda/tipos'
import '@/app/components/ui/ui.css'
import '@/app/agenda/agenda.css'

const CHIP_SITUACAO = { ativo: 'ui-chip-verde', usado: 'ui-chip-azul', vencido: 'ui-chip-vermelho', cancelado: 'ui-chip-cinza' }

export default function AgendaDoAluno() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()

  const [aluno, setAluno] = useState<AlunoResumo | null>(null)
  const [fixos, setFixos] = useState<HorarioFixo[]>([])
  const [creditos, setCreditos] = useState<Credito[]>([])
  const [historico, setHistorico] = useState<Agendamento[]>([])
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [ocupacaoFixos, setOcupacaoFixos] = useState<Record<string, number>>({})
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  const [telefone, setTelefone] = useState('')
  const [frequencia, setFrequencia] = useState<number | ''>('')
  const [professorAluno, setProfessorAluno] = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [a, f, c, h, g, o] = await Promise.all([
        carregarAluno(id),
        horariosFixosDoAluno(id),
        creditosDoAluno(id),
        historicoAgendaAluno(id),
        listarGrade(),
        fixosPorHorario(hoje)
      ])
      setAluno(a)
      setFixos(f)
      setCreditos(c)
      setHistorico(h)
      setHorarios(g.horarios)
      setProfessores(g.professores)
      setModalidades(g.modalidades)
      setOcupacaoFixos(o)
      if (a) {
        setTelefone(a.telefone ?? '')
        setFrequencia(a.frequencia_semanal ?? '')
        setProfessorAluno(a.professor_id ?? '')
      }
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [id, hoje])

  useEffect(() => {
    carregar()
  }, [carregar])

  const turmas = useMemo(() => new Map(horarios.map(h => [h.id, h])), [horarios])
  const profs = useMemo(() => new Map(professores.map(p => [p.id, p])), [professores])
  const mods = useMemo(() => new Map(modalidades.map(m => [m.id, m])), [modalidades])

  const vigentes = fixos.filter(f => !f.data_fim || f.data_fim >= hoje)
  const encerrados = fixos.filter(f => f.data_fim && f.data_fim < hoje)
  const convertidos = vigentes.filter(f => f.horario_id)
  const naoConvertidos = vigentes.filter(f => !f.horario_id)

  if (carregando) return <div className="ui-skeleton" style={{ height: 320 }} />
  if (erro) return <div className="ui-alerta ui-alerta-erro">{erro}</div>
  if (!aluno) return <div className="ui-estado">Aluno não encontrado.</div>

  const freq = aluno.frequencia_semanal ?? frequenciaDoPlano(aluno.plano)
  const passouDoPlano = excedePlano(freq, convertidos.length)

  async function executar(acao: () => Promise<void>, msg: string) {
    try {
      await acao()
      toast(msg)
      await carregar()
      return true
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
      return false
    }
  }

  async function encerrar(f: HorarioFixo) {
    const h = f.horario_id ? turmas.get(f.horario_id) : null
    const ok = await confirmar({
      titulo: 'Tirar este horário fixo?',
      mensagem: `${aluno!.nome} deixa de ${h ? `${DIAS_SEMANA[h.dia_semana - 1]} ${formatarHora(h.hora_inicio)}` : 'este horário'} a partir de hoje. As próximas aulas ainda não marcadas saem da agenda; o histórico é mantido.`,
      confirmar: 'Tirar horário',
      perigo: true
    })
    if (ok) executar(() => encerrarHorarioFixo(f.id, somarDias(hoje, -1)), 'Horário fixo encerrado.')
  }

  return (
    <div>
      <button className="btn btn-sec" onClick={() => router.back()} style={{ marginBottom: 14 }}>
        <ArrowLeft size={15} /> Voltar
      </button>

      <div className="ag-topo">
        <div>
          <h1>{aluno.nome}</h1>
          <div className="ag-data-titulo">
            {aluno.plano || 'Sem plano'} · {aluno.aulas_restantes} aula(s) restante(s) {!aluno.ativo && '· INATIVO'}
          </div>
        </div>
        <Link href="/agenda" className="btn btn-sec" style={{ textDecoration: 'none' }}>
          <CalendarDays size={15} /> Agenda
        </Link>
      </div>

      {!aluno.ativo && (
        <div className="ui-alerta ui-alerta-aviso">
          <AlertTriangle size={16} /> Aluno inativo: não aparece nos horários fixos da agenda até ser reativado (em Relatórios).
        </div>
      )}

      {/* ---------- Dados ---------- */}
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>Dados para a agenda</h2>
        <div className="ui-linha">
          <div className="ui-campo">
            <label className="label">Telefone / WhatsApp</label>
            <input className="input" value={telefone} inputMode="tel" onChange={e => setTelefone(e.target.value)} />
          </div>
          <div className="ui-campo">
            <label className="label">Aulas por semana</label>
            <input
              className="input"
              type="number"
              min={1}
              max={7}
              placeholder={frequenciaDoPlano(aluno.plano) ? `do plano: ${frequenciaDoPlano(aluno.plano)}` : 'não definido'}
              value={frequencia}
              onChange={e => setFrequencia(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="ui-campo">
            <label className="label">Professor responsável</label>
            <select className="ui-select" value={professorAluno} onChange={e => setProfessorAluno(e.target.value)}>
              <option value="">O da turma</option>
              {professores.filter(p => p.ativo || p.id === professorAluno).map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 10 }}>
          Professor responsável tem prioridade sobre o professor da turma (e perde para trocas de um dia específico).
        </p>
        <button
          className="btn ui-btn-azul"
          onClick={() =>
            executar(
              () => atualizarAluno(aluno.id, { telefone: telefone || null, frequencia_semanal: frequencia === '' ? null : frequencia, professor_id: professorAluno || null }),
              'Dados salvos.'
            )
          }
        >
          <Save size={15} /> Salvar dados
        </button>
      </div>

      {/* ---------- Horarios fixos ---------- */}
      <div className="card">
        <div className="card-header" style={{ marginBottom: 10 }}>
          <h2>Horários fixos</h2>
          <button className="btn ui-btn-azul" onClick={() => setAdicionando(true)}>
            <Plus size={15} /> Adicionar
          </button>
        </div>

        {passouDoPlano && (
          <div className="ui-alerta ui-alerta-aviso">
            <AlertTriangle size={16} /> {convertidos.length} horários fixos para um plano de {freq}x por semana.
          </div>
        )}

        {!vigentes.length && <p>Nenhum horário fixo. O aluno só aparece na agenda com reposições/avulsas.</p>}

        {convertidos.map(f => {
          const h = turmas.get(f.horario_id!)
          if (!h) return null
          const p = h.professor_id ? profs.get(h.professor_id) : null
          return (
            <div key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <strong style={{ minWidth: 150 }}>
                {DIAS_SEMANA[h.dia_semana - 1]} {formatarHora(h.hora_inicio)}
              </strong>
              <span className="ui-chip">{h.modalidade_id ? mods.get(h.modalidade_id)?.nome : 'Turma'}</span>
              <span className="ui-chip">desde {f.data_inicio ? formatarData(f.data_inicio) : '—'}</span>
              {f.data_fim && <span className="ui-chip ui-chip-amarelo">até {formatarData(f.data_fim)}</span>}
              {!h.ativo && <span className="ui-chip ui-chip-vermelho">turma desativada</span>}
              <select
                className="ui-select"
                style={{ width: 'auto', flex: '1 1 180px' }}
                value={f.professor_id ?? ''}
                onChange={e => executar(() => atualizarProfessorDoFixo(f.id, e.target.value || null), 'Professor deste horário atualizado.')}
                title="Professor deste aluno nesta turma"
              >
                <option value="">Professor: {p ? `${p.nome} (da turma)` : 'o da turma'}</option>
                {professores.filter(x => x.ativo || x.id === f.professor_id).map(x => (
                  <option key={x.id} value={x.id}>Professor: {x.nome}</option>
                ))}
              </select>
              <button className="btn btn-sec btn-sm" onClick={() => encerrar(f)}>
                Tirar
              </button>
            </div>
          )
        })}

        {naoConvertidos.length > 0 && (
          <div className="ui-alerta ui-alerta-aviso" style={{ marginTop: 10 }}>
            <AlertTriangle size={16} />
            <div>
              Horários antigos que não puderam ser ligados à grade:{' '}
              {naoConvertidos.map(f => `"${f.dia_semana ?? '?'} ${f.horario ?? '?'}"`).join(', ')}. Adicione o horário correto acima e depois remova estes.
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {naoConvertidos.map(f => (
                  <button key={f.id} className="btn btn-sec btn-sm" onClick={() => executar(() => encerrarHorarioFixo(f.id, somarDias(hoje, -1)), 'Removido.')}>
                    Remover “{f.dia_semana} {f.horario}”
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {encerrados.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--ink-500)', fontSize: 13 }}>{encerrados.length} horário(s) anterior(es)</summary>
            {encerrados.map(f => {
              const h = f.horario_id ? turmas.get(f.horario_id) : null
              return (
                <p key={f.id} style={{ fontSize: 13, padding: '4px 0' }}>
                  {h ? `${DIAS_SEMANA[h.dia_semana - 1]} ${formatarHora(h.hora_inicio)}` : `${f.dia_semana} ${f.horario}`} —{' '}
                  {f.data_inicio ? formatarData(f.data_inicio) : '?'} a {formatarData(f.data_fim!)}
                </p>
              )
            })}
          </details>
        )}
      </div>

      {/* ---------- Creditos ---------- */}
      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Créditos de reposição</h2>
        {!creditos.length && <p>Nenhum crédito.</p>}
        {creditos.map(c => {
          const s = situacaoCredito(c, hoje)
          return (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <span className={`ui-chip ${CHIP_SITUACAO[s]}`}>{s}</span>
              <span>Gerado em {formatarData(c.criado_em.slice(0, 10))}</span>
              <span style={{ color: 'var(--ink-500)' }}>vence {formatarData(c.expira_em)}</span>
            </div>
          )
        })}
      </div>

      {/* ---------- Historico ---------- */}
      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Agenda do aluno</h2>
        {!historico.length && <p>Nenhum agendamento ainda.</p>}
        {historico.map(a => {
          const p = a.professor_id ? profs.get(a.professor_id) : null
          return (
            <Link
              key={a.id}
              href={`/agenda?data=${a.data}`}
              style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--line)', textDecoration: 'none', opacity: a.data < hoje ? 0.85 : 1 }}
            >
              <span style={{ minWidth: 190 }}>
                {formatarDataLonga(a.data)} {formatarHora(a.hora)}
              </span>
              <span className="ui-chip">{ROTULO_STATUS[a.status]}</span>
              {a.tipo !== 'fixo' && <span className="ui-chip ui-chip-laranja">{ROTULO_TIPO[a.tipo]}</span>}
              <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
                <span className="ag-avatar pequeno" style={{ background: p?.cor ?? '#98a2b3' }}>{p ? iniciais(p.nome) : '—'}</span>
                {p?.nome ?? 'Sem professor'}
              </span>
            </Link>
          )
        })}
      </div>

      {adicionando && (
        <ModalNovoFixo
          aluno={aluno}
          horarios={horarios}
          professores={professores}
          modalidades={mods}
          ocupacao={ocupacaoFixos}
          jaTem={new Set(convertidos.map(f => f.horario_id!))}
          fixosAtuais={convertidos.length}
          frequencia={freq}
          onFechar={() => setAdicionando(false)}
          onSalvar={async (horarioId, dataInicio, professorId) => {
            const ok = await executar(
              () => adicionarHorarioFixo({ alunoId: aluno.id, horarioId, dataInicio, professorId }),
              'Horário fixo adicionado. O aluno já aparece na agenda.'
            )
            if (ok) setAdicionando(false)
          }}
        />
      )}
    </div>
  )
}

function ModalNovoFixo({
  aluno,
  horarios,
  professores,
  modalidades,
  ocupacao,
  jaTem,
  fixosAtuais,
  frequencia,
  onFechar,
  onSalvar
}: {
  aluno: AlunoResumo
  horarios: Horario[]
  professores: Professor[]
  modalidades: Map<string, Modalidade>
  ocupacao: Record<string, number>
  jaTem: Set<string>
  fixosAtuais: number
  frequencia: number | null
  onFechar: () => void
  onSalvar: (horarioId: string, dataInicio: string, professorId: string | null) => void
}) {
  const { confirmar } = useFeedback()
  const [sel, setSel] = useState<string | null>(null)
  const [inicio, setInicio] = useState(hojeEstudio())
  const [prof, setProf] = useState('')
  const ativos = horarios.filter(h => h.ativo && h.origem !== 'aula_unica')

  async function salvar() {
    if (!sel) return
    const h = ativos.find(x => x.id === sel)!
    const avisos: string[] = []
    if ((ocupacao[sel] ?? 0) >= h.capacidade) avisos.push(`A turma já tem ${ocupacao[sel]} aluno(s) fixo(s) para ${h.capacidade} vaga(s).`)
    if (excedePlano(frequencia, fixosAtuais + 1)) avisos.push(`O aluno ficará com ${fixosAtuais + 1} horários para um plano de ${frequencia}x por semana.`)
    if (avisos.length) {
      const ok = await confirmar({ titulo: 'Confirmar mesmo assim?', mensagem: avisos.join(' '), confirmar: 'Adicionar' })
      if (!ok) return
    }
    onSalvar(sel, inicio, prof || null)
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Novo horário fixo"
      subtitulo={aluno.nome}
      largura={640}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={!sel || !inicio} onClick={salvar}>Adicionar</button>
        </>
      }
    >
      {!ativos.length && <p>Nenhuma turma na grade. Cadastre em Agenda → Grade e professores.</p>}
      {DIAS_SEMANA.map((nomeDia, i) => {
        const doDia = ativos.filter(h => h.dia_semana === i + 1)
        if (!doDia.length) return null
        return (
          <div key={nomeDia}>
            <div className="ag-secao-titulo">{nomeDia}</div>
            <div className="ag-opcoes-horario">
              {doDia.map(h => {
                const n = ocupacao[h.id] ?? 0
                const vagas = h.capacidade - n
                const nivel = vagas <= 0 ? 'lotado' : vagas === 1 && h.capacidade > 1 ? 'quase' : 'livre'
                return (
                  <button
                    key={h.id}
                    className={`ag-opcao-horario${sel === h.id ? ' selecionado' : ''}`}
                    disabled={jaTem.has(h.id)}
                    onClick={() => setSel(h.id)}
                    title={`${formatarHora(h.hora_inicio)}–${horaFim(h.hora_inicio, h.duracao_min)}`}
                  >
                    <strong>{formatarHora(h.hora_inicio)}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-500)', marginBottom: 4 }}>{h.modalidade_id ? modalidades.get(h.modalidade_id)?.nome : 'Turma'}</div>
                    <span className={`ag-ocupacao ag-nivel-${nivel}`} style={{ fontSize: 11.5, padding: '2px 7px' }}>
                      {jaTem.has(h.id) ? 'já é fixo' : vagas > 0 ? `${vagas} vaga${vagas === 1 ? '' : 's'}` : 'lotado'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="ui-linha" style={{ marginTop: 16 }}>
        <div className="ui-campo">
          <label className="label">Começa em</label>
          <input className="input" type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Professor neste horário</label>
          <select className="ui-select" value={prof} onChange={e => setProf(e.target.value)}>
            <option value="">O da turma / do aluno</option>
            {professores.filter(p => p.ativo).map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Vagas consideram os alunos com horário fixo ativo em cada turma.</p>
    </Modal>
  )
}
