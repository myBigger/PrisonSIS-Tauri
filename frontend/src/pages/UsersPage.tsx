// UsersPage.tsx — 用户管理（阶段 5：CRUD / 软删 / 特权角色）
import { useCallback, useEffect, useState } from 'react'
import type { ManagedUserRow } from '../api'
import {
  addUser,
  getUsersByPage,
  restoreSoftDeletedUser,
  resetPasswordAdmin,
  setUserEnabled,
  softDeleteUser,
  suggestNextUserId,
  updateUser,
} from '../api'
import { formatInvokeError } from '../lib/invokeError'
import { isTauriRuntime as isTauri } from '../lib/tauriEnv'

const PAGE_SIZE = 15

function readOperatorUserId(): string {
  try {
    const raw = localStorage.getItem('prisonsis_user')
    if (!raw) return ''
    const u = JSON.parse(raw) as { user_id?: string }
    return u.user_id?.trim() ?? ''
  } catch {
    return ''
  }
}

function roleZh(r: string) {
  const m: Record<string, string> = {
    Admin: '管理员',
    Auditor: '审计员',
    Approver: '审批员',
    User: '民警用户',
  }
  return m[r.trim()] ?? r
}

function roleColor(r: string) {
  const x = r.trim()
  if (x === 'Admin') return 'var(--accent-red)'
  if (x === 'Auditor') return 'var(--accent-purple)'
  if (x === 'Approver') return 'var(--accent-secondary)'
  return 'var(--accent-primary)'
}

function isElevatedRole(r: string) {
  const x = r.trim()
  return x === 'Admin' || x === 'Auditor'
}

type RowDangerActionKind = 'toggleEnabled' | 'softDelete' | 'restore'

export default function UsersPage() {
  const [rows, setRows] = useState<ManagedUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingRow, setEditingRow] = useState<ManagedUserRow | null>(null)
  const [privilegedElevated, setPrivilegedElevated] = useState(false)
  const [privilegedRoleEdit, setPrivilegedRoleEdit] = useState(false)

  const [formUserId, setFormUserId] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formRealName, setFormRealName] = useState('')
  const [formRole, setFormRole] = useState('User')
  const [formDept, setFormDept] = useState('')
  const [formPosition, setFormPosition] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formSaveError, setFormSaveError] = useState<string | null>(null)

  const [resetOpen, setResetOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<ManagedUserRow | null>(null)
  const [resetPwd, setResetPwd] = useState('')
  const [resetErr, setResetErr] = useState<string | null>(null)

  /** 禁用/删除/复活：应用内确认（避免 Tauri WebView 下 window.confirm 不弹窗） */
  const [pendingRowAction, setPendingRowAction] = useState<
    null | { kind: RowDangerActionKind; user: ManagedUserRow }
  >(null)
  const [rowActionErr, setRowActionErr] = useState<string | null>(null)
  const [rowActionBusy, setRowActionBusy] = useState(false)

  const operatorUserId = readOperatorUserId()
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const loadRows = useCallback(async () => {
    if (!isTauri()) {
      setRows([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [list, count] = await getUsersByPage(page, PAGE_SIZE, appliedSearch, includeDeleted)
      setRows(list)
      setTotal(count)
    } catch (e) {
      setError(formatInvokeError(e))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedSearch, includeDeleted])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const applySearch = () => {
    setPage(0)
    setAppliedSearch(searchInput.trim())
  }

  const openCreate = async () => {
    setFormMode('create')
    setEditingRow(null)
    setPrivilegedElevated(false)
    setPrivilegedRoleEdit(false)
    setFormUsername('')
    setFormRealName('')
    setFormRole('User')
    setFormDept('')
    setFormPosition('')
    setFormPhone('')
    setFormPassword('')
    setFormSaveError(null)
    let uid = ''
    try {
      if (isTauri()) uid = await suggestNextUserId()
    } catch {
      uid = ''
    }
    setFormUserId(uid || '')
    setFormOpen(true)
  }

  const openEdit = (u: ManagedUserRow) => {
    setFormMode('edit')
    setEditingRow(u)
    setPrivilegedRoleEdit(false)
    setPrivilegedElevated(false)
    setFormUserId(u.userId)
    setFormUsername(u.username)
    setFormRealName(u.realName)
    setFormRole(u.role?.trim() ? u.role.trim() : 'User')
    setFormDept(u.department ?? '')
    setFormPosition(u.position ?? '')
    setFormPhone(u.phone ?? '')
    setFormPassword('')
    setFormSaveError(null)
    setFormOpen(true)
  }

  const submitForm = async () => {
    if (!isTauri()) return
    setFormSaveError(null)
    try {
      if (formMode === 'create') {
        await addUser(
          {
            userId: formUserId.trim(),
            username: formUsername.trim(),
            realName: formRealName.trim(),
            role: formRole.trim(),
            department: formDept.trim(),
            position: formPosition.trim(),
            phone: formPhone.trim(),
            password: formPassword,
          },
          privilegedElevated
        )
      } else if (editingRow) {
        await updateUser(
          {
            id: editingRow.id,
            userId: formUserId.trim(),
            username: formUsername.trim(),
            realName: formRealName.trim(),
            role: formRole.trim(),
            department: formDept.trim(),
            position: formPosition.trim(),
            phone: formPhone.trim(),
          },
          privilegedRoleEdit
        )
      }
      setFormOpen(false)
      await loadRows()
    } catch (e) {
      setFormSaveError(formatInvokeError(e))
    }
  }

  const submitResetPwd = async () => {
    if (!isTauri() || !resetTarget) return
    setResetErr(null)
    try {
      await resetPasswordAdmin(resetTarget.id, resetPwd)
      setResetOpen(false)
      setResetPwd('')
      setResetTarget(null)
      await loadRows()
    } catch (e) {
      setResetErr(formatInvokeError(e))
    }
  }

  const openRowActionConfirm = (kind: RowDangerActionKind, user: ManagedUserRow) => {
    setPendingRowAction({ kind, user })
    setRowActionErr(null)
  }

  const closeRowActionConfirm = () => {
    if (rowActionBusy) return
    setPendingRowAction(null)
    setRowActionErr(null)
  }

  const submitRowActionConfirm = async () => {
    if (!pendingRowAction || !isTauri()) return
    const { kind, user } = pendingRowAction
    setRowActionErr(null)
    setRowActionBusy(true)
    try {
      if (kind === 'toggleEnabled') {
        await setUserEnabled(user.id, !user.enabled)
      } else if (kind === 'softDelete') {
        await softDeleteUser(user.id)
      } else {
        await restoreSoftDeletedUser(user.id)
      }
      setPendingRowAction(null)
      await loadRows()
    } catch (e) {
      setRowActionErr(formatInvokeError(e))
    } finally {
      setRowActionBusy(false)
    }
  }

  const rowActionTitle = (() => {
    if (!pendingRowAction) return ''
    const { kind, user } = pendingRowAction
    if (kind === 'toggleEnabled') return user.enabled ? '确认禁用' : '确认启用'
    if (kind === 'softDelete') return '确认软删除'
    return '确认恢复'
  })()

  const rowActionBody = (() => {
    if (!pendingRowAction) return ''
    const { kind, user } = pendingRowAction
    const who = `${user.realName || user.username}（${user.userId}）`
    if (kind === 'toggleEnabled') {
      return user.enabled
        ? `确定禁用用户 ${who}？禁用后将无法登录。`
        : `确定启用用户 ${who}？`
    }
    if (kind === 'softDelete') {
      return `确定软删除用户 ${who}？删除后将无法登录，可在列表勾选「包含已删除」后执行「复活」。`
    }
    return `确定恢复用户 ${who}？恢复后可按规则再次登录。`
  })()

  const editingElevated = Boolean(editingRow && isElevatedRole(editingRow.role))

  const renderRoleControl = () => {
    if (formMode === 'create') {
      const opts = privilegedElevated
        ? [
            { v: 'Admin', l: '管理员' },
            { v: 'Auditor', l: '审计员' },
          ]
        : [
            { v: 'User', l: '民警用户' },
            { v: 'Approver', l: '审批员' },
          ]
      return (
        <select className="glass-input glass-input--select" value={formRole} onChange={e => setFormRole(e.target.value)}>
          {opts.map(o => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      )
    }
    // edit
    if (privilegedRoleEdit) {
      const opts = [
        { v: 'Admin', l: '管理员' },
        { v: 'Auditor', l: '审计员' },
        { v: 'User', l: '民警用户' },
        { v: 'Approver', l: '审批员' },
      ]
      return (
        <select className="glass-input glass-input--select" value={formRole} onChange={e => setFormRole(e.target.value)}>
          {opts.map(o => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      )
    }
    if (editingElevated) {
      return (
        <div className="glass-input" style={{ opacity: 0.95 }}>
          {roleZh(formRole)}
          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>（勾选特权编辑后可调整）</span>
        </div>
      )
    }
    return (
      <select className="glass-input glass-input--select" value={formRole} onChange={e => setFormRole(e.target.value)}>
        <option value="User">民警用户</option>
        <option value="Approver">审批员</option>
      </select>
    )
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title">用户管理</h1>
        <button type="button" className="glass-btn primary" onClick={() => openCreate()} disabled={!isTauri()}>
          + 添加用户
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ color: 'var(--accent-red)', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <input
            className="glass-input"
            style={{ minWidth: 200 }}
            placeholder="账号 / 姓名 / 编号"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applySearch()}
          />
          <button type="button" className="glass-btn small" disabled={!isTauri()} onClick={() => applySearch()}>
            搜索
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
            包含已删除
          </label>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>账号</th>
                <th>姓名</th>
                <th>角色</th>
                <th>部门</th>
                <th>岗位</th>
                <th>创建时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                    加载中…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                    暂无数据
                  </td>
                </tr>
              ) : (
                rows.map(u => {
                  const deleted = Boolean(u.deletedAt?.trim())
                  return (
                    <tr key={u.id}>
                      <td className="cell-mono">{u.userId}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{u.username}</td>
                      <td>{u.realName}</td>
                      <td>
                        <span
                          style={{
                            background: roleColor(u.role) + '15',
                            color: roleColor(u.role),
                            border: `1px solid ${roleColor(u.role)}30`,
                            borderRadius: 4,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {roleZh(u.role)}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.department || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.position || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.createdAt || '—'}</td>
                      <td>
                        <span className="cell-status">
                          <span
                            className="status-dot"
                            style={{
                              background: deleted ? 'var(--accent-secondary)' : u.enabled ? 'var(--status-online)' : 'var(--text-muted)',
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {deleted ? '已删除' : u.enabled ? '启用' : '禁用'}
                          </span>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {!deleted ? (
                            <>
                              <button type="button" className="glass-btn small" disabled={!isTauri()} onClick={() => openEdit(u)}>
                                编辑
                              </button>
                              <button
                                type="button"
                                className="glass-btn small"
                                disabled={!isTauri()}
                                onClick={() => {
                                  setResetTarget(u)
                                  setResetPwd('')
                                  setResetErr(null)
                                  setResetOpen(true)
                                }}
                              >
                                重置密码
                              </button>
                              <button
                                type="button"
                                className="glass-btn small"
                                disabled={!isTauri()}
                                onClick={() => openRowActionConfirm('toggleEnabled', u)}
                              >
                                {u.enabled ? '禁用' : '启用'}
                              </button>
                              <button
                                type="button"
                                className="glass-btn small"
                                disabled={!isTauri() || u.userId.trim() === operatorUserId}
                                title={u.userId.trim() === operatorUserId ? '不可删除当前登录账号' : ''}
                                onClick={() => openRowActionConfirm('softDelete', u)}
                              >
                                删除
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="glass-btn small primary"
                              disabled={!isTauri()}
                              onClick={() => openRowActionConfirm('restore', u)}
                            >
                              复活
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          {loading ? '加载中…' : `共 ${total} 条，第 ${page + 1}/${totalPages} 页`}
          <div style={{ flex: 1 }} />
          <button type="button" className="glass-btn small" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>
            上一页
          </button>
          <button
            type="button"
            className="glass-btn small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>

      {formOpen && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setFormSaveError(null)
            setFormOpen(false)
          }}
        >
          <div className="record-modal" style={{ maxWidth: 520 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>{formMode === 'create' ? '新建用户' : '编辑用户'}</h2>
              </div>
              <button
                type="button"
                className="record-modal__close"
                aria-label="关闭"
                onClick={() => {
                  setFormSaveError(null)
                  setFormOpen(false)
                }}
              >
                ×
              </button>
            </div>
            <div className="record-modal__body">
              {formMode === 'create' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={privilegedElevated}
                    onChange={e => {
                      const v = e.target.checked
                      setPrivilegedElevated(v)
                      setFormRole(v ? 'Admin' : 'User')
                    }}
                  />
                  <span>特权新建（仅管理员 / 审计员）</span>
                </label>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13 }}>
                  <input type="checkbox" checked={privilegedRoleEdit} onChange={e => setPrivilegedRoleEdit(e.target.checked)} />
                  <span>特权编辑（可调整特权角色）</span>
                </label>
              )}
              <div className="record-modal__grid">
                <label className="record-modal__field">
                  <span>用户编号</span>
                  <input className="glass-input" value={formUserId} onChange={e => setFormUserId(e.target.value)} disabled={formMode === 'edit'} />
                </label>
                <label className="record-modal__field">
                  <span>账号</span>
                  <input className="glass-input" value={formUsername} onChange={e => setFormUsername(e.target.value)} />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>姓名</span>
                  <input className="glass-input" value={formRealName} onChange={e => setFormRealName(e.target.value)} />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>角色</span>
                  {renderRoleControl()}
                </label>
                <label className="record-modal__field">
                  <span>部门</span>
                  <input className="glass-input" value={formDept} onChange={e => setFormDept(e.target.value)} />
                </label>
                <label className="record-modal__field">
                  <span>岗位</span>
                  <input className="glass-input" value={formPosition} onChange={e => setFormPosition(e.target.value)} />
                </label>
                <label className="record-modal__field record-modal__field--full">
                  <span>电话</span>
                  <input className="glass-input" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
                </label>
                {formMode === 'create' ? (
                  <label className="record-modal__field record-modal__field--full">
                    <span>初始密码（≥6 位）</span>
                    <input type="password" className="glass-input" value={formPassword} onChange={e => setFormPassword(e.target.value)} autoComplete="new-password" />
                  </label>
                ) : null}
              </div>
              {formSaveError ? (
                <p role="alert" style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 12 }}>
                  {formSaveError}
                </p>
              ) : null}
            </div>
            <div className="record-modal__footer">
              <button
                type="button"
                className="glass-btn"
                onClick={() => {
                  setFormSaveError(null)
                  setFormOpen(false)
                }}
              >
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={() => submitForm()} disabled={!isTauri()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {resetOpen && resetTarget && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setResetErr(null)
            setResetOpen(false)
          }}
        >
          <div className="record-modal" style={{ maxWidth: 420 }} onMouseDown={e => e.stopPropagation()}>
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2>重置密码</h2>
                <div className="record-modal__meta">{resetTarget.realName}（{resetTarget.userId}）</div>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => setResetOpen(false)}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <label className="record-modal__field record-modal__field--full">
                <span>新密码（≥6 位）</span>
                <input type="password" className="glass-input" value={resetPwd} onChange={e => setResetPwd(e.target.value)} autoComplete="new-password" />
              </label>
              {resetErr ? (
                <p role="alert" style={{ color: 'var(--accent-red)', fontSize: 13 }}>
                  {resetErr}
                </p>
              ) : null}
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => setResetOpen(false)}>
                取消
              </button>
              <button type="button" className="glass-btn primary" onClick={() => submitResetPwd()}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRowAction && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={() => closeRowActionConfirm()}
        >
          <div
            className="record-modal"
            style={{ maxWidth: 460 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="row-action-confirm-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="record-modal__header">
              <div className="record-modal__title-wrap">
                <h2 id="row-action-confirm-title">{rowActionTitle}</h2>
              </div>
              <button type="button" className="record-modal__close" aria-label="关闭" onClick={() => closeRowActionConfirm()} disabled={rowActionBusy}>
                ×
              </button>
            </div>
            <div className="record-modal__body">
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{rowActionBody}</p>
              {rowActionErr ? (
                <p role="alert" style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 12 }}>
                  {rowActionErr}
                </p>
              ) : null}
            </div>
            <div className="record-modal__footer">
              <button type="button" className="glass-btn" onClick={() => closeRowActionConfirm()} disabled={rowActionBusy}>
                取消
              </button>
              <button
                type="button"
                className={pendingRowAction.kind === 'softDelete' ? 'glass-btn danger' : 'glass-btn primary'}
                onClick={() => submitRowActionConfirm()}
                disabled={rowActionBusy || !isTauri()}
              >
                {rowActionBusy ? '处理中…' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
