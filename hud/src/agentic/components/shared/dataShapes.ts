/**
 * Formes de données partagées entre familles — évite qu'EventList et
 * TimelineChart (ou tout futur composant temporel) inventent chacun leur
 * propre shape pour la même idée.
 */

export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export interface EventItem {
  id: string;
  label: string;
  /** Déjà formaté pour affichage — le composant ne parse ni ne calcule de date. */
  timestamp: string;
  tone?: Tone;
  detail?: string;
}

export interface SeriesPoint {
  x: string | number;
  y: number;
}

export interface MetricDatum {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'cyan' | 'violet' | 'amber' | 'green';
  hint?: string;
}
