import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ value, onCopied, label = 'Copy', iconOnly = false, size = 14 }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(event) {
    event.stopPropagation()
    let ok = true
    try {
      await navigator.clipboard.writeText(String(value))
    } catch {
      ok = false
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    onCopied?.(ok)
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title="Copy ID"
        aria-label="Copy ID"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-500 dark:hover:bg-slate-700/70 dark:hover:text-slate-200"
      >
        {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
      {copied ? 'Copied' : label}
    </button>
  )
}
