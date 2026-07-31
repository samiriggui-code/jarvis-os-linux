/** État visage holographique — jauge confiance biométrique (cahier §10.1) */

export type FaceBuildPhase =
  | 'waiting'       // veille — pas de visage
  | 'camera_on'     // brume, capteurs
  | 'reconstruction'
  | 'success'
  | 'deconstruct'
  | 'obstruction'
  | 'recovery'
  | 'locked';

export interface FaceHologramState {
  progress: number;       // 0–100 confiance / synthèse
  confidence: number;     // 0–1
  phase: FaceBuildPhase;
  obstruction: boolean;
  obstructionZone?: 'eyes' | 'mouth' | 'full';
  retry: number;
  recoverySecondsLeft?: number;
}

export const FACE_MILESTONES: { at: number; label: string; voice?: string }[] = [
  { at: 10, label: 'Premières particules', voice: 'Initialisation de la matrice faciale.' },
  { at: 25, label: 'Contour du visage', voice: 'Contour biométrique détecté.' },
  { at: 40, label: 'Structure faciale', voice: 'Structure faciale en cours de reconstruction.' },
  { at: 60, label: 'Maillage holographique', voice: 'Maillage holographique en stabilisation.' },
  { at: 80, label: 'Traits stabilisés', voice: 'Analyse de la signature biométrique.' },
  { at: 95, label: 'Signature analysée', voice: 'Correspondance presque confirmée.' },
  { at: 100, label: 'Identité confirmée', voice: 'Signature biométrique validée. Identité reconnue.' },
];

export function synthesisLabel(progress: number): string {
  const m = [...FACE_MILESTONES].reverse().find(x => progress >= x.at);
  return m?.label ?? 'BIOMETRIC SYNTHESIS';
}
