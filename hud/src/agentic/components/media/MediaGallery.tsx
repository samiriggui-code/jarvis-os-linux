import type { ReactNode } from 'react';

export interface MediaGalleryProps {
  items: ReactNode[];
  columns?: number;
}

/** Grille de presets MediaFrame déjà rendus (CameraPreview/ImageViewer/...). */
export function MediaGallery({ items, columns = 3 }: MediaGalleryProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10, height: '100%' }}>
      {items.map((it, i) => (
        <div key={i} style={{ minHeight: 0 }}>
          {it}
        </div>
      ))}
    </div>
  );
}

export default MediaGallery;
