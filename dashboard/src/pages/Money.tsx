function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="glass" style={{ padding: 16, ...style }}>{children}</div>
}

export default function Money() {
  const expenses = [
    { name: 'Tennis Coaching', amount: 2000, category: 'Sport', color: '#0066FF' },
    { name: 'Books & Stationery', amount: 850, category: 'Education', color: '#FFC857' },
    { name: 'Food & Snacks', amount: 600, category: 'Food', color: '#FF4D6D' },
    { name: 'Internet/Data', amount: 299, category: 'Tech', color: '#00E5FF' },
    { name: 'Gym Supplements', amount: 1200, category: 'Fitness', color: '#00FF99' },
  ]

  const ideas = [
    { idea: 'Fiverr — Python automation scripts', potential: '₹5K–20K/month', status: 'planning', color: '#00E5FF' },
    { idea: 'YouTube coding tutorials', potential: '₹2K–10K/month', status: 'planning', color: '#FFC857' },
    { idea: 'Tutoring younger students', potential: '₹3K–8K/month', status: 'active', color: '#00FF99' },
    { idea: 'AI tool SaaS product', potential: '₹10K–50K/month', status: 'planning', color: '#0066FF' },
    { idea: 'Freelance web dev', potential: '₹5K–25K/project', status: 'planning', color: '#FF4D6D' },
  ]

  const statusColor: Record<string, string> = { active: '#00FF99', planning: '#FFC857' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Monthly Allowance', value: '₹3,000', color: '#00E5FF' },
          { label: 'Spent This Month', value: '₹4,949', color: '#FF4D6D' },
          { label: 'Savings', value: '₹1,000', color: '#00FF99' },
          { label: 'Income from Tech', value: '₹0', color: '#FFC857' },
        ].map(s => (
          <div key={s.label} className="glass" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
        {/* Expenses */}
        <Card>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 14, textTransform: 'uppercase' }}>Expenses This Month</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'rgba(0, 229, 255, 0.03)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.08)' }}>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: 'rgba(224, 244, 255, 0.85)' }}>{e.name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: e.color }}>{e.category}</div>
                </div>
                <span style={{ fontFamily: 'Orbitron', fontSize: 13, fontWeight: 700, color: '#FF4D6D' }}>₹{e.amount.toLocaleString()}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(0, 229, 255, 0.1)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.6)' }}>Total</span>
              <span style={{ fontFamily: 'Orbitron', fontSize: 14, fontWeight: 800, color: '#FF4D6D' }}>₹{expenses.reduce((a, e) => a + e.amount, 0).toLocaleString()}</span>
            </div>
          </div>
        </Card>

        {/* Earning Ideas */}
        <Card>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 14, textTransform: 'uppercase' }}>Income Ideas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ideas.map((idea, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 8, background: `${idea.color}06`, border: `1px solid ${idea.color}20` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.85)', flex: 1 }}>{idea.idea}</div>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: `${statusColor[idea.status]}15`, border: `1px solid ${statusColor[idea.status]}33`, fontFamily: 'JetBrains Mono', fontSize: 9, color: statusColor[idea.status], flexShrink: 0, marginLeft: 8 }}>
                    {idea.status}
                  </span>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00FF99' }}>{idea.potential}</div>
              </div>
            ))}
          </div>

          {/* Savings Goal */}
          <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(0, 255, 153, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 255, 153, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)' }}>Savings Goal</span>
              <span style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 700, color: '#00FF99' }}>₹1,000 / ₹5,000</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '20%', background: 'linear-gradient(90deg, #00FF9966, #00FF99)' }} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
