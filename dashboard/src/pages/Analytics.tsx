import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts'

const studyData = [
  { day: 'Mon', study: 5.5, coding: 2.5 },
  { day: 'Tue', study: 4.0, coding: 3.0 },
  { day: 'Wed', study: 6.0, coding: 1.5 },
  { day: 'Thu', study: 3.5, coding: 4.0 },
  { day: 'Fri', study: 5.0, coding: 2.0 },
  { day: 'Sat', study: 7.0, coding: 3.5 },
  { day: 'Sun', study: 4.5, coding: 1.0 },
]

const habitData = [
  { habit: 'Study', value: 85 },
  { habit: 'Coding', value: 70 },
  { habit: 'Workout', value: 80 },
  { habit: 'Running', value: 65 },
  { habit: 'Sleep', value: 75 },
  { habit: 'Reading', value: 55 },
]

const monthlyProgress = [
  { month: 'Mar', score: 62 },
  { month: 'Apr', score: 68 },
  { month: 'May', score: 72 },
  { month: 'Jun', score: 75 },
  { month: 'Jul', score: 80 },
]

const tooltipStyle = {
  contentStyle: { background: '#0B1120', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 11 },
  itemStyle: { color: '#00E5FF' },
  labelStyle: { color: 'rgba(224, 244, 255, 0.6)' },
}

export default function Analytics() {
  const streaks = [
    { habit: 'Study 4h+', streak: 12, color: '#FFC857' },
    { habit: 'Workout', streak: 8, color: '#00FF99' },
    { habit: 'Coding 1h+', streak: 15, color: '#00E5FF' },
    { habit: 'Running', streak: 6, color: '#0066FF' },
    { habit: 'Water 2L+', streak: 4, color: '#FF4D6D' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Avg Study/Day', value: '5.1h', delta: '+0.4h', color: '#FFC857' },
          { label: 'Avg Coding/Day', value: '2.5h', delta: '+0.6h', color: '#00E5FF' },
          { label: 'Workout Consistency', value: '80%', delta: '+5%', color: '#00FF99' },
          { label: 'Overall Score', value: '75/100', delta: '+3', color: '#0066FF' },
        ].map(k => (
          <div key={k.label} className="glass" style={{ padding: '14px 16px' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', marginTop: 2 }}>{k.label}</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00FF99', marginTop: 4 }}>{k.delta} this week</div>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>Study & Coding Hours — This Week</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={studyData}>
              <defs>
                <linearGradient id="studyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFC857" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FFC857" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="codeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00E5FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'rgba(0,229,255,0.4)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'rgba(0,229,255,0.4)' }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="study" name="Study (h)" stroke="#FFC857" strokeWidth={2} fill="url(#studyGrad)" dot={false} />
              <Area type="monotone" dataKey="coding" name="Coding (h)" stroke="#00E5FF" strokeWidth={2} fill="url(#codeGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>Habit Radar</div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={habitData}>
              <PolarGrid stroke="rgba(0,229,255,0.1)" />
              <PolarAngleAxis dataKey="habit" tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: 'rgba(0,229,255,0.5)' }} />
              <Radar name="Habits" dataKey="value" stroke="#00E5FF" fill="#00E5FF" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>Monthly Progress Score</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyProgress}>
              <XAxis dataKey="month" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'rgba(0,229,255,0.4)' }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'rgba(0,229,255,0.4)' }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="score" name="Score" fill="#0066FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>Habit Streaks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {streaks.map(s => (
              <div key={s.habit} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)', flex: 1 }}>{s.habit}</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: 21 }, (_, i) => (
                    <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: i < s.streak ? s.color : 'rgba(0,229,255,0.08)', boxShadow: i < s.streak ? `0 0 3px ${s.color}66` : 'none' }} />
                  ))}
                </div>
                <span style={{ fontFamily: 'Orbitron', fontSize: 11, fontWeight: 700, color: s.color, width: 30, textAlign: 'right' }}>{s.streak}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
