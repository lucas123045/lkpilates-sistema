'use client'

import Link from 'next/link'

export default function Dashboard() {
  return (
    <div className="dashboard-container">
      {/* LOGO */}
      <img
        src="/logo-lk-pilates.png"
        alt="LK Pilates"
        className="dashboard-logo"
      />

      {/* TÍTULO */}
      <h1 className="dashboard-title">
        Painel de Controle
      </h1>

      <p className="dashboard-subtitle">
        Gerenciamento completo do estúdio <b>LK Pilates</b>
      </p>

      {/* BOTÕES */}
      <div className="dashboard-actions">
        <Link href="/alunos" className="dashboard-card">
          👤
          <span>Cadastro de Alunos</span>
        </Link>

        <Link href="/aulas" className="dashboard-card">
          📆
          <span>Registro de Aulas</span>
        </Link>

        <Link href="/relatorios" className="dashboard-card">
          📊
          <span>Relatórios</span>
        </Link>
      </div>
    </div>
  )
}
