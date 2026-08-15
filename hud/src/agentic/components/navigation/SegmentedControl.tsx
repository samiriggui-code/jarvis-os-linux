/** ALIAS/PRESET — TabBar en variante 'segmented', même renderer. */
import { TabBar, type TabItem } from './TabBar';

export interface SegmentedControlProps {
  options: TabItem[];
  value: string;
  onChange?: (id: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return <TabBar tabs={options} activeId={value} onSelect={onChange} variant="segmented" />;
}

export default SegmentedControl;
