/**
 * MicrophoneStatus/CameraStatus/AudioStatus/GPUStatus/StorageStatus — presets
 * sémantiques de `DeviceCard`, pas 5 renderers indépendants (addendum
 * admin/observabilité du plan).
 */
import { DeviceCard, type DeviceCardProps } from './DeviceCard';

type Preset = Omit<DeviceCardProps, 'name' | 'icon'> & { name?: string };

export function MicrophoneStatus(props: Preset) {
  return <DeviceCard name="Microphone" icon="mic" {...props} />;
}

export function CameraStatus(props: Preset) {
  return <DeviceCard name="Caméra" icon="camera" {...props} />;
}

export function AudioStatus(props: Preset) {
  return <DeviceCard name="Audio" icon="volume" {...props} />;
}

export function GPUStatus(props: Preset) {
  return <DeviceCard name="GPU" icon="gpu" {...props} />;
}

export function StorageStatus(props: Preset) {
  return <DeviceCard name="Stockage" icon="disk" {...props} />;
}
