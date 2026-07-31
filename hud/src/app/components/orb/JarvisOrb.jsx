import React, { useRef, useEffect } from "react";
import * as THREE from "three";

/**
 * OrbView — l'orbe seule, fond TRANSPARENT, sans audio intégré.
 * À brancher sur le système son de ton HUD.
 *
 * Usage :
 *   // dans ton HUD, sur ta chaîne audio existante (TTS, micro, mix...) :
 *   const analyser = audioCtx.createAnalyser();
 *   analyser.fftSize = 256;
 *   analyser.smoothingTimeConstant = 0.75;
 *   taSourceAudio.connect(analyser);   // n'altère pas ton signal
 *
 *   <div style={{ width: 400, height: 400 }}>
 *     <OrbView analyser={analyser} tempo={0.5} />
 *   </div>
 *
 * Props :
 *  - analyser : AnalyserNode | null — si null, l'orbe respire au repos.
 *  - tempo : number (0.2–1.5, défaut 0.5) — vitesse générale.
 *  - sensitivity : number (défaut 1) — multiplie la réaction au son.
 *
 * L'orbe remplit son conteneur parent. Fond transparent (alpha),
 * donc elle se pose sur n'importe quel fond de HUD.
 */

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
`;

const VERTEX_SHADER = NOISE_GLSL + `
attribute float aRnd;
uniform float uNoiseT,uEnv,uBass,uMid,uTreble,uOverall,uPx;
uniform vec3 uWDir[3];
uniform float uWPos[3];
uniform float uWStr[3];
varying vec3 vColor;varying float vAlpha;

vec3 stopMix(float d){
  vec3 c0=vec3(0.62,0.90,1.00);
  vec3 c1=vec3(0.42,0.48,0.95);
  vec3 c2=vec3(0.55,0.38,0.90);
  vec3 c3=vec3(0.82,0.36,0.75);
  vec3 c4=vec3(0.93,0.34,0.55);
  vec3 c5=vec3(0.95,0.32,0.38);
  vec3 c6=vec3(1.00,0.62,0.24);
  float s=d*6.0;
  if(s<1.0)return mix(c0,c1,s);
  if(s<2.0)return mix(c1,c2,s-1.0);
  if(s<3.0)return mix(c2,c3,s-2.0);
  if(s<4.0)return mix(c3,c4,s-3.0);
  if(s<5.0)return mix(c4,c5,s-4.0);
  return mix(c5,c6,s-5.0);
}

void main(){
  vec3 p=normalize(position);
  vec4 mv0=modelViewMatrix*vec4(p,1.0);
  vec3 N=normalize(normalMatrix*p);
  vec3 V=normalize(-mv0.xyz);
  float facing=abs(dot(N,V));
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

  float ampSurf=(0.012+uEnv*0.055)+uBass*0.02;
  float ampEdge=edge*(0.02+uEnv*0.10+uTreble*0.16);
  float disp=n*(ampSurf+ampEdge)+wSum;

  vec3 scat=vec3(
    snoise(p*3.7+vec3(7.1+uNoiseT*0.5)),
    snoise(p*3.7+vec3(13.7-uNoiseT*0.4)),
    snoise(p*3.7+vec3(29.3+uNoiseT*0.6)))*edge*(0.012+band*0.10)*aRnd;
  vec3 np=p*(1.0+disp)+lateral+scat;

  vec4 mv=modelViewMatrix*vec4(np,1.0);
  gl_Position=projectionMatrix*mv;

  float hueJit=(aRnd-0.5)*0.06;
  vec3 grad=stopMix(clamp(dTop+hueJit,0.0,1.0));

  float crease=smoothstep(-1.3,0.5,n);
  float waveLight=wLight*(9.0+uTreble*12.0);
  float centerBlue=(1.0-radial)*(1.0-dTop*0.6);
  vec3 col=mix(grad,vec3(0.28,0.42,0.85),centerBlue*0.55);

  float lum=(0.24+0.38*crease+waveLight*0.55)*(0.8+aRnd*0.4);
  lum=mix(lum,1.15+n*0.25+waveLight*0.25,smoothstep(0.12,0.7,edge));
  vColor=col*lum;

  bool sparkle=aRnd>0.9935;
  if(sparkle){vColor=vec3(0.95,0.97,1.0);}
  float e2=smoothstep(0.12,0.7,edge);
  vAlpha=sparkle?0.95:clamp(0.28+crease*0.30+waveLight*0.22+e2*0.45+band*0.08,0.0,1.0);

  float sz=(0.46+crease*0.12+waveLight*0.16+e2*(0.85+band*0.75))*(0.75+aRnd*0.5)*(sparkle?1.7:1.0);
  gl_PointSize=max(sz*uPx*(3.2/-mv.z)*60.0*0.028,1.0);
}`;

const FRAGMENT_SHADER = `
varying vec3 vColor;varying float vAlpha;
void main(){
  vec2 uv=gl_PointCoord-0.5;
  float d=length(uv);
  if(d>0.5)discard;
  float a=smoothstep(0.5,0.26,d)*vAlpha;
  gl_FragColor=vec4(vColor,a);
}`;

function buildGeometry(latSteps, lonSteps) {
  const positions = [];
  const rnds = [];
  for (let i = 1; i < latSteps - 1; i++) {
    const theta = (i / (latSteps - 1)) * Math.PI;
    const y = Math.cos(theta);
    const ringR = Math.sin(theta);
    const steps = Math.max(8, Math.round(lonSteps * ringR));
    for (let j = 0; j < steps; j++) {
      const phi = (j / steps) * Math.PI * 2;
      positions.push(Math.cos(phi) * ringR, y, Math.sin(phi) * ringR);
      rnds.push(Math.random());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aRnd", new THREE.Float32BufferAttribute(rnds, 1));
  return geo;
}

export default function OrbView({
  analyser = null,
  tempo = 0.5,
  sensitivity = 1,
  size = null, // ex: 400 -> force 400x400 px; sinon remplit le parent
  background = "#060b18", // couleur CSS ("#060b18", "black"...) ou "transparent"
}) {
  const mountRef = useRef(null);
  const paramsRef = useRef({ analyser, tempo, sensitivity, background });
  paramsRef.current.analyser = analyser;
  paramsRef.current.tempo = tempo;
  paramsRef.current.sensitivity = sensitivity;
  paramsRef.current.background = background;

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    const bg = paramsRef.current.background;
    if (bg === "transparent") {
      renderer.setClearColor(0x000000, 0);
    } else {
      renderer.setClearColor(new THREE.Color(bg), 1);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 3.6);

    const uniforms = {
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
      uPx: { value: Math.min(window.devicePixelRatio, 2) },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    const cloud = new THREE.Points(buildGeometry(230, 380), mat);
    cloud.rotation.x = 0.32;
    scene.add(cloud);

    const L = { bass: 0, mid: 0, treble: 0, overall: 0, env: 0, raw: 0, rawPrev: 0 };
    let data = null;
    let t = 0, noiseT = 0;

    function smooth(cur, target) {
      // attaque rapide (la voix frappe), retombée lente (ça respire)
      const k = target > cur ? 0.5 : 0.07;
      return cur + (target - cur) * k;
    }

    function resize() {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // recule la caméra pour que la sphère + éclats de bord (rayon ~1.6
      // quand l'audio pousse fort) tiennent entiers, même conteneur étroit
      const halfV = THREE.MathUtils.degToRad(camera.fov) / 2;
      camera.position.z = 1.6 / (Math.tan(halfV) * Math.min(1, camera.aspect));
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    function readLevels() {
      const P = paramsRef.current;
      const an = P.analyser;
      L.rawPrev = L.raw;
      if (an) {
        if (!data || data.length !== an.frequencyBinCount)
          data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
        const n = data.length;
        const bE = Math.floor(n * 0.12), mE = Math.floor(n * 0.5);
        let b = 0, m = 0, tr = 0;
        for (let i = 0; i < bE; i++) b += data[i];
        for (let i = bE; i < mE; i++) m += data[i];
        for (let i = mE; i < n; i++) tr += data[i];
        const s = P.sensitivity;
        b = Math.min(1, (b / bE / 255) * 1.6 * s);
        m = Math.min(1, (m / (mE - bE) / 255) * 1.8 * s);
        tr = Math.min(1, (tr / (n - mE) / 255) * 2.2 * s);
        L.bass = smooth(L.bass, b);
        L.mid = smooth(L.mid, m);
        L.treble = smooth(L.treble, tr);
        L.raw = b * 0.5 + m * 0.35 + tr * 0.15;
        L.env = smooth(L.env, L.raw);
      } else {
        // sans analyser : quasi immobile, micro-respiration seulement
        L.bass = smooth(L.bass, 0.02);
        L.mid = smooth(L.mid, 0.02);
        L.treble = smooth(L.treble, 0.015);
        L.raw = 0.02;
        L.env = smooth(L.env, 0.02 + Math.max(0, Math.sin(t * 0.3)) * 0.015);
      }
      L.overall = L.env;
    }

    let raf;
    // pool de 3 vagues déclenchées par la voix
    const waves = [
      { pos: 99, str: 0, active: false },
      { pos: 99, str: 0, active: false },
      { pos: 99, str: 0, active: false },
    ];
    let onsetCooldown = 0;

    function spawnWave(strength) {
      let slot = waves.find((w) => !w.active);
      if (!slot) {
        slot = waves.reduce((a, b) => (a.str < b.str ? a : b));
      }
      slot.active = true;
      slot.pos = -1.3;
      slot.str = strength;
      const i = waves.indexOf(slot);
      const th = Math.random() * Math.PI * 2;
      const z = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - z * z);
      uniforms.uWDir.value[i].set(Math.cos(th) * r, z, Math.sin(th) * r);
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      const dt = 0.016;
      const P = paramsRef.current;
      t += dt;
      readLevels();

      // la texture n'avance qu'avec la voix : silence = surface figée
      noiseT += dt * (0.02 + L.env * 1.1) * P.tempo;

      // détection d'attaque : montée brutale de l'enveloppe = syllabe
      onsetCooldown -= dt;
      const jump = L.raw - L.rawPrev;
      if (jump > 0.055 && onsetCooldown <= 0 && L.raw > 0.08) {
        spawnWave(0.02 + L.raw * 0.09 + L.treble * 0.05);
        onsetCooldown = 0.10;
      }

      // faire voyager les vagues actives ; elles s'éteignent en sortant
      for (let i = 0; i < 3; i++) {
        const w = waves[i];
        if (w.active) {
          w.pos += dt * (1.6 + L.env * 1.2);
          w.str *= 0.992;
          if (w.pos > 1.35 || w.str < 0.002) {
            w.active = false;
            w.pos = 99;
            w.str = 0;
          }
        }
        uniforms.uWPos.value[i] = w.pos;
        uniforms.uWStr.value[i] = w.str;
      }

      uniforms.uEnv.value = L.env;
      uniforms.uNoiseT.value = noiseT;
      uniforms.uBass.value = L.bass;
      uniforms.uMid.value = L.mid;
      uniforms.uTreble.value = L.treble;
      uniforms.uOverall.value = L.overall;
      // rotation : quasi nulle au silence, portée par la voix
      cloud.rotation.y += (0.0003 + L.env * 0.004) * P.tempo;
      // les graves gonflent légèrement le corps entier
      const sc = 1 + L.bass * 0.045;
      cloud.scale.set(sc, sc, sc);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      mat.dispose();
      cloud.geometry.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={
        size
          ? {
              width: size,
              height: size,
              background: background,
              position: "relative",
              zIndex: 10,
            }
          : {
              width: "100%",
              height: "100%",
              minWidth: 120,
              minHeight: 120,
              aspectRatio: "1 / 1",
              background: background,
              position: "relative",
              zIndex: 10,
            }
      }
    />
  );
}
