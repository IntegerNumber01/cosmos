"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
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

function Labels({ g, selected, camPos }: { g: GaiaData; selected: number | null; camPos: React.MutableRefObject<THREE.Vector3> }) {
  const items = useMemo(() => g.meta.labels.map((l) => ({ ...l, info: starInfo(g, l.i) })), [g]);
  return (
    <>
      <SunLabel />
      {items.map((l) => (
        <Html key={l.i} position={l.info.pos} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div
            className={`whitespace-nowrap text-[11px] ${selected === l.i ? "text-white" : "text-[#bcd3ff]/80"}`}
            style={{ transform: "translate(12px,-9px)" }}
          >
            {l.name}
          </div>
        </Html>
      ))}
      {selected !== null && (
        <Html position={starInfo(g, selected).pos} center style={{ pointerEvents: "none" }}>
          <div className="h-7 w-7 rounded-full border border-white/80" />
        </Html>
      )}
      <CamTracker camPos={camPos} />
    </>
  );
}

function SunLabel() {
  const el = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    if (el.current) el.current.style.opacity = camera.position.length() > 0.05 ? "1" : "0";
  });
  return (
    <Html position={[0, 0, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
      <div ref={el} className="whitespace-nowrap text-[11px] font-medium text-[#ffe9a8]" style={{ transform: "translate(14px,-10px)", opacity: 0 }}>
        ☉ Sun
      </div>
    </Html>
  );
}

function CamTracker({ camPos }: { camPos: React.MutableRefObject<THREE.Vector3> }) {
  useFrame(({ camera }) => camPos.current.copy(camera.position));
  return null;
}

const StarField = forwardRef<StarFieldHandle, Props>(function StarField(
  { mode, lookRa, lookDec, selected = null, onSelect, onCamera, onReady, showLabels = true, skyStrength = 0.55 },
  ref,
) {
  const [g, setG] = useState<GaiaData | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const reduced = useReducedMotion();
  const camPos = useRef(new THREE.Vector3());
  const rig = useRef<Rig>({ pos: new THREE.Vector3(0, 0, 0.0001), yaw: 0, pitch: 0, speed: 2, tween: null });
  const clock = useRef<THREE.Clock | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);

  useEffect(() => {
    loadGaia()
      .then((d) => {
        setG(d);
        onReady?.(d);
      })
      .catch(() => setLoadErr(true));
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
    home() {
      startTween(new THREE.Vector3(0, 0, 0.0001), new THREE.Vector3(...dirFromRaDec(266.4, -28.9)).multiplyScalar(10), 3);
    },
  }));

  if (loadErr)
    return (
      <div className="grid h-full w-full place-items-center bg-[#020308] text-[13px] text-warn">
        The Gaia star data couldn&apos;t be loaded. Check your connection and reload.
      </div>
    );
  return (
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
          {showLabels && <Labels g={g} selected={selected} camPos={camPos} />}
          <Picker g={g} enabled={mode === "fly"} onPick={(i) => onSelect?.(i === null ? null : starInfo(g, i))} />
        </>
      )}
      <CameraRig rig={rig} mode={mode} onCamera={onCamera} reducedMotion={reduced} />
    </Canvas>
  );
});

export default StarField;
