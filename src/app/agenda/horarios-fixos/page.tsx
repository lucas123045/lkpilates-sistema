'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { History, Save, Search } from 'lucide-react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader, { Kpi } from '@/app/components/shell/PageHeader'
import { DIAS_SEMANA_CURTO, formatarHora, hojeEstudio, horaFim, somarDias } from '@/lib/agenda/datas'
import { sugerirDiasFixos, type SugestaoDia } from '@/lib/agenda/regras'
import { alunosAtivos, criarAulaCliente, datasDeAulasPorAluno, ErroAgenda } from '@/lib/agenda/servico'
import type { AlunoResumo } from '@/lib/agenda/tipos'
import { listarProfissionais, listarServicos, recorrenciasAtivas, type Recorrencia } from '@/lib/gestao/servico'
import type { Profissional, Servico } from '@/lib/gestao/tipos'
import '@/app/components/ui/ui.css'
import '../agenda.css'

const SEMANAS = 8
const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

export default function HorariosFixos() {
  const hoje = hojeEstudio()
  const [alunos, setAlunos] = useState<AlunoResumo[]>([])
  const [recorrencias, setRecorrencias] = useState<Recorrencia[]>([])
  const [historico, setHistorico] = useState<Record<string, string[]>>({})
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [servicos, setServicos] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [soSem, setSoSem] = useState(true)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [a, r, h, p, s] = await Promise.all([
        alunosAtivos(),
        recorrenciasAtivas(hoje),
        datasDeAulasPorAluno(somarDias(hoje, -SEMANAS * 7)),
        listarProfissionais(),
        listarServicos()
      ])
      setAlunos(a)
      setRecorrencias(r)
      setHistorico(h)
      setProfissionais(p.filter(x => x.ativo))
      setServicos(s.filter(x => x.ativo))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregando(false)
    }
  }, [hoje])

  useEffect(() => {
    carregar()
  }, [carregar])

  const porAluno = useMemo(() => {
    const m = new Map<string, Recorrencia[]>()
    for (const r of recorrencias) if (r.aluno_id) m.set(r.aluno_id, [...(m.get(r.aluno_id) ?? []), r])
    return m
  }, [recorrencias])

  const sugestoes = useMemo(() => new Map(alunos.map(a => [a.id, sugerirDiasFixos(historico[a.id] ?? [], hoje, SEMANAS)])), [alunos, historico, hoje])
  const comHorario = alunos.filter(a => porAluno.has(a.id)).length
  const termo = busca.trim().toLowerCase()
  const lista = alunos.filter(a => (!soSem || !porAluno.has(a.id)) && a.nome.toLowerCase().includes(termo))

  const demanda = Array(7).fill(0)
  for (const s of sugestoes.values()) for (const d of s) demanda[d.dia - 1]++

  return (
    <>
      <PageHeader
        trilha={[{ rotulo: 'Agenda', href: '/agenda' }, { rotulo: 'Horários fixos' }]}
        cards={
          <>
            <Kpi titulo="Com horário fixo" valor={`${comHorario} de ${alunos.length}`} detalhe="clientes ativos" icone={<History size={24} />} />
            <Kpi
              titulo="Costumam vir (histórico)"
              valor={demanda.map((n, i) => (n ? `${DIAS_SEMANA_CURTO[i]} ${n}` : null)).filter(Boolean).slice(0, 3).join(' · ') || '—'}
              detalhe={demanda.map((n, i) => (n ? `${DIAS_SEMANA_CURTO[i]} ${n}` : null)).filter(Boolean).slice(3).join(' · ')}
              icone={<History size={24} />}
              tom="laranja"
            />
          </>
        }
      />
      <div className="ph-corpo">
        <div className="painel">
          <div className="painel-topo">
            <div>
              <h2>Horários fixos dos clientes</h2>
              <p style={{ fontSize: 13.5, marginTop: 4 }}>
                Os dias sugeridos vêm das presenças registradas nas últimas {SEMANAS} semanas. Informe o horário e salve: as aulas aparecem na agenda toda semana.
              </p>
            </div>
            <div className="painel-filtros">
              <div className="busca">
                <Search size={16} />
                <input placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <label className="ui-check" style={{ margin: 0, alignSelf: 'center' }}>
                <input type="checkbox" checked={soSem} onChange={e => setSoSem(e.target.checked)} />
                Só quem ainda não tem horário
              </label>
            </div>
          </div>
          {carregando && <div className="ui-skeleton" style={{ height: 160, margin: 20 }} />}
          {erro && <div className="ui-alerta ui-alerta-erro" style={{ margin: 20 }}>{erro}</div>}
          {!carregando && !lista.length && <div className="ui-estado" style={{ margin: 20 }}>{soSem ? 'Todos os clientes ativos já têm horário fixo.' : 'Nenhum cliente encontrado.'}</div>}
          <div className="hf-lista">
            {lista.map(a => (
              <LinhaCliente
                key={a.id}
                aluno={a}
                sugestoes={sugestoes.get(a.id) ?? []}
                atuais={porAluno.get(a.id) ?? []}
                profissionais={profissionais}
                servicos={servicos}
                hoje={hoje}
                onSalvo={carregar}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function LinhaCliente({
  aluno,
  sugestoes,
  atuais,
  profissionais,
  servicos,
  hoje,
  onSalvo
}: {
  aluno: AlunoResumo
  sugestoes: SugestaoDia[]
  atuais: Recorrencia[]
  profissionais: Profissional[]
  servicos: Servico[]
  hoje: string
  onSalvo: () => void
}) {
  const { toast, confirmar } = useFeedback()
  const padrao = servicos.find(s => /pilates/i.test(s.nome)) ?? servicos[0]
  const [dias, setDias] = useState<number[]>(sugestoes.map(s => s.dia).sort())
  const [das, setDas] = useState('')
  const [servicoId, setServicoId] = useState(padrao?.id ?? '')
  const [profissionalId, setProfissionalId] = useState(aluno.professor_id ?? '')
  const [salvando, setSalvando] = useState(false)
  const duracao = servicos.find(s => s.id === servicoId)?.duracao_padrao_min ?? 60

  async function salvar(forcar = false): Promise<void> {
    setSalvando(true)
    try {
      await criarAulaCliente(
        { alunoId: aluno.id, data: hoje, horaInicio: das, horaFim: horaFim(das, duracao), dias, profissionalId: profissionalId || null, servicoId: servicoId || null },
        forcar
      )
      toast(`${aluno.nome}: ${dias.map(d => DIAS_SEMANA_CURTO[d - 1]).join(', ')} às ${das}.`)
      setDas('')
      onSalvo()
    } catch (e) {
      if (e instanceof ErroAgenda && e.codigo === 'CONFLITO' && !forcar) {
        setSalvando(false)
        const ok = await confirmar({ titulo: 'Conflito de horário', mensagem: `${e.message.replace('Conflito de horario do cliente:', 'Já tem aula em:')}. Salvar mesmo assim?`, confirmar: 'Salvar' })
        if (ok) return salvar(true)
        return
      }
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="hf-item">
      <div className="hf-cab">
        <Link href={`/clientes/${aluno.id}`} className="hf-nome">{aluno.nome}</Link>
        <span className="ui-chip">{aluno.plano || 'sem plano'}</span>
        {aluno.frequencia_semanal && <span className="ui-chip">{aluno.frequencia_semanal}x/semana</span>}
      </div>
      <div className="hf-info">
        <History size={14} />
        {sugestoes.length ? (
          sugestoes.map(s => (
            <span key={s.dia} className="ui-chip ui-chip-azul" title={`Veio em ${s.vezes} das ${s.semanas} semanas com aula`}>
              {DIAS_SEMANA_CURTO[s.dia - 1]} ({s.vezes}/{s.semanas})
            </span>
          ))
        ) : (
          <span>sem padrão recente</span>
        )}
        {atuais.map(r => (
          <span key={r.id} className="ui-chip ui-chip-verde">
            Fixo: {[...r.dias_semana].sort().map(d => DIAS_SEMANA_CURTO[d - 1]).join(', ')} {formatarHora(r.hora_inicio)}
          </span>
        ))}
      </div>
      <div className="hf-form">
        <div className="agm-dias" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
          {DIAS.map((d, i) => (
            <label key={i}>
              <input type="checkbox" checked={dias.includes(i + 1)} onChange={e => setDias(x => (e.target.checked ? [...x, i + 1].sort() : x.filter(y => y !== i + 1)))} />
              <span>{d}</span>
            </label>
          ))}
        </div>
        <input type="time" step={300} value={das} onChange={e => setDas(e.target.value)} aria-label="Horário" />
        <select value={profissionalId} onChange={e => setProfissionalId(e.target.value)} aria-label="Profissional">
          <option value="">Profissional</option>
          {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={servicoId} onChange={e => setServicoId(e.target.value)} aria-label="Serviço">
          {servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        <button className="btn ui-btn-azul" disabled={salvando || !das || !dias.length} onClick={() => salvar()}>
          <Save size={15} /> Salvar
        </button>
      </div>
    </div>
  )
}
