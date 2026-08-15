import { ChartCard, type ChartCardProps } from './ChartCard';

export type LineChartProps = Omit<ChartCardProps, 'type'>;

/** Preset de ChartCard — aspectRatio ~1.8 (voir capabilities.ts). */
export function LineChart(props: LineChartProps) {
  return <ChartCard type="line" {...props} />;
}

export default LineChart;
