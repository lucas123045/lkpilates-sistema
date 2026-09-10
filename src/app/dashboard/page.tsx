'use client'

import Link from 'next/link'
import { CalendarCheck, ClipboardList, LineChart, UsersRound } from 'lucide-react'

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
          <UsersRound size={26} strokeWidth={1.75} />
          <span>Cadastro de Alunos</span>
        </Link>

        <Link href="/aulas" className="dashboard-card">
          <CalendarCheck size={26} strokeWidth={1.75} />
          <span>Registro de Aulas</span>
        </Link>

        <Link href="/relatorios" className="dashboard-card">
          <ClipboardList size={26} strokeWidth={1.75} />
          <span>Relatórios</span>
        </Link>

        <Link href="/resultados" className="dashboard-card">
          <LineChart size={26} strokeWidth={1.75} />
          <span>Resultados</span>
        </Link>
      </div>
    </div>
  )
}
