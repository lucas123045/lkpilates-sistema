import Link from 'next/link'
import { Home } from 'lucide-react'
import './shell.css'

type Props = {
  trilha: { rotulo: string; href?: string }[]
  acao?: React.ReactNode
  cards?: React.ReactNode
}

/** Cabecalho padrao das paginas: faixa da marca com breadcrumb, acao principal e cards de indicadores. */
export default function PageHeader({ trilha, acao, cards }: Props) {
  return (
    <div className={`ph${cards ? ' com-cards' : ''}`}>
      <div className="ph-faixa">
        <div className="ph-linha">
          <nav className="ph-trilha" aria-label="Você está em">
            <Link href="/dashboard" aria-label="Início">
              <Home size={16} />
            </Link>
            {trilha.map((t, i) => (
              <span key={i}>
                <span className="ph-sep">-</span>
                {t.href ? <Link href={t.href}>{t.rotulo}</Link> : <span>{t.rotulo}</span>}
              </span>
            ))}
          </nav>
          {acao && <div className="ph-acao">{acao}</div>}
        </div>
        {cards && <div className="ph-cards">{cards}</div>}
      </div>
    </div>
  )
}

export function Kpi({
  titulo,
  valor,
  detalhe,
  icone,
  tom = 'azul',
  children
}: {
  titulo: string
  valor: React.ReactNode
  detalhe?: React.ReactNode
  icone?: React.ReactNode
  tom?: 'azul' | 'laranja' | 'verde' | 'vermelho' | 'roxo'
  children?: React.ReactNode
}) {
  return (
    <div className="kpi">
      <div className="kpi-texto">
        <span className="kpi-titulo">{titulo}</span>
        <strong className="kpi-valor">{valor}</strong>
        {detalhe && <span className="kpi-detalhe">{detalhe}</span>}
        {children}
      </div>
      {icone && <div className={`kpi-icone tom-${tom}`}>{icone}</div>}
    </div>
  )
}
