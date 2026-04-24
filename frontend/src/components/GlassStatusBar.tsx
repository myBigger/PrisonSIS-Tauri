// GlassStatusBar.tsx — 毛玻璃底部状态栏
import React, { useState, useEffect } from 'react'

export default function GlassStatusBar() {
  const [time, setTime] = useState(new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }))

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-dot-pulse" />
        <span style={{ color: 'var(--status-online)' }}>在线</span>
      </div>
      <div className="status-item">数据库：正常</div>
      <div className="status-item">P2P：未启动</div>
      <div style={{ flex: 1 }} />
      <div className="status-item">{time}</div>
      <div className="status-item">v1.0.0</div>
    </div>
  )
}
