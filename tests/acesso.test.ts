import { describe, expect, it } from 'vitest'
import { destinoAposLogin, paginaInicial, podeAcessar } from '@/lib/acesso'

describe('nivel x rota', () => {
  it('nivel 1: so Agenda, Relatorio de alunos e a propria conta', () => {
    for (const r of ['/agenda', '/agenda/horarios-fixos', '/relatorio-alunos', '/relatorios/abc-123', '/minha-conta']) {
      expect(podeAcessar(1, r), r).toBe(true)
    }
    for (const r of ['/dashboard', '/resultados', '/relatorios', '/clientes', '/clientes/1', '/financeiro/entradas', '/planos', '/servicos', '/profissionais', '/empresa', '/aulas', '/usuarios', '/agendamentos', '/relatorios/a/b']) {
      expect(podeAcessar(1, r), r).toBe(false)
    }
  })

  it('nivel 2 acessa tudo; sem nivel so as rotas publicas', () => {
    expect(podeAcessar(2, '/resultados')).toBe(true)
    expect(podeAcessar(2, '/usuarios')).toBe(true)
    expect(podeAcessar(null, '/agenda')).toBe(false)
    expect(podeAcessar(null, '/login')).toBe(true)
    expect(podeAcessar(null, '/')).toBe(true)
  })

  it('pagina inicial e destino depois do login', () => {
    expect(paginaInicial(2)).toBe('/dashboard')
    expect(paginaInicial(1)).toBe('/agenda')
    expect(paginaInicial(null)).toBe('/sem-acesso')
    expect(destinoAposLogin(1, '/relatorio-alunos')).toBe('/relatorio-alunos')
    expect(destinoAposLogin(1, '/financeiro')).toBe('/agenda')
    expect(destinoAposLogin(2, '//site-externo.com')).toBe('/dashboard')
    expect(destinoAposLogin(2, '/login')).toBe('/dashboard')
  })
})
