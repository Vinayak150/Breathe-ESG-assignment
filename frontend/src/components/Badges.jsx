import { motion } from 'framer-motion'
import { CheckCircle2, Clock, TriangleAlert } from 'lucide-react'

const STATUS_STYLES = {
  APPROVED: {
    label: 'Approved',
    icon: CheckCircle2,
    className:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    dot: 'bg-emerald-500',
  },
  PENDING: {
    label: 'Pending',
    icon: Clock,
    className:
      'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    dot: 'bg-amber-500',
  },
  FLAGGED: {
    label: 'Flagged',
    icon: TriangleAlert,
    className:
      'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    dot: 'bg-rose-500',
  },
}

export function StatusBadge({ status }) {
  const config = STATUS_STYLES[status] || STATUS_STYLES.PENDING
  const Icon = config.icon
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${config.className}`}
    >
      <Icon size={12} aria-hidden="true" />
      {config.label}
    </motion.span>
  )
}

const SCOPE_STYLES = {
  1: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20',
  2: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  3: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20',
}

export function ScopeChip({ scope }) {
  const className = SCOPE_STYLES[scope] || 'bg-slate-100 text-slate-700 ring-slate-600/20'
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      Scope {scope}
    </span>
  )
}
