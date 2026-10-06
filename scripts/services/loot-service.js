/**
 * Fachada unica sobre el origen del botin. La interfaz solo habla con este
 * servicio y nunca sabe si detras hay Item Piles, un actor de botin de PF2e o
 * cualquier integracion futura.
 */

import { LOOT_SHEET_ID, loc, setting, usesLootSheet } from "../constants.js";
import { ItemPilesAdapter } from "../integrations/item-piles-adapter.js";
import { isPhysical, quantityOf, quantityPath } from "../utils/item-utils.js";

/* -------------------------------------------- */
/*  Backend nativo                              */
/* -------------------------------------------- */

/** Ejecutor remoto: lo instala RevealService para pedirle la transferencia al GM. */
let remoteTake = null;

/**
 * Mueve un objeto entre dos actores sin Item Piles. Solo debe llamarse en un
 * cliente con permiso sobre ambos (el propio GM, normalmente).
 */
async function transferNative(actor, item, quantity, recipient) {
  const available = quantityOf(item);
  const amount = Math.clamp(Math.trunc(Number(quantity)) || 1, 1, Math.max(available, 1));

  // PF2e / SF2e: metodo publico del actor, que ya sabe apilar y mover contenedores.
  if (typeof actor.transferItemToActor === "function") {
    return actor.transferItemToActor(recipient, item, amount);
  }

  const path = quantityPath(item);
  const data = item.toObject();
  delete data._id;
  if (path) foundry.utils.setProperty(data, path, amount);
  await recipient.createEmbeddedDocuments("Item", [data]);

  if (path && available - amount > 0) return item.update({ [path]: available - amount });
  return item.delete();
}

const NativeBackend = {
  id: "native",

  /** Actores de tipo "loot" (PF2e, SF2e y cualquier sistema que use ese tipo). */
  isLootPile(actor) {
    return actor?.type === "loot";
  },

  isLocked() {
    return false;
  },

  getItems(actor) {
    return actor.items.filter(isPhysical);
  },

  getQuantity(item) {
    return quantityOf(item);
  },

  getCurrencies() {
    return [];
  },

  takeItem(actor, item, quantity, recipient) {
    if (game.user.isGM || (actor.isOwner && recipient.isOwner)) {
      return transferNative(actor, item, quantity, recipient);
    }
    if (!remoteTake) throw new Error(loc("Warn.NoGM"));
    return remoteTake(actor, item, quantity, recipient);
  },

  async takeAll(actor, recipient) {
    for (const item of this.getItems(actor)) {
      await this.takeItem(actor, item, this.getQuantity(item), recipient);
    }
  },

  openNative(actor) {
    if (!usesLootSheet(actor)) return actor.sheet?.render(true);
    const alternatives = Object.values(CONFIG.Actor.sheetClasses[actor.type] ?? {})
      .filter((sheet) => sheet.id !== LOOT_SHEET_ID);
    const choice = alternatives.find((sheet) => sheet.default)
      ?? alternatives.find((sheet) => sheet.canBeDefault) ?? alternatives[0];
    if (!choice) throw new Error(loc("Warn.NoNativeSheet"));
    const isV2 = choice.cls.prototype instanceof foundry.applications.api.DocumentSheetV2;
    const sheet = isV2 ? new choice.cls({ document: actor }) : new choice.cls(actor, { editable: actor.isOwner });
    return isV2 ? sheet.render({ force: true, bypassItemPiles: true }) : sheet.render(true, { bypassItemPiles: true });
  }
};

/* -------------------------------------------- */
/*  Servicio                                    */
/* -------------------------------------------- */

/** Integraciones opcionales, por orden de prioridad. El nativo es el ultimo recurso. */
const integrations = [ItemPilesAdapter];

const integrationEnabled = (backend) => backend !== ItemPilesAdapter || setting("itemPiles");

function backendFor(actor) {
  for (const backend of integrations) {
    if (integrationEnabled(backend) && backend.isAvailable() && backend.isLootPile(actor)) return backend;
  }
  return NativeBackend;
}

export const LootService = {
  /** Anade una integracion nueva con la misma forma que ItemPilesAdapter. */
  registerIntegration(backend) {
    integrations.unshift(backend);
  },

  setRemoteTake(executor) {
    remoteTake = executor;
  },

  backendId(actor) {
    return backendFor(actor).id;
  },

  isLootActor(actor) {
    if (!actor) return false;
    return backendFor(actor) !== NativeBackend || NativeBackend.isLootPile(actor);
  },

  isLocked(actor) {
    return backendFor(actor).isLocked(actor);
  },

  getItems(actor) {
    return backendFor(actor).getItems(actor);
  },

  getQuantity(actor, item) {
    return backendFor(actor).getQuantity(item);
  },

  getCurrencies(actor) {
    try {
      return backendFor(actor).getCurrencies(actor);
    } catch {
      return [];
    }
  },

  takeItem(actor, item, quantity, recipient = this.resolveRecipient(actor)) {
    return backendFor(actor).takeItem(actor, item, quantity, recipient);
  },

  takeAll(actor, recipient = this.resolveRecipient(actor)) {
    return backendFor(actor).takeAll(actor, recipient);
  },

  /** La hoja o ventana de botin de siempre, como via de escape. */
  openNative(actor, recipient = this.resolveRecipient(actor)) {
    return backendFor(actor).openNative(actor, recipient);
  },

  /** Transferencia nativa directa; la usa el GM al atender una peticion de socket. */
  transferNative,

  /**
   * Quien recibe lo que se recoge: el personaje asignado o, si no, el primer
   * token controlado que sea propio y no sea la pila misma.
   */
  resolveRecipient(pile, user = game.user) {
    const controlled = (canvas?.tokens?.controlled ?? [])
      .map((token) => token.actor)
      .filter((actor) => actor && actor.isOwner && actor.uuid !== pile?.uuid);
    const character = user.character && user.character.uuid !== pile?.uuid ? user.character : null;
    return (user.isGM ? controlled[0] ?? character : character ?? controlled[0]) ?? null;
  },

  /**
   * Se llama cuando un backend detecta que alguien interactua con una pila.
   * `handler(actor, recipient)` devuelve `true` si nos quedamos con la apertura.
   */
  onInteract(handler) {
    for (const backend of integrations) {
      if (!backend.isAvailable() || typeof backend.onInteract !== "function") continue;
      backend.onInteract((actor, recipient) => (integrationEnabled(backend) ? handler(actor, recipient) : false));
    }
  }
};
