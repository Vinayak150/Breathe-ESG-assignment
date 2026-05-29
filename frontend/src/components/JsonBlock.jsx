import { CopyButton } from './CopyButton'

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Lightweight, dependency-free JSON highlighter. Input is HTML-escaped before any
// markup is added, so backend-supplied values cannot inject markup.
function highlightJson(obj) {
  const json = escapeHtml(JSON.stringify(obj ?? {}, null, 2))
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-300' // numbers
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-sky-300' : 'text-emerald-300' // keys vs strings
      } else if (/true|false/.test(match)) {
        cls = 'text-violet-300'
      } else if (/null/.test(match)) {
        cls = 'text-slate-500'
      }
      return `<span class="${cls}">${match}</span>`
    },
  )
}

export function JsonBlock({ data, copyLabel = 'Copy JSON' }) {
  const pretty = JSON.stringify(data ?? {}, null, 2)
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="absolute right-2 top-2 z-10 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton value={pretty} label={copyLabel} />
      </div>
      <pre
        className="scrollbar-slim max-h-72 overflow-auto p-4 text-xs leading-relaxed text-slate-200"
        dangerouslySetInnerHTML={{ __html: highlightJson(data) }}
      />
    </div>
  )
}
