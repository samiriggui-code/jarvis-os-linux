/**
 * OrbVoyage — cinématique de démarrage : TON orbe qui se remodèle.
 *
 * Ce n'est pas un nuage de particules décoratif posé à côté de l'orbe : c'est
 * l'orbe elle-même. Géométrie, nuanceur, dégradé, sparkles, vagues et bruit
 * simplex sont repris tels quels de `app/components/orb/JarvisOrb.jsx` — la
 * même matière, la même identité visuelle. On y ajoute UNE chose : un morph
 * dans le nuanceur de sommets, qui déplace chaque point de la sphère vers
 * d'autres figures.
 *
 * Le récit — voyage de la conscience humaine (historique / quantique) :
 *
 *   galaxies → voyage → solaire → terre → vague → adn → cerveau → neurones → orbe
 *
 * Depuis une galaxie lointaine, tunnel quantique, système solaire, planète
 * Terre, mer vivante (flow wave), ADN, cerveau, réseau neuronal — et la
 * conscience se condense en orbe : JARVIS.
 *
 * Chaque point garde son indice sur tout le trajet, et sa position est
 * interpolée entre la figure sortante et la figure entrante — d'où un
 * remodelage continu, jamais un remplacement d'une forme par une autre.
 *
 * ⚠ Aucun code tiers ici. Les compositions de GetLayers ont servi de
 * références de mise en scène (une traversée en tunnel, une croûte en
 * fusion) ; le GLSL est écrit pour ce projet.
 *
 * Puis handoff au HUD idle (après auth). Le check services + auth
 * précèdent désormais cette cinématique — voir AppContext.welcomeCinematic.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { getDeviceProfile, scaleForTier } from '../core/device';
import { clamp, lerp } from '../core/spring';
import { useTicker } from '../core/useTicker';
import { buildAllFigures, type Figure, type FigureId } from './figures';

export type VoyageAct =
  | 'galaxies'
  | 'voyage'
  | 'solaire'
  | 'terre'
  | 'vague'
  | 'adn'
  | 'cerveau'
  | 'neurones'
  | 'orbe';

/**
 * Le récit — voyage de la conscience (historique / quantique).
 *
 *   galaxies  galaxie lointaine — l'origine cosmique
 *   voyage    tunnel quantique — la traversée
 *   solaire   système solaire — l'arrivée
 *   terre     planète Terre — le foyer
 *   vague     mer / flow wave — le vivant de surface
 *   adn       ADN humain — le vivant
 *   cerveau   cerveau — l'organe de la conscience
 *   neurones  réseau neuronal — l'information s'allume
 *   orbe      JARVIS — la conscience condensée en IA
 *
 * L'ordre n'est pas décoratif : chaque figure est l'étape suivante du même
 * mouvement, et c'est UNE seule matière qui les traverse toutes. Elle finit
 * en orbe parce que c'est là qu'aboutit le récit — puis la main passe au
 * boot (AuthScene), où l'orbe réapparaît en petit en haut pendant la
 * checklist annoncée à la voix.
 */
const ACT_IDS: VoyageAct[] = [
  'galaxies',
  'voyage',
  'solaire',
  'terre',
  'vague',
  'adn',
  'cerveau',
  'neurones',
  'orbe',
];

/** Bornes 0→1 du voyage — neuf actes à poids égal. */
export const ACTS: { id: VoyageAct; from: number; to: number }[] = ACT_IDS.map((id, i) => ({
  id,
  from: i / ACT_IDS.length,
  to: (i + 1) / ACT_IDS.length,
}));

/**
 * Teinte d'ambiance par acte. Elle MODULE le dégradé de l'orbe, elle ne le
 * remplace pas : `stopMix` reste la source de vérité de la couleur, sinon on
 * reperdrait justement ce qui fait reconnaître l'orbe.
 */
const ACT_TINT: Record<VoyageAct, [number, number, number]> = {
  // Palette en continuum : pas de jump magenta/violet entre actes.
  galaxies: [0.85, 1.0, 0.92], // mint starfield
  voyage: [0.55, 0.85, 1.0], // tunnel cyan
  solaire: [1.0, 1.0, 1.0], // neutre : couleurs planétaires pures
  terre: [1.0, 1.0, 1.0], // neutre — contrastes continentaux intacts
  vague: [0.35, 1.0, 0.65], // émeraude / menthe
  adn: [0.45, 0.95, 0.9],
  cerveau: [0.95, 0.55, 0.75],
  neurones: [0.7, 0.85, 1.0],
  orbe: [1.0, 1.0, 1.0], // neutre — stopMix JarvisOrb intact
};

/**
 * Rayon que la caméra doit tenir dans le cadre, par acte.
 *
 * C'est le réglage qui décide de l'échelle ressentie, et il n'a pas de bonne
 * valeur unique : un cadrage assez large pour contenir le disque galactique
 * rend l'orbe minuscule et lointaine. Une valeur INFÉRIEURE au rayon réel de
 * la figure la fait déborder de l'écran — c'est voulu sur `orbe` et
 * `voyage`, où l'on doit se sentir dedans plutôt que devant.
 *
 * Interpolé d'un acte à l'autre : la caméra avance et recule toute seule.
 */
const ACT_FIT: Record<VoyageAct, number> = {
  galaxies: 2.15,
  voyage: 0.95,
  solaire: 1.95,
  terre: 1.0,
  vague: 2.05, // mer large, vue d en haut
  adn: 1.35, // hélice plus grosse dans le cadre
  cerveau: 1.05, // profil complet avec tronc
  neurones: 1.55,
  orbe: 1.62, // plus petite dans le cadre — orbe entière visible + texte bas
};

/**
 * Décalage vertical de la caméra, par acte.
 *
 * Monter la caméra fait DESCENDRE le sujet dans l'image. Sur l'acte final
 * on descend l'orbe pour qu'elle tienne entière au-dessus de « Bienvenue ».
 */
const ACT_SHIFT: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 0,
  solaire: 0,
  terre: 0,
  vague: 0.72, // caméra haute au-dessus de la nappe
  adn: 0,
  cerveau: 0.18, // un peu de bas pour le tronc
  neurones: 0,
  orbe: 0.42, // descendue — plus de calotte coupée en haut
};

/**
 * Force du limbe, par acte.
 *
 * À 1, la matière n'est visible qu'en bord de silhouette et le centre tombe
 * au noir — c'est ce qui donne à une coque de particules sa lecture de
 * VOLUME plutôt que de disque plein, et c'est le trait dominant de la
 * référence `solaris`. À 0, la surface est visible partout (utile pour les
 * figures ouvertes comme l'hélice ou la galaxie, qui n'ont pas d'intérieur).
 */
const ACT_RIM: Record<VoyageAct, number> = {
  galaxies: 0.05,
  voyage: 0.08,
  solaire: 0.28,
  terre: 0.0, // surface plate — pas de limbe qui noircit les continents
  vague: 0.04, // nappe ouverte
  adn: 0.05,
  cerveau: 0.12,
  neurones: 0.05,
  orbe: 0.95,
};

/**
 * Présence de la face avant, par acte.
 *
 * La taille et l'alpha d'un point sont pondérés par `e2`, la distance au bord
 * de silhouette : au limbe un point est ~4x plus présent qu'au centre du
 * disque. Sur une figure fermée c'est ce qui donne le VOLUME — sans ça une
 * coque de particules se lit comme un disque plein.
 *
 * Mais une planète n'a d'intérêt que par sa SURFACE. Avec la pondération de
 * bord, la carte océans/continents tombe précisément dans la zone effacée :
 * on ne voyait qu'un anneau bleu au limbe et un centre noir, alors que le
 * builder calculait bien les continents.
 *
 * À 1, la face avant remonte au niveau du limbe. À 0, comportement d'origine
 * — d'où le 0 partout ailleurs : aucune autre figure n'est touchée.
 */
const ACT_SURFACE: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 0,
  solaire: 0,
  terre: 1, // la surface EST le sujet
  vague: 0,
  adn: 0.35, // brins bien présents
  cerveau: 0.55, // plis / profil lisibles
  neurones: 0,
  orbe: 0,
};

/**
 * Rotation différentielle, par acte.
 *
 * Une galaxie ne tourne pas d'un bloc : le centre boucle en quelques
 * dizaines de millions d'années, la périphérie en centaines. Même chose pour
 * des orbites planétaires — c'est la troisième loi de Kepler. Faire tourner
 * tout le nuage d'un seul mouvement donne une image qui pivote ; faire
 * tourner chaque point à SA vitesse donne un système qui vit.
 *
 * Nul sur les figures qui n'ont pas de centre de rotation (tunnel, hélice).
 */
const ACT_SPIN: Record<VoyageAct, number> = {
  galaxies: 0.55,
  voyage: 0,
  solaire: 0,
  terre: 0, // corps rigide — rotation via cloud.rotation.y
  vague: 0,
  adn: 0,
  cerveau: 0.0,
  neurones: 0.12,
  orbe: 0,
};

/**
 * Quantification du rayon de rotation, par acte.
 *
 * ⚠ Corrige un vrai defaut. La rotation differentielle donne a chaque point
 * une vitesse selon sa distance a l'axe — juste pour une galaxie, desastreux
 * pour un CORPS RIGIDE : les points d'une planete cote interieur tournent
 * plus vite que ceux cote exterieur, et la sphere s'etire en baton.
 *
 * En quantifiant le rayon par paliers, tous les points d'une meme planete
 * partagent la meme vitesse angulaire et le corps reste solide. Nul sur la
 * galaxie, ou la rotation doit rester continue — sinon on verrait des
 * anneaux concentriques discrets au lieu d'un enroulement fluide.
 */
const ACT_SPIN_QUANT: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 0,
  solaire: 10,
  terre: 0,
  vague: 0,
  adn: 0,
  cerveau: 0,
  neurones: 0,
  orbe: 0,
};

/**
 * Défilement en profondeur, par acte — uniquement le tunnel.
 *
 * Sans lui, la traversée est un décor immobile : on voit un cône de points,
 * pas un mouvement. Les points remontent le long de -Z et rebouclent à
 * l'entrée, ce qui donne le flux continu.
 */
const ACT_FLOW: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 1.35,
  solaire: 0,
  terre: 0,
  vague: 0.85, // stream Flow Wave
  adn: 0,
  cerveau: 0,
  neurones: 0,
  orbe: 0,
};

/** Impulsions synaptiques visibles (battement + flash) — acte neurones. */
const ACT_PULSE: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 0,
  solaire: 0,
  terre: 0,
  vague: 0,
  adn: 0,
  cerveau: 0,
  neurones: 1,
  orbe: 0,
};

/** Mer vivante — amplitude relief animé (snoise XZ + stream). */
const ACT_SEA: Record<VoyageAct, number> = {
  galaxies: 0,
  voyage: 0,
  solaire: 0,
  terre: 0,
  vague: 0.48,
  adn: 0,
  cerveau: 0,
  neurones: 0,
  orbe: 0,
};

/**
 * Palette vraie de chaque figure (refs GetLayers / *-ref).
 * Appliquée quand la forme est solide — pas pendant la poussière.
 */
const ACT_PAL_LO: Record<VoyageAct, [number, number, number]> = {
  galaxies: [0.68, 0.96, 0.81],
  voyage: [0.09, 0.04, 0.23],
  solaire: [0.15, 0.12, 0.08],
  terre: [0.02, 0.12, 0.35],
  vague: [0.008, 0.086, 0.047],
  adn: [0.05, 0.25, 0.35],
  cerveau: [0.35, 0.12, 0.28],
  neurones: [0.1, 0.2, 0.55],
  orbe: [0.23, 0.24, 0.58], // indigo JarvisOrb (unused si amt=0)
};

const ACT_PAL_HI: Record<VoyageAct, [number, number, number]> = {
  galaxies: [0.92, 1.0, 0.95],
  voyage: [0.17, 0.94, 1.0],
  solaire: [1.0, 0.85, 0.35],
  terre: [0.45, 0.85, 0.55],
  vague: [0.2, 0.91, 0.6],
  adn: [0.55, 0.95, 0.92],
  cerveau: [0.95, 0.55, 0.75],
  neurones: [0.85, 0.95, 1.15],
  orbe: [0.5, 0.83, 0.96], // limbe cyan JarvisOrb (unused si amt=0)
};

const ACT_PAL_AMT: Record<VoyageAct, number> = {
  galaxies: 0.72,
  voyage: 0.88,
  solaire: 0.35,
  terre: 0.0, // garder starCol océan/continent — pas de lavage palette
  vague: 0.15,
  adn: 0.82,
  cerveau: 0.78,
  neurones: 0.65,
  orbe: 0.0, // COULEURS JarvisOrb (stopMix) — pas de lavage Storm
};

/**
 * Inclinaison de la scène, par acte (radians) — rotation.x.
 *
 * Convention ici : 0 = disque VU DE PROFIL (barre), π/2 ≈ face-on (galette 2D).
 * Une galaxie se lit en TROIS-QUARTS COUCHE : ovale + bulbe qui sort
 * du plan + bras raccourcis. Viser ~0.55–0.7 (jamais > 1.1 = galette 2D).
 */
const ACT_TILT: Record<VoyageAct, number> = {
  galaxies: 0.68,
  voyage: 0.0,
  solaire: 0.55,
  terre: 0.08,
  vague: 0.22, // nappe quasi horizontale
  adn: 0.55, // trois-quarts pour lire la double hélice
  cerveau: 0.25, // profil latéral
  neurones: 0.48,
  orbe: 0.32,
};

/**
 * Roulis (rotation.z) — léger, pas un basculement extrême.
 */
const ACT_ROLL: Record<VoyageAct, number> = {
  galaxies: -0.22,
  voyage: 0,
  solaire: -0.12,
  terre: 0.02, // Afrique face caméra
  vague: 0.02,
  adn: 0.22,
  cerveau: 0.08, // profil stable
  neurones: -0.18,
  orbe: 0,
};

/** Champ de vision — UNE famille sur tout le voyage (pas un jump wormhole). */
const ACT_FOV: Record<VoyageAct, number> = {
  galaxies: 42,
  voyage: 48,
  solaire: 42,
  terre: 38,
  vague: 48,
  adn: 42,
  cerveau: 38,
  neurones: 42,
  orbe: 40,
};

/**
 * Sortie — l'orbe RÉTRÉCIT et S'ÉLOIGNE (recul caméra), sans monter.
 *
 * Pas de handoff vers le haut : AuthScene monte sa propre JarvisOrb.
 */
/** Recul fort : l'orbe disparaît au loin avant le fade → boot checks. */
const RECEDE_FIT = 28;
const RECEDE_SCALE = 0.03;

/** Amplitude du flot de curl au repos — fixée au montage selon la machine. */
let CURL_BASE = 0.012;

export interface OrbVoyageProps {
  /** Progression 0→1 du voyage. */
  progress: number;
  /**
   * Sortie 0→1. Au-delà de 0, la caméra recule : l'orbe s'éloigne et
   * disparaît pendant que le boot check prend la place.
   */
  outro?: number;
}

/* ── Nuanceurs ─────────────────────────────────────────────────────────── */

/** Bruit simplex — identique à celui de JarvisOrb. */
const NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
vec4 j=p-49.0*floor(p*ns.z*ns.z);
vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
vec4 h=1.0-abs(x)-abs(y);
vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;
vec4 sh=-step(h,vec4(0.0));
vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}

// ── Bruit de curl ──────────────────────────────────────────────────────
//
// Le rotationnel d'un champ de bruit vectoriel. Sa propriete utile est
// d'etre a DIVERGENCE NULLE : le flot ne cree ni source ni puits, donc les
// particules tourbillonnent comme dans un fluide sans jamais s'agglutiner
// en paquets ni se disperser uniformement. Un bruit ordinaire, lui, pousse
// les points vers des attracteurs et trahit tout de suite sa nature.
//
// Technique publiee — Bridson, Hourihan & Nordenstam, « Curl-Noise for
// Procedural Fluid Flow » (SIGGRAPH 2007). Implementation ecrite ici.
//
// ⚠ Cout : 18 appels a snoise par sommet. C'est cher, d'ou le garde-fou sur
// uCurl dans main() — a amplitude nulle, rien n'est calcule.
vec3 snoiseVec3(vec3 x){
  return vec3(
    snoise(x),
    snoise(vec3(x.y-19.1, x.z+33.4, x.x+47.2)),
    snoise(vec3(x.z+74.2, x.x-124.5, x.y+99.4)));
}

vec3 curlNoise(vec3 p){
  const float e = 0.1;
  vec3 dx = vec3(e,0.0,0.0), dy = vec3(0.0,e,0.0), dz = vec3(0.0,0.0,e);
  vec3 px0=snoiseVec3(p-dx), px1=snoiseVec3(p+dx);
  vec3 py0=snoiseVec3(p-dy), py1=snoiseVec3(p+dy);
  vec3 pz0=snoiseVec3(p-dz), pz1=snoiseVec3(p+dz);
  float x = py1.z-py0.z - pz1.y+pz0.y;
  float y = pz1.x-pz0.x - px1.z+px0.z;
  float z = px1.y-px0.y - py1.x+py0.x;
  return normalize(vec3(x,y,z) / (2.0*e));
}
`;

const VERTEX_SHADER = NOISE_GLSL + `
// Les deux figures entre lesquelles on interpole. Elles sont construites
// en JavaScript (figures.ts) : le nuanceur ne calcule plus aucune forme.
attribute vec3 aFrom;
attribute vec3 aTo;
// Caractere du point : x=taille, y=eclat, z=temperature (froid→chaud).
attribute vec3 aVarFrom;
attribute vec3 aVarTo;
attribute float aRnd;
uniform float uMix;
uniform float uNoiseT,uEnv,uBass,uMid,uTreble,uOverall,uPx,uSizeScale,uRim;
uniform float uCurl,uCurlT;
uniform float uSpin,uFlow,uTime,uQuant,uPulse,uSea,uScatter,uSolid,uSurface;
uniform vec3 uPalLo,uPalHi;
uniform float uPalAmt;
uniform vec3 uWDir[3];
uniform float uWPos[3];
uniform float uWStr[3];
uniform vec3 uTint;
varying vec3 vColor;varying float vAlpha;

// Dégradé de l'orbe — repris intact de JarvisOrb (échantillonné sur
// assets/orb/1373.jpg). Indigo profond désaturé en masse, saturation sur le
// limbe, chaude vers le bas.
vec3 stopMix(float d){
  vec3 c0=vec3(0.50,0.83,0.96);
  vec3 c1=vec3(0.23,0.24,0.58);
  vec3 c2=vec3(0.33,0.23,0.61);
  vec3 c3=vec3(0.48,0.16,0.42);
  vec3 c4=vec3(0.66,0.15,0.36);
  vec3 c5=vec3(0.89,0.24,0.32);
  vec3 c6=vec3(0.98,0.55,0.24);
  float s=d*6.0;
  if(s<1.0)return mix(c0,c1,s);
  if(s<2.0)return mix(c1,c2,s-1.0);
  if(s<3.0)return mix(c2,c3,s-2.0);
  if(s<4.0)return mix(c3,c4,s-3.0);
  if(s<5.0)return mix(c4,c5,s-4.0);
  return mix(c5,c6,s-5.0);
}

void main(){
  vec3 base=mix(aFrom,aTo,uMix);
  vec3 vr=mix(aVarFrom,aVarTo,uMix);

  if(uScatter>0.0001){
    vec3 dustDir=normalize(vec3(
      fract(aRnd*17.13)-0.5,
      fract(aRnd*31.71)-0.5,
      fract(aRnd*47.91)-0.5)+vec3(1e-4));
    float reach=(0.55+aRnd*2.1)*uScatter;
    base+=dustDir*reach;
    base.y+=sin(uTime*1.1+aRnd*6.28318)*0.08*uScatter;
  }

  if(uSpin>0.0001){
    float rad=length(base.xz);
    if(uQuant>0.5) rad=floor(rad*uQuant+0.5)/uQuant;
    float a=uTime*uSpin/(0.22+rad*1.6);
    float ca=cos(a),sa=sin(a);
    base.xz=vec2(base.x*ca-base.z*sa, base.x*sa+base.z*ca);
  }

  if(uFlow>0.0001 && uSea<0.001){
    float zmin=-3.2, zmax=1.8, span=zmax-zmin;
    float z=base.z-uTime*1.2*uFlow;
    base.z=zmin+mod(z-zmin,span);
  }
  if(uSea>0.0001){
    float stream=uTime*uFlow*1.8;
    float wn=snoise(vec3(base.x*0.82, base.z*0.82+stream, uTime*0.14))*0.58;
    wn+=snoise(vec3(base.x*1.65, base.z*1.65+stream*1.15, uTime*0.28))*0.32;
    wn+=snoise(vec3(base.x*3.4, base.z*3.4+stream*0.9, uTime*0.4))*0.14;
    base.y+=wn*uSea;
  }
  vec3 dir=normalize(base+vec3(1e-5));
  vec3 p=dir;

  vec4 mv0=modelViewMatrix*vec4(base,1.0);
  vec3 N=normalize(normalMatrix*dir);
  vec3 V=normalize(-mv0.xyz);
  float front=dot(N,V);
  float facing=abs(front);
  float edge=pow(1.0-facing,2.2);

  vec2 scr=mv0.xy;
  float dTop=clamp(0.5-scr.y*0.42,0.0,1.0);
  float radial=clamp(length(scr)*0.95,0.0,1.0);
  float band=dTop<0.33?uTreble:(dTop<0.66?uMid:uBass);

  float n1=snoise(p*2.1+vec3(uNoiseT));
  float n2=snoise(p*4.6-vec3(uNoiseT*0.7))*0.55;
  float n3=snoise(p*9.0+vec3(uNoiseT*1.4))*0.30;
  float n=n1+n2*(0.6+uMid*0.8)+n3*(0.4+uTreble*1.6);

  float wSum=0.0;
  vec3 lateral=vec3(0.0);
  float wLight=0.0;
  for(int i=0;i<3;i++){
    float proj=dot(p,uWDir[i]);
    float dB=(proj-uWPos[i])*3.0;
    float wb=exp(-dB*dB)*uWStr[i];
    wSum+=wb;
    wLight+=wb;
    vec3 tg=normalize(uWDir[i]-p*proj+vec3(1e-4));
    lateral+=tg*(-2.0*dB)*wb*0.9;
  }

  float ampSurf=((0.012+uEnv*0.055)+uBass*0.02)*(1.0-uSurface*0.95);
  float ampEdge=edge*(0.02+uEnv*0.10+uTreble*0.16)*(1.0-uSurface*0.9);
  float disp=n*(ampSurf+ampEdge)+wSum*(1.0-uSurface);

  vec3 scat=vec3(
    snoise(p*3.7+vec3(7.1+uNoiseT*0.5)),
    snoise(p*3.7+vec3(13.7-uNoiseT*0.4)),
    snoise(p*3.7+vec3(29.3+uNoiseT*0.6)))*edge*(0.030+band*0.10)*aRnd*(1.0-uSurface);

  vec3 flow=vec3(0.0);
  if(uCurl>0.001 && uSurface<0.5){
    flow=curlNoise(base*1.7+vec3(uCurlT))*uCurl*(0.55+0.9*aRnd);
  }

  vec3 np=base+dir*disp+lateral+scat+flow;
  vec4 mv=modelViewMatrix*vec4(np,1.0);
  gl_Position=projectionMatrix*mv;

  float hueJit=(aRnd-0.5)*0.08;
  vec3 grad=stopMix(clamp(dTop+hueJit,0.0,1.0));
  float crease=smoothstep(-1.3,0.5,n);
  float waveLight=wLight*(9.0+uTreble*12.0);
  float centerBlue=(1.0-radial)*(1.0-dTop*0.6);

  float tw=clamp(vr.z*0.5+0.5,0.0,1.0);
  vec3 c0=vec3(0.22,0.38,1.15);
  vec3 c1=vec3(0.42,0.88,0.95);
  vec3 c2=vec3(0.28,0.72,0.92);
  vec3 cG=vec3(0.32,0.82,0.40);
  vec3 c3=vec3(0.78,0.74,0.68);
  vec3 c4=vec3(1.05,0.95,0.62);
  vec3 c5=vec3(1.05,0.92,0.55);
  vec3 c6=vec3(1.15,0.72,0.32);
  vec3 c7=vec3(1.12,0.42,0.22);
  vec3 c8=vec3(1.2,0.38,0.78);
  vec3 c9=vec3(1.18,0.98,0.42);
  vec3 starCol=
    tw<0.10?mix(c0,c1,tw/0.10):
    tw<0.20?mix(c1,c2,(tw-0.10)/0.10):
    tw<0.32?mix(c2,cG,(tw-0.20)/0.12):
    tw<0.42?mix(cG,c3,(tw-0.32)/0.10):
    tw<0.52?mix(c3,c4,(tw-0.42)/0.10):
    tw<0.62?mix(c4,c5,(tw-0.52)/0.10):
    tw<0.72?mix(c5,c6,(tw-0.62)/0.10):
    tw<0.82?mix(c6,c7,(tw-0.72)/0.10):
    tw<0.91?mix(c7,c8,(tw-0.82)/0.09):
    mix(c8,c9,(tw-0.91)/0.09);
  starCol=mix(starCol,vec3(1.0,0.98,0.92),aRnd*0.08);

  // BASE : rim haut = orbe JarvisOrb (stopMix) ; rim bas = couleurs figures
  float openFig=1.0-uRim;
  vec3 col=mix(grad,starCol,openFig*0.94);
  // Cœur bleu-nuit — même poids que JarvisOrb quand limbe élevé
  col=mix(col,vec3(0.16,0.26,0.46),centerBlue*mix(0.2,0.55,uRim));
  col=mix(col,col*uTint*1.35,0.08+0.28*uRim);
  if(uSea>0.001){
    vec3 seaLo=vec3(0.008,0.086,0.047);
    vec3 seaHi=vec3(0.20,0.91,0.60);
    float elev=clamp(base.y*0.55+0.45+vr.y*0.15,0.0,1.0);
    vec3 seaCol=mix(seaLo,seaHi,elev);
    col=mix(col,seaCol,clamp(uSea*1.35,0.0,0.92));
  }
  if(uPalAmt>0.001 && uSolid>0.001){
    vec3 figCol=mix(uPalLo,uPalHi,tw);
    if(uRim>0.5){
      float shell=smoothstep(0.15,0.95,length(base));
      figCol=mix(uPalLo,mix(uPalLo*0.6+uPalHi*0.8,uPalHi,shell),shell);
    }
    col=mix(col,figCol,clamp(uPalAmt*uSolid,0.0,0.95));
  }
  // Terre : océan / terre / sable / glace — contrastés mais pas fluo
  if(uSurface>0.5){
    vec3 ocean=vec3(0.06,0.22,0.72);
    vec3 landG=vec3(0.22,0.62,0.22);
    vec3 sand=vec3(0.82,0.68,0.32);
    vec3 ice=vec3(0.9,0.93,0.98);
    vec3 hard=
      tw<0.18?ocean:
      tw<0.40?landG:
      tw<0.70?sand:
      ice;
    col=mix(col,hard,0.88);
  }
  if(uScatter>0.001){
    vec3 dustCol=mix(vec3(0.70,0.25,0.12),vec3(1.0,0.77,0.42),fract(aRnd*9.3));
    col=mix(col,dustCol,clamp(uScatter*0.9,0.0,0.85));
  }

  float lum=(0.55+0.48*crease*(1.0-uSurface*0.85)+waveLight*0.45*(1.0-uSurface))*(0.75+aRnd*0.35+0.15*uSurface);
  lum*=clamp(vr.y,0.08,3.2);
  lum=mix(lum,1.1+n*0.2+waveLight*0.2,smoothstep(0.12,0.7,edge)*uRim*(1.0-uSurface));
  // Terre : luminosité plate = continents lisibles
  if(uSurface>0.5) lum=mix(lum,0.85+vr.y*0.35,0.75);
  float pulseGate=0.0;
  if(uPulse>0.001 && vr.y>1.35){
    float beat=pow(0.5+0.5*sin(uTime*7.5+aRnd*6.28318),4.0);
    float travel=fract(uTime*0.65+aRnd);
    pulseGate=mix(0.25,1.0,beat)*mix(0.45,1.0,smoothstep(0.0,0.15,travel)*smoothstep(1.0,0.75,travel));
    lum*=mix(1.0,0.4+2.4*pulseGate,uPulse);
    col=mix(col,vec3(0.75,0.95,1.2),uPulse*pulseGate*0.55);
  }
  vColor=col*lum;

  vec3 pole=normalize(vec3(0.06,1.0,0.34));
  float toPole=dot(p,pole);
  float hot=pow(max(0.0,toPole),9.0);
  float lit=pow(clamp(toPole*0.5+0.5,0.0,1.0),1.4);
  vColor*=mix(1.0,0.52+0.80*lit,uRim);
  vColor+=vec3(1.0,0.72,0.42)*hot*uRim*0.85;
  vColor+=vec3(1.0,0.95,0.88)*pow(hot,4.0)*uRim*1.1;

  bool sparkle=aRnd>0.9975;
  if(sparkle){vColor=mix(col*1.4,vec3(0.95,0.97,1.0),0.55);}
  float e2=smoothstep(0.12,0.7,edge);
  // uSurface releve le socle et retire d'autant la prime de bord : la face
  // avant remonte au niveau du limbe au lieu de disparaitre sous lui.
  float a=clamp(0.42+0.34*uSurface+crease*0.30*(1.0-uSurface)+waveLight*0.22+e2*(0.45-0.28*uSurface)+band*0.08,0.0,1.0);
  float rimOnly=clamp(e2*1.25+hot*0.9,0.0,1.0)*mix(1.0,0.45+0.70*lit,uRim);
  a=mix(a,a*rimOnly,uRim);
  // Terre : cacher l'hémisphère arrière (sinon double surface = brume)
  if(uSurface>0.5) a*=smoothstep(-0.05,0.25,front);
  vAlpha=sparkle?mix(0.92,0.92*rimOnly,uRim):a;

  float sz=(0.46+0.55*uSurface+crease*0.12*(1.0-uSurface)+waveLight*0.16+e2*((0.85-0.55*uSurface)+band*0.75))*(0.75+aRnd*0.5)*(sparkle?1.7:1.0);
  sz*=clamp(vr.x,0.08,4.2);
  // Terre : continents un peu plus présents que l'océan
  if(uSurface>0.5) sz*=tw>0.18?1.2:0.95;
  if(uPulse>0.001 && vr.y>1.35) sz*=mix(1.0,0.7+1.6*pulseGate,uPulse);
  sz*=mix(0.55,1.15,uSolid);
  a*=mix(0.35,1.0,0.45+0.55*uSolid);
  if(uSurface>0.5) a*=smoothstep(-0.05,0.25,front);
  vAlpha=sparkle?mix(0.92,0.92*rimOnly,uRim):a;
  gl_PointSize=max(sz*uPx*uSizeScale*(3.2/-mv.z)*60.0*0.028,1.0);
}`;

const FRAGMENT_SHADER = `
varying vec3 vColor;varying float vAlpha;
void main(){
  float d=length(gl_PointCoord-vec2(0.5))*2.0;
  if(d>1.0)discard;
  float f=1.0-d;
  float core=pow(f,7.5);
  float halo=pow(f,2.2)*0.18;
  gl_FragColor=vec4(vColor,(core+halo)*vAlpha);
}`;


/** Maillage lat/lon — identique à JarvisOrb. */
/**
 * Géométrie du voyage.
 *
 * `position` n'est plus la source des formes — il n'est là que parce que
 * three.js exige l'attribut pour calculer une bounding sphere. Les positions
 * réelles arrivent par `aFrom` / `aTo`, échangés à chaque changement d'acte.
 */
function buildGeometry(count: number, first: Figure): THREE.BufferGeometry {
  const rnds = new Float32Array(count);
  for (let i = 0; i < count; i++) rnds[i] = Math.random();

  // ⚠ Chacun son tableau. Partager le même Float32Array entre `aFrom` et
  // `aTo` ferait qu'écrire dans l'un écrase l'autre — les deux figures
  // deviendraient identiques et le morph n'aurait plus rien à interpoler.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(first.pos.slice(), 3));
  geo.setAttribute('aFrom', new THREE.BufferAttribute(first.pos.slice(), 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute(first.pos.slice(), 3));
  // Caractère du point : taille, éclat, température. Morphé comme la
  // position, sinon la couleur sauterait d'un acte à l'autre.
  geo.setAttribute('aVarFrom', new THREE.BufferAttribute(first.var.slice(), 3));
  geo.setAttribute('aVarTo', new THREE.BufferAttribute(first.var.slice(), 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnds, 1));
  // Le frustum culling se baserait sur `position`, qui ne bouge jamais alors
  // que les figures, elles, s'étendent bien au-delà. On le coupe.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  return geo;
}

function smoothstep01(t: number): number {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

/**
 * Poussière → forme solide → désintégration → suivante.
 * Exit = dust only + morph sous poussière (pas de reforme = pas de double).
 */
const COALESCE = 0.18;
const HOLD_END = 0.58;
const DUST_FRAC = 0.55;

function actAt(progress: number): {
  k: number;
  mix: number;
  scatter: number;
  solid: number;
} {
  const p = clamp(progress);
  const last = ACTS.length - 1;
  for (let idx = 0; idx < ACTS.length; idx++) {
    const act = ACTS[idx];
    if (p <= act.to || idx === last) {
      const raw = (p - act.from) / Math.max(act.to - act.from, 1e-6);
      const r = clamp(raw);

      if (idx === last) {
        const t = smoothstep01(r / COALESCE);
        return { k: last, mix: 0, scatter: 1 - t, solid: t };
      }
      if (r < COALESCE) {
        const t = smoothstep01(r / COALESCE);
        return { k: idx, mix: 0, scatter: 1 - t, solid: t };
      }
      if (r < HOLD_END) {
        return { k: idx, mix: 0, scatter: 0, solid: 1 };
      }
      const t = smoothstep01((r - HOLD_END) / (1 - HOLD_END));
      if (t < DUST_FRAC) {
        const s = smoothstep01(t / DUST_FRAC);
        return { k: idx, mix: 0, scatter: s, solid: 1 - s };
      }
      const u = smoothstep01((t - DUST_FRAC) / (1 - DUST_FRAC));
      return { k: idx, mix: u, scatter: 1, solid: 0 };
    }
  }
  return { k: last, mix: 0, scatter: 0, solid: 1 };
}

export const OrbVoyage = ({ progress, outro = 0 }: OrbVoyageProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const outroRef = useRef(outro);
  outroRef.current = outro;

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    cloud: THREE.Points;
    mat: THREE.ShaderMaterial;
    uniforms: Record<string, { value: unknown }>;
    resize: () => void;
    geo: THREE.BufferGeometry;
    figures: Record<FigureId, Figure>;
    composer: EffectComposer;
    bloom: UnrealBloomPass;
  } | null>(null);
  const clock = useRef({ t: 0, noiseT: 0 });
  /** Paire de figures actuellement chargée dans les attributs. */
  const loaded = useRef<[number, number]>([-1, -1]);

  useEffect(() => {
    const mount = hostRef.current;
    if (!mount) return;

    // Densité relevée : en plein écran, le maillage de l'orbe (calibré pour
    // ~400 px) laisse voir les trous entre les points et les figures perdent
    // leur silhouette.
    // Points petits ⇒ il en faut beaucoup : ce sont eux qui se lisent comme
    // des fils continus une fois alignés sur la grille méridiens/parallèles.
    // Nombre de points — le même pour les six figures, puisqu'un point garde
    // son indice d'une figure à l'autre.
    const count = scaleForTier({ low: 45_000, medium: 90_000, high: 150_000 });
    CURL_BASE = scaleForTier({ low: 0, medium: 0.012, high: 0.018 });
    const figures = buildAllFigures(count);

    // Le pixel ratio du profil machine plafonne à 1 en palier bas — pensé
    // pour des panneaux de HUD qui tournent en continu. La cinématique, elle,
    // ne dure que quelques secondes et occupe tout l'écran : c'est le seul
    // moment où l'on peut payer le vrai DPR, et sans lui tout est crénelé.
    const px = Math.min(window.devicePixelRatio || 1, 2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    // ⚠ Fond OPAQUE, et c'est indispensable avec le composer.
    //
    // Avec un alpha à 0, la chaîne de post-traitement produisait une image
    // entièrement transparente : on ne voyait que le fond du div derrière,
    // donc un écran vide alors que la scène tournait normalement. Le
    // composite final du bloom ne reconstruit pas l'alpha de la scène.
    //
    // Ce n'est pas une perte : la scène occupe tout l'écran et le raccord
    // fait disparaître le conteneur entier, opacité comprise.
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(px);
    // Le canvas doit remplir le conteneur EN CSS, pas seulement en tampon de
    // rendu. Sans ces deux lignes il garde sa taille par défaut (300x150) et,
    // en élément `block`, se cale à gauche : la scène part sur le côté.
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const uniforms: Record<string, { value: unknown }> = {
      uNoiseT: { value: 0 },
      uEnv: { value: 0 },
      uWDir: {
        value: [
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 1),
        ],
      },
      uWPos: { value: [99, 99, 99] },
      uWStr: { value: [0, 0, 0] },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uOverall: { value: 0 },
      uPx: { value: px },
      uSizeScale: { value: 1 },
      uRim: { value: ACT_RIM.galaxies },
      uSurface: { value: ACT_SURFACE.galaxies },
      uMix: { value: 0 },
      uCurl: { value: 0 },
      uCurlT: { value: 0 },
      uSpin: { value: 0 },
      uQuant: { value: 0 },
      uFlow: { value: 0 },
      uSea: { value: 0 },
      uScatter: { value: 1 },
      uSolid: { value: 0 },
      uPalLo: { value: new THREE.Vector3(...ACT_PAL_LO.galaxies) },
      uPalHi: { value: new THREE.Vector3(...ACT_PAL_HI.galaxies) },
      uPalAmt: { value: ACT_PAL_AMT.galaxies },
      uPulse: { value: 0 },
      uTime: { value: 0 },
      uTint: { value: new THREE.Vector3(...ACT_TINT.galaxies) },
    };

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: uniforms as unknown as { [k: string]: THREE.IUniform },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    const geo = buildGeometry(count, figures.galaxies);
    const cloud = new THREE.Points(geo, mat);
    cloud.rotation.x = ACT_TILT.galaxies;
    cloud.rotation.z = ACT_ROLL.galaxies;
    cloud.frustumCulled = false;
    scene.add(cloud);

    /**
     * Bloom — ce qui fait qu'une particule ÉMET de la lumière.
     *
     * Sans lui, un nuage de points additifs reste plat et granuleux : chaque
     * point est un pixel coloré, sans halo, et l'ensemble se lit comme du
     * bruit. Le bloom isole les zones les plus lumineuses, les floute sur
     * cinq niveaux et les rajoute par-dessus — les crêtes chaudes débordent
     * alors sur leurs voisines et la matière devient incandescente.
     *
     * `UnrealBloomPass` de three.js, donc rien à installer.
     *
     * Seuil BAS (0.12) volontairement : la matière est sombre, un seuil
     * standard (0.8) ne trouverait presque rien à faire briller.
     */
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(px);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.38,
      0.32,
      0.48,
    );
    composer.addPass(bloom);
    // Conversion d'espace colorimétrique en sortie — sans elle les couleurs
    // sortent délavées, three.js travaillant en linéaire dans le composer.
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // La distance caméra est pilotée par acte, dans la boucle de rendu.

      // Taille des points.
      //
      // ⚠ Piège : faire grossir les points proportionnellement à la hauteur
      // (h/420) les portait à 5-6 px en plein écran — d'où un rendu en
      // confettis au lieu de filaments. Un point doit rester PETIT en valeur
      // absolue (~1-3 px) quelle que soit la surface ; c'est la densité qui
      // remplit l'image, pas la taille. On corrige donc à peine, pour ne pas
      // disparaître sur un très grand écran.
      uniforms.uSizeScale.value = Math.min(1.25, Math.max(0.75, h / 900));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    sceneRef.current = { scene, camera, renderer, cloud, mat, uniforms, resize, geo, figures, composer, bloom };

    return () => {
      ro.disconnect();
      composer.dispose();
      cloud.geometry.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTicker((_time, delta) => {
    const s = sceneRef.current;
    if (!s) return;

    const reduced = getDeviceProfile().reducedMotion;
    const dt = reduced ? 0 : delta * 0.001;
    clock.current.t += dt;
    const t = clock.current.t;

    const p = clamp(progressRef.current);
    const { k, mix, scatter, solid } = actAt(p);
    const k2 = Math.min(k + 1, ACT_IDS.length - 1);

    // Énergie = désintégration / condensation (scatter), pas un morph mou.
    const surge = Math.max(scatter, Math.sin(Math.PI * mix) * 0.65);
    const breath = 0.045 * (0.5 + 0.5 * Math.sin(t * 0.85));
    const env = 0.085 + 0.5 * surge + breath;
    clock.current.noiseT += dt * (0.05 + env * 1.2);

    const u = s.uniforms;
    if (loaded.current[0] !== k || loaded.current[1] !== k2) {
      loaded.current = [k, k2];
      const from = s.figures[ACT_IDS[k] as FigureId];
      const to = s.figures[ACT_IDS[k2] as FigureId];
      for (const [name, src] of [
        ['aFrom', from.pos], ['aTo', to.pos],
        ['aVarFrom', from.var], ['aVarTo', to.var],
      ] as const) {
        (s.geo.getAttribute(name) as THREE.BufferAttribute).array.set(src);
        s.geo.getAttribute(name).needsUpdate = true;
      }
    }

    u.uMix.value = mix;
    u.uScatter.value = scatter;
    u.uSolid.value = solid;
    u.uNoiseT.value = clock.current.noiseT;
    u.uEnv.value = env;
    const toTunnel = ACT_IDS[k] === 'galaxies' && ACT_IDS[k2] === 'voyage';
    const seaAmt = lerp(ACT_SEA[ACT_IDS[k]], ACT_SEA[ACT_IDS[k2]], mix) * solid;
    const surfAmt = lerp(ACT_SURFACE[ACT_IDS[k]], ACT_SURFACE[ACT_IDS[k2]], mix);
    const curlMul =
      seaAmt > 0.05 || surfAmt > 0.5
        ? 0.05
        : scatter > 0.2
          ? 1.8 + surge * 2.0
          : 1 + surge * (toTunnel ? 4.5 : 2.8);
    u.uCurl.value = CURL_BASE * curlMul;
    u.uBass.value = 0.12 + surge * (toTunnel ? 0.55 : 0.4);
    u.uMid.value = 0.1 + surge * (toTunnel ? 0.45 : 0.35);
    u.uTreble.value = 0.08 + surge * (toTunnel ? 0.4 : 0.3);
    u.uOverall.value = env;

    u.uRim.value = lerp(ACT_RIM[ACT_IDS[k]], ACT_RIM[ACT_IDS[k2]], mix);
    u.uSurface.value = lerp(ACT_SURFACE[ACT_IDS[k]], ACT_SURFACE[ACT_IDS[k2]], mix);

    u.uCurlT.value = t * 0.25;
    u.uTime.value = t;
    u.uSpin.value = lerp(ACT_SPIN[ACT_IDS[k]], ACT_SPIN[ACT_IDS[k2]], mix) * solid;
    u.uQuant.value = mix < 0.5 ? ACT_SPIN_QUANT[ACT_IDS[k]] : ACT_SPIN_QUANT[ACT_IDS[k2]];
    let flow = lerp(ACT_FLOW[ACT_IDS[k]], ACT_FLOW[ACT_IDS[k2]], mix);
    if (toTunnel) flow = Math.max(flow, mix * 1.4);
    u.uFlow.value = flow;
    u.uSea.value = seaAmt;
    u.uPulse.value = lerp(ACT_PULSE[ACT_IDS[k]], ACT_PULSE[ACT_IDS[k2]], mix) * solid;

    const ta = ACT_TINT[ACT_IDS[k]];
    const tb = ACT_TINT[ACT_IDS[k2]];
    (u.uTint.value as THREE.Vector3).set(
      lerp(ta[0], tb[0], mix),
      lerp(ta[1], tb[1], mix),
      lerp(ta[2], tb[2], mix),
    );

    const palFrom = ACT_IDS[k];
    const palTo = ACT_IDS[k2];
    const pla = ACT_PAL_LO[palFrom];
    const plb = ACT_PAL_LO[palTo];
    const pha = ACT_PAL_HI[palFrom];
    const phb = ACT_PAL_HI[palTo];
    (u.uPalLo.value as THREE.Vector3).set(
      lerp(pla[0], plb[0], mix),
      lerp(pla[1], plb[1], mix),
      lerp(pla[2], plb[2], mix),
    );
    (u.uPalHi.value as THREE.Vector3).set(
      lerp(pha[0], phb[0], mix),
      lerp(pha[1], phb[1], mix),
      lerp(pha[2], phb[2], mix),
    );
    u.uPalAmt.value = lerp(ACT_PAL_AMT[palFrom], ACT_PAL_AMT[palTo], mix);

    let fit = lerp(ACT_FIT[ACT_IDS[k]], ACT_FIT[ACT_IDS[k2]], mix);
    let shift = lerp(ACT_SHIFT[ACT_IDS[k]], ACT_SHIFT[ACT_IDS[k2]], mix);

    const out = clamp(outroRef.current);
    if (out > 0) {
      // Recul droit : caméra tire + scale. PAS de déplacement vertical.
      const e = out * out * (3 - 2 * out);
      const pull = e * e;
      fit = lerp(fit, RECEDE_FIT, pull);
      const sc = lerp(1, RECEDE_SCALE, pull);
      s.cloud.scale.setScalar(sc);
    } else {
      s.cloud.scale.setScalar(1);
    }

    const fov = lerp(ACT_FOV[ACT_IDS[k]], ACT_FOV[ACT_IDS[k2]], mix);
    if (Math.abs(s.camera.fov - fov) > 0.05) {
      s.camera.fov = fov;
      s.camera.updateProjectionMatrix();
    }
    const halfV = THREE.MathUtils.degToRad(s.camera.fov) / 2;
    s.camera.position.z = fit / (Math.tan(halfV) * Math.min(1, s.camera.aspect));
    s.camera.position.y = shift;
    s.camera.position.x = 0;

    // Terre / cerveau / ADN / vague : yaw figé (Afrique face caméra).
    const id = ACT_IDS[k];
    if (id === 'terre') {
      s.cloud.rotation.y = 0;
    } else if (id === 'vague' || id === 'cerveau' || id === 'adn') {
      // ne pas accumuler
    } else {
      const spinY = id === 'neurones' ? 0.02 : 0.035;
      s.cloud.rotation.y += dt * spinY * solid;
    }
    s.cloud.rotation.x = lerp(ACT_TILT[ACT_IDS[k]], ACT_TILT[ACT_IDS[k2]], mix);
    s.cloud.rotation.z = lerp(ACT_ROLL[ACT_IDS[k]], ACT_ROLL[ACT_IDS[k2]], mix);

    const isTerre = ACT_IDS[k] === 'terre' || ACT_IDS[k2] === 'terre';
    const isOrbe = ACT_IDS[k] === 'orbe' || ACT_IDS[k2] === 'orbe';
    let bloom =
      isTerre
        ? 0.06 + surge * 0.04
        : isOrbe
          ? 0.22 + solid * 0.08 + surge * 0.12 // discret — pas Storm
          : 0.28 + solid * 0.12 + surge * 0.28 + seaAmt * 0.22;
    if (out > 0) bloom *= 1 - out * 0.85;
    s.bloom.strength = bloom;

    s.composer.render();
  });

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', display: 'block', transform: 'translateZ(0)' }}
      aria-hidden
    />
  );
};
