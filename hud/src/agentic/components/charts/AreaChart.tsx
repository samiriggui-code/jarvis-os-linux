import { ChartCard, type ChartCardProps } from './ChartCard';

export type AreaChartProps = Omit<ChartCardProps, 'type'>;

export function AreaChart(props: AreaChartProps) {
  return <ChartCard type="area" {...props} />;
}

export default AreaChart;
