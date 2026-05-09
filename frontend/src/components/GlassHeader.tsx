// GlassHeader.tsx — 毛玻璃顶部状态栏
import { useState } from 'react'
import { changeOwnPassword } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

interface User {
  username: string
  real_name: string
  role: string
  user_id?: string
}

interface Props {
  currentPage: string
  onToggleSidebar: () => void
  onThemeSwitch: (theme: string) => void
  onGlobalSearch: (query: string) => void
  user: User
}

const pageTitles: Record<string, string> = {
  home: '首页',
  criminals: '罪犯信息管理',
  records: '笔录制作',
  approvals: '审批中心',
  cases: '案件管理',
  archive: '档案管理',
  stats: '统计分析',
  templates: '模板管理',
  export: '文档导出',
  users: '用户管理',
  backup: '数据备份',
  logs: '日志审计',
}

export default function GlassHeader({ currentPage, onToggleSidebar, onThemeSwitch, onGlobalSearch, user }: Props) {
  const [globalSearchInput, setGlobalSearchInput] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdOld, setPwdOld] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdConfirm, setPwdConfirm] = useState('')
  const [pwdErr, setPwdErr] = useState<string | null>(null)
  const [pwdBusy, setPwdBusy] = useState(false)

  const closePwd = () => {
    setPwdOpen(false)
    setPwdOld('')
    setPwdNew('')
    setPwdConfirm('')
    setPwdErr(null)
    setPwdBusy(false)
  }

  const submitPwd = async () => {
    if (!isTauri()) return
    setPwdErr(null)
    if (pwdNew.trim().length < 6) {
      setPwdErr('新密码至少 6 位')
      return
    }
    if (pwdNew !== pwdConfirm) {
      setPwdErr('两次输入的新密码不一致')
      return
    }
    setPwdBusy(true)
    try {
      await changeOwnPassword(pwdOld, pwdNew)
      closePwd()
    } catch (e) {
      setPwdErr(formatInvokeError(e))
    } finally {
      setPwdBusy(false)
    }
  }

  const submitGlobalSearch = () => {
    const q = globalSearchInput.trim()
    if (!q) return
    onGlobalSearch(q)
  }

  return (
    <>
      <header className="header">
        <button type="button" className="glass-btn icon-btn" onClick={onToggleSidebar} title="切换侧栏">
          ☰
        </button>

        <div className="header-title">{pageTitles[currentPage] || '首页'}</div>

        <div className="header-search">
          <span className="header-search-icon">🔍</span>
          <input
            type="text"
            placeholder="全局搜索（回车）"
            value={globalSearchInput}
            onChange={e => setGlobalSearchInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitGlobalSearch()
            }}
          />
        </div>
        <button type="button" className="glass-btn" onClick={submitGlobalSearch}>
          搜索
        </button>

        <div className="theme-switcher">
          <button type="button" className="glass-btn" onClick={() => onThemeSwitch('dark')}>
            深色
          </button>
          <button type="button" className="glass-btn" onClick={() => onThemeSwitch('light')}>
            浅色
          </button>
        </div>

        <div className="header-user">
          <span>{user.real_name || user.username}</span>
        </div>

        <button
          type="button"
          className="glass-btn small"
          title={isTauri() ? '修改登录密码' : '仅桌面端可用'}
          disabled={!isTauri()}
          onClick={() => setPwdOpen(true)}
        >
          改密
        </button>

        <button type="button" className="glass-btn icon-btn" title="通知">
          🔔
        </button>
      </header>

      {pwdOpen && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => closePwd()}>
          <div className="record-modal" style={{ maxWidth: 420 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>修改密码</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => closePwd()}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div className="record-modal__grid">
                <label className="record-modal__field record-modal__field--full">
                  <span>原密码</span>
                  <input type="password" className="glass-input" value={pwdOld} onChange={e => setPwdOld(e.target.value)} autoComplete="current-password" />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>新密码（≥6 位）</span>
                  <input type="password" className="glass-input" value={pwdNew} onChange={e => setPwdNew(e.target.value)} autoComplete="new-password" />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>确认新密码</span>
                  <input type="password" className="glass-input" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} autoComplete="new-password" />
                </label>
              </div>
              {pwdErr ? (
                <p role="alert" style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 12 }}>
                  {pwdErr}
                </p>
              ) : null}
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => closePwd()} disabled={pwdBusy}>
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={() => submitPwd()} disabled={pwdBusy}>
                {pwdBusy ? '提交中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
