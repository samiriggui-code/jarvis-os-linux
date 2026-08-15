import { ChartCard, type ChartCardProps } from './ChartCard';

export type BarChartProps = Omit<ChartCardProps, 'type'>;

export function BarChart(props: BarChartProps) {
  return <ChartCard type="bar" {...props} />;
}

export default BarChart;
