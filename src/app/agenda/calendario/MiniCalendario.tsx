'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { inicioSemana, somarDias } from '@/lib/agenda/datas'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const INICIAIS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

type Props = {
  hoje: string
  referencia: string // data que o calendario principal esta mostrando
  inicioVisivel: string
  fimVisivel: string // exclusivo
  onEscolher: (data: string) => void
}

export default function MiniCalendario({ hoje, referencia, inicioVisivel, fimVisivel, onEscolher }: Props) {
  const [mes, setMes] = useState(referencia.slice(0, 7)) // AAAA-MM

  // acompanha a navegacao do calendario principal
  useEffect(() => setMes(referencia.slice(0, 7)), [referencia])

  const [ano, m] = mes.split('-').map(Number)
  const primeiro = `${mes}-01`
  const inicioGrade = inicioSemana(primeiro)
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicioGrade, i))

  function mudarMes(passo: number) {
    const d = new Date(Date.UTC(ano, m - 1 + passo, 1))
    setMes(d.toISOString().slice(0, 7))
  }

  return (
    <div className="gc-mini">
      <div className="gc-mini-topo">
        <strong>
          {MESES[m - 1]} {ano}
        </strong>
        <div>
          <button className="ui-icon-btn" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <button className="ui-icon-btn" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="gc-mini-grade" role="grid">
        {INICIAIS.map((d, i) => (
          <span key={i} className="gc-mini-sem">
            {d}
          </span>
        ))}
        {dias.map(d => {
          const classes = ['gc-mini-dia']
          if (d.slice(0, 7) !== mes) classes.push('fora')
          if (d >= inicioVisivel && d < fimVisivel) classes.push('visivel')
          if (d === hoje) classes.push('hoje')
          return (
            <button key={d} className={classes.join(' ')} onClick={() => onEscolher(d)} aria-label={d.split('-').reverse().join('/')}>
              {Number(d.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
