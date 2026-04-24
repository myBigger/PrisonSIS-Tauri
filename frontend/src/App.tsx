// App.tsx — PrisonSIS Tauri 应用主入口
import React, { useState } from 'react'
import './index.css'
import GlassSidebar from './components/GlassSidebar'
import GlassHeader from './components/GlassHeader'
import GlassStatusBar from './components/GlassStatusBar'
import HomePage from './pages/HomePage'
import CriminalListPage from './pages/CriminalListPage'
import RecordsPage from './pages/RecordsPage'
import ApprovalsPage from './pages/ApprovalsPage'
import CasesPage from './pages/CasesPage'
import ArchivePage from './pages/ArchivePage'
import StatsPage from './pages/StatsPage'
import TemplatesPage from './pages/TemplatesPage'
import ExportPage from './pages/ExportPage'
import UsersPage from './pages/UsersPage'
import BackupPage from './pages/BackupPage'
import LogsPage from './pages/LogsPage'

const pages: Record<string, React.FC> = {
  home: HomePage,
  criminals: CriminalListPage,
  records: RecordsPage,
  approvals: ApprovalsPage,
  cases: CasesPage,
  archive: ArchivePage,
  stats: StatsPage,
  templates: TemplatesPage,
  export: ExportPage,
  users: UsersPage,
  backup: BackupPage,
  logs: LogsPage,
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const PageComponent = pages[currentPage] || HomePage

  return (
    <>
      <div className="app-background">
        <div className="glow-orb-bottom" />
      </div>

      <div className="app-shell">
        {sidebarVisible && (
          <GlassSidebar
            currentPage={currentPage}
            onNavigate={setCurrentPage}
          />
        )}

        <div className="content-area">
          <GlassHeader
            currentPage={currentPage}
            onToggleSidebar={() => setSidebarVisible(v => !v)}
            onThemeSwitch={() => {}}
          />

          <div className="glass-panel">
            <PageComponent key={currentPage} />
          </div>

          <GlassStatusBar />
        </div>
      </div>
    </>
  )
}
