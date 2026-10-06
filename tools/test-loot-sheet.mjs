import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {
  on: (name, callback) => hooks.set(name, callback),
  once: (name, callback) => hooks.set(name, callback)
};
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settings = { enabled: true, itemPiles: true, sounds: false, animations: false, rarityGlow: true, particles: true };
globalThis.game = {
  user: { isGM: false }, modules: new Map([["item-piles", { active: true }]]),
  settings: { get: (_, key) => settings[key], register: () => {} },
  i18n: { localize: (key) => key }, itempiles: { API: {
    isItemPileLootable: (actor) => actor.kind === "chest",
    isItemPileVault: (actor) => actor.kind === "vault",
    getActorItems: () => [], getActorCurrencies: () => []
  } }
};
class ApplicationV2 {
  constructor(options) { this.options = options; this.id = options.id; this.rendered = false; }
  async render() { if (!this.isVisible) throw new Error("private"); this.rendered = true; return this; }
  async close(options) { this.rendered = false; this._onClose(options); return this; }
  _onClose() {}
  async _onRender() {}
}
class DocumentSheetV2 extends ApplicationV2 {
  constructor(options) { super(options); this.document = options.document; }
  get isVisible() { return this.document.allowed; }
}
class ActorSheetV2 extends DocumentSheetV2 { get actor() { return this.document; } }
const registrations = [];
globalThis.foundry = {
  applications: {
    api: { ApplicationV2, DocumentSheetV2, HandlebarsApplicationMixin: (base) => base },
    sheets: { ActorSheetV2 },
    apps: { DocumentSheetConfig: { registerSheet: (...args) => registrations.push(args) } },
    handlebars: { loadTemplates: async () => {} }
  },
  utils: { debounce: (fn) => fn }
};
globalThis.Actor = class Actor {};
globalThis.CONFIG = { Actor: { sheetClasses: { loot: {} } } };
globalThis.window = { removeEventListener: () => {}, matchMedia: () => ({ matches: false }) };
const { LOOT_SHEET_ID, usesLootSheet } = await import("../scripts/constants.js");
const { LootCarouselApplication } = await import("../scripts/applications/loot-carousel.js");
const { ItemPilesAdapter } = await import("../scripts/integrations/item-piles-adapter.js");
await import("../scripts/main.js");
hooks.get("init")();
assert.equal(registrations.length, 1);
assert.equal(registrations[0][0], Actor);
assert.equal(registrations[0][2], LootCarouselApplication);
assert.equal(registrations[0][3].makeDefault, false);
assert.ok(LootCarouselApplication.prototype instanceof DocumentSheetV2);
CONFIG.Actor.sheetClasses.loot = {
  normal: { id: "normal", default: true, canBeDefault: true },
  [LOOT_SHEET_ID]: { id: LOOT_SHEET_ID, cls: LootCarouselApplication, canBeDefault: true }
};
const actor = Object.assign(new Actor(), {
  uuid: "Actor.chest", type: "loot", name: "Chest", allowed: true, kind: "chest",
  override: LOOT_SHEET_ID, getFlag() { return this.override; }, items: { filter: () => [] }
});
actor.sheet = new LootCarouselApplication({ document: actor });
assert.equal(actor.sheet.document, actor);
assert.equal(actor.sheet.actor, actor);
assert.ok(usesLootSheet(actor));
assert.equal(await LootCarouselApplication.open(actor), actor.sheet, "API reuses selected sheet");
await actor.sheet.close();
await actor.sheet.render({ force: true });
await actor.sheet.close();
assert.equal(actor.sheet.rendered, false, "Cached sheet can reopen and close repeatedly");
actor.allowed = false;
await assert.rejects(actor.sheet.render({ force: true }), /private/);
await LootCarouselApplication.open(actor, { externalAccess: true });
await actor.sheet.close();
assert.equal(actor.sheet.isVisible, false, "External opening authorization clears on close");
actor.allowed = true;

let interactions = 0;
ItemPilesAdapter.onInteract(() => { interactions++; return true; });
const interact = hooks.get("item-piles-preRenderInterface");
assert.equal(interact(actor, false), false, "Chosen chest sheet replaces native interface");
actor.kind = "vault";
assert.equal(interact(actor, false), false, "Chosen vault sheet replaces native interface");
actor.override = "normal";
assert.equal(interact(actor, false), undefined, "Unselected vault retains normal interface");
actor.override = LOOT_SHEET_ID;
actor.kind = "merchant";
assert.equal(interact(actor, false), undefined, "Merchant interface stays native");
assert.equal(interactions, 2);
actor.kind = "vault";
game.itempiles.API.renderItemPileInterface = async () => interact(actor, false);
assert.equal(await ItemPilesAdapter.openNative(actor), undefined, "Normal vault bypasses interception without recursion");
assert.equal(interact(actor, false), false, "Bypass is consumed for one opening only");
actor.override = null;
CONFIG.Actor.sheetClasses.loot.normal.default = false;
CONFIG.Actor.sheetClasses.loot[LOOT_SHEET_ID].default = true;
assert.equal(usesLootSheet(actor), true, "Type default also selects Reveal");
actor.override = "normal";
assert.equal(usesLootSheet(actor), false, "Actor override takes precedence over type default");
const { LootService } = await import("../scripts/services/loot-service.js");
settings.itemPiles = false;
actor.override = LOOT_SHEET_ID;
class NormalSheet extends DocumentSheetV2 {}
CONFIG.Actor.sheetClasses.loot.normal.cls = NormalSheet;
const fallback = await LootService.openNative(actor, null);
assert.ok(fallback instanceof NormalSheet, "Native fallback renders an alternative instead of recursing into Reveal");
assert.equal(fallback.document, actor);
assert.equal(actor.override, LOOT_SHEET_ID, "Normal opening does not change the saved selection");
console.log("PASS: Foundry sheet registration, document constructor, cached reopening, permissions, chest/vault selection, defaults and native bypass");
