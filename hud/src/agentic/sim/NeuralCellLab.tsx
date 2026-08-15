/** Lab — vue concept holographique (sphère + 9 panneaux latéraux). */
import { useMemo, useState } from 'react';
import { Graph3D, architectureGraphLab } from '../components/graph3d';

export function NeuralCellLab() {
  const model = useMemo(() => architectureGraphLab(), []);
  const [focusId, setFocusId] = useState<string | null>(null);

  return (
    <Graph3D
      model={model}
      layout="orb"
      focus={focusId}
      onFocusChange={setFocusId}
    />
  );
}

export default NeuralCellLab;
