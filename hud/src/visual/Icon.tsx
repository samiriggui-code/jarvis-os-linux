/**
 * `<Icon name="cpu" />` — façade JARVIS au-dessus de lucide-react (déjà le
 * standard dans 51 fichiers du HUD). Backend choisi explicitement : KeenIcons
 * (Metronic) est une police CSS à ~2000 glyphes, un système de rendu parallèle
 * pour zéro manque réel aujourd'hui — voir hud/vendor/metronic/README.md.
 *
 * Table volontairement non-exhaustive : ajouter une entrée quand un composant
 * en a réellement besoin, pas par anticipation.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Database,
  ExternalLink,
  File,
  FileText,
  Folder,
  HardDrive,
  Home,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  MemoryStick,
  Mic,
  Minus,
  PlayCircle,
  Quote,
  RotateCcw,
  Router,
  Search,
  Server,
  Settings,
  Shield,
  Terminal,
  TrendingDown,
  TrendingUp,
  Video,
  Volume2,
  Wifi,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

const ICONS = {
  cpu: Cpu,
  terminal: Terminal,
  warning: AlertTriangle,
  network: Wifi,
  activity: Activity,
  shield: Shield,
  brain: Brain,
  search: Search,
  settings: Settings,
  close: X,
  check: Check,
  info: Info,
  mic: Mic,
  camera: Camera,
  home: Home,
  file: File,
  folder: Folder,
  database: Database,
  disk: HardDrive,
  'trend-up': TrendingUp,
  'trend-down': TrendingDown,
  'trend-flat': Minus,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  server: Server,
  memory: MemoryStick,
  router: Router,
  success: CheckCircle2,
  error: XCircle,
  'alert-circle': AlertCircle,
  play: PlayCircle,
  video: Video,
  image: ImageIcon,
  quote: Quote,
  code: Code2,
  text: FileText,
  volume: Volume2,
  gpu: Zap,
  retry: RotateCcw,
  'open-external': ExternalLink,
  clock: Clock,
  list: List,
  grid: LayoutGrid,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 16, color, strokeWidth = 1.75, className }: IconProps) {
  const Cmp = ICONS[name];
  if (!Cmp) {
    if (import.meta.env.DEV) console.warn(`[Icon] nom inconnu, rien à rendre : "${name}"`);
    return null;
  }
  return <Cmp size={size} color={color} strokeWidth={strokeWidth} className={className} />;
}

export default Icon;
