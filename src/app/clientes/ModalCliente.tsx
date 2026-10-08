'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { frequenciaDoPlano } from '@/lib/agenda/regras'
import { buscarCep, COMO_CONHECEU, cpfValido, emailValido, formatarCep, formatarCpf, formatarTelefone, UFS } from '@/lib/cadastro'
import { salvarCliente, type DadosCliente } from '@/lib/gestao/servico'
import type { Cliente, Plano, Profissional } from '@/lib/gestao/tipos'

type Props = {
  cliente: Partial<Cliente> | null // null = novo
  planos: Plano[]
  profissionais: Profissional[]
  sugestoesEtiquetas: string[]
  onFechar: () => void
  onSalvo: (id: string) => void
}

export default function ModalCliente({ cliente, planos, profissionais, sugestoesEtiquetas, onFechar, onSalvo }: Props) {
  const { toast } = useFeedback()
  const novo = !cliente?.id
  const [c, setC] = useState<Partial<Cliente>>({ ativo: true, etiquetas: [], ...cliente, cpf: formatarCpf(cliente?.cpf), cep: formatarCep(cliente?.cep) })
  const [etiqueta, setEtiqueta] = useState('')
  const [pacote, setPacote] = useState<number | ''>('')
  const [salvando, setSalvando] = useState(false)
  const set = <K extends keyof Cliente>(k: K, v: Cliente[K] | null) => setC(x => ({ ...x, [k]: v }))

  function adicionarEtiqueta(t: string) {
    const v = t.trim()
    if (!v) return
    if (!(c.etiquetas ?? []).some(e => e.toLowerCase() === v.toLowerCase())) set('etiquetas', [...(c.etiquetas ?? []), v])
    setEtiqueta('')
  }

  async function aoMudarCep(valor: string) {
    const cep = formatarCep(valor)
    set('cep', cep)
    if (cep.replace(/D/g, '').length !== 8) return
    const end = await buscarCep(cep)
    if (end) setC(x => ({ ...x, logradouro: end.logradouro || x.logradouro, bairro: end.bairro || x.bairro, cidade: end.cidade || x.cidade, uf: end.uf || x.uf }))
  }

  async function salvar() {
    if (c.cpf && !cpfValido(c.cpf)) return toast('CPF inválido.', 'erro')
    if (c.email?.trim() && !emailValido(c.email)) return toast('E-mail inválido.', 'erro')
    setSalvando(true)
    try {
      const plano = planos.find(p => p.id === c.plano_id)
      const dados: DadosCliente = {
        nome: c.nome ?? '',
        telefone: c.telefone ?? null,
        data_nascimento: c.data_nascimento ?? null,
        plano_id: c.plano_id ?? null,
        // o texto antigo do plano continua preenchido para as telas legadas
        plano: plano?.nome ?? c.plano ?? null,
        frequencia_semanal: plano?.aulas_semana ?? c.frequencia_semanal ?? frequenciaDoPlano(c.plano),
        valor_plano: plano?.preco_mensal ?? c.valor_plano ?? 0,
        professor_id: c.professor_id ?? null,
        vencimento: c.vencimento ?? null,
        etiquetas: etiqueta.trim() ? [...(c.etiquetas ?? []), etiqueta.trim()] : c.etiquetas ?? [],
        observacoes: c.observacoes ?? null,
        cpf: c.cpf ?? null,
        email: c.email ?? null,
        cep: c.cep ?? null,
        logradouro: c.logradouro ?? null,
        numero: c.numero ?? null,
        complemento: c.complemento ?? null,
        bairro: c.bairro ?? null,
        cidade: c.cidade ?? null,
        uf: c.uf ?? null,
        profissao: c.profissao ?? null,
        como_conheceu: c.como_conheceu ?? null,
        objetivo: c.objetivo ?? null,
        saude: c.saude ?? null,
        // completou o cadastro feito pelo link: sai do aviso de "novos cadastros"
        ...(c.cadastrado_por === 'autocadastro' && !c.autocadastro_visto_em ? { autocadastro_visto_em: new Date().toISOString() } : {}),
        ativo: c.ativo ?? true
      }
      if (novo && pacote !== '') {
        dados.total_aulas = pacote
        dados.aulas_restantes = pacote
      }
      const id = await salvarCliente(c.id ?? null, dados)
      toast(novo ? 'Cliente cadastrado.' : 'Cliente atualizado.')
      onSalvo(id)
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const sugestoes = sugestoesEtiquetas.filter(s => !(c.etiquetas ?? []).includes(s) && s.toLowerCase().includes(etiqueta.toLowerCase())).slice(0, 6)

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={novo ? 'Novo cliente' : 'Editar cliente'}
      largura={600}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || !c.nome?.trim()} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Nome</label>
        <input className="input" value={c.nome ?? ''} onChange={e => set('nome', e.target.value)} autoFocus />
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Telefone / WhatsApp</label>
          <input className="input" inputMode="tel" value={c.telefone ?? ''} onChange={e => set('telefone', formatarTelefone(e.target.value))} placeholder="(31) 99999-0000" />
        </div>
        <div className="ui-campo">
          <label className="label">Aniversário (nascimento)</label>
          <input className="input" type="date" value={c.data_nascimento ?? ''} onChange={e => set('data_nascimento', e.target.value)} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">CPF</label>
          <input className="input" inputMode="numeric" value={c.cpf ?? ''} onChange={e => set('cpf', formatarCpf(e.target.value))} placeholder="000.000.000-00" />
        </div>
        <div className="ui-campo">
          <label className="label">E-mail</label>
          <input className="input" type="email" value={c.email ?? ''} onChange={e => set('email', e.target.value)} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Plano</label>
          <select className="ui-select" value={c.plano_id ?? ''} onChange={e => set('plano_id', e.target.value || null)}>
            <option value="">{c.plano && !c.plano_id ? `Sem plano cadastrado (${c.plano})` : 'Sem plano'}</option>
            {planos.filter(p => p.ativo || p.id === c.plano_id).map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div className="ui-campo">
          <label className="label">Vencimento do pagamento</label>
          <input className="input" type="date" value={c.vencimento ?? ''} onChange={e => set('vencimento', e.target.value)} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Profissional responsável</label>
          <select className="ui-select" value={c.professor_id ?? ''} onChange={e => set('professor_id', e.target.value || null)}>
            <option value="">Nenhum</option>
            {profissionais.filter(p => p.ativo || p.id === c.professor_id).map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        {novo && (
          <div className="ui-campo">
            <label className="label">Aulas no pacote (opcional)</label>
            <input className="input" type="number" min={0} value={pacote} onChange={e => setPacote(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Ex.: 8" />
          </div>
        )}
      </div>
      <div className="ui-campo">
        <label className="label">Etiquetas</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {(c.etiquetas ?? []).map(t => (
            <span key={t} className="etiqueta tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {t}
              <button type="button" onClick={() => set('etiquetas', (c.etiquetas ?? []).filter(x => x !== t))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex' }} aria-label={`Remover ${t}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <input
          className="input"
          value={etiqueta}
          onChange={e => setEtiqueta(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              adicionarEtiqueta(etiqueta)
            }
          }}
          placeholder="Digite e tecle Enter (ex.: gestante, coluna, manhã)"
        />
        {sugestoes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {sugestoes.map(s => (
              <button key={s} type="button" className="ui-chip" style={{ cursor: 'pointer' }} onClick={() => adicionarEtiqueta(s)}>+ {s}</button>
            ))}
          </div>
        )}
      </div>
      <div className="ui-campo">
        <label className="label">Observações</label>
        <textarea className="ui-textarea" value={c.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} placeholder="Restrições, histórico de lesões, preferências..." />
      </div>
      <h3 className="cli-secao">Endereço</h3>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">CEP</label>
          <input className="input" inputMode="numeric" value={c.cep ?? ''} onChange={e => aoMudarCep(e.target.value)} placeholder="00000-000" />
        </div>
        <div className="ui-campo">
          <label className="label">Número</label>
          <input className="input" value={c.numero ?? ''} onChange={e => set('numero', e.target.value)} />
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Rua</label>
        <input className="input" value={c.logradouro ?? ''} onChange={e => set('logradouro', e.target.value)} />
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Complemento</label>
          <input className="input" value={c.complemento ?? ''} onChange={e => set('complemento', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Bairro</label>
          <input className="input" value={c.bairro ?? ''} onChange={e => set('bairro', e.target.value)} />
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Cidade</label>
          <input className="input" value={c.cidade ?? ''} onChange={e => set('cidade', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Estado</label>
          <select className="ui-select" value={c.uf ?? ''} onChange={e => set('uf', e.target.value || null)}>
            <option value="">UF</option>
            {UFS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <h3 className="cli-secao">Sobre o cliente</h3>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Profissão</label>
          <input className="input" value={c.profissao ?? ''} onChange={e => set('profissao', e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Como conheceu</label>
          <select className="ui-select" value={c.como_conheceu ?? ''} onChange={e => set('como_conheceu', e.target.value || null)}>
            <option value="">—</option>
            {[...COMO_CONHECEU, ...(c.como_conheceu && !COMO_CONHECEU.includes(c.como_conheceu) ? [c.como_conheceu] : [])].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Objetivo com o pilates</label>
        <textarea className="ui-textarea" value={c.objetivo ?? ''} onChange={e => set('objetivo', e.target.value)} />
      </div>
      <div className="ui-campo">
        <label className="label">Saúde (lesões, cirurgias, dores, gestação, restrições)</label>
        <textarea className="ui-textarea" value={c.saude ?? ''} onChange={e => set('saude', e.target.value)} />
      </div>

      {!novo && (
        <label className="ui-check">
          <input type="checkbox" checked={c.ativo ?? true} onChange={e => set('ativo', e.target.checked)} />
          Cliente ativo
        </label>
      )}
    </Modal>
  )
}
