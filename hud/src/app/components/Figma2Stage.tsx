import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BrainCircuit, RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postDashboardInputMode } from '../bridge/dashboardBridge';

const orbFont = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };

const DASHBOARD_URL = 'http://127.0.0.1:5174/';

export function Figma2Stage() {
  const { setDashboardOpen, revokeAdminAccess, inputMode } = useApp();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const backToHud = () => {
    setDashboardOpen(false);
    revokeAdminAccess();
  };

  useEffect(() => {
    if (status === 'ready') postDashboardInputMode(inputMode);
  }, [inputMode, status]);

  const onIframeLoad = () => {
    setStatus('ready');
    try {
      const pending = sessionStorage.getItem('jarvis.dashboard.pendingPage');
      if (pending && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'jarvis:navigate', page: pending },
          'http://127.0.0.1:5174',
        );
        sessionStorage.removeItem('jarvis.dashboard.pendingPage');
      }
    } catch { /* */ }
    postDashboardInputMode(inputMode);
  };

  return (
    <div
      className="w-full h-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(0, 10, 26, 0.88)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,245,255,0.18)',
        boxShadow: '0 0 50px rgba(0,245,255,0.08), inset 0 0 30px rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="flex items-center gap-3 px-5 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,245,255,0.12)' }}
      >
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={backToHud}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer"
          style={{
            background: 'rgba(0,245,255,0.08)',
            border: '1px solid rgba(0,245,255,0.35)',
          }}
          title="Retour au HUD"
          {...(inputMode === 'recovery' ? { 'data-jarvis-always-interactive': true } : {})}
        >
          <ArrowLeft className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
          <span style={{ ...mono, color: '#00f5ff', fontSize: 9, letterSpacing: '0.12em' }}>
            RETOUR HUD
          </span>
        </motion.button>

        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)' }}>
          <BrainCircuit className="w-3.5 h-3.5" style={{ color: '#00f5ff' }} />
        </div>
        <div>
          <span style={{ ...orbFont, color: '#00f5ff', fontSize: 12, letterSpacing: '0.15em' }}>DASHBOARD CORE</span>
          <div style={{ ...mono, color: 'rgba(0,245,255,0.4)', fontSize: 8 }}>
            HERMES — {DASHBOARD_URL} · {inputMode === 'recovery' ? 'RECOVERY' : 'VOIX'}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {status === 'loading' && (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <RefreshCw className="w-3 h-3" style={{ color: '#f59e0b' }} />
              </motion.div>
              <span style={{ ...mono, color: 'rgba(245,158,11,0.8)', fontSize: 9 }}>CONNEXION…</span>
            </>
          )}
          {status === 'ready' && (
            <>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
              <span style={{ ...mono, color: 'rgba(34,197,94,0.8)', fontSize: 9 }}>CONNECTÉ</span>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertTriangle className="w-3 h-3" style={{ color: '#ef4444' }} />
              <span style={{ ...mono, color: 'rgba(239,68,68,0.8)', fontSize: 9 }}>SERVEUR INJOIGNABLE</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <iframe
          ref={iframeRef}
          src={DASHBOARD_URL}
          title="Dashboard Core"
          className="absolute inset-0 w-full h-full border-0"
          onLoad={onIframeLoad}
          onError={() => setStatus('error')}
        />
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: 'rgba(0,4,12,0.92)' }}>
            <AlertTriangle className="w-8 h-8" style={{ color: '#ef4444' }} />
            <p style={{ ...mono, color: 'rgba(239,68,68,0.8)', fontSize: 11 }}>
              Dashboard Core injoignable sur {DASHBOARD_URL}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
