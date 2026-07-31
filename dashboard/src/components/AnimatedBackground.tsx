export default function AnimatedBackground() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 12}s`,
    duration: `${8 + Math.random() * 12}s`,
    size: Math.random() > 0.7 ? 2 : 1,
  }))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Deep space gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(0, 102, 255, 0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0, 229, 255, 0.06) 0%, transparent 50%), #050816',
      }} />

      {/* Grid lines */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
      }} />

      {/* Particles */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: p.left,
          bottom: '-10px',
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: '#00E5FF',
          boxShadow: '0 0 4px rgba(0, 229, 255, 0.8)',
          animation: `particle-up ${p.duration} ${p.delay} linear infinite`,
        }} />
      ))}

      {/* Scan line */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.4), transparent)',
        animation: 'scan 8s linear infinite',
      }} />

      {/* Corner HUD elements */}
      <div style={{ position: 'absolute', top: 16, left: 16, opacity: 0.25 }}>
        <div style={{ width: 20, height: 20, borderTop: '1px solid #00E5FF', borderLeft: '1px solid #00E5FF' }} />
      </div>
      <div style={{ position: 'absolute', top: 16, right: 16, opacity: 0.25 }}>
        <div style={{ width: 20, height: 20, borderTop: '1px solid #00E5FF', borderRight: '1px solid #00E5FF' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 16, left: 16, opacity: 0.25 }}>
        <div style={{ width: 20, height: 20, borderBottom: '1px solid #00E5FF', borderLeft: '1px solid #00E5FF' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 16, right: 16, opacity: 0.25 }}>
        <div style={{ width: 20, height: 20, borderBottom: '1px solid #00E5FF', borderRight: '1px solid #00E5FF' }} />
      </div>
    </div>
  )
}
