/**
 * Niveis de acesso do sistema (fonte da verdade: tabela usuarios_acesso).
 *   Nivel 1: Agenda e Relatorio de alunos.
 *   Nivel 2: acesso total (dona do estudio) e gestao dos logins.
 * O banco aplica as mesmas regras nas policies (migration 202610070002);
 * aqui elas so decidem menu e rotas. Usado no middleware: sem React.
 */

export type Nivel = 1 | 2

export const ROTULO_NIVEL: Record<Nivel, string> = {
  1: 'Nível 1 – Agenda e Relatório de alunos',
  2: 'Nível 2 – Acesso total'
}

/** Rotas abertas sem login. */
export const ROTAS_PUBLICAS = ['/login', '/cadastro', '/sem-acesso']

/** Rotas do nivel 1 (e subrotas). */
export const ROTAS_NIVEL1 = ['/agenda', '/relatorio-alunos']

const casa = (caminho: string, rota: string) => caminho === rota || caminho.startsWith(rota + '/')

export function rotaPublica(caminho: string) {
  return caminho === '/' || ROTAS_PUBLICAS.some(r => casa(caminho, r))
}

/** Rotas que qualquer usuario logado acessa (ex.: trocar a propria senha). */
const ROTAS_TODOS = ['/minha-conta']

/** "Ver relatorio completo" do Relatorio de alunos (/relatorios/<aluno>); /relatorios em si e do nivel 2. */
const relatorioDoAluno = (caminho: string) => /^\/relatorios\/[^/]+\/?$/.test(caminho)

export function podeAcessar(nivel: Nivel | null, caminho: string) {
  if (rotaPublica(caminho)) return true
  if (nivel === 2) return true
  if (nivel === 1) return [...ROTAS_NIVEL1, ...ROTAS_TODOS].some(r => casa(caminho, r)) || relatorioDoAluno(caminho)
  return false
}

/** Para onde vai depois do login (ou ao abrir o sistema). */
export function paginaInicial(nivel: Nivel | null) {
  if (nivel === 2) return '/dashboard'
  if (nivel === 1) return '/agenda'
  return '/sem-acesso'
}

/** Destino seguro vindo de ?volta= (so caminhos internos permitidos ao nivel). */
export function destinoAposLogin(nivel: Nivel | null, volta: string | null) {
  if (volta && volta.startsWith('/') && !volta.startsWith('//') && !rotaPublica(volta) && podeAcessar(nivel, volta)) return volta
  return paginaInicial(nivel)
}
