import type { ReactNode } from 'react'
import styles from '../resultados.module.css'

type Item = { nome: string; valor: string }

export default function Ranking({ titulo, icone, itens }: { titulo: string; icone: ReactNode; itens: Item[] }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          {icone} {titulo}
        </span>
      </div>

      {itens.length === 0 ? (
        <p className={styles.insightVazio}>Sem dados no período.</p>
      ) : (
        itens.map((item, i) => (
          <div className={styles.rankItem} key={item.nome + i}>
            <span className={styles.rankPos}>{i + 1}</span>
            <span className={styles.rankNome}>{item.nome}</span>
            <span className={styles.rankValor}>{item.valor}</span>
          </div>
        ))
      )}
    </div>
  )
}
