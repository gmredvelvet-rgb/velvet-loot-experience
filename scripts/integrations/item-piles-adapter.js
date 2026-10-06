/**
 * Adaptador de Item Piles. Es el UNICO archivo del modulo que conoce a Item
 * Piles; todo lo demas habla con LootService.
 *
 * Metodos verificados contra Item Piles 3.3.4 (dist/item-piles.js), todos de la
 * API publica `game.itempiles.API`. No se leen ni escriben flags a mano: las
 * transferencias las ejecuta Item Piles como GM por su propio socket.
 * La lista completa esta en DEV_NOTES.md.
 */

import { usesLootSheet } from "../constants.js";

const PRE_RENDER_INTERFACE = "item-piles-preRenderInterface";

const api = () => game.itempiles?.API;

/** Pilas que, por esta vez, debe abrir Item Piles con su propia ventana. */
const bypass = new Set();

export const ItemPilesAdapter = {
  id: "item-piles",

  isAvailable() {
    return Boolean(game.modules.get("item-piles")?.active && api());
  },

  /** Loot piles, chests and vaults. Merchant interfaces keep their own behavior. */
  isLootPile(actor) {
    if (!actor || !this.isAvailable()) return false;
    try {
      return Boolean(api().isItemPileLootable(actor) || api().isItemPileVault(actor));
    } catch {
      return false;
    }
  },

  isLocked(actor) {
    return Boolean(api().isItemPileLocked(actor));
  },

  /** Objetos de la pila ya filtrados por Item Piles (sin monedas ni tipos excluidos). */
  getItems(actor) {
    return api().getActorItems(actor);
  },

  getQuantity(item) {
    return api().getItemQuantity(item);
  },

  /** Monedas de la pila como etiquetas listas para mostrar ("12 GP"). */
  getCurrencies(actor) {
    return api().getActorCurrencies(actor)
      .filter((currency) => currency.quantity > 0)
      .map((currency) => (currency.abbreviation
        ? currency.abbreviation.replace("{#}", currency.quantity)
        : `${currency.quantity} ${currency.name}`));
  },

  /**
   * @param {Actor} actor      La pila.
   * @param {Item} item        Objeto de la pila.
   * @param {number} quantity  Unidades a transferir.
   * @param {Actor} recipient  Quien recibe. El usuario lo pone Item Piles (game.user).
   */
  takeItem(actor, item, quantity, recipient) {
    return api().transferItems(actor, recipient, [{ _id: item.id, quantity }]);
  },

  /** Objetos y monedas de una vez. */
  takeAll(actor, recipient) {
    return api().transferEverything(actor, recipient);
  },

  /** Abre la ventana normal de Item Piles saltandose nuestro interceptor. */
  async openNative(actor, recipient) {
    bypass.add(actor.uuid);
    try {
      return await api().renderItemPileInterface(actor, recipient ? { inspectingTarget: recipient } : {});
    } finally {
      bypass.delete(actor.uuid);
    }
  },

  /**
   * Avisa cuando alguien interactua con una pila. Si `handler` devuelve `true`
   * se cancela la ventana de Item Piles (el hook admite `false` para eso).
   */
  onInteract(handler) {
    const hookName = game.itempiles?.hooks?.PRE_RENDER_INTERFACE ?? PRE_RENDER_INTERFACE;
    Hooks.on(hookName, (target, inspectingTarget) => {
      if (bypass.delete(target?.uuid)) return undefined;
      if (!this.isLootPile(target)) return undefined;
      if (!usesLootSheet(target)) return undefined;
      try {
        // El hook entrega `false`, no `null`, cuando no hay personaje inspector.
        if (handler(target, inspectingTarget || null) === true) return false;
      } catch (error) {
        console.error("velvet-loot-experience | Fallo al interceptar Item Piles; se cede a su ventana.", error);
      }
      return undefined;
    });
  }
};
