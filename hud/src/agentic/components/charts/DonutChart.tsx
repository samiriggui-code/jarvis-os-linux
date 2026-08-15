import { ChartCard, type ChartCardProps } from './ChartCard';

export type DonutChartProps = Omit<ChartCardProps, 'type'>;

export function DonutChart(props: DonutChartProps) {
  return <ChartCard type="donut" {...props} />;
}

export default DonutChart;
