'use client'

import { useCallback, useEffect, useState } from 'react'
import { Ban, FileSignature, Link2, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { formatarData, hojeEstudio } from '@/lib/agenda/datas'
import { bloquear, desfazerBloqueio, salvarConfiguracao } from '@/lib/agenda/servico'
import { carregarEmpresa, carregarRegrasAgenda, listarBloqueios, salvarEmpresa } from '@/lib/gestao/servico'
import type { Empresa } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'
import './empresa.css'

type Regras = { antecedencia_desmarcacao_horas: number; validade_credito_dias: number; limite_reposicoes_mes: number | null }
type Bloqueio = { id: string; data: string; data_fim: string | null; motivo: string }

export default function EmpresaPage() {
  const { toast, confirmar } = useFeedback()
  const hoje = hojeEstudio()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [regras, setRegras] = useState<Regras | null>(null)
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [editandoRegras, setEditandoRegras] = useState<Regras | null>(null)
  const [novoBloqueio, setNovoBloqueio] = useState<{ data: string; fim: string; motivo: string; credito: boolean } | null>(null)
  const [origem, setOrigem] = useState('')

  useEffect(() => setOrigem(window.location.origin), [])

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [e, r, b] = await Promise.all([carregarEmpresa(), carregarRegrasAgenda(), listarBloqueios()])
      setEmpresa(e)
      setRegras(r)
      setBloqueios(b)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function executar(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn()
      toast(msg)
      carregar()
      return true
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
      return false
    }
  }

  async function removerBloqueio(b: Bloqueio) {
    const ok = await confirmar({
      titulo: 'Remover este bloqueio?',
      mensagem: 'As aulas que ele cancelou voltam a ficar agendadas e os créditos gerados (ainda não usados) são cancelados.',
      confirmar: 'Remover',
      perigo: true
    })
    if (ok) executar(() => desfazerBloqueio(b.id), 'Bloqueio removido.')
  }

  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Minha Empresa' }]} />
      <div className="ph-corpo">
        {erro && <div className="ui-alerta ui-alerta-erro">{erro}</div>}
        {!empresa && !erro && <div className="ui-skeleton" style={{ height: 200 }} />}
        {empresa && (
          <div className="emp-grade">
            <div className="painel emp-dados">
              <div className="painel-topo">
                <h2>{empresa.nome}</h2>
                <button className="btn btn-sec" onClick={() => setEditando(empresa)}><Pencil size={14} /> Editar</button>
              </div>
              <dl className="emp-lista">
                <dt>Telefone</dt>
                <dd>{empresa.telefone || '—'}</dd>
                <dt>Endereço</dt>
                <dd>{empresa.endereco || '—'}</dd>
                <dt>CPF/CNPJ</dt>
                <dd>{empresa.documento || '—'}</dd>
              </dl>
            </div>

            {regras && (
              <div className="painel">
                <div className="painel-topo">
                  <h2>Regras da agenda</h2>
                  <button className="btn btn-sec" onClick={() => setEditandoRegras(regras)}><Pencil size={14} /> Editar</button>
                </div>
                <dl className="emp-lista">
                  <dt>Desmarcar sem perder a aula</dt>
                  <dd>até {regras.antecedencia_desmarcacao_horas}h antes</dd>
                  <dt>Validade do crédito</dt>
                  <dd>{regras.validade_credito_dias} dias</dd>
                  <dt>Reposições por mês</dt>
                  <dd>{regras.limite_reposicoes_mes ?? 'sem limite'}</dd>
                </dl>
              </div>
            )}

            <div className="painel emp-largo">
              <div className="painel-topo">
                <h2>Feriados e recessos</h2>
                <button className="btn btn-sec" onClick={() => setNovoBloqueio({ data: hoje, fim: '', motivo: '', credito: true })}><Ban size={14} /> Bloquear datas</button>
              </div>
              {!bloqueios.length ? (
                <p className="emp-vazio">Nenhum feriado cadastrado. Nas datas bloqueadas as aulas são canceladas e os alunos recebem crédito de reposição.</p>
              ) : (
                <div className="tabela-scroll">
                  <table className="tabela">
                    <tbody>
                      {bloqueios.map(b => (
                        <tr key={b.id} className={(b.data_fim ?? b.data) < hoje ? 'inativo' : ''}>
                          <td style={{ whiteSpace: 'nowrap' }}><strong>{formatarData(b.data)}</strong>{b.data_fim && ` a ${formatarData(b.data_fim)}`}</td>
                          <td>{b.motivo}</td>
                          <td className="centro">
                            <button className="ui-icon-btn" title="Remover" onClick={() => removerBloqueio(b)}><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="painel emp-card">
              <div className="emp-card-topo">
                <h2>Avisos de vencimento</h2>
                <MessageCircle size={36} />
              </div>
              <div className="emp-toggles">
                <label className="ui-check"><input type="checkbox" checked={empresa.avisos_whatsapp} onChange={e => executar(() => salvarEmpresa({ avisos_whatsapp: e.target.checked }), 'Preferência salva.')} /> WhatsApp</label>
                <label className="ui-check"><input type="checkbox" checked={empresa.avisos_email} onChange={e => executar(() => salvarEmpresa({ avisos_email: e.target.checked }), 'Preferência salva.')} /> E-mail</label>
              </div>
              <p className="emp-vazio">Em breve: o envio automático ainda não está ativo. As preferências ficam salvas para quando for ligado.</p>
            </div>

            <div className="painel emp-card">
              <div className="emp-card-topo">
                <h2>Cadastro pelo link</h2>
                <Link2 size={36} />
              </div>
              <div className="emp-toggles">
                <label className="ui-check">
                  <input
                    type="checkbox"
                    checked={empresa.cadastro_link_ativo}
                    onChange={e => executar(() => salvarEmpresa({ cadastro_link_ativo: e.target.checked }), e.target.checked ? 'Link de cadastro ligado.' : 'Link de cadastro desligado.')}
                  />
                  Clientes podem se cadastrar pelo link
                </label>
              </div>
              <p className="emp-vazio">
                Quem preencher <strong>{origem}/cadastro</strong> entra direto como cliente ativo. Desligado, a página mostra &quot;cadastro fechado&quot;. Copie ou envie o link pela tela Clientes.
              </p>
            </div>

            <div className="painel emp-card">
              <div className="emp-card-topo">
                <h2>Gerenciar contratos</h2>
                <FileSignature size={36} />
              </div>
              <p className="emp-vazio">Em breve: modelos de contrato para os alunos assinarem.</p>
            </div>
          </div>
        )}
      </div>

      {editando && (
        <Modal
          aberto
          onFechar={() => setEditando(null)}
          titulo="Dados do estúdio"
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setEditando(null)}>Cancelar</button>
              <button
                className="btn ui-btn-azul"
                disabled={!editando.nome.trim()}
                onClick={async () => {
                  const ok = await executar(
                    () => salvarEmpresa({ nome: editando.nome.trim(), telefone: editando.telefone?.trim() || null, endereco: editando.endereco?.trim() || null, documento: editando.documento?.trim() || null }),
                    'Dados salvos.'
                  )
                  if (ok) setEditando(null)
                }}
              >
                Salvar
              </button>
            </>
          }
        >
          {([
            ['nome', 'Nome do estúdio'],
            ['telefone', 'Telefone'],
            ['endereco', 'Endereço'],
            ['documento', 'CPF/CNPJ']
          ] as [keyof Empresa, string][]).map(([k, r]) => (
            <div className="ui-campo" key={k}>
              <label className="label">{r}</label>
              <input className="input" value={(editando[k] as string) ?? ''} onChange={e => setEditando(x => (x ? { ...x, [k]: e.target.value } : x))} />
            </div>
          ))}
        </Modal>
      )}

      {editandoRegras && (
        <Modal
          aberto
          onFechar={() => setEditandoRegras(null)}
          titulo="Regras da agenda"
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setEditandoRegras(null)}>Cancelar</button>
              <button
                className="btn ui-btn-azul"
                onClick={async () => {
                  const ok = await executar(() => salvarConfiguracao(editandoRegras), 'Regras salvas.')
                  if (ok) setEditandoRegras(null)
                }}
              >
                Salvar
              </button>
            </>
          }
        >
          <div className="ui-campo">
            <label className="label">Antecedência mínima para desmarcar (horas)</label>
            <input className="input" type="number" min={0} step={0.5} value={editandoRegras.antecedencia_desmarcacao_horas} onChange={e => setEditandoRegras(x => x && { ...x, antecedencia_desmarcacao_horas: Number(e.target.value) })} />
          </div>
          <div className="ui-campo">
            <label className="label">Validade do crédito de reposição (dias)</label>
            <input className="input" type="number" min={1} value={editandoRegras.validade_credito_dias} onChange={e => setEditandoRegras(x => x && { ...x, validade_credito_dias: Number(e.target.value) })} />
          </div>
          <div className="ui-campo">
            <label className="label">Limite de reposições por mês</label>
            <input className="input" type="number" min={0} placeholder="Sem limite" value={editandoRegras.limite_reposicoes_mes ?? ''} onChange={e => setEditandoRegras(x => x && { ...x, limite_reposicoes_mes: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Quem desmarca dentro do prazo fica com falta justificada e ganha crédito; fora do prazo, conta como falta.</p>
        </Modal>
      )}

      {novoBloqueio && (
        <Modal
          aberto
          onFechar={() => setNovoBloqueio(null)}
          titulo="Bloquear datas"
          rodape={
            <>
              <button className="btn btn-sec" onClick={() => setNovoBloqueio(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                disabled={novoBloqueio.motivo.trim().length < 3 || (!!novoBloqueio.fim && novoBloqueio.fim < novoBloqueio.data)}
                onClick={async () => {
                  const ok = await confirmar({ titulo: 'Confirmar bloqueio?', mensagem: 'As aulas dessas datas serão canceladas.', confirmar: 'Bloquear', perigo: true })
                  if (!ok) return
                  const feito = await executar(
                    () => bloquear({ data: novoBloqueio.data, dataFim: novoBloqueio.fim || null, motivo: novoBloqueio.motivo, gerarCredito: novoBloqueio.credito }),
                    'Datas bloqueadas.'
                  )
                  if (feito) setNovoBloqueio(null)
                }}
              >
                Bloquear
              </button>
            </>
          }
        >
          <div className="ui-linha">
            <div className="ui-campo">
              <label className="label">De</label>
              <input className="input" type="date" value={novoBloqueio.data} onChange={e => setNovoBloqueio(x => x && { ...x, data: e.target.value })} />
            </div>
            <div className="ui-campo">
              <label className="label">Até (opcional)</label>
              <input className="input" type="date" min={novoBloqueio.data} value={novoBloqueio.fim} onChange={e => setNovoBloqueio(x => x && { ...x, fim: e.target.value })} />
            </div>
          </div>
          <div className="ui-campo">
            <label className="label">Motivo</label>
            <input className="input" value={novoBloqueio.motivo} onChange={e => setNovoBloqueio(x => x && { ...x, motivo: e.target.value })} placeholder="Ex.: Feriado de Finados" />
          </div>
          <label className="ui-check">
            <input type="checkbox" checked={novoBloqueio.credito} onChange={e => setNovoBloqueio(x => x && { ...x, credito: e.target.checked })} />
            Dar crédito de reposição aos alunos afetados
          </label>
        </Modal>
      )}
    </>
  )
}
