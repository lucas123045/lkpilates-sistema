'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { desfazerAula, registrarAula as registrarAulaNoBanco, dataLocalISO } from '@/lib/aulas'
import { useRouter } from 'next/navigation'
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/* ================== TIPOS ================== */

type Aula = {
  id: number
  data: string
  status: 'veio' | 'faltou' | 'reposicao' | 'reinicio'
  tipo?: string
  observacao?: string | null
  deleted_at?: string | null
}

type Aluno = {
  id: string
  nome: string
  ativo: boolean
  plano: string
  total_aulas: number
  aulas_restantes: number
  valor_plano: number
  pagou_em: string | null
  data_reinicio?: string | null
  aulas: Aula[]
}

/* ================== UTIL ================== */

function formatarDataBR(data: string) {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function nomeStatus(status: Aula['status']) {
  return status === 'veio'
    ? 'Presente'
    : status === 'faltou'
    ? 'Falta'
    : status === 'reposicao'
    ? 'Reposicao'
    : 'Reinicio'
}

/* ================== COMPONENTE ================== */

export default function Relatorios() {
  const router = useRouter()

  function baixarArquivo(conteudo: string, nome: string, tipo: string) {
    const blob = new Blob([conteudo], { type: tipo })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = nome
    link.click()
    URL.revokeObjectURL(url)
  }

  function gerarPDFAluno(aluno: Aluno) {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const margem = 16
    const largura = 178
    let y = 18

    const linha = (texto: string, tamanho = 10, espacamento = 6) => {
      pdf.setFontSize(tamanho)
      const linhas = pdf.splitTextToSize(texto, largura) as string[]
      for (const item of linhas) {
        if (y > 278) {
          pdf.addPage()
          y = 18
        }
        pdf.text(item, margem, y)
        y += espacamento
      }
    }

    pdf.setFont('helvetica', 'bold')
    linha('LK Pilates - Historico do aluno', 16, 9)
    pdf.setFont('helvetica', 'normal')
    linha(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 9, 8)
    y += 4

    pdf.setFont('helvetica', 'bold')
    linha(aluno.nome, 14, 8)
    pdf.setFont('helvetica', 'normal')
    linha(`Status: ${aluno.ativo ? 'Ativo' : 'Inativo'}`)
    linha(`Plano: ${aluno.plano || '-'}`)
    linha(`Aulas contratadas: ${aluno.total_aulas}`)
    linha(`Aulas restantes: ${aluno.aulas_restantes}`)
    linha(`Valor do plano: R$ ${Number(aluno.valor_plano || 0).toFixed(2)}`)
    linha(`Pagamento: ${aluno.pagou_em || '-'}`)
    y += 5

    pdf.setFont('helvetica', 'bold')
    linha('Historico de aulas', 12, 8)
    pdf.setFont('helvetica', 'normal')

    if (!aluno.aulas.length) {
      linha('Nenhum registro de aula encontrado.')
    } else {
      for (const aula of aluno.aulas) {
        const detalhes = [
          `${formatarDataBR(aula.data)} - ${nomeStatus(aula.status)}`,
          aula.tipo ? `Tipo: ${aula.tipo}` : '',
          aula.observacao ? `Observacao: ${aula.observacao}` : ''
        ].filter(Boolean).join(' | ')
        linha(detalhes, 10, 6)
      }
    }

    pdf.save(`aluno-${aluno.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || aluno.id}.pdf`)
  }

  async function fazerBackup() {
    const { data: alunosBackup, error: erroAlunos } = await supabase
      .from('alunos')
      .select('*')
      .order('nome')

    if (erroAlunos) {
      alert(`Nao foi possivel criar o backup: ${erroAlunos.message}`)
      return
    }

    const { data: aulasBackup, error: erroAulas } = await supabase
      .from('aulas')
      .select('*')
      .order('data', { ascending: false })

    if (erroAulas) {
      alert(`Nao foi possivel criar o backup: ${erroAulas.message}`)
      return
    }

    baixarArquivo(
      JSON.stringify({
        sistema: 'LK Pilates',
        versao_backup: 1,
        gerado_em: new Date().toISOString(),
        alunos: alunosBackup || [],
        aulas: aulasBackup || []
      }, null, 2),
      `backup-lk-pilates-${dataLocalISO()}.json`,
      'application/json;charset=utf-8'
    )
  }

const gerarPDF = async () => {
  const pdf = new jsPDF("p", "mm", "a4");

  const cards = document.querySelectorAll(".card");

  if (!cards.length) {
    alert("Nenhum aluno encontrado");
    return;
  }

  let isFirstPage = true;

  for (const card of cards) {
    const clone = card.cloneNode(true) as HTMLElement;

    // remove botões
    clone.querySelectorAll(".botoes").forEach(el => el.remove());

    clone.style.background = "#fff";
    clone.style.padding = "16px";
    clone.style.width = "800px";

    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    document.body.appendChild(clone);

    await new Promise(r => setTimeout(r, 100));

    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#ffffff"
    });

    document.body.removeChild(clone);

    const imgData = canvas.toDataURL("image/jpeg", 1.0);

    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (!isFirstPage) {
      pdf.addPage();
    }

    pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);

    isFirstPage = false;
  }

  pdf.save("relatorio_geral.pdf");
};
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [busca, setBusca] = useState('')
  const [mostrarDatas, setMostrarDatas] = useState(true)
  const [excecoesDatas, setExcecoesDatas] = useState<Record<string, boolean>>({})

  function datasVisiveis(alunoId: string) {
    return excecoesDatas[alunoId] ?? mostrarDatas
  }

  function alternarDatasAluno(alunoId: string) {
    setExcecoesDatas(prev => ({ ...prev, [alunoId]: !datasVisiveis(alunoId) }))
  }


  /* ---------- CARREGAR ALUNOS ---------- */
  async function carregarAlunos() {
    const { data, error } = await supabase
      .from('alunos')
      .select(`
        id,
        nome,
        ativo,
        plano,
        total_aulas,
        aulas_restantes,
        valor_plano,
        pagou_em,
        aulas: aulas (
          id,
          data,
          status,
          tipo,
          observacao,
          deleted_at
        )
      `)
      
      .order('nome')

    if (error) {
      console.error('ERRO SUPABASE:', error)
      return
    }
    const clientesAtivos = alunos.filter(a => a.ativo)

    const alunosOrdenados = (data || []).map((aluno: any) => ({
      ...aluno,
      data_reinicio: aluno.data_reinicio || null, // 🔥 não quebra se não existir
      aulas: [...(aluno.aulas || [])].filter(aula => !aula.deleted_at).sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
      )
    }))

    setAlunos(alunosOrdenados)
  }

  useEffect(() => {
    carregarAlunos()
  }, [])

  /* ---------- REGISTRAR AULA ---------- */
  async function registrarAula(aluno: Aluno, status: 'veio' | 'faltou') {
    if (aluno.aulas_restantes <= 0) {
      alert('Este plano já chegou ao limite de aulas.')
      return
    }

    try {
      await registrarAulaNoBanco(aluno.id, status, dataLocalISO())
      await carregarAlunos()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao registrar aula')
    }
  }

  async function registrarReposicao(aluno: Aluno) {
    try {
      await registrarAulaNoBanco(aluno.id, 'reposicao', dataLocalISO())
      await carregarAlunos()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao registrar reposição')
    }
  }
  

  /* ---------- DESFAZER ÚLTIMA AULA ---------- */
  async function desfazerUltimaAula(aluno: Aluno) {
    const { data: ultimaAula } = await supabase
      .from('aulas')
      .select('id')
      .eq('aluno_id', aluno.id)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .limit(1)
      .single()

    if (!ultimaAula) {
      alert('Nenhuma aula para desfazer')
      return
    }

    try {
      await desfazerAula(ultimaAula.id)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao desfazer aula')
      return
    }

    await carregarAlunos()
  }

  /* ---------- REINICIAR PLANO ---------- */
  async function reiniciarPlano(aluno: Aluno) {
  const confirmar = confirm(
    `Deseja reiniciar o plano de ${aluno.nome}?`
  )

  if (!confirmar) return

  const hoje = new Date()
  const dataLocal = new Date(
    hoje.getTime() - hoje.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 10)

  // 🔴 1. cria registro de reinício
  try {
    await registrarAulaNoBanco(aluno.id, 'reinicio', dataLocal)
  } catch (error) {
    console.error(error)
    alert(error instanceof Error ? error.message : 'Erro ao registrar reinício')
    return
  }

  // 🔴 2. reseta aulas
  const { error: erroPlano } = await supabase
    .from('alunos')
    .update({
      aulas_restantes: aluno.total_aulas
    })
    .eq('id', aluno.id)

  if (erroPlano) {
    console.error(erroPlano)
    alert('Erro ao reiniciar plano')
    return
  }

  await carregarAlunos()
}

  /* ---------- EDITAR / APAGAR DATA ---------- */
  async function editarDataAula(aula: Aula, aluno: Aluno) {
    const acao = prompt(
      'O que deseja fazer?\n\n1 - Alterar data\n2 - Apagar esta data'
    )

    if (!acao) return

    if (acao === '2') {
      const confirmar = confirm('Deseja realmente apagar esta data?')
      if (!confirmar) return

      try {
        await desfazerAula(aula.id)
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Erro ao cancelar aula')
        return
      }

      await carregarAlunos()
      return
    }

    if (acao === '1') {
      const novaData = prompt(
        'Digite a nova data (AAAA-MM-DD):',
        aula.data.slice(0, 10)
      )

      if (!novaData) return

      if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
        alert('Formato inválido.')
        return
      }

      await supabase
        .from('aulas')
        .update({ data: `${novaData}T00:00:00` })
        .eq('id', aula.id)

      await carregarAlunos()
    }
  }

  /* ---------- EDITAR DADOS ---------- */
  async function editarAluno(aluno: Aluno) {
    const novoPlano = prompt('Plano:', aluno.plano)
    const novoValor = prompt('Valor do plano:', String(aluno.valor_plano))
    const novoTotal = prompt('Total de aulas:', String(aluno.total_aulas))
    const novoPagouEm = prompt('Pagamento:', aluno.pagou_em || '')

    if (!novoPlano || !novoValor || !novoTotal) return

    const diferenca = Number(novoTotal) - aluno.total_aulas

    await supabase
      .from('alunos')
      .update({
        plano: novoPlano,
        valor_plano: Number(novoValor),
        total_aulas: Number(novoTotal),
        aulas_restantes: aluno.aulas_restantes + diferenca,
        pagou_em: novoPagouEm || null
      })
      .eq('id', aluno.id)

    await carregarAlunos()
  }

  /* ---------- CORRIGIR AULAS ---------- */
  async function corrigirAulas(aluno: Aluno) {
    const novoValor = prompt(
      `Corrigir aulas restantes de ${aluno.nome}\n\nTotal: ${aluno.total_aulas}\nAtual: ${aluno.aulas_restantes}`,
      String(aluno.aulas_restantes)
    )

    if (novoValor === null) return

    const numero = Number(novoValor)

    if (isNaN(numero) || numero < 0 || numero > aluno.total_aulas) {
      alert('Número inválido')
      return
    }

    await supabase
      .from('alunos')
      .update({ aulas_restantes: numero })
      .eq('id', aluno.id)

    await carregarAlunos()
  }

  /* ---------- APAGAR FICHA ---------- */
  async function apagarFicha(aluno: Aluno) {
    const confirmacao = confirm(
      `Tem certeza que deseja apagar a ficha de ${aluno.nome}?`
    )

    if (!confirmacao) return

    await supabase.from('alunos').update({ ativo: false }).eq('id', aluno.id)

    await carregarAlunos()
  }
  // 🔴 INATIVAR ALUNO (mantém dados, mas não aparece mais)
  const inativarAluno = async (id: string) => {
  const { error } = await supabase
    .from("alunos")
    .update({ ativo: false })
    .eq("id", id);

  if (!error) {
    carregarAlunos();
  }
};
// 🔴 ATIVAR ALUNO
  const ativarAluno = async (id: string) => {
  const { error } = await supabase
    .from("alunos")
    .update({ ativo: true })
    .eq("id", id);

  if (!error) {
    carregarAlunos();
  }
};
  /* ---------- FILTRO ---------- */
  const filtrados = alunos.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase())
  )

  /* ================== JSX ================== */

  return (
    <div className="container">
      <div className="topo">
        <img src="/logo-lk-pilates.png" className="logo" />
      </div>

      <h1>Relatório de Alunos</h1>
<button
  onClick={gerarPDF}
  className="btn btn-sec"
  style={{ marginBottom: 20 }}
>
  Baixar PDF
</button>
<button
  onClick={fazerBackup}
  className="btn btn-sec"
  style={{ marginBottom: 20, marginLeft: 8 }}
>
  Backup dos dados
</button>
<button
  onClick={() => setMostrarDatas(v => !v)}
  className="btn btn-sec"
  style={{ marginBottom: 20, marginLeft: 8 }}
  title={mostrarDatas ? 'Ocultar datas das aulas' : 'Mostrar datas das aulas'}
>
  {mostrarDatas ? '👁️ Ocultar datas' : '🙈 Mostrar datas'}
</button>
      <input
        className="search"
        placeholder="Pesquisar aluno..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      <div id="relatorios-pdf">
  {filtrados.map(aluno => (
    <div key={aluno.id} className="card">

      {datasVisiveis(aluno.id) && (
        <div className="datas-container">
          {(aluno.aulas || []).map((aula: any) => {
            return (
              <span
                key={aula.id}
                className={`data-badge ${aula.status}`}
                onClick={() =>
                  aula.status !== 'reinicio' && editarDataAula(aula, aluno)
                }
                style={
                  aula.status === 'reposicao'
                    ? { backgroundColor: '#FFD700', color: '#000' }
                    : aula.status === 'reinicio'
                    ? { backgroundColor: '#ccc', color: '#555' }
                    : undefined
                }
              >
                {formatarDataBR(aula.data)}{" "}

                {aula.status === 'reinicio' ? ' (reinício)' : ''}
              </span>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
  <strong>{aluno.nome}</strong>

  {!aluno.ativo && (
    <span
      style={{
        background: '#ff4d4f',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '12px'
      }}
    >
      Inativado
    </span>
  )}

  <button
    onClick={() => alternarDatasAluno(aluno.id)}
    className="btn btn-sec"
    style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
    title={datasVisiveis(aluno.id) ? 'Ocultar datas deste aluno' : 'Mostrar datas deste aluno'}
  >
    {datasVisiveis(aluno.id) ? '👁️ Ocultar datas' : '🙈 Mostrar datas'}
  </button>
</div>

      <p><b>Plano:</b> {aluno.plano}</p>
      <p><b>Aulas:</b> {aluno.aulas_restantes} / {aluno.total_aulas}</p>
      <p><b>Valor:</b> R$ {aluno.valor_plano}</p>
      <p><b>Pagamento:</b> {aluno.pagou_em || '—'}</p>

      <div className="botoes">
        <button className="btn btn-veio" onClick={() => registrarAula(aluno, 'veio')}>
          Veio
        </button>

        <button className="btn btn-faltou" onClick={() => registrarAula(aluno, 'faltou')}>
          Faltou
        </button>

        <button className="btn btn-reposicao" onClick={() => registrarReposicao(aluno)}>
          Reposição
        </button>

        <button className="btn btn-sec" onClick={() => desfazerUltimaAula(aluno)}>
          Desfazer última
        </button>

        <button className="btn btn-sec" onClick={() => reiniciarPlano(aluno)}>
          Reiniciar plano
        </button>

        <button className="btn btn-sec" onClick={() => editarAluno(aluno)}>
          Editar dados
        </button>

        <button
          className="btn btn-sec"
          onClick={() => router.push(`/relatorios/${aluno.id}`)}
        >
          Ver relatório completo
        </button>

        <button
          className="btn btn-sec"
          onClick={() => gerarPDFAluno(aluno)}
        >
          PDF aluno
        </button>

       <button className="btn btn-sec" onClick={() => corrigirAulas(aluno)}>
  Corrigir aulas
</button>

        {!aluno.ativo ? (
          <button
            onClick={() => ativarAluno(aluno.id)}
            className="botao-acao botao-ativar"
          >
            Ativar aluno
          </button>
        ) : (
          <button
            onClick={() => inativarAluno(aluno.id)}
            className="botao-acao botao-inativar"
          >
            Inativar aluno
          </button>
        )}
      </div>
    </div>
  ))}
</div>

    </div>
  )
}