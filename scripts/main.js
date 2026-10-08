/**
 * Punto de entrada de Velvet Loot Reveal.
 *
 * Este modulo es solo una capa de presentacion: quien guarda, cuenta y
 * transfiere el botin sigue siendo Item Piles (o el sistema, si no esta).
 */

import { MODULE_ID, TEMPLATES } from "./constants.js";
import { LootCarouselApplication } from "./applications/loot-carousel.js";
import { openReveal, registerHooks, showToPlayers } from "./hooks.js";
import { registerSettings } from "./settings.js";
import { AudioService } from "./services/audio-service.js";
import { LootService } from "./services/loot-service.js";
import { RarityService } from "./services/rarity-service.js";
import { RevealService } from "./services/reveal-service.js";
import { registerPresentation } from "./utils/item-utils.js";

const refreshAll = () => {
  for (const app of LootCarouselApplication.instances.values()) app.refresh();
};

Hooks.once("init", () => {
  registerSettings(refreshAll);
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, LootCarouselApplication, {
    label: "VLR.Sheet.Label", makeDefault: false, canBeDefault: true
  });
  foundry.applications.handlebars.loadTemplates([TEMPLATES.CAROUSEL]);
});

Hooks.once("ready", () => {
  RevealService.init({
    open: (actor) => openReveal(actor, { externalAccess: true, autoShow: false, notifyGM: false }),
    close: (actorUuid) => LootCarouselApplication.instances.get(actorUuid)?.close(),
    revealed: (actorUuid, itemIds) => LootCarouselApplication.instances.get(actorUuid)?.onRevealed(itemIds),
    navigate: (actorUuid, itemId) => LootCarouselApplication.instances.get(actorUuid)?.selectById(itemId, { remote: true })
  });
  registerHooks();

  game.modules.get(MODULE_ID).api = {
    /** Abre el carrusel; el GM lo muestra tambien a los jugadores por defecto. */
    open: openReveal,
    /** GM: dialogo para mostrar el botin a los jugadores. */
    showToPlayers,
    /** GM: abre el carrusel directamente a una lista de ids de usuario. */
    show: async (actor, userIds = []) => {
      const app = await openReveal(actor, { autoShow: false });
      if (app?.rendered) RevealService.show(actor, userIds);
    },
    /** GM: cierra el carrusel a quienes se les abrio. */
    hide: (actor) => RevealService.hide(actor),
    registerPresentation,
    LootService,
    RarityService,
    AudioService,
    RevealService,
    LootCarouselApplication
  };
});
