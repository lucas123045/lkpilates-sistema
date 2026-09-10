import { AlertTriangle, BarChart3, CheckCircle2, Lightbulb, Sparkles, TrendingUp } from 'lucide-react'
import type { Insight } from '../lib/types'
import styles from '../resultados.module.css'

const ICONES: Record<Insight['categoria'], typeof TrendingUp> = {
  tendencia: TrendingUp,
  atencao: AlertTriangle,
  desempenho: BarChart3,
  oportunidade: Lightbulb
}

export default function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          <Sparkles size={16} strokeWidth={1.75} /> Análise automática
        </span>
        <span className={styles.cardCaption}>Gerada a partir dos dados reais do período — sem estimativas inventadas</span>
      </div>

      {insights.length === 0 ? (
        <p className={styles.insightVazio}>
          <CheckCircle2 size={15} /> Nenhum ponto de atenção identificado neste período.
        </p>
      ) : (
        <div className={styles.insightsGrid}>
          {insights.map((insight, i) => {
            const Icone = ICONES[insight.categoria]
            return (
              <div key={i} className={`${styles.insightCard} ${styles[insight.categoria]}`}>
                <div className={styles.insightTitulo}>
                  <Icone size={15} strokeWidth={2} /> {insight.titulo}
                </div>
                <div className={styles.insightDescricao}>{insight.descricao}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
