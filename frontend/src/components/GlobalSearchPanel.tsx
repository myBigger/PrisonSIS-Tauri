import type { GlobalSearchResultGroup, GlobalSearchResultItem } from '../lib/globalSearch'

type Props = {
  open: boolean
  loading: boolean
  error: string | null
  query: string
  groups: GlobalSearchResultGroup[]
  onClose: () => void
  onSelect: (item: GlobalSearchResultItem) => void
  onViewMore: (targetPage: GlobalSearchResultItem['targetPage']) => void
}

const GROUP_LABEL: Record<GlobalSearchResultGroup['group'], string> = {
  records: '笔录',
  criminals: '罪犯信息',
  cases: '案件',
  approvals: '审批',
  logs: '日志',
  templates: '模板',
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderHighlighted(text: string, query: string) {
  const source = text || '—'
  const keyword = query.trim()
  if (!keyword || keyword.length < 2) return source

  const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'ig')
  const parts = source.split(regex)
  if (parts.length <= 1) return source

  const keywordLower = keyword.toLowerCase()
  return parts.map((part, idx) =>
    part.toLowerCase() === keywordLower ? (
      <mark key={`${part}-${idx}`} className="global-search-mark">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  )
}

export default function GlobalSearchPanel(props: Props) {
  const { open, loading, error, query, groups, onClose, onSelect, onViewMore } = props
  if (!open) return null

  const hasAny = groups.some(g => g.items.length > 0)

  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="global-search-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="global-search-panel__header">
          <h3>全局搜索：{query}</h3>
          <button type="button" className="glass-btn small" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="global-search-panel__body">
          {loading && <div className="global-search-empty">搜索中...</div>}
          {!loading && error && <div className="global-search-empty">{error}</div>}
          {!loading && !error && !hasAny && <div className="global-search-empty">未找到相关结果</div>}
          {!loading &&
            !error &&
            groups.map(group => (
              <section key={group.group} className="global-search-group">
                <div className="global-search-group__header">
                  <div className="global-search-group__title">
                    {GROUP_LABEL[group.group]}（{group.totalHint}）
                  </div>
                  <button
                    type="button"
                    className="glass-btn small"
                    disabled={group.totalHint === 0}
                    onClick={() => onViewMore(group.group)}
                  >
                    查看更多
                  </button>
                </div>
                <div className="global-search-group__list">
                  {group.items.length === 0 ? (
                    <div className="global-search-group__empty">无命中</div>
                  ) : (
                    group.items.map(item => (
                      <button
                        type="button"
                        key={item.id}
                        className="global-search-item"
                        onClick={() => onSelect(item)}
                      >
                        <div className="global-search-item__title">{renderHighlighted(item.title, query)}</div>
                        <div className="global-search-item__subtitle">{renderHighlighted(item.subtitle || '—', query)}</div>
                      </button>
                    ))
                  )}
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  )
}

