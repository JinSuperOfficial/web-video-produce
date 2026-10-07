# web-video-produce · Código para crear videos
<p>
<img alt="license" src="https://img.shields.io/badge/license-MIT-5eead4">
<img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-3c873a">
<img alt="ffmpeg" src="https://img.shields.io/badge/ffmpeg-%E2%89%A56-007808">
<img alt="python" src="https://img.shields.io/badge/python-%E2%89%A53.9-3776ab">
<img alt="tts" src="https://img.shields.io/badge/TTS-edge--tts%20%7C%20%E8%87%AA%E5%BB%BA%20API-f0abfc">
</p>

## Language

| Language | README | Status |
| --- | --- | --- |
| Español | Página actual | OK |
| 简体中文 | [README.md](./README.md) | OK |
| 繁體中文 | [README_ZH-HANT.md](./README_ZH-HANT.md) | OK |
| English | [README_EN.md](./README_EN.md) | OK |
| 日本語 | [README_JA.md](./README_JA.md) | IN NEED |
| 한국어 | [README_KO.md](./README_KO.md) | IN NEED |
OTHER  -  Si deseas agregar soporte para este idioma, puedes enviar un PR

> **Características principales**
> - Permitir que un LLM de solo texto genere videos (Code-To-Video)
> - Principio: usar arquitectura Web
> - Voz: edge-tts por defecto, también puedes llamar a tu propia API TTS (example.url/v1)

Deja que la IA haga videos/edición con código: guion → voz → **escribir código** → renderizado fotograma a fotograma → MP4.

![code to video](docs/images/hero.jpg)

▶ **Video de ejemplo** (11 s, voz en chino + subtítulos + música automática, todo generado por este repositorio)

[![Portada del video de ejemplo](docs/images/sample-cover.jpg)](https://www.bilibili.com/video/BV11tpw63Eoh)

- Bilibili: [BV11tpw63Eoh](https://www.bilibili.com/video/BV11tpw63Eoh)
- Archivo original: [`docs/sample-intro.mp4`](docs/sample-intro.mp4)

Una **DSH Skill** (también un proyecto ejecutable de forma independiente): convierte "escribir un guion → producir un MP4 con voz, subtítulos y música de fondo" en una tarea de código que un LLM puede completar de forma autónoma.
(En realidad quería hacer más pero no había tiempo, y tampoco tokens)

No depende de ningún software de edición, ni necesita modelos multimodales — **un LLM de solo texto puede usarlo**: leer texto, escribir código, ejecutar comandos, ver la salida de `ffprobe`, extraer fotogramas para autoverificación

---

## Índice

- [Filosofía central](#filosofía-central)
- [Dos capacidades](#dos-capacidades)
- [Inicio rápido](#inicio-rápido)
- [Flujo de trabajo](#flujo-de-trabajo)
- [Stack tecnológico](#stack-tecnológico)
- [Voz: edge-tts por defecto, también puedes cambiarlo por el tuyo](#voz-edge-tts-por-defecto-también-puedes-cambiarlo-por-el-tuyo)
- [Modo edición (basado en EDL)](#modo-edición-basado-en-edl)
- [Estructura de directorios](#estructura-de-directorios)
- [Q & A](#preguntas-frecuentes)
- [Licencia](#license)

---

## Filosofía central

Los videos no se "cortan", se **calculan con código**. Por eso es naturalmente adecuado para LLM:

1. **La línea de tiempo es la única verdad** — la duración del video la determina la voz. El orden siempre es: guion → voz → obtener el número de fotograma de cada frase → luego escribir el código visual.
2. **Cada fotograma es una función pura f(frame)** — prohibido `Math.random()`, `Date.now()`, `requestAnimationFrame` acumulando tiempo. El renderizado debe ser reproducible.
3. **Primero muestra, luego video completo** — primero renderiza 1 fotograma fijo para confirmar fuente/composición, luego 3 segundos, y solo al final el video completo.
4. **El audio se deja a herramientas profesionales** — no escribas código para sintetizar TTS, no escribas código para mezclar audio. edge-tts produce el sonido, FFmpeg remata.
5. **Entregar es verificar** — después de generar, usa `ffprobe` para reportar especificaciones, extrae fotogramas para ver la imagen, y luego entrégalo al usuario.

## Dos capacidades

| Capacidad | Entrada | Qué hace | Salida |
| --- | --- | --- | --- |
| **Generación** | Un texto / un tema | Segmentar → línea de tiempo voz+subtítulos → escribir código visual → renderizar fotograma a fotograma → componer | `output/final.mp4` |
| **Edición** | Material existente (propio/de otros) | Línea de tiempo declarativa EDL → estandarización conform → recorte/transiciones/marca de agua/relación de aspecto/compresión | `output/edit.mp4` |

Las dos rutas se pueden mezclar: los clips animados generados por Remotion se pueden escribir en la línea de tiempo de edición como material normal.

## Inicio rápido

**macOS / Linux (Bash, también válido para Git Bash / WSL en Windows)**

```bash
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) Ejecutar autoverificación: entorno / validación del proyecto / especificaciones de salida
python3 scripts/wvp.py doctor

# 2) Dependencias
npm install                     # u otro
npx remotion browser ensure     # descargar Chrome Headless Shell
python3 -m venv .venv && .venv/bin/pip install edge-tts
# Cargar entorno virtual, descargar dependencias (Edge-TTS)

# 3) Generar: voz → validación de línea de tiempo → validación estática → renderizado → añadir pista de audio → aceptación
python3 scripts/wvp.py render --out output/intro10s.mp4
#    Generar primero una muestra de 2 s a media resolución ahorra tiempo: --scale 0.5 --frames 0-60
#    Reutilizar voz existente: --no-tts

# 4) Revisar línea de tiempo: segmentos/fotogramas/palabras alineados (--verify-audio decodifica la pista de audio y mide)
python3 scripts/wvp.py timeline --words
python3 scripts/wvp.py timeline --verify-audio

# 5) Ruta de edición: primero mira los comandos, luego actúa
python3 scripts/vedit.py transitions                        # cuando no sepas qué transición usar
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json
```

**Windows PowerShell**

```powershell
git clone https://github.com/JinSuperOfficial/web-video-produce.git
cd web-video-produce

# 1) Ejecutar autoverificación: entorno / validación del proyecto / especificaciones de salida
python .\scripts\wvp.py doctor

# 2) Dependencias
npm install                     # u otro
npx remotion browser ensure     # descargar Chrome Headless Shell
python -m venv .venv
.venv\Scripts\pip.exe install edge-tts
# Cargar entorno virtual, descargar dependencias (Edge-TTS)

# 3) Generar: voz → validación de línea de tiempo → validación estática → renderizado → añadir pista de audio → aceptación
python .\scripts\wvp.py render --out output\intro10s.mp4
#    Generar primero una muestra de 2 s a media resolución ahorra tiempo: --scale 0.5 --frames 0-60
#    Reutilizar voz existente: --no-tts

# 4) Revisar línea de tiempo: segmentos/fotogramas/palabras alineados (--verify-audio decodifica la pista de audio y mide)
python .\scripts\wvp.py timeline --words
python .\scripts\wvp.py timeline --verify-audio

# 5) Ruta de edición: primero mira los comandos, luego actúa
python .\scripts\vedit.py transitions                        # cuando no sepas qué transición usar
python .\scripts\vedit.py plan  --edl examples\edit-plan.example.json
python .\scripts\vedit.py build --edl examples\edit-plan.example.json
```

`wvp.py` es el punto de entrada unificado de este proyecto, solo tiene tres subcomandos (`doctor` / `render` / `timeline`).

**Requisitos del entorno**:
1. Node ≥ 18
2. Python ≥ 3.9
3. FFmpeg ≥ 6 (necesita `libx264` / `aac` / `libass`)
4. Windows / macOS / Linux compatible

## Flujo de trabajo

![pipeline](docs/images/pipeline.jpg)

```
Texto → guion segmentado (JSON) → voz edge-tts + subtítulos + línea de tiempo con números de fotograma + marcas de tiempo por palabra
                              ↓
            Remotion / React / Three.js / Canvas escriben la imagen
         (biblioteca de movimientos motion + capa de transiciones + pista de efectos SFX)
                              ↓
                  renderizado de fotogramas → composición con FFmpeg → MP4
```

El paso de voz produce cuatro cosas, que son el ancla de todo:

| Producto | Uso |
| --- | --- |
| `vo.mp3` | Pista de voz completa (incluye pausas entre segmentos y música de fondo) |
| `vo.srt` / `vo.vtt` | Subtítulos estrictamente alineados con la pista de audio (corte por puntuación, pegado al habla real) |
| `manifest.json` | **Números de fotograma de inicio/fin de cada frase** — el código visual solo confía en esto, no en "más o menos segundos" |
| `words.json` | **Marcas de tiempo por palabra** — resaltado tipo karaoke, sincronización de efectos, corrección palabra por palabra |

## Stack tecnológico

![stack](docs/images/stack.jpg)

| Capa | Tecnología | Uso |
| --- | --- | --- |
| Estructura | HTML / CSS / JavaScript | La página web es el lienzo |
| Gráficos 2D | Canvas 2D | Gráficos, partículas, ondas, visualización de datos |
| 3D | Three.js (`@remotion/three`) | Demostración de productos, sensación espacial, animación de modelos |
| Mejora de renderizado | WebGL / GLSL Shader | Fluidos, efectos de luz, texturas, postprocesado |
| Componentización y composición | React + TypeScript + **Remotion** | Multiplano, subtítulos, sincronización audio-video (recomendado) |
| Animación de línea de tiempo | GSAP | Easing complejo y orquestación de líneas de tiempo |
| Voz | **edge-tts** (por defecto) / API TTS propia | Síntesis de voz |
| Codificación y composición | FFmpeg | Multiplexado, mezcla, subtítulos quemados, transiciones, edición |

## Voz: edge-tts por defecto, también puedes cambiarlo por el tuyo

![voice](docs/images/voice.jpg)

### Por defecto: edge-tts (gratis, listo para usar)

```bash
# Listar todas las voces en chino
.venv/bin/python scripts/tts_edge.py --list-voices zh

# Elegir voz: la misma frase, comparar varias voces, no elegir a ciegas
.venv/bin/python scripts/tts_audition.py --outdir output/voice_samples --rate +5%

# Generación formal (modo de prosodia por segmento completo por defecto + música de fondo automática + pausas entre segmentos)
.venv/bin/python scripts/tts_edge.py \
  --script examples/script.intro10s.json \
  --outdir public/voice \
  --voice zh-CN-XiaoxiaoNeural --rate +5% --fps 30 --normalize
```

Incluye 14 voces en chino (`zh-CN-*` / `zh-HK-*` / `zh-TW-*`), las más usadas:

| Voz | Sensación | Escena |
| --- | --- | --- |
| `zh-CN-XiaoxiaoNeural` | Femenina · cálida y general | Locución, narrativa (por defecto) |
| `zh-CN-YunxiNeural` | Masculina · juvenil y soleada | Tecnología, Vlog |
| `zh-CN-YunjianNeural` | Masculina · profunda y potente | Promocionales, tráilers |
| `zh-CN-YunyangNeural` | Masculina · locución profesional | Noticias, documentales |
| `zh-CN-XiaoyiNeural` | Femenina · vivaz y brillante | Videos cortos, tutoriales |

### Tres restricciones duras (errores que cometimos, ya escritos en el código)

| Restricción | Motivo | Medición real |
| --- | --- | --- |
| **No escribir puntos「。」en el guion** | El punto activa "tono descendente al final + pausa larga", un tono descendente por frase = máquina leyendo un libro de texto. La herramienta los **elimina automáticamente** y te dice cuántos eliminó en el log | — |
| **Modo de prosodia por segmento completo** (por defecto) | Al sintetizar por segmentos, **cada petición incluye unos 0.6 s de silencio final**, y la entonación se reinicia al inicio de cada segmento, suena entrecortado | Mismo guion: por segmentos 8.75 s → completo 6.98 s, la diferencia de 1.8 s son **todas pausas falsas** |
| **Velocidad +0% ~ +5%** | Por encima de +10% suena flotante y con sibilancia fuerte | — |

Las pausas y la música están activadas por defecto: **pausa real de 400 ms entre segmentos** (no unión sin costura), **600 ms de respiración al final**, **ducking por cadena lateral del BGM** (la música baja automáticamente al hablar).

> La música de fondo es sintetizada por código con `scripts/make_bgm.py` (síntesis aditiva de senos + crossfade de acordes), **libre de derechos, usable comercialmente, bucle sin costuras**. Si quieres cambiarla, deja un mp3 en `assets/bgm.mp3`.
>
> La mezcla usa **carve multibanda** en lugar de bajar todo el volumen: primero cruce Linkwitz-Riley (300 Hz / 3400 Hz), luego compresión por cadena lateral solo en la banda vocal.
> Medición de energía de baja frecuencia en el mismo video — sin procesar −35.4 dB / ducking global −43.2 dB (la música se desinfla) / carve −36.1 dB (**la música se conserva**).
> La sonoridad usa dos pasadas de `loudnorm` (ganancia lineal), `--loudness-target social|podcast|broadcast` = −14 / −16 / −23 LUFS.

### Cambiar a tu propia API TTS

Siempre que tu servicio pueda "dar texto, devolver audio", se puede conectar — el tiempo de síntesis de voz y la lógica de subtítulos se reutilizan por completo.

**A. API compatible con OpenAI `/audio/speech`** (OpenAI, SiliconFlow, Zhipu, Volcano Ark y la mayoría de proveedores tienen esta forma)
(Los locales no los he probado, pero probablemente también funcionen...)
```bash
export TTS_API_KEY=sk-xxxx        # o --tts-api-key

.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice \
  --engine openai \
  --tts-base-url https://api.openai.com/v1 \
  --tts-model gpt-4o-mini-tts \
  --voice alloy \
  --bgm assets/bgm.mp3
```

**B. API tipo VoiceCraft** (`POST /v1/audio/speech`, campos `input` / `voice` / `speed` / `pitch` / `style` / `volume`)

Esto viene del proyecto de código abierto [JinSuperOfficial/tts-voice-magic](https://github.com/JinSuperOfficial/tts-voice-magic).
El autor original del proyecto TTS está en el upstream de ese repositorio TTS (VoiceCraft, basado en Microsoft Edge TTS, desplegable con un clic en Cloudflare Workers). Añade un parámetro `style` de emoción/personaje sobre A (`general` / `newscast` / `cheerful` / `serious` / `gentle` …).

```bash
# Desplegar uno propio (recomendado): https://github.com/JinSuperOfficial/tts-voice-magic
# O usar directamente una instancia ya desplegada (probada localmente)
.venv/bin/python scripts/tts_edge.py --script examples/script.intro10s.json \
  --outdir public/voice --fps 30 \
  --engine voicecraft \
  --tts-base-url https://tts.jinsuper.cn/v1 \
  --voice zh-CN-XiaoxiaoNeural \
  --rate +5% --tts-style newscast
```
> [!WARNING]
> Un error real que encontramos: los sitios con Cloudflare delante bloquean el User-Agent por defecto de Python
> (`Python-urllib/3.x` → `HTTP 403 error code: 1010`), mientras que `curl` sí pasa.
> El script ya envía un UA normal por defecto, así que funciona directamente; si cambias a otro cliente HTTP, configura el UA tú mismo.

**C. Endpoint completamente personalizado** (cuando cada proveedor tiene campos distintos, adapta con plantilla JSON)

```bash
.venv/bin/python scripts/tts_edge.py --script script.json --outdir public/voice \
  --engine custom \
  --tts-endpoint https://your-tts.example.com/v1/synthesize \
  --tts-header "X-App-Id=my-app" \
  --tts-payload '{"text":"{text}","speaker":"{voice}","format":"mp3"}' \
  --voice my-speaker-id
```

En la plantilla puedes usar los marcadores `{text}` `{voice}` `{model}` `{speed}`; el cuerpo de la respuesta puede ser directamente bytes de audio.

> Los motores propios no pueden obtener límites por palabra, por lo que cambian automáticamente a modo por segmentos (una petición por segmento) — la línea de tiempo se relee con `ffprobe` y sigue siendo precisa;
> los subtítulos se generan "una frase por segmento", y `words.json` indica honestamente `precision: "none"`, sin fingir precisión por palabra.

## Modo edición (basado en EDL)

> [!NOTE]
> Experimental

![editing](docs/images/editing.jpg)

Describe la línea de tiempo con un JSON, la herramienta genera comandos FFmpeg y los ejecuta. **Pipeline de tres etapas**, nunca se alimenta material heterogéneo directamente al grafo de filtros:

```
Material (heterogéneo) ──conform──▶ especificación unificada ──assemble──▶ línea de tiempo ──finish──▶ output/edit.mp4
  resolución/fps/audio distintos      recorte+xfade+acrossfade      superposición/mezcla/subtítulos/compresión
```

```bash
# Primero mira los comandos, luego actúa (la edición es irreversible, no ejecutes a ciegas)
python3 scripts/vedit.py plan  --edl examples/edit-plan.example.json
python3 scripts/vedit.py build --edl examples/edit-plan.example.json

# Horizontal → vertical (fondo desenfocado, común en videos cortos)
python3 scripts/vedit.py build --edl examples/edit-plan.example.json --aspect vertical
```

Capacidades: recorte / unión de múltiples segmentos / **transiciones xfade** (58 tipos, emparejadas con acrossfade de audio) / marca de agua y picture-in-picture / tres adaptaciones de aspecto (pad·crop·blur) / compresión a tamaño objetivo / mezcla con clips generados por Remotion.

Cuatro restricciones duras:

1. **Primero conform, luego unir** — unificar resolución/fps/códec/frecuencia de muestreo/número de pistas de audio, añadir silencio automáticamente si no hay pista de audio;
2. **offset = duración acumulada del segmento anterior − duración de transición**, y `duración de transición ≤ min(anterior, siguiente)/2`, fuera de rango da error directamente;
3. **Procesar audio y video en pareja** — si hay xfade debe haber acrossfade con el mismo valor, evitando ruidos y cortes;
4. **Cuatro niveles de degradación** — `xfade → concat filter → concat demuxer(copy) → error conservando el estado`, si se degrada te lo dice claramente.

## Estructura de directorios

```
web-video-produce/
├─ SKILL.md                 # ★ Documento principal de habilidad del Agent (el LLM solo necesita leer esto)
├─ project.md               # ★ Documento de traspaso del proyecto (arquitectura / decisiones / puntos de extensión)
├─ scripts/
│   ├─ tts_edge.py          # Voz + subtítulos + línea de tiempo con números de fotograma (edge-tts / API propia / BGM / pausas)
│   ├─ tts_audition.py      # Audición comparativa de varias voces para la misma frase
│   ├─ make_bgm.py          # BGM libre de derechos sintetizada por código
│   ├─ validate.py          # Validador estático (ejecutar antes y después del renderizado)
│   ├─ vedit.py             # Editor EDL (probe / plan / build / conform)
│   ├─ mux.sh               # Multiplexado / mezcla / subtítulos quemados / normalización de sonoridad
│   ├─ capture_frames.mjs   # Captura determinista fotograma a fotograma de páginas HTML (Playwright)
│   ├─ frames_to_video.sh   # Secuencia PNG → MP4
│   ├─ make_sample_assets.sh# Generar material de demo heterogéneo
│   └─ check_env.sh         # Autoverificación del entorno
├─ src/                     # Proyecto Remotion (Root / Main / subtítulos / tres conjuntos de escenas)
├─ templates/html-gsap/     # Protocolo de fotogramas + Canvas2D + plantilla GSAP
├─ examples/                # Guion segmentado + ejemplos EDL
├─ assets/                  # Material (bgm / logo / raw)
├─ public/voice/            # Voz y línea de tiempo generadas (gitignore)
└─ output/                  # Directorio de entrega
```

## Autoverificación antes de renderizar

```bash
python3 scripts/validate.py                      # Código fuente + línea de tiempo: resultado en 1 segundo
python3 scripts/validate.py --out output/final.mp4   # Además especificaciones de salida, espacio de color, sonoridad
python3 scripts/validate.py --json               # Compatible con Agent
```

Comprueba: reglas de determinismo (`Math.random`/`Date.now`/animaciones automáticas), consistencia de fps y duración entre `manifest.json ↔ config.ts`,
que todos los ids de escena estén en el guion de voz, que existan los materiales referenciados por `staticFile` y EDL, que se carguen las fuentes chinas,
formato de píxel de salida / **espacio de color bt709** / rango de color tv / pico / volumen medio / LUFS global.

> Este validador encontró un problema real: Remotion no pasa parámetros de color por defecto, y la salida se escribe como `yuvj420p` full-range + BT.601,
> lo que provoca desviación de color al transcodificar en plataformas. Ahora `remotion.config.ts` fija `Config.setColorSpace('bt709')`.

## Preguntas frecuentes

<details>
<summary><b>El chino se renderiza como cuadros □□□</b></summary>

Los entornos headless a menudo no tienen ninguna fuente CJK. `SKILL.md` §4.5 da tres soluciones; se recomienda poner el woff2 en `public/fonts/` y cargarlo con `@remotion/fonts` (un archivo, una petición, completamente offline).
</details>

<details>
<summary><b>El renderizado es muy lento</b></summary>

Por defecto `@remotion/google-fonts` precarga todos los subconjuntos de fuentes en el primer renderizado (unos 294 requests, 1-2 minutos). Cambiar a archivos de fuente propios acelera mucho. Además, primero genera una muestra con `--scale=0.5`, y si no hay problemas renderiza el video completo.
</details>

<details>
<summary><b>La voz suena muy falsa</b></summary>

Ver las [tres restricciones duras](#tres-restricciones-duras-errores-que-cometimos-ya-escritos-en-el-código) arriba. La herramienta ya lo hace por defecto: quitar puntos, prosodia por segmento completo, bajar velocidad, añadir pausas, añadir BGM. Si aún no te convence, cambia de motor (Azure SSML / MiniMax / Volcano / clon local GPT-SoVITS).
</details>

<details>
<summary><b>Después de unir aparecen artefactos / fotogramas negros en transiciones / el audio explota</b></summary>

Parámetros de material inconsistentes. `vedit.py` fuerza primero conform; al unir manualmente, unifica siempre resolución, fps, formato de píxel, frecuencia de muestreo, y **si hay xfade debe haber acrossfade**.
</details>

## License

[MIT](LICENSE) © JinSuperOfficial

La BGM incluida es sintetizada por código con `scripts/make_bgm.py`, sin material de terceros, usable comercialmente. edge-tts llama al endpoint público de "Leer en voz alta" de Microsoft Edge, **no es una API comercial oficial**, puede tener límites de velocidad o cambios; para escenarios comerciales críticos, cambia a un servicio con SLA.