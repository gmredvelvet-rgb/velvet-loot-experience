# Paleta sonora — 0.2.1

Diseño original mediante síntesis por capas, sin grabaciones ni muestras de terceros. Identidad: metal antiguo, aire, cristal y resonancia arcana. Se conserva espacio para la música y las voces de la mesa; las acciones frecuentes son breves y menos intensas que los revelados.

| Evento | Duración | Diseño |
| --- | --- | --- |
| Apertura | 1,45 s | Aire ascendente, impacto grave y resonancias metálicas escalonadas |
| Navegación | 0,23 s | Aire corto, golpe amortiguado y detalle metálico; tres variantes por dirección |
| Recoger | 0,80 s | Tres notas ascendentes, confirmación ligera |
| Recoger todo | 1,15 s | Secuencia más amplia con cuerpo grave |
| Cierre | 0,58 s | Aire descendente y resonancia que se apaga |
| Común | 0,85 s | Una resonancia suave |
| Poco común | 1,25 s | Tres notas abiertas |
| Raro | 1,70 s | Acorde menor, aire e impacto |
| Muy raro | 2,05 s | Registro más amplio y capa tonal sostenida |
| Único | 2,30 s | Resonancias escalonadas y mayor anchura estéreo |
| Legendario | 2,65 s | Resolución mayor, impacto grave y detalles agudos |
| Artefacto | 3,10 s | Acorde oscuro, registro grave y destellos agudos |

## Mezcla y reproducción

- WAV PCM16 estéreo, 48 kHz; paquete de 3,57 MiB.
- Ataques y finales suavizados, filtro de graves a 35 Hz, saturación suave, control de RMS y techo de pico por evento. Esto no es una medición LUFS.
- Reverberación corta y amortiguada. Los gestos estéreo de navegación son sutiles y compatibles con reproducción mono.
- Navegación limitada a un sonido cada 70 ms para evitar acumulación al mantener una tecla. Las variantes rotan en cada dirección.
- Siete revelados por identificador de rareza. Si se desactivan los sonidos por rareza, todos usan el sonido común.
- Recogida y recogida total usan el mismo ajuste de silenciamiento. Solo confirman éxito después de la operación.
- Reproducción en el canal `interface`, sin difusión de audio por socket. Cada cliente controla volumen y silenciamiento.

## Reproducción del trabajo y verificación

`node tools/make-sounds.mjs` reconstruye los 18 archivos de manera determinista.

`node tools/test-audio.mjs` verifica formato, ausencia de recorte digital, margen de pico, ausencia de offset significativo, compatibilidad mono, extremos sin discontinuidad, correspondencia con la síntesis, precarga, variantes, límite de navegación, rarezas, ajustes de silencio y manejo de errores asíncronos.

Las pruebas de integración usan una API de audio simulada. Falta escuchar y comprobar los eventos en una sesión real de Foundry con los dispositivos y volumen de la mesa.
