import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, FileCode2, Lock, X } from 'lucide-react'
import { StatusBadge, ScopeChip } from './Badges'
import { CopyButton } from './CopyButton'
import { JsonBlock } from './JsonBlock'
import { fetchRawPayload, describeError } from '../lib/api'
import { formatAbsolute, timeAgo } from '../lib/format'

function MetaCard({ label, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-800 dark:text-slate-100">{children}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h3>
      {children}
    </div>
  )
}

export function RecordDrawer({ record, onClose, onCopy }) {
  const [rawPayload, setRawPayload] = useState(null)
  const [rawLoading, setRawLoading] = useState(Boolean(record?.raw_payload))
  const [rawError, setRawError] = useState('')
  const [rawOpen, setRawOpen] = useState(true)

  useEffect(() => {
    if (!record?.raw_payload) return undefined
    let active = true

    // Reset state for each new fetch so a previous record's payload/error never lingers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawLoading(true)
    setRawError('')
    setRawPayload(null)

    fetchRawPayload(record.raw_payload)
      .then((data) => {
        if (active) setRawPayload(data)
      })
      .catch((err) => {
        if (active) setRawError(describeError(err, 'Unable to load evidence.'))
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
    <motion.div
      className="fixed inset-0 z-50 flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Record detail"
        initial={{ x: 40, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Normalized Record
            </span>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-slate-900 dark:text-white">
              {record.source_type || 'Unknown'} · Scope {record.scope}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </header>

        <div className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <Lock size={13} />
            Read-only — evidence and projections are immutable.
          </div>

          <Section title="Identity">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">{record.id}</span>
              <CopyButton value={record.id} onCopied={onCopy} iconOnly />
            </div>
          </Section>

          <Section title="Overview">
            <div className="grid grid-cols-2 gap-3">
              <MetaCard label="Status">
                <StatusBadge status={record.status} />
              </MetaCard>
              <MetaCard label="Scope">
                <ScopeChip scope={record.scope} />
              </MetaCard>
              <MetaCard label="Value">
                <span className="font-medium tabular-nums">{record.consumption_value}</span> {record.unit}
              </MetaCard>
              <MetaCard label="Factor Version">
                <span className="font-mono text-xs">{record.emission_factor_version}</span>
              </MetaCard>
              <MetaCard label="Source">{record.source_type || 'Unknown'}</MetaCard>
              <MetaCard label="Tenant">{record.tenant_id ?? '—'}</MetaCard>
              <MetaCard label="Created">
                <span title={formatAbsolute(record.created_at)}>{timeAgo(record.created_at)}</span>
              </MetaCard>
              <MetaCard label="Updated">
                <span title={formatAbsolute(record.updated_at)}>{timeAgo(record.updated_at)}</span>
              </MetaCard>
            </div>
          </Section>

          <Section title="Normalization Metadata">
            <JsonBlock data={record.normalization_metadata ?? {}} />
          </Section>

          <Section title="Raw Payload Evidence">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRawOpen((open) => !open)}
                aria-expanded={rawOpen}
                className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <FileCode2 size={15} className="text-slate-400" />
                  Immutable evidence
                </span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${rawOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {rawOpen && (
                <div className="space-y-3 p-3">
                  {rawLoading && (
                    <div className="animate-pulse text-sm text-slate-400">Loading evidence…</div>
                  )}
                  {!rawLoading && rawError && (
                    <div className="break-words rounded-lg bg-rose-50 px-3 py-2 font-mono text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                      {rawError}
                    </div>
                  )}
                  {!rawLoading && !rawError && rawPayload && (
                    <>
                      <div className="grid grid-cols-1 gap-2">
                        <MetaCard label="Ingestion Hash">
                          <span className="break-all font-mono text-xs">{rawPayload.ingestion_hash}</span>
                        </MetaCard>
                        <MetaCard label="Parser Version">
                          <span className="font-mono text-xs">{rawPayload.parser_version}</span>
                        </MetaCard>
                      </div>
                      <div>
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Raw Data
                        </div>
                        <JsonBlock data={rawPayload.raw_data ?? {}} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>
        </div>
      </motion.aside>
    </motion.div>
  )
}
