# Context

Every JARVIS page is a UI shell — hardcoded static arrays, no persistence, no real interactions. Tasks disappear on refresh. The Pomodoro never counts down. Progress bars never move. The AI always returns the same response. The goal is to wire the entire app to a global state store backed by `localStorage` so every feature actually works across sessions, with no new packages (React 19 + recharts + Tailwind are what's installed).

---

## Architecture

**Global store**: React Context + `useReducer` + `localStorage`.  
`AppProvider` wraps `<App>` in `main.tsx`. Every page reads from `useAppState()` and writes via `useAppDispatch()`. State is saved to `localStorage` on every dispatch. On first load, state is deep-merged from `localStorage` with `DEFAULT_STATE` (which seeds the same values currently hardcoded in each page, so first render looks identical).

**No new packages.** `crypto.randomUUID()` for IDs (built into all modern browsers).

---

## New Files to Create

```
src/store/types.ts       — All TypeScript interfaces (AppState, Task, Subject, Goal, etc.)
src/store/actions.ts     — AppAction discriminated union (~30 action types)
src/store/defaultState.ts — Seed data ported from each page's hardcoded arrays
src/store/reducer.ts     — Pure appReducer(state, action) => AppState
src/store/storage.ts     — loadState() / saveState() using localStorage key 'jarvis_state_v1'
src/store/context.tsx    — AppProvider, useAppState, useAppDispatch
src/hooks/useDerivedStats.ts — Memoized computed values for Dashboard + Analytics
```

---

## State Shape (abbreviated)

```typescript
interface AppState {
  tasks: Task[]                                   // id, text, done, priority, tag, dueDate, createdAt
  schedule: ScheduleItem[]                        // time, task, type, done, date
  subjects: Subject[]                             // name, progress, chapters, done
  testMarks: TestMark[]                           // subject, marks, max, date
  goals: GoalItem[]                               // id, goal, progress, detail, category, timeline
  memories: MemoryItem[]                          // id, type, title, content, pinned, tags, createdAt
  fitnessLogs: Record<string, DailyFitnessLog>   // keyed by ISO date
  tennisMatches: TennisMatch[]                    // id, opponent, result, score, date, surface
  tennisSkills: TennisSkills                      // serve, forehand, backhand, netPlay, footwork, mental
  expenses: Expense[]                             // id, name, amount, category, date
  incomeIdeas: IncomeIdea[]                       // id, idea, potential, status
  savings: number
  codingProjects: CodingProject[]                 // id, name, lang, status, pct, commits, desc
  chatHistory: ChatMessage[]                      // id, role, content, time, agents[]
  habitLogs: Record<string, HabitLog>             // keyed by ISO date; study, coding, workout, water booleans
  pomodoro: { secsRemaining, sessionsCompletedToday, currentStreak, lastSessionDate, isBreak }
  settings: { theme, aiProvider, memoryEnabled, voiceEnabled, notifications, privacyServices }
}
```

---

## Persistence

```typescript
// storage.ts
const KEY = 'jarvis_state_v1'
export const loadState = () => JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined
export const saveState = (s: AppState) => localStorage.setItem(KEY, JSON.stringify(s))
```

`AppProvider` calls `saveState(state)` in a `useEffect([state])`. Chat history is trimmed to the last 100 messages before saving to avoid quota issues.

---

## Theme Switching (actually works)

`AppProvider` has a `useEffect` on `state.settings.theme` that sets CSS custom properties on `document.documentElement`:

```
jarvis-dark → --jarvis-accent: #00E5FF, --jarvis-bg: #050816
midnight    → --jarvis-accent: #7B5EA7, --jarvis-bg: #030208
matrix      → --jarvis-accent: #00FF41, --jarvis-bg: #001100
```

`index.css` gets `--jarvis-accent` and `--jarvis-bg` wired into the key glass/glow rules (sidebar background, border colors, progress fills).

---

## Page-by-Page Changes

### Planner (most complex)
- Tasks read from `state.tasks`, write via `TASK_ADD`, `TASK_TOGGLE`, `TASK_DELETE`
- Add-task form gains a priority selector + tag dropdown
- Each task row gets a ✕ delete button
- **Pomodoro**: `pomodoroSecs` and `pomodoroRunning` stay local state (ephemeral UI). A `useEffect` with `setInterval` decrements every second when running. At 0: dispatch `POMODORO_COMPLETE_SESSION`, reset to 25:00. On unmount: dispatch `POMODORO_SAVE_SECS` so the timer resumes from where it left off if user navigates back.

```typescript
useEffect(() => {
  if (!pomodoroRunning) return
  const id = setInterval(() => {
    setPomodoroSecs(s => { if (s <= 1) { dispatch({ type: 'POMODORO_COMPLETE_SESSION' }); return 25*60 } return s - 1 })
  }, 1000)
  return () => clearInterval(id)
}, [pomodoroRunning])
```

### School
- `state.subjects` replaces hardcoded array. Each subject row gets `+` / `−` chapter buttons → `SUBJECT_INCREMENT/DECREMENT_CHAPTER`. Reducer recalculates `progress = round((done/chapters)*100)`.
- Test marks become inline editable number inputs on blur → `TESTMARK_UPDATE`.
- Syllabus % and board countdown derive from live state.

### Fitness
- All values read from `state.fitnessLogs[today]`.
- Water: clicking a glass dispatches `FITNESS_LOG_UPDATE({ waterGlasses: i+1 })`.
- Nutrition: each macro gets `+/-` buttons or range input → `FITNESS_LOG_UPDATE`.
- "Workout Done" toggle for today → `FITNESS_LOG_UPDATE({ workoutDone: true/false })`.
- Running km: number input → `FITNESS_LOG_UPDATE({ runningKm })`.
- Workout streak: derived by counting consecutive days where `workoutDone === true` backwards from today.

### Goals
- `state.goals` (flat array with `category` field) replaces hardcoded nested structure.
- Each goal card gets a `<input type="range" min=0 max=100>` slider → `GOAL_UPDATE_PROGRESS`.
- Detail text becomes a `<textarea>` on click → `GOAL_UPDATE_DETAIL` on blur.
- Average progress and counts derive live.

### Memory
- Full CRUD: "Add Memory" button shows inline form (title, content, type, tags) → `MEMORY_ADD`.
- Edit button in detail panel → editable fields → `MEMORY_UPDATE` on save.
- Delete button → `MEMORY_DELETE`.
- Pin icon → `MEMORY_TOGGLE_PIN`.
- Search and filter work on live `state.memories`.

### Settings
- All values from `state.settings` (no local useState for settings).
- All onChange → `SETTINGS_UPDATE` or `SETTINGS_TOGGLE_PRIVACY`.
- Theme change triggers CSS vars via AppProvider effect.
- "Export JSON" → `JSON.stringify(state)` downloaded as `jarvis-data.json` via blob URL.
- "Clear Memory" → `MEMORY_CLEAR_ALL` action.

### Money
- Expenses from `state.expenses`. Inline add-row form (name, amount, category) → `EXPENSE_ADD`. Per-row ✕ → `EXPENSE_DELETE`.
- Total computed from `state.expenses.reduce(...)`.
- Savings progress bar from `state.savings / 5000`.

### Tennis
- Matches from `state.tennisMatches`. Add-match form (opponent, W/L, score, surface) → `TENNIS_MATCH_ADD`. Per-row delete → `TENNIS_MATCH_DELETE`.
- Skill sliders read `state.tennisSkills` → `TENNIS_SKILL_UPDATE` on change.
- Win rate, sessions this month, total hours all derive from live state.

### Coding
- Projects from `state.codingProjects`. Progress click/slider → `PROJECT_UPDATE`. Status badge click cycles statuses → `PROJECT_UPDATE`. Commit count +1 button → `PROJECT_UPDATE`.

### AI Assistant
- Chat history from `state.chatHistory`; new messages dispatched via `CHAT_ADD_MESSAGE`.
- Context-aware response generator reads from state (pending tasks count, weakest subject, today's fitness, goal averages) to produce a non-hardcoded reply based on what Devannsh actually has stored.
- Chat persists across sessions.

### Dashboard
- All 4 progress rings and stats read from `useDerivedStats()` (derived from goals, subjects, fitnessLog).
- Water tracker reads/writes `state.fitnessLogs[today].waterGlasses`.
- Schedule reads `state.schedule` filtered to today.
- "JARVIS Recent" reads last 4 user messages from `state.chatHistory`.
- Daily missions read `state.tasks` filtered to high-priority items.

### Analytics
- `studyData` (area chart) builds a 7-day array from `state.fitnessLogs`.
- `habitData` (radar) counts habit completion rate per type from `state.habitLogs`.
- `streaks` (dot grid) counts consecutive days per habit backwards from today.
- `monthlyProgress` uses current average goal progress as the latest data point, prior points from defaults.

---

## Implementation Order

1. `types.ts` → `defaultState.ts` → `reducer.ts` → `storage.ts` → `context.tsx`
2. Wire `AppProvider` into `main.tsx`
3. `useDerivedStats.ts`
4. Migrate pages: Settings → Money → Tennis → Fitness → School → Goals → Coding → Memory → Planner → Analytics → AI Assistant → Dashboard
5. Wire theme CSS vars into `index.css`

---

## Verification

- Refresh the page — tasks, water count, pomodoro time remaining, and chat history all survive.
- Complete a task → it persists as done after refresh.
- Increment a subject chapter → progress bar moves and persists.
- Run the Pomodoro to zero → session count increments.
- Change theme in Settings → the entire UI color shifts immediately.
- Add an expense → total recalculates; expense persists after refresh.
- Log a tennis match → win rate updates.
- Open Dashboard → progress rings show real averages from goals/subjects/fitness.
- Analytics charts → show real data from habit logs (or seeded defaults on first load).
