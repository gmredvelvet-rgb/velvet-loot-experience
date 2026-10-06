# Velvet Loot Reveal

Presentación cinemática del botín para Foundry VTT v14: un carrusel estilo pantalla de recompensas, con el objeto seleccionado en el centro, brillo por rareza, animaciones y sonido.

Es solo una capa de presentación. Si Item Piles está activo, **Item Piles sigue siendo quien guarda los objetos, lleva las cantidades y monedas, hace las transferencias y decide los permisos**; este módulo únicamente los muestra y le pide a Item Piles que los mueva.

> El id del módulo es `velvet-loot-experience` (el nombre de la carpeta). El título visible es "Velvet Loot Reveal".

## Requisitos

- Foundry VTT v14.
- Opcional: Item Piles 3.x (probado contra la API de 3.3.4).
- Sin Item Piles funciona con actores de tipo `loot` (PF2e, SF2e).

## Cómo se abre

**Selecciona la hoja del actor:** abre **Sheet / Configurar hoja**, elige **Velvet Loot Reveal — Cofre / Botín / Vault** y guarda. La elección se aplica a ese actor y sus tokens vinculados. Para tokens no vinculados, configura la hoja en el actor del propio token. Después, GM y jugadores abrirán directamente el carrusel al abrir ese actor o interactuar con su cofre / Vault de Item Piles.

El módulo registra una hoja real basada en `ActorSheetV2`. La selección se guarda mediante la configuración nativa de Foundry; también puede elegirse como hoja por defecto de un tipo de actor. No se cambian automáticamente las hojas de otros actores.

| Desde | Qué aparece |
| --- | --- |
| Abrir un actor con la hoja Velvet seleccionada | El carrusel directamente |
| Interacción con una pila, cofre o Vault de Item Piles con la hoja Velvet seleccionada | El carrusel directamente para quien interactúa |
| Contenedor con otra hoja seleccionada | Su interfaz habitual |
| Clic derecho en el directorio de actores (GM) | "Mostrar a los jugadores" |
| Macro | `game.modules.get("velvet-loot-experience").api.open(actor)` |

Dentro del carrusel, **Abrir hoja de botín normal** abre la interfaz habitual de Item Piles o una hoja alternativa del sistema sin modificar la selección guardada. El GM dispone de **Configurar hoja** para cambiarla después.

### Presentación épica y jugadores (0.2.0)

Las cartas incorporan marcos ornamentales por rareza, esquinas metálicas, sellos de tipo, anillos arcanos, reflejos y flotación del objeto central. La selección aumenta su tamaño y recibe un pulso al navegar; las partículas están limitadas para evitar acumulación al usar la rueda. Todo se ejecuta en cada cliente, incluidos los jugadores.

Desde 0.3.0, la selección en **Sheet** determina la apertura; los antiguos ajustes de ofrecer / abrir automáticamente ya no intervienen. Los jugadores pueden navegar y recoger si los ajustes del mundo lo permiten y tienen un personaje propio. Se conserva el personaje inspector elegido por Item Piles. Sin Item Piles, los actores nativos `loot` usan la hoja seleccionada; la transferencia remota requiere un GM conectado y los permisos de botín del sistema.

Los efectos respetan los ajustes personales de animación, partículas y brillo, además del movimiento reducido del sistema. Los objetos ocultos usan un marco neutro sin revelar su tipo o rareza.

Validación del protocolo de recogida: `node tools/test-player-loot.mjs` (usa documentos simulados; no modifica el mundo).

## Controles

| Tecla / gesto | Acción |
| --- | --- |
| ← → | Objeto anterior / siguiente |
| Enter | Revelar si el objeto está oculto; si no, recogerlo |
| Escape | Cerrar |
| Rueda del ratón, deslizar | Navegar |
| Clic en una carta lateral | Traerla al centro |
| Clic en la carta central | Inspeccionar (o revelar si está oculta) |

Recoger entrega el montón completo al personaje asignado al usuario o, si no tiene, al primer token propio seleccionado.

## Modos de revelado

- **Inmediato**: todo se ve desde el principio.
- **Interacción del jugador**: cada jugador descubre los objetos en su propia pantalla.
- **Controlado por el GM**: los jugadores ven `???` / "Objeto desconocido" hasta que el GM pulsa **Revelar** (o **Revelar todo**). El revelado llega a todos a la vez.

El GM puede mostrar un botín a todos los jugadores, a jugadores concretos, a los dueños de un personaje o solo a sí mismo. Con "Sincronizar el revelado" activo, el carrusel de los jugadores sigue la selección del GM y se cierra con el suyo.

## Ajustes

De mundo: activar el módulo, integración con Item Piles, modo de revelado, sincronización, navegación y recogida de los jugadores, y qué datos se muestran (precio, cantidad, nivel, rasgos). La hoja se elige en la configuración **Sheet** de cada actor.

De cliente: sonidos (general, volumen, por rareza, navegación, recogida), animaciones, partículas y brillo de rareza. La preferencia de movimiento reducido del sistema operativo se respeta siempre.

## Sonidos

Los `.wav` de `assets/audio` son originales, con diseño por capas de aire, impactos, resonancias metálicas, tonos sostenidos y reverberación estéreo. Se generan con `node tools/make-sounds.mjs` en PCM de 16 bits / 48 kHz, sin muestras externas ni dependencias.

La navegación utiliza tres variantes por dirección, también al usar teclado, rueda o deslizar. Cada rareza tiene su propio revelado; **Recoger todo** tiene una confirmación diferente. La recogida suena cuando la transferencia se confirma. El audio es local para GM y jugadores y respeta los ajustes personales y el canal de interfaz de Foundry.

Comprobación técnica y de reproducción: `node tools/test-audio.mjs`. Véase [SOUND_DESIGN.md](SOUND_DESIGN.md) para la paleta y mezcla. Para usar otros sonidos, sustituye los archivos conservando el nombre.

## Convivencia con Velvet Shopping Experience

Ambos módulos pueden escuchar el mismo hook de Item Piles (`preRenderInterface`) y el primero que lo cancela se queda con la apertura. Velvet Loot solo intercepta pilas, cofres y Vaults con su hoja seleccionada. Si Shopping intercepta también esos contenedores, desactiva la captura de pilas en Shopping para que se respete esta selección.

## Más documentación

- [ARCHITECTURE.md](ARCHITECTURE.md): cómo está organizado el código.
- [DEV_NOTES.md](DEV_NOTES.md): APIs usadas, protocolo de socket, limitaciones.
- [CHANGELOG.md](CHANGELOG.md)
