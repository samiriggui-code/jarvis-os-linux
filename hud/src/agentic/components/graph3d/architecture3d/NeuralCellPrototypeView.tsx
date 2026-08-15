import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CSSProperties } from 'react';
import { useSpatialTheme } from '../../../../spatial/theme/SpatialTheme';
import { NeuralCellPrototype } from './NeuralCellPrototype';
import './architecture3d.css';

export type NeuralCellPrototypeViewProps = {
  className?: string;
  style?: CSSProperties;
  seed?: number;
};

/** Scène de test isolée — une cellule au centre, fond HUD identique. */
export function NeuralCellPrototypeView({
  className,
  style,
  seed = 4242,
}: NeuralCellPrototypeViewProps) {
  const { mode } = useSpatialTheme();

  return (
    <main
      className={className ? `architecture-shell neural-cell-lab ${className}` : 'architecture-shell neural-cell-lab'}
      style={style}
      data-neural-cell-prototype
      data-spatial-mode={mode}
    >
      <div className="architecture-glow" />
      <section className="architecture-stage" aria-label="Neural cell prototype — CORE">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0.08, 2.6], fov: 38, near: 0.02, far: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <ambientLight intensity={mode === 'light' ? 0.62 : 0.48} />
          <NeuralCellPrototype mode={mode} seed={seed} />
          <OrbitControls
            enablePan={false}
            minDistance={0.28}
            maxDistance={6.5}
            rotateSpeed={0.55}
            zoomSpeed={0.65}
            dampingFactor={0.08}
            enableDamping
          />
        </Canvas>
        <div className="neural-cell-lab__hud" aria-hidden>
          <span className="neural-cell-lab__tag">PROTOTYPE</span>
          <span className="neural-cell-lab__title">CORE · cellule neuronale</span>
          <span className="neural-cell-lab__hint">Orbit · zoom · inspecter la morphologie</span>
        </div>
      </section>
    </main>
  );
}
