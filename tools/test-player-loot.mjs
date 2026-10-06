import assert from "node:assert/strict";

// Foundry globals mocked at the socket boundary; no world documents are changed.
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settings = { enabled: true, playerPickup: true, revealMode: "immediate", itemPiles: false };
const player = { id: "player", isGM: false };
const gm = { id: "gm", isGM: true };
let receive;
const sent = [];
globalThis.game = {
  user: player,
  users: { activeGM: { isSelf: false }, get: (id) => ({ player, gm })[id] },
  modules: new Map(),
  settings: { get: (_, key) => settings[key] },
  i18n: { localize: (key) => key },
  socket: { on: (_, callback) => { receive = callback; }, emit: (_, data) => sent.push(data) }
};
globalThis.foundry = { utils: {
  randomID: () => "request-1", fromUuid: async (uuid) => documents.get(uuid),
  getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object)
} };
globalThis.Actor = class Actor {};
const item = { id: "item", type: "equipment", system: { quantity: 1 } };
const pile = Object.assign(new Actor(), {
  uuid: "Actor.pile", type: "loot", items: { filter: (fn) => [item].filter(fn) },
  testUserPermission: () => true
});
const recipient = Object.assign(new Actor(), { uuid: "Actor.hero", testUserPermission: () => true });
const documents = new Map([[pile.uuid, pile], [recipient.uuid, recipient]]);
const { LootService } = await import("../scripts/services/loot-service.js");
const { RevealService } = await import("../scripts/services/reveal-service.js");
RevealService.init({});

const taking = LootService.takeItem(pile, item, 1, recipient);
const request = sent.at(-1);
assert.equal(request.action, "TAKE");
let transfers = 0;
LootService.transferNative = async () => { transfers++; };
game.user = gm;
game.users.activeGM.isSelf = true;
await receive(request, player.id);
const response = sent.at(-1);
assert.equal(response.ok, true);
assert.equal(response.actorUuid, pile.uuid);
assert.equal(transfers, 1);
game.user = player;
game.users.activeGM.isSelf = false;
await receive(response, gm.id);
assert.equal(await taking, true, "Player request resolves instead of timing out");

const blocked = LootService.takeItem(pile, item, 1, recipient);
const blockedAssertion = assert.rejects(blocked, /NoPickup/);
const blockedRequest = sent.at(-1);
game.user = gm;
game.users.activeGM.isSelf = true;
settings.playerPickup = false;
const originalWarn = console.warn;
console.warn = () => {};
await receive(blockedRequest, player.id);
console.warn = originalWarn;
const rejection = sent.at(-1);
game.user = player;
game.users.activeGM.isSelf = false;
await receive(rejection, gm.id);
await blockedAssertion;
assert.equal(transfers, 1, "Disabled player pickup never transfers items");
console.log("PASS: player pickup acknowledgement and GM permission rejection");
