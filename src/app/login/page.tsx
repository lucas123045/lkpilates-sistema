'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { destinoAposLogin, type Nivel } from '@/lib/acesso'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function handleLogin() {
    if (entrando) return
    setErro('')
    setEntrando(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      setErro('Email ou senha incorretos.')
      setEntrando(false)
      return
    }

    const { data: acesso } = await supabase.from('usuarios_acesso').select('nivel, ativo').eq('user_id', data.user.id).maybeSingle()
    const nivel = acesso?.ativo ? (acesso.nivel as Nivel) : null
    const volta = new URLSearchParams(window.location.search).get('volta')
    // recarrega para o middleware e o menu ja verem a sessao nova
    window.location.assign(destinoAposLogin(nivel, volta))
  }

  return (
    <div className="form-container">
      <img src="/logo-lk-pilates.png" alt="LK Pilates" className="form-logo" />

      <h1 className="form-title">LK Pilates</h1>
      <p className="form-subtitle">Entre para acessar o sistema</p>

      <div className="form-card">
        {erro && <div className="form-error">{erro}</div>}

        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />

        <label className="label">Senha</label>
        <input
          className="input"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
        />

        <button className="btn-primary" onClick={handleLogin} disabled={entrando} style={{ marginTop: 6 }}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 14, textAlign: 'center' }}>
          Esqueceu a senha? Fale com a responsável pelo estúdio.
        </p>
      </div>
    </div>
  )
}
