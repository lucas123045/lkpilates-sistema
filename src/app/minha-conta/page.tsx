'use client'

import { useState } from 'react'
import { mensagemDeErro, useFeedback } from '@/app/components/ui/Feedback'
import PageHeader from '@/app/components/shell/PageHeader'
import { sair, useUsuario } from '@/app/components/shell/Usuario'
import { ROTULO_NIVEL } from '@/lib/acesso'
import { trocarMinhaSenha } from '@/lib/usuarios'
import '@/app/components/ui/ui.css'

const SENHA_MINIMA = 6

export default function MinhaConta() {
  const { toast } = useFeedback()
  const usuario = useUsuario()
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [salvando, setSalvando] = useState(false)

  const curta = senha.length > 0 && senha.length < SENHA_MINIMA
  const diferente = repetir.length > 0 && repetir !== senha
  const valido = senha.length >= SENHA_MINIMA && senha === repetir

  async function salvar() {
    setSalvando(true)
    try {
      await trocarMinhaSenha(senha)
      setSenha('')
      setRepetir('')
      toast('Senha alterada.')
    } catch (e) {
      toast(mensagemDeErro(e), 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <PageHeader trilha={[{ rotulo: 'Minha conta' }]} />
      <div className="ph-corpo">
        <div className="painel" style={{ padding: 20, maxWidth: 480 }}>
          <h2 style={{ marginBottom: 4 }}>{usuario.nome ?? 'Minha conta'}</h2>
          <p style={{ color: 'var(--ink-500)', marginBottom: 4 }}>{usuario.email}</p>
          {usuario.nivel && <p style={{ color: 'var(--ink-500)', marginBottom: 20 }}>{ROTULO_NIVEL[usuario.nivel]}</p>}

          <h3 style={{ marginBottom: 10 }}>Trocar senha</h3>
          <div className="ui-campo">
            <label className="label">Nova senha</label>
            <input className="input" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
            {curta && <p style={{ fontSize: 12.5, color: '#b4480b', marginTop: 6 }}>Use pelo menos {SENHA_MINIMA} caracteres.</p>}
          </div>
          <div className="ui-campo">
            <label className="label">Repita a nova senha</label>
            <input className="input" type="password" value={repetir} onChange={e => setRepetir(e.target.value)} autoComplete="new-password" />
            {diferente && <p style={{ fontSize: 12.5, color: '#b4480b', marginTop: 6 }}>As senhas não são iguais.</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn ui-btn-azul" disabled={salvando || !valido} onClick={salvar}>Salvar nova senha</button>
            <button className="btn btn-sec" onClick={sair}>Sair do sistema</button>
          </div>
        </div>
      </div>
    </>
  )
}
