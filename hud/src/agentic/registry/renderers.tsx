/**
 * Registre agentique — RENDERERS.
 *
 * L'autre moitié du registre : nom → composant React réel.
 *
 * ⚠ **Règle P6 : une brique qui existe en produit est IMPORTÉE, jamais
 * réécrite.** Le 2026-08-03, une bibliothèque parallèle a réimplémenté l'orbe
 * au lieu d'importer `JarvisOrb` — on s'est retrouvé avec trois orbes.
 * Ici, `SystemMonitor` est le composant produit, celui que le HUD affiche
 * déjà dans son panneau de gauche. Pas une copie, pas une variante.
 */

import { CameraPreview } from '../../app/components/CameraPreview';
import { CommandConsole } from '../../app/components/CommandConsole';
import { GesturePanel } from '../../app/components/GesturePanel';
import { MemoryPanel } from '../../app/components/MemoryPanel';
import { ScanningPanel } from '../../app/components/ScanningPanel';
import { SettingsPanel } from '../../app/components/SettingsPanel';
import { SystemMonitor } from '../../app/components/SystemMonitor';
import { VoiceBar } from '../../app/components/VoiceBar';
import { ActionRequest } from '../library/ActionRequest';
import { ApprovalCard } from '../library/ApprovalCard';
import {
  AvatarChip,
  DataTable,
  DialogCard,
  InfoCard,
  KeyValueList,
  LinkList,
  MetricChart,
  SectionHeader,
  ServiceHub,
  StatCard,
  StatusBadge,
  ToastStack,
} from '../library/Primitives';
import { ResultPanel } from '../library/ResultPanel';

import type { RegisteredName } from './definitions';

/**
 * Ce que reçoit un composant rendu par une surface.
 *
 * `props` est déjà validé contre le schéma du catalogue, `state` garanti
 * présent dans les états déclarés. `emit` est le SEUL canal remontant : un
 * composant ne fait jamais d'effet de bord, il déclare une intention et le
 * Core décide (§7).
 */
export interface AgenticProps {
  id: string;
  props: Record<string, unknown>;
  state: string;
  emit: (action: string, payload?: Record<string, unknown>) => void;
  children: React.ReactNode;
}

/**
 * `Record<RegisteredName, ...>` et non `Record<string, ...>` : TypeScript
 * refuse alors de compiler si une définition n'a pas son renderer, ou
 * l'inverse. La correspondance est vérifiée à la compilation, pas découverte
 * à l'écran.
 */
export const renderers: Record<RegisteredName, React.FC<AgenticProps>> = {
  // Aucune prop transmise : ces panneaux lisent leur propre passerelle ou leur
  // contexte. L'agent a décidé de les AFFICHER, pas de ce qu'ils contiennent.
  // C'est la règle : l'agent compose le placement, jamais les internes.
  SystemMonitor: () => <SystemMonitor />,
  MemoryPanel: () => <MemoryPanel />,
  CommandConsole: () => <CommandConsole />,
  GesturePanel: () => <GesturePanel />,
  ScanningPanel: () => <ScanningPanel />,
  SettingsPanel: () => <SettingsPanel />,
  VoiceBar: () => <VoiceBar />,
  // Seule exception à la règle « aucune prop transmise » : `CameraPreview` en
  // accepte deux, déclarées au catalogue et donc validées avant d'arriver ici.
  // L'agent choisit un miroir ou une opacité, jamais une source vidéo — le flux
  // reste celui que le composant ouvre lui-même.
  CameraPreview: ({ props }) => (
    <CameraPreview
      mirrored={props.mirrored as boolean}
      opacity={props.opacity as number}
    />
  ),
  // Ces deux-là reçoivent leurs props : ce sont des briques agentiques, pas
  // des panneaux produit. Elles n'existent que pour la surface.
  ActionRequest,
  ApprovalCard,
  ResultPanel,
  SectionHeader,
  StatCard,
  InfoCard,
  StatusBadge,
  AvatarChip,
  LinkList,
  KeyValueList,
  DataTable,
  MetricChart,
  DialogCard,
  ToastStack,
  ServiceHub,
};
