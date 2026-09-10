import type { Variacao } from '../lib/types'
import { formatVariacao } from '../lib/calculos'
import styles from '../resultados.module.css'

type Props = {
  icone: string
  label: string
  valor: string
  variacao?: Variacao | null
  /** Para métricas onde "subir" é ruim (ex.: faltas), inverte as cores do badge. */
  invertido?: boolean
  caption?: string
}

export default function KpiCard({ icone, label, valor, variacao, invertido, caption }: Props) {
  let badgeClass = styles.badgeNeutro
  let texto = 'sem histórico suficiente'

  if (variacao && variacao.tipo !== 'indisponivel' && variacao.valor !== null) {
    texto = formatVariacao(variacao)
    const positivo = invertido ? variacao.valor <= 0 : variacao.valor >= 0
    badgeClass = positivo ? styles.badgePos : styles.badgeNeg
  }

  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <span className={styles.kpiLabel}>{label}</span>
        <span className={styles.kpiIcon}>{icone}</span>
      </div>

      <span className={styles.kpiValor}>{valor}</span>

      {variacao !== undefined && (
        <div className={styles.kpiFooter}>
          <span className={`${styles.badge} ${badgeClass}`}>{texto}</span>
          <span>vs. período anterior</span>
        </div>
      )}

      {caption && <span className={styles.kpiCaption}>{caption}</span>}
    </div>
  )
}
