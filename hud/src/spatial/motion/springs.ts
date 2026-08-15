import { spatialMotionTokens } from '../tokens/spatial';

export const spatialSprings = spatialMotionTokens.spring;

/**
 * Appear sans transform/filter — scale/y/filter créent un containing block
 * et cassent backdrop-filter (verre = plaque).
 */
export const appearVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: spatialSprings.appear,
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.22 },
  },
};
