import React from 'react';
import { HoloCubeProgress } from '../ui/HoloCubeProgress';

/** Section — progression cubes holographiques. */
export function MissionProgressSection({ pct }: { pct: number }) {
  return (
    <section className="flex-shrink-0" aria-label="Progression mission">
      <HoloCubeProgress pct={pct} />
    </section>
  );
}
