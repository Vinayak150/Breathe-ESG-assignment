import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
        >
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              toast.tone === 'error' ? 'bg-rose-600' : 'bg-slate-900 dark:bg-slate-700'
            }`}
          >
            {toast.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
