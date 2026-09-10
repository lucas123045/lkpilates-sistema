'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)
  const router = useRouter()

  async function handleLogin() {
    if (entrando) return
    setErro('')
    setEntrando(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErro('Email ou senha incorretos.')
      setEntrando(false)
      return
    }

    router.push('/dashboard')
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
      </div>
    </div>
  )
}
