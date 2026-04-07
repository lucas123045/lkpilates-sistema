import { supabase } from "@/lib/supabase"
import GraficoFaturamento from "./grafico"
export default async function ResultadosPage() {

  // ============================
  // 🔥 BUSCAR DADOS
  // ============================
  const { data: alunos, error } = await supabase
    .from('alunos')
    .select(`
      id,
      nome,
      plano,
      total_aulas,
      aulas_restantes,
      valor_plano,
      pagou_em,
      aulas: aulas (
        id,
        data,
        status
      )
    `)

  if (error || !alunos) {
    console.log(error)
    return <div>Erro ao carregar dados</div>
  }

  // ============================
  // 🧹 FILTRO
  // ============================
  const alunosFiltrados = alunos
    .filter(a => a.nome && a.nome.trim() !== "")
    .filter(a => {
      const nome = a.nome.toLowerCase()
      return !(
        nome.includes("teste") ||
        nome.includes("das") ||
        nome.includes("lucas klein") ||
        nome.includes("veiga")
      )
    })

  // ============================
  // 🧠 FUNÇÕES
  // ============================
  const isPresente = (status: string) => {
    if (!status) return false
    const s = status.toLowerCase()
    return s === "veio" || s === "reposição"
  }

  const formatMoney = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
// 📅 limite de análise
const hoje = new Date()
const limite = new Date()
limite.setDate(hoje.getDate() - 30)
function parseData(dataStr: string) {
  if (!dataStr) return null

  if (dataStr.includes("/")) {
    const [dia, mes, ano] = dataStr.split("/")
    return new Date(Number(ano), Number(mes) - 1, Number(dia))
  }

  const d = new Date(dataStr)
  return isNaN(d.getTime()) ? null : d
}
  // ============================
  // 💰 FATURAMENTO TOTAL
  // ============================
  const faturamentoTotal = alunosFiltrados.reduce(
    (total, a) => total + (a.valor_plano || 0),
    0
  )

  // ============================
  // 📊 PRESENÇA
  // ============================
  
  let totalPresencas = 0
  let totalFaltas = 0

  alunosFiltrados.forEach(a => {
  const aulas = (a.aulas || []).filter(aula => {
    const data = parseData(aula.data)
    return data && data >= limite
  })

  aulas.forEach(aula => {
    if (isPresente(aula.status)) totalPresencas++
    else totalFaltas++
  })
})
  const taxaFalta = totalFaltas / (totalPresencas + totalFaltas || 1)

  
 // ============================
// 📅 FATURAMENTO POR MÊS
// ============================
const faturamentoPorMes: Record<string, number> = {}

alunosFiltrados.forEach(a => {
  const aulas = a.aulas || []

  aulas.forEach(aula => {
    if (!aula.data) return

    let data: Date

    // 🔥 detecta formato automaticamente
    if (aula.data.includes("/")) {
      // formato BR
      const [dia, mes, ano] = aula.data.split("/")
      data = new Date(Number(ano), Number(mes) - 1, Number(dia))
    } else {
      // formato ISO (supabase)
      data = new Date(aula.data)
    }

    if (isNaN(data.getTime())) return

    const mes = String(data.getMonth() + 1).padStart(2, "0")
    const ano = data.getFullYear()

    const chave = `${mes}/${ano}`

    const valorPorAula =
      (a.valor_plano || 0) / (a.total_aulas || 1)

    if (!faturamentoPorMes[chave]) {
      faturamentoPorMes[chave] = 0
    }

    faturamentoPorMes[chave] += valorPorAula
  })
})

const dadosGrafico: { label: string; valor: number }[] =
  Object.entries(faturamentoPorMes)
    .map(([mes, valor]) => ({
      label: mes,
      valor: Math.round(valor)
    }))
  // ============================
// 🤖 CHURN AVANÇADO (30 DIAS)
// ============================
const churnAvancado = alunosFiltrados.map(a => {

  // 🔥 FILTRA SÓ ÚLTIMOS 30 DIAS
  const aulas = (a.aulas || []).filter(aula => {
    const data = parseData(aula.data)
    return data && data >= limite
  })

  const faltas = aulas.filter(x => !isPresente(x.status)).length
  const presencas = aulas.filter(x => isPresente(x.status)).length

  const total = presencas + faltas
  const freq = total > 0 ? presencas / total : 0

  // 📅 última aula (dentro do período)
  const ultimaAula = aulas
    .map(x => parseData(x.data))
    .filter(d => d !== null)
    .sort((a, b) => b!.getTime() - a!.getTime())[0]

  let diasSemIr = 30 // default alto (se não veio no mês)

  if (ultimaAula) {
    diasSemIr = Math.floor(
      (hoje.getTime() - ultimaAula.getTime()) / (1000 * 60 * 60 * 24)
    )
  }

  // 🧠 SCORE MAIS REAL
  const score =
    (faltas * 2) +
    (1 - freq) * 10 +
    (diasSemIr > 10 ? 5 : 0)

  let risco = "🟢 BAIXO"
  let motivo = "Frequência saudável"
  let sugestao = "Manter relacionamento"

  // 🔴 ALTO
  if (score > 15) {
    risco = "🔴 ALTO"

    if (diasSemIr > 10) {
      motivo = `Não veio há ${diasSemIr} dias`
      sugestao = "Chamar no WhatsApp urgente"
    } else if (faltas > presencas) {
      motivo = "Mais faltas que presenças"
      sugestao = "Reavaliar plano"
    } else {
      motivo = "Queda de frequência"
      sugestao = "Oferecer incentivo"
    }
  }

  // 🟡 MÉDIO
  else if (score > 8) {
    risco = "🟡 MÉDIO"

    if (freq < 0.6) {
      motivo = "Baixo engajamento"
      sugestao = "Acompanhar aluno"
    } else {
      motivo = "Oscilação de frequência"
      sugestao = "Oferecer reposição"
    }
  }

  return {
    nome: a.nome,
    risco,
    score: Math.round(score),
    faltas,
    presencas,
    diasSemIr,
    motivo,
    sugestao
  }
})
  // ============================
 // ============================
// 🚨 ALERTAS / INSIGHTS
// ============================

// 🔥 calcula riscos (ANTES de usar)
const altoRisco = churnAvancado.filter(c =>
  c.risco.includes("ALTO")
)

const medioRisco = churnAvancado.filter(c =>
  c.risco.includes("MÉDIO")
)

// 🧠 tipo dos insights
type Insight = {
  titulo: string
  descricao: string
  nivel: "alto" | "medio" | "info"
}

// 📊 lista de insights
const insights: Insight[] = []

// 🔴 ALTO RISCO
if (altoRisco.length > 0) {
  insights.push({
    titulo: `🚨 ${altoRisco.length} alunos com alto risco`,
    descricao:
      "Esses alunos estão faltando muito ou ficaram vários dias sem vir.",
    nivel: "alto"
  })
}

// 🟡 MÉDIO RISCO
if (medioRisco.length > 3) {
  insights.push({
    titulo: `⚠️ ${medioRisco.length} alunos com risco médio`,
    descricao:
      "Frequência irregular, podem cancelar se não houver ação.",
    nivel: "medio"
  })
}

// 📉 QUEDA DE FATURAMENTO
if (dadosGrafico.length >= 2) {
  const ultimo = dadosGrafico[dadosGrafico.length - 1].valor
  const anterior = dadosGrafico[dadosGrafico.length - 2].valor

  if (ultimo < anterior) {
    insights.push({
      titulo: "📉 Queda no faturamento",
      descricao:
        "O faturamento caiu em relação ao mês anterior.",
      nivel: "alto"
    })
  }
}
  // ============================
  // 🎨 STYLE
  // ============================
  const card = {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
    flex: 1
  }

  // ============================
  // 🖥️ UI
  // ============================
  // ============================
// 🏆 RANKINGS
// ============================

// 💰 Quem paga mais
const rankingValor = alunosFiltrados
  .map(a => ({
    nome: a.nome,
    valor: a.valor_plano || 0
  }))
  .sort((a, b) => b.valor - a.valor)


// 🏆 Quem mais vai (presença)
const rankingPresenca = alunosFiltrados
  .map(a => {
    const presencas =
      a.aulas?.filter(x => isPresente(x.status)).length || 0

    return {
      nome: a.nome,
      presencas
    }
  })
  .sort((a, b) => b.presencas - a.presencas)


// ⚠️ Quem mais falta
const rankingFaltas = alunosFiltrados
  .map(a => {
    const faltas =
      a.aulas?.filter(x => !isPresente(x.status)).length || 0

    return {
      nome: a.nome,
      faltas
    }
  })
  .sort((a, b) => b.faltas - a.faltas)
  return (
    <div style={{ padding: 30, background: "#f5f7fa", minHeight: "100vh" }}>

      <h1 style={{ fontSize: 28 }}>📊 Dashboard</h1>

      {/* CARDS */}
      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>

        <div style={card}>
          <h3>💰 Faturamento</h3>
          <p>{formatMoney(faturamentoTotal)}</p>
        </div>

        <div style={card}>
          <h3>📉 Taxa de Falta</h3>
          <p>{(taxaFalta * 100).toFixed(1)}%</p>
        </div>

        <div style={card}>
          <h3>👥 Alunos</h3>
          <p>{alunosFiltrados.length}</p>
        </div>

      </div>

      <div style={{ marginTop: 20 }}>
  <h2>🤖 Insights</h2>

  {insights.length === 0 && (
    <p>✅ Nenhum problema identificado</p>
  )}

  {insights.map((i, index) => (
    <div
      key={index}
      style={{
        background: "#fff",
        padding: 12,
        borderRadius: 10,
        marginBottom: 10,
        borderLeft:
          i.nivel === "alto"
            ? "5px solid red"
            : i.nivel === "medio"
            ? "5px solid orange"
            : "5px solid green"
      }}
    >
      <strong>{i.titulo}</strong>
      <p style={{ margin: 0 }}>{i.descricao}</p>
    </div>
  ))}
  <div style={{
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 20,
  marginTop: 30
}}>

  {/* 💰 PAGA MAIS */}
  <div style={{
    background: "#fff",
    padding: 15,
    borderRadius: 12
  }}>
    <h3>💰 Quem paga mais</h3>
    {rankingValor.slice(0, 3).map((a, i) => (
      <div key={i}>
        {i + 1}. {a.nome} - R$ {a.valor}
      </div>
    ))}
  </div>

  {/* 🏆 MAIS VAI */}
  <div style={{
    background: "#fff",
    padding: 15,
    borderRadius: 12
  }}>
    <h3>🏆 Quem mais vai</h3>
    {rankingPresenca.slice(0, 3).map((a, i) => (
      <div key={i}>
        {i + 1}. {a.nome} - {a.presencas} aulas
      </div>
    ))}
  </div>

  {/* ⚠️ MAIS FALTA */}
  <div style={{
    background: "#fff",
    padding: 15,
    borderRadius: 12
  }}>
    <h3>⚠️ Quem mais falta</h3>
    {rankingFaltas.slice(0, 3).map((a, i) => (
      <div key={i}>
        {i + 1}. {a.nome} - {a.faltas} faltas
      </div>
    ))}
  </div>

</div>
</div>
      {/* FATURAMENTO MENSAL */}
      <div style={{ marginTop: 30 }}>
  <h2>📅 Faturamento Mensal</h2>

  <GraficoFaturamento data={dadosGrafico} />
</div>

      {/* CHURN */}
      <div style={{ marginTop: 30 }}>
  <h2>🚨 Risco de Cancelamento (IA)</h2>

  {churnAvancado
    .filter(c => c.risco !== "BAIXO")
    .slice(0, 5)
    .map((c, i) => (
      <div key={i} style={{ marginBottom: 10 }}>
        <strong>{c.nome}</strong> - {c.risco}
        <br />
        📉 Motivo: {c.motivo}
        <br />
        💡 Sugestão: {c.sugestao}
      </div>
    ))}
</div>

    </div>
  )
}