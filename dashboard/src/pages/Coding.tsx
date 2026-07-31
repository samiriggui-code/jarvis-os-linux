import { useState } from 'react'

const projects = [
  { name: 'JARVIS v2.0', lang: 'React/TypeScript', status: 'active', pct: 65, commits: 47, desc: 'Personal AI Operating System', color: '#00E5FF' },
  { name: 'ML Image Classifier', lang: 'Python/TensorFlow', status: 'active', pct: 40, commits: 23, desc: 'CNN-based image recognition model', color: '#00FF99' },
  { name: 'Portfolio v3', lang: 'Next.js', status: 'paused', pct: 80, commits: 61, desc: 'Personal developer portfolio', color: '#0066FF' },
  { name: 'DSA Visualizer', lang: 'Python', status: 'planning', pct: 10, commits: 5, desc: 'Algorithm visualization tool', color: '#FFC857' },
]

const snippets = [
  { name: 'Binary Search', lang: 'Python', code: 'def binary_search(arr, target):\n    l, r = 0, len(arr) - 1\n    while l <= r:\n        m = (l + r) // 2\n        if arr[m] == target: return m\n        elif arr[m] < target: l = m + 1\n        else: r = m - 1\n    return -1' },
  { name: 'Fibonacci DP', lang: 'Python', code: 'def fib(n, memo={}):\n    if n in memo: return memo[n]\n    if n <= 1: return n\n    memo[n] = fib(n-1) + fib(n-2)\n    return memo[n]' },
]

const statusColor: Record<string, string> = { active: '#00FF99', paused: '#FFC857', planning: '#0066FF' }

export default function Coding() {
  const [activeSnippet, setActiveSnippet] = useState(0)
  const [tab, setTab] = useState<'projects' | 'snippets'>('projects')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Header Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Active Projects', value: '4', color: '#00E5FF' },
          { label: 'Total Commits', value: '136', color: '#00FF99' },
          { label: 'Languages', value: '5', color: '#FFC857' },
          { label: 'Lines of Code', value: '12.4K', color: '#0066FF' },
        ].map(s => (
          <div key={s.label} className="glass" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 2, padding: 4, background: 'rgba(11, 17, 32, 0.6)', borderRadius: 10, border: '1px solid rgba(0, 229, 255, 0.1)', width: 'fit-content' }}>
        {(['projects', 'snippets'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 20px', borderRadius: 7, cursor: 'pointer',
            background: tab === t ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
            border: `1px solid ${tab === t ? 'rgba(0, 229, 255, 0.3)' : 'transparent'}`,
            color: tab === t ? '#00E5FF' : 'rgba(224, 244, 255, 0.4)',
            fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'projects' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {projects.map(p => (
            <div key={p.name} className="glass glass-hover" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: p.color, letterSpacing: '0.05em' }}>{p.name}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.5)', marginTop: 3 }}>{p.desc}</div>
                </div>
                <span style={{ padding: '3px 8px', borderRadius: 4, background: `${statusColor[p.status]}15`, border: `1px solid ${statusColor[p.status]}33`, fontFamily: 'JetBrains Mono', fontSize: 9, color: statusColor[p.status], textTransform: 'uppercase' }}>
                  {p.status}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>{p.lang}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>{p.commits} commits</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.5)' }}>Progress</span>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: p.color }}>{p.pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${p.pct}%`, background: `linear-gradient(90deg, ${p.color}66, ${p.color})` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'snippets' && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, height: 400 }}>
          <div className="glass" style={{ padding: 12, overflowY: 'auto' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 10 }}>LIBRARY</div>
            {snippets.map((s, i) => (
              <div key={i} onClick={() => setActiveSnippet(i)} style={{
                padding: '8px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 6,
                background: activeSnippet === i ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 229, 255, 0.03)',
                border: `1px solid ${activeSnippet === i ? 'rgba(0, 229, 255, 0.3)' : 'rgba(0, 229, 255, 0.08)'}`,
              }}>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: activeSnippet === i ? '#00E5FF' : 'rgba(224, 244, 255, 0.7)' }}>{s.name}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.4)' }}>{s.lang}</div>
              </div>
            ))}
          </div>
          <div className="glass" style={{ padding: 16, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 600, color: '#00E5FF' }}>{snippets[activeSnippet].name}</div>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)', padding: '2px 8px', border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: 4 }}>
                {snippets[activeSnippet].lang}
              </span>
            </div>
            <pre style={{
              fontFamily: 'JetBrains Mono', fontSize: 12.5, lineHeight: 1.7,
              color: '#e0f4ff', background: 'rgba(0, 0, 0, 0.4)', padding: 16, borderRadius: 8,
              border: '1px solid rgba(0, 229, 255, 0.08)', overflowX: 'auto',
              whiteSpace: 'pre-wrap', margin: 0,
            }}>
              <code>{snippets[activeSnippet].code}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
