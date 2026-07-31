function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="glass" style={{ padding: 16, ...style }}>{children}</div>
}

export default function Tennis() {
  const stats = [
    { label: 'Sessions This Month', value: '12', color: '#00E5FF' },
    { label: 'Win Rate', value: '65%', color: '#00FF99' },
    { label: 'Best Serve Speed', value: '142 km/h', color: '#FFC857' },
    { label: 'Hours Practiced', value: '24h', color: '#0066FF' },
  ]

  const matches = [
    { opponent: 'Arjun S.', result: 'W', score: '6-4, 6-2', date: 'Jul 10', surface: 'Hard' },
    { opponent: 'Rahul M.', result: 'L', score: '4-6, 3-6', date: 'Jul 6', surface: 'Clay' },
    { opponent: 'Vikram T.', result: 'W', score: '6-3, 7-5', date: 'Jul 1', surface: 'Hard' },
    { opponent: 'Aarav K.', result: 'W', score: '6-1, 6-4', date: 'Jun 28', surface: 'Hard' },
  ]

  const skills = [
    { skill: 'Serve', value: 72 },
    { skill: 'Forehand', value: 80 },
    { skill: 'Backhand', value: 65 },
    { skill: 'Net Play', value: 55 },
    { skill: 'Footwork', value: 70 },
    { skill: 'Mental Game', value: 75 },
  ]

  const schedule = [
    { day: 'Mon', time: '16:30', type: 'Groundstroke Drills', duration: '1.5h' },
    { day: 'Wed', time: '16:30', type: 'Serve + Return', duration: '1h' },
    { day: 'Fri', time: '17:00', type: 'Match Practice', duration: '2h' },
    { day: 'Sun', time: '08:00', type: 'Fitness + Footwork', duration: '1h' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} className="glass" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Match History */}
        <Card>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 14, textTransform: 'uppercase' }}>Match History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(0, 229, 255, 0.03)', border: '1px solid rgba(0, 229, 255, 0.1)' }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: m.result === 'W' ? 'rgba(0, 255, 153, 0.15)' : 'rgba(255, 77, 109, 0.15)', border: `1.5px solid ${m.result === 'W' ? '#00FF99' : '#FF4D6D'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Orbitron', fontSize: 11, fontWeight: 800, color: m.result === 'W' ? '#00FF99' : '#FF4D6D', flexShrink: 0 }}>{m.result}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'rgba(224, 244, 255, 0.85)' }}>vs. {m.opponent}</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.4)' }}>{m.score} · {m.surface}</div>
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.35)' }}>{m.date}</span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Skill Ratings */}
          <Card>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>Skill Ratings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {skills.map(s => (
                <div key={s.skill} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)', width: 90, flexShrink: 0 }}>{s.skill}</span>
                  <div className="progress-bar" style={{ flex: 1 }}>
                    <div className="progress-fill" style={{ width: `${s.value}%` }} />
                  </div>
                  <span style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: '#00E5FF', width: 32, textAlign: 'right' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Practice Schedule */}
          <Card>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>Practice Schedule</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {schedule.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'rgba(0, 102, 255, 0.05)', borderRadius: 7, border: '1px solid rgba(0, 102, 255, 0.15)' }}>
                  <div>
                    <span style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: '#0066FF', marginRight: 10 }}>{s.day}</span>
                    <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.75)' }}>{s.type}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(0, 229, 255, 0.6)' }}>{s.time}</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(0, 229, 255, 0.35)' }}>{s.duration}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
