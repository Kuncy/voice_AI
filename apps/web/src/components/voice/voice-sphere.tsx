"use client";

import { useEffect, useRef } from "react";
import type { AudioLevelRef } from "@/lib/voice/audio-level";
import type { VoiceState } from "@/lib/voice/transport";

type Color = [number, number, number];
type SpherePalette = {
  c1: Color;
  c2: Color;
  c3: Color;
  rim: Color;
  glow: number;
  amp: number;
  rot: number;
  swirl: number;
  breathe: number;
  ring: number;
  parts: number;
};

const palettes: Record<VoiceState, SpherePalette> = {
  idle: {
    c1: [214, 205, 255],
    c2: [113, 55, 255],
    c3: [37, 99, 255],
    rim: [150, 130, 255],
    glow: 0.5,
    amp: 0.35,
    rot: 0.1,
    swirl: 0.35,
    breathe: 0.03,
    ring: 0.3,
    parts: 0.35,
  },
  connecting: {
    c1: [214, 214, 255],
    c2: [90, 70, 220],
    c3: [37, 99, 255],
    rim: [140, 140, 255],
    glow: 0.55,
    amp: 0.45,
    rot: 0.55,
    swirl: 0.55,
    breathe: 0.02,
    ring: 0.55,
    parts: 0.5,
  },
  listening: {
    c1: [222, 236, 255],
    c2: [66, 110, 255],
    c3: [113, 55, 255],
    rim: [130, 175, 255],
    glow: 0.95,
    amp: 1,
    rot: 0.22,
    swirl: 0.55,
    breathe: 0.018,
    ring: 0.55,
    parts: 0.9,
  },
  thinking: {
    c1: [244, 214, 255],
    c2: [150, 50, 235],
    c3: [90, 45, 210],
    rim: [205, 120, 255],
    glow: 0.8,
    amp: 0.42,
    rot: 1.35,
    swirl: 1.55,
    breathe: 0.022,
    ring: 0.95,
    parts: 0.75,
  },
  tool: {
    c1: [247, 210, 255],
    c2: [174, 45, 222],
    c3: [100, 38, 199],
    rim: [218, 115, 255],
    glow: 0.84,
    amp: 0.44,
    rot: 1.35,
    swirl: 1.6,
    breathe: 0.022,
    ring: 0.95,
    parts: 0.78,
  },
  speaking: {
    c1: [255, 228, 210],
    c2: [214, 45, 190],
    c3: [255, 112, 42],
    rim: [255, 150, 130],
    glow: 1.25,
    amp: 1.3,
    rot: 0.45,
    swirl: 0.85,
    breathe: 0.026,
    ring: 0.45,
    parts: 1,
  },
  disconnecting: {
    c1: [244, 214, 255],
    c2: [150, 50, 235],
    c3: [90, 45, 210],
    rim: [205, 120, 255],
    glow: 0.4,
    amp: 0.42,
    rot: 1.35,
    swirl: 1.55,
    breathe: 0.022,
    ring: 0.7,
    parts: 0.5,
  },
  error: {
    c1: [150, 140, 145],
    c2: [78, 62, 70],
    c3: [120, 50, 62],
    rim: [190, 90, 100],
    glow: 0.22,
    amp: 0.1,
    rot: 0.03,
    swirl: 0.1,
    breathe: 0.008,
    ring: 0.12,
    parts: 0.1,
  },
};

const colorKeys = ["c1", "c2", "c3", "rim"] as const;
const numberKeys = ["glow", "amp", "rot", "swirl", "breathe", "ring", "parts"] as const;

function rgba(color: Color, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

function copyPalette(value: SpherePalette): SpherePalette {
  return {
    ...value,
    c1: [...value.c1] as Color,
    c2: [...value.c2] as Color,
    c3: [...value.c3] as Color,
    rim: [...value.rim] as Color,
  };
}

function interpolateColor(current: Color, target: Color, mix: number): void {
  current[0] += (target[0] - current[0]) * mix;
  current[1] += (target[1] - current[1]) * mix;
  current[2] += (target[2] - current[2]) * mix;
}

export function VoiceSphere({
  state,
  inputLevelRef,
  outputLevelRef,
  size,
}: {
  state: VoiceState;
  inputLevelRef: AudioLevelRef;
  outputLevelRef: AudioLevelRef;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ state, inputLevelRef, outputLevelRef });
  propsRef.current = { state, inputLevelRef, outputLevelRef };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeContext = canvas.getContext("2d");
    if (!maybeContext) return;
    const context: CanvasRenderingContext2D = maybeContext;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motion.matches;
    const updateMotion = () => {
      reducedMotion = motion.matches;
    };
    motion.addEventListener("change", updateMotion);
    const current = copyPalette(palettes[propsRef.current.state]);
    let frame = 0;
    let previous = performance.now();
    let time = 0;

    function draw(now: number) {
      const dt = Math.min(0.05, Math.max(0.001, (now - previous) / 1000));
      previous = now;
      if (!reducedMotion) time += dt;
      const target = palettes[propsRef.current.state];
      const mix = 1 - 0.0025 ** dt;
      for (const key of colorKeys) interpolateColor(current[key], target[key], mix);
      for (const key of numberKeys) current[key] += (target[key] - current[key]) * mix;

      const rawLevel =
        propsRef.current.state === "speaking"
          ? propsRef.current.outputLevelRef.current
          : propsRef.current.inputLevelRef.current;
      const level = reducedMotion ? 0.15 : Math.max(0.04, Math.min(1, rawLevel));
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.235 * (1 + current.breathe * Math.sin(1.1 * time) + 0.045 * level * current.amp);
      const amplitude = current.amp * (0.016 + 0.042 * level);
      context.clearRect(0, 0, size, size);

      const glow = context.createRadialGradient(cx, cy, radius * 0.7, cx, cy, radius * 2.05);
      glow.addColorStop(0, rgba(current.c2, 0.3 * current.glow));
      glow.addColorStop(0.35, rgba(current.c2, 0.1 * current.glow));
      glow.addColorStop(0.7, rgba(current.c3, 0.035 * current.glow));
      glow.addColorStop(1, rgba(current.c3, 0));
      context.fillStyle = glow;
      context.beginPath();
      context.arc(cx, cy, radius * 2.05, 0, Math.PI * 2);
      context.fill();

      const body = new Path2D();
      for (let index = 0; index <= 180; index += 1) {
        const angle = (index / 180) * Math.PI * 2;
        const distortion =
          amplitude *
          (Math.sin(3 * angle + 1.6 * time) +
            0.7 * Math.sin(5 * angle - 1.1 * time) +
            0.45 * Math.sin(8 * angle + 2.3 * time) +
            0.3 * Math.sin(13 * angle - 0.7 * time));
        const pointRadius = radius * (1 + distortion);
        const x = cx + Math.cos(angle) * pointRadius;
        const y = cy + Math.sin(angle) * pointRadius;
        if (index === 0) body.moveTo(x, y);
        else body.lineTo(x, y);
      }
      body.closePath();

      context.save();
      context.clip(body);
      const fill = context.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.36,
        radius * 0.04,
        cx,
        cy,
        radius * 1.2,
      );
      fill.addColorStop(0, rgba(current.c1, 1));
      fill.addColorStop(0.34, rgba(current.c2, 0.98));
      fill.addColorStop(0.72, rgba(current.c3, 0.98));
      fill.addColorStop(1, "rgba(10,8,18,.96)");
      context.fillStyle = fill;
      context.fillRect(cx - radius * 1.4, cy - radius * 1.4, radius * 2.8, radius * 2.8);
      context.globalCompositeOperation = "lighter";
      const swirlColors = [current.c1, current.c2, current.c3];
      swirlColors.forEach((color, index) => {
        const orbit = time * current.rot * (index % 2 === 0 ? 1 : -1) + index * 2.1;
        const sx = cx + Math.cos(orbit) * radius * 0.28 * current.swirl;
        const sy = cy + Math.sin(orbit * 0.82) * radius * 0.2 * current.swirl;
        const wash = context.createRadialGradient(sx, sy, 0, sx, sy, radius * 0.76);
        wash.addColorStop(0, rgba(color, 0.18));
        wash.addColorStop(1, rgba(color, 0));
        context.fillStyle = wash;
        context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      });
      const pulseY = cy - radius + ((time * (0.45 + 0.35 * current.rot)) % 1) * radius * 2;
      const pulse = context.createLinearGradient(0, pulseY - radius * 0.28, 0, pulseY + radius * 0.28);
      pulse.addColorStop(0, "rgba(255,255,255,0)");
      pulse.addColorStop(0.5, `rgba(255,255,255,${0.08 * current.swirl})`);
      pulse.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = pulse;
      context.fillRect(cx - radius * 1.2, pulseY - radius * 0.3, radius * 2.4, radius * 0.6);
      context.globalCompositeOperation = "source-over";
      const shade = context.createRadialGradient(
        cx - radius * 0.35,
        cy - radius * 0.4,
        radius * 0.2,
        cx + radius * 0.42,
        cy + radius * 0.45,
        radius * 1.35,
      );
      shade.addColorStop(0.6, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,.4)");
      context.fillStyle = shade;
      context.fillRect(cx - radius * 1.4, cy - radius * 1.4, radius * 2.8, radius * 2.8);
      context.restore();

      context.strokeStyle = rgba(current.rim, 0.35 + 0.25 * level * current.amp);
      context.lineWidth = 1.1;
      context.stroke(body);

      context.save();
      context.translate(cx, cy);
      context.lineWidth = 1;
      for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
        context.save();
        context.rotate(time * current.rot * (ringIndex === 0 ? 0.35 : -0.22) + ringIndex * 1.2);
        context.strokeStyle = rgba(current.rim, current.ring * (ringIndex === 0 ? 0.22 : 0.13));
        context.beginPath();
        context.ellipse(
          0,
          0,
          radius * (ringIndex === 0 ? 1.42 : 1.76),
          radius * (ringIndex === 0 ? 0.42 : 0.58),
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.restore();
      }
      context.restore();

      for (let index = 0; index < 26; index += 1) {
        const seed = index * 2.399;
        const distance = radius * (1.36 + 0.5 * ((Math.sin(index * 18.31) + 1) / 2));
        const angle = seed + time * current.rot * (index % 2 ? 0.08 : -0.06);
        const px = cx + Math.cos(angle) * distance * (1 + level * 0.025);
        const py = cy + Math.sin(angle) * distance * 0.72 * (1 + level * 0.025);
        context.fillStyle = rgba(
          index % 3 === 0 ? current.c1 : current.rim,
          current.parts * (0.12 + (index % 5) * 0.025),
        );
        context.beginPath();
        context.arc(px, py, 0.9 + (index % 4) * 0.35, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", updateMotion);
    };
  }, [size]);

  return <canvas className="voice-sphere" ref={canvasRef} style={{ width: size, height: size }} />;
}
