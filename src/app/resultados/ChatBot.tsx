'use client'

import { useRef, useState, useEffect } from 'react'
import { Bot, Send } from 'lucide-react'
import { formatMoney } from './lib/calculos'
import type { ContextoIA } from './lib/contextoIA'
import styles from './resultados.module.css'

type Mensagem = { autor: 'bot' | 'user'; texto: string }

const SUGESTOES = ['Faturamento', 'Frequência', 'Riscos', 'Quem mais falta']

function formatPP(v: number) {
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v.toFixed(1)} p.p.`
}

/** Respostas instantâneas para perguntas comuns, sem depender da API (mais rápido e sem custo). */
function respostaLocal(pergunta: string, ctx: ContextoIA): string | null {
  const p = pergunta.toLowerCase()

  if (p.includes('faturamento') || p.includes('receita')) {
    return `O faturamento recorrente estimado (planos ativos) é ${formatMoney(ctx.faturamentoMensal)}, com ${ctx.alunosAtivos} alunos ativos.`
  }

  if (p.includes('frequ')) {
    if (ctx.frequencia === null) {
      return `Não há dados suficientes para calcular a frequência em "${ctx.periodoLabel}".`
    }
    const comparativo =
      ctx.frequenciaAnterior !== null
        ? ` (${formatPP(ctx.frequencia - ctx.frequenciaAnterior)} vs. período anterior)`
        : ''
    return `A frequência em "${ctx.periodoLabel}" está em ${ctx.frequencia.toFixed(1)}%${comparativo}.`
  }

  if (p.includes('mais falta')) {
    if (!ctx.topFaltas) return 'Não há faltas registradas nesse período.'
    return `${ctx.topFaltas.nome} é quem mais faltou no período (${ctx.topFaltas.faltas} faltas).`
  }

  if (p.includes('mais vai') || p.includes('mais frequente') || p.includes('mais presen')) {
    if (!ctx.topPresenca) return 'Não há presenças registradas nesse período.'
    return `${ctx.topPresenca.nome} é o aluno mais frequente do período, com ${ctx.topPresenca.presencas} presenças.`
  }

  if (p.includes('risco')) {
    if (ctx.altoRisco === 0 && ctx.medioRisco === 0) return 'Nenhum aluno em risco de cancelamento no momento.'
    const partes: string[] = []
    if (ctx.altoRisco > 0) partes.push(`${ctx.altoRisco} em risco alto`)
    if (ctx.medioRisco > 0) partes.push(`${ctx.medioRisco} em risco médio`)
    return `Atualmente há ${partes.join(' e ')}. Veja a lista de risco na página para os motivos.`
  }

  return null
}

export default function ChatBot({ contexto }: { contexto: ContextoIA }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      autor: 'bot',
      texto: 'Olá! Sou a IA da LK Pilates. Pergunte sobre frequência, faturamento, riscos ou os alunos deste período.'
    }
  ])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensagens])

  async function enviarMensagem(textoForcado?: string) {
    const pergunta = (textoForcado ?? input).trim()
    if (!pergunta || carregando) return

    setMensagens(prev => [...prev, { autor: 'user', texto: pergunta }])
    setInput('')

    const local = respostaLocal(pergunta, contexto)
    if (local) {
      setMensagens(prev => [...prev, { autor: 'bot', texto: local }])
      return
    }

    setCarregando(true)
    setMensagens(prev => [...prev, { autor: 'bot', texto: 'Analisando os dados...' }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, contexto })
      })

      const data = await response.json()

      setMensagens(prev => {
        const novas = [...prev]
        if (!response.ok) {
          novas[novas.length - 1] = {
            autor: 'bot',
            texto:
              response.status === 503
                ? 'A IA por linguagem natural não está configurada, mas posso responder perguntas diretas sobre faturamento, frequência e riscos.'
                : 'Não consegui falar com a IA agora. Tente novamente em instantes.'
          }
        } else {
          novas[novas.length - 1] = { autor: 'bot', texto: data.resposta }
        }
        return novas
      })
    } catch {
      setMensagens(prev => {
        const novas = [...prev]
        novas[novas.length - 1] = { autor: 'bot', texto: 'Falha de conexão com a IA.' }
        return novas
      })
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className={`${styles.card} ${styles.chatCard}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardTitle}>
          <Bot size={16} strokeWidth={1.75} /> LK IA Assistant
        </span>
        <span className={styles.cardCaption}>Respostas baseadas nos dados de &quot;{contexto.periodoLabel}&quot;</span>
      </div>

      <div className={styles.chatMensagens} ref={scrollRef}>
        {mensagens.map((m, i) => (
          <div key={i} className={`${styles.bolha} ${m.autor === 'user' ? styles.bolhaUser : styles.bolhaBot}`}>
            {m.texto}
          </div>
        ))}
      </div>

      <div className={styles.sugestoes}>
        {SUGESTOES.map(s => (
          <button key={s} className={styles.chip} onClick={() => enviarMensagem(s)} disabled={carregando}>
            {s}
          </button>
        ))}
      </div>

      <div className={styles.chatInputRow}>
        <input
          className={styles.chatInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && enviarMensagem()}
          placeholder="Pergunte algo sobre os resultados..."
          disabled={carregando}
        />
        <button className={styles.chatBtn} onClick={() => enviarMensagem()} disabled={carregando}>
          <Send size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
