import { MODULE_ID, REVEAL_MODES } from "./constants.js";

/**
 * Lo que decide el GM para toda la mesa va en `world`; lo que es gusto de cada
 * jugador (sonido, animaciones, brillo) va en `client`.
 */
export function registerSettings(onChange = () => {}) {
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `VLR.Settings.${key}.Name`,
    hint: `VLR.Settings.${key}.Hint`,
    config: true,
    onChange,
    ...data
  });

  const toggle = (key, def, scope = "world") => register(key, { scope, type: Boolean, default: def });

  toggle("enabled", true);
  toggle("itemPiles", true);
  // Retain stored keys for compatibility; sheet selection now controls opening.
  register("autoOffer", { scope: "world", type: Boolean, default: false, config: false });
  register("autoOpen", { scope: "world", type: Boolean, default: false, config: false });

  register("revealMode", {
    scope: "world",
    type: String,
    default: REVEAL_MODES.IMMEDIATE,
    choices: {
      [REVEAL_MODES.IMMEDIATE]: "VLR.RevealMode.immediate",
      [REVEAL_MODES.PLAYER]: "VLR.RevealMode.player",
      [REVEAL_MODES.GM]: "VLR.RevealMode.gm"
    }
  });
  toggle("syncReveal", true);
  toggle("playerNavigation", true);
  toggle("playerPickup", true);

  toggle("showPrice", true);
  toggle("showQuantity", true);
  toggle("showLevel", true);
  toggle("showTraits", true);

  toggle("sounds", true, "client");
  register("volume", {
    scope: "client",
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.7
  });
  toggle("raritySounds", true, "client");
  toggle("navigationSounds", true, "client");
  toggle("pickupSounds", true, "client");

  toggle("animations", true, "client");
  toggle("particles", true, "client");
  toggle("rarityGlow", true, "client");
}
