/** Types for the new Orb component (vendor/figma1 HUD). */

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface OrbProps {
  state: OrbState;
  volume: number;
  playbackVolume: number;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hud';
}
