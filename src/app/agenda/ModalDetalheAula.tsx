'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, CircleDollarSign, CircleSlash, Pencil, Repeat, RotateCcw, Trash2, UserPlus, X } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { DIAS_SEMANA_CURTO, formatarData, formatarDataLonga, formatarHora, hojeEstudio, horaFim } from '@/lib/agenda/datas'
import { calcularDesmarcacao, ROTULO_STATUS } from '@/lib/agenda/regras'
import { carregarRecorrencia, desmarcar, excluirAulaCliente, marcarStatus, type EscopoAula } from '@/lib/agenda/servico'
import type { Agendamento, ConfiguracaoEstudio, Modalidade, Professor } from '@/lib/agenda/tipos'

/** Pergunta "Somente esta aula" / "Esta e as próximas". */
export function useEscopoAula() {
  const [titulo, setTitulo] = useState<string | null>(null)
  const [escolha, setEscolha] = useState<EscopoAula>('esta')
  const resolver = useRef<((v: EscopoAula | null) => void) | null>(null)

  const perguntar = useCallback((t: string) => {
    setEscolha('esta')
    setTitulo(t)
    return new Promise<EscopoAula | null>(r => {
      resolver.current = r
    })
  }, [])

  function responder(v: EscopoAula | null) {
    resolver.current?.(v)
    resolver.current = null
    setTitulo(null)
  }

  const elemento = (
    <Modal
      aberto={titulo !== null}
      titulo={titulo ?? ''}
      onFechar={() => responder(null)}
      largura={400}
      rodape={
        <>
          <button className="btn btn-sec" onClick={() => responder(null)}>Cancelar</button>
          <button className="btn ui-btn-azul" onClick={() => responder(escolha)} autoFocus>OK</button>
        </>
      }
    >
      <label className="ui-check" style={{ marginBottom: 12 }}>
        <input type="radio" name="escopo-aula" checked={escolha === 'esta'} onChange={() => setEscolha('esta')} />
        <span><strong>Somente esta aula</strong></span>
      </label>
      <label className="ui-check">
        <input type="radio" name="escopo-aula" checked={escolha === 'proximas'} onChange={() => setEscolha('proximas')} />
        <span>
          <strong>Esta e as próximas</strong>
          <br />
          <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>Aulas passadas ou já marcadas não mudam.</span>
        </span>
      </label>
    </Modal>
  )

  return { elemento, perguntar }
}

type Props = {
  agendamento: Agendamento
  professor: Professor | undefined
  servico: Modalidade | undefined
  configuracao: ConfiguracaoEstudio
  perguntarEscopo: (titulo: string) => Promise<EscopoAula | null>
  onEditar: () => void
  onFechar: () => void
  onAlterado: () => void
}

const COR_STATUS: Record<string, string> = {
  agendado: 'ui-chip-verde',
  presente: 'ui-chip-verde',
  falta: 'ui-chip-vermelho',
  falta_justificada: 'ui-chip-cinza',
  desmarcado: 'ui-chip-cinza',
  cancelado_estudio: 'ui-chip-cinza'
}

export default function ModalDetalheAula({ agendamento: a, professor, servico, configuracao, perguntarEscopo, onEditar, onFechar, onAlterado }: Props) {
  const { toast, confirmar } = useFeedback()
  const [salvando, setSalvando] = useState(false)
  const [diasSerie, setDiasSerie] = useState<number[] | null>(null)
  const [desmarcando, setDesmarcando] = useState(false)
  const [concederCredito, setConcederCredito] = useState(false)
  const hoje = hojeEstudio()

  useEffect(() => {
    if (a.recorrencia_id) carregarRecorrencia(a.recorrencia_id).then(r => setDiasSerie(r?.dias_semana ?? null)).catch(() => {})
  }, [a.recorrencia_id])

  const nome = a.aluno?.nome ?? a.experimental_nome ?? 'Sem nome'
  const atrasado = !!a.aluno?.vencimento && a.aluno.vencimento < hoje
  const previa = calcularDesmarcacao(a, Number(configuracao.antecedencia_desmarcacao_horas), undefined, concederCredito ? true : undefined)
  const podeCredito = a.tipo !== 'experimental' && a.tipo !== 'avulsa'

  async function acao(fn: () => Promise<unknown>, msg: string, desfazer?: () => Promise<unknown>) {
    setSalvando(true)
    try {
      await fn()
      toast(msg, 'sucesso', desfazer ? { rotulo: 'Desfazer', onClick: () => desfazer().then(onAlterado).catch(e => toast(mensagemDeErro(e), 'erro')) } : undefined)
      onAlterado()
      onFechar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const voltar = () => marcarStatus(a.id, 'agendado')

  async function excluir() {
    let escopo: EscopoAula = 'esta'
    if (a.recorrencia_id) {
      const r = await perguntarEscopo('Excluir aula recorrente')
      if (!r) return
      escopo = r
    } else {
      const ok = await confirmar({ titulo: 'Excluir esta aula?', mensagem: `${nome} · ${formatarData(a.data)} às ${formatarHora(a.hora)}`, confirmar: 'Excluir', perigo: true })
      if (!ok) return
    }
    acao(() => excluirAulaCliente(a.id, escopo), escopo === 'proximas' ? 'Aula e próximas excluídas.' : 'Aula excluída.')
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={
        a.aluno_id ? (
          <Link href={`/clientes/${a.aluno_id}`} className="agm-nome-link">{nome}</Link>
        ) : (
          nome
        )
      }
      subtitulo={`${formatarDataLonga(a.data)} · ${formatarHora(a.hora)} às ${horaFim(a.hora, a.duracao_min)}`}
      largura={480}
    >
      <div className="agm-det-faixa" style={{ background: a.cor ?? professor?.cor ?? '#98a2b3' }} />
      <div className="pe-linha" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <span className={`ui-chip ${COR_STATUS[a.status]}`}>{ROTULO_STATUS[a.status]}</span>
        {a.tipo === 'experimental' && <span className="ui-chip ui-chip-roxo">Não cadastrado / experimental</span>}
        {a.tipo === 'reposicao' && <span className="ui-chip ui-chip-laranja">Reposição</span>}
        {atrasado && (
          <span className="ui-chip ui-chip-vermelho"><CircleDollarSign size={12} /> Pagamento atrasado ({formatarData(a.aluno!.vencimento!)})</span>
        )}
      </div>

      <dl className="agm-det">
        <dt>Profissional</dt>
        <dd>
          <span className="cor-bolinha" style={{ background: professor?.cor ?? '#98a2b3', width: 12, height: 12, marginRight: 8, boxShadow: 'none' }} />
          {professor?.nome ?? 'Não definido'}
        </dd>
        <dt>Serviço</dt>
        <dd>{servico?.nome ?? '—'}</dd>
        {diasSerie && (
          <>
            <dt>Repete</dt>
            <dd><Repeat size={13} /> Toda {diasSerie.map(d => DIAS_SEMANA_CURTO[d - 1].toLowerCase()).join(', ')}</dd>
          </>
        )}
        {a.aluno && (
          <>
            <dt>Pacote</dt>
            <dd>{a.aluno.aulas_restantes} aula(s) restante(s)</dd>
          </>
        )}
        {a.observacao && (
          <>
            <dt>Observações</dt>
            <dd>{a.observacao}</dd>
          </>
        )}
        {a.cancelamento_motivo && (
          <>
            <dt>Motivo</dt>
            <dd>{a.cancelamento_motivo}</dd>
          </>
        )}
      </dl>

      {!desmarcando && (
        <div className="agm-acoes">
          {(a.status === 'agendado' || a.status === 'falta') && (
            <button className="btn btn-veio" disabled={salvando} onClick={() => acao(() => marcarStatus(a.id, 'presente'), `${nome}: presente.`, voltar)}>
              <Check size={15} /> Presente
            </button>
          )}
          {(a.status === 'agendado' || a.status === 'presente') && (
            <button className="btn btn-faltou" disabled={salvando} onClick={() => acao(() => marcarStatus(a.id, 'falta'), `${nome}: falta.`, voltar)}>
              <X size={15} /> Falta
            </button>
          )}
          {a.status === 'agendado' && (
            <button className="btn btn-sec" disabled={salvando} onClick={() => setDesmarcando(true)}>
              <CircleSlash size={15} /> Desmarcar
            </button>
          )}
          {a.status !== 'agendado' && (
            <button className="btn btn-sec" disabled={salvando} onClick={() => acao(voltar, 'Aula voltou para agendada.')}>
              <RotateCcw size={15} /> Voltar para agendada
            </button>
          )}
        </div>
      )}

      {desmarcando && (
        <div className="ui-alerta ui-alerta-aviso" style={{ display: 'block' }}>
          <p style={{ marginBottom: 6 }}>
            {previa.horasAntecedencia >= 0 ? `Faltam ${previa.horasAntecedencia.toLocaleString('pt-BR')}h para a aula` : 'A aula já começou'} (mínimo {configuracao.antecedencia_desmarcacao_horas}h).{' '}
            <strong>
              {previa.novoStatus === 'desmarcado' && 'A aula será desmarcada.'}
              {previa.novoStatus === 'falta_justificada' && 'Vira falta justificada e gera crédito de reposição.'}
              {previa.novoStatus === 'falta' && 'Fora do prazo: conta como falta (debita do pacote), sem crédito.'}
            </strong>
          </p>
          {podeCredito && !previa.dentroPrazo && (
            <label className="ui-check">
              <input type="checkbox" checked={concederCredito} onChange={e => setConcederCredito(e.target.checked)} />
              Conceder crédito mesmo assim (ex.: atestado)
            </label>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sec" onClick={() => setDesmarcando(false)}>Voltar</button>
            <button
              className="btn btn-danger"
              disabled={salvando}
              onClick={() => acao(() => desmarcar(a.id, { gerarCredito: concederCredito ? true : null }), `${nome}: desmarcado.`, voltar)}
            >
              Confirmar desmarcação
            </button>
          </div>
        </div>
      )}

      <div className="agm-acoes agm-acoes-rodape">
        <button className="btn btn-sec" onClick={onEditar} disabled={salvando}>
          <Pencil size={15} /> Editar
        </button>
        {a.status !== 'presente' && a.status !== 'falta' && a.status !== 'falta_justificada' && (
          <button className="btn btn-sec" onClick={excluir} disabled={salvando} style={{ color: 'var(--state-danger-dark)' }}>
            <Trash2 size={15} /> Excluir
          </button>
        )}
        {a.tipo === 'experimental' && !a.aluno_convertido_id && (
          <Link
            className="btn ui-btn-laranja"
            style={{ textDecoration: 'none' }}
            href={`/clientes?experimental=${a.id}&nome=${encodeURIComponent(a.experimental_nome ?? '')}&telefone=${encodeURIComponent(a.experimental_telefone ?? '')}`}
          >
            <UserPlus size={15} /> Cadastrar como cliente
          </Link>
        )}
      </div>
    </Modal>
  )
}
