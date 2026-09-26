'use client'

import { Ban, Check, CheckCheck, Hourglass, Pencil, RotateCcw, Trash2, UserPlus, UserRoundCog, X } from 'lucide-react'
import Popover, { type Ancora } from '@/app/components/ui/Popover'
import { formatarDataLonga, formatarHora } from '@/lib/agenda/datas'
import type { EventoAula } from '@/lib/agenda/eventos'
import { ocupaVaga, ROTULO_STATUS, ROTULO_TIPO } from '@/lib/agenda/regras'
import type { Agendamento, Modalidade, Professor, StatusAgendamento } from '@/lib/agenda/tipos'
import { AvatarProfessor, EtiquetaProfessor } from '../componentes/Professores'
import { IconeTipo } from './ConteudoEvento'

const CHIP_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'ui-chip-azul',
  presente: 'ui-chip-verde',
  falta: 'ui-chip-vermelho',
  falta_justificada: 'ui-chip-amarelo',
  desmarcado: 'ui-chip-cinza',
  cancelado_estudio: 'ui-chip-cinza'
}

type Props = {
  evento: EventoAula
  ancora: Ancora
  professores: Map<string, Professor>
  modalidade: Modalidade | undefined
  espera: number
  salvando: number | null
  onFechar: () => void
  onAbrirAluno: (a: Agendamento) => void
  onMarcar: (a: Agendamento, status: 'presente' | 'falta') => void
  onAdicionar: () => void
  onTodosPresentes: () => void
  onTrocarProfessor: () => void
  onListaEspera: () => void
  onEditar: () => void
  onCancelar: () => void
  onReativar: () => void
  onExcluir: () => void
}

export default function PopoverEvento(p: Props) {
  const e = p.evento
  const profBloco = e.professorId ? p.professores.get(e.professorId) : undefined
  const profTurma = e.horario.professor_id ? p.professores.get(e.horario.professor_id) : undefined
  const ocupantes = e.todos.filter(a => ocupaVaga(a.status))
  const outros = e.todos.filter(a => !ocupaVaga(a.status))
  const pendentes = ocupantes.filter(a => a.status === 'agendado').length
  const vagas = Math.max(e.capacidade - e.ocupados, 0)
  const podeMexer = !e.passada && !e.cancelada
  const bloqueioDaTurma = e.bloqueio?.horario_id ? e.bloqueio : null

  const cabecalho = (
    <div className="pe-acoes-topo">
      {podeMexer && (
        <button className="ui-icon-btn" onClick={p.onEditar} title="Editar aula" aria-label="Editar aula">
          <Pencil size={17} />
        </button>
      )}
      {e.unica && !ocupantes.length && !e.passada && (
        <button className="ui-icon-btn" onClick={p.onExcluir} title="Excluir aula" aria-label="Excluir aula">
          <Trash2 size={17} />
        </button>
      )}
    </div>
  )

  // agrupa por professor efetivo (mesma divisao dos blocos no calendario)
  const grupos = new Map<string, Agendamento[]>()
  for (const a of ocupantes) {
    const k = a.professor_id ?? ''
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(a)
  }

  return (
    <Popover ancora={p.ancora} onFechar={p.onFechar} cabecalho={cabecalho} corTopo={profBloco?.cor ?? profTurma?.cor ?? '#98a2b3'} largura={400}>
      <h2 className={`pe-titulo${e.cancelada ? ' ev-riscado' : ''}`}>
        {p.modalidade?.nome ?? (e.unica ? 'Aula' : 'Turma')}
        {e.unica && <span className="ui-chip" style={{ marginLeft: 8, verticalAlign: 'middle' }}>aula única</span>}
      </h2>
      <p className="pe-sub">
        {formatarDataLonga(e.data)} · {formatarHora(e.horario.hora_inicio)} – {e.fim.slice(11)}
      </p>

      <div className="pe-linha">
        <span className={`ag-ocupacao ag-nivel-${e.cancelada ? 'bloqueado' : e.lotado ? 'lotado' : vagas === 1 && e.capacidade > 1 ? 'quase' : 'livre'}`}>
          {e.cancelada ? 'Cancelada' : `${e.ocupados}/${e.capacidade} · ${vagas} vaga${vagas === 1 ? '' : 's'}`}
        </span>
        {p.espera > 0 && (
          <button className="ui-chip ui-chip-laranja" onClick={p.onListaEspera} style={{ cursor: 'pointer' }}>
            <Hourglass size={12} /> {p.espera} na espera
          </button>
        )}
      </div>

      <div className="pe-linha">
        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Professor da turma:</span>
        <EtiquetaProfessor professor={profTurma} />
      </div>

      {e.bloqueio && (
        <div className="ui-alerta ui-alerta-info">
          <Ban size={16} /> {e.bloqueio.motivo}
        </div>
      )}

      {ocupantes.length === 0 && !e.cancelada && <p className="pe-vazio">Nenhum aluno agendado.</p>}

      {[...grupos.entries()].map(([profId, lista]) => {
        const prof = profId ? p.professores.get(profId) : undefined
        return (
          <div key={profId || 'sem'} className="pe-grupo">
            {grupos.size > 1 && (
              <div className="pe-grupo-titulo">
                <AvatarProfessor professor={prof} pequeno /> {prof?.nome ?? 'Sem professor'}
              </div>
            )}
            {lista.map(a => (
              <LinhaAluno key={a.id} a={a} p={p} professores={p.professores} mostrarProf={grupos.size === 1 && a.professor_id !== e.horario.professor_id} />
            ))}
          </div>
        )
      })}

      {outros.length > 0 && (
        <details className="pe-outros">
          <summary>{outros.length} desmarcado(s) / falta justificada</summary>
          {outros.map(a => (
            <LinhaAluno key={a.id} a={a} p={p} professores={p.professores} mostrarProf={false} />
          ))}
        </details>
      )}

      <div className="pe-botoes">
        {podeMexer && (
          <button className="btn ui-btn-azul btn-sm" onClick={p.onAdicionar}>
            <UserPlus size={14} /> Adicionar aluno
          </button>
        )}
        {pendentes > 0 && !e.cancelada && (
          <button className="btn btn-sec btn-sm" onClick={p.onTodosPresentes}>
            <CheckCheck size={14} /> Todos presentes
          </button>
        )}
        {!e.cancelada && (
          <button className="btn btn-sec btn-sm" onClick={p.onTrocarProfessor}>
            <UserRoundCog size={14} /> Professor
          </button>
        )}
        {!e.cancelada && (
          <button className="btn btn-sec btn-sm" onClick={p.onListaEspera}>
            <Hourglass size={14} /> Espera
          </button>
        )}
        {podeMexer && (
          <button className="btn btn-sec btn-sm" onClick={p.onCancelar}>
            <Ban size={14} /> Cancelar aula
          </button>
        )}
        {bloqueioDaTurma && !e.passada && (
          <button className="btn btn-sec btn-sm" onClick={p.onReativar}>
            <RotateCcw size={14} /> Reativar aula
          </button>
        )}
      </div>
    </Popover>
  )
}

function LinhaAluno({ a, p, professores, mostrarProf }: { a: Agendamento; p: Props; professores: Map<string, Professor>; mostrarProf: boolean }) {
  const nome = a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome'
  const marcavel = a.status === 'agendado' || a.status === 'presente' || a.status === 'falta'
  const ocupado = p.salvando === a.id
  const prof = a.professor_id ? professores.get(a.professor_id) : undefined
  return (
    <div className="pe-aluno">
      <button className="pe-aluno-nome" onClick={() => p.onAbrirAluno(a)} title="Mais ações">
        <span className={a.status === 'desmarcado' || a.status === 'cancelado_estudio' ? 'ev-riscado' : ''}>{nome}</span>
        <span className="pe-aluno-meta">
          <span className={`ui-chip ${CHIP_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span>
          {a.tipo !== 'fixo' && (
            <span className="ui-chip ui-chip-laranja">
              <IconeTipo tipo={a.tipo} /> {ROTULO_TIPO[a.tipo]}
            </span>
          )}
          {a.encaixe && ocupaVaga(a.status) && <span className="ui-chip ui-chip-laranja">encaixe</span>}
          {mostrarProf && prof && <span className="ui-chip">{prof.nome}</span>}
          {a.professor_origem === 'dia' && <span className="ui-chip ui-chip-laranja">troca do dia</span>}
        </span>
        {a.observacao && <span className="pe-obs">{a.observacao}</span>}
      </button>
      {marcavel && !p.evento.cancelada && (
        <span className="ag-rapidos">
          <button
            className={`ag-rapido ok${a.status === 'presente' ? ' ativo' : ''}`}
            title="Presente"
            aria-label={`Marcar ${nome} presente`}
            disabled={ocupado || a.status === 'presente'}
            onClick={() => p.onMarcar(a, 'presente')}
          >
            <Check size={16} />
          </button>
          <button
            className={`ag-rapido nok${a.status === 'falta' ? ' ativo' : ''}`}
            title="Falta"
            aria-label={`Marcar falta para ${nome}`}
            disabled={ocupado || a.status === 'falta'}
            onClick={() => p.onMarcar(a, 'falta')}
          >
            <X size={16} />
          </button>
        </span>
      )}
    </div>
  )
}
