/** REUSE — `agentic/library/Primitives.tsx::ServiceHub` (existe déjà exactement). */
import { ServiceHub } from '../../library/Primitives';
import { adaptLibraryComponent } from '../shared/adaptLibraryComponent';

const Adapted = adaptLibraryComponent(ServiceHub, 'idle');

export interface ServiceListItem {
  id?: string;
  name: string;
  status: string;
  host?: string;
}

export interface ServiceListProps {
  title?: string;
  subtitle?: string;
  services: ServiceListItem[];
}

export function ServiceList({ title, subtitle, services }: ServiceListProps) {
  return <Adapted props={{ title, subtitle, services }} />;
}

export default ServiceList;
