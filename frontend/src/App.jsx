import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Inbox,
  Leaf,
  Loader2,
  RefreshCcw,
  X,
} from 'lucide-react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL

const COLUMNS = ['ID', 'Source', 'Scope', 'Value', 'Unit', 'Factor Version', 'Status', 'Updated', 'Action']

function getRecordsPayload(data) {
  return Array.isArray(data) ? data : data.results || []
}

function shortId(value) {
  return String(value).slice(0, 8)
}

function timeAgo(iso) {
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

function formatAbsolute(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function StatusBadge({ status }) {
  const tone = status ? status.toLowerCase() : 'pending'
  return <span className={`badge status-${tone}`}>{status}</span>
}

function ScopeChip({ scope }) {
  return <span className={`chip scope-${scope}`}>Scope {scope}</span>
}

function CopyIdButton({ value, onCopy }) {
  return (
    <button
      type="button"
      className="copy-btn"
      title="Copy record ID"
      onClick={(event) => {
        event.stopPropagation()
        onCopy(value)
      }}
    >
      <Copy size={13} />
    </button>
  )
}

function KpiCard({ label, value, tone = 'neutral' }) {
  return (
    <div className={`kpi-card kpi-${tone}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
    </div>
  )
}

function KpiGrid({ metrics }) {
  return (
    <section className="kpi-grid" aria-label="Summary metrics">
      <KpiCard label="Total Records" value={metrics.total} tone="neutral" />
      <KpiCard label="Pending" value={metrics.pending} tone="amber" />
      <KpiCard label="Flagged" value={metrics.flagged} tone="red" />
      <KpiCard label="Approved" value={metrics.approved} tone="green" />
      <KpiCard label="Scope 1" value={metrics.scope1} tone="scope1" />
      <KpiCard label="Scope 2" value={metrics.scope2} tone="scope2" />
      <KpiCard label="Scope 3" value={metrics.scope3} tone="scope3" />
    </section>
  )
}

function SkeletonTable() {
  return (
    <div className="card table-card" aria-busy="true" aria-label="Loading records">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {COLUMNS.map((column) => (
                  <td key={column}>
                    <span className="skeleton" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card state-card">
      <div className="state-icon neutral">
        <Inbox size={28} />
      </div>
      <h2>No records to review</h2>
      <p>
        Nothing has been ingested yet. Load sample data with{' '}
        <code>python manage.py load_mock_data</code> or POST to <code>/api/ingest/</code>, then
        refresh.
      </p>
    </div>
  )
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div className="card state-card">
      <div className="state-icon danger">
        <AlertOctagon size={28} />
      </div>
      <h2>Couldn’t load the review queue</h2>
      <p className="state-detail">{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        <RefreshCcw size={15} />
        Retry
      </button>
    </div>
  )
}

function ReviewRow({ record, isApproving, justApproved, onApprove, onOpen, onCopy }) {
  const canApprove = record.status === 'PENDING' || record.status === 'FLAGGED'
  const isFlagged = record.status === 'FLAGGED'
  const rowClass = ['clickable', isFlagged ? 'flagged-row' : '', justApproved ? 'approved-flash' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <tr className={rowClass} onClick={() => onOpen(record)}>
      <td>
        <span className="id-cell">
          <span className="mono muted">{shortId(record.id)}</span>
          <CopyIdButton value={record.id} onCopy={onCopy} />
        </span>
      </td>
      <td>
        <span className="source-cell">
          {isFlagged && <AlertTriangle className="flag-icon" size={14} aria-label="Flagged" />}
          {record.source_type || 'Unknown'}
        </span>
      </td>
      <td>
        <ScopeChip scope={record.scope} />
      </td>
      <td className="numeric">{record.consumption_value}</td>
      <td className="muted">{record.unit}</td>
      <td className="mono muted">{record.emission_factor_version}</td>
      <td>
        <StatusBadge status={record.status} />
      </td>
      <td className="muted" title={formatAbsolute(record.updated_at)}>
        {timeAgo(record.updated_at)}
      </td>
      <td>
        {canApprove ? (
          <button
            type="button"
            className="btn btn-approve"
            disabled={isApproving}
            onClick={(event) => {
              event.stopPropagation()
              onApprove(record.id)
            }}
          >
            {isApproving ? (
              <>
                <Loader2 size={14} className="spin" />
                Approving…
              </>
            ) : (
              <>
                <Check size={14} />
                Approve
              </>
            )}
          </button>
        ) : justApproved ? (
          <span className="approved-feedback">
            <CheckCircle2 size={14} />
            Approved
          </span>
        ) : (
          <span className="locked">Locked</span>
        )}
      </td>
    </tr>
  )
}

function ReviewTable({ records, approvingId, justApprovedId, onApprove, onOpen, onCopy }) {
  return (
    <div className="card table-card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <ReviewRow
                key={record.id}
                record={record}
                isApproving={approvingId === record.id}
                justApproved={justApprovedId === record.id}
                onApprove={onApprove}
                onOpen={onOpen}
                onCopy={onCopy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DetailField({ label, children }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <div className="detail-value">{children}</div>
    </div>
  )
}

function RecordDrawer({ record, onClose, onCopy }) {
  const [rawPayload, setRawPayload] = useState(null)
  const [rawLoading, setRawLoading] = useState(Boolean(record?.raw_payload))
  const [rawError, setRawError] = useState('')

  useEffect(() => {
    if (!record?.raw_payload) return undefined
    let active = true

    axios
      .get(`${API_URL}/api/raw-payloads/${record.raw_payload}/`, {
        headers: record.tenant_id ? { 'X-Tenant-ID': record.tenant_id } : undefined,
      })
      .then((response) => {
        if (active) setRawPayload(response.data)
      })
      .catch((err) => {
        if (active) setRawError(err.response?.data?.detail || err.message || 'Unable to load evidence.')
      })
      .finally(() => {
        if (active) setRawLoading(false)
      })

    return () => {
      active = false
    }
  }, [record])

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!record) return null

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()} aria-label="Record detail">
        <header className="drawer-head">
          <div>
            <span className="drawer-eyebrow">Normalized Record</span>
            <h2>{record.source_type || 'Unknown'} · Scope {record.scope}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-body">
          <span className="readonly-note">Read-only — evidence and projections are immutable.</span>

          <DetailField label="Record ID">
            <span className="id-cell">
              <span className="mono">{record.id}</span>
              <CopyIdButton value={record.id} onCopy={onCopy} />
            </span>
          </DetailField>

          <div className="detail-row">
            <DetailField label="Status">
              <StatusBadge status={record.status} />
            </DetailField>
            <DetailField label="Scope">
              <ScopeChip scope={record.scope} />
            </DetailField>
          </div>

          <div className="detail-row">
            <DetailField label="Source Type">{record.source_type || 'Unknown'}</DetailField>
            <DetailField label="Factor Version">
              <span className="mono">{record.emission_factor_version}</span>
            </DetailField>
          </div>

          <div className="detail-row">
            <DetailField label="Value">
              <span className="numeric">{record.consumption_value}</span> {record.unit}
            </DetailField>
            <DetailField label="Tenant">{record.tenant_id ?? '—'}</DetailField>
          </div>

          <div className="detail-row">
            <DetailField label="Created">
              <span title={formatAbsolute(record.created_at)}>{timeAgo(record.created_at)}</span>
            </DetailField>
            <DetailField label="Updated">
              <span title={formatAbsolute(record.updated_at)}>{timeAgo(record.updated_at)}</span>
            </DetailField>
          </div>

          <DetailField label="Normalization Metadata">
            <pre className="json-block">
              {JSON.stringify(record.normalization_metadata ?? {}, null, 2)}
            </pre>
          </DetailField>

          <DetailField label="Raw Payload Evidence">
            {rawLoading && <span className="muted small">Loading evidence…</span>}
            {!rawLoading && rawError && <span className="state-detail">{rawError}</span>}
            {!rawLoading && !rawError && rawPayload && (
              <>
                <div className="detail-subrow">
                  <span className="detail-label">Ingestion Hash</span>
                  <span className="mono small wrap">{rawPayload.ingestion_hash}</span>
                </div>
                <div className="detail-subrow">
                  <span className="detail-label">Parser Version</span>
                  <span className="mono small">{rawPayload.parser_version}</span>
                </div>
                <span className="detail-label">Raw Data</span>
                <pre className="json-block">{JSON.stringify(rawPayload.raw_data ?? {}, null, 2)}</pre>
              </>
            )}
          </DetailField>
        </div>
      </aside>
    </div>
  )
}

function Toast({ message }) {
  if (!message) return null
  return (
    <div className="toast" role="status">
      <CheckCircle2 size={15} />
      {message}
    </div>
  )
}

function computeMetrics(records) {
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

function App() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [justApprovedId, setJustApprovedId] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [toast, setToast] = useState('')

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const response = await axios.get(`${API_URL}/api/normalized-records/`)
      setRecords(getRecordsPayload(response.data))
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Unable to load review records.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Intentional data fetch on mount; fetchRecords manages its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecords()
  }, [fetchRecords])

  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? '' : current)), 2000)
  }, [])

  const copyId = useCallback(
    async (id) => {
      try {
        await navigator.clipboard.writeText(String(id))
        showToast('Record ID copied')
      } catch {
        showToast('Copy failed — select manually')
      }
    },
    [showToast],
  )

  async function approveRecord(recordId) {
    try {
      setApprovingId(recordId)
      await axios.patch(`${API_URL}/api/normalized-records/${recordId}/approve/`)
      setRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === recordId ? { ...record, status: 'APPROVED' } : record,
        ),
      )
      setJustApprovedId(recordId)
      setTimeout(() => setJustApprovedId((current) => (current === recordId ? null : current)), 2200)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Approval failed.')
    } finally {
      setApprovingId(null)
    }
  }

  const metrics = useMemo(() => computeMetrics(records), [records])
  const hasRecords = records.length > 0
  const tenantId = records[0]?.tenant_id ?? 1

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <span className="brand-mark">
              <Leaf size={20} />
            </span>
            <div>
              <h1>Breathe ESG Ledger</h1>
              <p>Emission Review &amp; Approval Console</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={fetchRecords}
            disabled={loading}
          >
            <RefreshCcw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      <main className="container content">
        {!error && <KpiGrid metrics={metrics} />}

        {loading && <SkeletonTable />}
        {!loading && error && <ErrorPanel message={error} onRetry={fetchRecords} />}
        {!loading && !error && !hasRecords && <EmptyState />}
        {!loading && !error && hasRecords && (
          <ReviewTable
            records={records}
            approvingId={approvingId}
            justApprovedId={justApprovedId}
            onApprove={approveRecord}
            onOpen={setSelectedRecord}
            onCopy={copyId}
          />
        )}
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="footer-title">
            <Leaf size={14} />
            Immutable ESG Evidence Ledger
          </span>
          <span className="tenant-indicator">
            <Building2 size={14} />
            Tenant {tenantId}
          </span>
        </div>
      </footer>

      {selectedRecord && (
        <RecordDrawer
          key={selectedRecord.id}
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onCopy={copyId}
        />
      )}
      <Toast message={toast} />
    </div>
  )
}

export default App
