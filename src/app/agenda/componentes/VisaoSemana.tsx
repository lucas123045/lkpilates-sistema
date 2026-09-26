'use client'

import { DIAS_SEMANA_CURTO, diasDaSemana, formatarDataCurta, formatarHora } from '@/lib/agenda/datas'
import { iniciais, ocupaVaga } from '@/lib/agenda/regras'
import type { DadosPeriodo, Modalidade, Professor } from '@/lib/agenda/tipos'
import { montarDia, nomePessoa, type Filtros, type TurmaNoDia } from '../util'
import { corProfessor } from './Professores'

const FUNDO_NIVEL = {
  livre: '#e8f8ef',
  quase: '#fff4d6',
  lotado: '#fdecea',
  bloqueado: '#eceef3'
}

type Props = {
  dados: DadosPeriodo
  dataBase: string
  hoje: string
  filtros: Filtros
  professores: Map<string, Professor>
  modalidades: Map<string, Modalidade>
  onAbrirTurma: (data: string, horarioId: string) => void
  onAbrirDia: (data: string) => void
}

export default function VisaoSemana({ dados, dataBase, hoje, filtros, professores, modalidades, onAbrirTurma, onAbrirDia }: Props) {
  const dias = diasDaSemana(dataBase)
  const porDia = new Map<string, TurmaNoDia[]>(dias.map(d => [d, montarDia(dados, d, filtros)]))
  const horas = [...new Set([...porDia.values()].flat().map(t => formatarHora(t.horario.hora_inicio)))].sort()

  if (!horas.length) {
    return <div className="ui-estado">Nenhuma turma nesta semana. Cadastre a grade em Configurações.</div>
  }

  return (
    <>
      <div className="ag-semana-scroll">
        <table className="ag-semana">
          <thead>
            <tr>
              <th>Hora</th>
              {dias.map((d, i) => (
                <th key={d} className={d === hoje ? 'hoje' : ''} onClick={() => onAbrirDia(d)} title="Abrir o dia">
                  {DIAS_SEMANA_CURTO[i]} {formatarDataCurta(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map(hora => (
              <tr key={hora}>
                <td>{hora}</td>
                {dias.map(d => {
                  const turmas = (porDia.get(d) ?? []).filter(t => formatarHora(t.horario.hora_inicio) === hora)
                  return (
                    <td key={d}>
                      {turmas.map(t => {
                        const ocupantes = t.visiveis.filter(a => ocupaVaga(a.status))
                        const mod = t.horario.modalidade_id ? modalidades.get(t.horario.modalidade_id) : null
                        const vazias = t.bloqueio ? 0 : Math.max(t.horario.capacidade - t.ocupacao.ocupados, 0)
                        return (
                          <button
                            key={t.horario.id}
                            className="ag-celula"
                            style={{ background: FUNDO_NIVEL[t.ocupacao.nivel] }}
                            onClick={() => onAbrirTurma(d, t.horario.id)}
                            title={
                              t.bloqueio
                                ? `Bloqueado: ${t.bloqueio}`
                                : ocupantes.map(a => `${nomePessoa(a)} (${professores.get(a.professor_id ?? '')?.nome ?? 'sem professor'})`).join('\n') || 'Livre'
                            }
                          >
                            <div className="ag-celula-topo">
                              <span className="ag-celula-mod">{mod?.nome ?? 'Turma'}</span>
                              <span>{t.bloqueio ? '—' : `${t.ocupacao.ocupados}/${t.ocupacao.capacidade}`}</span>
                            </div>
                            {!t.bloqueio && (
                              <div className="ag-bolinhas">
                                {ocupantes.map(a => {
                                  const p = a.professor_id ? professores.get(a.professor_id) : null
                                  return (
                                    <span key={a.id} className="ag-bolinha" style={{ background: corProfessor(p) }}>
                                      {p ? iniciais(p.nome) : '—'}
                                    </span>
                                  )
                                })}
                                {Array.from({ length: vazias }, (_, i) => (
                                  <span key={`v${i}`} className="ag-bolinha vazia" />
                                ))}
                              </div>
                            )}
                            {t.espera > 0 && <div style={{ marginTop: 4, color: '#b4480b', fontWeight: 600 }}>{t.espera} na espera</div>}
                          </button>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ag-legenda-niveis">
        <span><i style={{ background: FUNDO_NIVEL.livre }} /> Com vagas</span>
        <span><i style={{ background: FUNDO_NIVEL.quase }} /> Última vaga</span>
        <span><i style={{ background: FUNDO_NIVEL.lotado }} /> Lotado</span>
        <span><i style={{ background: FUNDO_NIVEL.bloqueado }} /> Bloqueado</span>
        <span><span className="ag-bolinha vazia" /> Vaga livre · bolinhas = alunos, na cor do professor</span>
      </div>
    </>
  )
}
