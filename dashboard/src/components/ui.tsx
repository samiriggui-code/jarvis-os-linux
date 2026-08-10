import type { CSSProperties, ReactNode } from 'react'
import { GlassPanel } from './glass'
import { tokens } from '../ui/tokens'

const TEXT = tokens.color.text
const MUTED = tokens.color.textMuted
const BORDER = tokens.color.border

/**
 * Surfaces dashboard — une famille visuelle, peu de chrome.
 *
 * Portées sur le Glass System (même matière que le HUD, `hud/src/ui/tokens.ts`
 * dupliqué ici) — mêmes signatures de props qu'avant, donc les 17 pages qui
 * consomment `Card`/`StatPill` n'ont rien à changer.
 */
export function Card({ children, style = {}, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <GlassPanel level="regular" radius="lg" padding={0} className={className} style={{ padding: '18px 18px 16px', ...style }}>
      {children}
    </GlassPanel>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontFamily: 'Inter, sans-serif',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: MUTED,
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

export function StatPill({ label, value, color = '#0A84FF' }: { label: string; value: string; color?: string }) {
  return (
    <GlassPanel level="subtle" radius="md" padding={0} style={{ padding: '12px 16px', minWidth: 100, flex: '1 1 140px' }}>
      <div style={{ fontFamily: tokens.font.mono, fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color }}>{value}</div>
    </GlassPanel>
  )
}

export function Row({ name, meta, status, statusColor = 'rgba(0,255,153,0.85)' }: { name: string; meta: string; status: string; statusColor?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '10px 0',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: tokens.font.body, fontSize: 13, color: TEXT }}>{name}</div>
        <div style={{ fontFamily: tokens.font.mono, fontSize: 10, color: MUTED, marginTop: 2 }}>{meta}</div>
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: statusColor, flexShrink: 0 }}>{status}</span>
    </div>
  )
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="dash-page-shell">{children}</div>
}

/** Bannière discrète — une seule ligne, pas un bandeau d’alerte permanent. */
export function PlaceholderBanner({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <p style={{
      margin: '0 0 16px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
      color: MUTED,
      letterSpacing: '0.02em',
    }}>
      {note}
    </p>
  )
}
