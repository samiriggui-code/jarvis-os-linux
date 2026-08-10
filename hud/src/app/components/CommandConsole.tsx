import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isCoreOnline, sendChatToCore } from './CoreBridge';
import { interpretCommand } from '../bridge/chatPipeline';
import { useChatFx } from '../bridge/useChatFx';
import { VisionChrome, visionBody, visionCaption, visionMono } from './visionChrome';
import { GlassButton, GlassPanel } from '../../components/glass/';
import { tokens } from '../../ui/tokens';

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

  return <span>{displayed}{!done && <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} style={{ color: tokens.color.accent }}>▋</motion.span>}</span>;
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
    <VisionChrome
      eyebrow="Contrôle"
      title={<span className="flex items-center gap-2"><Terminal className="w-4 h-4" style={{ color: tokens.color.accent }} />Console</span>}
      level="regular"
      fill
      trailing={<GlassButton tone="neutral" aria-label="Effacer l’historique" title="Effacer l’historique" onClick={() => clearMessages()} icon={<Trash2 className="w-3.5 h-3.5" />} />}
    >
      <div className="flex flex-col h-full gap-3 overflow-hidden">
        <p style={{ ...visionBody, marginTop: -4 }}>Transcription et mémoire de session</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: `${tokens.color.borderActive} transparent` }}>
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <GlassPanel level={msg.type === 'user' ? 'regular' : 'subtle'} padding="sm" className="max-w-[88%]" style={{ borderRadius: msg.type === 'user' ? '16px 6px 16px 16px' : '6px 16px 16px 16px' }}>
                  {msg.source === 'voice' && <div style={{ ...visionCaption, marginBottom: 4 }}>Voix</div>}
                  {msg.type === 'ai' ? <p className="hud-console-msg" style={{ ...visionBody, color: tokens.color.text, fontSize: 13, lineHeight: 1.55 }}><TypingText text={msg.text} /></p> : <p className="hud-console-msg" style={{ ...visionBody, color: tokens.color.text, fontSize: 13, lineHeight: 1.55 }}>{msg.text}</p>}
                  <div className="mt-1 flex justify-end"><span style={{ ...visionMono, color: tokens.color.textMuted, fontSize: 9 }}>{msg.timestamp.toLocaleTimeString('fr-FR', { hour12: false })}</span></div>
                </GlassPanel>
              </motion.div>
            ))}
          </AnimatePresence>

          {aiState === 'listening' && (
            <GlassPanel level="subtle" padding="sm">
              <div style={{ ...visionCaption, color: tokens.color.success, marginBottom: 4 }}>Transcription en direct</div>
              <p style={{ ...visionBody, color: tokens.color.text, minHeight: 20 }}>{liveTranscript || 'Écoute…'}<motion.span animate={{ opacity: [1, 0.2] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ color: tokens.color.success }}> ▋</motion.span></p>
            </GlassPanel>
          )}

          {isTyping && <div style={{ ...visionMono, color: tokens.color.textMuted, fontSize: 10 }}>Jarvis réfléchit…</div>}
          <div ref={endRef} />
        </div>

        <GlassPanel level="subtle" padding="sm" className="flex items-center gap-2 flex-shrink-0">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} placeholder="Écrire ou parler — tout va ici…" className="flex-1 bg-transparent outline-none" style={{ ...visionBody, color: tokens.color.text, fontSize: 13 }} />
          <GlassButton tone="accent" aria-label="Envoyer le message" onClick={handleSubmit} icon={<Send className="w-4 h-4" />} />
        </GlassPanel>
      </div>
    </VisionChrome>
  );
}
