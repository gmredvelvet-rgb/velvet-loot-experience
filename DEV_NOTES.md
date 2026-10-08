# Notas de desarrollo

Versiones inspeccionadas en esta instalación: Foundry 14.368, Item Piles 3.3.4, PF2e 8.5.1, dnd5e 6.0.5.

## Estado de las pruebas

Comprobado: sintaxis de todos los scripts, JSON de manifiesto e idiomas, claves de traducción y compilación de la plantilla con datos de ejemplo.

**No comprobado: el módulo todavía no se ha ejecutado dentro de un mundo de Foundry.** Las llamadas a las APIs están verificadas leyendo el código fuente instalado, no ejecutándolas.

## Id del módulo

El plan pedía el id `velvet-loot-reveal`, pero la carpeta es `velvet-loot-experience` y Foundry no carga un módulo cuyo id no coincida con su carpeta. Se usa el nombre de la carpeta. Para cambiarlo: renombrar la carpeta y editar `id` en `module.json` y `MODULE_ID` en `scripts/constants.js`. El canal de socket se deriva del id.

## API de Item Piles usada

Todo en `scripts/integrations/item-piles-adapter.js`, todo de `game.itempiles.API`:

| Método | Uso |
| --- | --- |
| `isItemPileLootable(target)` | Detectar pila o contenedor (excluye mercaderes y vaults) |
| `isItemPileLocked(target)` | Bloquear la recogida en contenedores cerrados con llave |
| `getActorItems(target)` | Objetos de la pila, ya sin monedas ni tipos filtrados |
| `getItemQuantity(item)` | Cantidad según el atributo configurado por sistema |
| `getActorCurrencies(target)` | Monedas de la pila, para mostrarlas |
| `transferItems(source, target, [{ _id, quantity }])` | Recoger un objeto |
| `transferEverything(source, target)` | Recoger todo, monedas incluidas |
| `renderItemPileInterface(target, { inspectingTarget })` | Abrir la ventana normal |

Hook: `item-piles-preRenderInterface` (`game.itempiles.hooks.PRE_RENDER_INTERFACE`), que recibe `(target, inspectingTarget)` y admite `false` para cancelar la ventana de Item Piles. `inspectingTarget` llega como `false`, no `null`, cuando no hay personaje.

`transferItems` y `transferEverything` se ejecutan como GM por el socket de Item Piles (`executeAsGM`) con `game.user.id` como autor. Por eso el adaptador no recibe un usuario: siempre es el que llama. No se lee ni se escribe ningún flag de Item Piles.

## APIs de Foundry v14 usadas

| API | Uso |
| --- | --- |
| `foundry.applications.api.ApplicationV2` + `HandlebarsApplicationMixin` | El carrusel, con `window: { frame: false, positioned: false }` |
| `foundry.applications.api.DialogV2.wait` / `.prompt` | Diálogo de oferta y de destinatarios |
| `foundry.applications.ux.FormDataExtended` | Leer el formulario de destinatarios |
| `foundry.applications.handlebars.loadTemplates` | Precarga de la plantilla |
| `foundry.audio.AudioHelper.play` / `.preloadSound` | Sonidos en el canal `interface` |
| `foundry.utils.fromUuid`, `debounce`, `randomID`, `escapeHTML`, `getProperty`, `setProperty` | Utilidades |
| `game.socket.emit` / `.on` | Protocolo propio |
| `game.users.activeGM` | Decidir qué GM atiende las peticiones |
| Hook `getActorSheetHeaderButtons` | Botón en hojas AppV1 (PF2e) |
| Hook `getHeaderControlsActorSheetV2` | Botón en hojas AppV2 |
| Hook `renderTokenHUD` | Botón en el Token HUD (`.col.right`) |
| Hook `getActorContextOptions` | Menú contextual, con entradas `{ label, icon, visible, onClick }` |
| Hooks `createItem`, `updateItem`, `deleteItem`, `updateActor`, `deleteActor`, `deleteToken` | Refrescar carruseles abiertos |

No se parchea ninguna clase. La única dependencia de algo no del todo público es `ApplicationV2._maxZ`: `bringToFront()` no hace nada en aplicaciones sin marco, así que el carrusel toma su `z-index` de ese contador para quedar encima de lo ya abierto y debajo de lo que se abra después (la ficha de un objeto al inspeccionar). El propio núcleo lo marca como transitorio; si desaparece, basta con fijar un `z-index` en el CSS.

## Protocolo de socket

Canal: `module.velvet-loot-experience`. Cada mensaje es `{ action, sender, users?, ... }`. Si `users` está presente, solo esos clientes lo procesan.

| Acción | Dirección | Datos | Efecto |
| --- | --- | --- | --- |
| `OPEN` | GM → jugadores | `actorUuid`, `state` | Abre el carrusel con el estado de revelado |
| `CLOSE` | GM → jugadores | `actorUuid` | Lo cierra |
| `NAVIGATE` | GM → jugadores | `actorUuid`, `itemId` | Mueve la selección |
| `REVEAL` | GM → todos | `actorUuid`, `itemIds` | Marca objetos como revelados |
| `REFRESH` | jugador → GM | `request: true`, `actorUuid` | Pide el estado de revelado |
| `REFRESH` | GM → jugador | `actorUuid`, `state` | Lo entrega |
| `PLAYER_OPENED` | jugador → GMs | `actorUuid` | Avisa de que el jugador abrió ese botín por su cuenta |
| `TAKE` | jugador → GM | `requestId`, `actorUuid`, `itemId`, `quantity`, `recipientUuid` | Pide una recogida nativa |
| `TAKE` | GM → jugador | `result: true`, `requestId`, `ok`, `error` | Resultado |

`state` es `{ revealed: string[], selected: string | null }`.

Validación:

- `OPEN`, `CLOSE`, `NAVIGATE`, `REVEAL`, la respuesta de `REFRESH` y el resultado de `TAKE` se ignoran si el emisor no es GM.
- `PLAYER_OPENED` solo lo atienden los clientes GM y solo si el emisor no es GM; muestra un aviso y nunca abre nada.
- Las peticiones de jugador solo las atiende el GM activo (`game.users.activeGM.isSelf`).
- Una petición `TAKE` se rechaza salvo que: el módulo y la recogida de jugadores estén activos; el actor sea un actor de botín nativo; el emisor sea dueño del destinatario; el emisor pueda saquear el actor (`isLootableBy` en PF2e, permiso `LIMITED` en el resto); el objeto siga en la pila; esté revelado si el modo es "controlado por el GM"; y la cantidad sea un entero entre 1 y lo disponible.
- Las pilas de Item Piles nunca pasan por `TAKE`: las mueve y valida Item Piles.

## Limitaciones conocidas

- **Ocultar es cosmético.** Los objetos de una pila ya están en el cliente del jugador como documentos; el modo "controlado por el GM" no los pinta, pero un jugador con la consola abierta puede leerlos.
- **Item Piles no conoce el modo de revelado.** Con Item Piles, un jugador podría recoger un objeto sin revelar llamando a su API directamente. La validación de "revelado" solo se aplica a la vía nativa.
- **Identidad del emisor.** El receptor usa el id de usuario que Foundry pasa como segundo argumento del manejador y solo recurre a `data.sender` si no llega. No se pudo confirmar en el servidor (viene empaquetado) que v14 lo envíe siempre; si no lo hiciera, `sender` sería falsificable por un cliente modificado.
- **El estado de revelado vive en memoria.** Si el GM recarga, se pierde qué estaba revelado.
- **Recoger entrega el montón entero.** No hay selector de cantidad.
- **Ofrecer / abrir automáticamente solo existe para Item Piles**, que es quien tiene un hook de interacción. Los actores de botín nativos se abren desde los botones.
- **Conflicto con Velvet Shopping Experience** en el hook `preRenderInterface`: gana el primero que lo cancela.
- **Item Piles necesita un GM conectado** para cualquier transferencia; la vía nativa también cuando el jugador no es dueño de la pila.
- `assets/ui` no existe: todo el aspecto es CSS, no hay imágenes.

## Compatibilidad

- PF2e / SF2e: las hojas siguen siendo AppV1; la transferencia nativa usa `actor.transferItemToActor(target, item, quantity)`.
- dnd5e: no tiene actores de botín, así que solo aplica con Item Piles. Su tipo `equipment` mezcla armaduras y baratijas; se distinguen por `system.type.value`.
- Otros sistemas: rareza y precio se buscan en rutas habituales; lo que no se encuentra se muestra como común y sin precio.

## Ideas para más adelante

- Guardar el estado de revelado en un flag del actor para que sobreviva a una recarga.
- Selector de cantidad al recoger de un montón.
- Reparto del botín entre el grupo desde el carrusel.
- Presentaciones propias por tipo (marco de arma, pergamino para conjuros).
- Marcos y fondos ilustrados en `assets/ui`.
- Elegir los archivos de sonido desde los ajustes.
- Ordenar el carrusel por rareza.
