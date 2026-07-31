import type { CSSProperties, ReactNode } from 'react'

/** Surfaces dashboard — une famille visuelle, peu de chrome. */
export function Card({ children, style = {}, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        padding: '18px 18px 16px',
        borderRadius: 14,
        background: 'rgba(10, 14, 28, 0.72)',
        border: '1px solid rgba(255,255,255,0.06)',
        ...style,
      }}
    >
      {children}
    </div>
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
      color: 'rgba(224, 244, 255, 0.45)',
      marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

export function StatPill({ label, value, color = '#00E5FF' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: 12,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      minWidth: 100,
      flex: '1 1 140px',
    }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 15, fontWeight: 600, color }}>{value}</div>
    </div>
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
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(224, 244, 255, 0.88)' }}>{name}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>{meta}</div>
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
      color: 'rgba(255,255,255,0.28)',
      letterSpacing: '0.02em',
    }}>
      {note}
    </p>
  )
}
