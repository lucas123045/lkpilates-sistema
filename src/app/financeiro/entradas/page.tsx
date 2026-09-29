'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PiggyBank, Pencil, Search, Trash2, Wallet } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader, { Kpi } from '@/app/components/shell/PageHeader'
import { EstadoTabela, MenuAcoes } from '@/app/components/gestao/Comuns'
import ModalPagamento from '@/app/components/gestao/ModalPagamento'
import { formatarData, hojeEstudio } from '@/lib/agenda/datas'
import { formatarMoeda, ROTULO_FORMA, ultimosDias } from '@/lib/gestao/regras'
import { excluirPagamento, listarClientes, listarPagamentos, listarProfissionais, listarServicos } from '@/lib/gestao/servico'
import type { Cliente, Pagamento, Profissional, Servico } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'

export default function EntradasPage() {
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [total30, setTotal30] = useState(0)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [inicio, setInicio] = useState(ultimosDias(hoje, 30).inicio)
  const [fim, setFim] = useState(hoje)
  const [profissionalId, setProfissionalId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [modal, setModal] = useState<{ pagamento: Pagamento | null } | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    setCarregando(true)
    try {
      const u = ultimosDias(hoje, 30)
      const [lista, ult30, c, p, s] = await Promise.all([
        listarPagamentos({ inicio: inicio || undefined, fim: fim || undefined, profissionalId: profissionalId || undefined, servicoId: servicoId || undefined }),
        listarPagamentos({ inicio: u.inicio, fim: u.fim }),
        listarClientes(),
        listarProfissionais(),
        listarServicos()
      ])
      setPagamentos(lista)
      setTotal30(ult30.reduce((s, x) => s + Number(x.valor), 0))
      setClientes(c)
      setProfissionais(p)
      setServicos(s)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [hoje, inicio, fim, profissionalId, servicoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeCliente = useMemo(() => new Map(clientes.map(c => [c.id, c.nome])), [clientes])
  const nomeProf = useMemo(() => new Map(profissionais.map(p => [p.id, p.nome])), [profissionais])
  const nomeServico = useMemo(() => new Map(servicos.map(s => [s.id, s.nome])), [servicos])
  const totalFiltro = pagamentos.reduce((s, p) => s + Number(p.valor), 0)

  async function apagar(p: Pagamento) {
    const ok = await confirmar({
      titulo: 'Excluir pagamento?',
      mensagem: `${formatarMoeda(p.valor)} de ${formatarData(p.data)}${p.aluno_id ? ` (${nomeCliente.get(p.aluno_id) ?? 'cliente'})` : ''}.${p.meses_vencimento ? ' O vencimento do cliente volta para a data anterior.' : ''}`,
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
        trilha={[{ rotulo: 'Financeiro' }, { rotulo: 'Entradas' }]}
        acao={<button className="btn" onClick={() => setModal({ pagamento: null })}>Novo Pagamento</button>}
        cards={
          <>
            <Kpi titulo="Total recebido" valor={formatarMoeda(total30)} detalhe="Nos últimos 30 dias" icone={<PiggyBank size={26} />} tom="roxo" />
            <Kpi titulo="No período filtrado" valor={formatarMoeda(totalFiltro)} detalhe={`${pagamentos.length} lançamento(s)`} icone={<Wallet size={26} />} tom="verde" />
          </>
        }
      />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Entradas</h2>
            <div className="painel-filtros">
              <label className="campo">Data inicial<input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
              <label className="campo">Data final<input type="date" value={fim} onChange={e => setFim(e.target.value)} /></label>
              <label className="campo">
                Profissional
                <select value={profissionalId} onChange={e => setProfissionalId(e.target.value)}>
                  <option value="">Todos</option>
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
              <label className="campo">
                Serviço
                <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
                  <option value="">Todos</option>
                  {servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <button className="btn btn-sec" onClick={carregar} aria-label="Buscar" title="Buscar"><Search size={16} /></button>
            </div>
          </div>
          <EstadoTabela
            carregando={carregando}
            erro={erro}
            onTentar={carregar}
            vazio={
              !pagamentos.length ? (
                <div className="tabela-vazia">
                  <div className="icone"><PiggyBank size={20} /></div>
                  <div>
                    <h3>Nenhum pagamento no período</h3>
                    <p>Registre os pagamentos dos clientes: o vencimento de cada um avança automaticamente conforme o plano.</p>
                  </div>
                  <button className="btn btn-sec" onClick={() => setModal({ pagamento: null })}>Registrar pagamento</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th className="direita">Valor</th>
                        <th>Forma pagamento</th>
                        <th>Cliente</th>
                        <th>Profissional</th>
                        <th>Serviço</th>
                        <th>Descrição</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentos.map(p => (
                        <tr key={p.id}>
                          <td>{formatarData(p.data)}</td>
                          <td className="direita"><strong>{formatarMoeda(p.valor)}</strong></td>
                          <td>{ROTULO_FORMA[p.forma]}</td>
                          <td>{p.aluno_id ? nomeCliente.get(p.aluno_id) ?? '—' : '—'}</td>
                          <td>{p.profissional_id ? nomeProf.get(p.profissional_id) : '—'}</td>
                          <td>{p.servico_id ? nomeServico.get(p.servico_id) : '—'}</td>
                          <td>{p.descricao}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setModal({ pagamento: p }) },
                                { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: () => apagar(p) }
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          />
        </div>
      </div>

      {modal && (
        <ModalPagamento
          pagamento={modal.pagamento}
          profissionais={profissionais}
          servicos={servicos}
          onFechar={() => setModal(null)}
          onSalvo={() => {
            setModal(null)
            carregar()
          }}
        />
      )}
    </>
  )
}
