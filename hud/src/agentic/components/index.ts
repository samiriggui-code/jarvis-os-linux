/**
 * Barrel top-niveau — bibliothèque de composants Agentic. Ne réexporte que
 * les familles de composants ; `capabilities.ts` (contrat interne consommé
 * par `sim/adapters.ts`) et `shared/*` (utilitaires internes) restent
 * importés directement depuis leur chemin, pas depuis ce barrel.
 */
export * from './metrics';
export * from './charts';
export * from './data';
export * from './system';
export * from './agent';
export * from './text';
export * from './media';
export * from './navigation';
export * from './containers';
export * from './graph3d';
