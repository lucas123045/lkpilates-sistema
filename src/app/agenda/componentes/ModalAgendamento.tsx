'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Check, CircleSlash, Info, RotateCcw, UserPlus, X } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { formatarData, formatarDataLonga, formatarHora } from '@/lib/agenda/datas'
import { calcularDesmarcacao, DESCRICAO_ORIGEM_PROFESSOR, ROTULO_STATUS, ROTULO_TIPO } from '@/lib/agenda/regras'
import { desmarcar, ErroAgenda, marcarStatus, remarcar, salvarObservacao, trocarProfessor } from '@/lib/agenda/servico'
import type { Agendamento, ConfiguracaoEstudio, Professor } from '@/lib/agenda/tipos'
import { nomePessoa } from '../util'
import { EtiquetaProfessor } from './Professores'
import { SeletorHorario } from './Seletores'

type Aba = 'presenca' | 'desmarcar' | 'remarcar' | 'professor' | 'obs'

type Props = {
  agendamento: Agendamento | null
  professores: Professor[]
  configuracao: ConfiguracaoEstudio
  onFechar: () => void
  onAlterado: () => void
}

export default function ModalAgendamento({ agendamento: a, professores, configuracao, onFechar, onAlterado }: Props) {
  const { toast, confirmar } = useFeedback()
  const [aba, setAba] = useState<Aba>('presenca')
  const [salvando, setSalvando] = useState(false)
  const [obs, setObs] = useState('')
  const [motivo, setMotivo] = useState('')
  const [concederCredito, setConcederCredito] = useState(false)
  const [destino, setDestino] = useState<{ data: string; horarioId: string; lotado: boolean } | null>(null)
  const [encaixe, setEncaixe] = useState(false)
  const [novoProf, setNovoProf] = useState('')
  const [escopo, setEscopo] = useState<'dia' | 'permanente'>('dia')

  useEffect(() => {
    if (!a) return
    setAba('presenca')
    setObs(a.observacao ?? '')
    setMotivo('')
    setConcederCredito(false)
    setDestino(null)
    setEncaixe(false)
    setNovoProf(a.professor_id ?? '')
    setEscopo('dia')
  }, [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return null

  const nome = nomePessoa(a)
  const agendado = a.status === 'agendado'
  const prof = professores.find(p => p.id === a.professor_id)
  const previa = calcularDesmarcacao(a, Number(configuracao.antecedencia_desmarcacao_horas), undefined, concederCredito ? true : undefined)
  const podeCredito = a.tipo === 'fixo' || a.tipo === 'reposicao'

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setSalvando(true)
    try {
      await acao()
      toast(sucesso)
      onAlterado()
      onFechar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function mudarStatus(status: 'agendado' | 'presente' | 'falta' | 'falta_justificada') {
    if (status === 'agendado') {
      const ok = await confirmar({
        titulo: 'Desfazer marcação?',
        mensagem: `${nome} volta para "agendado". O registro de presença/falta é desfeito e o pacote é corrigido. Créditos gerados por esta falta são cancelados.`,
        confirmar: 'Desfazer'
      })
      if (!ok) return
    }
    await executar(() => marcarStatus(a!.id, status), `${nome}: ${ROTULO_STATUS[status].toLowerCase()}.`)
  }

  async function confirmarDesmarcacao() {
    const ok = await confirmar({
      titulo: `Desmarcar ${nome}?`,
      mensagem:
        previa.novoStatus === 'desmarcado'
          ? 'A vaga fica livre.'
          : previa.geraCredito
            ? `Vai virar falta justificada e gerar um crédito de reposição válido por ${configuracao.validade_credito_dias} dias.`
            : 'Fora do prazo: vai contar como FALTA (debita do pacote) e não gera crédito.',
      confirmar: 'Desmarcar',
      perigo: !previa.geraCredito && previa.novoStatus !== 'desmarcado'
    })
    if (!ok) return
    setSalvando(true)
    try {
      const r = await desmarcar(a!.id, { gerarCredito: concederCredito ? true : null, motivo })
      toast(r.credito_id ? `${nome} desmarcado. Crédito de reposição gerado.` : `${nome} desmarcado.`)
      if (r.lista_espera > 0) toast(`Vaga liberada: ${r.lista_espera} pessoa(s) na lista de espera deste horário.`, 'aviso')
      onAlterado()
      onFechar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarRemarcacao() {
    if (!destino) return
    setSalvando(true)
    try {
      await remarcar(a!.id, destino.horarioId, destino.data, encaixe)
      toast(`${nome} remarcado para ${formatarData(destino.data)}.`)
      onAlterado()
      onFechar()
    } catch (e) {
      if (e instanceof ErroAgenda && e.codigo === 'LOTADO') {
        toast('Horário lotado. Marque "encaixar mesmo assim" para confirmar.', 'aviso')
      } else toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const abas: [Aba, string, boolean][] = [
    ['presenca', 'Presença', true],
    ['desmarcar', 'Desmarcar', agendado],
    ['remarcar', 'Remarcar', agendado],
    ['professor', 'Professor', a.status !== 'desmarcado' && a.status !== 'cancelado_estudio'],
    ['obs', 'Observação', true]
  ]

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={nome}
      subtitulo={`${formatarDataLonga(a.data)} às ${formatarHora(a.hora)} · ${ROTULO_TIPO[a.tipo]} · ${ROTULO_STATUS[a.status]}`}
      largura={560}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <span className="ui-chip">
          <EtiquetaProfessor professor={prof} origem={a.professor_origem} />
        </span>
        {a.professor_origem && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>({DESCRICAO_ORIGEM_PROFESSOR[a.professor_origem]})</span>}
        {a.aluno_id && (
          <Link href={`/alunos/${a.aluno_id}`} className="btn btn-sec btn-sm" style={{ marginLeft: 'auto', textDecoration: 'none' }}>
            Ficha / horários fixos
          </Link>
        )}
      </div>

      {a.aluno && !a.aluno.ativo && (
        <div className="ui-alerta ui-alerta-aviso">
          <AlertTriangle size={16} /> Aluno inativo no cadastro.
        </div>
      )}
      {a.cancelamento_motivo && (
        <div className="ui-alerta ui-alerta-info">
          <Info size={16} /> Motivo: {a.cancelamento_motivo}
        </div>
      )}

      <div className="ui-segmentos" style={{ marginBottom: 16 }}>
        {abas
          .filter(([, , visivel]) => visivel)
          .map(([id, rotulo]) => (
            <button key={id} className={aba === id ? 'ativo' : ''} onClick={() => setAba(id)}>
              {rotulo}
            </button>
          ))}
      </div>

      {aba === 'presenca' && (
        <>
          {(a.status === 'desmarcado' || a.status === 'cancelado_estudio') ? (
            <p>
              Este agendamento está {ROTULO_STATUS[a.status].toLowerCase()}.{' '}
              {a.status === 'desmarcado' && 'Você pode reativá-lo se houver vaga.'}
            </p>
          ) : (
            <div className="ag-acoes-grade">
              <button className="btn btn-veio" disabled={salvando || a.status === 'presente'} onClick={() => mudarStatus('presente')}>
                <Check size={15} /> Presente
              </button>
              <button className="btn btn-faltou" disabled={salvando || a.status === 'falta'} onClick={() => mudarStatus('falta')}>
                <X size={15} /> Falta
              </button>
              {podeCredito && (
                <button className="btn btn-reposicao" disabled={salvando || a.status === 'falta_justificada'} onClick={() => mudarStatus('falta_justificada')}>
                  <CircleSlash size={15} /> Falta justificada
                </button>
              )}
            </div>
          )}
          {a.status !== 'agendado' && a.status !== 'cancelado_estudio' && (
            <button className="btn btn-sec" style={{ marginTop: 12 }} disabled={salvando} onClick={() => mudarStatus('agendado')}>
              <RotateCcw size={15} /> Voltar para agendado
            </button>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 12 }}>
            Presença e falta debitam do pacote (como em Aulas). Falta justificada não debita e gera crédito de reposição.
            {a.tipo === 'avulsa' && ' Aula avulsa não debita do pacote.'}
            {a.tipo === 'experimental' && ' Aula experimental não tem pacote.'}
          </p>

          {a.tipo === 'experimental' && (
            <div style={{ marginTop: 14 }}>
              {a.experimental_telefone && <p>Telefone: {a.experimental_telefone}</p>}
              {a.aluno_convertido_id ? (
                <div className="ui-alerta ui-alerta-ok" style={{ marginTop: 8 }}>
                  <Check size={16} /> Já convertida em aluno.
                </div>
              ) : (
                <Link
                  className="btn ui-btn-laranja"
                  style={{ marginTop: 8, textDecoration: 'none' }}
                  href={`/alunos?experimental=${a.id}&nome=${encodeURIComponent(a.experimental_nome ?? '')}&telefone=${encodeURIComponent(a.experimental_telefone ?? '')}`}
                >
                  <UserPlus size={15} /> Converter em aluno
                </Link>
              )}
            </div>
          )}
        </>
      )}

      {aba === 'desmarcar' && agendado && (
        <>
          <div className={`ui-alerta ${previa.geraCredito || previa.novoStatus === 'desmarcado' ? 'ui-alerta-ok' : 'ui-alerta-aviso'}`}>
            <Info size={16} />
            <div>
              {previa.horasAntecedencia >= 0
                ? `Faltam ${previa.horasAntecedencia.toLocaleString('pt-BR')}h para a aula`
                : 'A aula já começou/passou'}{' '}
              (antecedência mínima: {configuracao.antecedencia_desmarcacao_horas}h).
              <br />
              {previa.novoStatus === 'desmarcado' && 'A vaga será liberada.'}
              {previa.novoStatus === 'falta_justificada' && <strong>Vira falta justificada e gera crédito de reposição.</strong>}
              {previa.novoStatus === 'falta' && <strong>Fora do prazo: conta como falta (debita do pacote) e não gera crédito.</strong>}
            </div>
          </div>
          {podeCredito && !previa.dentroPrazo && (
            <label className="ui-check">
              <input type="checkbox" checked={concederCredito} onChange={e => setConcederCredito(e.target.checked)} />
              Conceder crédito mesmo fora do prazo (ex.: atestado médico)
            </label>
          )}
          <div className="ui-campo">
            <label className="label">Motivo (opcional)</label>
            <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: avisou pelo WhatsApp" />
          </div>
          <button className="btn btn-danger" disabled={salvando} onClick={confirmarDesmarcacao}>
            Desmarcar
          </button>
        </>
      )}

      {aba === 'remarcar' && agendado && (
        <>
          <SeletorHorario
            dataInicial={a.data}
            horarioSelecionado={destino}
            onSelecionar={s => {
              setDestino(s)
              setEncaixe(false)
            }}
            ignorarHorarioId={a.horario_id ? { data: a.data, horarioId: a.horario_id } : undefined}
          />
          {destino?.lotado && (
            <label className="ui-check" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={encaixe} onChange={e => setEncaixe(e.target.checked)} />
              Horário lotado — encaixar mesmo assim
            </label>
          )}
          {a.tipo === 'fixo' && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 10 }}>
              A aula fixa desta data fica como desmarcada e a nova entra como reposição (sem consumir crédito).
            </p>
          )}
          <button
            className="btn ui-btn-azul"
            style={{ marginTop: 12 }}
            disabled={salvando || !destino || (destino.lotado && !encaixe)}
            onClick={confirmarRemarcacao}
          >
            <CalendarClock size={15} /> Remarcar
          </button>
        </>
      )}

      {aba === 'professor' && (
        <>
          <div className="ui-campo">
            <label className="label">Professor</label>
            <select className="ui-select" value={novoProf} onChange={e => setNovoProf(e.target.value)}>
              <option value="">Sem professor</option>
              {professores
                .filter(p => p.ativo || p.id === a.professor_id)
                .map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
          </div>
          <label className="ui-check">
            <input type="radio" name="escopo" checked={escopo === 'dia'} onChange={() => setEscopo('dia')} />
            Só nesta aula ({formatarData(a.data)})
          </label>
          {a.aluno_id && a.tipo === 'fixo' && (
            <label className="ui-check">
              <input type="radio" name="escopo" checked={escopo === 'permanente'} onChange={() => setEscopo('permanente')} />
              Sempre neste horário (professor responsável por {nome} nesta turma, a partir de agora)
            </label>
          )}
          <button
            className="btn ui-btn-azul"
            disabled={salvando}
            onClick={() =>
              executar(
                () => trocarProfessor({ professorId: novoProf || null, escopo, agendamentoId: a.id }),
                'Professor atualizado.'
              )
            }
          >
            Salvar professor
          </button>
        </>
      )}

      {aba === 'obs' && (
        <>
          <div className="ui-campo">
            <label className="label">Observação desta aula</label>
            <textarea className="ui-textarea" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: dor no ombro, evitar exercícios acima da cabeça" />
          </div>
          <button className="btn ui-btn-azul" disabled={salvando} onClick={() => executar(() => salvarObservacao(a.id, obs), 'Observação salva.')}>
            Salvar observação
          </button>
        </>
      )}
    </Modal>
  )
}
