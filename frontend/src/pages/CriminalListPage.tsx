// CriminalListPage.tsx — 罪犯信息列表页
import React, { useState } from 'react'

const criminals = [
  { id: 1, code: 'CR-00001', name: '张某', gender: '男', idcard: '***********1XXX', case: '盗窃罪', date: '2026-01-15', status: '在押' },
  { id: 2, code: 'CR-00002', name: '李某', gender: '女', idcard: '***********2XXX', case: '故意伤害', date: '2026-02-13', status: '在押' },
  { id: 3, code: 'CR-00003', name: '王某', gender: '男', idcard: '***********3XXX', case: '诈骗罪', date: '2026-02-19', status: '已释放' },
  { id: 4, code: 'CR-00004', name: '赵某', gender: '男', idcard: '***********4XXX', case: '抢劫罪', date: '2026-03-08', status: '在押' },
  { id: 5, code: 'CR-00005', name: '刘某', gender: '女', idcard: '***********5XXX', case: '贩毒罪', date: '2026-03-12', status: '在押' },
  { id: 6, code: 'CR-00006', name: '陈某', gender: '男', idcard: '***********6XXX', case: '盗窃罪', date: '2026-03-15', status: '在押' },
  { id: 7, code: 'CR-00007', name: '周某', gender: '男', idcard: '***********7XXX', case: '诈骗罪', date: '2026-03-21', status: '取保' },
  { id: 8, code: 'CR-00008', name: '吴某', gender: '男', idcard: '***********8XXX', case: '故意伤害', date: '2026-04-05', status: '在押' },
  { id: 9, code: 'CR-00009', name: '郑某', gender: '男', idcard: '***********9XXX', case: '抢劫罪', date: '2026-04-10', status: '在押' },
  { id: 10, code: 'CR-00010', name: '孙某', gender: '男', idcard: '***********10XXX', case: '盗窃罪', date: '2026-04-15', status: '在押' },
]

const statusColor = (s: string) => {
  if (s === '在押') return 'var(--status-online)'
  if (s === '已释放') return 'var(--text-muted)'
  if (s === '取保') return 'var(--accent-secondary)'
  return 'var(--text-muted)'
}

export default function CriminalListPage() {
  const [search, setSearch] = useState('')

  const filtered = criminals.filter(c =>
    c.name.includes(search) || c.code.includes(search) || c.case.includes(search)
  )

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
            value={search}
            onChange={e => setSearch(e.target.value)}
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
                <th>身份证号</th>
                <th>案由</th>
                <th>入狱日期</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td className="cell-mono">{c.code}</td>
                  <td>{c.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.gender}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{c.idcard}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.case}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{c.date}</td>
                  <td>
                    <span className="cell-status">
                      <span className="status-dot" style={{ background: statusColor(c.status) }} />
                      <span style={{ color: statusColor(c.status) }}>{c.status}</span>
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
          共 {filtered.length} 条
          <div style={{ flex: 1 }} />
          <button className="glass-btn small" disabled>上一页</button>
          <button className="glass-btn small" disabled>下一页</button>
        </div>
      </div>
    </div>
  )
}
