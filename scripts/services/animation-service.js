/**
 * Animaciones puntuales con Web Animations API. No hay bucles de render: cada
 * animacion empieza con un evento (abrir, navegar, revelar, recoger, cerrar) y
 * termina sola. El desplazamiento de las cartas lo hacen transiciones CSS.
 */

import { setting } from "../constants.js";

const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const finished = (animation) => animation?.finished.catch(() => {}) ?? Promise.resolve();

function run(element, keyframes, options) {
  if (!element) return null;
  return element.animate(keyframes, { easing: EASE_OUT, fill: "backwards", ...options });
}

const RISE = [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }];

export const AnimationService = {
  /** Falso si el usuario las apago o el sistema pide movimiento reducido. */
  get enabled() {
    return setting("animations") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  /** Secuencia de apertura: fondo, banner, cartas, foco, brillo y textos. */
  open(root) {
    if (!this.enabled) return Promise.resolve();
    const last = [run(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 })];

    run(root.querySelector(".vlr-banner"), [{ opacity: 0, transform: "translateY(60px)" }, { opacity: 1, transform: "none" }],
      { duration: 380, delay: 150 });

    for (const card of root.querySelectorAll(".vlr-card")) {
      const offset = Number(card.dataset.pos);
      if (!Number.isFinite(offset)) continue;
      const frame = card.querySelector(".vlr-card__frame");
      if (offset === 0) {
        run(frame, [
          { opacity: 0, transform: "scale(0.7)" },
          { opacity: 1, transform: "scale(1.08)", offset: 0.7 },
          { opacity: 1, transform: "none" }
        ], { duration: 420, delay: 400 });
        run(card.querySelector(".vlr-card__glow"), [{ opacity: 0, transform: "scale(0.5)" }, {}], { duration: 600, delay: 500 });
      } else {
        run(frame, [{ opacity: 0, transform: "translateY(26px) scale(0.85)" }, { opacity: 1, transform: "none" }],
          { duration: 320, delay: 250 + Math.abs(offset) * 50 });
      }
    }

    run(root.querySelector('[data-field="name"]'), RISE, { duration: 300, delay: 550 });
    run(root.querySelector('[data-field="rarity"]'), RISE, { duration: 300, delay: 650 });
    last.push(run(root.querySelector(".vlr-banner__meta"), RISE, { duration: 300, delay: 750 }));
    run(root.querySelector(".vlr-actions"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 800 });

    return finished(last.at(-1));
  },

  /** Refresca los textos del banner y da un pulso al brillo de la carta nueva. */
  navigate(root, direction = 1) {
    if (!this.enabled) return;
    const slide = [{ opacity: 0, transform: `translateX(${direction * 16}px)` }, { opacity: 1, transform: "none" }];
    for (const selector of ['[data-field="name"]', '[data-field="rarity"]', ".vlr-banner__meta", '[data-field="traits"]']) {
      run(root.querySelector(selector), slide, { duration: 240 });
    }
    run(root.querySelector('.vlr-card[data-pos="0"] .vlr-card__glow'), [{ opacity: 0.2, transform: "scale(0.8)" }, {}], { duration: 420 });
    const frame = root.querySelector('.vlr-card[data-pos="0"] .vlr-card__frame');
    frame?.getAnimations().forEach((animation) => animation.cancel());
    run(frame, [
      { transform: "scale(.92)", filter: "brightness(1)" },
      { transform: "scale(1.065)", filter: "brightness(1.35)", offset: .55 },
      { transform: "none", filter: "brightness(1)" }
    ], { duration: 500 });
  },

  /** Carta que aparece de golpe tras dar la vuelta al carrusel. */
  fadeIn(card) {
    if (!this.enabled) return;
    run(card, [{ opacity: 0 }, {}], { duration: 260 });
  },

  /** El objeto se alza, destella y se desvanece. */
  pickup(card, delay = 0) {
    const frame = card?.querySelector(".vlr-card__frame");
    if (!this.enabled || !frame) return Promise.resolve();
    run(card.querySelector(".vlr-card__glow"), [{}, { opacity: 0, transform: "scale(1.6)" }], { duration: 520, delay, fill: "both" });
    return finished(run(frame, [
      { transform: "none", filter: "brightness(1)", opacity: 1 },
      { transform: "translateY(-28px) scale(1.08)", filter: "brightness(2.4)", opacity: 1, offset: 0.45 },
      { transform: "translateY(-72px) scale(0.9)", filter: "brightness(3)", opacity: 0 }
    ], { duration: 520, delay, fill: "both", easing: "ease-in" }));
  },

  /** Giro y destello al descubrir un objeto oculto. */
  reveal(card) {
    if (!this.enabled || !card) return;
    run(card.querySelector(".vlr-card__frame"), [
      { transform: "rotateY(90deg) scale(0.9)", filter: "brightness(2.6)" },
      { transform: "rotateY(0deg) scale(1.06)", filter: "brightness(1.4)", offset: 0.7 },
      { transform: "none", filter: "none" }
    ], { duration: 520 });
    run(card.querySelector(".vlr-card__glow"), [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1.35)", offset: 0.5 }, {}],
      { duration: 800 });
  },

  /** Rafaga de particulas que suben y se apagan; se eliminan al terminar. */
  particles(container, rarity) {
    const count = Math.min(48, Math.max(0, Math.trunc(Number(rarity?.visualPreset?.particles) || 0)));
    if (!this.enabled || !setting("particles") || !container || !count) return;
    // Rapid wheel navigation must not accumulate hundreds of particle nodes.
    while (container.children.length > 64 - count) container.firstElementChild.remove();
    for (let i = 0; i < count; i++) {
      const particle = document.createElement("span");
      particle.className = "vlr-particle";
      particle.style.setProperty("--vlr-rarity", rarity.visualPreset.color);
      container.append(particle);
      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 160;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance - 60;
      particle.animate([
        { transform: "translate(0, 0) scale(1)", opacity: 0.95 },
        { transform: `translate(${x}px, ${y}px) scale(0.2)`, opacity: 0 }
      ], { duration: 700 + Math.random() * 600, easing: "ease-out" }).finished
        .catch(() => {})
        .then(() => particle.remove());
    }
  },

  close(root) {
    if (!this.enabled || !root) return Promise.resolve();
    return finished(run(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards", easing: "ease-in" }));
  }
};
