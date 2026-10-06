/**
 * Sonidos de interfaz. Usa foundry.audio.AudioHelper (v14), en el canal
 * "interface", y nunca emite por socket: cada cliente decide si suena.
 */

import { MODULE_ID, setting } from "../constants.js";

const file = (name) => `modules/${MODULE_ID}/assets/audio/${name}.wav`;

const SOUNDS = {
  OPEN: file("open"),
  NAVIGATE: file("navigate"),
  PICKUP: file("pickup"),
  PICKUP_ALL: file("pickup-all"),
  CLOSE: file("close"),
  REVEAL: file("reveal-common")
};

const RARITY_SOUNDS = {
  COMMON: file("reveal-common"),
  UNCOMMON: file("reveal-uncommon"),
  RARE: file("reveal-rare"),
  UNIQUE: file("reveal-unique"),
  common: file("reveal-common"),
  uncommon: file("reveal-uncommon"),
  rare: file("reveal-rare"),
  veryRare: file("reveal-veryRare"),
  unique: file("reveal-unique"),
  legendary: file("reveal-legendary"),
  artifact: file("reveal-artifact")
};

const NAVIGATION_SOUNDS = {
  left: [1, 2, 3].map((variant) => file(`navigate-left-${variant}`)),
  right: [1, 2, 3].map((variant) => file(`navigate-right-${variant}`))
};
const navigationIndex = { left: 0, right: 0 };
let lastNavigation = -Infinity;

/** Categorias con interruptor propio ademas del general. */
const CATEGORY_SETTING = {
  NAVIGATE: "navigationSounds",
  PICKUP: "pickupSounds",
  PICKUP_ALL: "pickupSounds"
};

let preloaded = false;

export const AudioService = {
  SOUNDS,
  RARITY_SOUNDS,
  NAVIGATION_SOUNDS,

  /** Carga los sonidos la primera vez que se abre un carrusel, no al arrancar. */
  preload() {
    if (preloaded || !setting("sounds")) return;
    preloaded = true;
    for (const src of new Set([...Object.values(SOUNDS), ...Object.values(RARITY_SOUNDS), ...Object.values(NAVIGATION_SOUNDS).flat()])) {
      foundry.audio.AudioHelper.preloadSound(src).catch(() => {});
    }
  },

  /**
   * @param {"OPEN"|"NAVIGATE"|"REVEAL"|"PICKUP"|"PICKUP_ALL"|"CLOSE"} category
   * @param {object} [options]
   * @param {object} [options.rarity]  Rareza normalizada; solo afecta a REVEAL.
   * @param {number} [options.direction]  Negativo para izquierda, positivo para derecha.
   */
  play(category, { rarity, direction = 1 } = {}) {
    if (!setting("sounds")) return;
    const toggle = CATEGORY_SETTING[category];
    if (toggle && !setting(toggle)) return;

    let src = SOUNDS[category];
    if (category === "NAVIGATE") {
      const now = performance.now();
      if (now - lastNavigation < 70) return;
      lastNavigation = now;
      const side = direction < 0 ? "left" : "right";
      const variants = NAVIGATION_SOUNDS[side];
      src = variants[navigationIndex[side]++ % variants.length];
    }
    if (category === "REVEAL" && rarity && setting("raritySounds")) {
      src = RARITY_SOUNDS[rarity.id] ?? RARITY_SOUNDS[rarity.sound] ?? src;
    }
    if (!src) return;

    const report = (error) => {
      console.warn(`${MODULE_ID} | No se pudo reproducir ${src}`, error);
    };
    try {
      const volume = Math.min(1, Math.max(0, Number(setting("volume")) || 0));
      // Foundry v14 returns a promise. Catch load/decode errors as well as sync errors.
      return Promise.resolve(foundry.audio.AudioHelper.play({ src, volume, channel: "interface", autoplay: true, loop: false }, false))
        .catch(report);
    } catch (error) {
      report(error);
    }
  }
};
