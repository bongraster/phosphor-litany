# phosphor-litany

Retro CRT terminal HUD builder for **Adobe After Effects**. Turn a plain-text scene script into timed overlays: typed monospaced logs, a decorative terminal frame, glitch bursts, RGB split, and master CRT polish — all from one ExtendScript run.

Built for grimdark military sci-fi footage (machine-spirit boot logs, drop-pod descent, battle HUD beats), but the scene text and styling are fully yours to replace.

## What it builds

For each scene in your script file, the script creates a precomp under `RetroTerminal_Auto/` with:

- **Typed terminal text** — per-line character reveal, jittered typing speed, blinking cursor, post-line hold
- **Terminal frame** — border, header/footer strips, corner brackets, tick marks, static labels (`STATUS: LIVE FEED`, etc.)
- **Scene CRT pass** — scanlines, vignette, subtle flicker on the overlay
- **Signal glitch + RGB split** — random micro-bursts, with optional spikes synced to timeline markers
- **Master CRT polish** — a single adjustment layer on your main comp

Scene precomps are placed on your master timeline as `RT_SCENE_XX_overlay` layers.

## Requirements

- Adobe After Effects (tested with AE 2022+ workflows)
- A monospaced font installed system-wide — **VT323** is preferred; fallbacks include IBM VGA, Share Tech Mono, OCR-A, Courier
- Windows (for the optional Joos export helper; the main script is ExtendScript and runs wherever AE runs)

## Quick start

1. Clone this repo and open your After Effects project.
2. Edit `Untitled-1.txt` (or point the script at your own file — see [Configuration](#configuration)).
3. Name your main video comp **`path 1`**, or leave your target comp active when you run the script.
4. In After Effects: **File → Scripts → Run Script File…** → choose `build_retro_terminal.jsx`.
5. Rerun after editing scene text or `TIMING_OVERRIDES`; existing generated precomps are rebuilt in place.

Your master comp should be at least as long as your last scene's `end` time (default template targets **90 seconds**).

## Scene script format

Scenes are parsed from a UTF-8 text file. Each scene starts with a markdown-style header; body lines become the typed terminal content.

```text
### **SCENE 2: BOOT**
> ORDR: XIII-UM // INVICTOR_SUPPORT_UNIT — ASSIST
> STAT: MACHINE_SPIRIT_ID: IX-B4DA55 — AWAKENING
> STAT: REACTOR_CORE — RISING
```

Rules:

- Headers match `### SCENE …` (optional `**` around `SCENE`).
- Empty scenes (no body text) are skipped.
- Optional prefixes `onscreen:` and `voice:` are stripped from lines.
- Cyrillic/Greek homoglyphs that look like Latin letters are normalized for monospace readability.

See `Untitled-1.txt` for a full example arc and `scene_timing_template.txt` for the default 90 s timing map.

## Beat-synced glitches

Add a layer in your **master comp** named one of:

`BEATS` · `BEAT` · `MARKERS` · `MARKER` · `GLITCH_MARKERS`

Drop timeline markers on that layer where you want stronger glitch/RGB spikes. The script converts marker times into scene-local beat windows automatically.

## Configuration

Open `build_retro_terminal.jsx` and edit the constants at the top:

| Constant | Purpose |
|----------|---------|
| `TEXT_FILE_PATH` | Path to your scene script (default: `Untitled-1.txt` next to this script) |
| `MASTER_COMP_NAME` | Master comp to receive overlays (default: `path 1`) |
| `TIMING_OVERRIDES` | Per-scene `start` / `end` in seconds; set `disabled: true` to skip a scene |
| `BASE_CHARS_PER_SECOND` | Default typing speed |
| `GLITCH_SPEED_MULT` | Glitch cadence (higher = faster bursts) |
| `ENABLE_TERMINAL_FRAME` | Toggle decorative frame |
| `FRAME_*` | Frame size, position, labels, background fill |
| `ENABLE_SIGNAL_GLITCH` | Toggle glitch + RGB split layers |
| `ENABLE_MASTER_CRT_POLISH` | Toggle master comp polish layer |

Example — skip a scene slot so underlying footage shows through:

```javascript
4: { start: 23.50, end: 33.00, disabled: true }
```

Copy values from `scene_timing_template.txt` when retiming the full edit.

## Optional: Joos export setup

`setup_joos.ps1` installs the [Joos](https://github.com/nthnerr/Joos) CEP panel for fast comp export (FFmpeg-based), enables unsigned extension debug mode, and applies `joos_main.jsx.patch` for AE 2022 compatibility.

```powershell
powershell -ExecutionPolicy Bypass -File setup_joos.ps1
```

Then restart After Effects → **Window → Extensions → Joos**.

## Project layout

```
phosphor-litany/
├── build_retro_terminal.jsx   # Main scene builder (run this in AE)
├── Untitled-1.txt             # Example scene script
├── scene_timing_template.txt  # 90 s timing reference for TIMING_OVERRIDES
├── VT323-Regular.ttf          # Preferred monospaced font (install system-wide)
├── setup_joos.ps1             # Optional Joos panel installer (Windows)
└── joos_main.jsx.patch        # Joos compatibility patch
```

Local After Effects projects, exported videos, and third-party installers are kept outside this folder (e.g. `../phosphor-litany-workspace/`) and are not part of the repo.

Generated in your AE project (not in this repo):

- Folder: `RetroTerminal_Auto/`
- Precomps: `RT_SCENE_01` … `RT_SCENE_NN`
- Master overlays: `RT_SCENE_XX_overlay`
- Polish layer: `RT_MASTER_CRT_POLISH`

## Tips

- If text renders in Myriad instead of VT323, install the font for all users and restart AE.
- The script is idempotent: rerunning clears and rebuilds layers inside each scene precomp and re-places master overlays.
- Tune typing feel with the slider controls on each `TerminalText` layer (`CharsPerSecond`, `LineJitterPct`, `CursorBlinkRate`, etc.) — the script seeds them at creation time.

## License

No license file is included yet. Add one before publishing if you plan to share the repo publicly.
