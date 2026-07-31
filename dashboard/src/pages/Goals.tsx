function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="glass" style={{ padding: 16, ...style }}>{children}</div>
}

const goals = [
  {
    category: 'Academic', icon: '◉', color: '#FFC857',
    items: [
      { goal: 'Score 95%+ in ICSE Boards', timeline: 'Feb 2026', progress: 68, detail: 'Currently averaging 82% in mock tests' },
      { goal: 'Rank in top 5 of class', timeline: 'Mar 2026', progress: 60, detail: 'Currently rank 8 — need to improve Math & Chemistry' },
    ]
  },
  {
    category: 'Programming', icon: '⟨⟩', color: '#00E5FF',
    items: [
      { goal: 'Complete Python + DSA mastery', timeline: 'Dec 2025', progress: 55, detail: 'Topics left: Trees, Graphs, DP' },
      { goal: 'Ship 3 AI projects to production', timeline: 'Mar 2026', progress: 33, detail: 'JARVIS (active), ML Classifier (planning), Chatbot (done)' },
      { goal: 'Build full-stack web app', timeline: 'Jan 2026', progress: 45, detail: 'Learning React + Node.js + PostgreSQL' },
    ]
  },
  {
    category: 'Physique', icon: '◎', color: '#00FF99',
    items: [
      { goal: 'Reach 70kg lean bodyweight', timeline: 'Dec 2025', progress: 40, detail: 'Currently 62kg — need 8kg lean gain' },
      { goal: 'Run 5km under 25 minutes', timeline: 'Oct 2025', progress: 65, detail: 'Best time: 27:30 — improving weekly' },
      { goal: 'Complete 50 pull-ups in a session', timeline: 'Nov 2025', progress: 30, detail: 'Current max: 15 in one set' },
    ]
  },
  {
    category: 'Financial', icon: '◈', color: '#0066FF',
    items: [
      { goal: 'Earn ₹10,000 from tech skills', timeline: 'Dec 2025', progress: 5, detail: 'Exploring: freelance, Fiverr, tutoring' },
      { goal: 'Save ₹5,000 this year', timeline: 'Dec 2025', progress: 20, detail: 'Saved ₹1,000 so far' },
    ]
  },
]

export default function Goals() {
  const totalGoals = goals.reduce((a, g) => a + g.items.length, 0)
  const avgProgress = Math.round(goals.reduce((a, g) => a + g.items.reduce((b, i) => b + i.progress, 0), 0) / totalGoals)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Hero */}
      <div className="glass animate-breathe" style={{ padding: '18px 24px', background: 'rgba(0, 102, 255, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 6 }}>LIFE MISSION · 2025–2026</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 22, fontWeight: 800, color: '#e0f4ff', letterSpacing: '0.03em' }}>
              Become the <span style={{ color: '#00E5FF' }}>best version</span> of Devannsh
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.5)', marginTop: 6 }}>
              {totalGoals} active goals · {avgProgress}% average progress
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 40, fontWeight: 900, color: '#00E5FF' }}>{avgProgress}<span style={{ fontSize: 18 }}>%</span></div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>OVERALL PROGRESS</div>
          </div>
        </div>
      </div>

      {/* Goal Categories */}
      {goals.map(cat => (
        <Card key={cat.category}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 16, color: cat.color }}>{cat.icon}</span>
            <div style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: cat.color, letterSpacing: '0.1em' }}>{cat.category.toUpperCase()}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {cat.items.map((item, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: `${cat.color}08`, border: `1px solid ${cat.color}22` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: 'rgba(224, 244, 255, 0.9)', lineHeight: 1.3 }}>{item.goal}</div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 800, color: cat.color, flexShrink: 0, marginLeft: 8 }}>{item.progress}%</span>
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.4)', marginBottom: 8, lineHeight: 1.4 }}>{item.detail}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="progress-bar" style={{ flex: 1, marginRight: 10 }}>
                    <div className="progress-fill" style={{ width: `${item.progress}%`, background: `linear-gradient(90deg, ${cat.color}66, ${cat.color})` }} />
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: `${cat.color}88`, flexShrink: 0 }}>{item.timeline}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
