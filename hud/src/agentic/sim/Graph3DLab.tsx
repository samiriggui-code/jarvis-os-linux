/**
 * Lab DemoStage — preview du Graph3D (= Architecture3DView vendor).
 */
import { useMemo } from 'react';
import { Graph3D, architectureGraphLab } from '../components/graph3d';

export function Graph3DLab() {
  const model = useMemo(() => architectureGraphLab(), []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Graph3D model={model} layout="orb" presentationDebug />
    </div>
  );
}

export default Graph3DLab;
