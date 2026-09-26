'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Hourglass, Info, UserPlus } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { diferencaDias, formatarData, formatarDataLonga, formatarHora, hojeEstudio } from '@/lib/agenda/datas'
import { agendar, entrarListaEspera, ErroAgenda, verificarAgendamento } from '@/lib/agenda/servico'
import type { AlunoResumo, Horario, TipoAgendamento, VerificacaoAgendamento } from '@/lib/agenda/tipos'
import { SeletorAluno } from './Seletores'

type TipoNovo = Exclude<TipoAgendamento, 'fixo'>

type Props = {
  turma: { horario: Horario; data: string } | null
  onFechar: () => void
  onAlterado: () => void
}

export default function ModalAdicionar({ turma, onFechar, onAlterado }: Props) {
  const { toast, confirmar } = useFeedback()
  const [tipo, setTipo] = useState<TipoNovo>('reposicao')
  const [aluno, setAluno] = useState<AlunoResumo | null>(null)
  const [nomeExp, setNomeExp] = useState('')
  const [telExp, setTelExp] = useState('')
  const [obs, setObs] = useState('')
  const [verif, setVerif] = useState<VerificacaoAgendamento | null>(null)
  const [creditoId, setCreditoId] = useState<string>('')
  const [encaixe, setEncaixe] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setTipo('reposicao')
    setAluno(null)
    setNomeExp('')
    setTelExp('')
    setObs('')
    setVerif(null)
    setEncaixe(false)
  }, [turma?.horario.id, turma?.data])

  // Verifica vagas/alertas sempre que muda o aluno (ou ao abrir, para experimental)
  useEffect(() => {
    if (!turma) return
    const alunoId = tipo === 'experimental' ? null : aluno?.id ?? null
    if (tipo !== 'experimental' && !alunoId) {
      setVerif(null)
      return
    }
    let vivo = true
    verificarAgendamento(alunoId, turma.horario.id, turma.data)
      .then(v => {
        if (!vivo) return
        setVerif(v)
        setCreditoId(v.creditos[0]?.id ?? '')
      })
      .catch(e => vivo && toast(mensagemDeErro(e), 'erro'))
    return () => {
      vivo = false
    }
  }, [turma, aluno?.id, tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!turma) return null
  const hoje = hojeEstudio()
  const semCredito = tipo === 'reposicao' && verif && !verif.creditos.length
  const creditosServem = verif?.creditos.filter(c => c.expira_em >= turma.data) ?? []

  async function salvar(forcar = encaixe) {
    setSalvando(true)
    try {
      await agendar({
        alunoId: tipo === 'experimental' ? null : aluno?.id,
        horarioId: turma!.horario.id,
        data: turma!.data,
        tipo,
        creditoId: tipo === 'reposicao' ? creditoId || null : null,
        experimentalNome: nomeExp,
        experimentalTelefone: telExp,
        observacao: obs,
        forcarEncaixe: forcar
      })
      toast(`${tipo === 'experimental' ? nomeExp : aluno?.nome} agendado(a).`)
      onAlterado()
      onFechar()
    } catch (e) {
      if (e instanceof ErroAgenda && e.codigo === 'LOTADO') {
        const ok = await confirmar({
          titulo: 'Horário lotado',
          mensagem: 'Quer encaixar mesmo assim? A turma vai ficar acima da capacidade.',
          confirmar: 'Encaixar'
        })
        if (ok) return salvar(true)
      } else {
        toast(mensagemDeErro(e), 'erro')
      }
    } finally {
      setSalvando(false)
    }
  }

  async function colocarNaEspera() {
    if (!aluno) return
    setSalvando(true)
    try {
      await entrarListaEspera(aluno.id, turma!.horario.id, turma!.data, obs)
      toast(`${aluno.nome} entrou na lista de espera.`)
      onAlterado()
      onFechar()
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  const podeSalvar =
    !salvando &&
    !!verif &&
    !verif.bloqueio &&
    !verif.conflito &&
    !verif.ja_agendado &&
    !verif.dia_invalido &&
    (tipo === 'experimental' ? nomeExp.trim().length > 1 : !!aluno) &&
    (tipo !== 'reposicao' || creditosServem.length > 0) &&
    (!verif.lotado || encaixe)

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Adicionar à aula"
      subtitulo={`${formatarDataLonga(turma.data)} às ${formatarHora(turma.horario.hora_inicio)}`}
      rodape={
        <>
          {verif?.lotado && aluno && tipo !== 'experimental' && (
            <button className="btn btn-sec" onClick={colocarNaEspera} disabled={salvando}>
              <Hourglass size={15} /> Lista de espera
            </button>
          )}
          <button className="btn btn-sec" onClick={onFechar}>
            Cancelar
          </button>
          <button className="btn ui-btn-azul" disabled={!podeSalvar} onClick={() => salvar()}>
            <UserPlus size={15} /> Agendar
          </button>
        </>
      }
    >
      <div className="ui-segmentos" style={{ marginBottom: 16 }}>
        {([
          ['reposicao', 'Reposição'],
          ['avulsa', 'Avulsa'],
          ['experimental', 'Experimental']
        ] as [TipoNovo, string][]).map(([id, rotulo]) => (
          <button key={id} className={tipo === id ? 'ativo' : ''} onClick={() => setTipo(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      {tipo === 'experimental' ? (
        <div className="ui-linha">
          <div className="ui-campo">
            <label className="label">Nome</label>
            <input className="input" value={nomeExp} onChange={e => setNomeExp(e.target.value)} autoFocus />
          </div>
          <div className="ui-campo">
            <label className="label">Telefone</label>
            <input className="input" value={telExp} onChange={e => setTelExp(e.target.value)} inputMode="tel" placeholder="(31) 9...." />
          </div>
        </div>
      ) : (
        <SeletorAluno selecionado={aluno} onSelecionar={setAluno} />
      )}

      {verif && (
        <>
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            Ocupação: <strong>{verif.ocupados}/{verif.capacidade}</strong> · {verif.vagas} vaga(s)
          </p>
          {verif.bloqueio && <Alerta tipo="erro">Horário bloqueado: {verif.bloqueio}</Alerta>}
          {verif.dia_invalido && <Alerta tipo="erro">Esta turma não acontece nesta data.</Alerta>}
          {verif.ja_agendado && <Alerta tipo="erro">O aluno já está nesta aula.</Alerta>}
          {verif.conflito && <Alerta tipo="erro">O aluno já tem aula em horário sobreposto neste dia.</Alerta>}
          {tipo !== 'experimental' && verif.aluno_inativo && <Alerta tipo="aviso">Aluno está inativo no cadastro.</Alerta>}
          {tipo !== 'experimental' && verif.excede_plano && (
            <Alerta tipo="aviso">
              Excede a frequência do plano: {verif.aulas_na_semana} aula(s) nesta semana para um plano de {verif.frequencia_semanal}x.
            </Alerta>
          )}
          {tipo === 'reposicao' && verif.aulas_restantes !== null && verif.aulas_restantes <= 0 && (
            <Alerta tipo="aviso">O pacote não tem aulas restantes: a presença não poderá ser registrada.</Alerta>
          )}
          {tipo === 'reposicao' && verif.limite_reposicoes_mes !== null && verif.reposicoes_no_mes >= verif.limite_reposicoes_mes && (
            <Alerta tipo="aviso">
              Limite de reposições do mês atingido ({verif.reposicoes_no_mes}/{verif.limite_reposicoes_mes}).
            </Alerta>
          )}
          {verif.lotado && (
            <label className="ui-check">
              <input type="checkbox" checked={encaixe} onChange={e => setEncaixe(e.target.checked)} />
              Horário lotado — encaixar mesmo assim
            </label>
          )}

          {tipo === 'reposicao' && aluno && (
            <>
              <div className="ag-secao-titulo">Créditos de reposição</div>
              {semCredito ? (
                <Alerta tipo="erro">Este aluno não tem créditos de reposição válidos. Use “Avulsa” se for uma aula extra.</Alerta>
              ) : (
                verif.creditos.map(c => {
                  const dias = diferencaDias(hoje, c.expira_em)
                  const serve = c.expira_em >= turma.data
                  return (
                    <label key={c.id} className="ui-check">
                      <input type="radio" name="credito" checked={creditoId === c.id} disabled={!serve} onChange={() => setCreditoId(c.id)} />
                      <span>
                        Vence em {formatarData(c.expira_em)}{' '}
                        {!serve ? (
                          <span className="ui-chip ui-chip-vermelho">vence antes desta aula</span>
                        ) : dias <= 7 ? (
                          <span className="ui-chip ui-chip-laranja">vence em {dias} dia(s)</span>
                        ) : null}
                      </span>
                    </label>
                  )
                })
              )}
            </>
          )}
        </>
      )}

      <div className="ui-campo" style={{ marginTop: 10 }}>
        <label className="label">Observação (opcional)</label>
        <input className="input" value={obs} onChange={e => setObs(e.target.value)} />
      </div>
    </Modal>
  )
}

function Alerta({ tipo, children }: { tipo: 'erro' | 'aviso' | 'info'; children: React.ReactNode }) {
  const Icone = tipo === 'info' ? Info : AlertTriangle
  return (
    <div className={`ui-alerta ui-alerta-${tipo}`}>
      <Icone size={16} />
      <div>{children}</div>
    </div>
  )
}
