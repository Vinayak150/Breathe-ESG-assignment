import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  Database,
  Flame,
  Layers,
  TriangleAlert,
  Zap,
} from 'lucide-react'

const CARDS = [
  {
    key: 'total',
    label: 'Total Records',
    icon: Database,
    accent: 'from-slate-400 to-slate-600',
    iconClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    hint: 'All projections',
  },
  {
    key: 'pending',
    label: 'Pending',
    icon: Clock,
    accent: 'from-amber-400 to-orange-500',
    iconClass: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    hint: 'Awaiting review',
  },
  {
    key: 'flagged',
    label: 'Flagged',
    icon: TriangleAlert,
    accent: 'from-rose-400 to-red-500',
    iconClass: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    hint: 'Needs attention',
  },
  {
    key: 'approved',
    label: 'Approved',
    icon: CheckCircle2,
    accent: 'from-emerald-400 to-teal-500',
    iconClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    hint: 'Audit-locked',
  },
  {
    key: 'scope1',
    label: 'Scope 1',
    icon: Flame,
    accent: 'from-indigo-400 to-violet-500',
    iconClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
    hint: 'Direct fuel',
  },
  {
    key: 'scope2',
    label: 'Scope 2',
    icon: Zap,
    accent: 'from-sky-400 to-blue-500',
    iconClass: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    hint: 'Electricity',
  },
  {
    key: 'scope3',
    label: 'Scope 3',
    icon: Layers,
    accent: 'from-fuchsia-400 to-purple-500',
    iconClass: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
    hint: 'Value chain',
  },
]

function KpiCard({ card, value, total, index }) {
  const Icon = card.icon
  const share = total > 0 && !['total'].includes(card.key) ? Math.round((value / total) * 100) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.accent}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.iconClass}`}>
          <Icon size={17} />
        </span>
        {share !== null && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {share}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
          {value}
        </div>
        <div className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500">{card.hint}</div>
      </div>
    </motion.div>
  )
}

export function KpiCards({ metrics }) {
  return (
    <section aria-label="Summary metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      {CARDS.map((card, index) => (
        <KpiCard
          key={card.key}
          card={card}
          index={index}
          value={metrics[card.key]}
          total={metrics.total}
        />
      ))}
    </section>
  )
}
