'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Power, Tag } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { EstadoTabela, MenuAcoes, PALETA_SERVICOS, passaAtivos, SeletorCor, SelectAtivos, type FiltroAtivos } from '@/app/components/gestao/Comuns'
import { listarServicos, salvarServico } from '@/lib/gestao/servico'
import type { Servico } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'

export default function ServicosPage() {
  const { toast } = useFeedback()
  const [lista, setLista] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroAtivos>('ativos')
  const [editando, setEditando] = useState<Partial<Servico> | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      setLista(await listarServicos())
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar(s: Partial<Servico>, msg: string) {
    try {
      await salvarServico(s as Servico)
      toast(msg)
      setEditando(null)
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const visiveis = lista.filter(s => passaAtivos(s.ativo, filtro))
  const novo = () => setEditando({ nome: '', duracao_padrao_min: 60, cor: PALETA_SERVICOS[0], ativo: true, capacidade_padrao: 3 })

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Tipos de Serviço' }, { rotulo: 'Listagem de Tipos de Serviço' }]}
        acao={<button className="btn" onClick={novo}>Novo Tipo de Serviço</button>}
      />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Tipos de Serviço</h2>
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
                  <div className="icone"><Tag size={20} /></div>
                  <div>
                    <h3>Nenhum tipo de serviço</h3>
                    <p>Ex.: Aula de pilates, Drenagem, Massagem. A duração padrão preenche o horário final na agenda.</p>
                  </div>
                  <button className="btn btn-sec" onClick={novo}>Cadastrar serviço</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="centro">Duração</th>
                        <th className="centro">Cor na agenda</th>
                        <th className="centro">Status</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map(s => (
                        <tr key={s.id} className={`clicavel${s.ativo ? '' : ' inativo'}`} onClick={() => setEditando(s)}>
                          <td className="nome">{s.nome}</td>
                          <td className="centro">{s.duracao_padrao_min} min</td>
                          <td className="centro">
                            <span className="cor-bolinha" style={{ background: s.cor }} />
                          </td>
                          <td className="centro">{s.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setEditando(s) },
                                {
                                  rotulo: s.ativo ? 'Inativar' : 'Reativar',
                                  icone: <Power size={15} />,
                                  perigo: s.ativo,
                                  onClick: () => salvar({ ...s, ativo: !s.ativo }, s.ativo ? 'Serviço inativado.' : 'Serviço reativado.')
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

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo={editando.id ? 'Editar tipo de serviço' : 'Novo tipo de serviço'}
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setEditando(null)}>Cancelar</button>
              <button
                className="btn ui-btn-azul"
                disabled={!editando.nome?.trim() || !(Number(editando.duracao_padrao_min) >= 5)}
                onClick={() =>
                  salvar(
                    {
                      id: editando.id,
                      nome: editando.nome!.trim(),
                      duracao_padrao_min: Number(editando.duracao_padrao_min),
                      cor: editando.cor ?? PALETA_SERVICOS[0],
                      ativo: editando.ativo ?? true
                    },
                    'Serviço salvo.'
                  )
                }
              >
                Salvar
              </button>
            </>
          }
        >
          <div className="ui-campo">
            <label className="label">Nome</label>
            <input className="input" value={editando.nome ?? ''} onChange={e => setEditando(x => ({ ...x, nome: e.target.value }))} autoFocus placeholder="Ex.: Aula de pilates" />
          </div>
          <div className="ui-campo">
            <label className="label">Duração padrão (minutos)</label>
            <input
              className="input"
              type="number"
              min={5}
              step={5}
              value={editando.duracao_padrao_min ?? ''}
              onChange={e => setEditando(x => ({ ...x, duracao_padrao_min: Number(e.target.value) }))}
            />
          </div>
          <div className="ui-campo">
            <label className="label">Cor</label>
            <SeletorCor valor={editando.cor ?? null} paleta={PALETA_SERVICOS} onChange={c => setEditando(x => ({ ...x, cor: c ?? PALETA_SERVICOS[0] }))} />
          </div>
          {editando.id && (
            <label className="ui-check">
              <input type="checkbox" checked={editando.ativo ?? true} onChange={e => setEditando(x => ({ ...x, ativo: e.target.checked }))} />
              Ativo
            </label>
          )}
        </Modal>
      )}
    </>
  )
}
