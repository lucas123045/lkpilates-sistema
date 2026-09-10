import { CheckCircle2, ShieldAlert } from 'lucide-react'
import type { RiscoAluno } from '../lib/risco'
import styles from '../resultados.module.css'

export default function RiscoCancelamento({ riscos }: { riscos: RiscoAluno[] }) {
  const relevantes = riscos.filter(r => r.nivel !== 'baixo').slice(0, 8)

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          <ShieldAlert size={16} strokeWidth={1.75} /> Risco de cancelamento
        </span>
        <span className={styles.cardCaption}>Baseado em faltas, frequência e dias sem vir nos últimos 30 dias</span>
      </div>

      {relevantes.length === 0 ? (
        <p className={styles.insightVazio}>
          <CheckCircle2 size={15} /> Nenhum aluno ativo em risco no momento.
        </p>
      ) : (
        relevantes.map(r => (
          <div key={r.id} className={styles.riscoItem}>
            <span className={`${styles.riscoNivel} ${r.nivel === 'alto' ? styles.riscoAlto : styles.riscoMedio}`}>
              {r.nivel === 'alto' ? 'Alto' : 'Médio'}
            </span>
            <span className={styles.riscoNome}>{r.nome}</span>
            <span className={styles.riscoMotivo}>
              {r.motivo} · <span className={styles.riscoSugestao}>{r.sugestao}</span>
            </span>
          </div>
        ))
      )}
    </div>
  )
}
