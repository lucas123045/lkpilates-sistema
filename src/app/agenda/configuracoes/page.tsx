'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, Pencil, Plus, Trash2, Users } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { DIAS_SEMANA, formatarData, formatarHora, hojeEstudio, horaFim } from '@/lib/agenda/datas'
import { iniciais, PALETA_PROFESSORES } from '@/lib/agenda/regras'
import {
  fixosPorHorario,
  listarGrade,
  removerBloqueio,
  salvarConfiguracao,
  salvarHorario,
  salvarModalidade,
  salvarProfessor
} from '@/lib/agenda/servico'
import type { Bloqueio, ConfiguracaoEstudio, Horario, Modalidade, Professor } from '@/lib/agenda/tipos'
import { ModalBloqueio } from '../componentes/ModaisTurma'
import '@/app/components/ui/ui.css'
import '../agenda.css'

type Aba = 'grade' | 'professores' | 'modalidades' | 'bloqueios' | 'estudio'

type Grade = {
  horarios: Horario[]
  professores: Professor[]
  modalidades: Modalidade[]
  configuracao: ConfiguracaoEstudio
  bloqueios: Bloqueio[]
}

export default function ConfiguracoesAgenda() {
  const { toast } = useFeedback()
  const [aba, setAba] = useState<Aba>('grade')
  const [grade, setGrade] = useState<Grade | null>(null)
  const [fixos, setFixos] = useState<Record<string, number>>({})
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [g, f] = await Promise.all([listarGrade(), fixosPorHorario(hojeEstudio())])
      setGrade(g)
      setFixos(f)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

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

  return (
    <div>
      <Link href="/agenda" className="btn btn-sec" style={{ textDecoration: 'none', marginBottom: 14 }}>
        <ArrowLeft size={15} /> Voltar para a agenda
      </Link>
      <h1 style={{ marginBottom: 14 }}>Grade e configurações</h1>

      <div className="ui-segmentos" style={{ marginBottom: 18 }}>
        {([
          ['grade', 'Grade de horários'],
          ['professores', 'Professores'],
          ['modalidades', 'Modalidades'],
          ['bloqueios', 'Feriados e bloqueios'],
          ['estudio', 'Regras do estúdio']
        ] as [Aba, string][]).map(([id, rotulo]) => (
          <button key={id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {erro && <div className="ui-alerta ui-alerta-erro">{erro}</div>}
      {!grade && !erro && <div className="ui-skeleton" style={{ height: 240 }} />}

      {grade && aba === 'grade' && <AbaGrade grade={grade} fixos={fixos} executar={executar} />}
      {grade && aba === 'professores' && <AbaProfessores professores={grade.professores} executar={executar} />}
      {grade && aba === 'modalidades' && <AbaModalidades modalidades={grade.modalidades} executar={executar} />}
      {grade && aba === 'bloqueios' && <AbaBloqueios grade={grade} executar={executar} recarregar={carregar} />}
      {grade && aba === 'estudio' && <AbaEstudio configuracao={grade.configuracao} executar={executar} />}
    </div>
  )
}

type Executar = (acao: () => Promise<void>, msg: string) => Promise<boolean>

/* =========================== GRADE =========================== */

function AbaGrade({ grade, fixos, executar }: { grade: Grade; fixos: Record<string, number>; executar: Executar }) {
  const [editando, setEditando] = useState<Partial<Horario> | null>(null)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const profs = useMemo(() => new Map(grade.professores.map(p => [p.id, p])), [grade.professores])
  const mods = useMemo(() => new Map(grade.modalidades.map(m => [m.id, m])), [grade.modalidades])
  const lista = grade.horarios.filter(h => mostrarInativos || h.ativo)

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button
          className="btn ui-btn-azul"
          onClick={() =>
            setEditando({
              dia_semana: 1,
              hora_inicio: '07:00',
              duracao_min: grade.configuracao.duracao_padrao_min,
              capacidade: 3,
              ativo: true,
              modalidade_id: grade.modalidades.find(m => m.nome === 'Aparelhos')?.id ?? null
            })
          }
        >
          <Plus size={15} /> Nova turma
        </button>
        <label className="ui-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
          Mostrar turmas desativadas
        </label>
        <Link href="/agenda/horarios-fixos" className="btn btn-sec" style={{ textDecoration: 'none', marginLeft: 'auto' }}>
          <Users size={15} /> Ligar alunos às turmas
        </Link>
      </div>

      {!lista.length && <div className="ui-estado">Nenhuma turma cadastrada. Clique em “Nova turma”.</div>}

      {DIAS_SEMANA.map((nomeDia, i) => {
        const doDia = lista.filter(h => h.dia_semana === i + 1)
        if (!doDia.length) return null
        return (
          <div key={nomeDia} className="card" style={{ padding: 14 }}>
            <h3 style={{ marginBottom: 8 }}>{nomeDia}</h3>
            {doDia.map(h => {
              const p = h.professor_id ? profs.get(h.professor_id) : null
              const n = fixos[h.id] ?? 0
              return (
                <div
                  key={h.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--line)', opacity: h.ativo ? 1 : 0.5 }}
                >
                  <strong style={{ minWidth: 104 }}>
                    {formatarHora(h.hora_inicio)}–{horaFim(h.hora_inicio, h.duracao_min)}
                  </strong>
                  <span className="ui-chip">{h.modalidade_id ? mods.get(h.modalidade_id)?.nome : 'Sem modalidade'}</span>
                  <span className="ui-chip">
                    <span className="ag-avatar pequeno" style={{ background: p?.cor ?? '#98a2b3' }}>{p ? iniciais(p.nome) : '—'}</span>
                    {p?.nome ?? 'Sem professor'}
                  </span>
                  <span className={`ui-chip ${n > h.capacidade ? 'ui-chip-vermelho' : n === h.capacidade ? 'ui-chip-amarelo' : 'ui-chip-verde'}`} title="Alunos com horário fixo / capacidade">
                    <Users size={12} /> {n}/{h.capacidade} fixos
                  </span>
                  {h.vigente_ate && <span className="ui-chip ui-chip-cinza">até {formatarData(h.vigente_ate)}</span>}
                  {!h.ativo && <span className="ui-chip ui-chip-cinza">desativada</span>}
                  <button className="btn btn-sec btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setEditando(h)}>
                    <Pencil size={13} /> Editar
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {editando && (
        <ModalHorario
          inicial={editando}
          professores={grade.professores}
          modalidades={grade.modalidades}
          onFechar={() => setEditando(null)}
          onSalvar={async (h, dias) => {
            const ok = await executar(async () => {
              for (const d of dias) await salvarHorario({ ...h, dia_semana: d } as Horario)
            }, dias.length > 1 ? `${dias.length} turmas criadas.` : 'Turma salva.')
            if (ok) setEditando(null)
          }}
        />
      )}
    </>
  )
}

function ModalHorario({
  inicial,
  professores,
  modalidades,
  onFechar,
  onSalvar
}: {
  inicial: Partial<Horario>
  professores: Professor[]
  modalidades: Modalidade[]
  onFechar: () => void
  onSalvar: (h: Partial<Horario>, dias: number[]) => void
}) {
  const [h, setH] = useState<Partial<Horario>>({ ...inicial, hora_inicio: formatarHora(inicial.hora_inicio) })
  const [dias, setDias] = useState<number[]>([inicial.dia_semana ?? 1])
  const novo = !inicial.id
  const set = (campo: keyof Horario, valor: unknown) => setH(x => ({ ...x, [campo]: valor }))

  const valido = !!h.hora_inicio && (h.capacidade ?? 0) > 0 && (h.duracao_min ?? 0) > 0 && dias.length > 0

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={novo ? 'Nova turma' : 'Editar turma'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button
            className="btn ui-btn-azul"
            disabled={!valido}
            onClick={() =>
              onSalvar(
                {
                  id: h.id,
                  hora_inicio: h.hora_inicio,
                  duracao_min: Number(h.duracao_min),
                  capacidade: Number(h.capacidade),
                  professor_id: h.professor_id || null,
                  modalidade_id: h.modalidade_id || null,
                  ativo: h.ativo ?? true,
                  vigente_ate: h.vigente_ate || null,
                  observacao: h.observacao || null,
                  ...(h.vigente_desde ? { vigente_desde: h.vigente_desde } : {})
                },
                novo ? dias : [h.dia_semana ?? 1]
              )
            }
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">{novo ? 'Dias da semana (pode marcar vários)' : 'Dia da semana'}</label>
        {novo ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DIAS_SEMANA.map((d, i) => (
              <label key={d} className="ui-chip" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={dias.includes(i + 1)}
                  onChange={e => setDias(x => (e.target.checked ? [...x, i + 1] : x.filter(y => y !== i + 1)))}
                />
                {d}
              </label>
            ))}
          </div>
        ) : (
          <select className="ui-select" value={h.dia_semana} onChange={e => set('dia_semana', Number(e.target.value))}>
            {DIAS_SEMANA.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        )}
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Início</label>
          <input className="input" type="time" value={h.hora_inicio ?? ''} onChange={e => set('hora_inicio', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Duração (min)</label>
          <input className="input" type="number" min={10} value={h.duracao_min ?? ''} onChange={e => set('duracao_min', e.target.value)} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Modalidade</label>
          <select
            className="ui-select"
            value={h.modalidade_id ?? ''}
            onChange={e => {
              const m = modalidades.find(x => x.id === e.target.value)
              setH(x => ({ ...x, modalidade_id: e.target.value || null, ...(m && novo ? { capacidade: m.capacidade_padrao } : {}) }))
            }}
          >
            <option value="">Sem modalidade</option>
            {modalidades.filter(m => m.ativo || m.id === h.modalidade_id).map(m => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>
        <div className="ui-campo">
          <label className="label">Capacidade (aparelhos)</label>
          <input className="input" type="number" min={1} value={h.capacidade ?? ''} onChange={e => set('capacidade', e.target.value)} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Professor padrão</label>
        <select className="ui-select" value={h.professor_id ?? ''} onChange={e => set('professor_id', e.target.value || null)}>
          <option value="">Sem professor</option>
          {professores.filter(p => p.ativo || p.id === h.professor_id).map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>
      <div className="ui-linha">
        {!novo && (
          <div className="ui-campo">
            <label className="label">Vigente desde</label>
            <input className="input" type="date" value={h.vigente_desde ?? ''} onChange={e => set('vigente_desde', e.target.value)} />
          </div>
        )}
        <div className="ui-campo">
          <label className="label">Vigente até (opcional)</label>
          <input className="input" type="date" value={h.vigente_ate ?? ''} onChange={e => set('vigente_ate', e.target.value)} />
        </div>
      </div>
      {!novo && (
        <label className="ui-check">
          <input type="checkbox" checked={h.ativo ?? true} onChange={e => set('ativo', e.target.checked)} />
          Turma ativa (desativar tira as próximas aulas da agenda; o histórico é mantido)
        </label>
      )}
      {!novo && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
          Mudanças de horário, duração e professor valem para as próximas aulas ainda não marcadas. Aulas passadas não mudam.
        </p>
      )}
    </Modal>
  )
}

/* =========================== PROFESSORES =========================== */

function AbaProfessores({ professores, executar }: { professores: Professor[]; executar: Executar }) {
  const [editando, setEditando] = useState<Partial<Professor> | null>(null)
  const proximaCor = PALETA_PROFESSORES.find(c => !professores.some(p => p.cor.toLowerCase() === c)) ?? PALETA_PROFESSORES[0]

  return (
    <>
      <button className="btn ui-btn-azul" style={{ marginBottom: 14 }} onClick={() => setEditando({ nome: '', cor: proximaCor, ativo: true })}>
        <Plus size={15} /> Novo professor
      </button>
      {!professores.length && <div className="ui-estado">Nenhum professor cadastrado.</div>}
      <div className="lista">
        {professores.map(p => (
          <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 0, padding: 14, opacity: p.ativo ? 1 : 0.55 }}>
            <span className="ag-avatar" style={{ background: p.cor, minWidth: 34, height: 34, fontSize: 12 }}>{iniciais(p.nome)}</span>
            <div style={{ flex: 1 }}>
              <strong>{p.nome}</strong>
              <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
                {p.telefone || 'Sem telefone'} {!p.ativo && '· inativo'}
              </div>
            </div>
            <button className="btn btn-sec btn-sm" onClick={() => setEditando(p)}>
              <Pencil size={13} /> Editar
            </button>
          </div>
        ))}
      </div>
      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? 'Editar professor' : 'Novo professor'}
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setEditando(null)}>Cancelar</button>
              <button
                className="btn ui-btn-azul"
                disabled={!editando.nome?.trim()}
                onClick={async () => {
                  const ok = await executar(
                    () => salvarProfessor({ id: editando.id, nome: editando.nome!.trim(), telefone: editando.telefone || null, cor: editando.cor!, ativo: editando.ativo ?? true }),
                    'Professor salvo.'
                  )
                  if (ok) setEditando(null)
                }}
              >
                Salvar
              </button>
            </>
          }
        >
          <div className="ui-campo">
            <label className="label">Nome</label>
            <input className="input" value={editando.nome ?? ''} onChange={e => setEditando(x => ({ ...x, nome: e.target.value }))} autoFocus />
          </div>
          <div className="ui-campo">
            <label className="label">Telefone</label>
            <input className="input" value={editando.telefone ?? ''} inputMode="tel" onChange={e => setEditando(x => ({ ...x, telefone: e.target.value }))} />
          </div>
          <div className="ui-campo">
            <label className="label">Cor na agenda</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {PALETA_PROFESSORES.map(c => {
                const usada = professores.find(p => p.id !== editando.id && p.cor.toLowerCase() === c)
                return (
                  <button
                    key={c}
                    type="button"
                    title={usada ? `Usada por ${usada.nome}` : c}
                    onClick={() => setEditando(x => ({ ...x, cor: c }))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: c,
                      border: editando.cor === c ? '3px solid var(--ink-900)' : '2px solid #fff',
                      boxShadow: '0 0 0 1px var(--line-strong)',
                      cursor: 'pointer',
                      opacity: usada ? 0.45 : 1
                    }}
                    aria-label={`Cor ${c}`}
                  />
                )
              })}
              <input type="color" value={editando.cor ?? '#1f4fd8'} onChange={e => setEditando(x => ({ ...x, cor: e.target.value }))} title="Outra cor" />
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 6 }}>
              A agenda sempre mostra também as iniciais ({iniciais(editando.nome)}), então a cor nunca é a única identificação.
            </p>
          </div>
          {editando.id && (
            <label className="ui-check">
              <input type="checkbox" checked={editando.ativo ?? true} onChange={e => setEditando(x => ({ ...x, ativo: e.target.checked }))} />
              Professor ativo
            </label>
          )}
        </Modal>
      )}
    </>
  )
}

/* =========================== MODALIDADES =========================== */

function AbaModalidades({ modalidades, executar }: { modalidades: Modalidade[]; executar: Executar }) {
  const [editando, setEditando] = useState<Partial<Modalidade> | null>(null)
  return (
    <>
      <button className="btn ui-btn-azul" style={{ marginBottom: 14 }} onClick={() => setEditando({ nome: '', capacidade_padrao: 3, ativo: true })}>
        <Plus size={15} /> Nova modalidade
      </button>
      <div className="card" style={{ padding: 14 }}>
        {modalidades.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: m.ativo ? 1 : 0.5 }}>
            <strong style={{ flex: 1 }}>{m.nome}</strong>
            <span className="ui-chip">capacidade padrão {m.capacidade_padrao}</span>
            {!m.ativo && <span className="ui-chip ui-chip-cinza">inativa</span>}
            <button className="btn btn-sec btn-sm" onClick={() => setEditando(m)}>
              <Pencil size={13} /> Editar
            </button>
          </div>
        ))}
      </div>
      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? 'Editar modalidade' : 'Nova modalidade'}
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setEditando(null)}>Cancelar</button>
              <button
                className="btn ui-btn-azul"
                disabled={!editando.nome?.trim() || !(Number(editando.capacidade_padrao) > 0)}
                onClick={async () => {
                  const ok = await executar(
                    () => salvarModalidade({ id: editando.id, nome: editando.nome!.trim(), capacidade_padrao: Number(editando.capacidade_padrao), ativo: editando.ativo ?? true }),
                    'Modalidade salva.'
                  )
                  if (ok) setEditando(null)
                }}
              >
                Salvar
              </button>
            </>
          }
        >
          <div className="ui-campo">
            <label className="label">Nome</label>
            <input className="input" value={editando.nome ?? ''} onChange={e => setEditando(x => ({ ...x, nome: e.target.value }))} autoFocus />
          </div>
          <div className="ui-campo">
            <label className="label">Capacidade padrão</label>
            <input className="input" type="number" min={1} value={editando.capacidade_padrao ?? ''} onChange={e => setEditando(x => ({ ...x, capacidade_padrao: Number(e.target.value) }))} />
          </div>
          {editando.id && (
            <label className="ui-check">
              <input type="checkbox" checked={editando.ativo ?? true} onChange={e => setEditando(x => ({ ...x, ativo: e.target.checked }))} />
              Modalidade ativa
            </label>
          )}
        </Modal>
      )}
    </>
  )
}

/* =========================== BLOQUEIOS =========================== */

function AbaBloqueios({ grade, executar, recarregar }: { grade: Grade; executar: Executar; recarregar: () => void }) {
  const { confirmar } = useFeedback()
  const [novo, setNovo] = useState(false)
  const hoje = hojeEstudio()
  const horarios = new Map(grade.horarios.map(h => [h.id, h]))

  return (
    <>
      <button className="btn ui-btn-azul" style={{ marginBottom: 14 }} onClick={() => setNovo(true)}>
        <Ban size={15} /> Novo feriado / recesso
      </button>
      {!grade.bloqueios.length && <div className="ui-estado">Nenhum bloqueio cadastrado.</div>}
      <div className="card" style={{ padding: 14 }}>
        {grade.bloqueios.map(b => {
          const h = b.horario_id ? horarios.get(b.horario_id) : null
          const passado = (b.data_fim ?? b.data) < hoje
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: passado ? 0.55 : 1 }}>
              <strong style={{ minWidth: 190 }}>
                {formatarData(b.data)}
                {b.data_fim && ` a ${formatarData(b.data_fim)}`}
              </strong>
              <span className="ui-chip">{h ? `${DIAS_SEMANA[h.dia_semana - 1]} ${formatarHora(h.hora_inicio)}` : 'Dia inteiro'}</span>
              <span style={{ flex: 1 }}>{b.motivo}</span>
              <button
                className="ui-icon-btn"
                title="Remover bloqueio"
                onClick={async () => {
                  const ok = await confirmar({
                    titulo: 'Remover bloqueio?',
                    mensagem: 'O horário volta a aceitar agendamentos. Aulas que já foram canceladas por este bloqueio NÃO são restauradas (os créditos gerados continuam valendo).',
                    confirmar: 'Remover',
                    perigo: true
                  })
                  if (ok) executar(() => removerBloqueio(b.id), 'Bloqueio removido.')
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>
      <ModalBloqueio aberto={novo} dataInicial={hoje} onFechar={() => setNovo(false)} onAlterado={recarregar} />
    </>
  )
}

/* =========================== ESTUDIO =========================== */

function AbaEstudio({ configuracao, executar }: { configuracao: ConfiguracaoEstudio; executar: Executar }) {
  const [c, setC] = useState<ConfiguracaoEstudio>({
    ...configuracao,
    hora_abertura: formatarHora(configuracao.hora_abertura),
    hora_fechamento: formatarHora(configuracao.hora_fechamento)
  })
  const set = (campo: keyof ConfiguracaoEstudio, v: unknown) => setC(x => ({ ...x, [campo]: v }))

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Abre às</label>
          <input className="input" type="time" value={c.hora_abertura} onChange={e => set('hora_abertura', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Fecha às</label>
          <input className="input" type="time" value={c.hora_fechamento} onChange={e => set('hora_fechamento', e.target.value)} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Dias de funcionamento</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DIAS_SEMANA.map((d, i) => (
            <label key={d} className="ui-chip" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={c.dias_funcionamento.includes(i + 1)}
                onChange={e =>
                  set('dias_funcionamento', e.target.checked ? [...c.dias_funcionamento, i + 1].sort() : c.dias_funcionamento.filter(x => x !== i + 1))
                }
              />
              {d}
            </label>
          ))}
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Duração padrão (min)</label>
          <input className="input" type="number" min={10} value={c.duracao_padrao_min} onChange={e => set('duracao_padrao_min', Number(e.target.value))} />
        </div>
        <div className="ui-campo">
          <label className="label">Antecedência p/ desmarcar (h)</label>
          <input className="input" type="number" min={0} step={0.5} value={c.antecedencia_desmarcacao_horas} onChange={e => set('antecedencia_desmarcacao_horas', Number(e.target.value))} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Validade do crédito (dias)</label>
          <input className="input" type="number" min={1} value={c.validade_credito_dias} onChange={e => set('validade_credito_dias', Number(e.target.value))} />
        </div>
        <div className="ui-campo">
          <label className="label">Limite de reposições/mês</label>
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Sem limite"
            value={c.limite_reposicoes_mes ?? ''}
            onChange={e => set('limite_reposicoes_mes', e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 12 }}>
        Desmarcações com pelo menos {c.antecedencia_desmarcacao_horas}h de antecedência viram falta justificada e geram crédito de reposição válido por {c.validade_credito_dias} dias.
      </p>
      <button
        className="btn ui-btn-azul"
        onClick={() =>
          executar(
            () =>
              salvarConfiguracao({
                hora_abertura: c.hora_abertura,
                hora_fechamento: c.hora_fechamento,
                dias_funcionamento: c.dias_funcionamento,
                duracao_padrao_min: c.duracao_padrao_min,
                antecedencia_desmarcacao_horas: c.antecedencia_desmarcacao_horas,
                validade_credito_dias: c.validade_credito_dias,
                limite_reposicoes_mes: c.limite_reposicoes_mes
              }),
            'Configurações salvas.'
          )
        }
      >
        Salvar
      </button>
    </div>
  )
}
