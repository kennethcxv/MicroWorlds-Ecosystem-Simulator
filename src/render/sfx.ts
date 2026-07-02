/**
 * SFX — tiny PROCEDURAL sound effects (WebAudio, zero asset files — every
 * sound is synthesized, so there is nothing to license and nothing to load).
 * Everything is guarded: on browsers/contexts without audio (or before the
 * first user gesture) calls are silent no-ops, never throws.
 *
 * When `globalThis.__sfxLog` is an array, every trigger pushes its name — the
 * Playwright QA asserts sounds actually fire without needing speakers.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let brushNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let noiseBuf: AudioBuffer | null = null;

function log(name: string): void {
  const l = (globalThis as { __sfxLog?: string[] }).__sfxLog;
  if (Array.isArray(l)) l.push(name);
}

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf) return noiseBuf;
  const len = c.sampleRate * 1.2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // Pink-ish: averaged white noise (softer than pure white).
    const w = Math.random() * 2 - 1;
    last = (last + w * 0.35) / 1.35;
    d[i] = last * 2.4;
  }
  return noiseBuf;
}

function tone(c: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
  if (!master) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Looped scrubbing (filtered noise) while the brush is dragged. */
  brushStart(): void {
    const c = ensure();
    if (!c || !master || brushNode) return;
    try {
      const src = c.createBufferSource();
      src.buffer = noise(c);
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 950;
      bp.Q.value = 0.9;
      const g = c.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.28, c.currentTime + 0.08);
      // A gentle scrub wobble.
      const lfo = c.createOscillator();
      lfo.frequency.value = 7.5;
      const lfoG = c.createGain();
      lfoG.gain.value = 0.12;
      lfo.connect(lfoG).connect(g.gain);
      lfo.start();
      src.connect(bp).connect(g).connect(master);
      src.start();
      brushNode = { src, gain: g };
      log("brushStart");
    } catch {
      brushNode = null;
    }
  },

  brushStop(): void {
    const c = ctx;
    if (!c || !brushNode) return;
    try {
      brushNode.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.12);
      const node = brushNode;
      setTimeout(() => {
        try {
          node.src.stop();
        } catch {
          /* already stopped */
        }
      }, 180);
      log("brushStop");
    } finally {
      brushNode = null;
    }
  },

  /** A little sparkle — a spot came clean. */
  sparkle(): void {
    const c = ensure();
    if (!c) return;
    tone(c, 2200, 0.22, "sine", 0.16);
    tone(c, 3100, 0.28, "sine", 0.12, 0.07);
    log("sparkle");
  },

  /** Job done — a pleasant two-note chime. */
  done(): void {
    const c = ensure();
    if (!c) return;
    tone(c, 659, 0.3, "triangle", 0.2);
    tone(c, 988, 0.42, "triangle", 0.17, 0.12);
    tone(c, 1975, 0.3, "sine", 0.06, 0.12);
    log("done");
  },

  /** Scoop pop (a dropping picked up). */
  pop(): void {
    const c = ensure();
    if (!c || !master) return;
    try {
      const o = c.createOscillator();
      o.type = "sine";
      const t0 = c.currentTime;
      o.frequency.setValueAtTime(420, t0);
      o.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.25, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 0.2);
      log("pop");
    } catch {
      /* silent */
    }
  },

  /** Water pour + a few rising bubbles (Replace Water). */
  water(): void {
    const c = ensure();
    if (!c || !master) return;
    try {
      const src = c.createBufferSource();
      src.buffer = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(500, c.currentTime);
      lp.frequency.linearRampToValueAtTime(1400, c.currentTime + 0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.22, c.currentTime + 0.1);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 0.75);
      src.connect(lp).connect(g).connect(master);
      src.start();
      src.stop(c.currentTime + 0.8);
      for (let i = 0; i < 4; i++) tone(c, 600 + i * 260 + Math.random() * 120, 0.1, "sine", 0.07, 0.15 + i * 0.12);
      log("water");
    } catch {
      /* silent */
    }
  },

  /** Glass squeak (Wipe Glass) — a soft up-down band sweep. */
  squeak(): void {
    const c = ensure();
    if (!c || !master) return;
    try {
      const src = c.createBufferSource();
      src.buffer = noise(c);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 9;
      bp.frequency.setValueAtTime(1400, c.currentTime);
      bp.frequency.linearRampToValueAtTime(2300, c.currentTime + 0.28);
      bp.frequency.linearRampToValueAtTime(1500, c.currentTime + 0.55);
      const g = c.createGain();
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(0.1, c.currentTime + 0.06);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
      src.connect(bp).connect(g).connect(master);
      src.start();
      src.stop(c.currentTime + 0.65);
      log("squeak");
    } catch {
      /* silent */
    }
  },
};
