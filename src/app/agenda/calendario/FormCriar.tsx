'use client'

import { useMemo, useState } from 'react'
import { Ban, CalendarPlus, UserPlus } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { DIAS_SEMANA, diaSemanaISO, formatarData, formatarHora, horaFim, sobrepoe } from '@/lib/agenda/datas'
import { agendamentosDaTurma, turmasDoDia } from '../util'
import { ocupacao } from '@/lib/agenda/regras'
import { bloquear, criarAula, definirTurmaAtiva, desfazerBloqueio } from '@/lib/agenda/servico'
import type { DadosPeriodo, Horario } from '@/lib/agenda/tipos'

export type Rascunho = { data: string; hora: string; duracao: number }
type Aba = 'aula' | 'aluno' | 'bloqueio'

type Props = {
  inicial: Rascunho
  dados: DadosPeriodo | null
  completo?: boolean
  abaInicial?: Aba
  onMaisOpcoes?: (r: Rascunho) => void
  onAdicionarAluno: (turma: Horario, data: string) => void
  onConcluido: () => void
  onAlterado: () => void
}

export default function FormCriar({ inicial, dados, completo, abaInicial = 'aula', onMaisOpcoes, onAdicionarAluno, onConcluido, onAlterado }: Props) {
  const { toast } = useFeedback()
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [r, setR] = useState<Rascunho>(inicial)
  const modalidades = dados?.modalidades.filter(m => m.ativo) ?? []
  const [modalidadeId, setModalidadeId] = useState(modalidades.find(m => m.nome === 'Aparelhos')?.id ?? modalidades[0]?.id ?? '')
  const [capacidade, setCapacidade] = useState(modalidades.find(m => m.id === modalidadeId)?.capacidade_padrao ?? 3)
  const [professorId, setProfessorId] = useState('')
  const [repetir, setRepetir] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [motivo, setMotivo] = useState('')
  const [ate, setAte] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Turmas que ja existem nesse horario (para adicionar aluno nelas)
  const turmasNoHorario = useMemo(() => {
    if (!dados) return []
    return turmasDoDia(dados, r.data).filter(h => h.ativo && sobrepoe(h.hora_inicio, h.duracao_min, r.hora, r.duracao))
  }, [dados, r])

  async function executar(fn: () => Promise<void>) {
    setSalvando(true)
    try {
      await fn()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const criar = (depois?: (h: Horario) => void) =>
    executar(async () => {
      const h = await criarAula({
        data: r.data,
        hora: r.hora,
        duracaoMin: r.duracao,
        capacidade,
        modalidadeId: modalidadeId || null,
        professorId: professorId || null,
        repetir,
        observacao
      })
      toast(repetir ? `Turma criada: toda ${DIAS_SEMANA[diaSemanaISO(r.data) - 1].toLowerCase()} às ${r.hora}.` : 'Aula criada.', 'sucesso', {
        rotulo: 'Desfazer',
        onClick: () => definirTurmaAtiva(h.id, false).then(onAlterado).catch(e => toast(mensagemDeErro(e), 'erro'))
      })
      onAlterado()
      onConcluido()
      depois?.(h)
    })

  const criarBloqueio = () =>
    executar(async () => {
      const b = await bloquear({ data: r.data, dataFim: ate || null, motivo })
      toast(`Dia bloqueado. ${b.cancelados} agendamento(s) cancelado(s).`, 'sucesso', {
        rotulo: 'Desfazer',
        onClick: () => desfazerBloqueio(b.bloqueio_id).then(onAlterado).catch(e => toast(mensagemDeErro(e), 'erro'))
      })
      onAlterado()
      onConcluido()
    })

  const camposHorario = (
    <>
    <div className="fc-form-horario">
      <input className="input" type="date" value={r.data} onChange={e => setR({ ...r, data: e.target.value })} aria-label="Data" />
      {aba !== 'bloqueio' && (
        <>
          <input className="input" type="time" value={r.hora} step={300} onChange={e => setR({ ...r, hora: e.target.value })} aria-label="Início" />
          <select className="ui-select" value={r.duracao} onChange={e => setR({ ...r, duracao: Number(e.target.value) })} aria-label="Duração">
            {[30, 45, 50, 55, 60, 75, 90, 120].concat([r.duracao]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map(v => (
              <option key={v} value={v}>
                {v} min
              </option>
            ))}
          </select>
        </>
      )}
    </div>
    {aba !== 'bloqueio' && (
      <p className="fc-form-ate">
        {DIAS_SEMANA[diaSemanaISO(r.data) - 1]}, {formatarData(r.data)} · {r.hora} – {horaFim(r.hora, r.duracao)}
      </p>
    )}
    </>
  )

  return (
    <div className="fc-form">
      <div className="ui-segmentos" style={{ marginBottom: 12 }}>
        <button className={aba === 'aula' ? 'ativo' : ''} onClick={() => setAba('aula')}>Aula</button>
        <button className={aba === 'aluno' ? 'ativo' : ''} onClick={() => setAba('aluno')}>Aluno</button>
        <button className={aba === 'bloqueio' ? 'ativo' : ''} onClick={() => setAba('bloqueio')}>Bloqueio</button>
      </div>

      {camposHorario}

      {aba === 'aula' && (
        <>
          <div className="ui-linha">
            <div className="ui-campo">
              <label className="label">Modalidade</label>
              <select
                className="ui-select"
                value={modalidadeId}
                onChange={e => {
                  setModalidadeId(e.target.value)
                  const m = modalidades.find(x => x.id === e.target.value)
                  if (m) setCapacidade(m.capacidade_padrao)
                }}
              >
                <option value="">Sem modalidade</option>
                {modalidades.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="ui-campo" style={{ flex: '0 1 110px' }}>
              <label className="label">Vagas</label>
              <input className="input" type="number" min={1} value={capacidade} onChange={e => setCapacidade(Number(e.target.value))} />
            </div>
          </div>
          <div className="ui-campo">
            <label className="label">Professor</label>
            <select className="ui-select" value={professorId} onChange={e => setProfessorId(e.target.value)}>
              <option value="">Sem professor</option>
              {dados?.professores.filter(p => p.ativo).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={repetir} onChange={e => setRepetir(e.target.checked)} />
            Repetir toda {DIAS_SEMANA[diaSemanaISO(r.data) - 1].toLowerCase()} (turma fixa da grade)
          </label>
          {completo && (
            <div className="ui-campo">
              <label className="label">Observação</label>
              <input className="input" value={observacao} onChange={e => setObservacao(e.target.value)} />
            </div>
          )}
          <div className="fc-form-rodape">
            {onMaisOpcoes && (
              <button className="btn btn-sec" onClick={() => onMaisOpcoes(r)}>
                Mais opções
              </button>
            )}
            <button className="btn ui-btn-azul" disabled={salvando || capacidade < 1 || !r.hora} onClick={() => criar()}>
              <CalendarPlus size={15} /> Salvar
            </button>
          </div>
        </>
      )}

      {aba === 'aluno' && (
        <>
          {turmasNoHorario.length > 0 ? (
            <>
              <p style={{ fontSize: 13, marginBottom: 8 }}>Escolha a aula para adicionar reposição, avulsa ou experimental:</p>
              <div className="ui-lista-opcoes" style={{ marginBottom: 12 }}>
                {turmasNoHorario.map(h => {
                  const oc = ocupacao(h.capacidade, agendamentosDaTurma(dados!, h.id, r.data))
                  const mod = dados!.modalidades.find(m => m.id === h.modalidade_id)
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        onConcluido()
                        onAdicionarAluno(h, r.data)
                      }}
                    >
                      <span>
                        <b>{formatarHora(h.hora_inicio)}</b> {mod?.nome ?? 'Turma'}
                      </span>
                      <span className={`ag-ocupacao ag-nivel-${oc.nivel}`} style={{ fontSize: 11.5, padding: '2px 8px' }}>
                        {oc.ocupados}/{oc.capacidade}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, marginBottom: 10 }}>Não há aula neste horário. Crie uma aula única e já adicione o aluno:</p>
          )}
          <div className="ui-linha">
            <div className="ui-campo">
              <label className="label">Nova aula: modalidade</label>
              <select
                className="ui-select"
                value={modalidadeId}
                onChange={e => {
                  setModalidadeId(e.target.value)
                  const m = modalidades.find(x => x.id === e.target.value)
                  if (m) setCapacidade(m.capacidade_padrao)
                }}
              >
                <option value="">Sem modalidade</option>
                {modalidades.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="ui-campo" style={{ flex: '0 1 110px' }}>
              <label className="label">Vagas</label>
              <input className="input" type="number" min={1} value={capacidade} onChange={e => setCapacidade(Number(e.target.value))} />
            </div>
          </div>
          <div className="fc-form-rodape">
            <button className="btn ui-btn-azul" disabled={salvando || capacidade < 1} onClick={() => criar(h => onAdicionarAluno(h, r.data))}>
              <UserPlus size={15} /> Criar aula e adicionar aluno
            </button>
          </div>
        </>
      )}

      {aba === 'bloqueio' && (
        <>
          <div className="ui-campo">
            <label className="label">Até (opcional, para recesso)</label>
            <input className="input" type="date" value={ate} min={r.data} onChange={e => setAte(e.target.value)} />
          </div>
          <div className="ui-campo">
            <label className="label">Motivo</label>
            <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: Feriado de Finados" />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 10 }}>
            Fecha o estúdio {ate ? `de ${formatarData(r.data)} a ${formatarData(ate)}` : `em ${formatarData(r.data)}`}: as aulas são canceladas e os alunos recebem crédito de reposição. Para cancelar só uma aula, clique nela.
          </p>
          <div className="fc-form-rodape">
            <button className="btn btn-danger" disabled={salvando || motivo.trim().length < 3 || (!!ate && ate < r.data)} onClick={criarBloqueio}>
              <Ban size={15} /> Bloquear
            </button>
          </div>
        </>
      )}
    </div>
  )
}
