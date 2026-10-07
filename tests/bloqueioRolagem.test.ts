import { beforeEach, describe, expect, it } from 'vitest'
import { _reiniciarBloqueio, garantirRolagemLivre, travarRolagem } from '@/app/components/ui/bloqueioRolagem'

const novoCorpo = (overflow = '') => ({ style: { overflow } })

describe('bloqueio de rolagem', () => {
  beforeEach(() => _reiniciarBloqueio())

  it('trava ao abrir e devolve o valor original ao fechar', () => {
    const body = novoCorpo('auto')
    const liberar = travarRolagem(body)
    expect(body.style.overflow).toBe('hidden')
    liberar()
    expect(body.style.overflow).toBe('auto')
  })

  it('dois modais: so destrava quando o ultimo fecha, em qualquer ordem', () => {
    const body = novoCorpo()
    const aula = travarRolagem(body)
    const pergunta = travarRolagem(body)

    aula() // o de baixo fecha primeiro
    expect(body.style.overflow).toBe('hidden')
    pergunta()
    expect(body.style.overflow).toBe('')
  })

  it('liberar duas vezes nao destrava o modal que continua aberto', () => {
    const body = novoCorpo()
    const a = travarRolagem(body)
    travarRolagem(body)
    a()
    a()
    expect(body.style.overflow).toBe('hidden')
  })

  it('cenario do bug: aula aberta + "Somente esta / Esta e as proximas" respondida', () => {
    const body = novoCorpo()
    // aula aberta
    let aula = travarRolagem(body)
    // pergunta abre: a pagina redesenha e o efeito da aula roda de novo
    aula()
    aula = travarRolagem(body)
    const pergunta = travarRolagem(body)
    // OK: no mesmo commit o React roda todas as limpezas e depois os efeitos
    aula()
    pergunta()
    aula = travarRolagem(body)
    // aula fecha
    aula()
    expect(body.style.overflow).toBe('')
  })

  it('nunca guarda "hidden" como valor original', () => {
    const body = novoCorpo('hidden') // ficou travado por fora
    const liberar = travarRolagem(body)
    liberar()
    expect(body.style.overflow).toBe('')
  })

  it('troca de rota: destrava se nada estiver aberto, mantem se houver modal', () => {
    const body = novoCorpo('hidden')
    garantirRolagemLivre(body)
    expect(body.style.overflow).toBe('')

    const liberar = travarRolagem(body)
    garantirRolagemLivre(body)
    expect(body.style.overflow).toBe('hidden')
    liberar()
  })
})
