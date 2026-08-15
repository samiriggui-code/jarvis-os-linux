/**
 * Contournement auth DEV — même règle que le HUD (`hud/src/app/bridge/devAuthBypass.ts`).
 * Vite élide `import.meta.env.DEV` au build prod.
 */
export const DEV_BUILD: boolean =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true

export function isAuthBypassEnabled(): boolean {
  if (!DEV_BUILD) return false
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('skipAuth') === '1'
}

export function isRecoveryRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hash.replace(/^#\/?/, '').split('?')[0] === 'recovery'
}
