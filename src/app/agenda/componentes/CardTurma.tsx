'use client'

import { Ban, Check, CheckCheck, Clock, Hourglass, MoreHorizontal, StickyNote, UserPlus, UserRoundCog, X } from 'lucide-react'
import { formatarHora, horaFim } from '@/lib/agenda/datas'
import { ocupaVaga, ROTULO_STATUS, ROTULO_TIPO } from '@/lib/agenda/regras'
import type { Agendamento, Modalidade, Professor, StatusAgendamento } from '@/lib/agenda/tipos'
import { nomePessoa, type TurmaNoDia } from '../util'
import { AvatarProfessor, corProfessor, EtiquetaProfessor, fundoSuave } from './Professores'

const CHIP_STATUS: Record<StatusAgendamento, string> = {
  agendado: 'ui-chip-azul',
  presente: 'ui-chip-verde',
  falta: 'ui-chip-vermelho',
  falta_justificada: 'ui-chip-amarelo',
  desmarcado: 'ui-chip-cinza',
  cancelado_estudio: 'ui-chip-cinza'
}

const CHIP_TIPO = {
  reposicao: 'ui-chip-laranja',
  experimental: 'ui-chip-roxo',
  avulsa: 'ui-chip-azul'
} as const

type Props = {
  turma: TurmaNoDia
  professores: Map<string, Professor>
  modalidades: Map<string, Modalidade>
  salvando: number | null
  destaque?: boolean
  onAbrir: (a: Agendamento) => void
  onMarcar: (a: Agendamento, status: 'presente' | 'falta') => void
  onAdicionar: () => void
  onTodosPresentes: () => void
  onTrocarProfessor: () => void
  onCancelar: () => void
  onListaEspera: () => void
}

export default function CardTurma({
  turma,
  professores,
  modalidades,
  salvando,
  destaque,
  onAbrir,
  onMarcar,
  onAdicionar,
  onTodosPresentes,
  onTrocarProfessor,
  onCancelar,
  onListaEspera
}: Props) {
  const { horario, ocupacao, bloqueio, visiveis, agendamentos, espera } = turma
  const modalidade = horario.modalidade_id ? modalidades.get(horario.modalidade_id) : null
  const profPadrao = horario.professor_id ? professores.get(horario.professor_id) : null
  const pendentes = agendamentos.filter(a => a.status === 'agendado').length
  const ocultos = agendamentos.length - visiveis.length

  return (
    <section id={`turma-${horario.id}`} className={`ag-turma${bloqueio ? ' bloqueada' : ''}${destaque ? ' destaque' : ''}`}>
      <div className="ag-turma-topo">
        <div>
          <div className="ag-hora">
            {formatarHora(horario.hora_inicio)}
            <small>até {horaFim(horario.hora_inicio, horario.duracao_min)}</small>
          </div>
          <div className="ag-turma-info">
            {modalidade && <span className="ui-chip">{modalidade.nome}</span>}
            <span className="ui-chip" title="Professor padrão da turma">
              <EtiquetaProfessor professor={profPadrao} />
            </span>
            {!horario.ativo && <span className="ui-chip ui-chip-cinza">Turma inativa</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className={`ag-ocupacao ag-nivel-${ocupacao.nivel}`} title={`${ocupacao.vagas} vaga(s) livre(s)`}>
            {bloqueio ? 'Bloqueado' : `${ocupacao.ocupados}/${ocupacao.capacidade}`}
          </span>
          {espera > 0 && (
            <button
              className={`ui-chip ${ocupacao.vagas > 0 && !bloqueio ? 'ui-chip-laranja' : ''}`}
              onClick={onListaEspera}
              title={ocupacao.vagas > 0 ? 'Há vaga livre e gente esperando!' : 'Lista de espera'}
              style={{ cursor: 'pointer' }}
            >
              <Hourglass size={12} /> {espera} na espera
            </button>
          )}
        </div>
      </div>

      {bloqueio && (
        <div className="ui-alerta ui-alerta-info" style={{ margin: 10 }}>
          <Ban size={16} /> {bloqueio}
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="ag-turma-vazia">{agendamentos.length ? 'Nenhum aluno deste professor.' : 'Nenhum aluno agendado.'}</div>
      ) : (
        <ul className="ag-alunos">
          {visiveis.map(a => {
            const prof = a.professor_id ? professores.get(a.professor_id) : null
            const cor = corProfessor(prof)
            const ativo = ocupaVaga(a.status)
            const ocupado = salvando === a.id
            return (
              <li
                key={a.id}
                className={`ag-aluno${ativo ? '' : ' apagado'}`}
                style={{ ['--cor-prof' as string]: cor, ['--fundo-prof' as string]: fundoSuave(cor) }}
              >
                <AvatarProfessor professor={prof} origem={a.professor_origem} />
                <div className="ag-aluno-nome">
                  <button onClick={() => onAbrir(a)}>{nomePessoa(a)}</button>
                  <div className="ag-aluno-meta">
                    <span className={`ui-chip ${CHIP_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span>
                    {a.tipo !== 'fixo' && <span className={`ui-chip ${CHIP_TIPO[a.tipo]}`}>{ROTULO_TIPO[a.tipo]}</span>}
                    {a.encaixe && ativo && <span className="ui-chip ui-chip-laranja">Encaixe</span>}
                    {a.aluno && !a.aluno.ativo && <span className="ui-chip ui-chip-vermelho">Inativo</span>}
                    <span>{prof ? prof.nome : 'Sem professor'}</span>
                    {a.professor_origem === 'dia' && <span className="ui-chip ui-chip-laranja">troca do dia</span>}
                  </div>
                  {a.observacao && (
                    <div className="ag-obs">
                      <StickyNote size={13} /> {a.observacao}
                    </div>
                  )}
                </div>
                <div className="ag-rapidos">
                  {(a.status === 'agendado' || a.status === 'presente' || a.status === 'falta') && (
                    <>
                      <button
                        className={`ag-rapido ok${a.status === 'presente' ? ' ativo' : ''}`}
                        title="Presente"
                        aria-label={`Marcar ${nomePessoa(a)} presente`}
                        disabled={ocupado || a.status === 'presente'}
                        onClick={() => onMarcar(a, 'presente')}
                      >
                        <Check size={17} />
                      </button>
                      <button
                        className={`ag-rapido nok${a.status === 'falta' ? ' ativo' : ''}`}
                        title="Falta"
                        aria-label={`Marcar falta para ${nomePessoa(a)}`}
                        disabled={ocupado || a.status === 'falta'}
                        onClick={() => onMarcar(a, 'falta')}
                      >
                        <X size={17} />
                      </button>
                    </>
                  )}
                  <button className="ag-rapido" title="Mais ações" aria-label={`Ações de ${nomePessoa(a)}`} onClick={() => onAbrir(a)} disabled={ocupado}>
                    {ocupado ? <Clock size={16} /> : <MoreHorizontal size={17} />}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {ocultos > 0 && <div className="ag-oculto-filtro">+{ocultos} de outros professores (filtro ativo)</div>}

      <div className="ag-turma-acoes">
        <button className="btn btn-sec btn-sm" onClick={onAdicionar} disabled={!!bloqueio}>
          <UserPlus size={14} /> Adicionar
        </button>
        {pendentes > 0 && !bloqueio && (
          <button className="btn btn-sec btn-sm" onClick={onTodosPresentes}>
            <CheckCheck size={14} /> Todos presentes
          </button>
        )}
        <button className="btn btn-sec btn-sm" onClick={onTrocarProfessor}>
          <UserRoundCog size={14} /> Professor
        </button>
        <button className="btn btn-sec btn-sm" onClick={onListaEspera}>
          <Hourglass size={14} /> Espera
        </button>
        {!bloqueio && (
          <button className="btn btn-sec btn-sm" onClick={onCancelar}>
            <Ban size={14} /> Cancelar aula
          </button>
        )}
      </div>
    </section>
  )
}
