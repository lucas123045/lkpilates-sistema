'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CalendarClock, CalendarPlus, CircleDollarSign, ClipboardList, Pencil, Trash2, UserRound } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader, { Kpi } from '@/app/components/shell/PageHeader'
import ModalPagamento from '@/app/components/gestao/ModalPagamento'
import { DIAS_SEMANA_CURTO, formatarData, formatarDataLonga, formatarHora, hojeEstudio } from '@/lib/agenda/datas'
import { ROTULO_STATUS, situacaoCredito } from '@/lib/agenda/regras'
import type { Agendamento, Credito } from '@/lib/agenda/tipos'
import { formatarAniversario, formatarMoeda, inicial, ROTULO_FORMA, situacaoVencimento } from '@/lib/gestao/regras'
import {
  carregarCliente,
  creditosCliente,
  excluirPagamento,
  historicoAulasCliente,
  listarPlanos,
  listarProfissionais,
  listarServicos,
  pagamentosDoCliente,
  presencasDoCliente,
  recorrenciasDoCliente,
  type Recorrencia
} from '@/lib/gestao/servico'
import type { Cliente, Pagamento, Plano, Profissional, Servico } from '@/lib/gestao/tipos'
import ModalCliente from '../ModalCliente'
import '@/app/components/ui/ui.css'

type Aba = 'dados' | 'pagamentos' | 'aulas' | 'horarios' | 'creditos'

const ROTULO_PRESENCA: Record<string, string> = { veio: 'Presente', faltou: 'Falta', reposicao: 'Reposição', reinicio: 'Reinício do plano' }

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>()
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [aulas, setAulas] = useState<Agendamento[]>([])
  const [presencas, setPresencas] = useState<{ id: number; data: string; status: string; tipo: string | null }[]>([])
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [creditos, setCreditos] = useState<Credito[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<Aba>('dados')
  const [editando, setEditando] = useState(false)
  const [pagando, setPagando] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [c, pl, pr, sv, pg, au, pres, rec, cr] = await Promise.all([
        carregarCliente(id),
        listarPlanos(),
        listarProfissionais(),
        listarServicos(),
        pagamentosDoCliente(id),
        historicoAulasCliente(id),
        presencasDoCliente(id),
        recorrenciasDoCliente(id),
        creditosCliente(id)
      ])
      setCliente(c)
      setPlanos(pl)
      setProfissionais(pr)
      setServicos(sv)
      setPagamentos(pg)
      setAulas(au)
      setPresencas(pres)
      setRecorrencias(rec)
      setCreditos(cr)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const profPorId = useMemo(() => new Map(profissionais.map(p => [p.id, p])), [profissionais])

  if (carregando) return <div className="ui-skeleton" style={{ height: 320, marginTop: 24 }} />
  if (erro) return <div className="ui-alerta ui-alerta-erro" style={{ marginTop: 24 }}>{erro}</div>
  if (!cliente) return <div className="ui-estado" style={{ marginTop: 24 }}>Cliente não encontrado.</div>

  const plano = cliente.plano_id ? planos.find(p => p.id === cliente.plano_id) : undefined
  const prof = cliente.professor_id ? profPorId.get(cliente.professor_id) : undefined
  const sit = situacaoVencimento(cliente.vencimento, hoje)
  const creditosAtivos = creditos.filter(c => situacaoCredito(c, hoje) === 'ativo').length
  const presentes = presencas.filter(p => p.status === 'veio' || p.status === 'reposicao').length
  const faltas = presencas.filter(p => p.status === 'faltou').length

  async function apagarPagamento(p: Pagamento) {
    const ok = await confirmar({
      titulo: 'Excluir pagamento?',
      mensagem: `${formatarMoeda(p.valor)} de ${formatarData(p.data)}.${p.meses_vencimento ? ' O vencimento volta para a data anterior (se não mudou depois).' : ''}`,
      confirmar: 'Excluir',
      perigo: true
    })
    if (!ok) return
    try {
      const r = await excluirPagamento(p.id)
      toast(r.vencimento_devolvido ? 'Pagamento excluído e vencimento devolvido.' : 'Pagamento excluído.')
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Clientes', href: '/clientes' }, { rotulo: cliente.nome }]}
        acao={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => setPagando(true)}>
              <CircleDollarSign size={15} /> Novo pagamento
            </button>
            <button className="btn" onClick={() => setEditando(true)}>
              <Pencil size={15} /> Editar
            </button>
          </div>
        }
        cards={
          <>
            <Kpi titulo="Plano" valor={plano?.nome ?? cliente.plano ?? 'Sem plano'} detalhe={plano ? `${formatarMoeda(plano.preco_mensal)} por mês` : undefined} icone={<ClipboardList size={24} />} />
            <Kpi
              titulo="Vencimento"
              valor={cliente.vencimento ? formatarData(cliente.vencimento) : 'Não definido'}
              detalhe={
                cliente.vencimento ? (
                  <><span className={`bolinha ${sit === 'vencido' ? 'vermelha' : 'verde'}`} />{sit === 'vencido' ? 'Pagamento atrasado' : 'Em dia'}</>
                ) : 'Defina ao editar ou ao registrar um pagamento'
              }
              icone={<CircleDollarSign size={24} />}
              tom={sit === 'vencido' ? 'vermelho' : 'verde'}
            />
            <Kpi titulo="Pacote de aulas" valor={`${cliente.aulas_restantes} restantes`} detalhe={`de ${cliente.total_aulas} · ${creditosAtivos} crédito(s) de reposição`} icone={<CalendarClock size={24} />} tom="laranja" />
            <Kpi
              titulo="Profissional"
              valor={prof?.nome ?? '—'}
              detalhe={cliente.ativo ? 'Cliente ativo' : 'Cliente inativo'}
              icone={prof ? <span className="avatar-inicial" style={{ background: prof.cor, width: 44, height: 44, fontSize: 18 }}>{inicial(prof.nome)}</span> : <UserRound size={24} />}
              tom="roxo"
            />
          </>
        }
      />

      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <div className="ui-segmentos">
              {([
                ['dados', 'Dados'],
                ['pagamentos', `Pagamentos (${pagamentos.length})`],
                ['aulas', 'Aulas'],
                ['horarios', `Horários (${recorrencias.length})`],
                ['creditos', `Créditos (${creditosAtivos})`]
              ] as [Aba, string][]).map(([v, r]) => (
                <button key={v} className={aba === v ? 'ativo' : ''} onClick={() => setAba(v)}>{r}</button>
              ))}
            </div>
          </div>

          {aba === 'dados' && (
            <div className="ficha">
              <Campo rotulo="Telefone">{cliente.telefone || '—'}</Campo>
              <Campo rotulo="Aniversário">{cliente.data_nascimento ? `${formatarAniversario(cliente.data_nascimento)} (${formatarData(cliente.data_nascimento)})` : '—'}</Campo>
              <Campo rotulo="Etiquetas">
                {cliente.etiquetas?.length ? cliente.etiquetas.map(t => <span key={t} className="etiqueta tag">{t}</span>) : '—'}
              </Campo>
              <Campo rotulo="Cliente desde">{formatarData(cliente.created_at.slice(0, 10))}</Campo>
              <Campo rotulo="Presenças registradas">{presentes} presença(s) · {faltas} falta(s)</Campo>
              <Campo rotulo="Observações">{cliente.observacoes || '—'}</Campo>
            </div>
          )}

          {aba === 'pagamentos' && (
            pagamentos.length ? (
              <div className="tabela-scroll">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th className="direita">Valor</th>
                      <th>Forma</th>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th className="centro">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.map(p => (
                      <tr key={p.id}>
                        <td>{formatarData(p.data)}</td>
                        <td className="direita"><strong>{formatarMoeda(p.valor)}</strong></td>
                        <td>{ROTULO_FORMA[p.forma]}</td>
                        <td>{p.descricao}</td>
                        <td>{p.vencimento_novo ? `→ ${formatarData(p.vencimento_novo)} (+${p.meses_vencimento})` : '—'}</td>
                        <td className="centro">
                          <button className="ui-icon-btn" onClick={() => apagarPagamento(p)} title="Excluir"><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="tabela-vazia">
                <div className="icone"><CircleDollarSign size={20} /></div>
                <div><h3>Nenhum pagamento</h3><p>Registre o pagamento para atualizar o vencimento automaticamente.</p></div>
                <button className="btn btn-sec" onClick={() => setPagando(true)}>Registrar pagamento</button>
              </div>
            )
          )}

          {aba === 'aulas' && (
            <div className="ficha-duas">
              <div>
                <h3 className="ficha-titulo">Agenda</h3>
                {!aulas.length && <p className="ficha-vazio">Nenhuma aula na agenda.</p>}
                {aulas.map(a => {
                  const p = a.professor_id ? profPorId.get(a.professor_id) : undefined
                  return (
                    <Link key={a.id} href={`/agenda?data=${a.data}`} className="ficha-linha">
                      <span>{formatarDataLonga(a.data)} · {formatarHora(a.hora)}</span>
                      <span className="ui-chip">{ROTULO_STATUS[a.status]}</span>
                      {p && <span className="avatar-inicial" style={{ background: p.cor, width: 24, height: 24, fontSize: 11 }} title={p.nome}>{inicial(p.nome)}</span>}
                    </Link>
                  )
                })}
              </div>
              <div>
                <h3 className="ficha-titulo">Registro de presenças</h3>
                {!presencas.length && <p className="ficha-vazio">Nenhum registro.</p>}
                {presencas.slice(0, 60).map(p => (
                  <div key={p.id} className="ficha-linha">
                    <span>{formatarData(p.data)}</span>
                    <span className={`ui-chip ${p.status === 'faltou' ? 'ui-chip-vermelho' : p.status === 'reinicio' ? 'ui-chip-cinza' : 'ui-chip-verde'}`}>
                      {ROTULO_PRESENCA[p.status] ?? p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aba === 'horarios' && (
            <div style={{ padding: '0 20px 20px' }}>
              {!recorrencias.length && <p className="ficha-vazio">Nenhum horário fixo. Crie uma aula com “Repetir semanalmente” na agenda.</p>}
              {recorrencias.map(r => {
                const p = r.profissional_id ? profPorId.get(r.profissional_id) : undefined
                const s = servicos.find(x => x.id === r.servico_id)
                return (
                  <div key={r.id} className="ficha-linha" style={{ borderLeft: `4px solid ${r.cor ?? p?.cor ?? '#98a2b3'}`, paddingLeft: 12 }}>
                    <strong>{[...r.dias_semana].sort().map(d => DIAS_SEMANA_CURTO[d - 1]).join(', ')}</strong>
                    <span>{formatarHora(r.hora_inicio)}–{formatarHora(r.hora_fim)}</span>
                    {s && <span className="ui-chip">{s.nome}</span>}
                    <span style={{ color: 'var(--ink-500)' }}>{p?.nome ?? 'Sem profissional'}</span>
                    <span style={{ color: 'var(--ink-400)', fontSize: 12.5 }}>
                      desde {formatarData(r.data_inicio)}{r.data_fim ? ` até ${formatarData(r.data_fim)}` : ''}
                    </span>
                  </div>
                )
              })}
              <Link href={`/agenda?novo=${cliente.id}`} className="btn ui-btn-azul" style={{ marginTop: 12, textDecoration: 'none' }}>
                <CalendarPlus size={15} /> Nova aula na agenda
              </Link>
            </div>
          )}

          {aba === 'creditos' && (
            <div style={{ padding: '0 20px 20px' }}>
              {!creditos.length && <p className="ficha-vazio">Nenhum crédito de reposição.</p>}
              {creditos.map(c => {
                const s = situacaoCredito(c, hoje)
                return (
                  <div key={c.id} className="ficha-linha">
                    <span className={`ui-chip ${s === 'ativo' ? 'ui-chip-verde' : s === 'vencido' ? 'ui-chip-vermelho' : 'ui-chip-cinza'}`}>{s}</span>
                    <span>gerado em {formatarData(c.criado_em.slice(0, 10))}</span>
                    <span style={{ color: 'var(--ink-500)' }}>vence {formatarData(c.expira_em)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editando && (
        <ModalCliente
          cliente={cliente}
          planos={planos}
          profissionais={profissionais}
          sugestoesEtiquetas={[]}
          onFechar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false)
            carregar()
          }}
        />
      )}
      {pagando && (
        <ModalPagamento
          clienteInicial={cliente}
          profissionais={profissionais}
          servicos={servicos}
          onFechar={() => setPagando(false)}
          onSalvo={() => {
            setPagando(false)
            setAba('pagamentos')
            carregar()
          }}
        />
      )}
    </>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="ficha-campo">
      <span>{rotulo}</span>
      <div>{children}</div>
    </div>
  )
}
