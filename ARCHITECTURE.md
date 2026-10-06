# Arquitectura

## Capas

```
hooks.js ──────────────► LootCarouselApplication ──► AnimationService
   │                          │        │           └► AudioService
   │                          │        └────────────► RevealService ──► game.socket
   │                          ▼                            │
   └────────────────────► LootService ◄────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        ItemPilesAdapter             backend nativo
        (game.itempiles.API)         (actor.items / PF2e)

item-utils.js ──► RarityService      (Item → ViewModel)
```

Regla de dependencias: la interfaz solo conoce `LootService`. Nadie fuera de `scripts/integrations/item-piles-adapter.js` nombra a Item Piles.

## Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `scripts/main.js` | Arranque: ajustes, plantilla, socket, hooks y API pública |
| `scripts/constants.js` | Id del módulo, acciones de socket, modos, atajos `setting()` y `loc()` |
| `scripts/settings.js` | Registro de ajustes |
| `scripts/hooks.js` | Puntos de entrada (cabecera, Token HUD, menú contextual, interacción con pilas), diálogo de destinatarios y refresco por cambios de documentos |
| `scripts/applications/loot-carousel.js` | `LootCarouselApplication` (ApplicationV2 sin marco) |
| `scripts/integrations/item-piles-adapter.js` | Único punto de contacto con Item Piles |
| `scripts/services/loot-service.js` | Fachada sobre el origen del botín y backend nativo |
| `scripts/services/rarity-service.js` | Rareza normalizada por sistema |
| `scripts/services/audio-service.js` | Sonidos por categoría y rareza |
| `scripts/services/animation-service.js` | Animaciones con Web Animations API |
| `scripts/services/reveal-service.js` | Estado de revelado, socket y recogida validada por el GM |
| `scripts/utils/item-utils.js` | ViewModel, precio, nivel, rasgos y presentaciones por tipo |
| `templates/loot-carousel.hbs` | Estructura del carrusel |
| `styles/loot-carousel.css` | Todo el aspecto, bajo `.vlr-overlay` |
| `tools/make-sounds.mjs` | Generador de los sonidos por defecto |

## LootService y backends

`LootService` elige un backend por actor: primero las integraciones registradas (hoy solo Item Piles, si su ajuste está activo y reconoce al actor como pila o contenedor) y, si ninguna lo reclama, el backend nativo.

Un backend expone: `isAvailable()`, `isLootPile(actor)`, `isLocked(actor)`, `getItems(actor)`, `getQuantity(item)`, `getCurrencies(actor)`, `takeItem(actor, item, quantity, recipient)`, `takeAll(actor, recipient)`, `openNative(actor, recipient)` y, opcionalmente, `onInteract(handler)`.

Una integración nueva se añade con `LootService.registerIntegration(backend)` sin tocar la interfaz.

## ViewModel

La plantilla nunca lee `item.system`. `toViewModel(item)` devuelve:

```js
{ id, uuid, name, image, quantity, rarity, priceLabel, level, type, typeLabel, preset, icon, traits, hidden }
```

`rarity` es lo que devuelve `RarityService.normalize(item)`: `{ id, label, rank, cssClass, sound, visualPreset }`.

Un objeto sin revelar usa `toConcealedViewModel(item)`, que no contiene ningún dato real: ni el nombre ni la imagen llegan al DOM.

## Carrusel

Todas las cartas están en el DOM, apiladas en el centro. `#syncDom()` calcula para cada una su distancia con signo a la seleccionada y la escribe en `data-pos` (`-2 … 2`, `out-left`, `out-right`). El CSS asigna a cada valor una transformación 3D, una opacidad y un `z-index`, y las transiciones interpolan entre ellas. Por eso navegar no vuelve a renderizar la plantilla.

La plantilla solo se renderiza cuando cambia el contenido: al recoger, al revelar o cuando otro usuario modifica la pila. La selección se conserva por id; si el objeto seleccionado desaparece, se queda el índice, que ahora ocupa el siguiente.

Las imágenes llevan `data-src` y solo se cargan cuando la carta está a tres posiciones o menos del centro.

## Presentaciones por tipo

`registerPresentation(id, { icon, types, match })` añade un estilo de presentación. Cada carta recibe la clase `vlr-preset-<id>`, lista para darle CSS propio. Las incluidas son `weapon`, `armor`, `consumable`, `treasure`, `spell`, `container` y `generic`.

## Rareza

`RarityService.register(systemId, resolver)` añade o sustituye el resolvedor de un sistema. Hay resolvedores para `pf2e`, `sf2e` y `dnd5e`, y uno genérico que prueba las rutas habituales y cae en "común".
