import assert from "node:assert/strict";

// Exercise the public sheet, module API, dialog and socket paths together.
// The mocked Foundry lifecycle calls _onRender only after a successful render.
const hooks = new Map();
globalThis.Hooks = {
  on: (name, callback) => hooks.set(name, callback),
  once: (name, callback) => hooks.set(name, callback)
};
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settings = {};
const registrations = new Map();
const sent = [];
const notifications = [];
const infoNotifications = [];
const documents = new Map();
const pendingRenders = [];
let receive;
let dialogForm;
const gm = { id: "gm", name: "GM", active: true, isGM: true };
const otherGM = { id: "other-gm", name: "Other GM", active: true, isGM: true };
const player1 = { id: "player-1", name: "One", active: true, isGM: false };
const player2 = { id: "player-2", name: "Two", active: true, isGM: false };
const offline = { id: "offline", name: "Offline", active: false, isGM: false };
const offlineGM = { id: "offline-gm", name: "Offline GM", active: false, isGM: true };
const users = [gm, otherGM, player1, player2, offline, offlineGM];
users.get = (id) => users.find((user) => user.id === id);
users.activeGM = { ...gm, isSelf: true };
globalThis.game = {
  user: gm,
  users,
  actors: {
    get: (id) => [...documents.values()].find((actor) => actor.id === id),
    filter: (predicate) => [...documents.values()].filter(predicate)
  },
  modules: new Map([["velvet-loot-experience", { active: true }]]),
  settings: {
    get: (_, key) => settings[key],
    register: (_, key, data) => {
      registrations.set(key, data);
      settings[key] = data.default;
    }
  },
  i18n: { localize: (key) => key, format: (key, data) => `${key} ${Object.values(data).join(" ")}` },
  socket: { on: (_, callback) => { receive = callback; }, emit: (_, data) => sent.push(structuredClone(data)) }
};
globalThis.ui = { notifications: {
  error: (message) => notifications.push(message),
  info: (message) => infoNotifications.push(message)
} };
globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const root = () => ({
  classList: { toggle() {} }, style: {}, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => []
});
class ApplicationV2 {
  static _maxZ = 100;
  constructor(options) {
    this.options = options;
    this.id = options.id;
    this.rendered = false;
    this.element = root();
  }
  render(options = {}) {
    const rendering = (async () => {
      // Foundry returns the unrendered sheet when its permission check aborts.
      if (!this.isVisible) return this;
      if (this.document.failRender) throw new Error("render failed");
      const isFirstRender = !this.rendered;
      const context = await this._prepareContext();
      this.rendered = true;
      await this._onRender(context, { ...options, isFirstRender });
      return this;
    })();
    pendingRenders.push(rendering);
    return rendering;
  }
  async close(options) { this.rendered = false; this._onClose(options); return this; }
  _onClose() {}
  async _onRender() {}
}
class DocumentSheetV2 extends ApplicationV2 {
  constructor(options) { super(options); this.document = options.document; }
  get isVisible() { return this.document.allowed; }
}
class ActorSheetV2 extends DocumentSheetV2 { get actor() { return this.document; } }
globalThis.foundry = {
  applications: {
    api: { ApplicationV2, DocumentSheetV2, HandlebarsApplicationMixin: (base) => base,
      DialogV2: { prompt: async () => dialogForm } },
    sheets: { ActorSheetV2 },
    apps: { DocumentSheetConfig: { registerSheet() {} } },
    handlebars: { loadTemplates: async () => {} }
  },
  utils: { debounce: (fn) => fn, escapeHTML: (text) => text, fromUuid: async (uuid) => documents.get(uuid) }
};
globalThis.Actor = class Actor {};
globalThis.CONFIG = { Actor: { sheetClasses: { loot: {} } } };
const { MODULE_ID, LOOT_SHEET_ID } = await import("../scripts/constants.js");
const { LootCarouselApplication } = await import("../scripts/applications/loot-carousel.js");
const { showToPlayers } = await import("../scripts/hooks.js");
await import("../scripts/main.js");
hooks.get("init")();
assert.equal(registrations.get("autoShowPlayers")?.default, true, "Automatic sharing is enabled by default");
assert.equal(registrations.get("autoShowPlayers")?.scope, "world", "The GM controls automatic sharing for the world");
assert.equal(registrations.get("autoShowPlayers")?.type, Boolean);
Object.assign(settings, { sounds: false, animations: false, itemPiles: false });
hooks.get("ready")();
const api = game.modules.get(MODULE_ID).api;
CONFIG.Actor.sheetClasses.loot[LOOT_SHEET_ID] = { id: LOOT_SHEET_ID, cls: LootCarouselApplication, default: true };

function createActor(id, extra = {}) {
  const actor = Object.assign(new Actor(), {
    id, uuid: `Actor.${id}`, name: id, type: "loot", allowed: true,
    getFlag: () => LOOT_SHEET_ID, items: { filter: () => [] }, ...extra
  });
  actor.sheet = new LootCarouselApplication({ document: actor });
  documents.set(actor.uuid, actor);
  return actor;
}
const opens = (actor) => sent.filter((message) => message.action === "OPEN" && message.actorUuid === actor.uuid);
const openedAlerts = (actor) => sent.filter((message) => message.action === "PLAYER_OPENED" && message.actorUuid === actor.uuid);
const expectRecipients = (actor, recipients, label) => {
  assert.deepEqual(opens(actor).map((message) => message.users), recipients, label);
};
const flush = async () => { await Promise.allSettled(pendingRenders.splice(0)); };

const direct = createActor("direct");
await direct.sheet.render({ force: true });
expectRecipients(direct, [[player1.id, player2.id]], "Opening the selected sheet shares once with every active player, excluding GMs and offline users");
await direct.sheet.render();
direct.sheet.refresh();
await flush();
await api.open(direct);
expectRecipients(direct, [[player1.id, player2.id]], "Refreshes and an already-open API call do not send another opening");
await direct.sheet.close();
await direct.sheet.render({ force: true });
expectRecipients(direct, [[player1.id, player2.id], [player1.id, player2.id]], "A cached sheet shares again after closing and reopening");

for (const key of ["autoShowPlayers", "enabled"]) {
  settings[key] = false;
  const actor = createActor(`disabled-${key}`);
  await api.open(actor);
  expectRecipients(actor, [], `${key}=false disables automatic sharing`);
  settings[key] = true;
}
const local = createActor("local-api");
await api.open(local, { autoShow: false });
expectRecipients(local, [], "An explicit local API opening does not share");
await local.sheet.close();
await api.open(local);
expectRecipients(local, [[player1.id, player2.id]], "Local suppression does not leak into the next normal opening");

game.user = player1;
const playerOpened = createActor("player-opened");
await api.open(playerOpened);
expectRecipients(playerOpened, [], "A player opening loot never broadcasts it to others");
assert.deepEqual(openedAlerts(playerOpened).map((message) => message.users), [[gm.id, otherGM.id]], "A local player opening notifies every active GM only");
await api.open(playerOpened);
await playerOpened.sheet.render();
playerOpened.sheet.refresh();
await flush();
assert.equal(openedAlerts(playerOpened).length, 1, "Refreshes and opening an already-visible sheet do not notify again");
await playerOpened.sheet.close();
await api.open(playerOpened);
assert.equal(openedAlerts(playerOpened).length, 2, "Closing and reopening locally notifies the GMs again");

const muted = createActor("player-muted");
await api.open(muted, { notifyGM: false });
assert.equal(openedAlerts(muted).length, 0, "Explicit notification suppression is respected");
await muted.sheet.close();
await api.open(muted);
assert.equal(openedAlerts(muted).length, 1, "Notification suppression does not leak into later openings");

settings.enabled = false;
const disabledPlayer = createActor("player-disabled");
await disabledPlayer.sheet.render({ force: true });
assert.equal(openedAlerts(disabledPlayer).length, 0, "Disabled modules never notify GMs");
settings.enabled = true;
gm.active = otherGM.active = false;
const withoutGM = createActor("player-without-gm");
await api.open(withoutGM);
assert.equal(withoutGM.sheet.rendered, true, "A player can open the sheet without a connected GM");
assert.equal(openedAlerts(withoutGM).length, 0, "No notice is emitted without connected GMs");
gm.active = otherGM.active = true;

const playerError = console.error;
console.error = () => {};
try {
  for (const [reason, extra] of [["permission", { allowed: false }], ["error", { failRender: true }]]) {
    const actor = createActor(`player-failed-${reason}`, extra);
    await api.open(actor);
    assert.equal(actor.sheet.rendered, false);
    assert.equal(openedAlerts(actor).length, 0, "An unsuccessful player opening never notifies GMs");
  }
} finally {
  console.error = playerError;
}

game.user = gm;
const openingNotice = openedAlerts(playerOpened)[0];
await receive(openingNotice, player1.id);
assert.equal(infoNotifications.length, 1, "The GM receives a player-opening notification");
assert.ok(infoNotifications[0].includes(player1.name), "The notification identifies the player");
assert.ok(infoNotifications[0].includes(playerOpened.name), "The notification identifies the loot actor");
expectRecipients(playerOpened, [], "Delivering the notice never opens the loot on other clients");
assert.equal(openedAlerts(direct).length, 0, "GM openings never notify other GMs");
player1.active = player2.active = false;
const alone = createActor("no-players");
await api.open(alone);
expectRecipients(alone, [], "No OPEN is emitted when no players are connected");
player1.active = player2.active = true;

for (const recipient of [player1, otherGM]) {
  game.user = recipient;
  const actor = createActor(`remote-${recipient.id}`, { allowed: false });
  await receive({ action: "OPEN", actorUuid: actor.uuid, sender: gm.id, users: [recipient.id], state: {} }, gm.id);
  assert.equal(actor.sheet.rendered, true, "An authenticated remote opening grants access to the shared actor");
  expectRecipients(actor, [], "A remotely opened sheet never rebroadcasts, even on another GM client");
  assert.equal(openedAlerts(actor).length, 0, "Remote openings never trigger player-opened notifications");
}
game.user = gm;

const character = createActor("hero", {
  type: "character", hasPlayerOwner: true, testUserPermission: (user) => user.id === player1.id
});
for (const [name, form, recipients] of [
  ["all", { target: "all" }, [[player1.id, player2.id]]],
  ["selected", { target: "users", [`user-${player2.id}`]: true }, [[player2.id]]],
  ["character", { target: "character", character: character.id }, [[player1.id]]],
  ["local", { target: "local" }, []],
  ["cancelled", null, []]
]) {
  const actor = createActor(`manual-${name}`);
  dialogForm = form;
  await showToPlayers(actor);
  expectRecipients(actor, recipients, `Manual ${name} sharing respects exactly the chosen audience`);
  assert.equal(actor.sheet.rendered, Boolean(form), "Cancelling the dialog does not open the sheet");
}
const targeted = createActor("targeted-api");
await api.show(targeted, [player1.id]);
expectRecipients(targeted, [[player1.id]], "Targeted API sharing sends one OPEN only to its requested audience");
const empty = createActor("empty-api");
await api.show(empty);
expectRecipients(empty, [], "API show with an empty audience stays local");

const originalError = console.error;
console.error = () => {};
try {
  for (const [name, operation] of [
    ["normal", (actor) => api.open(actor)],
    ["targeted", (actor) => api.show(actor, [player1.id])],
    ["manual", (actor) => { dialogForm = { target: "all" }; return showToPlayers(actor); }]
  ]) {
    for (const [reason, properties] of [["error", { failRender: true }], ["permission", { allowed: false }]]) {
      const actor = createActor(`failed-${name}-${reason}`, properties);
      await operation(actor);
      assert.equal(actor.sheet.rendered, false);
      expectRecipients(actor, [], `Failed ${name} rendering (${reason}) never sends an OPEN`);
    }
  }
} finally {
  console.error = originalError;
}
assert.equal(notifications.length, 4, "Rendering failures are reported to the initiating user");

// A locked pile (Item Piles, or any integration reporting a lock) is never shared on its own.
let lockedNow = true;
api.LootService.registerIntegration({
  id: "locked-test", isAvailable: () => true, isLootPile: (actor) => actor.id === "locked-pile",
  isLocked: () => lockedNow, getItems: () => [], getQuantity: () => 1, getCurrencies: () => []
});
const lockedPile = createActor("locked-pile");
await api.open(lockedPile);
assert.equal(lockedPile.sheet.rendered, true, "The GM can still open a locked pile");
expectRecipients(lockedPile, [], "A locked pile is not shown to players automatically");
await api.show(lockedPile, [player1.id]);
expectRecipients(lockedPile, [[player1.id]], "The GM can still share a locked pile deliberately");
await lockedPile.sheet.close();
lockedNow = false;
await api.open(lockedPile);
assert.deepEqual(opens(lockedPile).at(-1).users, [player1.id, player2.id], "Once unlocked, the pile is shared again");
await flush();
console.log("PASS: automatic sharing, locked piles, player-opening GM notifications, first render/reopening, refresh suppression, local/remote settings, manual/API targeting and failed rendering");
