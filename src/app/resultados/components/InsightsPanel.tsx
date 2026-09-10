import type { Insight } from '../lib/types'
import styles from '../resultados.module.css'

const ICONES: Record<Insight['categoria'], string> = {
  tendencia: '📈',
  atencao: '⚠️',
  desempenho: '📊',
  oportunidade: '💡'
}

export default function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>🤖 Análise automática</span>
        <span className={styles.cardCaption}>Gerada a partir dos dados reais do período — sem estimativas inventadas</span>
      </div>

      {insights.length === 0 ? (
        <p className={styles.insightVazio}>Nenhum ponto de atenção identificado neste período. ✅</p>
      ) : (
        <div className={styles.insightsGrid}>
          {insights.map((insight, i) => (
            <div key={i} className={`${styles.insightCard} ${styles[insight.categoria]}`}>
              <div className={styles.insightTitulo}>
                {ICONES[insight.categoria]} {insight.titulo}
              </div>
              <div className={styles.insightDescricao}>{insight.descricao}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
