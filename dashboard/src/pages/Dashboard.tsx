import { useState, useEffect } from 'react'

function StatRing({ value, label, color = '#00E5FF' }: { value: number; label: string; color?: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (value / 100) * circ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: 70, height: 70 }}>
        <svg width="70" height="70" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="5" />
          <circle
            cx="35" cy="35" r={r} fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color,
        }}>{value}%</div>
      </div>
      <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.45)', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </div>
  )
}

function Card({ children, style = {}, className = '' }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={`glass ${className}`} style={{ padding: 16, ...style }}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function ProgressItem({ label, value, color = '#00E5FF', current, total }: { label: string; value: number; color?: string; current?: string; total?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)' }}>{label}</span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color }}>{current ?? `${value}%`}{total ? ` / ${total}` : ''}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
    </div>
  )
}

const quotes = [
  "The secret of getting ahead is getting started.",
  "Every expert was once a beginner.",
  "Code is poetry written in logic.",
  "Champions train, losers complain.",
  "Build something that matters.",
]

export default function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [time, setTime] = useState(new Date())
  const [water, setWater] = useState(5)
  const [quoteIdx] = useState(Math.floor(Math.random() * quotes.length))

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hour = time.getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const schedule = [
    { time: '06:00', task: 'Morning Run', type: 'fitness', done: true },
    { time: '07:30', task: 'Python DSA Practice', type: 'code', done: true },
    { time: '09:00', task: 'Mathematics — Chapter 12', type: 'school', done: false },
    { time: '11:00', task: 'Chemistry Lab Report', type: 'school', done: false },
    { time: '14:00', task: 'AI Project — JARVIS v2', type: 'code', done: false },
    { time: '16:30', task: 'Tennis Practice', type: 'tennis', done: false },
    { time: '20:00', task: 'Revision — History', type: 'school', done: false },
  ]

  const typeColors: Record<string, string> = {
    fitness: '#00FF99',
    code: '#00E5FF',
    school: '#FFC857',
    tennis: '#0066FF',
  }

  const missions = [
    'Complete Chapter 12 Mathematics',
    'Push JARVIS project to GitHub',
    '3km morning run',
    'Drink 2.5L water',
    '2hr focused study session',
  ]

  const homeworkDue = [
    { subject: 'Mathematics', topic: 'Probability Exercise 13.2', due: 'Tomorrow', urgent: true },
    { subject: 'Chemistry', topic: 'Electrochemistry Notes', due: 'Wed', urgent: false },
    { subject: 'English', topic: 'Essay — Technology & Society', due: 'Fri', urgent: false },
    { subject: 'Computer Science', topic: 'Python OOP Project', due: 'Next Mon', urgent: false },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Hero Header */}
      <div className="glass animate-breathe" style={{ padding: '20px 24px', background: 'rgba(0, 102, 255, 0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 6 }}>
              {greeting.toUpperCase()} · {dateStr.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 28, fontWeight: 800, color: '#e0f4ff', letterSpacing: '0.05em', lineHeight: 1.2 }}>
              {greeting}, <span style={{ color: '#00E5FF' }} className="glow-text">Devannsh</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(0, 229, 255, 0.5)', marginTop: 8, fontStyle: 'italic' }}>
              "{quotes[quoteIdx]}"
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 36, fontWeight: 900, color: '#00E5FF', letterSpacing: '0.1em', lineHeight: 1 }} className="glow-text">
              {timeStr}
            </div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)', marginTop: 4 }}>
              IST · INDIA
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 18 }}>⛅</span>
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.6)' }}>28°C · Mumbai</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Rings + Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Rings */}
        <Card>
          <CardTitle>Today's Progress</CardTitle>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
            <StatRing value={68} label="Overall" color="#00E5FF" />
            <StatRing value={75} label="Study" color="#FFC857" />
            <StatRing value={55} label="Coding" color="#0066FF" />
            <StatRing value={80} label="Fitness" color="#00FF99" />
          </div>
        </Card>

        {/* Daily mission */}
        <Card>
          <CardTitle>Daily Mission</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {missions.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '3px', flexShrink: 0,
                  border: i < 2 ? 'none' : '1.5px solid rgba(0, 229, 255, 0.35)',
                  background: i < 2 ? '#00FF99' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i < 2 && <span style={{ fontSize: 8, color: '#050816', fontWeight: 900 }}>✓</span>}
                </div>
                <span style={{
                  fontFamily: 'Inter', fontSize: 12,
                  color: i < 2 ? 'rgba(0, 255, 153, 0.5)' : 'rgba(224, 244, 255, 0.75)',
                  textDecoration: i < 2 ? 'line-through' : 'none',
                }}>{m}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Schedule + Homework + Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr', gap: 16 }}>
        {/* Today's Schedule */}
        <Card>
          <CardTitle>Today's Schedule</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {schedule.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 7,
                background: item.done ? 'transparent' : 'rgba(0, 229, 255, 0.03)',
                border: `1px solid ${item.done ? 'transparent' : `${typeColors[item.type]}22`}`,
                opacity: item.done ? 0.45 : 1,
                transition: 'all 0.2s',
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: typeColors[item.type], flexShrink: 0, boxShadow: `0 0 6px ${typeColors[item.type]}` }} />
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.5)', width: 34, flexShrink: 0 }}>{item.time}</span>
                <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.8)', flex: 1 }}>{item.task}</span>
                {item.done && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#00FF99' }}>✓</span>}
              </div>
            ))}
          </div>
        </Card>

        {/* Homework Due */}
        <Card>
          <CardTitle>Homework Due</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {homeworkDue.map((hw, i) => (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: hw.urgent ? 'rgba(255, 77, 109, 0.06)' : 'rgba(0, 229, 255, 0.03)', border: `1px solid ${hw.urgent ? 'rgba(255, 77, 109, 0.2)' : 'rgba(0, 229, 255, 0.1)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 9, fontWeight: 600, color: hw.urgent ? '#FF4D6D' : '#00E5FF', letterSpacing: '0.08em' }}>{hw.subject}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: hw.urgent ? '#FF4D6D' : 'rgba(0, 229, 255, 0.4)' }}>{hw.due}</span>
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.65)' }}>{hw.topic}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Body Stats */}
        <Card>
          <CardTitle>Body Stats</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ProgressItem label="Water" value={(water / 10) * 100} color="#00E5FF" current={`${water * 0.25}L`} total="2.5L" />
            <ProgressItem label="Sleep" value={87} color="#0066FF" current="7h 40m" total="8h" />
            <ProgressItem label="Workout" value={60} color="#00FF99" current="Push Day" />
            <ProgressItem label="Running" value={55} color="#FFC857" current="2.1km" total="3km" />
            <div style={{ marginTop: 4 }}>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.5)', marginBottom: 6 }}>Water Tracker</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    onClick={() => setWater(i + 1)}
                    style={{
                      width: 14, height: 20, borderRadius: 3, cursor: 'pointer',
                      background: i < water ? 'linear-gradient(180deg, #00E5FF, #0066FF)' : 'rgba(0, 229, 255, 0.1)',
                      border: `1px solid ${i < water ? '#00E5FF' : 'rgba(0, 229, 255, 0.15)'}`,
                      transition: 'all 0.2s',
                      boxShadow: i < water ? '0 0 6px rgba(0, 229, 255, 0.4)' : 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Study + Coding + AI Chats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 16 }}>
        {/* Study Hours */}
        <Card>
          <CardTitle>Study Hours Today</CardTitle>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 32, fontWeight: 800, color: '#FFC857', lineHeight: 1 }}>4.5h</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255, 200, 87, 0.5)', marginTop: 4 }}>TARGET: 6H</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {[['Mathematics', 1.5, '#FFC857'], ['Science', 1.2, '#00FF99'], ['English', 0.8, '#0066FF'], ['History', 1.0, '#FF4D6D']].map(([sub, hrs, col]) => (
              <div key={sub as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.6)' }}>{sub as string}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${((hrs as number) / 2) * 100}%`, height: '100%', background: col as string, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: col as string }}>{hrs as number}h</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Coding Hours */}
        <Card>
          <CardTitle>Coding Hours Today</CardTitle>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 32, fontWeight: 800, color: '#00E5FF', lineHeight: 1 }}>2.3h</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.5)', marginTop: 4 }}>TARGET: 3H</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {[{ name: 'JARVIS v2', lang: 'React/TS', time: '1.2h', pct: 60 }, { name: 'DSA Practice', lang: 'Python', time: '0.7h', pct: 35 }, { name: 'Portfolio', lang: 'Next.js', time: '0.4h', pct: 20 }].map(p => (
              <div key={p.name} style={{ padding: '6px 8px', background: 'rgba(0, 229, 255, 0.04)', borderRadius: 6, border: '1px solid rgba(0, 229, 255, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.8)' }}>{p.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00E5FF' }}>{p.time}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.4)' }}>{p.lang}</span>
                  <div style={{ width: 50, height: 2, background: 'rgba(0,229,255,0.1)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', background: '#00E5FF' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent AI + Pinned Notes */}
        <Card>
          <CardTitle>JARVIS Recent</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              { q: 'Explain recursion with Python', t: '2h ago', type: 'code' },
              { q: 'Make a study plan for boards', t: '4h ago', type: 'school' },
              { q: 'Best chest workout for beginners', t: '6h ago', type: 'fitness' },
              { q: 'How to earn online as a student', t: 'Yesterday', type: 'money' },
            ].map((chat, i) => (
              <div key={i} onClick={() => onNavigate('ai')} style={{ padding: '8px 10px', borderRadius: 7, background: 'rgba(0, 229, 255, 0.03)', border: '1px solid rgba(0, 229, 255, 0.08)', cursor: 'pointer', transition: 'all 0.15s' }}
                className="glass-hover">
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.75)', marginBottom: 3 }}>
                  ◈ {chat.q}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)' }}>{chat.t}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardTitle>Quick Actions</CardTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Ask JARVIS', page: 'ai', color: '#00E5FF' },
            { label: 'Add Task', page: 'planner', color: '#FFC857' },
            { label: 'Log Workout', page: 'fitness', color: '#00FF99' },
            { label: 'New Note', page: 'school', color: '#0066FF' },
            { label: 'Code Session', page: 'coding', color: '#FF4D6D' },
            { label: 'Tennis Log', page: 'tennis', color: '#0066FF' },
            { label: 'Log Expense', page: 'money', color: '#00FF99' },
            { label: 'View Analytics', page: 'analytics', color: '#FFC857' },
          ].map(a => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.page)}
              style={{
                padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(0, 229, 255, 0.06)',
                border: `1px solid ${a.color}33`,
                color: a.color,
                fontFamily: 'Inter', fontSize: 12, fontWeight: 600,
                transition: 'all 0.15s',
                letterSpacing: '0.03em',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = `${a.color}14`; (e.target as HTMLElement).style.borderColor = `${a.color}66` }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(0, 229, 255, 0.06)'; (e.target as HTMLElement).style.borderColor = `${a.color}33` }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
