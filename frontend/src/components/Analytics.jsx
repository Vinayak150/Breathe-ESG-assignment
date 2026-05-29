import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, PieChart as PieIcon, TrendingUp } from 'lucide-react'

const SCOPE_COLORS = ['#6366f1', '#0ea5e9', '#a855f7']
const STATUS_COLORS = {
  PENDING: '#f59e0b',
  FLAGGED: '#ef4444',
  APPROVED: '#10b981',
}

function ChartCard({ title, icon: Icon, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-slate-400 dark:text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
      {children}
    </motion.div>
  )
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
      <span className="font-medium text-slate-700 dark:text-slate-200">{item.name || item.payload.name}</span>
      <span className="ml-2 font-bold text-slate-900 dark:text-white">{item.value}</span>
    </div>
  )
}

export function Analytics({ metrics }) {
  const scopeData = useMemo(
    () =>
      [
        { name: 'Scope 1', value: metrics.scope1 },
        { name: 'Scope 2', value: metrics.scope2 },
        { name: 'Scope 3', value: metrics.scope3 },
      ].filter((d) => d.value > 0),
    [metrics],
  )

  const statusData = useMemo(
    () => [
      { name: 'Pending', key: 'PENDING', value: metrics.pending },
      { name: 'Flagged', key: 'FLAGGED', value: metrics.flagged },
      { name: 'Approved', key: 'APPROVED', value: metrics.approved },
    ],
    [metrics],
  )

  const approvalRate = metrics.total > 0 ? Math.round((metrics.approved / metrics.total) * 100) : 0
  const reviewBacklog = metrics.pending + metrics.flagged

  return (
    <section aria-label="Analytics" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ChartCard title="Records by Scope" icon={PieIcon} delay={0.05}>
        <div className="h-52">
          {scopeData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scopeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  stroke="none"
                >
                  {scopeData.map((entry, index) => (
                    <Cell key={entry.name} fill={SCOPE_COLORS[index % SCOPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {scopeData.map((entry, index) => (
            <span key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SCOPE_COLORS[index % SCOPE_COLORS.length] }}
              />
              {entry.name} · {entry.value}
            </span>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="Records by Status" icon={Activity} delay={0.1}>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                axisLine={false}
                tickLine={false}
                className="text-slate-400"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                axisLine={false}
                tickLine={false}
                className="text-slate-400"
              />
              <Tooltip cursor={{ fill: 'rgb(148 163 184 / 0.1)' }} content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {statusData.map((entry) => (
                  <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="Insights" icon={TrendingUp} delay={0.15}>
        <div className="grid grid-cols-2 gap-3">
          <Insight label="Approval rate" value={`${approvalRate}%`} tone="emerald" />
          <Insight label="Review backlog" value={reviewBacklog} tone="amber" />
          <Insight label="Flagged" value={metrics.flagged} tone="rose" />
          <Insight label="Total records" value={metrics.total} tone="slate" />
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {reviewBacklog === 0
            ? 'All records reviewed — the ledger is clear for audit.'
            : `${reviewBacklog} record${reviewBacklog === 1 ? '' : 's'} await analyst sign-off.`}
        </div>
      </ChartCard>
    </section>
  )
}

const TONES = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  slate: 'text-slate-700 dark:text-slate-200',
}

function Insight({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className={`text-xl font-bold tabular-nums ${TONES[tone]}`}>{value}</div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  )
}
