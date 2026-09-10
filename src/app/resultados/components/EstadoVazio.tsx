import styles from '../resultados.module.css'

export function EstadoVazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className={styles.estado}>
      <div className={styles.estadoTitulo}>{titulo}</div>
      <p>{texto}</p>
    </div>
  )
}

export function EstadoErro({ texto }: { texto: string }) {
  return (
    <div className={`${styles.estado} ${styles.estadoErro}`}>
      <div className={styles.estadoTitulo}>Erro ao carregar dados</div>
      <p>{texto}</p>
    </div>
  )
}
