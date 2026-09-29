'use client'

import { useEffect, useState } from 'react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { SeletorAluno } from '@/app/agenda/componentes/Seletores'
import { formatarData, hojeEstudio } from '@/lib/agenda/datas'
import type { AlunoResumo } from '@/lib/agenda/tipos'
import { formatarMoeda, mesesSugeridos, proximoVencimento, ROTULO_FORMA } from '@/lib/gestao/regras'
import { carregarCliente, editarPagamento, listarPlanos, registrarPagamento } from '@/lib/gestao/servico'
import type { Cliente, FormaPagamento, Pagamento, Plano, Profissional, Servico } from '@/lib/gestao/tipos'

type Props = {
  pagamento?: Pagamento | null // editar
  clienteInicial?: Cliente | null
  profissionais: Profissional[]
  servicos: Servico[]
  onFechar: () => void
  onSalvo: () => void
}

export default function ModalPagamento({ pagamento, clienteInicial, profissionais, servicos, onFechar, onSalvo }: Props) {
  const { toast } = useFeedback()
  const editando = !!pagamento
  const [data, setData] = useState(pagamento?.data ?? hojeEstudio())
  const [valor, setValor] = useState<number | ''>(pagamento?.valor ?? '')
  const [forma, setForma] = useState<FormaPagamento>(pagamento?.forma ?? 'pix')
  const [aluno, setAluno] = useState<AlunoResumo | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(clienteInicial ?? null)
  const [profissionalId, setProfissionalId] = useState(pagamento?.profissional_id ?? clienteInicial?.professor_id ?? '')
  const [servicoId, setServicoId] = useState(pagamento?.servico_id ?? servicos.find(s => s.ativo && /pilates/i.test(s.nome))?.id ?? '')
  const [descricao, setDescricao] = useState(pagamento?.descricao ?? '')
  const [avancar, setAvancar] = useState(!editando)
  const [meses, setMeses] = useState(1)
  const [mesesManual, setMesesManual] = useState(false)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarPlanos().then(setPlanos).catch(() => {})
  }, [])

  // cliente do pagamento em edicao
  useEffect(() => {
    if (pagamento?.aluno_id && !cliente) carregarCliente(pagamento.aluno_id).then(setCliente).catch(() => {})
  }, [pagamento, cliente])

  // ao escolher um aluno na busca, carrega plano/vencimento
  useEffect(() => {
    if (!aluno) return
    carregarCliente(aluno.id)
      .then(c => {
        setCliente(c)
        if (c?.professor_id && !profissionalId) setProfissionalId(c.professor_id)
      })
      .catch(() => {})
  }, [aluno]) // eslint-disable-line react-hooks/exhaustive-deps

  const plano = cliente?.plano_id ? planos.find(p => p.id === cliente.plano_id) : undefined
  const precoMensal = plano?.preco_mensal ?? cliente?.valor_plano ?? null

  useEffect(() => {
    if (!mesesManual) setMeses(mesesSugeridos(Number(valor || 0), precoMensal))
  }, [valor, precoMensal, mesesManual])

  const novoVencimento = cliente ? proximoVencimento(cliente.vencimento, data, meses) : null

  async function salvar() {
    setSalvando(true)
    try {
      const base = {
        data,
        valor: Number(valor),
        forma,
        alunoId: cliente?.id ?? null,
        profissionalId: profissionalId || null,
        servicoId: servicoId || null,
        descricao
      }
      if (editando) {
        await editarPagamento(pagamento!.id, base)
        toast('Pagamento atualizado.')
      } else {
        await registrarPagamento({ ...base, avancarMeses: cliente && avancar ? meses : 0 })
        toast(cliente && avancar && novoVencimento ? `Pagamento registrado. Novo vencimento: ${formatarData(novoVencimento)}.` : 'Pagamento registrado.')
      }
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
      titulo={editando ? 'Editar pagamento' : 'Novo pagamento'}
      largura={560}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn ui-btn-azul" disabled={salvando || !(Number(valor) > 0) || !data} onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Cliente</label>
        {cliente && (clienteInicial || editando) ? (
          <div className="ui-alerta ui-alerta-info" style={{ marginBottom: 0 }}>
            <strong>{cliente.nome}</strong>
            {plano && <span>· {plano.nome}</span>}
          </div>
        ) : (
          <SeletorAluno
            selecionado={aluno}
            onSelecionar={a => {
              setAluno(a)
              if (!a) setCliente(null)
            }}
          />
        )}
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Data</label>
          <input className="input" type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Valor (R$)</label>
          <input className="input" type="number" min={0} step="0.01" value={valor} onChange={e => setValor(e.target.value === '' ? '' : Number(e.target.value))} placeholder={precoMensal ? String(precoMensal) : '0,00'} />
        </div>
        <div className="ui-campo">
          <label className="label">Forma de pagamento</label>
          <select className="ui-select" value={forma} onChange={e => setForma(e.target.value as FormaPagamento)}>
            {Object.entries(ROTULO_FORMA).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Profissional</label>
          <select className="ui-select" value={profissionalId} onChange={e => setProfissionalId(e.target.value)}>
            <option value="">Nenhum</option>
            {profissionais.filter(p => p.ativo || p.id === profissionalId).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label className="label">Serviço</label>
          <select className="ui-select" value={servicoId} onChange={e => setServicoId(e.target.value)}>
            <option value="">Nenhum</option>
            {servicos.filter(s => s.ativo || s.id === servicoId).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      </div>
      <div className="ui-campo">
        <label className="label">Descrição</label>
        <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: mensalidade de outubro" />
      </div>

      {!editando && cliente && (
        <div className="ui-alerta ui-alerta-info" style={{ display: 'block' }}>
          <label className="ui-check" style={{ marginBottom: 6 }}>
            <input type="checkbox" checked={avancar} onChange={e => setAvancar(e.target.checked)} />
            <span>
              Avançar o vencimento em{' '}
              <input
                type="number"
                min={1}
                max={24}
                value={meses}
                disabled={!avancar}
                onChange={e => {
                  setMesesManual(true)
                  setMeses(Math.max(1, Number(e.target.value) || 1))
                }}
                style={{ width: 56, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--line-strong)' }}
              />{' '}
              mês(es)
            </span>
          </label>
          <div style={{ fontSize: 13 }}>
            Vencimento atual: <b>{cliente.vencimento ? formatarData(cliente.vencimento) : 'não definido'}</b>
            {avancar && novoVencimento && <> → novo: <b>{formatarData(novoVencimento)}</b></>}
            {precoMensal ? <> · plano {formatarMoeda(precoMensal)}/mês</> : null}
          </div>
        </div>
      )}
      {editando && pagamento?.meses_vencimento ? (
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>
          Este pagamento avançou o vencimento em {pagamento.meses_vencimento} mês(es). Editar não altera o vencimento; para desfazer, exclua o pagamento.
        </p>
      ) : null}
    </Modal>
  )
}
