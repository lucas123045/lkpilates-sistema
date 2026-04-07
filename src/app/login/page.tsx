
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) router.push('/dashboard')
  }

  return (
    <main>
      <h1>LK Pilates Manager</h1>
      <input placeholder="Email" onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Senha" type="password" onChange={e=>setPassword(e.target.value)} />
      <button onClick={handleLogin}>Entrar</button>
    </main>
  )
}
