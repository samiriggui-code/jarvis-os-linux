import { useState } from 'react'

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1

const workoutSplit = [
  { day: 'Mon', focus: 'Chest + Triceps', exercises: ['Bench Press 3×10', 'Push-ups 4×15', 'Cable Flyes 3×12', 'Tricep Dips 3×12'] },
  { day: 'Tue', focus: 'Back + Biceps', exercises: ['Pull-ups 4×8', 'Bent Row 3×10', 'Lat Pulldown 3×12', 'Bicep Curls 3×12'] },
  { day: 'Wed', focus: 'Rest / Run', exercises: ['5km Easy Run', 'Stretching 20min', 'Core 15min'] },
  { day: 'Thu', focus: 'Shoulders + Abs', exercises: ['OHP 3×10', 'Lateral Raise 3×15', 'Front Raise 3×12', 'Plank 3×60s'] },
  { day: 'Fri', focus: 'Legs', exercises: ['Squats 4×10', 'Lunges 3×12', 'Leg Press 3×15', 'Calf Raise 4×20'] },
  { day: 'Sat', focus: 'Full Body + Run', exercises: ['3km Run', 'Push-ups 5×15', 'Pull-ups 4×8', 'Squats 3×15'] },
  { day: 'Sun', focus: 'Active Rest', exercises: ['Tennis Practice', 'Walk 30min', 'Stretching'] },
]

export default function Fitness() {
  const [selectedDay, setSelectedDay] = useState(todayIdx)

  const stats = [
    { label: 'Current Weight', value: '62 kg', color: '#00E5FF' },
    { label: 'Target Weight', value: '70 kg', color: '#FFC857' },
    { label: 'Workout Streak', value: '12 days', color: '#00FF99' },
    { label: 'Calories Today', value: '2,100', color: '#FF4D6D' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} className="glass" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.45)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Workout Split */}
        <div className="glass" style={{ padding: 16 }}>
          <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 14, textTransform: 'uppercase' }}>Weekly Split</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 16 }}>
            {weekDays.map((d, i) => (
              <div key={d} onClick={() => setSelectedDay(i)} style={{
                padding: '8px 4px', borderRadius: 8, textAlign: 'center', cursor: 'pointer',
                background: selectedDay === i ? 'rgba(0, 229, 255, 0.15)' : i === todayIdx ? 'rgba(0, 255, 153, 0.08)' : 'rgba(0, 229, 255, 0.03)',
                border: `1px solid ${selectedDay === i ? 'rgba(0, 229, 255, 0.4)' : i === todayIdx ? 'rgba(0, 255, 153, 0.2)' : 'rgba(0, 229, 255, 0.08)'}`,
                transition: 'all 0.15s',
              }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, color: selectedDay === i ? '#00E5FF' : i === todayIdx ? '#00FF99' : 'rgba(224, 244, 255, 0.4)' }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 14px', background: 'rgba(0, 229, 255, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.12)' }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 12, fontWeight: 600, color: '#00E5FF', marginBottom: 10 }}>{workoutSplit[selectedDay].focus}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {workoutSplit[selectedDay].exercises.map((ex, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#00E5FF', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.75)' }}>{ex}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body + Nutrition */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="glass" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>Nutrition Today</div>
            {[
              { label: 'Calories', value: 2100, max: 2500, color: '#FF4D6D', unit: 'kcal' },
              { label: 'Protein', value: 95, max: 130, color: '#00FF99', unit: 'g' },
              { label: 'Carbs', value: 220, max: 300, color: '#FFC857', unit: 'g' },
              { label: 'Water', value: 1.5, max: 2.5, color: '#00E5FF', unit: 'L' },
            ].map(n => (
              <div key={n.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.7)' }}>{n.label}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: n.color }}>{n.value}{n.unit} / {n.max}{n.unit}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(n.value / n.max) * 100}%`, background: `linear-gradient(90deg, ${n.color}66, ${n.color})` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="glass" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 12, textTransform: 'uppercase' }}>Running Stats</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'This Week', value: '12.5km', color: '#00E5FF' },
                { label: 'Best Pace', value: '5:20/km', color: '#00FF99' },
                { label: 'Streak', value: '8 days', color: '#FFC857' },
                { label: 'Monthly', value: '48km', color: '#0066FF' },
              ].map(r => (
                <div key={r.label} style={{ padding: '10px 12px', background: 'rgba(0, 229, 255, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 229, 255, 0.1)', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Orbitron', fontSize: 16, fontWeight: 700, color: r.color }}>{r.value}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.4)', marginTop: 3 }}>{r.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
