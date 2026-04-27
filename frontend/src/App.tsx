// App.tsx — PrisonSIS Tauri 应用主入口
import { useState } from 'react'
import './index.css'
import GlassSidebar from './components/GlassSidebar'
import GlassHeader from './components/GlassHeader'
import GlassStatusBar from './components/GlassStatusBar'
import LoginPage from './pages/LoginPage'
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

interface User {
  username: string
  real_name: string
  role: string
}

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
  const [user, setUser] = useState<User | null>(() => {
    // 检查本地存储的登录状态
    const saved = localStorage.getItem('prisonsis_user')
    return saved ? JSON.parse(saved) : null
  })

  const PageComponent = pages[currentPage] || HomePage

  const handleLoginSuccess = (loggedInUser: User) => {
    localStorage.setItem('prisonsis_user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }

  const handleLogout = () => {
    localStorage.removeItem('prisonsis_user')
    setUser(null)
  }

  // 未登录显示登录页
  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

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
            user={user}
            onLogout={handleLogout}
          />
        )}

        <div className="content-area">
          <GlassHeader
            currentPage={currentPage}
            onToggleSidebar={() => setSidebarVisible(v => !v)}
            onThemeSwitch={() => {}}
            user={user}
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
