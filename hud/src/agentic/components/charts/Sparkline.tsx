/** REUSE — `agentic/library/Primitives.tsx::MetricChart` (déjà exactement un sparkline SVG). */
import { MetricChart } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(MetricChart, 'idle');

export interface SparklineProps {
  label?: string;
  series: number[];
  tone?: string;
}

export function Sparkline({ label, series, tone }: SparklineProps) {
  return <Adapted props={{ label, series, tone }} />;
}

export default Sparkline;
