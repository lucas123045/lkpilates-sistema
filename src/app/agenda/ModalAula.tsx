'use client'

import { useEffect, useRef, useState } from 'react'
import { UserPlus, UserRound } from 'lucide-react'
import Modal from '@/app/components/ui/Modal'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import { SeletorCor } from '@/app/components/gestao/Comuns'
import { SeletorAluno } from './componentes/Seletores'
import { diaSemanaISO, formatarHora, horaFim, horaParaMinutos } from '@/lib/agenda/datas'
import { carregarAluno, carregarRecorrencia, criarAulaCliente, editarAulaCliente, ErroAgenda, type EscopoAula } from '@/lib/agenda/servico'
import type { Agendamento, AlunoResumo, Modalidade, Professor } from '@/lib/agenda/tipos'

const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const NOMES_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

type Servico = Modalidade & { duracao_padrao_min?: number }

export type InicialAula = {
  agendamento?: Agendamento
  data: string
  horaInicio: string
  horaFim?: string
  alunoId?: string | null
}

type Props = {
  inicial: InicialAula
  professores: Professor[]
  servicos: Servico[]
  perguntarEscopo: (titulo: string) => Promise<EscopoAula | null>
  onFechar: () => void
  onSalvo: () => void
}

function somarMin(hora: string, min: number) {
  return horaFim(hora, min)
}

export default function ModalAula({ inicial, professores, servicos, perguntarEscopo, onFechar, onSalvo }: Props) {
  const { toast, confirmar } = useFeedback()
  const a = inicial.agendamento
  const editando = !!a
  const recorrente = !!a?.recorrencia_id
  const servicoPadrao = servicos.find(s => s.ativo && /pilates/i.test(s.nome)) ?? servicos.find(s => s.ativo)

  const [aluno, setAluno] = useState<AlunoResumo | null>(a?.aluno ?? null)
  const [naoCadastrado, setNaoCadastrado] = useState(!!a && !a.aluno_id)
  const [nomeLivre, setNomeLivre] = useState(a?.experimental_nome ?? '')
  const [telLivre, setTelLivre] = useState(a?.experimental_telefone ?? '')
  const [data, setData] = useState(a?.data ?? inicial.data)
  const [das, setDas] = useState(formatarHora(a?.hora ?? inicial.horaInicio))
  const [servicoId, setServicoId] = useState(a ? a.servico_id ?? '' : servicoPadrao?.id ?? '')
  const duracaoServico = (id: string) => servicos.find(s => s.id === id)?.duracao_padrao_min ?? 60
  const [ate, setAte] = useState(
    a ? horaFim(a.hora, a.duracao_min) : inicial.horaFim ?? somarMin(inicial.horaInicio, duracaoServico(servicoPadrao?.id ?? ''))
  )
  const [ateManual, setAteManual] = useState(!!a || !!inicial.horaFim)
  const [repetir, setRepetir] = useState(false)
  const [dias, setDias] = useState<number[]>([diaSemanaISO(a?.data ?? inicial.data)])
  const [profissionalId, setProfissionalId] = useState(a?.professor_id ?? '')
  const [observacao, setObservacao] = useState(a?.observacao ?? '')
  const [cor, setCor] = useState<string | null>(a?.cor ?? null)
  const [salvando, setSalvando] = useState(false)
  // escopo escolhido antes de uma confirmacao de conflito (reaproveitado ao forcar)
  const escopoPendente = useRef<EscopoAula>('esta')

  // Cliente vindo da ficha (?novo=<id>)
  useEffect(() => {
    if (!inicial.alunoId || a) return
    carregarAluno(inicial.alunoId).then(r => r && escolherAluno(r)).catch(() => {})
  }, [inicial.alunoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Editando uma aula da serie: mostra os dias da regra (usados em "esta e as proximas")
  useEffect(() => {
    if (!a?.recorrencia_id) return
    carregarRecorrencia(a.recorrencia_id)
      .then(r => {
        if (!r) return
        setDias(r.dias_semana)
        setRepetir(true)
      })
      .catch(() => {})
  }, [a?.recorrencia_id])

  function escolherAluno(r: AlunoResumo | null) {
    setAluno(r)
    if (r?.professor_id && !profissionalId) setProfissionalId(r.professor_id)
  }

  function mudarDas(v: string) {
    setDas(v)
    if (!ateManual && v) setAte(somarMin(v, duracaoServico(servicoId)))
  }

  function mudarServico(id: string) {
    setServicoId(id)
    if (!ateManual && das) setAte(somarMin(das, duracaoServico(id)))
  }

  function mudarData(v: string) {
    setData(v)
    if (!editando && dias.length <= 1 && v) setDias([diaSemanaISO(v)])
  }

  const horarioOk = !!das && !!ate && horaParaMinutos(ate) > horaParaMinutos(das)
  const pessoaOk = naoCadastrado ? nomeLivre.trim().length > 1 : !!aluno || editando
  const diasOk = !repetir || dias.length > 0

  async function salvar(forcar = false): Promise<void> {
    let escopo: EscopoAula = 'esta'
    if (editando && recorrente && !forcar) {
      const r = await perguntarEscopo('Editar aula recorrente')
      if (!r) return
      escopo = r
      escopoPendente.current = r
    } else if (forcar) {
      escopo = escopoPendente.current
    }
    setSalvando(true)
    try {
      const campos = {
        data,
        horaInicio: das,
        horaFim: ate,
        dias: repetir ? dias : null,
        profissionalId: profissionalId || null,
        servicoId: servicoId || null,
        cor,
        observacao
      }
      if (editando) {
        await editarAulaCliente(a!.id, escopo, campos, forcar)
        toast(escopo === 'proximas' ? 'Aula e próximas atualizadas.' : 'Aula atualizada.')
      } else {
        await criarAulaCliente(
          { ...campos, alunoId: naoCadastrado ? null : aluno?.id ?? null, nomeLivre: naoCadastrado ? nomeLivre : undefined, telefoneLivre: naoCadastrado ? telLivre : undefined },
          forcar
        )
        toast(repetir ? `Aula criada: toda ${dias.map(d => NOMES_DIAS[d - 1].toLowerCase()).join(', ')} às ${das}.` : 'Aula agendada.')
      }
      onSalvo()
    } catch (e) {
      if (e instanceof ErroAgenda && e.codigo === 'CONFLITO' && !forcar) {
        setSalvando(false)
        const ok = await confirmar({
          titulo: 'Conflito de horário',
          mensagem: `${e.message.replace('Conflito de horario do cliente:', 'O cliente já tem aula em:')}. Agendar mesmo assim?`,
          confirmar: 'Agendar mesmo assim'
        })
        if (ok) return salvar(true)
        return
      }
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={editando ? 'Editar aula' : 'Nova aula'}
      largura={560}
      rodape={
        <>
          <button className="btn btn-sec" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-veio" disabled={salvando || !horarioOk || !pessoaOk || !diasOk || !data} onClick={() => salvar()}>
            Salvar
          </button>
        </>
      }
    >
      <div className="ui-campo">
        <label className="label">Cliente</label>
        {editando ? (
          <div className="ui-alerta ui-alerta-info" style={{ marginBottom: 0 }}>
            <UserRound size={16} /> <strong>{a!.aluno?.nome ?? a!.experimental_nome}</strong>
            {!a!.aluno_id && <span>· não cadastrado</span>}
          </div>
        ) : naoCadastrado ? (
          <>
            <div className="ui-linha">
              <input className="input" placeholder="Nome (aula experimental)" value={nomeLivre} onChange={e => setNomeLivre(e.target.value)} autoFocus />
              <input className="input" placeholder="Telefone" inputMode="tel" value={telLivre} onChange={e => setTelLivre(e.target.value)} />
            </div>
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setNaoCadastrado(false)}>
              <UserRound size={13} /> Escolher cliente cadastrado
            </button>
          </>
        ) : (
          <>
            <SeletorAluno selecionado={aluno} onSelecionar={escolherAluno} />
            {!aluno && (
              <button type="button" className="btn btn-sec btn-sm" onClick={() => setNaoCadastrado(true)} style={{ marginTop: -6 }}>
                <UserPlus size={13} /> Cliente não cadastrado
              </button>
            )}
          </>
        )}
      </div>

      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Data</label>
          <input className="input" type="date" value={data} onChange={e => mudarData(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Das</label>
          <input className="input" type="time" step={300} value={das} onChange={e => mudarDas(e.target.value)} />
        </div>
        <div className="ui-campo">
          <label className="label">Até</label>
          <input
            className="input"
            type="time"
            step={300}
            value={ate}
            onChange={e => {
              setAteManual(true)
              setAte(e.target.value)
            }}
          />
        </div>
      </div>
      {!horarioOk && das && ate && <p className="agm-aviso">O horário final deve ser depois do inicial.</p>}

      {(!editando || recorrente) && (
        <div className="ui-campo">
          <label className="label">Repetir</label>
          <select className="ui-select" value={repetir ? 'semanal' : 'nao'} onChange={e => setRepetir(e.target.value === 'semanal')}>
            <option value="nao">Não repetir</option>
            <option value="semanal">Semanalmente</option>
          </select>
          {repetir && (
            <div className="agm-dias" role="group" aria-label="Dias da semana">
              {DIAS.map((d, i) => (
                <label key={i} title={NOMES_DIAS[i]}>
                  <input
                    type="checkbox"
                    checked={dias.includes(i + 1)}
                    onChange={e => setDias(x => (e.target.checked ? [...x, i + 1].sort() : x.filter(y => y !== i + 1)))}
                  />
                  <span>{d}</span>
                </label>
              ))}
            </div>
          )}
          {editando && recorrente && (
            <p className="agm-ajuda">Os dias da semana só mudam se você escolher “Esta e as próximas” ao salvar.</p>
          )}
        </div>
      )}

      <div className="ui-linha">
        <div className="ui-campo">
          <label className="label">Profissional</label>
          <select className="ui-select" value={profissionalId} onChange={e => setProfissionalId(e.target.value)}>
            <option value="">Selecione</option>
            {professores.filter(p => p.ativo || p.id === profissionalId).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div className="ui-campo">
          <label className="label">Tipo de serviço</label>
          <select className="ui-select" value={servicoId} onChange={e => mudarServico(e.target.value)}>
            <option value="">Selecione</option>
            {servicos.filter(s => s.ativo || s.id === servicoId).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="ui-campo">
        <label className="label">Observações</label>
        <textarea className="ui-textarea" value={observacao} onChange={e => setObservacao(e.target.value)} />
      </div>

      <div className="ui-campo">
        <label className="label">Cor (opcional)</label>
        <SeletorCor valor={cor} onChange={setCor} permitirVazio />
        <p className="agm-ajuda">O círculo branco usa a cor automática (a do profissional).</p>
      </div>
    </Modal>
  )
}
