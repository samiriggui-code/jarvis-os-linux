import { useState, useRef, useEffect } from 'react'

interface Agent {
  id: string
  name: string
  icon: string
  color: string
  status: 'idle' | 'active' | 'done'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  time: Date
  agents?: string[]
  orchestration?: { step: string; agent: string; color: string }[]
}

const ALL_AGENTS: Agent[] = [
  { id: 'study', name: 'Study Agent', icon: '◉', color: '#FFC857', status: 'idle' },
  { id: 'coding', name: 'Coding Agent', icon: '⟨⟩', color: '#00E5FF', status: 'idle' },
  { id: 'research', name: 'Research Agent', icon: '◎', color: '#0066FF', status: 'idle' },
  { id: 'memory', name: 'Memory Agent', icon: '◈', color: '#00FF99', status: 'idle' },
  { id: 'fitness', name: 'Fitness Agent', icon: '◑', color: '#FF4D6D', status: 'idle' },
  { id: 'finance', name: 'Finance Agent', icon: '◧', color: '#FFC857', status: 'idle' },
  { id: 'task', name: 'Task Agent', icon: '◫', color: '#00E5FF', status: 'idle' },
  { id: 'creativity', name: 'Creativity Agent', icon: '⬡', color: '#0066FF', status: 'idle' },
  { id: 'calendar', name: 'Calendar Agent', icon: '◌', color: '#00FF99', status: 'idle' },
  { id: 'file', name: 'File Agent', icon: '⊡', color: '#FF4D6D', status: 'idle' },
  { id: 'browser', name: 'Browser Agent', icon: '⊕', color: '#FFC857', status: 'idle' },
  { id: 'device', name: 'Device Agent', icon: '⊗', color: '#00E5FF', status: 'idle' },
  { id: 'email', name: 'Email Agent', icon: '⊛', color: '#0066FF', status: 'idle' },
  { id: 'whatsapp', name: 'WhatsApp Agent', icon: '⊜', color: '#00FF99', status: 'idle' },
  { id: 'automation', name: 'Automation Agent', icon: '⟳', color: '#FF4D6D', status: 'idle' },
  { id: 'conversation', name: 'Conversation Agent', icon: '◐', color: '#00E5FF', status: 'idle' },
]

function pickAgents(query: string): string[] {
  const q = query.toLowerCase()
  const picks: string[] = ['memory', 'conversation']
  if (q.includes('study') || q.includes('learn') || q.includes('exam') || q.includes('school') || q.includes('chapter') || q.includes('math') || q.includes('physics') || q.includes('chemistry')) picks.push('study')
  if (q.includes('code') || q.includes('python') || q.includes('bug') || q.includes('function') || q.includes('program') || q.includes('github') || q.includes('debug')) picks.push('coding')
  if (q.includes('search') || q.includes('find') || q.includes('research') || q.includes('news') || q.includes('what is') || q.includes('explain')) picks.push('research')
  if (q.includes('workout') || q.includes('fitness') || q.includes('run') || q.includes('gym') || q.includes('health') || q.includes('protein')) picks.push('fitness')
  if (q.includes('money') || q.includes('earn') || q.includes('budget') || q.includes('save') || q.includes('finance')) picks.push('finance')
  if (q.includes('task') || q.includes('todo') || q.includes('deadline') || q.includes('reminder')) picks.push('task')
  if (q.includes('plan') || q.includes('schedule') || q.includes('calendar') || q.includes('week') || q.includes('day')) picks.push('calendar')
  if (q.includes('write') || q.includes('create') || q.includes('idea') || q.includes('design') || q.includes('story')) picks.push('creativity')
  if (q.includes('build') || q.includes('project') || q.includes('jarvis') || q.includes('internship')) {
    picks.push('coding', 'research', 'study', 'file', 'automation', 'creativity')
  }
  return [...new Set(picks)]
}

function buildOrchestration(agentIds: string[]) {
  return agentIds.map(id => {
    const a = ALL_AGENTS.find(x => x.id === id)!
    return { step: a.name, agent: a.id, color: a.color }
  })
}

const EXAMPLE_RESPONSE = `I've coordinated your request across all relevant agents and synthesized their findings:

**Analysis Complete:**

Based on your current context, goals, and history — here's what I've determined:

1. **Immediate Priority** — Focus on your Mathematics chapter first (boards countdown active)
2. **Code Task** — Your JARVIS v2 commit for today is pending; I've queued it in your task list
3. **Research Summary** — Found 3 highly relevant resources, saved to your memory
4. **Action Items** — 2 tasks auto-added to today's planner

*Agents consulted: Memory recalled 4 relevant past interactions to improve this response.*`

const suggestions = [
  'Build my internship project from scratch',
  'Explain recursion with Python examples',
  'Plan my entire week for boards prep',
  'Best chest workout + diet for muscle gain',
  'How do I earn money online as a student?',
  'Summarize my weakest subjects and fix them',
]

function OrchestrationFlow({ steps, visible }: { steps: { step: string; agent: string; color: string }[]; visible: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (!visible) return
    setActiveIdx(0)
    const id = setInterval(() => {
      setActiveIdx(i => {
        if (i >= steps.length - 1) { clearInterval(id); return steps.length }
        return i + 1
      })
    }, 350)
    return () => clearInterval(id)
  }, [visible, steps.length])

  if (!visible) return null
  return (
    <div style={{ margin: '8px 0 12px 36px', padding: '12px 14px', background: 'rgba(0, 102, 255, 0.05)', borderRadius: 10, border: '1px solid rgba(0, 102, 255, 0.2)' }}>
      <div style={{ fontFamily: 'Orbitron', fontSize: 8, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 10 }}>MASTER BRAIN · ORCHESTRATING</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {steps.map((s, i) => (
          <div key={s.agent} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 20,
            background: i <= activeIdx ? `${s.color}15` : 'transparent',
            border: `1px solid ${i <= activeIdx ? s.color : 'rgba(0,229,255,0.1)'}`,
            transition: 'all 0.3s ease',
            opacity: i <= activeIdx ? 1 : 0.3,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, boxShadow: i <= activeIdx ? `0 0 6px ${s.color}` : 'none' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: i <= activeIdx ? s.color : 'rgba(0,229,255,0.3)' }}>{s.step}</span>
            {i === activeIdx && i < steps.length - 1 && (
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: s.color, marginLeft: 2 }} className="animate-pulse-glow">▶</span>
            )}
            {i < activeIdx && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: s.color }}>✓</span>}
          </div>
        ))}
      </div>
      {activeIdx >= steps.length && (
        <div style={{ marginTop: 8, fontFamily: 'JetBrains Mono', fontSize: 9, color: '#00FF99' }}>
          ✓ All agents complete · merging results...
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row', marginBottom: 6 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: isUser ? 'linear-gradient(135deg, #0066FF, #00E5FF)' : 'rgba(0, 229, 255, 0.06)',
          border: `1.5px solid ${isUser ? '#00E5FF' : 'rgba(0, 229, 255, 0.4)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: isUser ? 'Orbitron' : 'monospace', fontSize: 10, fontWeight: 700,
          color: isUser ? '#050816' : '#00E5FF',
        }}>
          {isUser ? 'D' : '◈'}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)' }}>
          {isUser ? 'Devannsh' : 'JARVIS Master Brain'} · {msg.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </span>
        {!isUser && msg.agents && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
            {msg.agents.slice(0, 5).map(aid => {
              const a = ALL_AGENTS.find(x => x.id === aid)
              if (!a) return null
              return <div key={aid} title={a.name} style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, opacity: 0.7 }} />
            })}
            {msg.agents.length > 5 && <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0,229,255,0.4)' }}>+{msg.agents.length - 5}</span>}
          </div>
        )}
      </div>

      {!isUser && msg.orchestration && (
        <OrchestrationFlow steps={msg.orchestration} visible />
      )}

      <div style={{
        maxWidth: '78%',
        marginLeft: isUser ? 'auto' : 36,
        marginRight: isUser ? 0 : 'auto',
        padding: '11px 15px',
        borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
        background: isUser
          ? 'linear-gradient(135deg, rgba(0,102,255,0.25), rgba(0,229,255,0.15))'
          : 'rgba(11, 17, 32, 0.85)',
        border: `1px solid ${isUser ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.12)'}`,
        fontFamily: 'Inter', fontSize: 13, lineHeight: 1.65,
        color: 'rgba(224, 244, 255, 0.88)',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>
    </div>
  )
}

function AgentStatusBar({ activeAgents }: { activeAgents: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0' }}>
      {ALL_AGENTS.map(a => (
        <div key={a.id} title={a.name} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
          borderRadius: 12,
          background: activeAgents.includes(a.id) ? `${a.color}15` : 'rgba(0,229,255,0.03)',
          border: `1px solid ${activeAgents.includes(a.id) ? `${a.color}44` : 'rgba(0,229,255,0.08)'}`,
          transition: 'all 0.3s',
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: activeAgents.includes(a.id) ? a.color : 'rgba(0,229,255,0.2)', transition: 'all 0.3s', boxShadow: activeAgents.includes(a.id) ? `0 0 6px ${a.color}` : 'none' }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: activeAgents.includes(a.id) ? a.color : 'rgba(0,229,255,0.3)' }}>{a.name.replace(' Agent', '')}</span>
        </div>
      ))}
    </div>
  )
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([{
    id: '0', role: 'assistant',
    content: `Hello Devannsh. I am JARVIS — your Personal AI Operating System.\n\nI operate as a Master Brain coordinating 16 specialized agents:\n\n• Study · Coding · Research · Memory · Fitness · Finance\n• Task · Creativity · Calendar · File · Browser · Device\n• Email · WhatsApp · Automation · Conversation\n\nEvery query is automatically routed to the right agents, processed in parallel, and returned as one coherent response. You never need to choose which agent manually.\n\nWhat would you like to accomplish today?`,
    time: new Date(Date.now() - 60000),
  }])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [activeAgents, setActiveAgents] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const send = (text = input) => {
    if (!text.trim()) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim(), time: new Date() }
    setMessages(m => [...m, userMsg])
    setInput('')

    const agents = pickAgents(text)
    setActiveAgents(agents)
    setTyping(true)

    const orchDelay = agents.length * 350 + 400
    setTimeout(() => {
      setTyping(false)
      setActiveAgents([])
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: EXAMPLE_RESPONSE,
        time: new Date(),
        agents,
        orchestration: buildOrchestration(agents),
      }
      setMessages(m => [...m, reply])
    }, orchDelay + 800)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', gap: 0 }}>
      {/* Left: Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid rgba(0, 229, 255, 0.08)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(0, 229, 255, 0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="animate-pulse-glow" style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(0, 229, 255, 0.06)',
              border: '1.5px solid rgba(0, 229, 255, 0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'monospace', fontSize: 16, color: '#00E5FF',
            }}>◈</div>
            <div>
              <div style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: '#00E5FF', letterSpacing: '0.1em' }}>MASTER BRAIN</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 255, 153, 0.6)' }}>● ONLINE · 16 Agents Ready · Memory Active</div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
          {typing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '1.5px solid rgba(0,229,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#00E5FF', fontFamily: 'monospace' }}>◈</div>
              <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: 'rgba(11, 17, 32, 0.85)', border: '1px solid rgba(0,229,255,0.12)' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0,229,255,0.5)' }}>Coordinating {activeAgents.length} agents</span>
                  {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#00E5FF', animation: `pulse-glow 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        <div style={{ padding: '0 20px 10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => send(s)} style={{ padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)', color: 'rgba(0,229,255,0.65)', fontFamily: 'Inter', fontSize: 10, fontWeight: 500, transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.1)'; (e.currentTarget as HTMLElement).style.color = '#00E5FF' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,229,255,0.05)'; (e.currentTarget as HTMLElement).style.color = 'rgba(0,229,255,0.65)' }}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: '10px 20px 18px', borderTop: '1px solid rgba(0,229,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Tell JARVIS anything — Master Brain routes to the right agents automatically..."
              rows={2}
              style={{ width: '100%', resize: 'none', background: 'rgba(11,17,32,0.8)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10, padding: '9px 13px', color: '#e0f4ff', fontFamily: 'Inter', fontSize: 13, outline: 'none', lineHeight: 1.5, transition: 'border-color 0.2s' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.5)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0,229,255,0.06)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,229,255,0.2)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            <button onClick={() => send()} style={{ width: 40, height: 40, borderRadius: 9, cursor: 'pointer', flexShrink: 0, background: input.trim() ? 'linear-gradient(135deg, #0066FF, #00E5FF)' : 'rgba(0,229,255,0.06)', border: `1px solid ${input.trim() ? '#00E5FF' : 'rgba(0,229,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#050816' : '#00E5FF'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Right: Agent Status Panel */}
      <div style={{ width: 220, flexShrink: 0, padding: '14px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(0, 229, 255, 0.4)' }}>AGENT NETWORK</div>
        <AgentStatusBar activeAgents={activeAgents} />
        <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)', paddingTop: 12 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 8 }}>MASTER BRAIN</div>
          <div style={{ padding: 10, background: 'rgba(0, 229, 255, 0.04)', borderRadius: 8, border: '1px solid rgba(0,229,255,0.12)' }}>
            {['Plan subtasks', 'Route to agents', 'Parallel processing', 'Merge results', 'Learn preferences', 'Optimize speed'].map(r => (
              <div key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 5 }}>
                <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#00E5FF', flexShrink: 0 }} />
                <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.5)' }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(0,229,255,0.08)', paddingTop: 12 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(0, 229, 255, 0.4)', marginBottom: 8 }}>MEMORY STATUS</div>
          {[{ k: 'Short-term', v: '12 items', c: '#00E5FF' }, { k: 'Long-term', v: '247 items', c: '#00FF99' }, { k: 'Goals', v: '8 items', c: '#FFC857' }].map(m => (
            <div key={m.k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.5)' }}>{m.k}</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: m.c }}>{m.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
