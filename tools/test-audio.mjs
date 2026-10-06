import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSounds, RATE } from "./make-sounds.mjs";

const generated = buildSounds();
assert.equal(generated.size, 18);
let totalBytes = 0;
for (const [name, expected] of generated) {
  const wav = readFileSync(new URL(`../assets/audio/${name}.wav`, import.meta.url));
  assert.deepEqual(wav, expected, `${name}: deterministic build matches shipped audio`);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), RATE);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  let peak = 0, energy = 0, monoEnergy = 0, mean = 0, stereoDifference = 0;
  for (let i = 44; i < wav.length; i += 4) {
    const l = wav.readInt16LE(i) / 32767, r = wav.readInt16LE(i + 2) / 32767;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    energy += (l * l + r * r) / 2;
    monoEnergy += ((l + r) / 2) ** 2;
    mean += l + r;
    stereoDifference += Math.abs(l - r);
  }
  const frames = (wav.length - 44) / 4;
  assert.ok(peak < .8 && peak > .05, `${name}: peak headroom`);
  assert.ok(Math.abs(mean / (frames * 2)) < .001, `${name}: no significant DC offset`);
  assert.ok(monoEnergy / energy > .8, `${name}: mono compatibility`);
  assert.ok(stereoDifference > .01, `${name}: stereo content`);
  assert.equal(wav.readInt16LE(44), 0, `${name}: zero start`);
  assert.equal(wav.readInt16LE(wav.length - 2), 0, `${name}: zero end`);
  totalBytes += wav.length;
}

const settings = { sounds: true, navigationSounds: true, pickupSounds: true, raritySounds: true, volume: .7 };
let now = 100;
Object.defineProperty(globalThis, "performance", { configurable: true, value: { now: () => now } });
const played = [], loaded = [];
globalThis.game = { settings: { get: (_, key) => settings[key] } };
globalThis.foundry = { audio: { AudioHelper: {
  play: (data, broadcast) => { played.push({ ...data, broadcast }); return Promise.resolve(); },
  preloadSound: (src) => { loaded.push(src); return Promise.resolve(); }
} } };
const { AudioService } = await import("../scripts/services/audio-service.js");
AudioService.preload(); AudioService.preload();
assert.equal(loaded.length, 18, "Assets preload once, including all navigation variants");
for (let i = 1; i <= 4; i++) {
  now += 100;
  await AudioService.play("NAVIGATE", { direction: -1 });
  assert.ok(played.at(-1).src.endsWith(`navigate-left-${(i - 1) % 3 + 1}.wav`));
}
const beforeThrottle = played.length;
await AudioService.play("NAVIGATE");
assert.equal(played.length, beforeThrottle, "Rapid input is throttled");
now += 100;
await AudioService.play("NAVIGATE", { direction: 1 });
assert.ok(played.at(-1).src.endsWith("navigate-right-1.wav"));
for (const id of ["common", "uncommon", "rare", "veryRare", "unique", "legendary", "artifact"]) {
  await AudioService.play("REVEAL", { rarity: { id, sound: "COMMON" } });
  assert.ok(played.at(-1).src.endsWith(`reveal-${id}.wav`));
}
settings.raritySounds = false;
await AudioService.play("REVEAL", { rarity: { id: "artifact" } });
assert.ok(played.at(-1).src.endsWith("reveal-common.wav"));
settings.pickupSounds = false;
const beforeMute = played.length;
await AudioService.play("PICKUP"); await AudioService.play("PICKUP_ALL");
assert.equal(played.length, beforeMute);
settings.sounds = false;
await AudioService.play("OPEN");
assert.equal(played.length, beforeMute);
assert.ok(played.every(sound => sound.broadcast === false && sound.channel === "interface" && sound.volume === .7));
settings.sounds = true;
const warn = console.warn;
let warned = false;
console.warn = () => { warned = true; };
foundry.audio.AudioHelper.play = () => Promise.reject(new Error("decode failed"));
await AudioService.play("OPEN");
console.warn = warn;
assert.ok(warned, "Asynchronous load failures are caught");
console.log(`PASS: 18 stereo WAVs, headroom, fades, mono compatibility, deterministic synthesis (${(totalBytes / 1048576).toFixed(2)} MiB)`);
console.log("PASS: navigation variants, throttle, rarity mapping, local playback, mute switches and async failures");
