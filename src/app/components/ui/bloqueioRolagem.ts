'use client'

import { useEffect } from 'react'

/**
 * Trava a rolagem da pagina enquanto houver modal/gaveta aberta.
 *
 * Usa um contador: o primeiro que trava guarda o overflow original e o ultimo
 * que libera o devolve, em qualquer ordem. Antes cada modal guardava e
 * restaurava o valor sozinho; com dois abertos (ex.: aula + "Somente esta /
 * Esta e as proximas") um deles restaurava 'hidden' e a pagina ficava sem
 * rolagem ate atualizar.
 */

type Alvo = { style: { overflow: string } }

let travas = 0
let original = ''

function corpo(): Alvo | null {
  return typeof document === 'undefined' ? null : document.body
}

/** Trava a rolagem e devolve a funcao que libera (chamar mais de uma vez nao tem efeito). */
export function travarRolagem(alvo: Alvo | null = corpo()): () => void {
  if (!alvo) return () => {}
  if (travas === 0) {
    original = alvo.style.overflow === 'hidden' ? '' : alvo.style.overflow
    alvo.style.overflow = 'hidden'
  }
  travas++
  let liberada = false
  return () => {
    if (liberada) return
    liberada = true
    travas = Math.max(0, travas - 1)
    if (travas === 0) alvo.style.overflow = original
  }
}

/** Rede de seguranca (troca de rota): sem nada aberto, a rolagem nao pode ficar travada. */
export function garantirRolagemLivre(alvo: Alvo | null = corpo()) {
  if (alvo && travas === 0 && alvo.style.overflow === 'hidden') alvo.style.overflow = original
}

export function useBloqueioRolagem(ativo: boolean) {
  useEffect(() => (ativo ? travarRolagem() : undefined), [ativo])
}

/** So para testes. */
export function _reiniciarBloqueio() {
  travas = 0
  original = ''
}
