import { useState } from 'react'

interface AgentDef {
  id: string
  name: string
  icon: string
  color: string
  category: string
  capabilities: string[]
  status: 'online' | 'standby'
  tasksToday: number
}

const agents: AgentDef[] = [
  {
    id: 'conversation', name: 'Conversation Agent', icon: '◐', color: '#00E5FF', category: 'Core',
    capabilities: ['Natural conversation', 'Personality', 'Context awareness', 'Follow-up questions', 'Long-term memory'],
    status: 'online', tasksToday: 14,
  },
  {
    id: 'memory', name: 'Memory Agent', icon: '◈', color: '#00FF99', category: 'Core',
    capabilities: ['Long-term memory', 'Preferences', 'Projects & goals', 'Frequently used info', 'Searchable timeline'],
    status: 'online', tasksToday: 31,
  },
  {
    id: 'study', name: 'Study Agent', icon: '◉', color: '#FFC857', category: 'Academic',
    capabilities: ['Homework help', 'Flashcards', 'Summaries', 'Quiz generation', 'Exam prep', 'Revision planning'],
    status: 'online', tasksToday: 8,
  },
  {
    id: 'coding', name: 'Coding Agent', icon: '⟨⟩', color: '#00E5FF', category: 'Tech',
    capabilities: ['Programming', 'Debugging', 'Code review', 'Architecture', 'Git', 'APIs', 'Optimization'],
    status: 'online', tasksToday: 12,
  },
  {
    id: 'research', name: 'Research Agent', icon: '◎', color: '#0066FF', category: 'Knowledge',
    capabilities: ['Internet search', 'Fact checking', 'Comparisons', 'Latest news', 'Deep reports', 'Citations'],
    status: 'online', tasksToday: 6,
  },
  {
    id: 'automation', name: 'Automation Agent', icon: '⟳', color: '#FF4D6D', category: 'System',
    capabilities: ['Create workflows', 'Automate repetitive tasks', 'Run scripts', 'Schedule actions', 'Trigger apps'],
    status: 'standby', tasksToday: 3,
  },
  {
    id: 'calendar', name: 'Calendar Agent', icon: '◌', color: '#00FF99', category: 'Productivity',
    capabilities: ['Schedule meetings', 'Manage events', 'Optimize daily routine', 'Avoid conflicts', 'Suggest blocks'],
    status: 'online', tasksToday: 5,
  },
  {
    id: 'task', name: 'Task Agent', icon: '◫', color: '#00E5FF', category: 'Productivity',
    capabilities: ['To-do lists', 'Projects', 'Deadlines', 'Reminders', 'Priority planning', 'Progress tracking'],
    status: 'online', tasksToday: 9,
  },
  {
    id: 'creativity', name: 'Creativity Agent', icon: '⬡', color: '#0066FF', category: 'Creative',
    capabilities: ['Writing', 'Ideas', 'Presentations', 'Storytelling', 'Brainstorming', 'Image prompts'],
    status: 'standby', tasksToday: 2,
  },
  {
    id: 'fitness', name: 'Fitness Agent', icon: '◑', color: '#FF4D6D', category: 'Health',
    capabilities: ['Workout plans', 'Nutrition', 'Recovery', 'Health tracking', 'Exercise history'],
    status: 'online', tasksToday: 4,
  },
  {
    id: 'finance', name: 'Finance Agent', icon: '◧', color: '#FFC857', category: 'Finance',
    capabilities: ['Expense tracking', 'Budgets', 'Subscriptions', 'Savings goals', 'Financial reminders'],
    status: 'standby', tasksToday: 1,
  },
  {
    id: 'file', name: 'File Agent', icon: '⊡', color: '#FF4D6D', category: 'System',
    capabilities: ['Documents', 'PDFs', 'Word/Excel/PPT', 'Images', 'Search', 'Organization', 'Version history'],
    status: 'standby', tasksToday: 2,
  },
  {
    id: 'email', name: 'Email Agent', icon: '⊛', color: '#0066FF', category: 'Communication',
    capabilities: ['Read Gmail', 'Summarize emails', 'Draft replies', 'Categorize', 'Archive', 'Prioritize'],
    status: 'standby', tasksToday: 0,
  },
  {
    id: 'whatsapp', name: 'WhatsApp Agent', icon: '⊜', color: '#00FF99', category: 'Communication',
    capabilities: ['Read conversations', 'Summarize chats', 'Draft replies', 'Find messages', 'Create reminders'],
    status: 'standby', tasksToday: 0,
  },
  {
    id: 'browser', name: 'Browser Agent', icon: '⊕', color: '#FFC857', category: 'System',
    capabilities: ['Search the web', 'Open websites', 'Navigate pages', 'Fill forms', 'Extract info', 'Compare products'],
    status: 'online', tasksToday: 7,
  },
  {
    id: 'device', name: 'Device Agent', icon: '⊗', color: '#00E5FF', category: 'System',
    capabilities: ['Open/close apps', 'Switch windows', 'Volume/brightness', 'Screenshots', 'Control music'],
    status: 'standby', tasksToday: 1,
  },
]

const categories = ['All', 'Core', 'Academic', 'Tech', 'Knowledge', 'System', 'Productivity', 'Creative', 'Health', 'Finance', 'Communication']

export default function AgentHub() {
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<AgentDef | null>(null)

  const filtered = filter === 'All' ? agents : agents.filter(a => a.category === filter)
  const onlineCount = agents.filter(a => a.status === 'online').length
  const totalTasks = agents.reduce((s, a) => s + a.tasksToday, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Master Brain Header */}
      <div className="glass animate-breathe" style={{ padding: '18px 24px', background: 'rgba(0, 102, 255, 0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 6 }}>JARVIS · AGENT ORCHESTRATION SYSTEM</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 800, color: '#e0f4ff' }}>
              Master <span style={{ color: '#00E5FF' }}>Brain</span>
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.5)', marginTop: 6, maxWidth: 480 }}>
              Orchestrates {agents.length} specialized agents. Breaks tasks into subtasks, assigns work in parallel, merges results, and learns your preferences over time.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center' }}>
            {[
              { label: 'Total Agents', value: agents.length, color: '#00E5FF' },
              { label: 'Online', value: onlineCount, color: '#00FF99' },
              { label: 'Tasks Today', value: totalTasks, color: '#FFC857' },
              { label: 'Standby', value: agents.length - onlineCount, color: '#FF4D6D' },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 14px', background: 'rgba(0, 229, 255, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.1)' }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.4)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orchestration flow diagram */}
      <div className="glass" style={{ padding: 16 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 12 }}>HOW ORCHESTRATION WORKS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'User Input', color: '#00E5FF', icon: '◈' },
            { label: '→', color: 'rgba(0,229,255,0.3)', icon: null },
            { label: 'Master Brain', color: '#0066FF', icon: '⬡' },
            { label: '→', color: 'rgba(0,229,255,0.3)', icon: null },
            { label: 'Agent Routing', color: '#FFC857', icon: '⟳' },
            { label: '→', color: 'rgba(0,229,255,0.3)', icon: null },
            { label: 'Parallel Work', color: '#00FF99', icon: '◉' },
            { label: '→', color: 'rgba(0,229,255,0.3)', icon: null },
            { label: 'Merge Results', color: '#FF4D6D', icon: '◎' },
            { label: '→', color: 'rgba(0,229,255,0.3)', icon: null },
            { label: 'One Response', color: '#00E5FF', icon: '◐' },
          ].map((step, i) => (
            step.icon ? (
              <div key={i} style={{ padding: '5px 12px', borderRadius: 20, background: `${step.color}12`, border: `1px solid ${step.color}30`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: step.color }}>{step.icon}</span>
                <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, color: step.color }}>{step.label}</span>
              </div>
            ) : (
              <span key={i} style={{ fontFamily: 'JetBrains Mono', fontSize: 14, color: step.color }}>→</span>
            )
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {categories.map(c => (
          <button key={c} onClick={() => setFilter(c)} style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', background: filter === c ? 'rgba(0, 229, 255, 0.12)' : 'rgba(0, 229, 255, 0.04)', border: `1px solid ${filter === c ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'}`, color: filter === c ? '#00E5FF' : 'rgba(224,244,255,0.4)', fontFamily: 'Inter', fontSize: 11, fontWeight: 500, transition: 'all 0.15s' }}>
            {c}
          </button>
        ))}
      </div>

      {/* Agent Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {filtered.map(agent => (
          <div
            key={agent.id}
            className="glass glass-hover"
            onClick={() => setSelected(selected?.id === agent.id ? null : agent)}
            style={{ padding: 14, cursor: 'pointer', border: `1px solid ${selected?.id === agent.id ? agent.color + '44' : 'rgba(0,229,255,0.12)'}`, background: selected?.id === agent.id ? `${agent.color}08` : 'rgba(11, 17, 32, 0.65)', transition: 'all 0.2s' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: `${agent.color}12`, border: `1.5px solid ${agent.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 16, color: agent.color }}>
                  {agent.icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.9)' }}>{agent.name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)' }}>{agent.category}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: agent.status === 'online' ? '#00FF99' : '#FFC857', boxShadow: agent.status === 'online' ? '0 0 6px #00FF99' : 'none' }} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: agent.status === 'online' ? '#00FF99' : '#FFC857' }}>{agent.status.toUpperCase()}</span>
                </div>
                {agent.tasksToday > 0 && (
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0,229,255,0.4)' }}>{agent.tasksToday} tasks</span>
                )}
              </div>
            </div>

            {selected?.id === agent.id && (
              <div style={{ borderTop: `1px solid ${agent.color}22`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {agent.capabilities.map(cap => (
                  <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.65)' }}>{cap}</span>
                  </div>
                ))}
              </div>
            )}

            {selected?.id !== agent.id && (
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.4)', lineHeight: 1.4 }}>
                {agent.capabilities.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
