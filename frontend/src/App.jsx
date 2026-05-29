import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Building2, Leaf } from 'lucide-react'

import { Header } from './components/Header'
import { KpiCards } from './components/KpiCards'
import { ReviewTable, TableSkeleton, EmptyState, ErrorPanel } from './components/ReviewTable'

// Code-split the charts (Recharts) so they don't bloat the initial bundle.
const Analytics = lazy(() =>
  import('./components/Analytics').then((module) => ({ default: module.Analytics })),
)
import { RecordDrawer } from './components/RecordDrawer'
import { Toast } from './components/Toast'
import { useTheme } from './lib/useTheme'
import { computeMetrics } from './lib/format'
import { approveRecord, describeError, fetchNormalizedRecords } from './lib/api'

function App() {
  const { theme, toggleTheme } = useTheme()

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [justApprovedId, setJustApprovedId] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [toast, setToast] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const showToast = useCallback((message, tone = 'success') => {
    const entry = { message, tone, id: Date.now() }
    setToast(entry)
    setTimeout(() => setToast((current) => (current?.id === entry.id ? null : current)), 2200)
  }, [])

  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await fetchNormalizedRecords()
      setRecords(data)
      setLastRefreshed(new Date().toISOString())
    } catch (err) {
      setError(describeError(err, 'Unable to load review records.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Intentional data fetch on mount; loadRecords manages its own loading/error state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords()
  }, [loadRecords])

  const handleApprove = useCallback(
    async (recordId) => {
      try {
        setApprovingId(recordId)
        await approveRecord(recordId)
        // Optimistic update: flip status locally without refetching.
        setRecords((current) =>
          current.map((record) =>
            record.id === recordId ? { ...record, status: 'APPROVED' } : record,
          ),
        )
        setJustApprovedId(recordId)
        setTimeout(
          () => setJustApprovedId((current) => (current === recordId ? null : current)),
          2200,
        )
        showToast('Record approved & locked')
      } catch (err) {
        showToast(describeError(err, 'Approval failed.'), 'error')
      } finally {
        setApprovingId(null)
      }
    },
    [showToast],
  )

  const handleCopied = useCallback(
    (ok) => showToast(ok ? 'Copied to clipboard' : 'Copy failed — select manually', ok ? 'success' : 'error'),
    [showToast],
  )

  const metrics = useMemo(() => computeMetrics(records), [records])
  const hasRecords = records.length > 0
  const tenantId = records[0]?.tenant_id ?? 1
  const showInsights = !loading && !error && hasRecords

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onRefresh={loadRecords}
        loading={loading}
        lastRefreshed={lastRefreshed}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {!error && <KpiCards metrics={metrics} />}
        {showInsights && (
          <Suspense
            fallback={
              <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            }
          >
            <Analytics metrics={metrics} />
          </Suspense>
        )}

        {loading && <TableSkeleton />}
        {!loading && error && <ErrorPanel message={error} onRetry={loadRecords} />}
        {!loading && !error && !hasRecords && <EmptyState />}
        {!loading && !error && hasRecords && (
          <ReviewTable
            records={records}
            approvingId={approvingId}
            justApprovedId={justApprovedId}
            onApprove={handleApprove}
            onOpen={setSelectedRecord}
            onCopy={handleCopied}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Leaf size={14} className="text-emerald-500" />
            Immutable ESG Evidence Ledger
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <Building2 size={13} />
            Tenant {tenantId}
          </span>
        </div>
      </footer>

      <AnimatePresence>
        {selectedRecord && (
          <RecordDrawer
            key={selectedRecord.id}
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onCopy={handleCopied}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </div>
  )
}

export default App
