'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUp, CircleDollarSign, Gift, Search, UsersRound, X } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader, { Kpi } from '@/app/components/shell/PageHeader'
import { EstadoTabela } from '@/app/components/gestao/Comuns'
import { formatarData, hojeEstudio } from '@/lib/agenda/datas'
import { marcarExperimentalConvertido } from '@/lib/agenda/servico'
import {
  aniversarioHoje,
  aniversarioNoMes,
  formatarAniversario,
  formatarMoeda,
  inicial,
  novoNoMes,
  pagamentoAtrasado,
  situacaoVencimento
} from '@/lib/gestao/regras'
import { listarClientes, listarPlanos, listarProfissionais } from '@/lib/gestao/servico'
import type { Cliente, Plano, Profissional } from '@/lib/gestao/tipos'
import ModalCliente from './ModalCliente'
import '@/app/components/ui/ui.css'

type Status = 'ativos' | 'inativos' | 'todos'

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <Clientes />
    </Suspense>
  )
}

function Clientes() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useFeedback()
  const hoje = hojeEstudio()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [planos, setPlanos] = useState<Plano[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [profissional, setProfissional] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [status, setStatus] = useState<Status>('ativos')
  const [somenteAtrasados, setSomenteAtrasados] = useState(false)
  const [somenteAniversariantes, setSomenteAniversariantes] = useState(false)
  const [novo, setNovo] = useState<Partial<Cliente> | null>(null)

  const experimentalId = params.get('experimental')

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [c, p, pr] = await Promise.all([listarClientes(), listarPlanos(), listarProfissionais()])
      setClientes(c)
      setPlanos(p)
      setProfissionais(pr)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Vindo de "converter aula experimental em cliente"
  useEffect(() => {
    if (experimentalId || params.get('novo')) {
      setNovo({ nome: params.get('nome') ?? '', telefone: params.get('telefone') ?? '' })
    }
  }, [experimentalId, params])

  const planoPorId = useMemo(() => new Map(planos.map(p => [p.id, p])), [planos])
  const profPorId = useMemo(() => new Map(profissionais.map(p => [p.id, p])), [profissionais])
  const etiquetas = useMemo(() => [...new Set(clientes.flatMap(c => c.etiquetas ?? []))].sort((a, b) => a.localeCompare(b)), [clientes])

  const ativos = clientes.filter(c => c.ativo)
  const atrasados = ativos.filter(c => pagamentoAtrasado(c, hoje)).length
  const aniversariantes = ativos.filter(c => aniversarioNoMes(c.data_nascimento, hoje))
  const aniversariantesHoje = aniversariantes.filter(c => aniversarioHoje(c.data_nascimento, hoje)).length
  const novosMes = ativos.filter(c => novoNoMes(c.created_at, hoje)).length

  const termo = busca.trim().toLowerCase()
  const visiveis = clientes.filter(
    c =>
      (status === 'todos' || (status === 'ativos' ? c.ativo : !c.ativo)) &&
      (!termo || c.nome.toLowerCase().includes(termo) || (c.telefone ?? '').replace(/\D/g, '').includes(termo.replace(/\D/g, '') || '#')) &&
      (!profissional || (profissional === '__sem' ? !c.professor_id : c.professor_id === profissional)) &&
      (!etiqueta || (c.etiquetas ?? []).includes(etiqueta)) &&
      (!somenteAtrasados || pagamentoAtrasado(c, hoje)) &&
      (!somenteAniversariantes || aniversarioNoMes(c.data_nascimento, hoje))
  )
  if (somenteAniversariantes) visiveis.sort((a, b) => (a.data_nascimento ?? '').slice(8).localeCompare((b.data_nascimento ?? '').slice(8)))

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Clientes' }, { rotulo: 'Listagem de Clientes' }]}
        acao={<button className="btn" onClick={() => setNovo({})}>Novo Cliente</button>}
        cards={
          <>
            <Kpi titulo="Pag. atrasados" valor={atrasados} icone={<CircleDollarSign size={26} />} tom="vermelho">
              <button className="btn btn-sec btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => { setSomenteAtrasados(v => !v); setSomenteAniversariantes(false) }}>
                {somenteAtrasados ? 'Mostrar todos' : 'Ver lista'}
              </button>
            </Kpi>
            <Kpi
              titulo="Aniversários"
              valor={`${aniversariantes.length} esse mês`}
              icone={<Gift size={26} />}
              tom="roxo"
              detalhe={
                <button className="kpi-link" onClick={() => { setSomenteAniversariantes(v => !v); setSomenteAtrasados(false) }}>
                  {aniversariantesHoje > 0 && <span className="sobe"><ArrowUp size={13} /> {aniversariantesHoje}</span>} hoje · {somenteAniversariantes ? 'mostrar todos' : 'ver lista'}
                </button>
              }
            />
            <Kpi
              titulo="Clientes ativos"
              valor={ativos.length}
              icone={<UsersRound size={26} />}
              tom="verde"
              detalhe={<><span className="sobe"><ArrowUp size={13} /> {novosMes} novos</span> nesse mês</>}
            />
          </>
        }
      />

      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Clientes {somenteAtrasados && '· pagamentos atrasados'}{somenteAniversariantes && '· aniversariantes do mês'}</h2>
            <div className="painel-filtros">
              <div className="busca">
                <Search size={16} />
                <input placeholder="Buscar por nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <select value={profissional} onChange={e => setProfissional(e.target.value)} aria-label="Profissional">
                <option value="">Profissional</option>
                <option value="__sem">Sem profissional</option>
                {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={etiqueta} onChange={e => setEtiqueta(e.target.value)} aria-label="Etiquetas">
                <option value="">Etiquetas</option>
                {etiquetas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={status} onChange={e => setStatus(e.target.value as Status)} aria-label="Status">
                <option value="ativos">Somente ativos</option>
                <option value="inativos">Somente inativos</option>
                <option value="todos">Todos</option>
              </select>
              {(busca || profissional || etiqueta || somenteAtrasados || somenteAniversariantes) && (
                <button className="btn btn-sec" onClick={() => { setBusca(''); setProfissional(''); setEtiqueta(''); setSomenteAtrasados(false); setSomenteAniversariantes(false) }}>
                  <X size={14} /> Limpar
                </button>
              )}
            </div>
          </div>

          <EstadoTabela
            carregando={carregando}
            erro={erro}
            onTentar={carregar}
            vazio={
              !visiveis.length ? (
                <div className="tabela-vazia">
                  <div className="icone"><UsersRound size={20} /></div>
                  <div>
                    <h3>Nenhum cliente encontrado</h3>
                    <p>Ajuste os filtros ou cadastre um novo cliente.</p>
                  </div>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Plano</th>
                        <th className="direita">Preço</th>
                        <th>Vencimento</th>
                        <th className="centro">Profissional</th>
                        <th>Telefone</th>
                        <th className="centro">Aniversário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map(c => {
                        const plano = c.plano_id ? planoPorId.get(c.plano_id) : undefined
                        const prof = c.professor_id ? profPorId.get(c.professor_id) : undefined
                        const sit = situacaoVencimento(c.vencimento, hoje)
                        return (
                          <tr key={c.id} className={`clicavel${c.ativo ? '' : ' inativo'}`} onClick={() => router.push(`/clientes/${c.id}`)}>
                            <td className="nome" title={c.nome}>
                              {c.nome}
                              {(c.etiquetas ?? []).length > 0 && (
                                <div style={{ fontWeight: 400 }}>
                                  {c.etiquetas.slice(0, 3).map(t => <span key={t} className="etiqueta tag">{t}</span>)}
                                </div>
                              )}
                            </td>
                            <td>{plano?.nome ?? c.plano ?? '—'}</td>
                            <td className="direita">{plano ? formatarMoeda(plano.preco_mensal) : c.valor_plano ? formatarMoeda(c.valor_plano) : '—'}</td>
                            <td>
                              {c.vencimento ? (
                                <span title={sit === 'vencido' ? 'Pagamento atrasado' : 'Em dia'}>
                                  <span className={`bolinha ${sit === 'vencido' ? 'vermelha' : 'verde'}`} />
                                  {formatarData(c.vencimento)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--ink-400)' }}>—</span>
                              )}
                            </td>
                            <td className="centro">
                              {prof ? (
                                <span className="avatar-inicial" style={{ background: prof.cor }} title={prof.nome}>{inicial(prof.nome)}</span>
                              ) : (
                                <span style={{ color: 'var(--ink-400)' }}>—</span>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>{c.telefone}</td>
                            <td className="centro">{formatarAniversario(c.data_nascimento)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          />
          {!carregando && visiveis.length > 0 && <div className="paginacao">{visiveis.length} cliente(s)</div>}
        </div>
      </div>

      {novo && (
        <ModalCliente
          cliente={novo}
          planos={planos}
          profissionais={profissionais}
          sugestoesEtiquetas={etiquetas}
          onFechar={() => {
            setNovo(null)
            if (experimentalId || params.get('novo')) router.replace('/clientes')
          }}
          onSalvo={async id => {
            if (experimentalId) {
              try {
                await marcarExperimentalConvertido(Number(experimentalId), id)
              } catch (e) {
                toast(mensagemDeErro(e), 'erro')
              }
            }
            setNovo(null)
            router.push(`/clientes/${id}`)
          }}
        />
      )}
    </>
  )
}
