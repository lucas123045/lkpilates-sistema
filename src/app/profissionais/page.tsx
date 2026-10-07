'use client'

import { useCallback, useEffect, useState } from 'react'
import { Pencil, Power, UserRound } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { EstadoTabela, MenuAcoes, passaAtivos, SeletorCor, SelectAtivos, type FiltroAtivos } from '@/app/components/gestao/Comuns'
import { formatarData } from '@/lib/agenda/datas'
import { PALETA_PROFESSORES } from '@/lib/agenda/regras'
import { inicial } from '@/lib/gestao/regras'
import { listarProfissionais, salvarProfissional } from '@/lib/gestao/servico'
import type { Profissional } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'

export default function ProfissionaisPage() {
  const { toast } = useFeedback()
  const [lista, setLista] = useState<Profissional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroAtivos>('ativos')
  const [editando, setEditando] = useState<Partial<Profissional> | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      setLista(await listarProfissionais())
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternarAtivo(p: Profissional) {
    try {
      await salvarProfissional({ ...p, ativo: !p.ativo })
      toast(p.ativo ? `${p.nome} inativado.` : `${p.nome} reativado.`)
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const visiveis = lista.filter(p => passaAtivos(p.ativo, filtro))
  const proximaCor = PALETA_PROFESSORES.find(c => !lista.some(p => p.cor.toLowerCase() === c)) ?? PALETA_PROFESSORES[0]

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Profissionais' }, { rotulo: 'Listagem de Profissionais' }]}
        acao={<button className="btn" onClick={() => setEditando({ nome: '', cor: proximaCor, funcao: 'nivel2', ativo: true })}>Novo Profissional</button>}
      />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Profissionais</h2>
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
                  <div className="icone"><UserRound size={20} /></div>
                  <div>
                    <h3>Nenhum profissional</h3>
                    <p>Cadastre quem dá aula. A cor de cada profissional identifica as aulas na agenda.</p>
                  </div>
                  <button className="btn btn-sec" onClick={() => setEditando({ nome: '', cor: proximaCor, funcao: 'nivel2', ativo: true })}>Cadastrar profissional</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="centro">Cor na agenda</th>
                        <th className="centro">Status</th>
                        <th>Data nasc.</th>
                        <th>Telefone</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map(p => (
                        <tr key={p.id} className={`clicavel${p.ativo ? '' : ' inativo'}`} onClick={() => setEditando(p)}>
                          <td className="nome">{p.nome}</td>
                          <td className="centro">
                            <span className="cor-bolinha" style={{ background: p.cor }} title={p.cor} />
                          </td>
                          <td className="centro">{p.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td>{p.data_nascimento ? formatarData(p.data_nascimento) : ''}</td>
                          <td>{p.telefone}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setEditando(p) },
                                { rotulo: p.ativo ? 'Inativar' : 'Reativar', icone: <Power size={15} />, perigo: p.ativo, onClick: () => alternarAtivo(p) }
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
        <ModalProfissional
          inicial={editando}
          usadas={lista.filter(p => p.id !== editando.id).map(p => p.cor.toLowerCase())}
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

function ModalProfissional({ inicial: ini, usadas, onFechar, onSalvo }: { inicial: Partial<Profissional>; usadas: string[]; onFechar: () => void; onSalvo: () => void }) {
  const { toast } = useFeedback()
  const [p, setP] = useState<Partial<Profissional>>(ini)
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof Profissional>(k: K, v: Profissional[K] | null) => setP(x => ({ ...x, [k]: v }))

  async function salvar() {
    setSalvando(true)
    try {
      await salvarProfissional({ ...p, nome: p.nome!.trim(), cor: p.cor!, funcao: p.funcao ?? 'nivel2' } as Profissional)
      toast('Profissional salvo.')
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
      titulo={ini.id ? 'Editar profissional' : 'Novo profissional'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || !p.nome?.trim()} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Nome</label>
        <input className="input" value={p.nome ?? ''} onChange={e => set('nome', e.target.value)} autoFocus />
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Telefone</label>
          <input className="input" inputMode="tel" value={p.telefone ?? ''} onChange={e => set('telefone', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Data de nascimento</label>
          <input className="input" type="date" value={p.data_nascimento ?? ''} onChange={e => set('data_nascimento', e.target.value)} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">E-mail (opcional)</label>
        <input className="input" type="email" value={p.email ?? ''} onChange={e => set('email', e.target.value)} />
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 6 }}>Logins e níveis de acesso ficam em Usuários e acessos.</p>
      </div>
      <div className="ui-campo">
        <label className="label">Cor na agenda</label>
        <SeletorCor valor={p.cor ?? null} onChange={c => set('cor', c ?? PALETA_PROFESSORES[0])} />
        {p.cor && usadas.includes(p.cor.toLowerCase()) && (
          <p style={{ fontSize: 12.5, color: '#b4480b', marginTop: 6 }}>Outra pessoa já usa esta cor; prefira uma diferente.</p>
        )}
      </div>
      {ini.id && (
        <label className="ui-check">
          <input type="checkbox" checked={p.ativo ?? true} onChange={e => set('ativo', e.target.checked)} />
          Ativo
        </label>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <span className="avatar-inicial" style={{ background: p.cor ?? '#98a2b3' }}>{inicial(p.nome)}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Assim aparece nas listas e na agenda.</span>
      </div>
    </Modal>
  )
}
