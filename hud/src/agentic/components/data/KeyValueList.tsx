/** REUSE — `agentic/library/Primitives.tsx::KeyValueList` (existe déjà exactement). */
import { KeyValueList as LibraryKeyValueList } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryKeyValueList, 'idle');

export interface KeyValueListProps {
  title?: string;
  rows: Array<{ key: string; value: string } | [string, string]>;
}

export function KeyValueList({ title, rows }: KeyValueListProps) {
  return <Adapted props={{ title, rows }} />;
}

export default KeyValueList;
