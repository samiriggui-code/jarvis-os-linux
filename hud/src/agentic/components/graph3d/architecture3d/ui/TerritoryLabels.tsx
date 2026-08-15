import type { TerritoryAnchor } from './TerritoryLabelProjector';

/** Réutilise le langage visuel core-interior-label* (générique, pas de branding CORE dedans). */
export function TerritoryLabels({
  anchors,
  lod,
  globalLabelOpacity,
}: {
  anchors: TerritoryAnchor[];
  lod: number;
  globalLabelOpacity: number;
}) {
  const opacity = Math.max(0, (lod - 0.4) / 0.6) * (1 - globalLabelOpacity * 0.85);
  if (opacity < 0.04) return null;

  return (
    <div className="core-interior-labels" style={{ opacity }} aria-hidden>
      <svg className="core-interior-labels__leaders" aria-hidden>
        {anchors.map((a) =>
          a.visible ? (
            <line
              key={a.nodeId}
              x1={a.labelX}
              y1={a.labelY}
              x2={a.anchorX}
              y2={a.anchorY}
              className="core-interior-labels__leader"
            />
          ) : null,
        )}
      </svg>
      {anchors.map((a) =>
        a.visible ? (
          <div
            key={a.nodeId}
            className={`core-interior-label core-interior-label--${a.side}`}
            style={{
              left: a.labelX,
              top: a.labelY,
              transform: a.side === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
            }}
          >
            {a.side === 'left' ? (
              <>
                <span className="core-interior-label__name">{a.label}</span>
                <span className="core-interior-label__line" aria-hidden />
                <span className="core-interior-label__dot" aria-hidden />
              </>
            ) : (
              <>
                <span className="core-interior-label__dot" aria-hidden />
                <span className="core-interior-label__line" aria-hidden />
                <span className="core-interior-label__name">{a.label}</span>
              </>
            )}
          </div>
        ) : null,
      )}
    </div>
  );
}
