/**
 * Normaliza la rareza. Cada sistema la guarda en un sitio distinto, asi que hay
 * un resolvedor por sistema y uno generico que prueba las rutas habituales.
 */

const preset = (color, glow, particles) => ({ color, glow, particles });

/** Rarezas conocidas. `sound` es una de las cuatro categorias de AudioService. */
const RARITIES = {
  common: { rank: 0, sound: "COMMON", visualPreset: preset("#b9b4a7", 0.35, 0) },
  uncommon: { rank: 1, sound: "UNCOMMON", visualPreset: preset("#4fd27a", 0.6, 10) },
  rare: { rank: 2, sound: "RARE", visualPreset: preset("#4f9dff", 0.8, 18) },
  veryRare: { rank: 3, sound: "RARE", visualPreset: preset("#b06bff", 0.9, 22) },
  unique: { rank: 3, sound: "UNIQUE", visualPreset: preset("#c86bff", 1, 28) },
  legendary: { rank: 4, sound: "UNIQUE", visualPreset: preset("#ffb347", 1, 30) },
  artifact: { rank: 5, sound: "UNIQUE", visualPreset: preset("#ff5c5c", 1, 34) }
};

const ALIASES = {
  "": "common",
  mundane: "common",
  "very rare": "veryRare",
  veryrare: "veryRare",
  "very-rare": "veryRare",
  epic: "veryRare",
  mythic: "artifact"
};

const resolvers = new Map();

function build(id, label) {
  const known = RARITIES[id] ?? RARITIES.common;
  const safeId = RARITIES[id] ? id : "common";
  return {
    id: safeId,
    label: label || game.i18n.localize(`VLR.Rarity.${safeId}`),
    rank: known.rank,
    cssClass: `vlr-rarity-${safeId}`,
    sound: known.sound,
    visualPreset: known.visualPreset
  };
}

function canonical(raw) {
  if (raw && typeof raw === "object") raw = raw.value ?? raw.id ?? "";
  const text = String(raw ?? "").trim();
  if (RARITIES[text]) return text;
  const lower = text.toLowerCase();
  return ALIASES[lower] ?? (RARITIES[lower] ? lower : null);
}

function systemLabel(dictionary, id) {
  const entry = dictionary?.[id];
  const label = typeof entry === "string" ? entry : entry?.label;
  return label ? game.i18n.localize(label) : "";
}

/** PF2e / SF2e: la rareza vive junto a los rasgos. */
function pf2eResolver(item) {
  const id = canonical(item.system?.traits?.rarity) ?? "common";
  return build(id, systemLabel(CONFIG.PF2E?.rarityTraits, id));
}

/** D&D 5e: cadena en system.rarity; vacia significa mundano. */
function dnd5eResolver(item) {
  const raw = item.system?.rarity ?? "";
  const id = canonical(raw) ?? "common";
  return build(id, systemLabel(CONFIG.DND5E?.itemRarity, raw));
}

function genericResolver(item) {
  const system = item.system ?? {};
  const candidates = [system.traits?.rarity, system.rarity, system.details?.rarity, system.quality];
  for (const candidate of candidates) {
    const id = canonical(candidate);
    if (id) return build(id);
  }
  return build("common");
}

resolvers.set("pf2e", pf2eResolver);
resolvers.set("sf2e", pf2eResolver);
resolvers.set("dnd5e", dnd5eResolver);

export const RarityService = {
  /** Permite a otros modulos anadir o sustituir el resolvedor de un sistema. */
  register(systemId, resolver) {
    resolvers.set(systemId, resolver);
  },

  /** @returns {{id, label, rank, cssClass, sound, visualPreset}} */
  normalize(item) {
    const resolver = resolvers.get(game.system.id) ?? genericResolver;
    try {
      return resolver(item) ?? genericResolver(item);
    } catch {
      return genericResolver(item);
    }
  },

  /** Rareza de un objeto que el jugador todavia no puede ver. */
  unknown() {
    return {
      id: "unknown",
      label: "???",
      rank: -1,
      cssClass: "vlr-rarity-unknown",
      sound: "COMMON",
      visualPreset: preset("#8d8798", 0.3, 0)
    };
  }
};
