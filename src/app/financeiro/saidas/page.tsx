'use client'

import { useCallback, useEffect, useState } from 'react'
import { NotebookPen, Pencil, Receipt, Repeat, Search, Trash2 } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader, { Kpi } from '@/app/components/shell/PageHeader'
import { EstadoTabela, MenuAcoes } from '@/app/components/gestao/Comuns'
import { formatarData, hojeEstudio } from '@/lib/agenda/datas'
import { formatarMoeda, ROTULO_CATEGORIA, ultimosDias } from '@/lib/gestao/regras'
import { excluirDespesa, listarDespesas, salvarDespesa, type NovaDespesa } from '@/lib/gestao/servico'
import type { CategoriaDespesa, Despesa } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'

export default function SaidasPage() {
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [total30, setTotal30] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [editando, setEditando] = useState<Partial<Despesa> | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    setCarregando(true)
    try {
      const u = ultimosDias(hoje, 30)
      const [lista, ult30] = await Promise.all([listarDespesas({ inicio: inicio || undefined, fim: fim || undefined }), listarDespesas(u)])
      setDespesas(lista)
      setTotal30(ult30.reduce((s, d) => s + Number(d.valor), 0))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [hoje, inicio, fim])

  useEffect(() => {
    carregar()
  }, [carregar])

  const novo = () => setEditando({ data: hoje, categoria: 'aluguel', recorrente: false })

  async function apagar(d: Despesa) {
    const ok = await confirmar({ titulo: 'Excluir despesa?', mensagem: `${ROTULO_CATEGORIA[d.categoria]} · ${formatarMoeda(d.valor)} em ${formatarData(d.data)}.`, confirmar: 'Excluir', perigo: true })
    if (!ok) return
    try {
      await excluirDespesa(d.id)
      toast('Despesa excluída.')
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Financeiro' }, { rotulo: 'Saídas' }]}
        acao={<button className="btn" onClick={novo}>Nova Despesa</button>}
        cards={<Kpi titulo="Total gasto" valor={formatarMoeda(total30)} detalhe="Nos últimos 30 dias" icone={<NotebookPen size={26} />} tom="laranja" />}
      />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Despesas</h2>
            <div className="painel-filtros">
              <label className="campo">Data inicial<input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></label>
              <label className="campo">Data final<input type="date" value={fim} onChange={e => setFim(e.target.value)} /></label>
              <button className="btn btn-sec" onClick={carregar} aria-label="Buscar" title="Buscar"><Search size={16} /></button>
            </div>
          </div>
          <EstadoTabela
            carregando={carregando}
            erro={erro}
            onTentar={carregar}
            vazio={
              !despesas.length ? (
                <div className="tabela-vazia">
                  <div className="icone"><Receipt size={20} /></div>
                  <div>
                    <h3>Nenhuma despesa registrada</h3>
                    <p>Lance aluguel, energia, equipamentos e comissões para saber quanto sobra no fim do mês. Despesas fixas podem ser marcadas como recorrentes.</p>
                  </div>
                  <button className="btn btn-sec" onClick={novo}>Registrar despesa</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th className="direita">Valor</th>
                        <th>Categoria</th>
                        <th>Descrição</th>
                        <th>Recorrente</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {despesas.map(d => (
                        <tr key={d.id}>
                          <td>{formatarData(d.data)}</td>
                          <td className="direita"><strong>{formatarMoeda(d.valor)}</strong></td>
                          <td>{ROTULO_CATEGORIA[d.categoria]}</td>
                          <td>{d.descricao}</td>
                          <td>{d.recorrente ? <span className="ui-chip"><Repeat size={12} /> Mensal</span> : '—'}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setEditando(d) },
                                { rotulo: 'Lançar no próximo mês', icone: <Repeat size={15} />, onClick: () => setEditando({ ...d, id: undefined, data: proximoMes(d.data) }) },
                                { rotulo: 'Excluir', icone: <Trash2 size={15} />, perigo: true, onClick: () => apagar(d) }
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

      {editando && (
        <ModalDespesa
          inicial={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </>
  )
}

function proximoMes(data: string) {
  const [a, m, d] = data.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

function ModalDespesa({ inicial, onFechar, onSalvo }: { inicial: Partial<Despesa>; onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useFeedback()
  const [d, setD] = useState<Partial<Despesa>>(inicial)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      const dados: NovaDespesa = { data: d.data!, valor: Number(d.valor), categoria: d.categoria as CategoriaDespesa, descricao: d.descricao ?? '', recorrente: !!d.recorrente }
      await salvarDespesa(d.id ?? null, dados)
      toast('Despesa salva.')
      onSalvo()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={d.id ? 'Editar despesa' : 'Nova despesa'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || !d.data || !(Number(d.valor) > 0)} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Data</label>
          <input className="input" type="date" value={d.data ?? ''} onChange={e => setD(x => ({ ...x, data: e.target.value }))} />
        </div>
        <div className="ui-campo">
          <label className="label">Valor (R$)</label>
          <input className="input" type="number" min={0} step="0.01" value={d.valor ?? ''} onChange={e => setD(x => ({ ...x, valor: Number(e.target.value) }))} autoFocus />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Categoria</label>
        <select className="ui-select" value={d.categoria} onChange={e => setD(x => ({ ...x, categoria: e.target.value as CategoriaDespesa }))}>
          {Object.entries(ROTULO_CATEGORIA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </div>
      <div className="ui-campo">
        <label className="label">Descrição</label>
        <input className="input" value={d.descricao ?? ''} onChange={e => setD(x => ({ ...x, descricao: e.target.value }))} placeholder="Ex.: aluguel da sala, conta de luz de setembro" />
      </div>
      <label className="ui-check">
        <input type="checkbox" checked={!!d.recorrente} onChange={e => setD(x => ({ ...x, recorrente: e.target.checked }))} />
        Despesa recorrente (mensal)
      </label>
    </Modal>
  )
}
