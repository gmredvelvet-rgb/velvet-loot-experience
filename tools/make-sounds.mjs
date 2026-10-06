/** Original layered sound design. Rebuild: node tools/make-sounds.mjs. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const RATE = 48000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');
const TAU = 2 * Math.PI;
const note = midi => 440 * 2 ** ((midi - 69) / 12);
function random(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296 * 2 - 1; };
}
function scene(seconds) { return [new Float64Array(Math.ceil(seconds * RATE)), new Float64Array(Math.ceil(seconds * RATE))]; }
function layer(channels, start, seconds, gain, pan, synth) {
  const first = Math.round(start * RATE), length = Math.round(seconds * RATE);
  const left = Math.cos((pan + 1) * Math.PI / 4) * gain, right = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < length && first + i < channels[0].length; i++) {
    const t = i / RATE, p = i / length;
    const fade = Math.min(1, t / .003, (1 - p) * seconds / .018);
    const sample = synth(t, p) * fade;
    channels[0][first + i] += sample * left;
    channels[1][first + i] += sample * right;
  }
}
// Damped metallic modes with a soft mallet transient, rather than a sharp beep.
function metal(s, start, midi, seconds, gain, pan = 0, shimmer = 1) {
  const hz = note(midi), modes = [[1, 1], [2.003, .24], [2.756, .11 * shimmer], [4.071, .06 * shimmer]];
  layer(s, start, seconds, gain, pan, t => modes.reduce((sum, [ratio, level]) =>
    sum + Math.sin(TAU * hz * ratio * t) * level * Math.exp(-t * (5 + ratio * 1.7) / seconds), 0));
}
function air(s, start, seconds, gain, pan, seed, reverse = false) {
  const rng = random(seed); let low = 0, band = 0;
  layer(s, start, seconds, gain, pan, (_, p) => {
    const sweep = reverse ? 1 - p : p, alpha = 1 - Math.exp(-TAU * (700 + 3600 * sweep) / RATE);
    low += alpha * (rng() - low); band += .045 * (low - band);
    return (low - band) * Math.sin(Math.PI * p) ** 1.7;
  });
}
function body(s, start, seconds, gain, hz = 100) {
  let phase = 0;
  layer(s, start, seconds, gain, 0, t => {
    phase += TAU * (hz + 70 * Math.exp(-t * 35)) / RATE;
    return Math.sin(phase) * Math.exp(-t * 10 / seconds);
  });
}
function pad(s, start, midi, seconds, gain, pan = 0) {
  const hz = note(midi);
  layer(s, start, seconds, gain, pan, (t, p) =>
    (Math.sin(TAU * hz * t) + .35 * Math.sin(TAU * hz * 1.004 * t) + .15 * Math.sin(TAU * hz * 2 * t))
    * Math.sin(Math.PI * p) ** 2 * Math.exp(-p * 2));
}
function reverb(s, wet) {
  const dry = s.map(ch => ch.slice());
  // Damped stereo reflections and a short diffuse tail.
  [.031, .047, .071, .103, .149, .211, .293, .397, .523, .683, .829].forEach((seconds, index) => {
    const delay = Math.round(seconds * RATE), gain = wet * Math.exp(-seconds * 5) / 2;
    for (let ch = 0; ch < 2; ch++) {
      const source = dry[(ch + index % 2) % 2]; let damped = 0;
      for (let i = delay; i < s[ch].length; i++) { damped += .24 * (source[i - delay] - damped); s[ch][i] += damped * gain; }
    }
  });
}
function master(s, targetRms, peakLimit) {
  let energy = 0, peak = 0;
  for (const channel of s) {
    let previousInput = 0, previousOutput = 0;
    const coefficient = Math.exp(-TAU * 35 / RATE);
    for (let i = 0; i < channel.length; i++) {
      const input = channel[i], output = input - previousInput + coefficient * previousOutput;
      previousInput = input; previousOutput = output;
      const fade = Math.min(1, i / (RATE * .004), (channel.length - 1 - i) / (RATE * .075));
      channel[i] = Math.tanh(output * 1.2) * fade;
      energy += channel[i] ** 2; peak = Math.max(peak, Math.abs(channel[i]));
    }
  }
  const rms = Math.sqrt(energy / (s[0].length * 2)), gain = Math.min(targetRms / (rms || 1), peakLimit / (peak || 1));
  for (const channel of s) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
  return s;
}
export function encodeWav(s) {
  const bytes = s[0].length * 4, buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 4, 28);
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  for (let i = 0; i < s[0].length; i++) for (let ch = 0; ch < 2; ch++)
    buffer.writeInt16LE(Math.round(s[ch][i] * 32767), 44 + i * 4 + ch * 2);
  return buffer;
}
export function buildSounds() {
  const sounds = new Map();
  const add = (name, seconds, build, { wet = .28, rms = .075, peak = .7 } = {}) => {
    const s = scene(seconds); build(s); reverb(s, wet);
    sounds.set(name, encodeWav(master(s, rms, peak)));
  };
  add('open', 1.45, s => {
    air(s, 0, .48, .18, -.2, 101); air(s, .08, .45, .12, .3, 102); body(s, .18, .32, .28, 82);
    [50, 57, 62, 69].forEach((m, i) => metal(s, .19 + i * .07, m, .85, .15, (i - 1.5) * .2));
    pad(s, .22, 50, .8, .09, -.3); pad(s, .25, 57, .8, .06, .3);
  });
  for (const direction of [-1, 1]) for (let variant = 0; variant < 3; variant++) {
    const build = s => {
      air(s, 0, .1, .17, direction * .22, 300 + variant + (direction + 1) * 10, direction < 0);
      body(s, .006, .055, .14, 210 + variant * 12);
      metal(s, .015, 74 + variant * .14, .13, .075, direction * .17, .25);
    };
    const config = { wet: .08, rms: .043, peak: .28 };
    add(`navigate-${direction < 0 ? 'left' : 'right'}-${variant + 1}`, .23, build, config);
    if (direction === 1 && variant === 0) add('navigate', .23, build, config);
  }
  add('pickup', .8, s => {
    air(s, 0, .18, .1, .1, 402); body(s, .015, .12, .12, 165);
    [74, 81, 86].forEach((m, i) => metal(s, .025 + i * .055, m, .48, .12, -.2 + i * .2, .5));
  }, { rms: .06, wet: .2, peak: .5 });
  add('pickup-all', 1.15, s => {
    air(s, 0, .27, .1, -.15, 501); body(s, .03, .2, .15, 115);
    [62, 69, 74, 81, 86].forEach((m, i) => metal(s, i * .05, m, .65, .13, (i - 2) * .15, .55));
  }, { rms: .07, wet: .25 });
  add('close', .58, s => {
    air(s, 0, .28, .19, -.15, 601, true); metal(s, 0, 62, .29, .09, .1, .3); body(s, .08, .14, .08, 105);
  }, { rms: .04, wet: .14, peak: .4 });
  const reveals = [
    ['common', .85, [62], .2], ['uncommon', 1.25, [62, 69, 74], .3], ['rare', 1.7, [62, 65, 69, 74], .38],
    ['veryRare', 2.05, [50, 62, 69, 74, 77], .42], ['unique', 2.3, [50, 57, 62, 69, 74, 81], .45],
    ['legendary', 2.65, [38, 50, 57, 62, 66, 69, 74, 81], .5], ['artifact', 3.1, [38, 45, 50, 57, 62, 65, 69, 74, 86], .55]
  ];
  reveals.forEach(([rarity, seconds, notes, wet], rank) => {
    add(`reveal-${rarity}`, seconds, s => {
      air(s, 0, .2 + rank * .035, .05 + rank * .015, -.2, 700 + rank);
      if (rank > 1) body(s, .065, .25 + rank * .035, .1 + rank * .02, rank > 4 ? 58 : 100);
      notes.forEach((m, i) => metal(s, .06 + i * .065, m, .55 + rank * .12, .14, (i % 3 - 1) * .32, .6 + rank * .08));
      if (rank > 2) { pad(s, .12, 50, .7 + rank * .12, .1, -.35); pad(s, .16, rank === 5 ? 66 : 65, .7 + rank * .12, .06, .35); }
      if (rank > 4) [86, 93, 98].forEach((m, i) => metal(s, .65 + i * .095, m, .6, .028, (i - 1) * .5, .4));
    }, { wet, rms: .055 + rank * .006, peak: .65 + rank * .015 });
  });
  return sounds;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, buffer] of buildSounds()) {
    writeFileSync(join(OUT, `${name}.wav`), buffer);
    console.log(`${name}.wav ${(buffer.readUInt32LE(40) / (RATE * 4)).toFixed(2)} s`);
  }
}
