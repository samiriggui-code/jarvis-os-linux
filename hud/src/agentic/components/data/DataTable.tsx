/** REUSE — `agentic/library/Primitives.tsx::DataTable` (existe déjà exactement). */
import { DataTable as LibraryDataTable } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(LibraryDataTable, 'idle');

export interface DataTableProps {
  title?: string;
  columns: string[];
  rows: (string[] | Record<string, unknown>)[];
}

export function DataTable({ title, columns, rows }: DataTableProps) {
  return <Adapted props={{ title, columns, rows }} />;
}

export default DataTable;
