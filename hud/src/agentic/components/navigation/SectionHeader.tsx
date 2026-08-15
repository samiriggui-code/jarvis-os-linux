/** REUSE — `agentic/library/Primitives.tsx::SectionHeader` (existe déjà exactement, typo-only, sans glass). */
import { SectionHeader as LibrarySectionHeader } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibrarySectionHeader, 'idle');

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return <Adapted props={{ title, subtitle }} />;
}

export default SectionHeader;
