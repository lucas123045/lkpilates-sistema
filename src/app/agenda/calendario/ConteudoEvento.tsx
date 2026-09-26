'use client'

import { AlertCircle, Ban, RotateCcw, Sparkles, Ticket } from 'lucide-react'
import { formatarHora } from '@/lib/agenda/datas'
import { nomeCurto, type EventoAula } from '@/lib/agenda/eventos'
import { iniciais } from '@/lib/agenda/regras'
import type { Agendamento, Modalidade, Professor } from '@/lib/agenda/tipos'

export function IconeTipo({ tipo, tamanho = 11 }: { tipo: Agendamento['tipo']; tamanho?: number }) {
  if (tipo === 'reposicao') return <RotateCcw size={tamanho} aria-label="Reposição" />
  if (tipo === 'experimental') return <Sparkles size={tamanho} aria-label="Experimental" />
  if (tipo === 'avulsa') return <Ticket size={tamanho} aria-label="Avulsa" />
  return null
}

function nomeAluno(a: Agendamento) {
  return nomeCurto(a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome')
}

type Props = {
  evento: EventoAula
  tipoVisao: string
  professor: Professor | undefined
  modalidade: Modalidade | undefined
}

export default function ConteudoEvento({ evento: e, tipoVisao, professor, modalidade }: Props) {
  const titulo = modalidade?.nome ?? (e.unica ? 'Aula' : 'Turma')
  const ocupacao = `${e.ocupados}/${e.capacidade}`

  if (tipoVisao === 'programacao' || tipoVisao.startsWith('list')) {
    return (
      <span className={`ev-lista${e.cancelada ? ' ev-riscado' : ''}`}>
        <b>{titulo}</b> · {e.cancelada ? `Cancelada${e.bloqueio ? `: ${e.bloqueio.motivo}` : ''}` : ocupacao}
        {professor && <span className="ev-lista-prof"> · {professor.nome}</span>}
        {e.alunos.length > 0 && (
          <span className="ev-lista-alunos">
            {' — '}
            {e.alunos.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <IconeTipo tipo={a.tipo} /> {nomeAluno(a)}
              </span>
            ))}
          </span>
        )}
      </span>
    )
  }

  if (tipoVisao === 'dayGridMonth') {
    return (
      <span className={`ev-mes${e.cancelada ? ' ev-riscado' : ''}`}>
        <span className="ev-mes-ponto" style={{ background: professor?.cor ?? '#98a2b3' }} />
        <span className="ev-mes-hora">{formatarHora(e.horario.hora_inicio)}</span>
        <span className="ev-mes-titulo">
          {titulo} {e.cancelada ? '' : ocupacao}
        </span>
        {e.lotado && !e.cancelada && <AlertCircle size={11} className="ev-lotado-icone" />}
      </span>
    )
  }

  // Grade de horarios (dia / semana / 3 dias)
  return (
    <div className="ev-grade">
      <div className="ev-linha1">
        {e.cancelada && <Ban size={11} />}
        <span className="ev-titulo">{titulo}</span>
        {!e.cancelada && (
          <span className={`ev-ocupacao${e.lotado ? ' lotado' : ''}`} title={e.lotado ? 'Lotado' : undefined}>
            {e.lotado && e.blocos === 1 ? `Lotado ${ocupacao}` : ocupacao}
          </span>
        )}
      </div>
      <div className="ev-hora">
        {formatarHora(e.horario.hora_inicio)} – {e.fim.slice(11)}
        {professor && <> · {e.blocos > 1 ? iniciais(professor.nome) : professor.nome}</>}
      </div>
      {e.cancelada && e.bloqueio && <div className="ev-alunos">{e.bloqueio.motivo}</div>}
      {!e.cancelada && e.alunos.length > 0 && (
        <div className="ev-alunos">
          {e.alunos.map(a => (
            <span key={a.id} className="ev-aluno">
              <IconeTipo tipo={a.tipo} />
              {nomeAluno(a)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
