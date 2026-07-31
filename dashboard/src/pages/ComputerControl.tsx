import { useState } from 'react'

interface PermissionLevel {
  level: number
  name: string
  color: string
  desc: string
  capabilities: string[]
  warning?: string
}

const levels: PermissionLevel[] = [
  {
    level: 0, name: 'Observe Only', color: '#00E5FF',
    desc: 'JARVIS can see your screen context but cannot control anything.',
    capabilities: ['Read screen content', 'Understand active app', 'Answer questions about current context', 'Suggest actions verbally'],
  },
  {
    level: 1, name: 'Basic Control', color: '#00FF99',
    desc: 'JARVIS can open and switch applications, read files and folders.',
    capabilities: ['Open applications', 'Switch between apps', 'Read file names & folder structure', 'Search files', 'No file editing'],
    warning: 'JARVIS cannot edit, move, or delete files at this level.',
  },
  {
    level: 2, name: 'Full Control', color: '#FFC857',
    desc: 'JARVIS can edit documents, move files, and organize your workspace.',
    capabilities: ['Edit documents', 'Move & rename files', 'Organize folders', 'Create new documents', 'Requires approval for destructive actions'],
    warning: 'Destructive actions always require your explicit confirmation.',
  },
  {
    level: 3, name: 'Automation Mode', color: '#FF4D6D',
    desc: 'Full autonomous execution within your approved workflows.',
    capabilities: ['Execute approved workflows autonomously', 'Run scripts & automation', 'Full app control within session', 'Auto-disables when session ends'],
    warning: '⚠ Only enable manually. Auto-disables after session. You can revoke at any time.',
  },
]

const apps = [
  { name: 'VS Code', icon: '⟨⟩', enabled: true, cat: 'Dev' },
  { name: 'Chrome', icon: '⊕', enabled: true, cat: 'Browser' },
  { name: 'Spotify', icon: '◉', enabled: true, cat: 'Music' },
  { name: 'Discord', icon: '◈', enabled: false, cat: 'Social' },
  { name: 'Terminal', icon: '⟳', enabled: true, cat: 'System' },
  { name: 'Word', icon: '◫', enabled: true, cat: 'Office' },
  { name: 'Excel', icon: '◧', enabled: true, cat: 'Office' },
  { name: 'PowerPoint', icon: '◎', enabled: false, cat: 'Office' },
  { name: 'Steam', icon: '⬡', enabled: false, cat: 'Gaming' },
  { name: 'File Explorer', icon: '⊡', enabled: true, cat: 'System' },
  { name: 'Gmail', icon: '⊛', enabled: false, cat: 'Email' },
  { name: 'Notion', icon: '◐', enabled: true, cat: 'Notes' },
]

function Toggle({ value, onChange, color = '#00E5FF' }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 36, height: 20, borderRadius: 10, cursor: 'pointer', background: value ? `linear-gradient(135deg, ${color}88, ${color})` : 'rgba(0, 229, 255, 0.08)', border: `1px solid ${value ? color : 'rgba(0,229,255,0.2)'}`, position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 12, height: 12, borderRadius: '50%', background: value ? '#050816' : 'rgba(0,229,255,0.4)', transition: 'left 0.2s' }} />
    </div>
  )
}

export default function ComputerControl() {
  const [controlEnabled, setControlEnabled] = useState(false)
  const [activeLevel, setActiveLevel] = useState(0)
  const [appStates, setAppStates] = useState<Record<string, boolean>>(
    Object.fromEntries(apps.map(a => [a.name, a.enabled]))
  )

  const currentLevel = levels[activeLevel]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24 }}>

      {/* Master Toggle */}
      <div className="glass animate-breathe" style={{ padding: '18px 24px', background: controlEnabled ? 'rgba(255, 77, 109, 0.04)' : 'rgba(0, 229, 255, 0.03)', borderColor: controlEnabled ? 'rgba(255, 77, 109, 0.3)' : 'rgba(0,229,255,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, letterSpacing: '0.2em', color: 'rgba(0, 229, 255, 0.5)', marginBottom: 6 }}>COMPUTER CONTROL MODE</div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 20, fontWeight: 800, color: controlEnabled ? '#FF4D6D' : '#e0f4ff' }}>
              {controlEnabled ? 'ACTIVE' : 'OFF BY DEFAULT'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.5)', marginTop: 6, maxWidth: 500 }}>
              When enabled, JARVIS can perform approved actions on your computer within the permission level you set. Always requires explicit user approval for sensitive actions.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Toggle value={controlEnabled} onChange={setControlEnabled} color={controlEnabled ? '#FF4D6D' : '#00E5FF'} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: controlEnabled ? '#FF4D6D' : 'rgba(0,229,255,0.4)' }}>{controlEnabled ? 'ENABLED' : 'DISABLED'}</span>
          </div>
        </div>
      </div>

      {/* Permission Levels */}
      <div className="glass" style={{ padding: 20 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>Permission Level</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {levels.map(l => (
            <div
              key={l.level}
              onClick={() => controlEnabled && setActiveLevel(l.level)}
              style={{
                padding: '14px 16px', borderRadius: 10, cursor: controlEnabled ? 'pointer' : 'not-allowed',
                background: activeLevel === l.level && controlEnabled ? `${l.color}12` : 'rgba(0, 229, 255, 0.03)',
                border: `1.5px solid ${activeLevel === l.level && controlEnabled ? l.color : 'rgba(0,229,255,0.1)'}`,
                opacity: controlEnabled ? 1 : 0.4, transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily: 'Orbitron', fontSize: 18, fontWeight: 900, color: activeLevel === l.level && controlEnabled ? l.color : 'rgba(224, 244, 255, 0.3)' }}>{l.level}</div>
                {activeLevel === l.level && controlEnabled && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, boxShadow: `0 0 8px ${l.color}`, marginTop: 4 }} />
                )}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: activeLevel === l.level && controlEnabled ? l.color : 'rgba(224, 244, 255, 0.55)', marginBottom: 4 }}>{l.name}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.35)', lineHeight: 1.4 }}>{l.desc}</div>
            </div>
          ))}
        </div>

        {/* Active Level Details */}
        {controlEnabled && (
          <div style={{ padding: '14px 16px', background: `${currentLevel.color}08`, borderRadius: 9, border: `1px solid ${currentLevel.color}22` }}>
            <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 700, color: currentLevel.color, letterSpacing: '0.1em', marginBottom: 10 }}>
              LEVEL {currentLevel.level} · {currentLevel.name.toUpperCase()} · CAPABILITIES
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: currentLevel.warning ? 10 : 0 }}>
              {currentLevel.capabilities.map(cap => (
                <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: currentLevel.color, flexShrink: 0, boxShadow: `0 0 4px ${currentLevel.color}` }} />
                  <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.7)' }}>{cap}</span>
                </div>
              ))}
            </div>
            {currentLevel.warning && (
              <div style={{ padding: '8px 12px', background: 'rgba(255, 200, 87, 0.06)', borderRadius: 7, border: '1px solid rgba(255, 200, 87, 0.2)', fontFamily: 'Inter', fontSize: 11, color: '#FFC857', lineHeight: 1.5 }}>
                {currentLevel.warning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* App Permissions */}
      <div className="glass" style={{ padding: 20 }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>
          Application Access
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {apps.map(app => (
            <div key={app.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: appStates[app.name] ? 'rgba(0, 229, 255, 0.05)' : 'rgba(0, 229, 255, 0.02)', border: `1px solid ${appStates[app.name] ? 'rgba(0,229,255,0.18)' : 'rgba(0,229,255,0.07)'}`, opacity: controlEnabled ? 1 : 0.4, transition: 'all 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: appStates[app.name] ? '#00E5FF' : 'rgba(224,244,255,0.3)' }}>{app.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: 'rgba(224, 244, 255, 0.8)' }}>{app.name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8, color: 'rgba(0,229,255,0.35)' }}>{app.cat}</div>
                </div>
              </div>
              <Toggle value={appStates[app.name]} onChange={v => controlEnabled && setAppStates(s => ({ ...s, [app.name]: v }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Safety Notice */}
      <div style={{ padding: '14px 18px', background: 'rgba(0, 255, 153, 0.04)', borderRadius: 9, border: '1px solid rgba(0, 255, 153, 0.15)' }}>
        <div style={{ fontFamily: 'Orbitron', fontSize: 9, letterSpacing: '0.18em', color: '#00FF99', marginBottom: 8 }}>PRIVACY GUARANTEE</div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.55)', lineHeight: 1.7 }}>
          JARVIS never assumes permission. Every sensitive or irreversible action requires your explicit approval. You can revoke Computer Control access at any time, and Level 3 automatically disables at session end. Privacy is always the highest priority.
        </div>
      </div>
    </div>
  )
}
