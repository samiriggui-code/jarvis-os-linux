import { useState } from 'react'

const tasks = [
  { text: 'Complete Chapter 12 — Probability', done: false, priority: 'high', tag: 'school' },
  { text: 'Push JARVIS project to GitHub', done: false, priority: 'high', tag: 'code' },
  { text: 'Morning Run 3km', done: true, priority: 'medium', tag: 'fitness' },
  { text: 'Study Organic Chemistry', done: false, priority: 'high', tag: 'school' },
  { text: 'Read 20 pages of novel', done: true, priority: 'low', tag: 'personal' },
  { text: 'Tennis practice session', done: false, priority: 'medium', tag: 'tennis' },
]

const priorityColor: Record<string, string> = { high: '#FF4D6D', medium: '#FFC857', low: '#00FF99' }
const tagColor: Record<string, string> = { school: '#FFC857', code: '#00E5FF', fitness: '#00FF99', tennis: '#0066FF', personal: '#FF4D6D' }

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const today = new Date()

export default function Planner() {
  const [taskList, setTaskList] = useState(tasks)
  const [pomodoroRunning, setPomodoroRunning] = useState(false)
  const [pomodoroSecs, setPomodoroSecs] = useState(25 * 60)
  const [newTask, setNewTask] = useState('')

  const toggle = (i: number) => setTaskList(t => t.map((task, idx) => idx === i ? { ...task, done: !task.done } : task))

  const addTask = () => {
    if (!newTask.trim()) return
    setTaskList(t => [...t, { text: newTask.trim(), done: false, priority: 'medium', tag: 'personal' }])
    setNewTask('')
  }

  const mins = Math.floor(pomodoroSecs / 60).toString().padStart(2, '0')
  const secs = (pomodoroSecs % 60).toString().padStart(2, '0')

  const calDays = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), 1)
    d.setDate(d.getDate() - d.getDay() + i)
    return d
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 280px', gap: 16 }}>

        {/* Tasks */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 14, textTransform: 'uppercase' }}>
            Tasks · {taskList.filter(t => t.done).length}/{taskList.length}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Add task..."
              style={{
                flex: 1, background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.2)',
                borderRadius: 7, padding: '7px 12px', color: '#e0f4ff', fontFamily: 'Inter', fontSize: 12, outline: 'none',
              }}
            />
            <button onClick={addTask} style={{ padding: '7px 14px', borderRadius: 7, background: 'rgba(0, 229, 255, 0.12)', border: '1px solid rgba(0, 229, 255, 0.3)', color: '#00E5FF', fontFamily: 'Inter', fontSize: 12, cursor: 'pointer' }}>+ Add</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {taskList.map((task, i) => (
              <div key={i} onClick={() => toggle(i)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderRadius: 8, cursor: 'pointer',
                background: task.done ? 'transparent' : 'rgba(0, 229, 255, 0.03)',
                border: `1px solid ${task.done ? 'transparent' : 'rgba(0, 229, 255, 0.1)'}`,
                opacity: task.done ? 0.45 : 1, transition: 'all 0.15s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  background: task.done ? '#00FF99' : 'transparent',
                  border: `1.5px solid ${task.done ? '#00FF99' : priorityColor[task.priority]}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {task.done && <span style={{ fontSize: 9, color: '#050816', fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: task.done ? 'rgba(224,244,255,0.4)' : 'rgba(224, 244, 255, 0.85)', textDecoration: task.done ? 'line-through' : 'none' }}>{task.text}</span>
                </div>
                <span style={{ padding: '2px 6px', borderRadius: 4, background: `${tagColor[task.tag]}15`, fontFamily: 'JetBrains Mono', fontSize: 9, color: tagColor[task.tag] }}>{task.tag}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', textTransform: 'uppercase' }}>
              {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
            {days.map(d => <div key={d} style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)', textAlign: 'center', padding: '4px 0' }}>{d}</div>)}
            {calDays.map((d, i) => {
              const isToday = d.toDateString() === today.toDateString()
              const isCurrent = d.getMonth() === today.getMonth()
              return (
                <div key={i} style={{
                  padding: '6px 4px', borderRadius: 6, textAlign: 'center', cursor: 'pointer',
                  background: isToday ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                  border: `1px solid ${isToday ? 'rgba(0, 229, 255, 0.5)' : 'transparent'}`,
                  fontFamily: isToday ? 'Orbitron' : 'Inter',
                  fontSize: 11, fontWeight: isToday ? 700 : 400,
                  color: isToday ? '#00E5FF' : isCurrent ? 'rgba(224, 244, 255, 0.65)' : 'rgba(224, 244, 255, 0.2)',
                  transition: 'all 0.15s',
                }}>{d.getDate()}</div>
              )
            })}
          </div>
        </div>

        {/* Pomodoro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glass" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>Pomodoro Focus</div>
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 16px' }}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(0,229,255,0.1)" strokeWidth="6" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#00E5FF" strokeWidth="6"
                  strokeDasharray={`${(pomodoroSecs / (25 * 60)) * 314} 314`}
                  strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 6px #00E5FF)', transition: 'stroke-dasharray 0.5s' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 24, fontWeight: 800, color: '#00E5FF' }}>{mins}:{secs}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0, 229, 255, 0.4)', marginTop: 2 }}>FOCUS</div>
              </div>
            </div>
            <button onClick={() => setPomodoroRunning(!pomodoroRunning)} style={{
              padding: '8px 28px', borderRadius: 8, cursor: 'pointer',
              background: pomodoroRunning ? 'rgba(255, 77, 109, 0.15)' : 'rgba(0, 229, 255, 0.12)',
              border: `1px solid ${pomodoroRunning ? 'rgba(255, 77, 109, 0.4)' : 'rgba(0, 229, 255, 0.35)'}`,
              color: pomodoroRunning ? '#FF4D6D' : '#00E5FF',
              fontFamily: 'Orbitron', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
              transition: 'all 0.15s',
            }}>
              {pomodoroRunning ? '⏸ PAUSE' : '▶ START'}
            </button>
          </div>

          <div className="glass" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 10 }}>TODAY'S GOALS</div>
            {[
              { goal: 'Score 95% in boards', done: false },
              { goal: 'Build elite physique', done: false },
              { goal: 'Ship JARVIS v2', done: false },
              { goal: 'Earn first ₹10,000', done: false },
            ].map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#00E5FF', flexShrink: 0, boxShadow: '0 0 6px #00E5FF' }} />
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.65)' }}>{g.goal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
