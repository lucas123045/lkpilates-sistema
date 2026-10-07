'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Power, ShieldCheck } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { useUsuario } from '@/app/components/shell/Usuario'
import { EstadoTabela, MenuAcoes, passaAtivos, SelectAtivos, type FiltroAtivos } from '@/app/components/gestao/Comuns'
import { ROTULO_NIVEL, type Nivel } from '@/lib/acesso'
import { listarProfissionais } from '@/lib/gestao/servico'
import type { Profissional } from '@/lib/gestao/tipos'
import { alterarUsuario, criarUsuario, listarUsuarios, type UsuarioSistema } from '@/lib/usuarios'
import '@/app/components/ui/ui.css'

const SENHA_MINIMA = 8

export default function UsuariosPage() {
  const { toast, confirmar } = useFeedback()
  const eu = useUsuario()
  const [lista, setLista] = useState<UsuarioSistema[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<FiltroAtivos>('ativos')
  const [editando, setEditando] = useState<Partial<UsuarioSistema> | null>(null)
  const [senhaDe, setSenhaDe] = useState<UsuarioSistema | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [u, p] = await Promise.all([listarUsuarios(), listarProfissionais()])
      setLista(u)
      setProfissionais(p)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternarAtivo(u: UsuarioSistema) {
    if (u.ativo) {
      const ok = await confirmar({
        titulo: `Desativar ${u.nome}?`,
        mensagem: 'A pessoa não consegue mais entrar no sistema. Dá para reativar depois.',
        confirmar: 'Desativar',
        perigo: true
      })
      if (!ok) return
    }
    try {
      await alterarUsuario(u.user_id, { ativo: !u.ativo })
      toast(u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`)
      carregar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    }
  }

  const visiveis = lista.filter(u => passaAtivos(u.ativo, filtro))
  const novo = () => setEditando({ nome: '', email: '', nivel: 1, ativo: true })

  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Usuários e acessos' }]} acao={<button className="btn" onClick={novo}>Novo login</button>} />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <h2>Usuários e acessos</h2>
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
                  <div className="icone"><ShieldCheck size={20} /></div>
                  <div>
                    <h3>Nenhum login</h3>
                    <p>Crie um login para cada pessoa que usa o sistema e escolha o nível de acesso.</p>
                  </div>
                  <button className="btn btn-sec" onClick={novo}>Criar login</button>
                </div>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>E-mail</th>
                        <th>Nível de acesso</th>
                        <th className="centro">Status</th>
                        <th className="centro">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map(u => (
                        <tr key={u.user_id} className={`clicavel${u.ativo ? '' : ' inativo'}`} onClick={() => setEditando(u)}>
                          <td className="nome">
                            {u.nome}
                            {u.user_id === eu.id && <span style={{ color: 'var(--ink-500)', fontWeight: 400 }}> (você)</span>}
                          </td>
                          <td>{u.email}</td>
                          <td>
                            <span className={`etiqueta ${u.nivel === 2 ? 'admin' : 'tag'}`}>{u.nivel === 2 ? 'Nível 2 – Acesso total' : 'Nível 1 – Agenda e Relatório'}</span>
                          </td>
                          <td className="centro">{u.ativo ? 'Ativo' : 'Inativo'}</td>
                          <td className="centro">
                            <MenuAcoes
                              itens={[
                                { rotulo: 'Editar', icone: <Pencil size={15} />, onClick: () => setEditando(u) },
                                { rotulo: 'Redefinir senha', icone: <KeyRound size={15} />, onClick: () => setSenhaDe(u) },
                                ...(u.user_id === eu.id
                                  ? []
                                  : [{ rotulo: u.ativo ? 'Desativar' : 'Reativar', icone: <Power size={15} />, perigo: u.ativo, onClick: () => alternarAtivo(u) }])
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
        <ModalUsuario
          inicial={editando}
          proprio={editando.user_id === eu.id}
          profissionais={profissionais.filter(p => p.ativo || p.id === editando.profissional_id)}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
      {senhaDe && <ModalSenha usuario={senhaDe} onFechar={() => setSenhaDe(null)} />}
    </>
  )
}

function ModalUsuario({ inicial: ini, proprio, profissionais, onFechar, onSalvo }: {
  inicial: Partial<UsuarioSistema>
  proprio: boolean
  profissionais: Profissional[]
  onFechar: () => void
  onSalvo: () => void
}) {
  const { toast } = useFeedback()
  const novo = !ini.user_id
  const [u, setU] = useState<Partial<UsuarioSistema>>(ini)
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof UsuarioSistema>(k: K, v: UsuarioSistema[K] | null) => setU(x => ({ ...x, [k]: v }))

  const valido = !!u.nome?.trim() && (!novo || (!!u.email?.trim() && senha.length >= SENHA_MINIMA))

  async function salvar() {
    setSalvando(true)
    try {
      const dados = { nome: u.nome!.trim(), nivel: (u.nivel ?? 1) as Nivel, profissional_id: u.profissional_id ?? null }
      if (novo) await criarUsuario({ ...dados, email: u.email!.trim(), senha })
      else await alterarUsuario(ini.user_id!, proprio ? { nome: dados.nome, profissional_id: dados.profissional_id } : dados)
      toast(novo ? 'Login criado. Passe o e-mail e a senha para a pessoa.' : 'Login atualizado.')
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
      titulo={novo ? 'Novo login' : 'Editar login'}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || !valido} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Nome</label>
        <input className="input" value={u.nome ?? ''} onChange={e => set('nome', e.target.value)} autoFocus />
      </div>
      <div className="ui-campo">
        <label className="label">E-mail de login</label>
        <input className="input" type="email" value={u.email ?? ''} onChange={e => set('email', e.target.value)} disabled={!novo} autoComplete="off" />
      </div>
      {novo && (
        <div className="ui-campo">
          <label className="label">Senha inicial</label>
          <input className="input" type="text" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" placeholder={`Pelo menos ${SENHA_MINIMA} caracteres`} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 6 }}>A pessoa pode trocar depois, no ícone de chave no topo do sistema.</p>
        </div>
      )}
      <div className="ui-campo">
        <label className="label">Nível de acesso</label>
        {([1, 2] as Nivel[]).map(n => (
          <label key={n} className="ui-check" style={{ marginBottom: 8 }}>
            <input type="radio" name="nivel" checked={(u.nivel ?? 1) === n} onChange={() => set('nivel', n)} disabled={proprio} />
            <span>
              <strong>{ROTULO_NIVEL[n]}</strong>
              <br />
              <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
                {n === 1 ? 'Só vê a Agenda e o Relatório de alunos.' : 'Vê tudo, inclusive financeiro, resultados e IA, e gerencia os logins.'}
              </span>
            </span>
          </label>
        ))}
        {proprio && <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Você não pode mudar o próprio nível.</p>}
      </div>
      <div className="ui-campo">
        <label className="label">Profissional vinculado (opcional)</label>
        <select className="ui-select" value={u.profissional_id ?? ''} onChange={e => set('profissional_id', e.target.value || null)}>
          <option value="">Nenhum</option>
          {profissionais.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
      </div>
    </Modal>
  )
}

function ModalSenha({ usuario, onFechar }: { usuario: UsuarioSistema; onFechar: () => void }) {
  const { toast } = useFeedback()
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      await alterarUsuario(usuario.user_id, { senha })
      toast(`Senha de ${usuario.nome} redefinida.`)
      onFechar()
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
      titulo="Redefinir senha"
      subtitulo={`${usuario.nome} · ${usuario.email}`}
      largura={420}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || senha.length < SENHA_MINIMA} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Nova senha</label>
        <input className="input" type="text" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" placeholder={`Pelo menos ${SENHA_MINIMA} caracteres`} autoFocus />
      </div>
    </Modal>
  )
}
