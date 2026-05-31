/*
  Retro terminal scene builder for Adobe After Effects (ExtendScript).

  What it does:
  - Parses scene text blocks from Untitled-1.txt (same folder as this script)
  - Creates one precomp per scene
  - Adds a monospaced terminal text layer with per-line typing + jitter + blinking cursor
  - Wraps the text in a decorative terminal frame (border, header strip, footer strip,
    corner brackets, tick marks, static title/subtitle/footer labels)
  - Adds glitch + RGB split bursts (random + optional beat markers)
  - Adds a lightweight master CRT polish adjustment layer
  - Places scene precomps into a master comp ("path 1" if found, else active comp)

  Usage:
  1) Open your project in After Effects.
  2) Make sure your video comp exists (preferably named "path 1").
  3) Run this script: File > Scripts > Run Script File...
  4) Tweak timing constants below if needed and rerun.
*/

(function retroTerminalBuilder() {
    function scriptFolderPath() {
        var scriptFile = new File($.fileName);
        return scriptFile.parent.fsName;
    }

    var TEXT_FILE_PATH = scriptFolderPath() + "/Untitled-1.txt";
    var MASTER_COMP_NAME = "path 1";
    var GENERATED_FOLDER_NAME = "RetroTerminal_Auto";
    var SCENE_COMP_PREFIX = "RT_SCENE_";

    // Default timing behavior.
    var BASE_CHARS_PER_SECOND = 22;
    var BASE_CURSOR_BLINK_RATE = 2.5; // blinks per second
    var BASE_POST_HOLD = 0.8; // seconds
    var BASE_LINE_PAUSE = 0.22; // seconds between finished line and starting next line
    var BASE_LINE_JITTER_PCT = 18; // percent jitter around per-line CPS (0-100)
    var ENABLE_SIGNAL_GLITCH = true;
    // Glitch timing: lower = faster overall cadence.
    // ~0.72 ~= 28% faster than baseline 2.2s period windows.
    var GLITCH_SPEED_MULT = 1.72;
    var GLITCH_MARKER_LAYER_NAMES = ["BEATS", "BEAT", "MARKERS", "MARKER", "GLITCH_MARKERS"];
    var GLITCH_MARKER_STRENGTH = 1.15; // multiplier on spike amounts when marker-driven
    var GLITCH_MARKER_WINDOW = 0.09; // seconds around each marker time (in scene-local time)
    var ENABLE_MASTER_CRT_POLISH = true;
    var MASTER_CRT_LAYER_NAME = "RT_MASTER_CRT_POLISH";

    // Decorative terminal frame around the text (border, corner brackets, omega/skull icons).
    var ENABLE_TERMINAL_FRAME = true;
    var FRAME_FOOTER_LEFT = "STATUS: LIVE FEED";
    var FRAME_FOOTER_RIGHT = "OMNISSIAH";

    // Dark translucent fill behind the frame contents (so text reads over busy footage).
    var FRAME_BG_COLOR = [4 / 255, 10 / 255, 6 / 255]; // near-black with a hint of green
    var FRAME_BG_OPACITY = 30; // percent (0 = fully transparent, 100 = solid)

    // Frame occupies the top-left quadrant (~1/4 of the screen).
    // Width and height are fractions of the comp; the frame is anchored from the top-left
    // by FRAME_OFFSET_LEFT / FRAME_OFFSET_TOP (pixels) so it sits in the upper-left corner.
    var FRAME_WIDTH_RATIO = 0.27;   // 50% of comp width
    var FRAME_HEIGHT_RATIO = 0.20;  // 50% of comp height
    var FRAME_OFFSET_LEFT = 25;    // pixels from the comp's left edge
    var FRAME_OFFSET_TOP = 25;     // pixels from the comp's top edge

    // Typed-text scaling inside the smaller frame.
    var FRAME_TEXT_FONT_SIZE = 22;
    var FRAME_TEXT_LEADING = 26;
    var FRAME_TEXT_INSET_X = 35;    // how far inside the frame the typed text begins
    var FRAME_TEXT_INSET_TOP = 70;  // how far below the frame top the typed text begins

    // Manual scene timing overrides by scene index (1-based), in master-comp seconds.
    // Matches scene_timing_template.txt (90 s total). Requires the master comp to be
    // at least 90 s long; otherwise scenes after the comp end will get clipped by AE.
    //
    // Add `disabled: true` to skip a scene entirely (no precomp built, no overlay placed).
    // The time slot just stays empty so the underlying footage shows through unmodified.
    //   Example:  4: { start: 23.50, end: 33.00, disabled: true }
    var TIMING_OVERRIDES = {
        1:  { start: 0.00,  end: 7.50, disabled: true }, // SCENE 1
        2:  { start: 7.50,  end: 15.50 },                 // SCENE 2 BOOT
        3:  { start: 15.50, end: 23.50 },                 // SCENE 3 LAUNCH
        4:  { start: 23.50, end: 27.00 },                 // SCENE 4 DROPPING
        5:  { start: 27.00, end: 30.00 },                 // SCENE 4_1 BLACKOUT (3 s)
        6:  { start: 30.00, end: 40.50 },                 // SCENE 5 OPENING
        7:  { start: 40.50, end: 49.00 },                 // SCENE 6 BATTLE
        8:  { start: 49.00, end: 57.00 },                 // SCENE 7 BACK
        9:  { start: 57.00, end: 64.50 },                 // SCENE 8 FPS
        10: { start: 64.50, end: 72.50 },                 // SCENE 9
        11: { start: 72.50, end: 82.00 },                 // SCENE 10 LOSING BATTLE
        12: { start: 82.00, end: 90.00 }                  // SCENE 11 SMOKE AND ASH
    };

    if (!app.project) {
        alert("Open an After Effects project first.");
        return;
    }

    function trim(s) {
        return s.replace(/^\s+|\s+$/g, "");
    }

    function normalizeHomoglyphs(s) {
        // Fix common Cyrillic/Greek homoglyphs that look like Latin letters in monospace fonts.
        // ExtendScript has limited Unicode support; use explicit Unicode escapes for safety.
        var out = String(s || "");
        out = out.replace(/\u0410/g, "A"); // А
        out = out.replace(/\u0412/g, "B"); // В
        out = out.replace(/\u0415/g, "E"); // Е
        out = out.replace(/\u0417/g, "3"); // З (often reads like digit 3 in logs)
        out = out.replace(/\u041a/g, "K"); // К
        out = out.replace(/\u041c/g, "M"); // М  (this is the usual culprit for weird M)
        out = out.replace(/\u041d/g, "H"); // Н
        out = out.replace(/\u041e/g, "O"); // О
        out = out.replace(/\u0420/g, "P"); // Р
        out = out.replace(/\u0421/g, "C"); // С
        out = out.replace(/\u0422/g, "T"); // Т
        out = out.replace(/\u0425/g, "X"); // Х
        out = out.replace(/\u0423/g, "Y"); // У (sometimes used as Y-like)
        out = out.replace(/\u0391/g, "A"); // Greek Α
        out = out.replace(/\u0392/g, "B"); // Greek Β
        out = out.replace(/\u0395/g, "E"); // Greek Ε
        out = out.replace(/\u0396/g, "Z"); // Greek Ζ (closest Latin)
        out = out.replace(/\u0397/g, "H"); // Greek Η
        out = out.replace(/\u0399/g, "I"); // Greek Ι
        out = out.replace(/\u039a/g, "K"); // Greek Κ
        out = out.replace(/\u039c/g, "M"); // Greek Μ
        out = out.replace(/\u039d/g, "N"); // Greek Ν
        out = out.replace(/\u039f/g, "O"); // Greek Ο
        out = out.replace(/\u03a1/g, "P"); // Greek Ρ
        out = out.replace(/\u03a4/g, "T"); // Greek Τ
        out = out.replace(/\u03a7/g, "X"); // Greek Χ
        return out;
    }

    function parseScenesFromFile(path) {
        var file = new File(path);
        if (!file.exists) {
            throw new Error("Text file not found at: " + path);
        }

        file.encoding = "UTF-8";
        file.open("r");
        var raw = file.read();
        file.close();

        var lines = raw.split(/\r\n|\n|\r/);
        var scenes = [];
        var current = null;
        var sceneHeaderRe = /^###\s*\*{0,2}\s*SCENE\b(.*)$/i;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var headerMatch = line.match(sceneHeaderRe);
            if (headerMatch) {
                if (current) {
                    current.body = trim(current.body);
                    scenes.push(current);
                }
                current = {
                    title: trim("SCENE" + headerMatch[1]),
                    body: ""
                };
                continue;
            }

            if (!current) {
                continue;
            }

            // Ignore purely empty leading lines.
            if (!current.body && trim(line) === "") {
                continue;
            }

            var cleaned = line;
            if (/^\s*onscreen:\s*/i.test(cleaned)) {
                cleaned = cleaned.replace(/^\s*onscreen:\s*/i, "");
            } else if (/^\s*voice:\s*/i.test(cleaned)) {
                cleaned = cleaned.replace(/^\s*voice:\s*/i, "");
            }
            cleaned = normalizeHomoglyphs(cleaned);

            if (current.body.length > 0) {
                current.body += "\r";
            }
            current.body += cleaned;
        }

        if (current) {
            current.body = trim(current.body);
            scenes.push(current);
        }

        var filtered = [];
        for (var j = 0; j < scenes.length; j++) {
            if (trim(scenes[j].body).length > 0) {
                filtered.push(scenes[j]);
            }
        }
        return filtered;
    }

    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === name) {
                return item;
            }
        }
        return null;
    }

    function getOrCreateFolder(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof FolderItem && item.name === name) {
                return item;
            }
        }
        return app.project.items.addFolder(name);
    }

    function getMasterComp() {
        var named = findCompByName(MASTER_COMP_NAME);
        if (named) {
            return named;
        }
        if (app.project.activeItem && app.project.activeItem instanceof CompItem) {
            return app.project.activeItem;
        }
        return null;
    }

    function addSlider(layer, name, value) {
        var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        fx.name = name;
        fx.property("ADBE Slider Control-0001").setValue(value);
    }

    function normalizeFontToken(s) {
        return String(s || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    function fontMatches(fontObj, tokens) {
        if (!fontObj) {
            return false;
        }
        var hay = [
            fontObj.postScriptName,
            fontObj.familyName,
            fontObj.styleName
        ];
        try {
            hay.push(fontObj.name);
        } catch (eName) {}
        var joined = "";
        for (var h = 0; h < hay.length; h++) {
            joined += " " + String(hay[h] || "");
        }
        var norm = normalizeFontToken(joined);
        for (var t = 0; t < tokens.length; t++) {
            var tok = normalizeFontToken(tokens[t]);
            if (tok && norm.indexOf(tok) !== -1) {
                return true;
            }
        }
        return false;
    }

    function resolvePostScriptFontName(layer, tokens) {
        // Prefer querying AE's font list over guessing PostScript names.
        try {
            if (app.fonts && app.fonts.length) {
                // AE versions differ on whether Font objects are 0- or 1-based; probe both.
                var maxIdx = app.fonts.length;
                for (var i = 0; i < maxIdx; i++) {
                    var f = app.fonts[i];
                    if (fontMatches(f, tokens) && f.postScriptName) {
                        return String(f.postScriptName);
                    }
                }
                for (var j = 1; j <= maxIdx; j++) {
                    var f2 = app.fonts[j];
                    if (fontMatches(f2, tokens) && f2.postScriptName) {
                        return String(f2.postScriptName);
                    }
                }
            }
        } catch (e0) {}

        // Last resort: try common literal PostScript names.
        var literals = [
            "VT323-Regular",
            "VT323Regular",
            "VT323",
            "ShareTechMono-Regular",
            "CourierNewPSMT"
        ];
        for (var k = 0; k < literals.length; k++) {
            try {
                var probe = layer.property("ADBE Text Properties").property("ADBE Text Document").value;
                probe.font = literals[k];
                return literals[k];
            } catch (e1) {}
        }
        return "";
    }

    function setTerminalTextStyle(layer, sceneComp) {
        var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = textProp.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();

        // When the frame is on, the panel is smaller, so the typed text shrinks to fit.
        var usingFrame = ENABLE_TERMINAL_FRAME && sceneComp;
        doc.fontSize = usingFrame ? FRAME_TEXT_FONT_SIZE : 34;
        doc.applyFill = true;
        // RGB(171, 252, 192) -> AE normalized 0..1
        doc.fillColor = [171 / 255, 252 / 255, 192 / 255];
        doc.justification = ParagraphJustification.LEFT_JUSTIFY;
        doc.leading = usingFrame ? FRAME_TEXT_LEADING : 40;
        doc.tracking = usingFrame ? 4 : 8;

        var wantsVt323 = true;
        var chosen = resolvePostScriptFontName(layer, ["VT323", "Px437IBMVGA9", "ShareTechMono", "OCRA", "Courier"]);
        if (chosen) {
            try {
                doc.font = chosen;
            } catch (e2) {}
        }

        textProp.setValue(doc);
        // When the terminal frame is enabled, position the typed text inside the frame
        // content area; otherwise fall back to the original near-top-left placement.
        var posX = 95;
        var posY = 130;
        if (usingFrame) {
            posX = FRAME_OFFSET_LEFT + FRAME_TEXT_INSET_X;
            posY = FRAME_OFFSET_TOP + FRAME_TEXT_INSET_TOP;
        }
        layer.property("ADBE Transform Group").property("ADBE Position").setValue([posX, posY]);

        // Verify assignment (AE silently falls back to Myriad if font string is wrong).
        var applied = textProp.value.font;
        if (wantsVt323 && String(applied).toLowerCase().indexOf("vt323") === -1) {
            // Non-fatal: user can still pick manually, but this explains the Myriad fallback.
            $.writeln(
                "RetroTerminal: VT323 not applied via script. AE reports text font as: " +
                    String(applied) +
                    ". Try restarting AE after installing the font, or install for All Users."
            );
        }
    }

    function addTextGlow(layer) {
        try {
            var glow = layer.property("ADBE Effect Parade").addProperty("ADBE Glo2");
            if (glow) {
                glow.property("Glow Radius").setValue(24);
                glow.property("Glow Intensity").setValue(0.55);
            }
        } catch (e) {}
    }

    function addShapeGroup(shapeLayer, name) {
        var contents = shapeLayer.property("ADBE Root Vectors Group");
        var grp = contents.addProperty("ADBE Vector Group");
        if (name) {
            grp.name = name;
        }
        return grp.property("ADBE Vectors Group");
    }

    function addRectPath(groupContents, size, position) {
        var rect = groupContents.addProperty("ADBE Vector Shape - Rect");
        rect.property("ADBE Vector Rect Size").setValue(size);
        rect.property("ADBE Vector Rect Position").setValue(position);
        return rect;
    }

    function addStrokeOnGroup(groupContents, color, width) {
        var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([color[0], color[1], color[2], 1]);
        stroke.property("ADBE Vector Stroke Width").setValue(width);
        return stroke;
    }

    function addFillOnGroup(groupContents, color, opacityPct) {
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([color[0], color[1], color[2], 1]);
        if (typeof opacityPct === "number") {
            try {
                fill.property("ADBE Vector Fill Opacity").setValue(opacityPct);
            } catch (eFillOp) {}
        }
        return fill;
    }

    function addFrameLabelText(sceneComp, txt, position, fontSize, color, justification, fontTokens, tracking) {
        var layer = sceneComp.layers.addText(txt);
        layer.name = "FrameLabel_" + txt.substring(0, 12);
        var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = textProp.value;
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.fontSize = fontSize;
        doc.applyFill = true;
        doc.fillColor = [color[0], color[1], color[2]];
        doc.justification = justification || ParagraphJustification.LEFT_JUSTIFY;
        doc.tracking = (typeof tracking === "number") ? tracking : 80;
        var tokens = fontTokens || ["VT323", "Px437IBMVGA9", "ShareTechMono", "OCRA", "Courier"];
        var chosen = resolvePostScriptFontName(layer, tokens);
        if (chosen) {
            try { doc.font = chosen; } catch (eFL1) {}
        }
        textProp.setValue(doc);
        layer.property("ADBE Transform Group").property("ADBE Position").setValue(position);
        return layer;
    }

    function addTerminalFrame(sceneComp) {
        if (!ENABLE_TERMINAL_FRAME) {
            return null;
        }

        var w = sceneComp.width;
        var h = sceneComp.height;

        // Frame occupies ~1/4 of the screen (half width × half height) anchored top-left.
        var frameW = Math.round(w * FRAME_WIDTH_RATIO);
        var frameH = Math.round(h * FRAME_HEIGHT_RATIO);
        var cx = FRAME_OFFSET_LEFT + frameW / 2;
        var cy = FRAME_OFFSET_TOP + frameH / 2;

        var greenBright = [171 / 255, 252 / 255, 192 / 255];
        var greenMid = [120 / 255, 210 / 255, 145 / 255];
        var greenDim = [55 / 255, 130 / 255, 80 / 255];
        var greenBgFill = [6 / 255, 18 / 255, 10 / 255];

        // Sizing scaled for the smaller frame.
        var headerH = 70;
        var footerH = 46;
        var insetBorderPad = 14;
        var brackLen = 26;
        var brackThick = 4;
        var brackInset = 8;
        var stripPad = 18; // inset of header/footer strips from outer border

        var frame = sceneComp.layers.addShape();
        frame.name = "TerminalFrame";

        // 1. Dark translucent panel fill so the typed text reads over busy footage.
        var bgGroup = addShapeGroup(frame, "FrameBackground");
        addRectPath(bgGroup, [frameW - 4, frameH - 4], [0, 0]);
        addFillOnGroup(bgGroup, FRAME_BG_COLOR, FRAME_BG_OPACITY);

        // 2. Main outer border (thick bright).
        var outerGroup = addShapeGroup(frame, "OuterBorder");
        addRectPath(outerGroup, [frameW, frameH], [0, 0]);
        addStrokeOnGroup(outerGroup, greenBright, 2.5);

        // 3. Inset thin border for tech-frame depth.
        var innerGroup = addShapeGroup(frame, "InnerBorder");
        addRectPath(innerGroup, [frameW - insetBorderPad, frameH - insetBorderPad], [0, 0]);
        addStrokeOnGroup(innerGroup, greenDim, 1);

        // 4. Corner brackets.
        var hx = frameW / 2 - brackInset;
        var hy = frameH / 2 - brackInset;
        var corners = [
            [-hx, -hy,  1,  1],
            [ hx, -hy, -1,  1],
            [-hx,  hy,  1, -1],
            [ hx,  hy, -1, -1]
        ];
        for (var c = 0; c < corners.length; c++) {
            var ox = corners[c][0];
            var oy = corners[c][1];
            var sx = corners[c][2];
            var sy = corners[c][3];
            var cgroup = addShapeGroup(frame, "Corner_" + (c + 1));
            addRectPath(cgroup, [brackLen, brackThick], [ox + sx * (brackLen / 2 - brackThick / 2), oy]);
            addRectPath(cgroup, [brackThick, brackLen], [ox, oy + sy * (brackLen / 2 - brackThick / 2)]);
            addFillOnGroup(cgroup, greenBright);
        }

        // Position the shape layer so its content is centered on (cx, cy).
        frame.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy]);

        // Soft glow on the frame so it matches the typed text aesthetics.
        try {
            var fGlow = frame.property("ADBE Effect Parade").addProperty("ADBE Glo2");
            if (fGlow) {
                fGlow.property("Glow Radius").setValue(12);
                fGlow.property("Glow Intensity").setValue(0.35);
            }
        } catch (eFG) {}

        // ----- Icon + label layers (drawn on top of the shape layer) -----
        // Fonts that reliably contain the Omega (\u03A9) and skull (\u2620) glyphs.
        var iconFontTokens = [
            "SegoeUISymbol",
            "SegoeUIEmoji",
            "ArialUnicodeMS",
            "Symbola",
            "AppleSymbols",
            "Arial",
            "Helvetica"
        ];

        // Omega at the very top of the panel, skull and status texts at the bottom.
        var omegaBaselineY = -frameH / 2 + 32;
        var skullBaselineY = frameH / 2 - 18;
        var footerTextY = frameH / 2 - 18;

        // Omega icon at the top center.
        var omegaLayer = addFrameLabelText(
            sceneComp,
            "\u03A9",
            [cx, cy + omegaBaselineY],
            22,
            greenBright,
            ParagraphJustification.CENTER_JUSTIFY,
            iconFontTokens,
            0
        );
        omegaLayer.name = "FrameOmegaIcon";

        // Skull icon centered at the bottom.
        var skullLayer = addFrameLabelText(
            sceneComp,
            "\u2620",
            [cx, cy + skullBaselineY],
            18,
            greenBright,
            ParagraphJustification.CENTER_JUSTIFY,
            iconFontTokens,
            0
        );
        skullLayer.name = "FrameSkullIcon";

        // Footer left / right labels.
        var footerEdgeX = stripPad + 14;
        var footerLeftLayer = addFrameLabelText(
            sceneComp,
            FRAME_FOOTER_LEFT,
            [cx - frameW / 2 + footerEdgeX, cy + footerTextY],
            10,
            greenMid,
            ParagraphJustification.LEFT_JUSTIFY,
            null,
            40
        );
        footerLeftLayer.name = "FrameFooterLeft";

        var footerRightLayer = addFrameLabelText(
            sceneComp,
            FRAME_FOOTER_RIGHT,
            [cx + frameW / 2 - footerEdgeX, cy + footerTextY],
            10,
            greenMid,
            ParagraphJustification.RIGHT_JUSTIFY,
            null,
            40
        );
        footerRightLayer.name = "FrameFooterRight";

        // Soft glow on all icon/label layers.
        var labels = [omegaLayer, skullLayer, footerLeftLayer, footerRightLayer];
        for (var lbl = 0; lbl < labels.length; lbl++) {
            try {
                var lg = labels[lbl].property("ADBE Effect Parade").addProperty("ADBE Glo2");
                if (lg) {
                    lg.property("Glow Radius").setValue(8);
                    lg.property("Glow Intensity").setValue(0.35);
                }
            } catch (eLG) {}
        }

        return frame;
    }

    function addCRTPass(sceneComp) {
        // Subtle scanlines/flicker layer.
        var crt = sceneComp.layers.addSolid(
            [1, 1, 1],
            "CRT_Overlay",
            sceneComp.width,
            sceneComp.height,
            sceneComp.pixelAspect,
            sceneComp.duration
        );
        crt.moveToEnd();
        crt.blendingMode = BlendingMode.MULTIPLY;
        crt.opacity.setValue(12);

        try {
            var blinds = crt.property("ADBE Effect Parade").addProperty("ADBE Venetian Blinds");
            if (blinds) {
                blinds.property("Direction").setValue(0);
                blinds.property("Width").setValue(3);
                blinds.property("Feather").setValue(0.3);
                blinds.property("Transition Completion").setValue(72);
            }
        } catch (e1) {}

        try {
            var noise = crt.property("ADBE Effect Parade").addProperty("ADBE Noise");
            if (noise) {
                noise.property("Amount of Noise").setValue(3.5);
                var useColor = noise.property("Use Color Noise");
                if (useColor) {
                    useColor.setValue(0);
                }
            }
        } catch (e2) {}

        try {
            var opacityExpr = [
                "seedRandom(index, true);",
                "12 + random(-2, 2)"
            ].join("\n");
            crt.opacity.expression = opacityExpr;
        } catch (e3) {}
    }

    function layerNameMatchesAny(name, candidates) {
        var n = String(name || "").toLowerCase();
        for (var i = 0; i < candidates.length; i++) {
            var c = String(candidates[i] || "").toLowerCase();
            if (c && n.indexOf(c) !== -1) {
                return true;
            }
        }
        return false;
    }

    function findBeatMarkerLayer(comp) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var lyr = comp.layer(i);
            if (!lyr) {
                continue;
            }
            if (layerNameMatchesAny(lyr.name, GLITCH_MARKER_LAYER_NAMES)) {
                return lyr;
            }
        }
        return null;
    }

    function collectBeatTimesInRange(markerLayer, tStart, tEnd) {
        var beats = [];
        if (!markerLayer) {
            return beats;
        }
        try {
            var mkProp = markerLayer.property("Marker");
            if (!mkProp || mkProp.numKeys <= 0) {
                return beats;
            }
            for (var k = 1; k <= mkProp.numKeys; k++) {
                var t = mkProp.keyTime(k);
                if (t >= tStart - 0.0001 && t <= tEnd + 0.0001) {
                    beats.push(t);
                }
            }
        } catch (eMk) {}
        return beats;
    }

    function formatNumberForExpr(n) {
        // Keep numbers short but stable.
        return (Math.round(n * 1000) / 1000).toString();
    }

    function formatBeatTimesLiteral(beats, sceneStart) {
        if (!beats || !beats.length) {
            return "[]";
        }
        var parts = [];
        for (var i = 0; i < beats.length; i++) {
            // Scene precomp time is "sped up" by GLITCH_SPEED_MULT via expressions (time/speed).
            // Convert master-comp beat times into that same time base.
            var localT = (beats[i] - sceneStart) / GLITCH_SPEED_MULT;
            parts.push(formatNumberForExpr(localT));
        }
        return "[" + parts.join(",") + "]";
    }

    function removeMasterPolishLayer(comp, layerName) {
        for (var i = comp.numLayers; i >= 1; i--) {
            var lyr = comp.layer(i);
            if (lyr && lyr.name === layerName) {
                lyr.remove();
            }
        }
    }

    function addMasterCRTPolish(comp) {
        if (!ENABLE_MASTER_CRT_POLISH) {
            return;
        }
        removeMasterPolishLayer(comp, MASTER_CRT_LAYER_NAME);

        var adj = comp.layers.addSolid([1, 1, 1], MASTER_CRT_LAYER_NAME, comp.width, comp.height, comp.pixelAspect, comp.duration);
        adj.adjustmentLayer = true;
        adj.moveToBeginning();

        var fx = adj.property("ADBE Effect Parade");
        try {
            var blur = fx.addProperty("ADBE Gaussian Blur 2");
            if (blur) {
                blur.property("Blurriness").setValue(0.35);
            }
        } catch (e0) {}

        try {
            var noise = fx.addProperty("ADBE Noise");
            if (noise) {
                noise.property("Amount of Noise").setValue(2.2);
                var useColor = noise.property("Use Color Noise");
                if (useColor) {
                    useColor.setValue(0);
                }
            }
        } catch (e1) {}

        try {
            var cc = fx.addProperty("ADBE CC_Vignette");
            if (cc) {
                cc.property("Amount").setValue(55);
                cc.property("Angle of View").setValue(70);
            }
        } catch (e2) {}

        try {
            var optics = fx.addProperty("ADBE Optics Compensation");
            if (optics) {
                optics.property("ADBE Optics Compensation-0001").setValue(3.5); // Field of View (approx)
                optics.property("Reverse Lens Distortion").setValue(1);
            }
        } catch (e3) {}
    }

    function buildGlitchSpikeExpr(beatTimesLiteral) {
        // beatTimesLiteral should be a JS array literal string like: [1.23,4.56]
        return [
            "function spikeEnvelope(phase, w, peak){",
            "  if (phase >= w){ return 0; }",
            "  var half = w * 0.5;",
            "  if (phase < half){",
            "    return linear(phase, 0, half, 0, peak);",
            "  }",
            "  return linear(phase, half, w, peak, 0);",
            "}",
            "function markerSpike(tLocal, beats, win, peak){",
            "  var sum = 0;",
            "  for (var i = 0; i < beats.length; i++){",
            "    var dt = Math.abs(tLocal - beats[i]);",
            "    if (dt < win){",
            "      sum = Math.max(sum, spikeEnvelope(dt, win, peak));",
            "    }",
            "  }",
            "  return sum;",
            "}",
            "seedRandom(index + 101, true);",
            "var speed = " + GLITCH_SPEED_MULT + ";",
            "var t = time / speed;",
            "var beats = " + beatTimesLiteral + ";",
            "var markerWin = " + GLITCH_MARKER_WINDOW + ";",
            "var markerStr = " + GLITCH_MARKER_STRENGTH + ";",
            "var period = random(1.35, 2.05);",
            "var window = random(0.06, 0.12);",
            "var phase = (t % period);",
            "seedRandom(index + 202, true);",
            "var spikeMax = random(70, 120);",
            "var rnd = spikeEnvelope(phase, window, spikeMax);",
            "var mk = markerSpike(t, beats, markerWin, spikeMax * markerStr);",
            "Math.max(rnd, mk);"
        ].join("\n");
    }

    function buildGlitchWaveExpr(beatTimesLiteral) {
        return [
            "function spikeEnvelope(phase, w, peak){",
            "  if (phase >= w){ return 0; }",
            "  var half = w * 0.5;",
            "  if (phase < half){",
            "    return linear(phase, 0, half, 0, peak);",
            "  }",
            "  return linear(phase, half, w, peak, 0);",
            "}",
            "function markerSpike(tLocal, beats, win, peak){",
            "  var sum = 0;",
            "  for (var i = 0; i < beats.length; i++){",
            "    var dt = Math.abs(tLocal - beats[i]);",
            "    if (dt < win){",
            "      sum = Math.max(sum, spikeEnvelope(dt, win, peak));",
            "    }",
            "  }",
            "  return sum;",
            "}",
            "seedRandom(index + 101, true);",
            "var speed = " + GLITCH_SPEED_MULT + ";",
            "var t = time / speed;",
            "var beats = " + beatTimesLiteral + ";",
            "var markerWin = " + GLITCH_MARKER_WINDOW + ";",
            "var markerStr = " + GLITCH_MARKER_STRENGTH + ";",
            "var period = random(1.35, 2.05);",
            "var window = random(0.06, 0.12);",
            "var phase = (t % period);",
            "seedRandom(index + 303, true);",
            "var waveMax = random(22, 48);",
            "var rnd = spikeEnvelope(phase, window, waveMax);",
            "var mk = markerSpike(t, beats, markerWin, waveMax * markerStr);",
            "Math.max(rnd, mk);"
        ].join("\n");
    }

    function buildGlitchBlurExpr(beatTimesLiteral) {
        return [
            "function spikeEnvelope(phase, w, peak){",
            "  if (phase >= w){ return 0; }",
            "  var half = w * 0.5;",
            "  if (phase < half){",
            "    return linear(phase, 0, half, 0, peak);",
            "  }",
            "  return linear(phase, half, w, peak, 0);",
            "}",
            "function markerSpike(tLocal, beats, win, peak){",
            "  var sum = 0;",
            "  for (var i = 0; i < beats.length; i++){",
            "    var dt = Math.abs(tLocal - beats[i]);",
            "    if (dt < win){",
            "      sum = Math.max(sum, spikeEnvelope(dt, win, peak));",
            "    }",
            "  }",
            "  return sum;",
            "}",
            "seedRandom(index + 101, true);",
            "var speed = " + GLITCH_SPEED_MULT + ";",
            "var t = time / speed;",
            "var beats = " + beatTimesLiteral + ";",
            "var markerWin = " + GLITCH_MARKER_WINDOW + ";",
            "var markerStr = " + GLITCH_MARKER_STRENGTH + ";",
            "var period = random(1.35, 2.05);",
            "var window = random(0.06, 0.12);",
            "var phase = (t % period);",
            "seedRandom(index + 404, true);",
            "var blurMax = random(3, 9);",
            "var rnd = spikeEnvelope(phase, window, blurMax);",
            "var mk = markerSpike(t, beats, markerWin, blurMax * markerStr);",
            "Math.max(rnd, mk);"
        ].join("\n");
    }

    function buildRgbSplitExpr(beatTimesLiteral) {
        return [
            "function spikeEnvelope(phase, w, peak){",
            "  if (phase >= w){ return 0; }",
            "  var half = w * 0.5;",
            "  if (phase < half){",
            "    return linear(phase, 0, half, 0, peak);",
            "  }",
            "  return linear(phase, half, w, peak, 0);",
            "}",
            "function markerSpike(tLocal, beats, win, peak){",
            "  var sum = 0;",
            "  for (var i = 0; i < beats.length; i++){",
            "    var dt = Math.abs(tLocal - beats[i]);",
            "    if (dt < win){",
            "      sum = Math.max(sum, spikeEnvelope(dt, win, peak));",
            "    }",
            "  }",
            "  return sum;",
            "}",
            "seedRandom(index + 101, true);",
            "var speed = " + GLITCH_SPEED_MULT + ";",
            "var t = time / speed;",
            "var beats = " + beatTimesLiteral + ";",
            "var markerWin = " + GLITCH_MARKER_WINDOW + ";",
            "var markerStr = " + GLITCH_MARKER_STRENGTH + ";",
            "var period = random(1.35, 2.05);",
            "var window = random(0.06, 0.12);",
            "var phase = (t % period);",
            "seedRandom(index + 505, true);",
            "var splitMax = random(10, 26);",
            "var rnd = spikeEnvelope(phase, window, splitMax);",
            "var mk = markerSpike(t, beats, markerWin, splitMax * markerStr);",
            "Math.max(rnd, mk);"
        ].join("\n");
    }

    function addSignalGlitch(sceneComp, beatTimesLiteral) {
        // Quick analog cable-disconnect style bursts.
        var glitch = sceneComp.layers.addSolid(
            [0.5, 0.5, 0.5],
            "Signal_Glitch",
            sceneComp.width,
            sceneComp.height,
            sceneComp.pixelAspect,
            sceneComp.duration
        );
        glitch.adjustmentLayer = true;

        var fx = glitch.property("ADBE Effect Parade");
        var turbIdx = -1;
        var waveIdx = -1;
        var blurIdx = -1;

        try {
            var turb = fx.addProperty("ADBE Turbulent Displace");
            if (turb) {
                turb.property("Amount").setValue(0);
                turb.property("Size").setValue(18);
                turbIdx = fx.numProperties;
            }
        } catch (e1) {}

        try {
            var wave = fx.addProperty("ADBE Wave Warp");
            if (wave) {
                wave.property("Wave Height").setValue(0);
                wave.property("Wave Width").setValue(180);
                wave.property("Direction").setValue(0);
                wave.property("Wave Speed").setValue(2.5);
                waveIdx = fx.numProperties;
            }
        } catch (e2) {}

        try {
            var blur = fx.addProperty("ADBE Gaussian Blur 2");
            if (blur) {
                blur.property("Blurriness").setValue(0);
                blurIdx = fx.numProperties;
            }
        } catch (e3) {}

        // Repeating tiny windows that spike distortion.
        var spikeExpr = buildGlitchSpikeExpr(beatTimesLiteral);
        var waveExpr = buildGlitchWaveExpr(beatTimesLiteral);
        var blurExpr = buildGlitchBlurExpr(beatTimesLiteral);

        try {
            if (turbIdx > 0) {
                fx.property(turbIdx).property("Amount").expression = spikeExpr;
            }
            if (waveIdx > 0) {
                fx.property(waveIdx).property("Wave Height").expression = waveExpr;
            }
            if (blurIdx > 0) {
                fx.property(blurIdx).property("Blurriness").expression = blurExpr;
            }
        } catch (e4) {}

        // RGB split / chromatic aberration bursts (tied to same spike envelope as glitch layer).
        try {
            var rgb = sceneComp.layers.addSolid([0.5, 0.5, 0.5], "RGB_Split", sceneComp.width, sceneComp.height, sceneComp.pixelAspect, sceneComp.duration);
            rgb.adjustmentLayer = true;
            rgb.moveToBeginning();
            // Keep RGB above the main glitch adjustment stack.
            glitch.moveAfter(rgb);

            var rgbFx = rgb.property("ADBE Effect Parade");
            var rgbIdx = -1;
            try {
                rgbIdx = rgbFx.numProperties + 1;
                rgbFx.addProperty("ADBE Color Offset");
                rgbIdx = rgbFx.numProperties;
            } catch (eRgb0) {
                rgbIdx = -1;
            }

            if (rgbIdx > 0) {
                var splitAmt = buildRgbSplitExpr(beatTimesLiteral);
                // Push red/cyan-ish separation horizontally (AE units are pixels-ish for this effect).
                try {
                    rgbFx.property(rgbIdx).property("Red Offset").property(1).expression = "-(" + splitAmt + ")";
                    rgbFx.property(rgbIdx).property("Blue Offset").property(1).expression = "" + splitAmt;
                } catch (eRgb1) {}
            }
        } catch (eRgb2) {}
    }

    function typingExpression() {
        return [
            "var full = marker.numKeys > 0 ? marker.key(1).comment : value.toString();",
            "var start = effect(\"StartTime\")(\"Slider\");",
            "var baseCps = Math.max(1, effect(\"CharsPerSecond\")(\"Slider\"));",
            "var jitterPct = Math.max(0, effect(\"LineJitterPct\")(\"Slider\"));",
            "var linePause = Math.max(0, effect(\"LinePause\")(\"Slider\"));",
            "var blink = Math.max(0.2, effect(\"CursorBlinkRate\")(\"Slider\"));",
            "var hold = Math.max(0, effect(\"PostTypeHold\")(\"Slider\"));",
            "function splitLines(s){",
            "  var lines = [];",
            "  var cur = \"\";",
            "  for (var i = 0; i < s.length; i++){",
            "    var ch = s.charAt(i);",
            "    if (ch == \"\\r\" || ch == \"\\n\"){",
            "      lines.push(cur);",
            "      cur = \"\";",
            "      if (ch == \"\\r\" && (i + 1) < s.length && s.charAt(i + 1) == \"\\n\"){ i++; }",
            "    } else {",
            "      cur += ch;",
            "    }",
            "  }",
            "  lines.push(cur);",
            "  return lines;",
            "}",
            "function lineCps(lineIdx){",
            "  seedRandom(index * 131 + lineIdx * 17 + 3, true);",
            "  var j = jitterPct / 100;",
            "  var mul = 1 + (random(-j, j));",
            "  return Math.max(2, baseCps * mul);",
            "}",
            "var t = time - start;",
            "if (t < 0){",
            "  \"\";",
            "} else {",
            "  var lines = splitLines(full);",
            "  var cursor = ((Math.floor(time * blink) % 2) === 0) ? \"_\" : \"|\";",
            "  var cpsArr = [];",
            "  var durArr = [];",
            "  var total = 0;",
            "  for (var li = 0; li < lines.length; li++){",
            "    var line = lines[li];",
            "    var cps = lineCps(li);",
            "    cpsArr[li] = cps;",
            "    var dur = (line.length > 0) ? (line.length / cps) : 0.0001;",
            "    durArr[li] = dur;",
            "    total += dur;",
            "    if (li < lines.length - 1){",
            "      total += linePause;",
            "    }",
            "  }",
            "  if (t >= total + hold){",
            "    full;",
            "  } else if (t >= total){",
            "    full + cursor;",
            "  } else {",
            "    var timeLeft = t;",
            "    var out = \"\";",
            "    for (var lj = 0; lj < lines.length; lj++){",
            "      var line2 = lines[lj];",
            "      var cps2 = cpsArr[lj];",
            "      var dur2 = durArr[lj];",
            "      if (timeLeft > dur2 + linePause){",
            "        if (lj < lines.length - 1){ out += line2 + \"\\r\"; }",
            "        else { out += line2; }",
            "        timeLeft -= (dur2 + linePause);",
            "        continue;",
            "      }",
            "      if (timeLeft < dur2){",
            "        var n2 = Math.min(line2.length, Math.floor(timeLeft * cps2));",
            "        var typed2 = line2.substring(0, n2);",
            "        if (lj < lines.length - 1){ out += typed2 + cursor + \"\\r\"; }",
            "        else { out += typed2 + cursor; }",
            "      } else {",
            "        if (lj < lines.length - 1){ out += line2 + cursor + \"\\r\"; }",
            "        else { out += line2 + cursor; }",
            "      }",
            "      break;",
            "    }",
            "    out;",
            "  }",
            "}"
        ].join("\n");
    }

    function getSceneTiming(sceneCount, totalDuration) {
        var timings = [];
        var base = totalDuration / sceneCount;
        var running = 0;

        for (var i = 0; i < sceneCount; i++) {
            var sceneIdx = i + 1;
            var start = running;
            var end = (i === sceneCount - 1) ? totalDuration : (running + base);

            if (TIMING_OVERRIDES[sceneIdx]) {
                if (typeof TIMING_OVERRIDES[sceneIdx].start === "number") {
                    start = TIMING_OVERRIDES[sceneIdx].start;
                }
                if (typeof TIMING_OVERRIDES[sceneIdx].end === "number") {
                    end = TIMING_OVERRIDES[sceneIdx].end;
                }
            }

            if (end <= start) {
                end = start + 0.1;
            }

            timings.push({ start: start, end: end, duration: end - start });
            running = end;
        }
        return timings;
    }

    function getOrCreateComp(name, width, height, pixelAspect, duration, fps, parentFolder) {
        var existing = findCompByName(name);
        if (existing) {
            existing.width = width;
            existing.height = height;
            existing.pixelAspect = pixelAspect;
            existing.duration = duration;
            existing.frameRate = fps;
            if (parentFolder) {
                existing.parentFolder = parentFolder;
            }
            return existing;
        }
        var comp = app.project.items.addComp(name, width, height, pixelAspect, duration, fps);
        if (parentFolder) {
            comp.parentFolder = parentFolder;
        }
        return comp;
    }

    function removeGeneratedLayers(mainComp, prefix) {
        for (var i = mainComp.numLayers; i >= 1; i--) {
            var lyr = mainComp.layer(i);
            if (lyr && lyr.source && (lyr.source instanceof CompItem)) {
                if (lyr.source.name.indexOf(prefix) === 0) {
                    lyr.remove();
                }
            }
        }
    }

    app.beginUndoGroup("Build Retro Terminal Scenes");

    try {
        var masterComp = getMasterComp();
        if (!masterComp) {
            throw new Error("Could not find a master comp. Open your main video comp or name it 'path 1'.");
        }

        var scenes = parseScenesFromFile(TEXT_FILE_PATH);
        if (!scenes.length) {
            throw new Error("No scenes found in the text file.");
        }

        var generatedFolder = getOrCreateFolder(GENERATED_FOLDER_NAME);
        var timings = getSceneTiming(scenes.length, masterComp.duration);

        // Remove previously generated scene layers in master comp before rebuilding placements.
        removeGeneratedLayers(masterComp, SCENE_COMP_PREFIX);

        var beatMarkerLayer = findBeatMarkerLayer(masterComp);

        var expr = typingExpression();
        var skippedCount = 0;
        for (var s = 0; s < scenes.length; s++) {
            var idx = s + 1;
            var t = timings[s];
            var sceneName = SCENE_COMP_PREFIX + (idx < 10 ? "0" + idx : "" + idx);

            // Skip scenes that are flagged disabled in TIMING_OVERRIDES. The time slot
            // is left empty so the underlying footage shows through unmodified.
            if (TIMING_OVERRIDES[idx] && TIMING_OVERRIDES[idx].disabled === true) {
                skippedCount++;
                continue;
            }

            var sceneComp = getOrCreateComp(
                sceneName,
                masterComp.width,
                masterComp.height,
                masterComp.pixelAspect,
                t.duration,
                masterComp.frameRate,
                generatedFolder
            );

            // Remove all layers in scene comp; rebuild to keep reruns deterministic.
            for (var li = sceneComp.numLayers; li >= 1; li--) {
                sceneComp.layer(li).remove();
            }

            var txtLayer = sceneComp.layers.addText(scenes[s].body);
            txtLayer.name = "TerminalText";
            addSlider(txtLayer, "StartTime", 0.0);
            addSlider(txtLayer, "CharsPerSecond", BASE_CHARS_PER_SECOND);
            addSlider(txtLayer, "LineJitterPct", BASE_LINE_JITTER_PCT);
            addSlider(txtLayer, "LinePause", BASE_LINE_PAUSE);
            addSlider(txtLayer, "CursorBlinkRate", BASE_CURSOR_BLINK_RATE);
            addSlider(txtLayer, "PostTypeHold", BASE_POST_HOLD);

            var marker = new MarkerValue(scenes[s].body);
            txtLayer.property("Marker").setValueAtTime(0, marker);
            txtLayer.property("ADBE Text Properties").property("ADBE Text Document").expression = expr;
            // Apply font styling AFTER enabling the Source Text expression, otherwise AE can keep Myriad.
            setTerminalTextStyle(txtLayer, sceneComp);
            addTextGlow(txtLayer);
            var frameLayer = addTerminalFrame(sceneComp);
            if (frameLayer) {
                // Frame shape (with its background fill) must sit below the typed text
                // so the fill darkens only the footage, not the bright green text.
                try { frameLayer.moveAfter(txtLayer); } catch (eMvFrame) {}
            }
            addCRTPass(sceneComp);
            if (ENABLE_SIGNAL_GLITCH) {
                var beats = collectBeatTimesInRange(beatMarkerLayer, t.start, t.end);
                var beatLiteral = formatBeatTimesLiteral(beats, t.start);
                addSignalGlitch(sceneComp, beatLiteral);
            }

            var placed = masterComp.layers.add(sceneComp);
            placed.startTime = t.start;
            placed.inPoint = t.start;
            placed.outPoint = t.end;
            placed.name = sceneName + "_overlay";
            placed.moveToBeginning();
        }

        addMasterCRTPolish(masterComp);

        alert(
            "Retro terminal setup complete.\n\n" +
            "Scenes built: " + (scenes.length - skippedCount) + "\n" +
            "Scenes skipped (disabled): " + skippedCount + "\n" +
            "Master comp: " + masterComp.name + "\n\n" +
            "Beat-synced glitches: add a layer named BEATS (or MARKERS) in the master comp and drop timeline markers on the beats.\n\n" +
            "Tip: edit TIMING_OVERRIDES in the script for exact scene timings, then rerun."
        );
    } catch (err) {
        alert("Retro terminal builder failed:\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
})();

