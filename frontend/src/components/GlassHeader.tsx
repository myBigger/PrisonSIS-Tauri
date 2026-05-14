// GlassHeader.tsx — 毛玻璃顶部状态栏
import { useState } from 'react'
import { changeOwnPassword } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'
import Icon from './icons/Icon'
import IconButton from './icons/IconButton'

interface User {
  username: string
  real_name: string
  role: string
  user_id?: string
}

interface Props {
  currentPage: string
  onToggleSidebar: () => void
  themeMode: 'dark' | 'light'
  onThemeToggle: () => void
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

export default function GlassHeader({ currentPage, onToggleSidebar, themeMode, onThemeToggle, onGlobalSearch, user }: Props) {
  const [globalSearchInput, setGlobalSearchInput] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifUnread, setNotifUnread] = useState(2)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  const openPwdFromSettings = () => {
    setSettingsOpen(false)
    setPwdOpen(true)
  }

  return (
    <>
      <header className="header">
        <IconButton label="切换侧栏" onClick={onToggleSidebar}>
          <Icon name="menu" />
        </IconButton>

        <div className="header-title">{pageTitles[currentPage] || '首页'}</div>

        <div className="header-search">
          <span className="header-search-icon" aria-hidden>
            <Icon name="search" size={16} />
          </span>
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
        <IconButton label="搜索" onClick={submitGlobalSearch}>
          <Icon name="search" />
        </IconButton>

        <IconButton
          label={notifUnread > 0 ? `通知（${notifUnread} 条未读）` : '通知'}
          title={notifUnread > 0 ? `通知（${notifUnread} 条未读）` : '通知'}
          className={notifUnread > 0 ? 'primary' : undefined}
          onClick={() => {
            setNotifOpen(true)
            setNotifUnread(0)
          }}
        >
          <Icon name="bell" />
        </IconButton>

        <IconButton
          label="设置"
          title="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </IconButton>
      </header>

      {notifOpen && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => setNotifOpen(false)}>
          <div className="record-modal" style={{ maxWidth: 520 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>通知中心</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setNotifOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="glass-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>审批提醒：你有 3 条待审批笔录</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>刚刚</div>
                </div>
                <div className="glass-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>数据备份建议：建议本周执行一次手动备份</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>今天 09:20</div>
                </div>
              </div>
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setNotifOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <div className="record-modal" style={{ maxWidth: 420 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>设置</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setSettingsOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  当前用户：{user.real_name || user.username}
                </div>
                <button type="button" className="glass-btn" onClick={onThemeToggle}>
                  <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} size={18} />
                  {themeMode === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
                </button>
                <button
                  type="button"
                  className="glass-btn"
                  disabled={!isTauri()}
                  onClick={openPwdFromSettings}
                >
                  <Icon name="key" size={18} />
                  {isTauri() ? '修改登录密码' : '仅桌面端可用'}
                </button>
              </div>
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setSettingsOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

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
