# Changelog

## 0.4.0

- Al abrir el carrusel como GM, se muestra automáticamente a todos los jugadores conectados; nuevo ajuste de mundo activado por defecto. Las pilas cerradas de Item Piles no se muestran solas.
- Cuando un jugador abre un botín por su cuenta, cada GM conectado recibe un aviso con el jugador y el botín; nuevo ajuste de mundo activado por defecto. La opción `notifyGM: false` de la API lo silencia para una apertura.
- Las aperturas manuales con destinatarios concretos conservan su selección y los refrescos del inventario no vuelven a abrir el botín en otros clientes.

## 0.3.0

- Velvet Loot Reveal registrado como hoja real `ActorSheetV2`, seleccionable desde Sheet / Configurar hoja.
- La elección por actor o por tipo determina la apertura directa para GM y jugadores.
- Integración con cofres y Vaults de Item Piles; los contenedores con otra hoja conservan su interfaz habitual.
- Retirados el diálogo de elección, los botones auxiliares de cabecera / HUD y los ajustes visibles de apertura automática.
- Botón Configurar hoja para el GM dentro del carrusel y apertura de hoja normal sin recursión.
- Ciclo de vida de documento, reutilización de la hoja y reapertura después de cerrar.
- Pruebas de registro, selección, permisos, cofres, Vaults y retorno a la interfaz normal.

## 0.2.1

- Nueva paleta original de 18 sonidos estéreo a 48 kHz: aire, metal, impactos y reverberación.
- Tres variantes de navegación por dirección, sin repetición inmediata en la misma dirección y con límite para entradas rápidas.
- Siete sonidos de revelado: común, poco común, raro, muy raro, único, legendario y artefacto.
- Confirmación específica para recoger todo; el sonido de recogida se reproduce después de confirmar la transferencia.
- Reproducción local en el canal de interfaz; capturados los errores asíncronos de carga.
- Validación automática de archivos, mezcla, variantes, rarezas, silenciamiento y reproducción local.

## 0.2.0

- Marcos ornamentales por rareza, filigrana, sellos y reflejos animados.
- Carta central más grande, flotación del objeto, anillos arcanos y pulso al navegar.
- Partículas de navegación limitadas a 64 nodos por carrusel y diseño adaptable a pantallas pequeñas.
- Misma presentación para GM y jugadores; apertura automática por defecto en mundos nuevos.
- Corregida la respuesta del GM a la recogida nativa: ahora incluye el UUID de la pila y resuelve la petición del jugador.
- Conservado el personaje inspector de Item Piles al abrir y recoger.
- Actualizaciones agrupadas sin perder cambios entre varias pilas.
- Prueba de recogida remota y rechazo cuando se desactiva la recogida de jugadores.

## 0.1.0

Primera versión.

- Carrusel cinemático de botín con cinco posiciones visibles y profundidad por transformaciones CSS.
- Panel de información con nombre, rareza, precio y, opcionalmente, nivel, cantidad y rasgos.
- Integración con Item Piles a través de un adaptador aislado; backend nativo para actores de tipo `loot`.
- Recoger, recoger todo, inspeccionar y abrir la hoja de botín normal.
- Navegación con teclado, rueda y deslizamiento.
- Animaciones de apertura, navegación, revelado, recogida y cierre; sonidos por categoría y rareza.
- Revelado sincronizado: modos inmediato, interacción del jugador y controlado por el GM.
- El GM puede mostrar el botín a todos, a jugadores concretos, a los dueños de un personaje o solo a sí mismo.
- Rareza normalizada para PF2e, SF2e, D&D 5e y sistemas genéricos.
- Traducciones en inglés y español.
