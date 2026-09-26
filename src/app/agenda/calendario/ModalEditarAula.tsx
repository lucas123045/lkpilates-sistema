'use client'

import { useState } from 'react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { formatarHora, horaFim } from '@/lib/agenda/datas'
import type { EventoAula } from '@/lib/agenda/eventos'
import { atualizarTurma, desfazerMovimento, moverAula, trocarProfessor, type EscopoRecorrencia } from '@/lib/agenda/servico'
import type { Modalidade, Professor } from '@/lib/agenda/tipos'

type Props = {
  evento: EventoAula
  professores: Professor[]
  modalidades: Modalidade[]
  perguntarRecorrencia: (titulo: string) => Promise<EscopoRecorrencia | null>
  onFechar: () => void
  onAlterado: () => void
}

export default function ModalEditarAula({ evento: e, professores, modalidades, perguntarRecorrencia, onFechar, onAlterado }: Props) {
  const { toast } = useFeedback()
  const h = e.horario
  const [data, setData] = useState(e.data)
  const [hora, setHora] = useState(formatarHora(h.hora_inicio))
  const [duracao, setDuracao] = useState(h.duracao_min)
  const [capacidade, setCapacidade] = useState(h.capacidade)
  const [modalidadeId, setModalidadeId] = useState(h.modalidade_id ?? '')
  const [professorId, setProfessorId] = useState(h.professor_id ?? '')
  const [salvando, setSalvando] = useState(false)

  const tempoMudou = data !== e.data || hora !== formatarHora(h.hora_inicio) || duracao !== h.duracao_min
  const outrosMudou = capacidade !== h.capacidade || (modalidadeId || null) !== h.modalidade_id
  const profMudou = (professorId || null) !== h.professor_id
  const mudou = tempoMudou || outrosMudou || profMudou

  async function salvar() {
    const escopo: EscopoRecorrencia | null = e.unica ? 'esta' : await perguntarRecorrencia('Editar aula recorrente')
    if (!escopo) return
    setSalvando(true)
    try {
      let alvoId = h.id
      let movimentoId: string | null = null
      const precisaMover =
        tempoMudou || (!e.unica && ((outrosMudou && escopo !== 'todas') || (profMudou && escopo === 'seguintes')))

      if (precisaMover) {
        const r = await moverAula({ horarioId: h.id, data: e.data, novaData: data, novaHora: hora, novaDuracao: duracao, escopo })
        alvoId = r.horario_id
        movimentoId = r.movimento_id
      }
      if (outrosMudou) {
        await atualizarTurma(alvoId, { capacidade, modalidade_id: modalidadeId || null })
      }
      if (profMudou) {
        if (escopo === 'esta' && !e.unica && !precisaMover) {
          await trocarProfessor({ professorId: professorId || null, escopo: 'dia', horarioId: h.id, data: e.data })
        } else {
          await trocarProfessor({ professorId: professorId || null, escopo: 'permanente', horarioId: alvoId })
        }
      }

      const soHorario = movimentoId && !outrosMudou && !profMudou
      toast(
        'Aula atualizada.',
        'sucesso',
        soHorario
          ? { rotulo: 'Desfazer', onClick: () => desfazerMovimento(movimentoId!).then(onAlterado).catch(err => toast(mensagemDeErro(err), 'erro')) }
          : undefined
      )
      onAlterado()
      onFechar()
    } catch (err) {
      toast(mensagemDeErro(err), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Editar aula"
      subtitulo={e.unica ? 'Aula única' : 'Turma semanal: você poderá escolher se vale só para esta aula ou para as próximas'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={!mudou || salvando || capacidade < 1 || duracao < 10} onClick={salvar}>
            Salvar
          </button>
        </>
      }
    >
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Data</label>
          <input className="input" type="date" value={data} onChange={ev => setData(ev.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Início</label>
          <input className="input" type="time" step={300} value={hora} onChange={ev => setHora(ev.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Duração (min)</label>
          <input className="input" type="number" min={10} step={5} value={duracao} onChange={ev => setDuracao(Number(ev.target.value))} />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: -6, marginBottom: 12 }}>Termina às {horaFim(hora || '00:00', duracao || 0)}.</p>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Modalidade</label>
          <select className="ui-select" value={modalidadeId} onChange={ev => setModalidadeId(ev.target.value)}>
            <option value="">Sem modalidade</option>
            {modalidades.filter(m => m.ativo || m.id === h.modalidade_id).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div className="ui-campo" style={{ flex: '0 1 110px' }}>
          <label className="label">Vagas</label>
          <input className="input" type="number" min={1} value={capacidade} onChange={ev => setCapacidade(Number(ev.target.value))} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Professor da turma</label>
        <select className="ui-select" value={professorId} onChange={ev => setProfessorId(ev.target.value)}>
          <option value="">Sem professor</option>
          {professores.filter(p => p.ativo || p.id === h.professor_id).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      {capacidade < e.ocupados && (
        <div className="ui-alerta ui-alerta-aviso">A aula já tem {e.ocupados} aluno(s); ficará acima da capacidade.</div>
      )}
    </Modal>
  )
}
