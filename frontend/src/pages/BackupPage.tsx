// BackupPage.tsx — 数据库备份 / 恢复（阶段 5）
import { useState } from 'react'
import { open, save } from '@tauri-apps/plugin-dialog'
import { exportDatabaseBackup, restoreDatabaseBackup } from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

function stamp() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export default function BackupPage() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 恢复前风险提示（替代 WebView 中不可靠的 window.confirm） */
  const [restoreAckOpen, setRestoreAckOpen] = useState(false)

  const onExport = async () => {
    if (!isTauri()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const path = await save({
        title: '导出数据库备份',
        defaultPath: `prisonsis_backup_${stamp()}.db`,
        filters: [{ name: 'SQLite', extensions: ['db'] }],
      })
      if (!path) {
        setBusy(false)
        return
      }
      const written = await exportDatabaseBackup(path)
      setMessage(`已导出：${written}；同目录已写入同名 .sha256 校验文件。`)
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setBusy(false)
    }
  }

  const closeRestoreAck = () => {
    if (busy) return
    setRestoreAckOpen(false)
  }

  const runRestorePickAndApply = async () => {
    if (!isTauri()) return
    setRestoreAckOpen(false)
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const picked = await open({
        title: '选择备份数据库文件',
        filters: [{ name: 'SQLite', extensions: ['db'] }],
        multiple: false,
      })
      if (picked === null || Array.isArray(picked)) {
        return
      }
      await restoreDatabaseBackup(picked)
      setMessage(`已从备份恢复：${picked}。建议立即重启应用以确保连接一致。`)
    } catch (e) {
      setError(formatInvokeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">数据备份</h1>

      <div className="glass-panel" style={{ padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>说明</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <li>导出前会对 SQLite 执行 WAL checkpoint，再复制主库文件。</li>
          <li>校验文件为 GNU sha256sum 单行格式（64 位十六进制与文件名），便于外部工具核对。</li>
          <li>管理员与审批员均可备份或恢复；恢复会替换当前数据库路径下的文件。</li>
        </ul>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div className="glass-panel highlighted" style={{ padding: 24, flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>导出备份</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>选择保存路径，生成 .db 及 .sha256</p>
          <button type="button" className="glass-btn primary" disabled={!isTauri() || busy} onClick={() => onExport()}>
            {busy ? '处理中…' : '导出…'}
          </button>
        </div>
        <div className="glass-panel" style={{ padding: 24, flex: '1 1 260px', minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>从备份恢复</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>覆盖当前数据库；可选校验 .sha256</p>
          <button
            type="button"
            className="glass-btn"
            disabled={!isTauri() || busy}
            onClick={() => setRestoreAckOpen(true)}
          >
            {busy ? '处理中…' : '选择备份文件…'}
          </button>
        </div>
      </div>

      {message ? (
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--status-online)' }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ marginTop: 16, fontSize: 13, color: 'var(--accent-red)' }}>
          {error}
        </p>
      ) : null}

      {restoreAckOpen && (
        <div className="record-modal-backdrop" role="presentation" onMouseDown={() => closeRestoreAck()}>
          <div
            className="record-modal"
            style={{ maxWidth: 480 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-restore-ack-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2 id="backup-restore-ack-title">确认恢复数据库</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => closeRestoreAck()} disabled={busy}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                恢复将<strong style={{ color: 'var(--text-primary)' }}>覆盖当前工作数据库文件</strong>，风险极高。恢复完成后<strong style={{ color: 'var(--text-primary)' }}>建议重启应用</strong>
                。若备份同目录存在同名 <span className="cell-mono">.sha256</span> 文件将自动校验；不匹配将中止恢复。
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
                点击「继续并选择文件」后将弹出系统文件选择对话框。
              </p>
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => closeRestoreAck()} disabled={busy}>
                取消
              </button>
              <button type="button" className="glass-btn danger" onClick={() => runRestorePickAndApply()} disabled={busy || !isTauri()}>
                继续并选择文件
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
