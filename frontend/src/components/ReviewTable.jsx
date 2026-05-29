import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Inbox,
  Loader2,
  Search,
  ServerCrash,
  TriangleAlert,
} from 'lucide-react'
import { StatusBadge, ScopeChip } from './Badges'
import { CopyButton } from './CopyButton'
import { formatAbsolute, shortId, timeAgo } from '../lib/format'

const COLUMNS = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'source_type', label: 'Source', sortable: true },
  { key: 'scope', label: 'Scope', sortable: true },
  { key: 'consumption_value', label: 'Value', sortable: true, align: 'right' },
  { key: 'unit', label: 'Unit', sortable: false },
  { key: 'emission_factor_version', label: 'Factor', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'updated_at', label: 'Updated', sortable: true },
  { key: 'action', label: 'Action', sortable: false, align: 'right' },
]

const STATUS_ORDER = { FLAGGED: 0, PENDING: 1, APPROVED: 2 }

function ApproveButton({ record, isApproving, justApproved, onApprove }) {
  const canApprove = record.status === 'PENDING' || record.status === 'FLAGGED'

  if (justApproved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={14} />
        Approved
      </span>
    )
  }
  if (!canApprove) {
    return <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Locked</span>
  }
  return (
    <button
      type="button"
      disabled={isApproving}
      onClick={(event) => {
        event.stopPropagation()
        onApprove(record.id)
      }}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900"
    >
      {isApproving ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Approving…
        </>
      ) : (
        <>
          <Check size={14} /> Approve
        </>
      )}
    </button>
  )
}

function HeaderCell({ column, sortKey, sortDir, onSort }) {
  const alignment = column.align === 'right' ? 'text-right' : 'text-left'
  if (!column.sortable) {
    return (
      <th scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${alignment}`}>
        {column.label}
      </th>
    )
  }
  const active = sortKey === column.key
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" className={`px-4 py-3 ${alignment}`}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition hover:text-slate-800 dark:hover:text-slate-200 ${
          active ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'
        } ${column.align === 'right' ? 'flex-row-reverse' : ''}`}
        aria-label={`Sort by ${column.label}`}
      >
        {column.label}
        <Icon size={12} />
      </button>
    </th>
  )
}

function ReviewRow({ record, index, isApproving, justApproved, onApprove, onOpen, onCopy }) {
  const isFlagged = record.status === 'FLAGGED'
  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.2) }}
      onClick={() => onOpen(record)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(record)
      }}
      className={`cursor-pointer border-l-2 transition-colors focus:outline-none focus-visible:bg-emerald-50 dark:focus-visible:bg-emerald-500/10 ${
        isFlagged
          ? 'border-l-rose-500 bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-500/10 dark:hover:bg-rose-500/15'
          : 'border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{shortId(record.id)}</span>
          <CopyButton value={record.id} onCopied={onCopy} iconOnly size={12} />
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
          {isFlagged && <TriangleAlert size={14} className="text-rose-500" aria-label="Flagged" />}
          {record.source_type || 'Unknown'}
        </span>
      </td>
      <td className="px-4 py-3">
        <ScopeChip scope={record.scope} />
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">
        {record.consumption_value}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">{record.unit}</td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {record.emission_factor_version}
        </span>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={record.status} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400" title={formatAbsolute(record.updated_at)}>
        {timeAgo(record.updated_at)}
      </td>
      <td className="px-4 py-3 text-right">
        <ApproveButton
          record={record}
          isApproving={isApproving}
          justApproved={justApproved}
          onApprove={onApprove}
        />
      </td>
    </motion.tr>
  )
}

function Card({ children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  )
}

export function TableSkeleton() {
  return (
    <Card>
      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: 6 }).map((__, j) => (
              <div
                key={j}
                className="h-4 flex-1 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
                style={{ animationDelay: `${(i + j) * 40}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}

export function EmptyState() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          <Inbox size={26} />
        </span>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">No records to review</h2>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          Nothing has been ingested yet. Load sample data with{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
            python manage.py load_mock_data
          </code>{' '}
          or POST to{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">
            /api/ingest/
          </code>
          , then refresh.
        </p>
      </div>
    </Card>
  )
}

export function ErrorPanel({ message, onRetry }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
          <ServerCrash size={26} />
        </span>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Couldn’t load the review queue
        </h2>
        <p className="max-w-md break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Retry
        </button>
      </div>
    </Card>
  )
}

export function ReviewTable({ records, approvingId, justApprovedId, onApprove, onOpen, onCopy }) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? records.filter((r) =>
          [r.id, r.source_type, r.status, r.unit, r.emission_factor_version, `scope ${r.scope}`]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q)),
        )
      : records

    const sorted = [...filtered].sort((a, b) => {
      let av
      let bv
      if (sortKey === 'status') {
        av = STATUS_ORDER[a.status] ?? 99
        bv = STATUS_ORDER[b.status] ?? 99
      } else if (sortKey === 'consumption_value' || sortKey === 'scope') {
        av = Number(a[sortKey])
        bv = Number(b[sortKey])
      } else if (sortKey === 'updated_at') {
        av = new Date(a.updated_at).getTime()
        bv = new Date(b.updated_at).getTime()
      } else {
        av = String(a[sortKey] ?? '').toLowerCase()
        bv = String(b[sortKey] ?? '').toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [records, query, sortKey, sortDir])

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search source, status, ID…"
            aria-label="Search records"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {visibleRecords.length} of {records.length} records
        </span>
      </div>

      <div className="max-h-[65vh] overflow-auto scrollbar-slim">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-800/95">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {COLUMNS.map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            <AnimatePresence initial={false}>
              {visibleRecords.map((record, index) => (
                <ReviewRow
                  key={record.id}
                  record={record}
                  index={index}
                  isApproving={approvingId === record.id}
                  justApproved={justApprovedId === record.id}
                  onApprove={onApprove}
                  onOpen={onOpen}
                  onCopy={onCopy}
                />
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {visibleRecords.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            No records match “{query}”.
          </div>
        )}
      </div>
    </Card>
  )
}
