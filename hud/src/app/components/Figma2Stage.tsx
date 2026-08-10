import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { BrainCircuit, RefreshCw, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { postDashboardInputMode } from '../bridge/dashboardBridge';
import { dashboardOrigin, dashboardUrl } from '../bridge/dashboardUrl';
import { ACCENT, SUCCESS, DANGER, WARNING, monoFont, orbFont } from './hudTheme';
import { glassLevel, tokens } from '../../ui/tokens';

const DASHBOARD_URL = dashboardUrl();
const glass = glassLevel.regular;

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
          dashboardOrigin(),
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
        background: glass.background,
        backdropFilter: glass.backdropFilter,
        border: glass.border,
        boxShadow: glass.boxShadow,
      }}
    >
      <div
        className="flex items-center gap-3 px-5 py-2.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${tokens.color.border}` }}
      >
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          onClick={backToHud}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl cursor-pointer"
          style={{
            background: tokens.color.accentSoft,
            border: `1px solid ${tokens.color.borderActive}`,
          }}
          title="Retour au HUD"
          {...(inputMode === 'recovery' ? { 'data-jarvis-always-interactive': true } : {})}
        >
          <ArrowLeft className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span style={{ ...monoFont, color: ACCENT, fontSize: 9, letterSpacing: '0.02em' }}>
            Retour HUD
          </span>
        </motion.button>

        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: tokens.color.accentSoft, border: `1px solid ${tokens.color.borderActive}` }}>
          <BrainCircuit className="w-3.5 h-3.5" style={{ color: ACCENT }} />
        </div>
        <div>
          <span style={{ ...orbFont, color: ACCENT, fontSize: 12 }}>Dashboard Core</span>
          <div style={{ ...monoFont, color: tokens.color.textMuted, fontSize: 8 }}>
            Hermes — {DASHBOARD_URL} · {inputMode === 'recovery' ? 'Recovery' : 'Voix'}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {status === 'loading' && (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                <RefreshCw className="w-3 h-3" style={{ color: WARNING }} />
              </motion.div>
              <span style={{ ...monoFont, color: WARNING, fontSize: 9, opacity: 0.85 }}>Connexion…</span>
            </>
          )}
          {status === 'ready' && (
            <>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: SUCCESS }} />
              <span style={{ ...monoFont, color: SUCCESS, fontSize: 9, opacity: 0.85 }}>Connecté</span>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertTriangle className="w-3 h-3" style={{ color: DANGER }} />
              <span style={{ ...monoFont, color: DANGER, fontSize: 9, opacity: 0.85 }}>Serveur injoignable</span>
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: tokens.color.surfaceRaised, backdropFilter: tokens.glass }}>
            <AlertTriangle className="w-8 h-8" style={{ color: DANGER }} />
            <p style={{ ...monoFont, color: DANGER, fontSize: 11, opacity: 0.85 }}>
              Dashboard Core injoignable sur {DASHBOARD_URL}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
