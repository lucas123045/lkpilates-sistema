'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, Trash2 } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { formatarData, formatarDataLonga, formatarHora, sobrepoe } from '@/lib/agenda/datas'
import { ocupaVaga } from '@/lib/agenda/regras'
import { bloquear, desfazerBloqueio, entrarListaEspera, sairListaEspera, trocarProfessor } from '@/lib/agenda/servico'
import type { AlunoResumo, DadosPeriodo, Horario, Professor } from '@/lib/agenda/tipos'
import { agendamentosDaTurma, turmasDoDia } from '../util'
import { SeletorAluno } from './Seletores'

type Turma = { horario: Horario; data: string }

function useSalvar(onAlterado: () => void, onFechar: () => void) {
  const { toast } = useFeedback()
  const [salvando, setSalvando] = useState(false)
  async function salvar(acao: () => Promise<string | { mensagem: string; desfazer: () => Promise<unknown> }>) {
    setSalvando(true)
    try {
      const r = await acao()
      if (typeof r === 'string') toast(r)
      else
        toast(r.mensagem, 'sucesso', {
          rotulo: 'Desfazer',
          onClick: () => r.desfazer().then(onAlterado).catch(e => toast(mensagemDeErro(e), 'erro'))
        })
      onAlterado()
      onFechar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }
  return { salvando, salvar }
}

/* ---------------- Cancelar aula (pelo estudio) ---------------- */

export function ModalCancelarAula({ turma, dados, onFechar, onAlterado }: { turma: Turma | null; dados: DadosPeriodo; onFechar: () => void; onAlterado: () => void }) {
  const { confirmar } = useFeedback()
  const [motivo, setMotivo] = useState('')
  const [credito, setCredito] = useState(true)
  const { salvando, salvar } = useSalvar(onAlterado, onFechar)

  useEffect(() => {
    setMotivo('')
    setCredito(true)
  }, [turma])

  if (!turma) return null
  const afetados = agendamentosDaTurma(dados, turma.horario.id, turma.data).filter(a => a.status === 'agendado')

  async function executar() {
    const ok = await confirmar({
      titulo: 'Cancelar esta aula?',
      mensagem: `${afetados.length} agendamento(s) serão cancelados${credito ? ' e os alunos de horário fixo/reposição recebem crédito de reposição' : ''}. O horário fica bloqueado nesta data.`,
      confirmar: 'Cancelar aula',
      perigo: true
    })
    if (!ok) return
    salvar(async () => {
      const r = await bloquear({ data: turma!.data, horarioId: turma!.horario.id, motivo, gerarCredito: credito })
      return {
        mensagem: `Aula cancelada: ${r.cancelados} agendamento(s), ${r.creditos} crédito(s) gerado(s).`,
        desfazer: () => desfazerBloqueio(r.bloqueio_id)
      }
    })
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Cancelar aula"
      subtitulo={`${formatarDataLonga(turma.data)} às ${formatarHora(turma.horario.hora_inicio)}`}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Voltar</button>
          <button className="btn btn-danger" disabled={salvando || motivo.trim().length < 3} onClick={executar}>
            <Ban size={15} /> Cancelar aula
          </button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Motivo</label>
        <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: instrutora ausente, feriado" autoFocus />
      </div>
      <label className="ui-check">
        <input type="checkbox" checked={credito} onChange={e => setCredito(e.target.checked)} />
        Gerar crédito de reposição para os alunos
      </label>
      <p style={{ fontSize: 13 }}>
        {afetados.length ? `Afetados: ${afetados.map(a => a.aluno?.nome ?? a.experimental_nome).join(', ')}.` : 'Nenhum aluno agendado.'}
      </p>
    </Modal>
  )
}

/* ---------------- Trocar professor da turma ---------------- */

export function ModalProfessorTurma({
  turma,
  dados,
  professores,
  onFechar,
  onAlterado
}: {
  turma: Turma | null
  dados: DadosPeriodo
  professores: Professor[]
  onFechar: () => void
  onAlterado: () => void
}) {
  const [profId, setProfId] = useState('')
  const [escopo, setEscopo] = useState<'dia' | 'permanente'>('dia')
  const { salvando, salvar } = useSalvar(onAlterado, onFechar)

  useEffect(() => {
    setProfId(turma?.horario.professor_id ?? '')
    setEscopo('dia')
  }, [turma])

  if (!turma) return null
  const h = turma.horario

  // Conflito: o professor ja atende outra turma sobreposta nesta data?
  const conflitos = profId
    ? turmasDoDia(dados, turma.data).filter(
        t =>
          t.id !== h.id &&
          sobrepoe(t.hora_inicio, t.duracao_min, h.hora_inicio, h.duracao_min) &&
          (t.professor_id === profId ||
            agendamentosDaTurma(dados, t.id, turma.data).some(a => a.professor_id === profId && ocupaVaga(a.status)))
      )
    : []

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Professor da turma"
      subtitulo={`${formatarDataLonga(turma.data)} às ${formatarHora(h.hora_inicio)}`}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button
            className="btn ui-btn-azul"
            disabled={salvando}
            onClick={() =>
              salvar(async () => {
                const r = await trocarProfessor({ professorId: profId || null, escopo, horarioId: h.id, data: turma.data })
                return escopo === 'dia'
                  ? `Substituição registrada em ${formatarData(turma.data)} (${r.atualizados} aluno(s)).`
                  : 'Professor padrão da turma atualizado.'
              })
            }
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Professor</label>
        <select className="ui-select" value={profId} onChange={e => setProfId(e.target.value)}>
          <option value="">Sem professor</option>
          {professores.filter(p => p.ativo).map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>
      <label className="ui-check">
        <input type="radio" checked={escopo === 'dia'} onChange={() => setEscopo('dia')} />
        <span>
          <strong>Só nesta data</strong> — substituição pontual; vale para todos os alunos desta aula.
        </span>
      </label>
      <label className="ui-check">
        <input type="radio" checked={escopo === 'permanente'} onChange={() => setEscopo('permanente')} />
        <span>
          <strong>Permanente</strong> — muda o professor padrão da turma nas próximas aulas (alunos com professor próprio não mudam).
        </span>
      </label>
      {conflitos.length > 0 && (
        <div className="ui-alerta ui-alerta-aviso">
          <AlertTriangle size={16} />
          <div>
            Conflito: este professor já está em {conflitos.map(t => formatarHora(t.hora_inicio)).join(', ')} neste dia (horário sobreposto).
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------- Lista de espera ---------------- */

export function ModalListaEspera({ turma, dados, onFechar, onAlterado }: { turma: Turma | null; dados: DadosPeriodo; onFechar: () => void; onAlterado: () => void }) {
  const { toast } = useFeedback()
  const [aluno, setAluno] = useState<AlunoResumo | null>(null)
  const [recorrente, setRecorrente] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setAluno(null)
    setRecorrente(false)
  }, [turma])

  if (!turma) return null
  const itens = dados.listaEspera.filter(e => e.horario_id === turma.horario.id && (!e.data || e.data === turma.data))
  const oc = agendamentosDaTurma(dados, turma.horario.id, turma.data).filter(a => ocupaVaga(a.status)).length
  const vagas = Math.max(turma.horario.capacidade - oc, 0)

  async function acao(fn: () => Promise<void>, msg: string) {
    setSalvando(true)
    try {
      await fn()
      toast(msg)
      onAlterado()
      setAluno(null)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal aberto onFechar={onFechar} titulo="Lista de espera" subtitulo={`${formatarDataLonga(turma.data)} às ${formatarHora(turma.horario.hora_inicio)}`}>
      {vagas > 0 && itens.length > 0 && (
        <div className="ui-alerta ui-alerta-aviso">
          <AlertTriangle size={16} /> Há {vagas} vaga(s) livre(s) nesta aula. Use “Adicionar” para encaixar quem está esperando.
        </div>
      )}
      {!itens.length && <p style={{ marginBottom: 12 }}>Ninguém na espera para este horário.</p>}
      {itens.length > 0 && (
        <div className="ui-lista-opcoes" style={{ marginBottom: 16 }}>
          {itens.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
              <strong style={{ width: 22 }}>{i + 1}.</strong>
              <span style={{ flex: 1 }}>
                {e.aluno?.nome ?? 'Aluno'}{' '}
                <span className="ui-chip">{e.data ? `só ${formatarData(e.data)}` : 'recorrente'}</span>
              </span>
              <button className="ui-icon-btn" title="Remover da espera" disabled={salvando} onClick={() => acao(() => sairListaEspera(e.id), 'Removido da lista de espera.')}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ag-secao-titulo">Colocar na espera</div>
      <SeletorAluno selecionado={aluno} onSelecionar={setAluno} />
      <label className="ui-check">
        <input type="checkbox" checked={recorrente} onChange={e => setRecorrente(e.target.checked)} />
        Quer entrar nesta turma de forma fixa (toda semana)
      </label>
      <button
        className="btn ui-btn-azul"
        disabled={!aluno || salvando}
        onClick={() => acao(() => entrarListaEspera(aluno!.id, turma.horario.id, recorrente ? null : turma.data), `${aluno!.nome} entrou na espera.`)}
      >
        Adicionar à espera
      </button>
    </Modal>
  )
}

/* ---------------- Bloqueio de dia / feriado / recesso ---------------- */

export function ModalBloqueio({ aberto, dataInicial, onFechar, onAlterado }: { aberto: boolean; dataInicial: string; onFechar: () => void; onAlterado: () => void }) {
  const { confirmar } = useFeedback()
  const [data, setData] = useState(dataInicial)
  const [dataFim, setDataFim] = useState('')
  const [motivo, setMotivo] = useState('')
  const [credito, setCredito] = useState(true)
  const { salvando, salvar } = useSalvar(onAlterado, onFechar)

  useEffect(() => {
    if (aberto) {
      setData(dataInicial)
      setDataFim('')
      setMotivo('')
      setCredito(true)
    }
  }, [aberto, dataInicial])

  if (!aberto) return null

  async function executar() {
    const ok = await confirmar({
      titulo: 'Bloquear o estúdio?',
      mensagem: `Todas as aulas ${dataFim ? `de ${formatarData(data)} a ${formatarData(dataFim)}` : `de ${formatarData(data)}`} serão canceladas${credito ? ', com crédito de reposição para os alunos' : ''}.`,
      confirmar: 'Bloquear',
      perigo: true
    })
    if (!ok) return
    salvar(async () => {
      const r = await bloquear({ data, dataFim: dataFim || null, motivo, gerarCredito: credito })
      return {
        mensagem: `Bloqueado. ${r.cancelados} aula(s) de aluno cancelada(s), ${r.creditos} crédito(s) gerado(s).`,
        desfazer: () => desfazerBloqueio(r.bloqueio_id)
      }
    })
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Feriado / recesso / dia fechado"
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-danger" disabled={salvando || !data || motivo.trim().length < 3 || (!!dataFim && dataFim < data)} onClick={executar}>
            <Ban size={15} /> Bloquear
          </button>
        </>
      }
    >
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">De</label>
          <input className="input" type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Até (opcional)</label>
          <input className="input" type="date" value={dataFim} min={data} onChange={e => setDataFim(e.target.value)} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Motivo</label>
        <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: Feriado de Nossa Senhora Aparecida" />
      </div>
      <label className="ui-check">
        <input type="checkbox" checked={credito} onChange={e => setCredito(e.target.checked)} />
        Gerar crédito de reposição para os alunos afetados
      </label>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
        Para fechar só um horário, use “Cancelar aula” no card da turma. Bloqueios podem ser removidos em Configurações.
      </p>
    </Modal>
  )
}
