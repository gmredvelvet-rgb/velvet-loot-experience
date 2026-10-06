/**
 * Convierte un Item de cualquier sistema en el ViewModel plano que consume la
 * plantilla. La plantilla nunca toca `item.system`.
 */

import { RarityService } from "../services/rarity-service.js";

/* -------------------------------------------- */
/*  Presentaciones por tipo                     */
/* -------------------------------------------- */

const presentations = new Map([
  ["weapon", { icon: "fa-solid fa-khanda", types: ["weapon"] }],
  ["armor", { icon: "fa-solid fa-shield-halved", types: ["armor", "shield"] }],
  ["consumable", { icon: "fa-solid fa-flask", types: ["consumable", "ammo", "ammunition"] }],
  ["treasure", { icon: "fa-solid fa-gem", types: ["treasure", "loot"] }],
  ["spell", { icon: "fa-solid fa-wand-sparkles", types: ["spell"] }],
  ["container", { icon: "fa-solid fa-box-open", types: ["container", "backpack"] }],
  ["generic", { icon: "fa-solid fa-cube", types: [] }]
]);

/**
 * Registra una presentacion nueva. `match(item)` es opcional y gana a `types`.
 * La clase CSS resultante es `vlr-preset-<id>`.
 */
export function registerPresentation(id, { icon = "fa-solid fa-cube", types = [], match } = {}) {
  presentations.set(id, { icon, types, match });
}

const DND5E_ARMOR = new Set(["light", "medium", "heavy", "shield", "natural"]);

function presentationFor(item) {
  for (const [id, config] of presentations) {
    if (config.match?.(item)) return id;
  }
  // dnd5e mete armaduras y baratijas en el mismo tipo "equipment".
  if (item.type === "equipment" && DND5E_ARMOR.has(item.system?.type?.value)) return "armor";
  for (const [id, config] of presentations) {
    if (config.types.includes(item.type)) return id;
  }
  return "generic";
}

/* -------------------------------------------- */
/*  Cantidad                                    */
/* -------------------------------------------- */

/** Ruta de la cantidad en los datos del objeto, o `null` si no es apilable. */
export function quantityPath(item) {
  const quantity = item.system?.quantity;
  if (typeof quantity === "number") return "system.quantity";
  if (quantity && typeof quantity.value === "number") return "system.quantity.value";
  return null;
}

export function quantityOf(item) {
  const path = quantityPath(item);
  return path ? Number(foundry.utils.getProperty(item, path)) || 0 : 1;
}

/** Algo que se puede llevar encima: fisico en PF2e, con cantidad en el resto. */
export function isPhysical(item) {
  if (typeof item.isOfType === "function") {
    try {
      return item.isOfType("physical");
    } catch {
      /* cae al criterio generico */
    }
  }
  return quantityPath(item) !== null;
}

/* -------------------------------------------- */
/*  Precio, nivel, rasgos                       */
/* -------------------------------------------- */

const COIN_ORDER = ["pp", "gp", "ep", "sp", "cp"];

function coinsLabel(coins) {
  const keys = [...COIN_ORDER.filter((key) => key in coins), ...Object.keys(coins).filter((key) => !COIN_ORDER.includes(key))];
  return keys
    .filter((key) => Number(coins[key]) > 0)
    .map((key) => `${coins[key]} ${key}`)
    .join(", ");
}

export function priceLabel(item) {
  const price = item.system?.price ?? item.system?.cost;
  if (price === null || price === undefined || price === "") return "";
  if (typeof price === "number") return price > 0 ? String(price) : "";
  if (typeof price === "string") return price;

  const value = price.value;
  if (value && typeof value === "object") return coinsLabel(value); // PF2e: {pp, gp, sp, cp}
  if (value === null || value === undefined || value === "" || Number(value) === 0) return "";
  return `${value} ${price.denomination ?? price.currency ?? ""}`.trim(); // dnd5e: {value, denomination}
}

function levelOf(item) {
  const raw = item.system?.level?.value ?? item.system?.level;
  if (raw === null || raw === undefined || raw === "" || typeof raw === "object") return null;
  const level = Number(raw);
  return Number.isFinite(level) ? level : null;
}

function titleCase(slug) {
  return String(slug).replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function traitsOf(item) {
  const system = item.system ?? {};
  const raw = Array.isArray(system.traits?.value) ? system.traits.value // PF2e
    : system.properties instanceof Set ? [...system.properties] // dnd5e
      : Array.isArray(system.properties) ? system.properties : [];

  const config = CONFIG.PF2E ?? CONFIG.SF2E;
  const dictionaries = [
    config?.[`${item.type}Traits`],
    config?.equipmentTraits,
    config?.actionTraits,
    CONFIG.DND5E?.itemProperties
  ];

  return raw.slice(0, 6).map((slug) => {
    for (const dictionary of dictionaries) {
      const entry = dictionary?.[slug];
      const label = typeof entry === "string" ? entry : entry?.label;
      if (label) return game.i18n.localize(label);
    }
    return titleCase(slug);
  });
}

function typeLabel(item) {
  const key = CONFIG.Item?.typeLabels?.[item.type];
  return key ? game.i18n.localize(key) : titleCase(item.type);
}

/* -------------------------------------------- */
/*  ViewModel                                   */
/* -------------------------------------------- */

/**
 * @param {Item} item
 * @param {object} [options]
 * @param {number} [options.quantity]  Cantidad segun el backend (Item Piles sabe mas que nosotros).
 */
export function toViewModel(item, { quantity } = {}) {
  const preset = presentationFor(item);
  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    image: item.img,
    quantity: quantity ?? quantityOf(item),
    rarity: RarityService.normalize(item),
    priceLabel: priceLabel(item),
    level: levelOf(item),
    type: item.type,
    typeLabel: typeLabel(item),
    preset,
    icon: presentations.get(preset)?.icon ?? "fa-solid fa-cube",
    traits: traitsOf(item),
    hidden: false
  };
}

/** Lo que ve un jugador mientras el objeto no esta revelado: ningun dato real. */
export function toConcealedViewModel(item) {
  return {
    id: item.id,
    uuid: null,
    name: game.i18n.localize("VLR.Unknown.Name"),
    image: null,
    quantity: 1,
    rarity: RarityService.unknown(),
    priceLabel: "",
    level: null,
    type: "unknown",
    typeLabel: "???",
    preset: "generic",
    icon: "fa-solid fa-question",
    traits: [],
    hidden: true
  };
}
