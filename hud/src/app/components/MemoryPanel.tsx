import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Cloud, HardDrive, GitBranch, Tag, Clock, Plus } from 'lucide-react';
import { useApp, type MemoryItem } from '../context/AppContext';
import { getCoreClient } from '../bridge/coreClient';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassButton } from '../../components/glass/GlassButton';
import { tokens } from '../../ui/tokens';
import { VisionChrome, visionBody, visionCaption, visionTitle } from './visionChrome';

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
        (d) => d.type === 'memory_result',
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
        (d) => d.type === 'memory_result',
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

  const allTags = [...new Set(memories.flatMap((m) => m.tags))];

  const filtered = memories.filter((m) => {
    const matchQuery =
      !query ||
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      m.content.toLowerCase().includes(query.toLowerCase());
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

  const syncRows = [
    {
      icon: HardDrive,
      label: 'Local',
      status: memorySync.local ? 'Actif' : 'Off',
      on: memorySync.local,
      count: localCount,
    },
    { icon: Cloud, label: 'Cloud', status: 'Off', on: false, count: 0 },
    { icon: GitBranch, label: 'Git', status: 'Off', on: false, count: 0 },
  ];

  return (
    <VisionChrome
      fill
      eyebrow="Données"
      title="Mémoire"
      trailing={
        <button
          type="button"
          onClick={() => void refresh()}
          style={{
            ...visionCaption,
            textTransform: 'none',
            letterSpacing: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: tokens.color.accent,
          }}
        >
          {loading ? '…' : 'Rafraîchir'}
        </button>
      }
    >
      <div className="flex flex-col h-full gap-3 overflow-hidden min-h-0">
        <GlassPanel level="subtle" radius="md" padding="sm">
          <div className="flex items-center gap-3">
            {syncRows.map(({ icon: Icon, label, status, on, count }) => (
              <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
                <Icon
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: on ? tokens.color.success : tokens.color.textMuted }}
                />
                <div className="min-w-0">
                  <div style={visionCaption}>{label}</div>
                  <div style={{ ...visionBody, color: on ? tokens.color.text : tokens.color.textMuted }}>
                    {status} ({count})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <div className="relative flex-shrink-0">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: tokens.color.textMuted }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans la mémoire…"
            className="w-full outline-none"
            style={{
              ...visionBody,
              color: tokens.color.text,
              background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.md,
              padding: '10px 12px 10px 36px',
            }}
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 flex-shrink-0">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className="flex items-center gap-1 cursor-pointer"
                style={{
                  padding: '4px 10px',
                  borderRadius: tokens.radius.pill,
                  background: activeTag === tag ? tokens.color.accentSoft : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${activeTag === tag ? tokens.color.borderActive : tokens.color.border}`,
                }}
              >
                <Tag className="w-2.5 h-2.5" style={{ color: tokens.color.textMuted }} />
                <span style={{ ...visionCaption, textTransform: 'none', letterSpacing: 0 }}>{tag}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0">
          {!memorySync.local && !loading && (
            <p style={{ ...visionBody, color: tokens.color.warning }}>
              Core offline — souvenirs non chargés. Relance `python -m jarvis_core`.
            </p>
          )}
          <AnimatePresence>
            {filtered.map((mem, i) => (
              <motion.div
                key={mem.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <GlassPanel level="subtle" radius="md" padding="sm">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span style={{ ...visionTitle, fontSize: 14 }}>{mem.title}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: mem.synced ? tokens.color.success : tokens.color.warning }}
                    />
                  </div>
                  <p style={{ ...visionBody, marginBottom: 8 }} className="line-clamp-2">
                    {mem.content}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1">
                      {mem.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            ...visionCaption,
                            textTransform: 'none',
                            letterSpacing: 0,
                            padding: '2px 8px',
                            borderRadius: tokens.radius.pill,
                            background: 'rgba(255,255,255,0.06)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" style={{ color: tokens.color.textMuted }} />
                      <span style={visionBody}>{fmtTime(mem.timestamp)}</span>
                    </div>
                  </div>
                </GlassPanel>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {adding ? (
          <GlassPanel level="subtle" radius="md" padding="sm">
            <div className="flex flex-col gap-2">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Titre"
                className="outline-none"
                style={{
                  ...visionBody,
                  color: tokens.color.text,
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  padding: '8px 10px',
                }}
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Contenu du souvenir…"
                rows={3}
                className="outline-none resize-none"
                style={{
                  ...visionBody,
                  color: tokens.color.text,
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${tokens.color.border}`,
                  borderRadius: tokens.radius.md,
                  padding: '8px 10px',
                }}
              />
              <div className="flex gap-2">
                <GlassButton tone="accent" onClick={() => void submitAdd()} style={{ flex: 1 }}>
                  Sauver
                </GlassButton>
                <GlassButton onClick={() => setAdding(false)}>Annuler</GlassButton>
              </div>
            </div>
          </GlassPanel>
        ) : (
          <GlassButton tone="accent" onClick={() => setAdding(true)} icon={<Plus className="w-4 h-4" />}>
            Ajouter un souvenir
          </GlassButton>
        )}
      </div>
    </VisionChrome>
  );
}
