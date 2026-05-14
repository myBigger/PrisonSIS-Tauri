// App.tsx — PrisonSIS Tauri 应用主入口
import { useEffect, useMemo, useState } from 'react'
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
import { RecordEditSessionProvider, useRecordEditSession } from './context/RecordEditSessionContext'

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

  return (
    <RecordEditSessionProvider>
      <AppShell
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        sidebarVisible={sidebarVisible}
        setSidebarVisible={setSidebarVisible}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        user={user}
        setUser={setUser}
        globalSearchOpen={globalSearchOpen}
        setGlobalSearchOpen={setGlobalSearchOpen}
        globalSearchLoading={globalSearchLoading}
        setGlobalSearchLoading={setGlobalSearchLoading}
        globalSearchError={globalSearchError}
        setGlobalSearchError={setGlobalSearchError}
        globalSearchQuery={globalSearchQuery}
        setGlobalSearchQuery={setGlobalSearchQuery}
        globalSearchResults={globalSearchResults}
        setGlobalSearchResults={setGlobalSearchResults}
        PageComponent={PageComponent}
      />
    </RecordEditSessionProvider>
  )
}

type AppShellProps = {
  currentPage: string
  setCurrentPage: (p: string) => void
  sidebarVisible: boolean
  setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
  themeMode: 'dark' | 'light'
  setThemeMode: React.Dispatch<React.SetStateAction<'dark' | 'light'>>
  user: User | null
  setUser: React.Dispatch<React.SetStateAction<User | null>>
  globalSearchOpen: boolean
  setGlobalSearchOpen: React.Dispatch<React.SetStateAction<boolean>>
  globalSearchLoading: boolean
  setGlobalSearchLoading: React.Dispatch<React.SetStateAction<boolean>>
  globalSearchError: string | null
  setGlobalSearchError: React.Dispatch<React.SetStateAction<string | null>>
  globalSearchQuery: string
  setGlobalSearchQuery: React.Dispatch<React.SetStateAction<string>>
  globalSearchResults: GlobalSearchResultGroup[]
  setGlobalSearchResults: React.Dispatch<React.SetStateAction<GlobalSearchResultGroup[]>>
  PageComponent: React.FC
}

function AppShell(props: AppShellProps) {
  const {
    currentPage,
    setCurrentPage,
    sidebarVisible,
    setSidebarVisible,
    themeMode,
    setThemeMode,
    user,
    setUser,
    globalSearchOpen,
    setGlobalSearchOpen,
    globalSearchLoading,
    setGlobalSearchLoading,
    globalSearchError,
    setGlobalSearchError,
    globalSearchQuery,
    setGlobalSearchQuery,
    globalSearchResults,
    setGlobalSearchResults,
    PageComponent,
  } = props

  const { guard } = useRecordEditSession()
  const [navConfirmOpen, setNavConfirmOpen] = useState(false)
  const [pendingPage, setPendingPage] = useState<string | null>(null)

  const requestNavigate = (nextPage: string) => {
    if (nextPage === currentPage) return
    if (guard.blocking) {
      setPendingPage(nextPage)
      setNavConfirmOpen(true)
      return
    }
    setCurrentPage(nextPage)
  }

  const closeNavConfirm = () => {
    setNavConfirmOpen(false)
    setPendingPage(null)
  }

  const discardAndLeave = () => {
    guard.discard?.()
    const next = pendingPage
    closeNavConfirm()
    if (next) setCurrentPage(next)
  }

  const saveAndLeave = async () => {
    const next = pendingPage
    if (!next) return
    const ok = await guard.save?.()
    if (!ok) {
      // 保存失败时回到笔录继续编辑，避免确认弹窗“卡住”
      closeNavConfirm()
      return
    }
    closeNavConfirm()
    setCurrentPage(next)
  }

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
            onNavigate={requestNavigate}
            user={user}
            onLogout={handleLogout}
          />
        )}

        <div className="content-area">
          <GlassHeader
            currentPage={currentPage}
            onToggleSidebar={() => setSidebarVisible(v => !v)}
            themeMode={themeMode}
            onThemeToggle={() => setThemeMode(m => (m === 'dark' ? 'light' : 'dark'))}
            onGlobalSearch={handleGlobalSearch}
            user={user}
          />

          <div className="glass-panel">
            <PageComponent key={currentPage} />
          </div>

          <GlassStatusBar />
        </div>
      </div>
      {navConfirmOpen ? (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={closeNavConfirm}>
          <div className="record-modal" style={{ maxWidth: 520 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>离开笔录制作？</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={closeNavConfirm}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {guard.message || '当前内容尚未保存，离开将丢失未保存内容。'}
              </p>
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={closeNavConfirm}>
                留在笔录
              </button>
              <button type="button" className="glass-btn danger" onClick={discardAndLeave}>
                放弃并离开
              </button>
              <button type="button" className="glass-btn primary" onClick={() => void saveAndLeave()}>
                保存并离开
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
