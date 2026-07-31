import React from 'react';
import { MC_ACCENT, MC_CYAN, mcMono, mcOrb, mcRaj } from '../lib/mcTokens';

/** Section — en-tête mission (titre / scénario / projet). */
export function MissionHeaderSection({
  title,
  subtitle,
  projectName,
  scenario,
}: {
  title: string;
  subtitle: string;
  projectName: string;
  scenario: string | null;
}) {
  return (
    <div
      className="px-3 sm:px-5 py-2.5 sm:py-3 flex-shrink-0"
      style={{ borderBottom: `1px solid ${MC_ACCENT}22`, background: 'rgba(244,63,94,0.04)' }}
    >
      <p style={{ ...mcMono, color: 'rgba(255,255,255,0.4)', fontSize: 9, margin: 0 }} className="truncate">
        {title || 'Mission'}
        {scenario === 'cursor' ? ' · SCÉNARIO CURSOR' : ''}
      </p>
      <p
        style={{ ...mcRaj, color: 'rgba(220,235,255,0.7)', fontSize: 13, marginTop: 2, lineHeight: 1.35 }}
        className="line-clamp-2"
      >
        {subtitle || 'Suivi d’une action complexe.'}
      </p>
      {projectName && (
        <p style={{ ...mcOrb, color: MC_CYAN, fontSize: 13, letterSpacing: '0.1em', marginTop: 6 }} className="truncate">
          {projectName}
        </p>
      )}
    </div>
  );
}
