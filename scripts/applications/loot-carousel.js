/**
 * Carrusel cinematico de botin (ApplicationV2 sin marco, a pantalla completa).
 *
 * La plantilla se renderiza cuando cambia el contenido de la pila. Navegar NO
 * vuelve a renderizar: solo cambia `data-pos` en cada carta y deja que las
 * transiciones CSS interpolen escala, posicion y opacidad.
 */

import { MODULE_ID, REVEAL_MODES, TEMPLATES, loc, setting } from "../constants.js";
import { AnimationService } from "../services/animation-service.js";
import { AudioService } from "../services/audio-service.js";
import { LootService } from "../services/loot-service.js";
import { RevealService } from "../services/reveal-service.js";
import { toConcealedViewModel, toViewModel } from "../utils/item-utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const VISIBLE_RANGE = 2;
const AUTO_CLOSE_DELAY = 2200;
const WHEEL_THROTTLE = 160;
const SWIPE_DISTANCE = 40;

const mod = (value, n) => ((value % n) + n) % n;

/** Distancia con signo de la carta `index` a la seleccionada, por el camino corto. */
function signedOffset(index, selected, count) {
  let offset = mod(index - selected, count);
  if (offset > count / 2) offset -= count;
  return offset;
}

export class LootCarouselApplication extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Carruseles abiertos, por uuid del actor. */
  static instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["vlr-overlay"],
    tag: "div",
    window: { frame: false, positioned: false },
    actions: {
      prev: LootCarouselApplication.#onPrev,
      next: LootCarouselApplication.#onNext,
      select: LootCarouselApplication.#onSelect,
      take: LootCarouselApplication.#onTake,
      takeAll: LootCarouselApplication.#onTakeAll,
      inspect: LootCarouselApplication.#onInspect,
      reveal: LootCarouselApplication.#onReveal,
      revealAll: LootCarouselApplication.#onRevealAll,
      share: LootCarouselApplication.#onShare,
      nativeSheet: LootCarouselApplication.#onNativeSheet,
      dismiss: LootCarouselApplication.#onDismiss
    }
  };

  static PARTS = {
    main: { template: TEMPLATES.CAROUSEL }
  };

  /** Lo instala hooks.js: dialogo del GM para elegir a quien mostrar el botin. */
  static shareHandler = null;

  constructor(actorOrOptions, options = {}) {
    const actor = actorOrOptions.document ?? actorOrOptions;
    super({ ...(actorOrOptions.document ? actorOrOptions : options), document: actor,
      id: `${MODULE_ID}-${actor.uuid.replaceAll(".", "-")}` });
  }

  #items = [];
  #index = 0;
  #selectedId = null;
  #busy = false;
  #gone = false;
  #closing = false;
  #hadItems = false;
  #closeTimer = null;
  #lastWheel = 0;
  #swipeStart = null;
  #onKeyDown = this.#handleKey.bind(this);
  #inspectingRecipient = null;
  #externalAccess = false;

  /** Item Piles already validated opening, or an authenticated GM shared it. */
  get isVisible() {
    return super.isVisible || this.#externalAccess
      || (LootService.backendId(this.actor) === "native" && this.actor.isLootableBy?.(game.user) === true);
  }

  async render(options = {}, legacyOptions = {}) {
    if (this.#busy && this.rendered) return this;
    if (!this.rendered) {
      this.#closing = false;
      this.#gone = false;
      this.#hadItems = false;
      this.#closeTimer = null;
    }
    return super.render(options, legacyOptions);
  }

  /* -------------------------------------------- */
  /*  Apertura                                    */
  /* -------------------------------------------- */

  static async open(actor, { recipient = null, externalAccess = false, autoShow = true, notifyGM = true } = {}) {
    if (!actor) return null;
    let app = this.instances.get(actor.uuid);
    if (!app) {
      app = actor.sheet instanceof this ? actor.sheet : new this(actor);
      this.instances.set(actor.uuid, app);
    }
    app.#inspectingRecipient = recipient;
    app.#externalAccess = externalAccess;
    await app.render({ force: true, autoShow, notifyGM });
    return app;
  }

  get title() {
    return this.actor.name;
  }

  get canNavigate() {
    return game.user.isGM || setting("playerNavigation");
  }

  get canTake() {
    return game.user.isGM || setting("playerPickup");
  }

  get selected() {
    return this.#items[this.#index] ?? null;
  }

  /* -------------------------------------------- */
  /*  Datos                                       */
  /* -------------------------------------------- */

  #buildItems() {
    if (this.#gone) return [];
    const showQuantity = setting("showQuantity");
    return LootService.getItems(this.actor).map((item) => {
      const revealed = RevealService.isRevealed(this.actor.uuid, item.id);
      const vm = revealed
        ? toViewModel(item, { quantity: LootService.getQuantity(this.actor, item) })
        : toConcealedViewModel(item);
      vm.pending = RevealService.isPending(this.actor.uuid, item.id);
      vm.showQuantity = revealed && showQuantity && vm.quantity > 1;
      return vm;
    });
  }

  /** Conserva el objeto seleccionado; si ya no existe, se queda en su hueco (el siguiente). */
  #restoreSelection() {
    const found = this.#items.findIndex((item) => item.id === this.#selectedId);
    this.#index = found >= 0 ? found : Math.clamp(this.#index, 0, Math.max(this.#items.length - 1, 0));
    this.#selectedId = this.selected?.id ?? null;
  }

  /** @override */
  async _prepareContext() {
    this.#items = this.#buildItems();
    if (this.#selectedId === null) this.#selectedId = RevealService.selected(this.actor);
    this.#restoreSelection();

    const isGM = game.user.isGM;
    return {
      actorName: this.actor.name,
      items: this.#items,
      empty: !this.#items.length,
      currencies: this.#gone ? "" : LootService.getCurrencies(this.actor).join(" · "),
      isGM,
      gmMode: isGM && setting("revealMode") === REVEAL_MODES.GM,
      canTake: this.canTake,
      canNavigate: this.canNavigate && this.#items.length > 1
    };
  }

  /** Vuelve a leer la pila. Durante una recogida se pospone para no cortar la animacion. */
  refresh() {
    if (!this.rendered || this.#closing || this.#busy) return; // #transfer renderiza al terminar.
    this.render();
  }

  /** La pila ya no existe (Item Piles borra las vacias). */
  markGone() {
    this.#gone = true;
    this.refresh();
  }

  /* -------------------------------------------- */
  /*  Render                                      */
  /* -------------------------------------------- */

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    LootCarouselApplication.instances.set(this.actor.uuid, this);
    const root = this.element;
    root.classList.toggle("vlr-reduced", !AnimationService.enabled);
    root.classList.toggle("vlr-no-glow", !setting("rarityGlow"));
    root.classList.toggle("vlr-no-particles", !setting("particles"));
    this.#syncDom();

    if (options.isFirstRender) {
      this.#onOpen();
      // Una pila cerrada no se ensena sola: el GM puede mirarla sin abrirsela a la mesa.
      if (game.user.isGM && setting("enabled") && setting("autoShowPlayers") && options.autoShow !== false
        && !LootService.isLocked(this.actor)) {
        const players = game.users.filter((user) => user.active && !user.isGM);
        RevealService.show(this.actor, players.map((user) => user.id));
      } else if (!game.user.isGM && setting("enabled") && setting("notifyGMOnOpen") && options.notifyGM !== false) {
        RevealService.announceOpened(this.actor);
      }
    }

    if (this.#items.length) {
      this.#hadItems = true;
    } else if (this.#hadItems && !this.#closeTimer) {
      // La pila se vacio mientras estaba abierta: "LOOT COLLECTED" y a cerrar.
      this.#closeTimer = setTimeout(() => this.close(), AUTO_CLOSE_DELAY);
    }
  }

  #onOpen() {
    const root = this.element;
    // Sin marco, ApplicationV2.bringToFront no hace nada: se toma un z-index del
    // mismo contador para quedar sobre lo ya abierto y bajo lo que se abra despues.
    root.style.zIndex = String(++ApplicationV2._maxZ);

    window.addEventListener("keydown", this.#onKeyDown, { capture: true });
    root.addEventListener("wheel", this.#handleWheel.bind(this), { passive: true });
    root.addEventListener("pointerdown", (event) => { this.#swipeStart = event.clientX; });
    root.addEventListener("pointerup", this.#handleSwipe.bind(this));

    AudioService.preload();
    AudioService.play("OPEN");
    AnimationService.open(root);

    const first = this.selected;
    if (first && !first.hidden) {
      setTimeout(() => {
        if (!this.rendered || this.selected?.id !== first.id) return;
        AudioService.play("REVEAL", { rarity: first.rarity });
        AnimationService.particles(root.querySelector(".vlr-particles"), first.rarity);
      }, AnimationService.enabled ? 500 : 0);
    }

    RevealService.requestState(this.actor);
    root.querySelector(".vlr-track")?.focus({ preventScroll: true });
  }

  /** Aplica la seleccion actual al DOM: posiciones, banner y estado de botones. */
  #syncDom({ direction = 0 } = {}) {
    const root = this.element;
    const count = this.#items.length;
    const cards = root.querySelectorAll(".vlr-card");

    cards.forEach((card, index) => {
      const offset = signedOffset(index, this.#index, count);
      const visible = Math.abs(offset) <= VISIBLE_RANGE;
      const previous = card.dataset.offset === undefined ? null : Number(card.dataset.offset);

      // Una carta que da la vuelta al carrusel no debe cruzar por delante del centro.
      if (previous !== null && Math.abs(previous - offset) > 1 && visible) {
        card.classList.add("vlr-no-transition");
        void card.offsetWidth;
        requestAnimationFrame(() => card.classList.remove("vlr-no-transition"));
        AnimationService.fadeIn(card);
      }

      card.dataset.offset = String(offset);
      card.dataset.pos = visible ? String(offset) : offset < 0 ? "out-left" : "out-right";
      card.setAttribute("aria-selected", String(offset === 0));
      card.id = `${this.id}-card-${index}`;
      if (offset === 0) root.querySelector(".vlr-track")?.setAttribute("aria-activedescendant", card.id);

      // Carga perezosa: solo las cartas visibles y sus vecinas piden su imagen.
      const img = card.querySelector("img[data-src]");
      if (img && Math.abs(offset) <= VISIBLE_RANGE + 1) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
    });

    this.#syncBanner(root);
    this.#syncButtons(root);
    if (direction) AnimationService.navigate(root, direction);
  }

  #syncBanner(root) {
    const banner = root.querySelector(".vlr-banner");
    const item = this.selected;
    if (!banner || !item) return;

    banner.className = `vlr-banner ${item.rarity.cssClass}`;
    root.style.setProperty("--vlr-focus-color", item.rarity.visualPreset.color);
    const set = (field, text) => {
      const node = banner.querySelector(`[data-field="${field}"]`);
      if (node) node.textContent = text ?? "";
    };
    const meta = (name, show) => banner.querySelector(`[data-meta="${name}"]`)?.toggleAttribute("hidden", !show);

    set("type", item.typeLabel);
    set("position", `${this.#index + 1} / ${this.#items.length}`);
    banner.querySelector('[data-field="icon"]')?.setAttribute("class", `vlr-banner__icon ${item.icon}`);
    set("name", item.hidden ? "???" : item.name);
    set("rarity", item.hidden ? loc("Unknown.Name") : item.rarity.label);

    set("cost", item.priceLabel || "—");
    meta("cost", !item.hidden && setting("showPrice"));
    set("level", item.level ?? "");
    meta("level", !item.hidden && setting("showLevel") && item.level !== null);
    set("quantity", item.quantity);
    meta("quantity", !item.hidden && setting("showQuantity") && item.quantity > 1);

    const traits = banner.querySelector('[data-field="traits"]');
    if (traits) {
      const chips = !item.hidden && setting("showTraits") ? item.traits : [];
      traits.replaceChildren(...chips.map((label) => {
        const chip = document.createElement("span");
        chip.className = "vlr-trait";
        chip.textContent = label;
        return chip;
      }));
    }
  }

  #syncButtons(root) {
    const item = this.selected;
    const button = (action) => root.querySelector(`.vlr-actions [data-action="${action}"]`);
    const hidden = !item || item.hidden;
    const locked = Boolean(item) && LootService.isLocked(this.actor);

    const take = button("take");
    if (take) take.disabled = hidden || locked;
    const inspect = button("inspect");
    if (inspect) inspect.disabled = hidden;

    // Recoger todo se llevaria tambien lo que el jugador aun no ha visto.
    const takeAll = button("takeAll");
    if (takeAll) takeAll.disabled = locked || this.#items.some((entry) => entry.hidden);

    const reveal = button("reveal");
    if (reveal) reveal.hidden = !item || !(item.pending || (item.hidden && RevealService.canRevealLocally()));
    const revealAll = button("revealAll");
    if (revealAll) revealAll.hidden = !this.#items.some((entry) => entry.pending);
  }

  /* -------------------------------------------- */
  /*  Navegacion                                  */
  /* -------------------------------------------- */

  /**
   * @param {number} delta             Pasos (negativo = izquierda).
   * @param {object} [options]
   * @param {boolean} [options.remote] Orden del GM: salta el permiso del jugador y no se reemite.
   */
  navigate(delta, { remote = false } = {}) {
    const count = this.#items.length;
    if (!this.rendered || count < 2 || this.#busy || !delta) return;
    if (!remote && !this.canNavigate) return;

    this.#index = mod(this.#index + delta, count);
    this.#selectedId = this.selected.id;
    this.#syncDom({ direction: Math.sign(delta) });
    AudioService.play("NAVIGATE", { direction: Math.sign(delta) });
    if (!this.selected.hidden) AnimationService.particles(this.element.querySelector(".vlr-particles"), this.selected.rarity);
    if (!remote) RevealService.navigate(this.actor, this.#selectedId);
  }

  /** Lleva la seleccion a un objeto concreto por el camino mas corto. */
  selectById(itemId, options) {
    const index = this.#items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    this.navigate(signedOffset(index, this.#index, this.#items.length), options);
  }

  #handleKey(event) {
    if (!this.rendered || this.#closing) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    // Una ventana abierta encima (la ficha de un objeto) se queda con sus teclas.
    const foreign = target?.closest(".application, .window-app");
    if (foreign && foreign !== this.element) return;

    switch (event.key) {
      case "ArrowLeft":
        this.navigate(-1);
        break;
      case "ArrowRight":
        this.navigate(1);
        break;
      case "Enter":
        // Sobre un boton, Enter ya lo pulsa el navegador.
        if (target?.closest("button, a")) return;
        this.#primary();
        break;
      case "Escape":
        this.close();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  #handleWheel(event) {
    const now = Date.now();
    if (now - this.#lastWheel < WHEEL_THROTTLE) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    this.#lastWheel = now;
    this.navigate(Math.sign(delta));
  }

  #handleSwipe(event) {
    if (this.#swipeStart === null) return;
    const distance = event.clientX - this.#swipeStart;
    this.#swipeStart = null;
    if (Math.abs(distance) >= SWIPE_DISTANCE) this.navigate(distance < 0 ? 1 : -1);
  }

  /* -------------------------------------------- */
  /*  Acciones                                    */
  /* -------------------------------------------- */

  /** Enter: revela si hay algo que revelar; si no, recoge. */
  #primary() {
    const item = this.selected;
    if (!item) return;
    if (item.pending || (item.hidden && RevealService.canRevealLocally())) return this.#reveal([item.id]);
    if (!item.hidden) return this.#take();
  }

  #reveal(itemIds) {
    if (!itemIds.length) return;
    RevealService.reveal(this.actor, itemIds);
  }

  /** Lo llama RevealService cuando cambian los objetos revelados de esta pila. */
  async onRevealed(itemIds = []) {
    if (!this.rendered || this.#closing) return;
    await this.render();
    const item = this.selected;
    if (!item || item.hidden || !itemIds.includes(item.id)) return;
    AnimationService.reveal(this.#card(item.id));
    AnimationService.particles(this.element.querySelector(".vlr-particles"), item.rarity);
    AudioService.play("REVEAL", { rarity: item.rarity });
  }

  #card(itemId) {
    return this.element.querySelector(`.vlr-card[data-item-id="${itemId}"]`);
  }

  #recipient() {
    const preferred = this.#inspectingRecipient;
    const recipient = preferred?.isOwner && preferred.uuid !== this.actor.uuid
      ? preferred : LootService.resolveRecipient(this.actor);
    if (!recipient) ui.notifications.warn(loc("Warn.NoRecipient"));
    return recipient;
  }

  /** Ejecuta una recogida con su animacion y deja el carrusel coherente pase lo que pase. */
  async #transfer(cards, operation, sound = "PICKUP") {
    this.#busy = true;
    try {
      const animation = Promise.all(cards.map((card, index) => AnimationService.pickup(card, index * 60)));
      await operation();
      AudioService.play(sound);
      await animation;
    } catch (error) {
      console.error(`${MODULE_ID} | No se pudo recoger el botin.`, error);
      ui.notifications.error(error?.message ?? String(error));
    } finally {
      this.#busy = false;
      if (this.rendered && !this.#closing) await this.render();
    }
  }

  async #take() {
    const vm = this.selected;
    if (!vm || vm.hidden || this.#busy) return;
    if (!this.canTake) return void ui.notifications.warn(loc("Warn.NoPickup"));
    if (LootService.isLocked(this.actor)) return void ui.notifications.warn(loc("Warn.Locked"));

    const item = this.actor.items.get(vm.id);
    if (!item) return this.refresh();
    const recipient = this.#recipient();
    if (!recipient) return;

    await this.#transfer([this.#card(vm.id)], () => LootService.takeItem(this.actor, item, vm.quantity, recipient));
  }

  async #takeAll() {
    if (!this.#items.length || this.#busy || this.#items.some((item) => item.hidden)) return;
    if (!this.canTake) return void ui.notifications.warn(loc("Warn.NoPickup"));
    if (LootService.isLocked(this.actor)) return void ui.notifications.warn(loc("Warn.Locked"));
    const recipient = this.#recipient();
    if (!recipient) return;

    const cards = [...this.element.querySelectorAll(".vlr-card")].filter((card) => Number.isFinite(Number(card.dataset.pos)));
    await this.#transfer(cards, () => LootService.takeAll(this.actor, recipient), "PICKUP_ALL");
  }

  #inspect() {
    const vm = this.selected;
    if (!vm || vm.hidden) return;
    this.actor.items.get(vm.id)?.sheet?.render(true);
  }

  static #onPrev() {
    this.navigate(-1);
  }

  static #onNext() {
    this.navigate(1);
  }

  /** Clic en una carta lateral: la trae al centro. En la central: revela o inspecciona. */
  static #onSelect(event, target) {
    const itemId = target.dataset.itemId;
    if (itemId !== this.#selectedId) return this.selectById(itemId);
    const item = this.selected;
    if (item?.hidden) return this.#primary();
    return this.#inspect();
  }

  static #onTake() {
    return this.#take();
  }

  static #onTakeAll() {
    return this.#takeAll();
  }

  static #onInspect() {
    this.#inspect();
  }

  static #onReveal() {
    const item = this.selected;
    if (item) this.#reveal([item.id]);
  }

  static #onRevealAll() {
    this.#reveal(this.#items.filter((item) => item.pending).map((item) => item.id));
  }

  static #onShare() {
    LootCarouselApplication.shareHandler?.(this.actor);
  }

  static async #onNativeSheet() {
    const actor = this.actor;
    await this.close();
    try {
      await LootService.openNative(actor);
    } catch (error) {
      ui.notifications.error(error?.message ?? String(error));
    }
  }

  static #onDismiss() {
    this.close();
  }

  /* -------------------------------------------- */
  /*  Cierre                                      */
  /* -------------------------------------------- */

  /** @override */
  async close(options = {}) {
    if (this.#closing) return this;
    this.#closing = true;
    if (this.rendered) {
      AudioService.play("CLOSE");
      await AnimationService.close(this.element);
    }
    return super.close({ ...options, animate: false });
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    window.removeEventListener("keydown", this.#onKeyDown, { capture: true });
    clearTimeout(this.#closeTimer);
    this.#externalAccess = false;
    // Con la sincronizacion activa, el GM se lleva consigo a los jugadores.
    if (game.user.isGM && setting("syncReveal")) RevealService.hide(this.actor);
    if (LootCarouselApplication.instances.get(this.actor.uuid) === this) {
      LootCarouselApplication.instances.delete(this.actor.uuid);
    }
  }
}
