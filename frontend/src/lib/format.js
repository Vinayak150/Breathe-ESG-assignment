export function shortId(value) {
  return String(value ?? '').slice(0, 8)
}

export function timeAgo(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSeconds < 45) return 'just now'

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [label, seconds] of units) {
    const value = Math.floor(diffSeconds / seconds)
    if (value >= 1) return `${value} ${label}${value !== 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export function formatAbsolute(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function computeMetrics(records) {
  const countStatus = (status) => records.filter((r) => r.status === status).length
  const countScope = (scope) => records.filter((r) => Number(r.scope) === scope).length
  return {
    total: records.length,
    pending: countStatus('PENDING'),
    flagged: countStatus('FLAGGED'),
    approved: countStatus('APPROVED'),
    scope1: countScope(1),
    scope2: countScope(2),
    scope3: countScope(3),
  }
}
