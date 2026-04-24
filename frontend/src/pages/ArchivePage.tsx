// ArchivePage.tsx — 档案管理页面
import { useState } from 'react'

interface Criminal {
  id: number; criminal_id: string; name: string; crime: string
  archived: boolean; entry_date: string
}

const mockCriminals: Criminal[] = [
  { id:1, criminal_id:'CR-00001', name:'张某', crime:'盗窃罪', archived:false, entry_date:'2026-01-15' },
  { id:2, criminal_id:'CR-00002', name:'李某', crime:'故意伤害', archived:false, entry_date:'2026-02-13' },
  { id:3, criminal_id:'CR-00003', name:'王某', crime:'诈骗罪', archived:true, entry_date:'2026-02-19' },
  { id:4, criminal_id:'CR-00004', name:'赵某', crime:'抢劫罪', archived:false, entry_date:'2026-03-08' },
]

export default function ArchivePage() {
  const [archived, setArchived] = useState<Criminal[]>(mockCriminals.filter(c => c.archived))
  const [active, setActive] = useState<Criminal[]>(mockCriminals.filter(c => !c.archived))
  const [tab, setTab] = useState<'archived' | 'active'>('active')

  const list = tab === 'archived' ? archived : active

  return (
    <div className="page">
      <h1 className="page-title">档案管理</h1>
      <div style={{ display:'flex', gap:8 }}>
        <button className={`glass-btn${tab==='archived'?' primary':''}`} onClick={()=>setTab('archived')}>已归档 ({archived.length})</button>
        <button className={`glass-btn${tab==='active'?' primary':''}`} onClick={()=>setTab('active')}>在押人员 ({active.length})</button>
      </div>
      <div className="glass-panel" style={{ display:'flex', flexDirection:'column', flex:1 }}>
        <div style={{ flex:1, overflow:'auto' }}>
          <table className="data-table">
            <thead><tr><th>编号</th><th>姓名</th><th>罪名</th><th>入狱日期</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)', padding:32 }}>暂无数据</td></tr>}
              {list.map(c => (
                <tr key={c.id}>
                  <td className="cell-mono">{c.criminal_id}</td>
                  <td>{c.name}</td>
                  <td style={{ color:'var(--text-secondary)' }}>{c.crime || '—'}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>{c.entry_date || '—'}</td>
                  <td><span className="cell-status"><span className="status-dot" style={{ background:c.archived?'var(--text-muted)':'var(--status-online)' }}/><span style={{ color:c.archived?'var(--text-muted)':'var(--status-online)' }}>{c.archived?'已归档':'在押'}</span></span></td>
                  <td><button className="glass-btn small">{tab==='archived'?'查看':'归档'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
