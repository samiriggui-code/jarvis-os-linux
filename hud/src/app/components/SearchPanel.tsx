import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Globe, Image, FileText, Clock, TrendingUp, X, ExternalLink } from 'lucide-react';
import { VisionChrome, visionBody, visionCaption, visionMono } from './visionChrome';
import { GlassButton, GlassPanel } from '../../components/glass/';
import { tokens } from '../../ui/tokens';

const MOCK_RESULTS: Record<string, { title: string; snippet: string; source: string; type: string }[]> = {
  default: [
    { title: 'Documentation JARVIS v3.7', snippet: 'Manuel de référence complet de JARVIS OS. Commandes vocales, contrôles gestuels, intégration API, gestion de la mémoire.', source: 'jarvis.local/docs', type: 'doc' },
    { title: 'Avancées en informatique quantique 2026', snippet: 'Nouvelles percées en correction d’erreurs grâce aux qubits topologiques. Microsoft et IBM annoncent des processeurs de plus de 1000 qubits logiques.', source: 'science.tech/quantum', type: 'article' },
    { title: 'Benchmark de performance du modèle Gemini 2.5', snippet: 'Les derniers résultats montrent que Gemini 2.5 surpasse GPT-5 de 23 % en génération de code, raisonnement et tâches multimodales.', source: 'ai.benchmark.io', type: 'report' },
    { title: 'Développement d’interfaces neuronales', snippet: 'Une interface cerveau-machine atteint 95 % de précision en traduction pensée-texte via des capteurs EEG non invasifs.', source: 'neuro.research.org', type: 'paper' },
  ],
  quanti: [
    { title: 'Percée sur l’intrication quantique', snippet: 'Des scientifiques réalisent une intrication quantique sur plus de 1000 km via des relais satellites. L’internet quantique se rapproche.', source: 'physics.journal', type: 'paper' },
    { title: 'Processeur IBM Quantum Eagle', snippet: 'Un processeur de 433 qubits atteint l’avantage quantique sur des problèmes d’optimisation jusque-là insolubles classiquement.', source: 'ibm.com/quantum', type: 'article' },
  ],
  ia: [
    { title: 'Spéculations sur l’architecture de GPT-6', snippet: 'Des fuites suggèrent que le prochain modèle d’OpenAI utilisera 10T de paramètres avec activation parcimonieuse. Entraînement prévu au T3 2026.', source: 'aiinsider.net', type: 'article' },
    { title: 'Architecture du noyau neuronal de JARVIS', snippet: 'Plongée dans la conception modulaire de JARVIS. Inférence distribuée sur 48 unités de traitement neuronal.', source: 'jarvis.local/blog', type: 'doc' },
  ],
};

const TRENDING = ['informatique quantique', 'agents IA 2026', 'interface holographique', 'interfaces neuronales', 'minage spatial'];
const typeColors: Record<string, string> = {
  doc: tokens.color.accent,
  article: tokens.color.accentAlt,
  report: tokens.color.warning,
  paper: tokens.color.pending,
};

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<typeof MOCK_RESULTS['default']>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'all' | 'images' | 'docs'>('all');
  const [history, setHistory] = useState(['scan système', 'réseaux neuronaux', 'api gemini']);

  const search = (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    setTimeout(() => {
      const key = Object.keys(MOCK_RESULTS).find(k => q.toLowerCase().includes(k));
      setResults(key ? MOCK_RESULTS[key] : MOCK_RESULTS.default);
      setHistory(h => [q, ...h.filter(x => x !== q)].slice(0, 5));
      setLoading(false);
    }, 800 + Math.random() * 400);
  };

  const handleSubmit = () => {
    if (query.trim()) search(query);
  };

  return (
    <VisionChrome
      eyebrow="Contrôle"
      title={<span className="flex items-center gap-2"><Globe className="w-4 h-4" style={{ color: tokens.color.accent }} />Recherche</span>}
      level="regular"
      fill
      trailing={<div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.color.success }} /><span style={{ ...visionMono, color: tokens.color.success, fontSize: 10 }}>Connecté</span></div>}
    >
      <div className="flex flex-col h-full gap-3 overflow-hidden">
        <GlassPanel level="subtle" padding="sm" className="flex items-center gap-2 flex-shrink-0">
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: tokens.color.accent }} />
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="Rechercher dans le flux de données…" className="flex-1 outline-none bg-transparent" style={{ ...visionBody, color: tokens.color.text, fontSize: 13 }} />
          {query && <GlassButton tone="neutral" aria-label="Effacer la recherche" onClick={() => { setQuery(''); setResults([]); }} icon={<X className="w-3.5 h-3.5" />} />}
          <GlassButton tone="accent" onClick={handleSubmit}>Rechercher</GlassButton>
        </GlassPanel>

        <div className="flex gap-2 flex-shrink-0">
          {[
            { id: 'all', icon: Globe, label: 'Tout' },
            { id: 'images', icon: Image, label: 'Images' },
            { id: 'docs', icon: FileText, label: 'Documents' },
          ].map(({ id, icon: Icon, label }) => (
            <GlassButton key={id} active={tab === id} tone="accent" onClick={() => setTab(id as typeof tab)} icon={<Icon className="w-3 h-3" />}>{label}</GlassButton>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: `${tokens.color.borderActive} transparent` }}>
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <GlassPanel key={i} level="subtle" padding="md"><div className="flex gap-2 mb-2"><motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="h-3 rounded" style={{ background: tokens.color.surfaceRaised, width: '60%' }} /><motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} className="h-3 rounded" style={{ background: tokens.color.surface, width: '20%' }} /></div><motion.div animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.1 }} className="h-2 rounded mb-1" style={{ background: tokens.color.surfaceRaised, width: '90%' }} /><motion.div animate={{ opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.15 }} className="h-2 rounded" style={{ background: tokens.color.surface, width: '75%' }} /></GlassPanel>)}
              </motion.div>
            ) : results.length > 0 ? (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                <span style={visionCaption}>{results.length} résultat{results.length > 1 ? 's' : ''} pour « {query} »</span>
                {results.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                    <GlassPanel level="subtle" padding="md" className="group cursor-pointer">
                      <div className="flex items-start justify-between gap-2 mb-1"><span style={{ ...visionBody, color: tokens.color.text, fontWeight: 600 }}>{r.title}</span><div className="flex items-center gap-1.5 flex-shrink-0"><span style={{ ...visionMono, color: typeColors[r.type], fontSize: 9 }}>{r.type}</span><ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: tokens.color.accent }} /></div></div>
                      <p style={{ ...visionBody, fontSize: 11, lineHeight: '1.5' }}>{r.snippet}</p>
                      <div className="flex items-center gap-1 mt-1.5"><Globe className="w-2.5 h-2.5" style={{ color: tokens.color.accent }} /><span style={{ ...visionMono, color: tokens.color.textMuted, fontSize: 9 }}>{r.source}</span></div>
                    </GlassPanel>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3">
                <GlassPanel level="subtle" padding="md"><div className="flex items-center gap-2 mb-2"><TrendingUp className="w-3 h-3" style={{ color: tokens.color.accent }} /><span style={visionCaption}>Tendances du flux</span></div><div className="flex flex-wrap gap-2">{TRENDING.map(t => <GlassButton key={t} tone="neutral" onClick={() => { setQuery(t); search(t); }}>{t}</GlassButton>)}</div></GlassPanel>
                <GlassPanel level="subtle" padding="md"><div className="flex items-center gap-2 mb-2"><Clock className="w-3 h-3" style={{ color: tokens.color.textMuted }} /><span style={visionCaption}>Recherches récentes</span></div>{history.map(h => <GlassButton key={h} tone="neutral" onClick={() => { setQuery(h); search(h); }} className="w-full" style={{ justifyContent: 'flex-start' }} icon={<Clock className="w-3 h-3" />}>{h}</GlassButton>)}</GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </VisionChrome>
  );
}
