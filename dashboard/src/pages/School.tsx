import { useState } from 'react'

const subjects = [
  { name: 'Mathematics', progress: 72, chapters: 15, done: 11, color: '#FFC857', icon: '∑' },
  { name: 'Physics', progress: 65, chapters: 12, done: 8, color: '#00E5FF', icon: '⚛' },
  { name: 'Chemistry', progress: 58, chapters: 14, done: 8, color: '#00FF99', icon: '⚗' },
  { name: 'Biology', progress: 80, chapters: 10, done: 8, color: '#FF4D6D', icon: '⬡' },
  { name: 'English', progress: 85, chapters: 8, done: 7, color: '#0066FF', icon: 'A' },
  { name: 'History', progress: 45, chapters: 11, done: 5, color: '#FFC857', icon: '◎' },
  { name: 'Geography', progress: 60, chapters: 9, done: 5, color: '#00E5FF', icon: '⊕' },
  { name: 'Computer Sci.', progress: 90, chapters: 10, done: 9, color: '#00FF99', icon: '</>' },
]

const weeklyMarks = [
  { subject: 'Math', marks: 87, max: 100 },
  { subject: 'Physics', marks: 78, max: 100 },
  { subject: 'Chemistry', marks: 82, max: 100 },
  { subject: 'English', marks: 91, max: 100 },
]

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="glass" style={{ padding: 16, ...style }}>{children}</div>
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>{children}</div>
}

export default function School() {
  const [activeSubject, setActiveSubject] = useState('Mathematics')
  const daysToBoards = Math.ceil((new Date('2026-02-15').getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Board Countdown */}
      <div className="glass animate-breathe" style={{ padding: '18px 24px', background: 'rgba(255, 77, 109, 0.04)', borderColor: 'rgba(255, 77, 109, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(255, 77, 109, 0.6)', marginBottom: 6 }}>ICSE BOARD EXAM COUNTDOWN</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 36, fontWeight: 900, color: '#FF4D6D' }}>{daysToBoards} <span style={{ fontSize: 14, color: 'rgba(255, 77, 109, 0.6)' }}>DAYS</span></div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.5)', marginTop: 4 }}>February 15, 2026 · Target: 95%+</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#FFC857' }}>68%</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255, 200, 87, 0.5)' }}>SYLLABUS DONE</div>
            <div className="progress-bar" style={{ width: 140, marginTop: 8 }}>
              <div className="progress-fill" style={{ width: '68%', background: 'linear-gradient(90deg, #FF4D6D, #FFC857)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Subjects + Marks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        {/* Subjects */}
        <Card>
          <CardTitle>Subject Progress</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {subjects.map(s => (
              <div key={s.name} onClick={() => setActiveSubject(s.name)} style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 8, background: activeSubject === s.name ? `${s.color}0d` : 'transparent', border: `1px solid ${activeSubject === s.name ? `${s.color}33` : 'transparent'}`, transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: s.color, width: 20, textAlign: 'center' }}>{s.icon}</span>
                    <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: 'rgba(224, 244, 255, 0.85)' }}>{s.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>{s.done}/{s.chapters} ch</span>
                    <span style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700, color: s.color }}>{s.progress}%</span>
                  </div>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${s.progress}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Marks */}
          <Card>
            <CardTitle>Recent Test Marks</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {weeklyMarks.map(m => (
                <div key={m.subject}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)' }}>{m.subject}</span>
                    <span style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: m.marks >= 90 ? '#00FF99' : m.marks >= 75 ? '#FFC857' : '#FF4D6D' }}>{m.marks}<span style={{ fontSize: 9, color: 'rgba(0, 229, 255, 0.4)' }}>/{m.max}</span></span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${m.marks}%`, background: m.marks >= 90 ? 'linear-gradient(90deg, #00FF9944, #00FF99)' : m.marks >= 75 ? 'linear-gradient(90deg, #FFC85744, #FFC857)' : 'linear-gradient(90deg, #FF4D6D44, #FF4D6D)' }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Weak Chapters */}
          <Card>
            <CardTitle>Weak Chapters</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { ch: 'Organic Chemistry', sub: 'Chemistry', pct: 35 },
                { ch: 'Integration', sub: 'Mathematics', pct: 42 },
                { ch: 'Modern History', sub: 'History', pct: 28 },
                { ch: 'Optics', sub: 'Physics', pct: 50 },
              ].map(w => (
                <div key={w.ch} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255, 77, 109, 0.05)', borderRadius: 6, border: '1px solid rgba(255, 77, 109, 0.12)' }}>
                  <div>
                    <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.8)' }}>{w.ch}</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255, 77, 109, 0.5)' }}>{w.sub}</div>
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#FF4D6D' }}>{w.pct}%</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Upcoming Tests */}
          <Card>
            <CardTitle>Upcoming Tests</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                { subject: 'Mathematics', date: 'Jul 18', topic: 'Chapter 12-13' },
                { subject: 'Chemistry', date: 'Jul 22', topic: 'Electrochemistry' },
                { subject: 'English', date: 'Jul 25', topic: 'Essay Writing' },
              ].map(t => (
                <div key={t.subject} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255, 200, 87, 0.04)', borderRadius: 6, border: '1px solid rgba(255, 200, 87, 0.12)' }}>
                  <div>
                    <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: 'rgba(224, 244, 255, 0.85)' }}>{t.subject}</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.4)' }}>{t.topic}</div>
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, color: '#FFC857' }}>{t.date}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
