// Autocadastro do cliente (pagina publica /cadastro) e campos de cadastro
// usados tambem no formulario do estudio. Sem React: roda no navegador e
// no servidor (a API valida tudo de novo).

export const somenteDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function cpfValido(v: string) {
  const d = somenteDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digito = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

export function formatarCpf(v: string | null | undefined) {
  const d = somenteDigitos(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

/** (31) 99999-9999 / (31) 3333-4444 */
export function formatarTelefone(v: string | null | undefined) {
  const d = somenteDigitos(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function formatarCep(v: string | null | undefined) {
  const d = somenteDigitos(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export const COMO_CONHECEU = ['Instagram', 'Indicação', 'Google', 'Passei na frente', 'Outro']

/** Endereco pelo CEP (ViaCEP). null = nao encontrado ou sem conexao. */
export async function buscarCep(cep: string): Promise<{ logradouro: string; bairro: string; cidade: string; uf: string } | null> {
  const d = somenteDigitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    const j = await r.json()
    if (!r.ok || j.erro) return null
    return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' }
  } catch {
    return null
  }
}

export type EntradaCadastro = {
  nome: string
  cpf: string
  data_nascimento: string
  telefone: string
  email: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  profissao: string
  como_conheceu: string
  objetivo: string
  saude: string
  aceite_lgpd: boolean
}

export const CADASTRO_VAZIO: EntradaCadastro = {
  nome: '',
  cpf: '',
  data_nascimento: '',
  telefone: '',
  email: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  profissao: '',
  como_conheceu: '',
  objetivo: '',
  saude: '',
  aceite_lgpd: false
}

/** Dados prontos para o banco (texto limpo, CPF/CEP so digitos, telefone formatado). */
export type DadosCadastro = Omit<EntradaCadastro, 'aceite_lgpd' | 'complemento' | 'profissao' | 'como_conheceu' | 'objetivo' | 'saude'> & {
  complemento: string | null
  profissao: string | null
  como_conheceu: string | null
  objetivo: string | null
  saude: string | null
}

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
const textoLongo = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 2000) : '')

/**
 * Valida o formulario. `hoje` = 'AAAA-MM-DD' (para a data de nascimento).
 * Devolve os erros por campo (vazio = valido) e os dados normalizados.
 */
export function validarCadastro(e: Partial<Record<keyof EntradaCadastro, unknown>>, hoje: string) {
  const erros: Partial<Record<keyof EntradaCadastro, string>> = {}
  const nome = texto(e.nome, 120)
  const cpf = somenteDigitos(texto(e.cpf))
  const nascimento = texto(e.data_nascimento, 10)
  const telefone = somenteDigitos(texto(e.telefone))
  const email = texto(e.email, 160).toLowerCase()
  const cep = somenteDigitos(texto(e.cep))
  const uf = texto(e.uf, 2).toUpperCase()

  if (nome.split(' ').filter(Boolean).length < 2) erros.nome = 'Informe o nome completo.'
  if (!cpfValido(cpf)) erros.cpf = 'CPF inválido.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || nascimento >= hoje || nascimento < '1900-01-01') erros.data_nascimento = 'Informe a data de nascimento.'
  if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Informe o telefone com DDD.'
  if (!emailValido(email)) erros.email = 'Informe um e-mail válido.'
  if (cep.length !== 8) erros.cep = 'Informe o CEP.'
  if (!texto(e.logradouro)) erros.logradouro = 'Informe a rua.'
  if (!texto(e.numero, 20)) erros.numero = 'Informe o número.'
  if (!texto(e.bairro)) erros.bairro = 'Informe o bairro.'
  if (!texto(e.cidade)) erros.cidade = 'Informe a cidade.'
  if (!UFS.includes(uf)) erros.uf = 'Informe o estado.'
  if (e.aceite_lgpd !== true) erros.aceite_lgpd = 'É preciso autorizar o uso dos dados para concluir o cadastro.'

  const opcional = (v: unknown) => texto(v) || null
  const dados: DadosCadastro = {
    nome,
    cpf,
    data_nascimento: nascimento,
    telefone: formatarTelefone(telefone),
    email,
    cep,
    logradouro: texto(e.logradouro),
    numero: texto(e.numero, 20),
    complemento: opcional(e.complemento),
    bairro: texto(e.bairro),
    cidade: texto(e.cidade),
    uf,
    profissao: opcional(e.profissao),
    como_conheceu: COMO_CONHECEU.includes(texto(e.como_conheceu)) ? texto(e.como_conheceu) : null,
    objetivo: textoLongo(e.objetivo) || null,
    saude: textoLongo(e.saude) || null
  }
  return { erros, dados }
}

/** Endereco em uma linha, para fichas e listas. */
export function enderecoEmLinha(c: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null }) {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ')
  const partes = [rua + (c.complemento ? ` – ${c.complemento}` : ''), c.bairro, [c.cidade, c.uf].filter(Boolean).join('/'), c.cep ? `CEP ${formatarCep(c.cep)}` : '']
  return partes.filter(Boolean).join(' · ')
}
