# Auditoría de presentación y jugadores — 0.2.0

> Actualización 0.3.0: Reveal es una hoja real seleccionable en **Sheet**. La selección del actor determina la apertura directa, incluidos los Vaults. Los antiguos ajustes de apertura automática y los botones de cabecera / HUD fueron retirados. Las instrucciones anteriores sobre apertura automática son históricas. Ver README.md y `node tools/test-loot-sheet.mjs`.

## Corregido

- La respuesta a `TAKE` del GM no incluía `actorUuid`. El receptor descartaba el mensaje antes de resolver la promesa, incluso después de transferir el objeto. Ahora incluye el UUID; una prueba ejecuta el recorrido jugador → GM → jugador y verifica su resolución.
- Se ignoraba el personaje inspector enviado por Item Piles. Ahora se conserva para la recogida, con comprobación de propiedad y exclusión de la propia pila.
- Un único debounce de actualizaciones descartaba cambios de otras pilas. Ahora agrupa los UUID afectados y refresca todos.
- La navegación rápida podía acumular partículas. Se limita a 64 nodos por contenedor y se limita también el número por ráfaga.
- Se reservaban capas de composición para todas las cartas. Ahora `will-change` se aplica solo a las cinco posiciones visibles.

## Presentación

Marcos por rareza, filigrana, esquinas, sellos de tipo, anillos arcanos, reflejos, flotación del icono y mayor escala de selección. Los efectos se ejecutan en el cliente tanto para GM como para jugadores, conservando los ajustes individuales y el movimiento reducido. Los objetos ocultos usan datos neutros.

## Verificado

- Sintaxis de todos los scripts con `node --check`.
- Recogida nativa remota y rechazo con `playerPickup` desactivado: `node tools/test-player-loot.mjs`.
- Plantilla Handlebars real compilada con datos de ejemplo y CSS real en navegador: selección y navegación; imágenes cargadas; vista de escritorio y pantalla de 390 × 720 sin desbordamiento horizontal y con botones dentro de la pantalla.

## Pendiente de prueba en mesa

La revisión visual utiliza datos de ejemplo y no una sesión autenticada del mundo. Debe verificarse con GM y jugador conectados: apertura por Item Piles, revelado controlado por GM, recogida hacia el personaje inspector, monedas y cambios simultáneos entre clientes. No se cambiaron permisos de actores ni los ajustes guardados del mundo.

En mundos existentes, activar **Abrir automáticamente** si se quiere entrar directamente al carrusel desde Item Piles. Sin Item Piles, usar el botón de la cabecera del actor de botín. La API de Item Piles sigue siendo responsable de permisos y transferencias.
