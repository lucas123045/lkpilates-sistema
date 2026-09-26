'use client'

import Link from 'next/link'
import { Ban, Plus, Settings, UsersRound } from 'lucide-react'
import { formatarDataCurta } from '@/lib/agenda/datas'
import { SEM_PROFESSOR, type TipoFiltro } from '@/lib/agenda/eventos'
import type { ResumoDia } from '@/lib/agenda/regras'
import type { Professor } from '@/lib/agenda/tipos'
import MiniCalendario from './MiniCalendario'

const TIPOS: { id: TipoFiltro; rotulo: string; cor: string }[] = [
  { id: 'fixo', rotulo: 'Horário fixo', cor: '#1f4fd8' },
  { id: 'reposicao', rotulo: 'Reposição', cor: '#ea580c' },
  { id: 'experimental', rotulo: 'Experimental', cor: '#9333ea' },
  { id: 'avulsa', rotulo: 'Avulsa', cor: '#0e7490' },
  { id: 'bloqueios', rotulo: 'Feriados e bloqueios', cor: '#667085' }
]

type Props = {
  aberta: boolean
  hoje: string
  referencia: string
  inicioVisivel: string
  fimVisivel: string
  professores: Professor[]
  professoresOcultos: string[]
  tiposOcultos: TipoFiltro[]
  dia24h: boolean
  resumo: { data: string; valores: ResumoDia } | null
  creditosAtivos: number
  onEscolherData: (d: string) => void
  onCriar: () => void
  onBloqueio: () => void
  onAlternarProfessor: (id: string) => void
  onSomenteProfessor: (id: string) => void
  onAlternarTipo: (id: TipoFiltro) => void
  onAlternar24h: () => void
  onFechar: () => void
}

export default function BarraLateral(p: Props) {
  const ativos = p.professores.filter(x => x.ativo)
  const lista = [...ativos, { id: SEM_PROFESSOR, nome: 'Sem professor', cor: '#98a2b3' } as Professor]

  return (
    <>
      {p.aberta && <div className="gc-lateral-fundo" onClick={p.onFechar} />}
      <aside className={`gc-lateral${p.aberta ? ' aberta' : ''}`} aria-label="Barra lateral da agenda">
        <button className="gc-criar" onClick={p.onCriar}>
          <Plus size={22} /> Criar
        </button>

        <MiniCalendario
          hoje={p.hoje}
          referencia={p.referencia}
          inicioVisivel={p.inicioVisivel}
          fimVisivel={p.fimVisivel}
          onEscolher={p.onEscolherData}
        />

        <div className="gc-secao">
          <div className="gc-secao-titulo">Professores</div>
          {lista.map(prof => (
            <label key={prof.id} className="gc-check" title="Clique duplo: mostrar só este">
              <input
                type="checkbox"
                checked={!p.professoresOcultos.includes(prof.id)}
                onChange={() => p.onAlternarProfessor(prof.id)}
                onDoubleClick={e => {
                  e.preventDefault()
                  p.onSomenteProfessor(prof.id)
                }}
                style={{ accentColor: prof.cor }}
              />
              <span className="gc-check-cor" style={{ background: prof.cor }} />
              <span>{prof.nome}</span>
            </label>
          ))}
          {!ativos.length && (
            <Link href="/agenda/configuracoes" className="gc-link">
              Cadastrar professores
            </Link>
          )}
        </div>

        <div className="gc-secao">
          <div className="gc-secao-titulo">Mostrar</div>
          {TIPOS.map(t => (
            <label key={t.id} className="gc-check">
              <input type="checkbox" checked={!p.tiposOcultos.includes(t.id)} onChange={() => p.onAlternarTipo(t.id)} style={{ accentColor: t.cor }} />
              <span>{t.rotulo}</span>
            </label>
          ))}
          <label className="gc-check">
            <input type="checkbox" checked={p.dia24h} onChange={p.onAlternar24h} />
            <span>Mostrar as 24 horas</span>
          </label>
        </div>

        {p.resumo && (
          <div className="gc-secao">
            <div className="gc-secao-titulo">Resumo de {formatarDataCurta(p.resumo.data)}</div>
            <div className="gc-resumo">
              <span><b>{p.resumo.valores.totalAulas}</b> aulas</span>
              <span><b>{p.resumo.valores.ocupacaoPct ?? '—'}{p.resumo.valores.ocupacaoPct !== null && '%'}</b> ocupação</span>
              <span><b>{p.resumo.valores.presencas}</b> presenças</span>
              <span><b>{p.resumo.valores.faltas}</b> faltas{p.resumo.valores.faltasJustificadas > 0 && ` (+${p.resumo.valores.faltasJustificadas} just.)`}</span>
              <span><b>{p.resumo.valores.experimentais}</b> experimentais</span>
              <span><b>{p.resumo.valores.vagasLivres}</b> vagas livres</span>
              <span title="Créditos de reposição ativos no estúdio"><b>{p.creditosAtivos}</b> reposições pendentes</span>
            </div>
          </div>
        )}

        <div className="gc-secao gc-links">
          <Link href="/agenda/horarios-fixos" className="gc-link">
            <UsersRound size={15} /> Horários fixos dos alunos
          </Link>
          <Link href="/agenda/configuracoes" className="gc-link">
            <Settings size={15} /> Grade, professores e regras
          </Link>
          <button className="gc-link" onClick={p.onBloqueio}>
            <Ban size={15} /> Feriado / recesso
          </button>
        </div>
      </aside>
    </>
  )
}
