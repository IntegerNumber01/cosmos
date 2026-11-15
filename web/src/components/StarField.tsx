"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { GaiaData, bpRpToRGB, dirFromRaDec, eqToScene, loadGaia, starInfo, StarInfo } from "@/lib/gaia";

export type StarFieldHandle = {
  flyToStar: (i: number) => void;
  home: () => void;
};

type Props = {
  mode: "fly" | "ambient";
  lookRa?: number;
  lookDec?: number;
  selected?: number | null;
  onSelect?: (s: StarInfo | null) => void;
  onCamera?: (c: { distPc: number; speed: number }) => void;
  onReady?: (g: GaiaData) => void;
  showLabels?: boolean;
  skyStrength?: number;
};

const VERT = /* glsl */ `
  attribute float absMag;
  attribute vec3 starColor;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uMagRef;
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(length(mv.xyz), 0.0005);
    // apparent magnitude as seen from the camera, using the MEASURED distance geometry
    float m = absMag + 5.0 * (log(d) / log(10.0)) - 5.0;
    float flux = pow(10.0, -0.4 * (m - uMagRef));
    float size = clamp(uScale * pow(flux, 0.32), 1.2, 64.0);
    vBright = clamp(pow(flux, 0.5), 0.06, 1.0);
    vColor = starColor;
    gl_PointSize = size * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vBright;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r2 = dot(p, p) * 4.0;
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 14.0);
    float halo = exp(-r2 * 3.5) * 0.28;
    vec3 c = mix(vColor, vec3(1.0), core * 0.6);
    gl_FragColor = vec4(c * (core + halo) * vBright, 1.0);
  }
`;

function Stars({ g }: { g: GaiaData }) {
  const { gl } = useThree();
  const geom = useMemo(() => {
    const n = g.meta.n;
    const s = g.meta.stride;
    const pos = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = eqToScene(g.f[i * s], g.f[i * s + 1], g.f[i * s + 2]);
      pos.set([x, y, z], i * 3);
      mag[i] = g.f[i * s + 3];
      col.set(bpRpToRGB(g.f[i * s + 5]), i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("absMag", new THREE.BufferAttribute(mag, 1));
    geo.setAttribute("starColor", new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [g]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) },
          uScale: { value: 5.5 },
          uMagRef: { value: 6.5 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [gl],
  );
  return <points geometry={geom} material={mat} frustumCulled={false} />;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uStrength;
  varying vec3 vDir;
  void main() {
    // scene (X,Y,Z) = ICRS (x, z, -y)  ->  RA/Dec
    vec3 d = normalize(vDir);
    float xe = d.x, ye = -d.z, ze = d.y;
    float ra = atan(ye, xe);
    if (ra < 0.0) ra += 6.28318530718;
    float dec = asin(clamp(ze, -1.0, 1.0));
    vec2 uv = vec2(ra / 6.28318530718, 0.5 + dec / 3.14159265359);
    float t = texture2D(uTex, uv).r;
    t = smoothstep(0.08, 0.95, t);
    vec3 c = mix(vec3(0.05, 0.02, 0.12), vec3(0.62, 0.18, 0.55), smoothstep(0.0, 0.5, t));
    c = mix(c, vec3(1.0, 0.62, 0.35), smoothstep(0.45, 1.0, t));
    gl_FragColor = vec4(c * t * uStrength, 1.0);
  }
`;

/** SPHEREx all-sky (2.24 µm) projected at infinity: orientation context only, carries no depth. */
function SkyBackdrop({ strength }: { strength: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const tex = new THREE.TextureLoader().load("/img/sky-equirect-47.webp");
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    return new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTex: { value: tex }, uStrength: { value: strength } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    mat.uniforms.uStrength.value = strength;
  }, [strength, mat]);
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[20000, 64, 32]} />
    </mesh>
  );
}

function Sun() {
  return (
    <mesh>
      <sphereGeometry args={[0.012, 16, 16]} />
      <meshBasicMaterial color="#fff3c4" />
    </mesh>
  );
}

type Rig = {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  speed: number; // pc / s
  tween: null | { from: THREE.Vector3; to: THREE.Vector3; fromQ: THREE.Quaternion; toQ: THREE.Quaternion; t0: number; dur: number };
};

function CameraRig({
  rig,
  mode,
  onCamera,
  reducedMotion,
}: {
  rig: React.MutableRefObject<Rig>;
  mode: "fly" | "ambient";
  onCamera?: Props["onCamera"];
  reducedMotion: boolean;
}) {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const drag = useRef<{ x: number; y: number } | null>(null);
  const lastEmit = useRef(0);

  useEffect(() => {
    if (mode !== "fly") return;
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      rig.current.tween = null;
      rig.current.yaw -= dx * 0.0032;
      rig.current.pitch = Math.max(-1.5, Math.min(1.5, rig.current.pitch - dy * 0.0032));
    };
    const up = () => (drag.current = null);
    const wheel = (e: WheelEvent) => {
      rig.current.speed = Math.max(0.02, Math.min(400, rig.current.speed * (e.deltaY > 0 ? 0.85 : 1.18)));
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const ku = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [gl, mode, rig]);

  useFrame((state, dt) => {
    const r = rig.current;
    const now = state.clock.elapsedTime;
    if (mode === "ambient") {
      // slow cinematic drift through the solar neighbourhood (frozen if the user prefers reduced motion)
      const t = (reducedMotion ? 2 : now) * 0.04;
      r.pos.set(Math.sin(t) * 6, Math.sin(t * 0.7) * 2.2, Math.cos(t) * 6);
      camera.position.copy(r.pos);
      camera.lookAt(Math.sin(t + 0.9) * 30, 0, Math.cos(t + 0.9) * 30);
      return;
    }
    if (r.tween) {
      const k = Math.min(1, (now - r.tween.t0) / r.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      r.pos.lerpVectors(r.tween.from, r.tween.to, e);
      camera.position.copy(r.pos);
      camera.quaternion.slerpQuaternions(r.tween.fromQ, r.tween.toQ, Math.min(1, e * 1.6));
      if (k >= 1) {
        const eu = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        r.yaw = eu.y;
        r.pitch = eu.x;
        r.tween = null;
      }
    } else {
      camera.quaternion.setFromEuler(new THREE.Euler(r.pitch, r.yaw, 0, "YXZ"));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const k = keys.current;
      const v = new THREE.Vector3();
      if (k["w"] || k["arrowup"]) v.add(fwd);
      if (k["s"] || k["arrowdown"]) v.sub(fwd);
      if (k["d"] || k["arrowright"]) v.add(right);
      if (k["a"] || k["arrowleft"]) v.sub(right);
      if (k["e"]) v.add(up);
      if (k["q"]) v.sub(up);
      if (v.lengthSq() > 0) r.pos.addScaledVector(v.normalize(), r.speed * Math.min(dt, 0.05) * (k["shift"] ? 4 : 1));
      camera.position.copy(r.pos);
    }
    if (onCamera && now - lastEmit.current > 0.15) {
      lastEmit.current = now;
      onCamera({ distPc: r.pos.length(), speed: r.speed });
    }
  });
  return null;
}

function Picker({ g, onPick, enabled }: { g: GaiaData; onPick: (i: number | null) => void; enabled: boolean }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;
    let downAt: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const up = (e: PointerEvent) => {
      if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const n = g.meta.n;
      const s = g.meta.stride;
      const v = new THREE.Vector3();
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < n; i++) {
        const [x, y, z] = eqToScene(g.f[i * s], g.f[i * s + 1], g.f[i * s + 2]);
        v.set(x, y, z);
        const dist = v.distanceTo(camera.position);
        v.project(camera);
        if (v.z > 1 || v.z < -1) continue;
        const sx = ((v.x + 1) / 2) * rect.width;
        const sy = ((1 - v.y) / 2) * rect.height;
        const dpx = Math.hypot(sx - mx, sy - my);
        if (dpx > 18) continue;
        const appMag = g.f[i * s + 3] + 5 * Math.log10(Math.max(dist, 0.0005)) - 5;
        const score = dpx + appMag * 1.5; // prefer brighter stars near the cursor
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      onPick(best >= 0 ? best : null);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
    };
  }, [g, camera, gl, onPick, enabled]);
  return null;
}

type SkyLabel = { key: string; pos: [number, number, number]; kind: "sun" | "star" | "selection"; text?: string; selected?: boolean };

/** Keep labels in the page's React tree. Independent Drei HTML roots can race with Canvas
 * teardown during navigation. The scene only updates positions of these existing DOM nodes. */
function ProjectLabels({ items, nodes }: { items: SkyLabel[]; nodes: React.MutableRefObject<Map<string, HTMLDivElement>> }) {
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const item of items) {
      const node = nodes.current.get(item.key);
      if (!node) continue;
      projected.set(...item.pos).project(camera);
      const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.2 && Math.abs(projected.y) <= 1.2 &&
        (item.kind !== "sun" || camera.position.length() > 0.05);
      node.style.display = visible ? "block" : "none";
      if (visible) node.style.transform = `translate3d(${(projected.x + 1) * size.width / 2}px,${(1 - projected.y) * size.height / 2}px,0)`;
    }
  });
  return null;
}

/** When the Sun is off-screen (or behind you), pin a small "Sun this way" chip to the screen edge. */
function SunPointer({ chip, arrow }: { chip: React.RefObject<HTMLButtonElement | null>; arrow: React.RefObject<HTMLSpanElement | null> }) {
  const { size } = useThree();
  const cam = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const node = chip.current;
    if (!node) return;
    cam.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse); // the Sun in camera space
    const inFront = cam.z < 0;
    ndc.set(0, 0, 0).project(camera);
    const onScreen = inFront && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.85;
    if (camera.position.length() < 0.05 || onScreen) {
      node.style.opacity = "0";
      node.style.pointerEvents = "none";
      return;
    }
    // screen-space direction towards the Sun (y down)
    let dx = inFront ? ndc.x * size.width : cam.x;
    let dy = inFront ? -ndc.y * size.height : -cam.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const left = 70, right = size.width - 70, top = 110, bottom = size.height - 170;
    const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
    const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
    const t = Math.max(0, Math.min(tx, ty));
    node.style.opacity = "1";
    node.style.pointerEvents = "auto";
    node.style.transform = `translate(${cx + dx * t}px, ${cy + dy * t}px) translate(-50%, -50%)`;
    if (arrow.current) arrow.current.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  });
  return null;
}

const StarField = forwardRef<StarFieldHandle, Props>(function StarField(
  { mode, lookRa, lookDec, selected = null, onSelect, onCamera, onReady, showLabels = true, skyStrength = 0.55 },
  ref,
) {
  const [g, setG] = useState<GaiaData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const reduced = useReducedMotion();
  const rig = useRef<Rig>({ pos: new THREE.Vector3(0, 0, 0.0001), yaw: 0, pitch: 0, speed: 2, tween: null });
  const clock = useRef<THREE.Clock | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const sunChip = useRef<HTMLButtonElement>(null);
  const sunArrow = useRef<HTMLSpanElement>(null);
  const labelNodes = useRef(new Map<string, HTMLDivElement>());
  const labels = useMemo<SkyLabel[]>(() => {
    if (!g || !showLabels) return [];
    const items: SkyLabel[] = [{ key: "sun", pos: [0, 0, 0], kind: "sun" }];
    for (const label of g.meta.labels) items.push({ key: `star-${label.i}`, pos: starInfo(g, label.i).pos, kind: "star", text: label.name, selected: selected === label.i });
    if (selected !== null) items.push({ key: "selection", pos: starInfo(g, selected).pos, kind: "selection" });
    return items;
  }, [g, showLabels, selected]);

  useEffect(() => {
    let cancelled = false;
    loadGaia()
      .then((d) => {
        if (cancelled) return;
        setG(d);
        onReady?.(d);
      })
      .catch(() => { if (!cancelled) setLoadErr(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // initial look direction (from Explore's view centre, if given)
  useEffect(() => {
    if (lookRa === undefined || lookDec === undefined) return;
    const [dx, dy, dz] = dirFromRaDec(lookRa, lookDec);
    rig.current.yaw = Math.atan2(-dx, -dz);
    rig.current.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  }, [lookRa, lookDec]);

  const startTween = (to: THREE.Vector3, lookAt: THREE.Vector3, dur: number) => {
    const cam = cameraRef.current;
    if (!cam || !clock.current) return;
    const m = new THREE.Matrix4().lookAt(to, lookAt, new THREE.Vector3(0, 1, 0));
    const toQ = new THREE.Quaternion().setFromRotationMatrix(m);
    rig.current.tween = { from: rig.current.pos.clone(), to, fromQ: cam.quaternion.clone(), toQ, t0: clock.current.elapsedTime, dur };
  };

  const goHome = () =>
    startTween(new THREE.Vector3(0, 0, 0.0001), new THREE.Vector3(...dirFromRaDec(266.4, -28.9)).multiplyScalar(10), 3);

  useImperativeHandle(ref, () => ({
    flyToStar(i: number) {
      if (!g) return;
      const s = starInfo(g, i);
      const target = new THREE.Vector3(...s.pos);
      const from = rig.current.pos.clone();
      const dir = target.clone().sub(from);
      const len = dir.length();
      // stop short of the star so it fills the view, but keep the Sun-side context
      const stand = Math.min(Math.max(len * 0.08, 0.15), 3);
      const to = target.clone().sub(dir.normalize().multiplyScalar(stand));
      startTween(to, target, Math.min(6, 2 + Math.log10(1 + len) * 1.6));
    },
    home: goHome,
  }));

  if (loadErr)
    return (
      <div className="grid h-full w-full place-items-center bg-[#020308] text-[13px] text-warn">
        The Gaia star data couldn&apos;t be loaded. Check your connection and reload.
      </div>
    );
  const canvas = (
    <Canvas
      camera={{ fov: 60, near: 0.0005, far: 50000, position: [0, 0, 0.0001] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ camera, clock: c }) => {
        cameraRef.current = camera;
        clock.current = c;
      }}
      style={{ background: "#020308" }}
      dpr={[1, 2]}
    >
      {skyStrength > 0 && <SkyBackdrop strength={skyStrength} />}
      {g && (
        <>
          <Stars g={g} />
          <Sun />
          {showLabels && <ProjectLabels items={labels} nodes={labelNodes} />}
          <Picker g={g} enabled={mode === "fly"} onPick={(i) => onSelect?.(i === null ? null : starInfo(g, i))} />
          {mode === "fly" && showLabels && <SunPointer chip={sunChip} arrow={sunArrow} />}
        </>
      )}
      <CameraRig rig={rig} mode={mode} onCamera={onCamera} reducedMotion={reduced} />
    </Canvas>
  );
  return (
    <div className="relative h-full w-full">
      {canvas}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {labels.map((label) => <div key={label.key} ref={(node) => {
          if (node) labelNodes.current.set(label.key, node); else labelNodes.current.delete(label.key);
        }} className="absolute left-0 top-0" style={{ display: "none" }}>
          {label.kind === "star" && <div className={`translate-x-3 -translate-y-2 whitespace-nowrap text-[11px] ${label.selected ? "text-white" : "text-[#bcd3ff]/80"}`}>{label.text}</div>}
          {label.kind === "selection" && <div className="h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80" />}
          {label.kind === "sun" && <div className="relative -translate-x-1/2 -translate-y-1/2">
            <div className="h-5 w-5 rounded-full border border-[#ffe9a8]/80 shadow-[0_0_12px_rgba(255,233,168,0.45)]" />
            <div className="absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-[#ffe9a8]">☉ Home: Sun &amp; Earth</div>
          </div>}
        </div>)}
      </div>
      {mode === "fly" && <button
        ref={sunChip}
        type="button"
        onClick={goHome}
        title="Fly back home to the Sun"
        className="absolute left-0 top-0 z-20 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#ffe9a8]/40 bg-black/60 px-2.5 py-1 text-[12px] font-semibold text-[#ffe9a8] backdrop-blur transition-colors hover:bg-black/80"
        style={{ opacity: 0, pointerEvents: "none" }}
      >
        <span ref={sunArrow} className="inline-block" aria-hidden>
          →
        </span>
        ☉ Sun &amp; Earth
      </button>}
    </div>
  );
});

export default StarField;
