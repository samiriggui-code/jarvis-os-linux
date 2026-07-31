import { useState } from 'react'

function Toggle({ value, onChange, color = '#00E5FF' }: { value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', background: value ? `linear-gradient(135deg, ${color}88, ${color})` : 'rgba(0, 229, 255, 0.1)', border: `1px solid ${value ? color : 'rgba(0,229,255,0.2)'}`, position: 'relative', transition: 'all 0.2s', boxShadow: value ? `0 0 10px ${color}44` : 'none', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 16, height: 16, borderRadius: '50%', background: value ? '#050816' : 'rgba(0,229,255,0.5)', transition: 'left 0.2s' }} />
    </div>
  )
}

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid rgba(0, 229, 255, 0.06)' }}>
      <div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 500, color: 'rgba(224, 244, 255, 0.85)' }}>{label}</div>
        {desc && <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.35)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Orbitron', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(0, 229, 255, 0.6)', marginBottom: 16, textTransform: 'uppercase' }}>{children}</div>
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="glass" style={{ padding: 20, ...style }}>{children}</div>
}

const privacyServices = [
  { name: 'Gmail', cat: 'Communication', allowed: false, note: 'Summarize, draft, never send without confirmation' },
  { name: 'WhatsApp', cat: 'Communication', allowed: false, note: 'Read & draft only, never send without confirmation' },
  { name: 'Google Calendar', cat: 'Productivity', allowed: true, note: 'Full read/write access' },
  { name: 'Word / Docs', cat: 'Office', allowed: true, note: 'Read and edit' },
  { name: 'PowerPoint', cat: 'Office', allowed: false, note: 'Read and edit' },
  { name: 'Excel / Sheets', cat: 'Office', allowed: true, note: 'Read and edit' },
  { name: 'VS Code', cat: 'Dev', allowed: true, note: 'Full access — open files, terminal suggestions' },
  { name: 'Spotify', cat: 'Media', allowed: true, note: 'Playback control only' },
  { name: 'Discord', cat: 'Social', allowed: false, note: 'Read only, no sending' },
  { name: 'Downloads Folder', cat: 'Files', allowed: true, note: 'Read and organize' },
  { name: 'Desktop', cat: 'Files', allowed: true, note: 'Read and organize' },
  { name: 'Documents Folder', cat: 'Files', allowed: true, note: 'Read and organize' },
  { name: 'Pictures Folder', cat: 'Files', allowed: false, note: 'Disabled by default' },
  { name: 'Chrome Tabs', cat: 'Browser', allowed: true, note: 'Read current tab context' },
  { name: 'Notion', cat: 'Productivity', allowed: true, note: 'Full read/write' },
  { name: 'GitHub', cat: 'Dev', allowed: true, note: 'Repos, commits, PRs' },
  { name: 'Figma', cat: 'Design', allowed: false, note: 'Read design context' },
  { name: 'YouTube', cat: 'Media', allowed: false, note: 'Watch history for recommendations' },
]

const blockedAlways = [
  { name: 'Browser History', reason: 'Never accessed without explicit enable' },
  { name: 'Incognito Activity', reason: 'Always blocked — complete privacy' },
  { name: 'Passwords / Keychain', reason: 'Never accessible under any condition' },
  { name: 'Banking Information', reason: 'Never accessible under any condition' },
  { name: 'Private Vault', reason: 'User-defined vault — always protected' },
  { name: 'Camera', reason: 'Disabled by default — enable per session only' },
]

const integrations = [
  { name: 'Google Workspace', status: 'connected', color: '#00FF99' },
  { name: 'Microsoft Office', status: 'connected', color: '#00FF99' },
  { name: 'Notion', status: 'connected', color: '#00FF99' },
  { name: 'GitHub', status: 'connected', color: '#00FF99' },
  { name: 'Obsidian', status: 'disconnected', color: '#FFC857' },
  { name: 'Slack', status: 'disconnected', color: '#FFC857' },
  { name: 'Discord', status: 'disconnected', color: '#FFC857' },
  { name: 'Spotify', status: 'connected', color: '#00FF99' },
  { name: 'Google Drive', status: 'connected', color: '#00FF99' },
  { name: 'Figma', status: 'disconnected', color: '#FFC857' },
  { name: 'Claude (Anthropic)', status: 'connected', color: '#00FF99' },
  { name: 'Perplexity', status: 'disconnected', color: '#FFC857' },
]

export default function Settings() {
  const [theme, setTheme] = useState('jarvis-dark')
  const [notifications, setNotifications] = useState(true)
  const [aiProvider, setAiProvider] = useState('claude')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [micListening, setMicListening] = useState(true)
  const [services, setServices] = useState<Record<string, boolean>>(
    Object.fromEntries(privacyServices.map(s => [s.name, s.allowed]))
  )

  const toggleService = (name: string) => setServices(s => ({ ...s, [name]: !s[name] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 24, maxWidth: 900 }}>

      {/* Profile */}
      <Card>
        <SectionTitle>Profile</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #0066FF, #00E5FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Orbitron', fontSize: 22, fontWeight: 800, color: '#050816', border: '2px solid rgba(0, 229, 255, 0.4)' }}>D</div>
          <div>
            <div style={{ fontFamily: 'Orbitron', fontSize: 16, fontWeight: 700, color: '#e0f4ff' }}>Devannsh</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(0, 229, 255, 0.5)', marginTop: 3 }}>Class X · ICSE · Mumbai, India</div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.4)', marginTop: 2 }}>Student · Coder · Athlete · Future Entrepreneur</div>
          </div>
        </div>
      </Card>

      {/* Appearance + AI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionTitle>Appearance</SectionTitle>
          <SettingRow label="Theme" desc="Visual theme for JARVIS interface">
            <select value={theme} onChange={e => setTheme(e.target.value)} style={{ background: 'rgba(11, 17, 32, 0.8)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 7, padding: '6px 12px', color: '#00E5FF', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
              <option value="jarvis-dark">JARVIS Dark</option>
              <option value="midnight">Deep Midnight</option>
              <option value="matrix">Matrix Green</option>
            </select>
          </SettingRow>
        </Card>
        <Card>
          <SectionTitle>AI Configuration</SectionTitle>
          <SettingRow label="AI Provider" desc="Which AI powers JARVIS">
            <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={{ background: 'rgba(11, 17, 32, 0.8)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 7, padding: '6px 12px', color: '#00E5FF', fontFamily: 'JetBrains Mono', fontSize: 11, outline: 'none', cursor: 'pointer' }}>
              <option value="claude">Claude (Anthropic)</option>
              <option value="gpt4">GPT-4 (OpenAI)</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </SettingRow>
          <SettingRow label="Long-term Memory" desc="Agents remember across sessions"><Toggle value={memoryEnabled} onChange={setMemoryEnabled} /></SettingRow>
          <SettingRow label="Voice Input" desc="Speak to JARVIS via microphone"><Toggle value={voiceEnabled} onChange={setVoiceEnabled} /></SettingRow>
          <SettingRow label="Mic (Active Listening Only)" desc="Microphone only while actively listening"><Toggle value={micListening} onChange={setMicListening} color="#00FF99" /></SettingRow>
          <SettingRow label="Notifications" desc="Reminders, deadlines, and alerts"><Toggle value={notifications} onChange={setNotifications} /></SettingRow>
        </Card>
      </div>

      {/* Privacy System */}
      <Card>
        <SectionTitle>Privacy System · Service Access</SectionTitle>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.5)', marginBottom: 16, lineHeight: 1.6 }}>
          Privacy is the highest priority. JARVIS never assumes permission. You can enable or disable access to each service independently. Every permission is visible, editable, and transparent — revoke at any time.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {privacyServices.map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: services[s.name] ? 'rgba(0, 229, 255, 0.04)' : 'transparent', border: `1px solid ${services[s.name] ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.07)'}`, transition: 'all 0.2s' }}>
              <div style={{ flex: 1, marginRight: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: 'rgba(224, 244, 255, 0.85)' }}>{s.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8, padding: '1px 6px', borderRadius: 8, background: 'rgba(0,229,255,0.06)', color: 'rgba(0,229,255,0.4)', border: '1px solid rgba(0,229,255,0.1)' }}>{s.cat}</span>
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(224, 244, 255, 0.35)', marginTop: 2 }}>{s.note}</div>
              </div>
              <Toggle value={services[s.name]} onChange={() => toggleService(s.name)} />
            </div>
          ))}
        </div>
      </Card>

      {/* Always Blocked */}
      <Card style={{ borderColor: 'rgba(255, 77, 109, 0.15)', background: 'rgba(255, 77, 109, 0.03)' }}>
        <SectionTitle>Always Blocked · Never Accessible</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
          {blockedAlways.map(b => (
            <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'rgba(255, 77, 109, 0.05)', border: '1px solid rgba(255, 77, 109, 0.15)' }}>
              <div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color: 'rgba(224, 244, 255, 0.7)' }}>{b.name}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255, 77, 109, 0.55)', marginTop: 2 }}>{b.reason}</div>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#FF4D6D' }}>✕</span>
            </div>
          ))}
        </div>
      </Card>

      {/* App Integrations */}
      <Card>
        <SectionTitle>App Integrations</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {integrations.map(int => (
            <div key={int.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 8, background: `${int.color}06`, border: `1px solid ${int.color}22` }}>
              <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(224, 244, 255, 0.8)' }}>{int.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: int.color, boxShadow: `0 0 6px ${int.color}` }} />
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: int.color }}>{int.status}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* System + Shortcuts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionTitle>System</SectionTitle>
          <SettingRow label="Data Export" desc="Download all JARVIS data as JSON">
            <button style={{ padding: '6px 16px', borderRadius: 7, cursor: 'pointer', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0,229,255,0.25)', color: '#00E5FF', fontFamily: 'Inter', fontSize: 12 }}>Export JSON</button>
          </SettingRow>
          <SettingRow label="Clear Memory" desc="Wipe all stored memories">
            <button style={{ padding: '6px 16px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255, 77, 109, 0.08)', border: '1px solid rgba(255,77,109,0.25)', color: '#FF4D6D', fontFamily: 'Inter', fontSize: 12 }}>Clear All</button>
          </SettingRow>
          <SettingRow label="JARVIS Version" desc="Current build">
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(0, 229, 255, 0.5)' }}>v2.0.0-beta</span>
          </SettingRow>
        </Card>

        <Card>
          <SectionTitle>Keyboard Shortcuts</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['⌘ + K', 'Open AI Assistant'], ['⌘ + D', 'Dashboard'], ['⌘ + A', 'Agent Hub'], ['⌘ + M', 'Memory'], ['⌘ + P', 'Planner'], ['⌘ + G', 'Goals'], ['⌘ + N', 'New Task'], ['⌘ + /', 'Search'], ['⌘ + ,', 'Settings']].map(([key, label]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: 'rgba(0, 229, 255, 0.03)', borderRadius: 6, border: '1px solid rgba(0,229,255,0.07)' }}>
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(224, 244, 255, 0.55)' }}>{label}</span>
                <kbd style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#00E5FF', padding: '2px 6px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: 4 }}>{key}</kbd>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
