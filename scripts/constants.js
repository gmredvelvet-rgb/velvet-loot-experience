/**
 * Constantes compartidas.
 *
 * MODULE_ID tiene que coincidir con el nombre de la carpeta y con el `id` de
 * module.json: Foundry no carga un modulo cuyo id difiera de su carpeta. Si el
 * modulo se renombra, estos son los dos unicos sitios que hay que tocar.
 */

export const MODULE_ID = "velvet-loot-experience";
export const MODULE_TITLE = "Velvet Loot Reveal";
export const LOOT_SHEET_ID = `${MODULE_ID}.LootCarouselApplication`;

/** Match Foundry's per-document override or the selected default for its type. */
export function usesLootSheet(actor) {
  const sheets = CONFIG.Actor?.sheetClasses?.[actor?.type ?? "base"] ?? {};
  const override = actor?.getFlag("core", "sheetClass");
  if (override && sheets[override]) return override === LOOT_SHEET_ID;
  const entries = Object.values(sheets);
  return (entries.find((sheet) => sheet.default) ?? entries.find((sheet) => sheet.canBeDefault) ?? entries.at(-1))?.id === LOOT_SHEET_ID;
}

/** Canal de socket del modulo (requiere `"socket": true` en module.json). */
export const SOCKET = `module.${MODULE_ID}`;

export const ACTIONS = Object.freeze({
  OPEN: "OPEN",
  CLOSE: "CLOSE",
  NAVIGATE: "NAVIGATE",
  REVEAL: "REVEAL",
  TAKE: "TAKE",
  REFRESH: "REFRESH",
  PLAYER_OPENED: "PLAYER_OPENED"
});

export const REVEAL_MODES = Object.freeze({
  IMMEDIATE: "immediate",
  PLAYER: "player",
  GM: "gm"
});

export const TEMPLATES = Object.freeze({
  CAROUSEL: `modules/${MODULE_ID}/templates/loot-carousel.hbs`
});

export const setting = (key) => game.settings.get(MODULE_ID, key);

export const loc = (key, data) => (data
  ? game.i18n.format(`VLR.${key}`, data)
  : game.i18n.localize(`VLR.${key}`));

export const warn = (...args) => console.warn(`${MODULE_ID} |`, ...args);
