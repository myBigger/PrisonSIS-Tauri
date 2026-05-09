// LoginPage.tsx — 登录页面
import { useState, type FormEvent } from 'react'
import { login } from '../api'

interface LoginPageProps {
  onLoginSuccess: (user: { user_id: string; username: string; real_name: string; role: string }) => void
}

// 检测是否运行在 Tauri 环境
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!isTauri()) {
        // Web 预览模式：直接登录
        onLoginSuccess({
          user_id: 'U001',
          username: username || 'admin',
          real_name: '管理员',
          role: 'Admin',
        })
        return
      }

      const result = await login(username, password)
      if (result.success && result.user) {
        onLoginSuccess({
          user_id: result.user.user_id,
          username: result.user.username,
          real_name: result.user.real_name,
          role: result.user.role,
        })
      } else {
        setError(result.message || '登录失败')
      }
    } catch (e) {
      console.error('登录错误:', e)
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🏛️</div>
          <h1>监狱审讯笔录系统</h1>
          <p>PrisonSIS - Tauri Edition</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        {!isTauri() && (
          <div className="login-hint">
            💡 Web 预览模式：输入任意用户名密码即可登录
          </div>
        )}
      </div>
    </div>
  )
}
