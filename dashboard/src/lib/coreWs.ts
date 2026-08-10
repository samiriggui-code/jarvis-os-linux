/** WS Core — dev direct 8765, prod même origine /ws (nginx NUC). */
export function coreWsUrl(): string {
  const fromEnv = import.meta.env.VITE_CORE_WS as string | undefined;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return 'ws://127.0.0.1:8765';
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return 'ws://127.0.0.1:8765';
}
