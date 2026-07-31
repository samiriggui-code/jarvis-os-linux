import { useState } from 'react'

interface MemoryItem {
  id: string
  type: 'project' | 'goal' | 'preference' | 'conversation' | 'event' | 'fact' | 'skill'
  title: string
  content: string
  agent: string
  date: string
  pinned?: boolean
  tags: string[]
}

const memories: MemoryItem[] = [
  { id: '1', type: 'goal', title: 'Board Exam Target', content: 'Devannsh wants to score 95%+ in ICSE Class X boards. Primary focus subjects: Mathematics, Chemistry, Science.', agent: 'Memory Agent', date: 'Jul 10, 2025', pinned: true, tags: ['boards', 'goal', 'school'] },
  { id: '2', type: 'project', title: 'JARVIS v2.0 Development', content: 'Active project: Personal AI OS built with React + TypeScript. 65% complete. Next milestone: AI integration. GitHub repo active.', agent: 'Coding Agent', date: 'Jul 12, 2025', pinned: true, tags: ['coding', 'jarvis', 'project'] },
  { id: '3', type: 'preference', title: 'Study Style', content: 'Prefers Pomodoro technique (25min focus / 5min break). Studies best in the evening (20:00–22:00). Prefers visual explanations over text-heavy notes.', agent: 'Study Agent', date: 'Jul 5, 2025', tags: ['preference', 'study'] },
  { id: '4', type: 'preference', title: 'Coding Style', content: 'Python is primary language. Prefers clean, readable code over clever one-liners. Uses VS Code + Vim keybindings. Follows PEP 8.', agent: 'Coding Agent', date: 'Jun 28, 2025', tags: ['preference', 'coding'] },
  { id: '5', type: 'conversation', title: 'Asked about recursion', content: 'Explained recursion with Python examples (factorial, fibonacci). User found visual tree diagrams most helpful. Struggled with base cases initially.', agent: 'Study Agent', date: 'Jul 12, 2025', tags: ['python', 'study', 'coding'] },
  { id: '6', type: 'goal', title: 'Fitness Goal', content: 'Target: 70kg lean bodyweight by December 2025. Currently 62kg. Workout: 5 days/week. Running: 3km/day target.', agent: 'Fitness Agent', date: 'Jul 1, 2025', pinned: true, tags: ['fitness', 'goal'] },
  { id: '7', type: 'fact', title: 'Mathematics Weakness', content: 'Integration (Chapter 7) is the weakest area — scored 52% in last mock test. Needs focused revision sessions 3x per week.', agent: 'Study Agent', date: 'Jul 8, 2025', tags: ['math', 'weakness', 'school'] },
  { id: '8', type: 'skill', title: 'Python Progress', content: 'Completed: variables, functions, OOP, file I/O, lists, dictionaries. In progress: DSA (Arrays, Linked Lists). Next: Trees, Graphs, Dynamic Programming.', agent: 'Coding Agent', date: 'Jul 11, 2025', tags: ['python', 'skill', 'coding'] },
  { id: '9', type: 'preference', title: 'Tennis Schedule', content: 'Practices Monday, Wednesday, Friday at 16:30. Sunday morning fitness sessions. Coach: local club. Goal: improve serve speed to 150km/h.', agent: 'Fitness Agent', date: 'Jun 20, 2025', tags: ['tennis', 'schedule'] },
  { id: '10', type: 'event', title: 'Chemistry Test Upcoming', content: 'Chemistry Electrochemistry test on July 22, 2025. Currently at 58% chapter completion. Needs to complete remaining 6 chapters.', agent: 'Calendar Agent', date: 'Jul 13, 2025', tags: ['chemistry', 'test', 'school'] },
  { id: '11', type: 'goal', title: 'Financial Goal', content: 'Earn ₹10,000 from tech skills by December 2025. Exploring: Fiverr automation scripts, tutoring, YouTube channel. Currently ₹0 earned.', agent: 'Finance Agent', date: 'Jul 3, 2025', tags: ['money', 'goal', 'finance'] },
  { id: '12', type: 'conversation', title: 'Discussed internship project', content: 'User wants to build an AI internship project. Recommended: ML image classifier or chatbot. Architecture advice given. Next step: choose dataset.', agent: 'Coding Agent', date: 'Jul 10, 2025', tags: ['coding', 'ai', 'project'] },
]

const typeColor: Record<string, string> = {
  project: '#00E5FF',
  goal: '#FFC857',
  preference: '#0066FF',
  conversation: '#00FF99',
  event: '#FF4D6D',
  fact: '#FF4D6D',
  skill: '#00E5FF',
}

const typeIcon: Record<string, string> = {
  project: '⟨⟩', goal: '◎', preference: '◈', conversation: '◐', event: '⬡', fact: '◉', skill: '⊕',
}

export default function Memory() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState<MemoryItem | null>(null)

  const filtered = memories.filter(m => {
    const matchesType = typeFilter === 'all' || m.type === typeFilter
    const matchesSearch = !search || m.title.toLowerCase().includes(search.toLowerCase()) || m.content.toLowerCase().includes(search.toLowerCase()) || m.tags.some(t => t.includes(search.toLowerCase()))
    return matchesType && matchesSearch
  })

  const pinned = filtered.filter(m => m.pinned)
  const unpinned = filtered.filter(m => !m.pinned)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: Memory List */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(0, 229, 255, 0.08)' }}>
        {/* Controls */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(0, 229, 255, 0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search memories..."
                style={{ width: '100%', background: 'rgba(11, 17, 32, 0.8)', border: '1px solid rgba(0, 229, 255, 0.2)', borderRadius: 8, padding: '8px 14px 8px 36px', color: '#e0f4ff', fontFamily: 'Inter', fontSize: 12, outline: 'none' }}
              />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'monospace', fontSize: 12, color: 'rgba(0, 229, 255, 0.4)' }}>⊕</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[['all', 'All'], ['goal', 'Goals'], ['project', 'Projects'], ['preference', 'Prefs'], ['conversation', 'Chats'], ['skill', 'Skills']].map(([val, label]) => (
                <button key={val} onClick={() => setTypeFilter(val)} style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: typeFilter === val ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${typeFilter === val ? 'rgba(0,229,255,0.35)' : 'rgba(0,229,255,0.1)'}`, color: typeFilter === val ? '#00E5FF' : 'rgba(224,244,255,0.4)', fontFamily: 'Inter', fontSize: 11, fontWeight: 500 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[{ label: 'Total', v: memories.length, c: '#00E5FF' }, { label: 'Pinned', v: memories.filter(m => m.pinned).length, c: '#FFC857' }, { label: 'Filtered', v: filtered.length, c: '#00FF99' }].map(s => (
              <span key={s.label} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>
                {s.label}: <span style={{ color: s.c }}>{s.v}</span>
              </span>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {pinned.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 8 }}>PINNED</div>
              {pinned.map(m => <MemCard key={m.id} item={m} selected={selected?.id === m.id} onClick={() => setSelected(selected?.id === m.id ? null : m)} />)}
            </div>
          )}
          {unpinned.length > 0 && (
            <div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 8 }}>TIMELINE</div>
              {unpinned.map(m => <MemCard key={m.id} item={m} selected={selected?.id === m.id} onClick={() => setSelected(selected?.id === m.id ? null : m)} />)}
            </div>
          )}
        </div>
      </div>

      {/* Right: Detail Panel */}
      <div style={{ width: 300, flexShrink: 0, padding: 20, overflowY: 'auto' }}>
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.4)' }}>MEMORY DETAIL</span>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'rgba(0,229,255,0.4)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${typeColor[selected.type]}12`, border: `1.5px solid ${typeColor[selected.type]}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 16, color: typeColor[selected.type] }}>{typeIcon[selected.type]}</div>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(224, 244, 255, 0.9)' }}>{selected.title}</div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: typeColor[selected.type], textTransform: 'uppercase' }}>{selected.type}</div>
              </div>
            </div>
            <div style={{ padding: 14, background: 'rgba(0, 229, 255, 0.04)', borderRadius: 9, border: '1px solid rgba(0,229,255,0.1)', fontFamily: 'Inter', fontSize: 12, lineHeight: 1.7, color: 'rgba(224, 244, 255, 0.75)' }}>
              {selected.content}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selected.tags.map(t => (
                <span key={t} style={{ padding: '3px 8px', borderRadius: 12, background: 'rgba(0, 229, 255, 0.06)', border: '1px solid rgba(0,229,255,0.15)', fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.6)' }}>#{t}</span>
              ))}
            </div>
            <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[{ k: 'Agent', v: selected.agent }, { k: 'Created', v: selected.date }, { k: 'Pinned', v: selected.pinned ? 'Yes' : 'No' }].map(r => (
                <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.4)' }}>{r.k}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.6)' }}>{r.v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0,229,255,0.2)', color: '#00E5FF', fontFamily: 'Inter', fontSize: 11, fontWeight: 500 }}>Edit</button>
              <button style={{ flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', background: 'rgba(255, 77, 109, 0.08)', border: '1px solid rgba(255,77,109,0.2)', color: '#FF4D6D', fontFamily: 'Inter', fontSize: 11, fontWeight: 500 }}>Delete</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.4)' }}>MEMORY SYSTEM</div>
            {[['Search Memory', '⊕'], ['Edit Memory', '◫'], ['Delete Memory', '⊗'], ['Pause Memory', '◑'], ['Export Memory', '⊡']].map(([label, icon]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, background: 'rgba(0, 229, 255, 0.03)', border: '1px solid rgba(0,229,255,0.08)', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'monospace', color: '#00E5FF', fontSize: 12 }}>{icon}</span>
                <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.65)' }}>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: 12, background: 'rgba(0, 255, 153, 0.04)', borderRadius: 8, border: '1px solid rgba(0,255,153,0.12)' }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#00FF99', marginBottom: 6 }}>MEMORY HEALTH</div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.5)', lineHeight: 1.6 }}>
                All {memories.length} memories active. Every permission is visible and editable. You can revoke access at any time.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MemCard({ item, selected, onClick }: { item: MemoryItem; selected: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ padding: '11px 14px', borderRadius: 9, cursor: 'pointer', marginBottom: 8, background: selected ? `${typeColor[item.type]}08` : 'rgba(11, 17, 32, 0.5)', border: `1px solid ${selected ? typeColor[item.type] + '33' : 'rgba(0,229,255,0.1)'}`, transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: typeColor[item.type] }}>{typeIcon[item.type]}</span>
          <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.88)' }}>{item.title}</span>
          {item.pinned && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: '#FFC857' }}>📌</span>}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)', flexShrink: 0, marginLeft: 8 }}>{item.date}</span>
      </div>
      <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {item.content}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <span style={{ padding: '2px 7px', borderRadius: 10, background: `${typeColor[item.type]}12`, fontFamily: 'JetBrains Mono', fontSize: 8, color: typeColor[item.type] }}>{item.type}</span>
        <span style={{ padding: '2px 7px', borderRadius: 10, background: 'rgba(0,229,255,0.05)', fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0,229,255,0.4)' }}>{item.agent.replace(' Agent', '')}</span>
      </div>
    </div>
  )
}
