// App.tsx — PrisonSIS Tauri 应用主入口
import { useEffect, useState } from 'react'
import './index.css'
import GlassSidebar, { pageAllowed } from './components/GlassSidebar'
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
import { runGlobalSearch, type GlobalSearchResultGroup } from './lib/globalSearch'
import GlobalSearchPanel from './components/GlobalSearchPanel'

interface User {
  user_id: string
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
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('prisonsis_theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [user, setUser] = useState<User | null>(() => {
    // 检查本地存储的登录状态
    const saved = localStorage.getItem('prisonsis_user')
    return saved ? JSON.parse(saved) : null
  })
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [globalSearchError, setGlobalSearchError] = useState<string | null>(null)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResultGroup[]>([])

  const PageComponent = pages[currentPage] || HomePage

  const handleLoginSuccess = (loggedInUser: User) => {
    localStorage.setItem('prisonsis_user', JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }

  const handleLogout = () => {
    localStorage.removeItem('prisonsis_user')
    setUser(null)
  }

  useEffect(() => {
    if (!user) return
    if (!pageAllowed(currentPage, user.role)) {
      setCurrentPage('home')
    }
  }, [user, currentPage])

  useEffect(() => {
    // 最小改动：默认沿用现有深色 :root；仅在浅色时写 data-theme 覆盖变量。
    if (themeMode === 'light') {
      document.documentElement.dataset.theme = 'light-glass'
    } else {
      delete document.documentElement.dataset.theme
    }
    localStorage.setItem('prisonsis_theme', themeMode)
  }, [themeMode])

  const handleThemeSwitch = (next: string) => {
    if (next === 'light') {
      setThemeMode('light')
      return
    }
    setThemeMode('dark')
  }

  const handleGlobalSearch = async (query: string) => {
    const q = query.trim()
    if (!q) return
    setGlobalSearchOpen(true)
    setGlobalSearchLoading(true)
    setGlobalSearchError(null)
    setGlobalSearchQuery(q)
    try {
      const groups = await runGlobalSearch(q)
      setGlobalSearchResults(groups)
    } catch (e) {
      setGlobalSearchResults([])
      setGlobalSearchError(e instanceof Error ? e.message : String(e))
    } finally {
      setGlobalSearchLoading(false)
    }
  }

  const closeGlobalSearch = () => {
    setGlobalSearchOpen(false)
  }

  const handleGlobalSearchSelect = (targetPage: string, search: string) => {
    setCurrentPage(targetPage)
    setGlobalSearchOpen(false)
    const detail = { page: targetPage, search }
    window.dispatchEvent(new CustomEvent('prisonsis:navigate', { detail }))
    window.dispatchEvent(new CustomEvent('prisonsis:apply-search', { detail }))
  }

  // 支持从其它页面通过 CustomEvent 触发“跳转到某个页面”
  useEffect(() => {
    const handler = (e: Event) => {
      if (!user) return
      const ce = e as CustomEvent<{ page?: string }>
      const page = ce.detail?.page
      if (typeof page === 'string') {
        setCurrentPage(page)
      }
    }
    window.addEventListener('prisonsis:navigate', handler as EventListener)
    return () => window.removeEventListener('prisonsis:navigate', handler as EventListener)
  }, [user])

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
            onThemeSwitch={handleThemeSwitch}
            onGlobalSearch={handleGlobalSearch}
            user={user}
          />

          <div className="glass-panel">
            <PageComponent key={currentPage} />
          </div>

          <GlassStatusBar />
        </div>
      </div>
      <GlobalSearchPanel
        open={globalSearchOpen}
        loading={globalSearchLoading}
        error={globalSearchError}
        query={globalSearchQuery}
        groups={globalSearchResults}
        onClose={closeGlobalSearch}
        onSelect={(item) => handleGlobalSearchSelect(item.targetPage, item.search)}
        onViewMore={(targetPage) => handleGlobalSearchSelect(targetPage, globalSearchQuery)}
      />
    </>
  )
}
