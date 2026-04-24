// CriminalListPage.tsx — 罪犯信息列表页（对接 Tauri Rust 后端）
import React, { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Criminal {
  id: number
  criminal_id: string
  name: string
  gender: string
  ethnicity: string
  birth_date: string
  id_card_number: string
  native_place: string
  education: string
  crime: string
  sentence_years: number
  sentence_months: number
  entry_date: string
  crime_type: string
  manage_level: string
  district: string
  cell: string
  status: string
  archived: boolean
  case_number: string
  custody_date: string
  custody_location: string
  bed_number: string
  contact_phone: string
}

const statusColor = (s: boolean) => {
  return s ? 'var(--status-online)' : 'var(--text-muted)'
}

const statusLabel = (archived: boolean) => {
  return archived ? '归档' : '在押'
}

const PAGE_SIZE = 20

export default function CriminalListPage() {
  const [criminals, setCriminals] = useState<Criminal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [searchInput, setSearchInput] = useState('')

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const loadCriminals = useCallback((p: number, q: string) => {
    setLoading(true)
    invoke<[Criminal[], number]>('get_criminals_by_page', {
      page: p,
      pageSize: PAGE_SIZE,
      search: q,
    })
      .then(([data, count]) => {
        setCriminals(data)
        setTotal(count)
      })
      .catch(err => {
        console.error('加载罪犯数据失败:', err)
        setCriminals([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadCriminals(page, search)
  }, [page, search, loadCriminals])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(0)
  }

  const handlePageChange = (newPage: number) => {
    if (newPage < 0 || newPage >= totalPages) return
    setPage(newPage)
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">罪犯信息管理</h1>
      </div>

      {/* 工具栏 */}
      <div className="toolbar">
        <div className="search-box">
          <span>🔍</span>
          <input
            type="text"
            placeholder="搜索姓名、编号、案由..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>

        <button className="glass-btn">全部状态 ▼</button>
        <button className="glass-btn">全部类型 ▼</button>

        <div style={{ flex: 1 }} />

        <button className="glass-btn primary">+ 新增人员</button>
      </div>

      {/* 表格 */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>编号</th>
                <th>姓名</th>
                <th>性别</th>
                <th>民族</th>
                <th>身份证号</th>
                <th>案由/罪名</th>
                <th>刑期</th>
                <th>入狱日期</th>
                <th>监区</th>
                <th>仓号</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    加载中...
                  </td>
                </tr>
              )}
              {!loading && criminals.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    {search ? '未找到匹配的记录' : '暂无数据'}
                  </td>
                </tr>
              )}
              {!loading && criminals.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{page * PAGE_SIZE + i + 1}</td>
                  <td className="cell-mono">{c.criminal_id}</td>
                  <td>{c.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.gender}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.ethnicity}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.id_card_number || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.crime || c.crime_type || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {c.sentence_years > 0 ? `${c.sentence_years}年` : ''}
                    {c.sentence_months > 0 ? `${c.sentence_months}月` : ''}
                    {c.sentence_years === 0 && c.sentence_months === 0 ? '—' : ''}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.entry_date || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.district || '—'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{c.cell || '—'}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(c.archived) }} />
                      <span style={{ color: statusColor(c.archived) }}>{statusLabel(c.archived)}</span>
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="glass-btn small">查看</button>
                      <button className="glass-btn small">编辑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 12,
          color: 'var(--text-muted)'
        }}>
          {loading ? '加载中...' : `共 ${total} 条，第 ${page + 1}/${totalPages || 1} 页`}
          <div style={{ flex: 1 }} />
          <button
            className="glass-btn small"
            disabled={page === 0 || loading}
            onClick={() => handlePageChange(page - 1)}
          >上一页</button>
          <button
            className="glass-btn small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => handlePageChange(page + 1)}
          >下一页</button>
        </div>
      </div>
    </div>
  )
}
