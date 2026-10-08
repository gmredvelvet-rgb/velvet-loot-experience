/**
 * Revelado sincronizado y protocolo de socket.
 *
 * El GM activo es la unica autoridad: solo el decide que esta revelado, a quien
 * se le abre el carrusel y si una peticion de recogida es valida. Los clientes
 * ignoran cualquier orden de GM que no venga de un usuario GM.
 * El protocolo completo esta documentado en DEV_NOTES.md.
 */

import { ACTIONS, REVEAL_MODES, SOCKET, loc, setting, warn } from "../constants.js";
import { LootService } from "./loot-service.js";

const TAKE_TIMEOUT = 10000;

/** Estado por pila: que objetos estan revelados y a quien se le esta mostrando. */
const sessions = new Map();

/** Peticiones de recogida a la espera de respuesta del GM. */
const pending = new Map();

/** Puente hacia la interfaz; lo instala main.js para no importar la aplicacion aqui. */
let ui = {
  open: async () => {},
  close: () => {},
  revealed: () => {},
  navigate: () => {}
};

function session(actorUuid) {
  let state = sessions.get(actorUuid);
  if (!state) {
    state = { revealed: new Set(), users: [], selected: null };
    sessions.set(actorUuid, state);
  }
  return state;
}

const serialize = (state) => ({ revealed: [...state.revealed], selected: state.selected });

/** Los revelados nunca se deshacen, asi que el estado remoto se une al local. */
function merge(actorUuid, remote) {
  const state = session(actorUuid);
  const added = [];
  for (const id of remote?.revealed ?? []) {
    if (typeof id !== "string" || state.revealed.has(id)) continue;
    state.revealed.add(id);
    added.push(id);
  }
  if (typeof remote?.selected === "string") state.selected = remote.selected;
  return added;
}

function emit(action, payload = {}) {
  game.socket.emit(SOCKET, { action, sender: game.user.id, ...payload });
}

const isActiveGM = () => Boolean(game.users.activeGM?.isSelf);

/* -------------------------------------------- */
/*  Recogida validada por el GM                 */
/* -------------------------------------------- */

async function enactTake(data, sender) {
  const reply = (ok, error = null) => emit(ACTIONS.TAKE, {
    result: true,
    actorUuid: data.actorUuid,
    requestId: data.requestId,
    ok,
    error,
    users: [sender.id]
  });

  try {
    if (!setting("enabled") || !setting("playerPickup")) throw new Error(loc("Warn.NoPickup"));

    const actor = await foundry.utils.fromUuid(data.actorUuid);
    const recipient = await foundry.utils.fromUuid(data.recipientUuid);
    if (!(actor instanceof Actor) || !(recipient instanceof Actor)) throw new Error(loc("Warn.InvalidRequest"));

    // Las pilas de Item Piles nunca pasan por aqui: las valida y mueve Item Piles.
    if (!LootService.isLootActor(actor) || LootService.backendId(actor) !== "native") {
      throw new Error(loc("Warn.InvalidRequest"));
    }
    if (!recipient.testUserPermission(sender, "OWNER")) throw new Error(loc("Warn.NotOwner"));

    const lootable = typeof actor.isLootableBy === "function"
      ? actor.isLootableBy(sender)
      : actor.testUserPermission(sender, "LIMITED");
    if (!lootable) throw new Error(loc("Warn.NotLootable"));

    const item = LootService.getItems(actor).find((candidate) => candidate.id === data.itemId);
    if (!item) throw new Error(loc("Warn.ItemGone"));
    if (setting("revealMode") === REVEAL_MODES.GM && !session(actor.uuid).revealed.has(item.id)) {
      throw new Error(loc("Warn.NotRevealed"));
    }

    const quantity = Math.trunc(Number(data.quantity));
    if (!(quantity >= 1) || quantity > LootService.getQuantity(actor, item)) throw new Error(loc("Warn.InvalidRequest"));

    await LootService.transferNative(actor, item, quantity, recipient);
    reply(true);
  } catch (error) {
    warn(`Recogida rechazada para ${sender.name}:`, error);
    reply(false, error.message);
  }
}

function requestTake(actor, item, quantity, recipient) {
  if (!game.users.activeGM) return Promise.reject(new Error(loc("Warn.NoGM")));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(loc("Warn.Timeout")));
    }, TAKE_TIMEOUT);
    pending.set(requestId, { resolve, reject, timer });
    emit(ACTIONS.TAKE, {
      requestId,
      actorUuid: actor.uuid,
      itemId: item.id,
      quantity,
      recipientUuid: recipient.uuid
    });
  });
}

function settleTake(data) {
  const request = pending.get(data.requestId);
  if (!request) return;
  pending.delete(data.requestId);
  clearTimeout(request.timer);
  if (data.ok) request.resolve(true);
  else request.reject(new Error(data.error || loc("Warn.InvalidRequest")));
}

/* -------------------------------------------- */
/*  Receptor                                    */
/* -------------------------------------------- */

async function onMessage(data, userId) {
  // Foundry entrega el id del emisor como segundo argumento; `data.sender` solo
  // es el respaldo por si un servidor antiguo no lo manda.
  const sender = game.users.get(userId ?? data?.sender);
  if (!sender || typeof data?.action !== "string") return;
  if (Array.isArray(data.users) && !data.users.includes(game.user.id)) return;
  if (!setting("enabled")) return;

  // Peticiones de jugador: solo las atiende el GM activo.
  if (data.action === ACTIONS.TAKE && !data.result) {
    if (isActiveGM()) await enactTake(data, sender);
    return;
  }
  if (data.action === ACTIONS.REFRESH && data.request) {
    if (isActiveGM() && typeof data.actorUuid === "string") {
      emit(ACTIONS.REFRESH, { actorUuid: data.actorUuid, state: serialize(session(data.actorUuid)), users: [sender.id] });
    }
    return;
  }

  // Aviso de un jugador que abrio un botin por su cuenta: solo informa a los GM.
  if (data.action === ACTIONS.PLAYER_OPENED) {
    if (!game.user.isGM || sender.isGM || typeof data.actorUuid !== "string") return;
    const actor = await foundry.utils.fromUuid(data.actorUuid);
    if (actor instanceof Actor) globalThis.ui.notifications.info(loc("Notify.PlayerOpened", { player: sender.name, actor: actor.name }));
    return;
  }

  // Todo lo demas son ordenes del GM.
  if (!sender.isGM || typeof data.actorUuid !== "string") return;

  switch (data.action) {
    case ACTIONS.TAKE:
      return settleTake(data);
    case ACTIONS.OPEN: {
      merge(data.actorUuid, data.state);
      const actor = await foundry.utils.fromUuid(data.actorUuid);
      if (actor instanceof Actor) await ui.open(actor);
      return;
    }
    case ACTIONS.CLOSE:
      return ui.close(data.actorUuid);
    case ACTIONS.NAVIGATE:
      if (typeof data.itemId === "string") ui.navigate(data.actorUuid, data.itemId);
      return;
    case ACTIONS.REVEAL:
      return ui.revealed(data.actorUuid, merge(data.actorUuid, { revealed: data.itemIds }));
    case ACTIONS.REFRESH:
      return ui.revealed(data.actorUuid, merge(data.actorUuid, data.state));
  }
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

export const RevealService = {
  init(bridge) {
    ui = { ...ui, ...bridge };
    game.socket.on(SOCKET, onMessage);
    LootService.setRemoteTake(requestTake);
  },

  /** El GM siempre ve los objetos reales; el resto depende del modo. */
  isRevealed(actorUuid, itemId) {
    if (game.user.isGM || setting("revealMode") === REVEAL_MODES.IMMEDIATE) return true;
    return session(actorUuid).revealed.has(itemId);
  },

  /** Para el GM: objeto que los jugadores todavia ven como "???". */
  isPending(actorUuid, itemId) {
    return game.user.isGM && setting("revealMode") === REVEAL_MODES.GM && !session(actorUuid).revealed.has(itemId);
  },

  /** Puede este cliente descubrir el objeto por si mismo. */
  canRevealLocally() {
    return !game.user.isGM && setting("revealMode") === REVEAL_MODES.PLAYER;
  },

  /**
   * Revela objetos. El GM lo difunde a todos; un jugador en modo "interaccion
   * del jugador" solo lo descubre en su propia pantalla.
   */
  reveal(actor, itemIds) {
    const added = merge(actor.uuid, { revealed: itemIds });
    if (game.user.isGM) emit(ACTIONS.REVEAL, { actorUuid: actor.uuid, itemIds });
    ui.revealed(actor.uuid, game.user.isGM ? itemIds : added);
  },

  /** GM: abre el carrusel en los clientes indicados. */
  show(actor, userIds) {
    if (!game.user.isGM || !userIds.length) return;
    const state = session(actor.uuid);
    state.users = [...new Set([...state.users, ...userIds])];
    emit(ACTIONS.OPEN, { actorUuid: actor.uuid, state: serialize(state), users: userIds });
  },

  /** Jugador: avisa a los GM conectados de que ha abierto este botin por su cuenta. */
  announceOpened(actor) {
    if (game.user.isGM) return;
    const gms = game.users.filter((user) => user.active && user.isGM).map((user) => user.id);
    if (gms.length) emit(ACTIONS.PLAYER_OPENED, { actorUuid: actor.uuid, users: gms });
  },

  /** GM: cierra el carrusel en los clientes a los que se lo abrio. */
  hide(actor) {
    const state = session(actor.uuid);
    if (!game.user.isGM || !state.users.length) return;
    emit(ACTIONS.CLOSE, { actorUuid: actor.uuid, users: state.users });
    state.users = [];
  },

  /** A quien se le esta mostrando esta pila ahora mismo. */
  audience(actor) {
    return session(actor.uuid).users;
  },

  /** GM: arrastra la seleccion de los jugadores si la sincronizacion esta activa. */
  navigate(actor, itemId) {
    const state = session(actor.uuid);
    state.selected = itemId;
    if (!game.user.isGM || !setting("syncReveal") || !state.users.length) return;
    emit(ACTIONS.NAVIGATE, { actorUuid: actor.uuid, itemId, users: state.users });
  },

  selected(actor) {
    return session(actor.uuid).selected;
  },

  /** Jugador: pide al GM que objetos estan ya revelados. */
  requestState(actor) {
    if (game.user.isGM || setting("revealMode") !== REVEAL_MODES.GM) return;
    emit(ACTIONS.REFRESH, { request: true, actorUuid: actor.uuid });
  }
};
