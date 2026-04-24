// RecordsPage.tsx — 笔录制作页面
import { useState } from 'react'

interface RecordItem {
  id: number; record_id: string; record_type: string; criminal_id: number
  criminal_name: string; record_date: string; record_location: string
  interrogator_id: string; status: string; created_at: string
}

const mockRecords: RecordItem[] = [
  { id:1, record_id:'BL-2026-0001', record_type:'问询', criminal_id:1, criminal_name:'张某', record_date:'2026-04-24 09:30', record_location:'审讯室A', interrogator_id:'admin', status:'Approved', created_at:'2026-04-24 09:00' },
  { id:2, record_id:'BL-2026-0002', record_type:'审讯', criminal_id:2, criminal_name:'李某', record_date:'2026-04-23 14:20', record_location:'审讯室B', interrogator_id:'admin', status:'Pending', created_at:'2026-04-23 14:00' },
  { id:3, record_id:'BL-2026-0003', record_type:'问询', criminal_id:3, criminal_name:'王某', record_date:'2026-04-23 10:00', record_location:'审讯室A', interrogator_id:'user01', status:'Approved', created_at:'2026-04-23 09:45' },
]

const statusColor = (s: string) => {
  if (s === 'Approved') return 'var(--status-online)'
  if (s === 'Pending') return 'var(--accent-secondary)'
  if (s === 'Rejected') return 'var(--accent-red)'
  return 'var(--text-muted)'
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = { Draft:'草稿', Pending:'待审批', Approved:'已审批', Rejected:'已驳回' }
  return map[s] || s
}

export default function RecordsPage() {
  const [records] = useState<RecordItem[]>(mockRecords)
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? records : records.filter(r => r.status === filter)

  return (
    <div className="page">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h1 className="page-title">笔录制作</h1>
        <button className="glass-btn primary">+ 新建笔录</button>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {[{ key:'all', label:'全部' },{ key:'Draft', label:'草稿' },{ key:'Pending', label:'待审批' },{ key:'Approved', label:'已审批' }].map(t => (
          <button key={t.key} className={`glass-btn${filter===t.key?' primary':''}`} onClick={()=>setFilter(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="glass-panel" style={{ display:'flex', flexDirection:'column', flex:1 }}>
        <div style={{ flex:1, overflow:'auto' }}>
          <table className="data-table">
            <thead><tr><th>编号</th><th>被审讯人</th><th>审讯类型</th><th>审讯日期</th><th>地点</th><th>承办人</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>暂无数据</td></tr>}
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="cell-mono">{r.record_id}</td>
                  <td>{r.criminal_name || '—'}</td>
                  <td style={{ color:'var(--text-secondary)' }}>{r.record_type}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{r.record_date || '—'}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{r.record_location || '—'}</td>
                  <td style={{ color:'var(--text-secondary)' }}>{r.interrogator_id || '—'}</td>
                  <td><span className="cell-status"><span className="status-dot" style={{ background:statusColor(r.status) }}/><span style={{ color:statusColor(r.status) }}>{statusLabel(r.status)}</span></span></td>
                  <td><div style={{ display:'flex', gap:8 }}><button className="glass-btn small">查看</button>{r.status==='Draft'&&<button className="glass-btn small">编辑</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
