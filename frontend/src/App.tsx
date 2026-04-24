// App.tsx — PrisonSIS Tauri 应用主入口
import React, { useState } from 'react'
import './index.css'
import GlassSidebar from './components/GlassSidebar'
import GlassHeader from './components/GlassHeader'
import GlassStatusBar from './components/GlassStatusBar'
import HomePage from './pages/HomePage'
import CriminalListPage from './pages/CriminalListPage'

const pages: Record<string, React.FC> = {
  home: HomePage,
  criminals: CriminalListPage,
  // 其他页面后续补充
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [theme, setTheme] = useState('glassmorphism')
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const PageComponent = pages[currentPage] || HomePage

  return (
    <>
      {/* 渐变背景层 */}
      <div className="app-background">
        <div className="glow-orb-bottom" />
      </div>

      {/* 应用外壳 */}
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
            onThemeSwitch={setTheme}
          />

          {/* 主内容面板（毛玻璃效果） */}
          <div
            className="glass-panel"
            style={{ marginTop: 0 }}
          >
            <PageComponent key={currentPage} />
          </div>

          <GlassStatusBar />
        </div>
      </div>
    </>
  )
}
