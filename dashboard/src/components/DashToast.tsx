/**
 * Notifications glass — même famille visuelle que le HUD (sans dépendance sonner).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react'
import { GlassPanel } from './glass'
import { tokens } from '../ui/tokens'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastContextValue {
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const

const COLOR: Record<ToastType, string> = {
  info: tokens.color.accent,
  success: tokens.color.success,
  warning: tokens.color.warning,
  error: tokens.color.danger,
}

let seq = 0

export function DashToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `toast-${++seq}`
    setItems(prev => [...prev.slice(-4), { ...t, id }])
    window.setTimeout(() => dismiss(id), 5200)
  }, [dismiss])

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="dash-toast-stack" aria-live="polite">
        {items.map(t => {
          const Icon = ICON[t.type]
          const color = COLOR[t.type]
          return (
            <GlassPanel
              key={t.id}
              level="floating"
              radius="lg"
              padding={0}
              className="dash-toast-item"
              style={{
                padding: '12px 14px',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                borderColor: `${color}44`,
                boxShadow: `0 16px 48px -16px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.22), 0 0 24px -8px ${color}33`,
              }}
            >
              <Icon size={16} style={{ color, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: tokens.font.body, fontSize: 12, fontWeight: 600, color: tokens.color.text }}>
                  {t.title}
                </div>
                {t.message ? (
                  <div style={{ fontFamily: tokens.font.mono, fontSize: 10, color: tokens.color.textMuted, marginTop: 3, lineHeight: 1.4 }}>
                    {t.message}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fermer"
                className="glass-btn"
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 2,
                  cursor: 'pointer',
                  color: tokens.color.textMuted,
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </GlassPanel>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useDashToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useDashToast must be used within DashToastProvider')
  return ctx
}
