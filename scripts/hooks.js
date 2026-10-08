/**
 * Puntos de entrada. Todo va por hooks publicos de Foundry e Item Piles; no se
 * parchea ninguna clase.
 */

import { MODULE_TITLE, loc, setting, usesLootSheet } from "./constants.js";
import { LootCarouselApplication } from "./applications/loot-carousel.js";
import { LootService } from "./services/loot-service.js";
import { RevealService } from "./services/reveal-service.js";

const offersReveal = (actor) => setting("enabled") && LootService.isLootActor(actor);

export function openReveal(actor, options = {}) {
  return LootCarouselApplication.open(actor, options).catch((error) => {
    console.error(`${MODULE_TITLE} | No se pudo abrir el carrusel.`, error);
    ui.notifications.error(`${MODULE_TITLE}: ${error?.message ?? error}`);
    return null;
  });
}

/* -------------------------------------------- */
/*  Mostrar a los jugadores (GM)                */
/* -------------------------------------------- */

function recipientsFrom(form) {
  const players = game.users.filter((user) => user.active && !user.isGM);
  switch (form.target) {
    case "all":
      return players.map((user) => user.id);
    case "users":
      return players.filter((user) => form[`user-${user.id}`]).map((user) => user.id);
    case "character": {
      const character = game.actors.get(form.character);
      return character ? players.filter((user) => character.testUserPermission(user, "OWNER")).map((user) => user.id) : [];
    }
    default:
      return []; // Solo este cliente.
  }
}

/** Dialogo para elegir destinatarios; abre el carrusel al GM y a quien se elija. */
export async function showToPlayers(actor) {
  if (!game.user.isGM) return;
  const escape = foundry.utils.escapeHTML;
  const players = game.users.filter((user) => user.active && !user.isGM);
  const characters = game.actors.filter((candidate) => candidate.hasPlayerOwner && candidate.uuid !== actor.uuid);

  const content = `
    <div class="form-group">
      <label for="vlr-target">${loc("Share.Target")}</label>
      <select id="vlr-target" name="target">
        <option value="all">${loc("Share.All")}</option>
        <option value="users">${loc("Share.Users")}</option>
        <option value="character">${loc("Share.Character")}</option>
        <option value="local">${loc("Share.Local")}</option>
      </select>
    </div>
    <fieldset>
      <legend>${loc("Share.Users")}</legend>
      ${players.map((user) => `<label class="checkbox"><input type="checkbox" name="user-${user.id}"> ${escape(user.name)}</label>`).join("")
        || `<p class="hint">${loc("Share.NoPlayers")}</p>`}
    </fieldset>
    <div class="form-group">
      <label for="vlr-character">${loc("Share.Character")}</label>
      <select id="vlr-character" name="character">
        ${characters.map((character) => `<option value="${character.id}">${escape(character.name)}</option>`).join("")}
      </select>
    </div>`;

  const form = await foundry.applications.api.DialogV2.prompt({
    window: { title: loc("Share.Title", { name: actor.name }), icon: "fa-solid fa-users" },
    content,
    ok: {
      label: loc("Share.Confirm"),
      icon: "fa-solid fa-users",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    },
    rejectClose: false
  });
  if (!form) return;

  const app = await openReveal(actor, { autoShow: false });
  if (app?.rendered) RevealService.show(actor, recipientsFrom(form));
}

/* -------------------------------------------- */
/*  Registro                                    */
/* -------------------------------------------- */

function forEachApp(actorUuid, callback) {
  const app = LootCarouselApplication.instances.get(actorUuid);
  if (app) callback(app);
}

export function registerHooks() {
  LootCarouselApplication.shareHandler = showToPlayers;

  // Menu contextual del directorio de actores.
  Hooks.on("getActorContextOptions", (directory, options) => {
    const actorOf = (li) => game.actors.get(li.dataset.entryId);
    options.push({
      label: "VLR.Action.Share",
      icon: "fa-solid fa-users",
      visible: (li) => game.user.isGM && offersReveal(actorOf(li)),
      onClick: (event, li) => showToPlayers(actorOf(li))
    });
  });

  // Interaccion con una pila (Item Piles u otra integracion).
  LootService.onInteract((actor, recipient) => {
    if (!setting("enabled")) return false;
    if (usesLootSheet(actor)) {
      openReveal(actor, { recipient, externalAccess: true });
      return true;
    }
    return false;
  });

  // Cambios en la pila mientras el carrusel esta abierto (otro jugador recoge algo).
  const dirty = new Set();
  const flush = foundry.utils.debounce(() => {
    for (const actorUuid of dirty) forEachApp(actorUuid, (app) => app.refresh());
    dirty.clear();
  }, 100);
  const refresh = (actorUuid) => { dirty.add(actorUuid); flush(); };
  const refreshFromItem = (item) => {
    if (item?.parent instanceof Actor) refresh(item.parent.uuid);
  };
  Hooks.on("createItem", refreshFromItem);
  Hooks.on("updateItem", refreshFromItem);
  Hooks.on("deleteItem", refreshFromItem);
  Hooks.on("updateActor", (actor) => refresh(actor.uuid));
  Hooks.on("deleteActor", (actor) => forEachApp(actor.uuid, (app) => app.markGone()));
  Hooks.on("deleteToken", (token) => {
    for (const app of LootCarouselApplication.instances.values()) {
      if (app.actor.token?.uuid === token.uuid) app.markGone();
    }
  });
}


