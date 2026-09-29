'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Pencil, Power } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { EstadoTabela, MenuAcoes, passaAtivos, SelectAtivos, type FiltroAtivos } from '@/app/components/gestao/Comuns'
import { formatarMoeda, MESES_PERIODICIDADE, nomePlano, ROTULO_PERIODICIDADE } from '@/lib/gestao/regras'
import { clientesPorPlano, listarPlanos, salvarPlano } from '@/lib/gestao/servico'
import type { Periodicidade, Plano } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'

export default function PlanosPage() {
  const { toast } = useFeedback()
  const [lista, setLista] = useState<Plano[]>([])
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroAtivos>('ativos')
  const [editando, setEditando] = useState<Partial<Plano> | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [p, c] = await Promise.all([listarPlanos(), clientesPorPlano()])
      setLista(p)
      setContagem(c)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar(p: Partial<Plano>, msg: string) {
    try {
      await salvarPlano(p as Plano)
      toast(msg)
      setEditando(null)
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const visiveis = lista.filter(p => passaAtivos(p.ativo, filtro))
  const novo = () => setEditando({ nome: '', periodicidade: 'mensal', meses: 1, aulas_semana: 2, preco_mensal: 0, ativo: true })

  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Planos' }, { rotulo: 'Listagem de Planos' }]} acao={<button className="btn" onClick={novo}>Novo Plano</button>} />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Planos</h2>
            <div className="painel-filtros">
              <SelectAtivos valor={filtro} onChange={setFiltro} />
            </div>
          </div>
          <EstadoTabela
            carregando={carregando}
            erro={erro}
            onTentar={carregar}
            vazio={
              !visiveis.length ? (
                <div className="tabela-vazia">
                  <div className="icone"><ClipboardList size={20} /></div>
                  <div>
                    <h3>Nenhum plano</h3>
                    <p>Cadastre os planos do estúdio (ex.: Mensal 2x/semana). O preço mensal é usado para calcular o vencimento ao registrar pagamentos.</p>
                  </div>
                  <button className="btn btn-sec" onClick={novo}>Cadastrar plano</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Periodicidade</th>
                        <th className="direita">Preço mensal</th>
                        <th className="centro">Clientes nesse plano</th>
                        <th className="centro">Status</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map(p => (
                        <tr key={p.id} className={`clicavel${p.ativo ? '' : ' inativo'}`} onClick={() => setEditando(p)}>
                          <td className="nome">{p.nome}</td>
                          <td>
                            {ROTULO_PERIODICIDADE[p.periodicidade]}
                            {p.aulas_semana ? ` · ${p.aulas_semana}x/semana` : ''}
                          </td>
                          <td className="direita">{formatarMoeda(p.preco_mensal)}</td>
                          <td className="centro"><strong>{contagem[p.id] ?? 0}</strong></td>
                          <td className="centro">{p.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setEditando(p) },
                                {
                                  rotulo: p.ativo ? 'Inativar' : 'Reativar',
                                  icone: <Power size={15} />,
                                  perigo: p.ativo,
                                  onClick: () => salvar({ ...p, ativo: !p.ativo }, p.ativo ? 'Plano inativado.' : 'Plano reativado.')
                                }
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

      {editando && <ModalPlano inicial={editando} onFechar={() => setEditando(null)} onSalvar={p => salvar(p, 'Plano salvo.')} />}
    </>
  )
}

function ModalPlano({ inicial, onFechar, onSalvar }: { inicial: Partial<Plano>; onFechar: () => void; onSalvar: (p: Partial<Plano>) => void }) {
  const [p, setP] = useState<Partial<Plano>>(inicial)
  const [nomeManual, setNomeManual] = useState(!!inicial.id)
  const nomeAuto = nomePlano(p.periodicidade ?? 'mensal', p.aulas_semana ?? null)
  const nome = nomeManual ? p.nome ?? '' : nomeAuto

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={inicial.id ? 'Editar plano' : 'Novo plano'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button
            className="btn ui-btn-azul"
            disabled={!nome.trim() || (p.preco_mensal ?? -1) < 0}
            onClick={() =>
              onSalvar({
                id: p.id,
                nome: nome.trim(),
                periodicidade: p.periodicidade ?? 'mensal',
                meses: MESES_PERIODICIDADE[p.periodicidade ?? 'mensal'],
                aulas_semana: p.aulas_semana ?? null,
                preco_mensal: Number(p.preco_mensal ?? 0),
                ativo: p.ativo ?? true
              })
            }
          >
            Salvar
          </button>
        </>
      }
    >
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Periodicidade</label>
          <select className="ui-select" value={p.periodicidade} onChange={e => setP(x => ({ ...x, periodicidade: e.target.value as Periodicidade }))}>
            {Object.entries(ROTULO_PERIODICIDADE).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label className="label">Aulas por semana</label>
          <select className="ui-select" value={p.aulas_semana ?? ''} onChange={e => setP(x => ({ ...x, aulas_semana: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">Livre</option>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}x</option>)}
          </select>
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Nome</label>
        <input
          className="input"
          value={nome}
          onChange={e => {
            setNomeManual(true)
            setP(x => ({ ...x, nome: e.target.value }))
          }}
        />
      </div>
      <div className="ui-campo">
        <label className="label">Preço mensal (R$)</label>
        <input className="input" type="number" min={0} step="0.01" value={p.preco_mensal ?? ''} onChange={e => setP(x => ({ ...x, preco_mensal: Number(e.target.value) }))} />
      </div>
      {inicial.id && (
        <label className="ui-check">
          <input type="checkbox" checked={p.ativo ?? true} onChange={e => setP(x => ({ ...x, ativo: e.target.checked }))} />
          Ativo
        </label>
      )}
    </Modal>
  )
}
