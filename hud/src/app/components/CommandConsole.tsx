import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isCoreOnline, sendChatToCore } from './CoreBridge';
import { interpretCommand } from '../bridge/chatPipeline';
import { useChatFx } from '../bridge/useChatFx';

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const speed = Math.max(12, 28 - text.length * 0.08);
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && (
        <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} style={{ color: '#00f5ff' }}>
          ▋
        </motion.span>
      )}
    </span>
  );
}

export function CommandConsole() {
  const {
    messages, addMessage, clearMessages, liveTranscript, aiState, setAiState,
    addNotification,
  } = useApp();
  const fx = useChatFx();
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, liveTranscript]);

  const handleSubmit = () => {
    if (!input.trim() || isTyping) return;
    const text = input.trim();
    setInput('');
    addMessage({ type: 'user', text, source: 'text' });
    setAiState('processing');
    setIsTyping(true);

    if (isCoreOnline() && sendChatToCore(text)) {
      void interpretCommand(text, fx);
      setIsTyping(false);
      addNotification({ type: 'info', title: 'Core', message: 'Transcrit → Provider…' });
      return;
    }

    setTimeout(() => {
      const response = interpretCommand(text, fx);
      setAiState('responding');
      addMessage({ type: 'ai', text: response, source: 'local' });
      setIsTyping(false);
      setTimeout(() => setAiState('idle'), 1600);
    }, 500);
  };

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" style={{ color: '#00f5ff' }} />
          <div>
            <div style={{ ...orb, color: '#00f5ff', fontSize: '11px', letterSpacing: '0.14em' }}>CONSOLE</div>
            <div style={{ ...mono, color: 'rgba(255,255,255,0.3)', fontSize: 8 }}>transcription · mémoire session</div>
          </div>
        </div>
        <button
          type="button"
          title="Effacer l’historique"
          onClick={() => clearMessages()}
          className="p-1.5 rounded-lg cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <Trash2 className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.4)' }} />
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,245,255,0.2) transparent' }}
      >
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[88%] rounded-2xl px-3.5 py-2.5"
                style={
                  msg.type === 'user'
                    ? { background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.28)', borderRadius: '16px 4px 16px 16px' }
                    : { background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.18)', borderRadius: '4px 16px 16px 16px' }
                }
              >
                {msg.source === 'voice' && (
                  <div style={{ ...mono, fontSize: 8, color: 'rgba(168,85,247,0.7)', marginBottom: 4, letterSpacing: '0.08em' }}>VOIX</div>
                )}
                {msg.type === 'ai' ? (
                  <p className="hud-console-msg" style={{ ...raj, color: 'rgba(220,240,255,0.9)', fontSize: 13, lineHeight: 1.55 }}>
                    <TypingText text={msg.text} />
                  </p>
                ) : (
                  <p className="hud-console-msg" style={{ ...raj, color: 'rgba(230,220,255,0.92)', fontSize: 13, lineHeight: 1.55 }}>{msg.text}</p>
                )}
                <div className="mt-1 flex justify-end">
                  <span style={{ ...mono, color: 'rgba(255,255,255,0.22)', fontSize: 9 }}>
                    {msg.timestamp.toLocaleTimeString('fr-FR', { hour12: false })}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {aiState === 'listening' && (
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px dashed rgba(34,197,94,0.35)' }}
          >
            <div style={{ ...mono, fontSize: 8, color: '#22c55e', marginBottom: 4, letterSpacing: '0.1em' }}>STT · EN DIRECT</div>
            <p style={{ ...raj, color: 'rgba(220,255,230,0.85)', fontSize: 13, minHeight: 20 }}>
              {liveTranscript || 'Écoute…'}
              <motion.span animate={{ opacity: [1, 0.2] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ color: '#22c55e' }}> ▋</motion.span>
            </p>
          </div>
        )}

        {isTyping && (
          <div style={{ ...mono, color: 'rgba(0,245,255,0.45)', fontSize: 10 }}>JARVIS réfléchit…</div>
        )}
        <div ref={endRef} />
      </div>

      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 flex-shrink-0"
        style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(0,245,255,0.12)' }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Écrire ou parler — tout va ici…"
          className="flex-1 bg-transparent outline-none"
          style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: 13 }}
        />
        <button type="button" onClick={handleSubmit} className="p-1.5 cursor-pointer">
          <Send className="w-4 h-4" style={{ color: '#00f5ff' }} />
        </button>
      </div>
    </div>
  );
}
