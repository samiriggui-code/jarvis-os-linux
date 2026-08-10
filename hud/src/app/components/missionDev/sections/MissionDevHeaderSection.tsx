import React from 'react';
import { MC_CYAN, mcMono, mcOrb, mcRaj } from '../lib/mcDevTokens';
import { tokens } from '../../../../ui/tokens';

/** Section — en-tête mission (titre / scénario / projet). */
export function MissionDevHeaderSection({
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
      style={{ borderBottom: `1px solid ${tokens.color.border}`, background: tokens.color.surface }}
    >
      <p style={{ ...mcMono, color: tokens.color.textMuted, fontSize: 9, margin: 0 }} className="truncate">
        {title || 'Mission DEV'}
        {scenario === 'cursor' ? ' · Scénario Cursor' : ''}
      </p>
      <p
        style={{ ...mcRaj, color: tokens.color.text, fontSize: 13, marginTop: 2, lineHeight: 1.35, opacity: 0.75 }}
        className="line-clamp-2"
      >
        {subtitle || "Suivi d'une action complexe."}
      </p>
      {projectName && (
        <p style={{ ...mcOrb, color: MC_CYAN, fontSize: 13, letterSpacing: '-0.01em', marginTop: 6 }} className="truncate">
          {projectName}
        </p>
      )}
    </div>
  );
}
