/** REUSE — `agentic/library/ResultPanel.tsx` (existe déjà exactement, renommé sémantiquement). */
import { ResultPanel } from '../../library/ResultPanel';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(ResultPanel, 'idle');

export interface SummaryCardProps {
  title?: string;
  body?: string;
  source?: string;
  items?: string[];
}

export function SummaryCard(props: SummaryCardProps) {
  return <Adapted props={{ ...props }} />;
}

export default SummaryCard;
