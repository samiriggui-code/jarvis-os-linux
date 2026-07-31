import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Search, Cloud, HardDrive, GitBranch, Tag, Clock, Plus } from 'lucide-react';
import { useApp, type MemoryItem } from '../context/AppContext';
import { getCoreClient } from '../bridge/coreClient';

const orb = { fontFamily: 'Orbitron, sans-serif' };
const mono = { fontFamily: 'Share Tech Mono, monospace' };
const raj = { fontFamily: 'Rajdhani, sans-serif' };

type CoreMemory = {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  synced?: boolean;
  created_at?: string;
  updated_at?: string;
};

function mapCoreItem(m: CoreMemory): MemoryItem {
  const ts = m.created_at || m.updated_at;
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    tags: Array.isArray(m.tags) ? m.tags : [],
    synced: m.synced !== false,
    timestamp: ts ? new Date(ts) : new Date(),
  };
}

export function MemoryPanel() {
  const {
    memories, setMemories, addMemory, memorySync, setMemorySync,
    coreAuth, addNotification,
  } = useApp();
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');

  const uid = coreAuth?.user?.id || 'local';

  const refresh = useCallback(async () => {
    const client = getCoreClient();
    if (!client.connected) {
      setMemorySync({ local: false, cloud: false, git: false });
      return;
    }
    setLoading(true);
    try {
      const res = await client.request(
        { type: 'memory', action: 'list', user_id: uid },
        d => d.type === 'memory_result',
        5000,
      );
      if (res.ok && Array.isArray(res.items)) {
        setMemories((res.items as CoreMemory[]).map(mapCoreItem));
        const sync = res.sync as { local?: boolean; cloud?: boolean; git?: boolean } | undefined;
        setMemorySync({
          local: sync?.local !== false,
          cloud: Boolean(sync?.cloud),
          git: Boolean(sync?.git),
        });
      }
    } catch {
      setMemorySync({ local: false, cloud: false, git: false });
    } finally {
      setLoading(false);
    }
  }, [uid, setMemories, setMemorySync]);

  useEffect(() => {
    void refresh();
  }, [refresh, coreAuth?.online]);

  const submitAdd = async () => {
    const title = draftTitle.trim() || 'Souvenir';
    const content = draftContent.trim();
    if (!content) {
      addNotification({ type: 'warning', title: 'Mémoire', message: 'Écris le contenu du souvenir.' });
      return;
    }
    const client = getCoreClient();
    if (!client.connected) {
      addNotification({ type: 'warning', title: 'Mémoire', message: 'Core hors ligne — relance jarvis_core.' });
      return;
    }
    try {
      const res = await client.request(
        {
          type: 'memory',
          action: 'add',
          user_id: uid,
          title,
          content,
          tags: ['notes'],
        },
        d => d.type === 'memory_result',
        5000,
      );
      if (!res.ok) {
        addNotification({ type: 'error', title: 'Mémoire', message: String(res.error || 'échec') });
        return;
      }
      if (Array.isArray(res.items)) {
        setMemories((res.items as CoreMemory[]).map(mapCoreItem));
      } else if (res.item) {
        addMemory(mapCoreItem(res.item as CoreMemory));
      }
      setDraftTitle('');
      setDraftContent('');
      setAdding(false);
      addNotification({ type: 'success', title: 'Mémoire', message: 'Souvenir sauvé dans Core (local).' });
    } catch (e) {
      addNotification({
        type: 'error',
        title: 'Mémoire',
        message: e instanceof Error ? e.message : 'timeout Core',
      });
    }
  };

  const allTags = [...new Set(memories.flatMap(m => m.tags))];

  const filtered = memories.filter(m => {
    const matchQuery = !query || m.title.toLowerCase().includes(query.toLowerCase()) || m.content.toLowerCase().includes(query.toLowerCase());
    const matchTag = !activeTag || m.tags.includes(activeTag);
    return matchQuery && matchTag;
  });

  const fmtTime = (d: Date) => {
    const diff = Date.now() - d.getTime();
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)} h`;
    return `il y a ${Math.floor(diff / 86400000)} j`;
  };

  const localCount = memorySync.local ? memories.length : 0;

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" style={{ color: '#a855f7' }} />
          <span style={{ ...orb, color: '#a855f7', fontSize: '11px', letterSpacing: '0.15em' }}>NOYAU MÉMOIRE</span>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="cursor-pointer"
          style={{ ...mono, color: 'rgba(168,85,247,0.7)', fontSize: '9px', background: 'none', border: 'none' }}
        >
          {loading ? '…' : 'RAFRAÎCHIR'}
        </button>
      </div>

      <div
        className="rounded-xl p-2.5 flex items-center gap-3 flex-shrink-0"
        style={{ background: 'rgba(0,8,20,0.5)', border: '1px solid rgba(168,85,247,0.15)' }}
      >
        {[
          {
            icon: HardDrive,
            label: 'LOCAL',
            status: memorySync.local ? 'ACTIF' : 'OFF',
            color: memorySync.local ? '#22c55e' : 'rgba(255,255,255,0.25)',
            count: localCount,
          },
          {
            icon: Cloud,
            label: 'CLOUD',
            status: 'OFF',
            color: 'rgba(255,255,255,0.25)',
            count: 0,
          },
          {
            icon: GitBranch,
            label: 'GIT',
            status: 'OFF',
            color: 'rgba(255,255,255,0.25)',
            count: 0,
          },
        ].map(({ icon: Icon, label, status, color, count }) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <Icon className="w-3 h-3" style={{ color }} />
            <div>
              <div style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '8px' }}>{label}</div>
              <div style={{ ...mono, color, fontSize: '9px' }}>{status} ({count})</div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(168,85,247,0.6)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher dans la mémoire…"
          className="w-full rounded-lg pl-9 pr-4 py-2.5 outline-none"
          style={{
            background: 'rgba(0,8,25,0.6)',
            border: '1px solid rgba(168,85,247,0.2)',
            color: 'rgba(255,255,255,0.8)',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '13px',
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 flex-shrink-0">
        {allTags.map(tag => (
          <motion.button
            key={tag}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className="flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer"
            style={{
              background: activeTag === tag ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.08)',
              border: `1px solid ${activeTag === tag ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.15)'}`,
            }}
          >
            <Tag className="w-2.5 h-2.5" style={{ color: '#a855f7' }} />
            <span style={{ ...mono, color: activeTag === tag ? '#a855f7' : 'rgba(168,85,247,0.7)', fontSize: '9px' }}>
              {tag}
            </span>
          </motion.button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(168,85,247,0.3) transparent' }}>
        {!memorySync.local && !loading && (
          <p style={{ ...mono, color: '#f59e0b', fontSize: '10px' }}>
            Core offline — souvenirs non chargés. Relance `python -m jarvis_core`.
          </p>
        )}
        <AnimatePresence>
          {filtered.map((mem, i) => (
            <motion.div
              key={mem.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl p-3 cursor-pointer group"
              style={{
                background: 'rgba(0,8,25,0.5)',
                border: '1px solid rgba(168,85,247,0.12)',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.35)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 0 15px rgba(168,85,247,0.1)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,85,247,0.12)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span style={{ ...raj, color: 'rgba(255,255,255,0.85)', fontSize: '13px' }}>{mem.title}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {mem.synced ? (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b' }} />
                  )}
                </div>
              </div>
              <p style={{ ...mono, color: 'rgba(255,255,255,0.4)', fontSize: '10px', lineHeight: '1.5' }} className="line-clamp-2 mb-2">
                {mem.content}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {mem.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(168,85,247,0.12)',
                        border: '1px solid rgba(168,85,247,0.2)',
                        ...mono,
                        color: '#a855f7',
                        fontSize: '8px',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
                  <span style={{ ...mono, color: 'rgba(255,255,255,0.25)', fontSize: '9px' }}>
                    {fmtTime(mem.timestamp)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {adding ? (
        <div className="flex flex-col gap-2 flex-shrink-0 rounded-xl p-2.5" style={{ border: '1px solid rgba(168,85,247,0.3)' }}>
          <input
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            placeholder="Titre"
            className="rounded-lg px-3 py-2 outline-none"
            style={{ background: 'rgba(0,8,25,0.7)', border: '1px solid rgba(168,85,247,0.2)', ...raj, color: '#fff', fontSize: 13 }}
          />
          <textarea
            value={draftContent}
            onChange={e => setDraftContent(e.target.value)}
            placeholder="Contenu du souvenir…"
            rows={3}
            className="rounded-lg px-3 py-2 outline-none resize-none"
            style={{ background: 'rgba(0,8,25,0.7)', border: '1px solid rgba(168,85,247,0.2)', ...mono, color: 'rgba(255,255,255,0.8)', fontSize: 11 }}
          />
          <div className="flex gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => void submitAdd()}
              className="flex-1 py-2 rounded-xl cursor-pointer"
              style={{ background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.45)' }}
            >
              <span style={{ ...mono, color: '#a855f7', fontSize: 10 }}>SAUVER</span>
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => setAdding(false)}
              className="px-3 py-2 rounded-xl cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span style={{ ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>ANNULER</span>
            </motion.button>
          </div>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setAdding(true)}
          className="w-full py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
          style={{
            background: 'rgba(168,85,247,0.08)',
            border: '1px dashed rgba(168,85,247,0.3)',
          }}
        >
          <Plus className="w-3.5 h-3.5" style={{ color: '#a855f7' }} />
          <span style={{ ...mono, color: 'rgba(168,85,247,0.7)', fontSize: '10px' }}>AJOUTER UN SOUVENIR</span>
        </motion.button>
      )}
    </div>
  );
}
