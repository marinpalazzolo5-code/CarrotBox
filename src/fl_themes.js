    // ======================================================================
    // BeepBox FL: extra color themes. Each theme fills in the same CSS
    // variables as BeepBox's built-in "dark classic" / "light classic".
    // ======================================================================
    function flHsl(h, s, l) {
        return "hsl(" + ((h % 360) + 360) % 360 + ", " + s + "%, " + l + "%)";
    }
    function flMakeTheme(t) {
        const dark = !t.light;
        const sat = t.sat == undefined ? 85 : t.sat;
        const noiseSat = t.noiseSat == undefined ? 35 : t.noiseSat;
        const lv = t.levels || (dark ? [32, 62, 45, 78] : [72, 38, 55, 28]);
        let css = ":root {\n";
        const vars = {
            "page-margin": t.pageMargin, "editor-background": t.editorBackground, "hover-preview": t.hoverPreview || (dark ? "white" : "black"),
            "playhead": t.playhead || (dark ? "white" : "rgba(0,0,0,0.5)"), "primary-text": t.primaryText, "secondary-text": t.secondaryText,
            "inverted-text": t.invertedText || (dark ? "black" : "white"), "text-selection": t.textSelection || "rgba(119,68,255,0.99)",
            "box-selection-fill": t.boxSelectionFill || (dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)"), "loop-accent": t.loopAccent,
            "link-accent": t.linkAccent, "ui-widget-background": t.uiWidgetBackground, "ui-widget-focus": t.uiWidgetFocus,
            "pitch-background": t.pitchBackground, "tonic": t.tonic, "fifth-note": t.fifthNote, "white-piano-key": t.whitePianoKey || (dark ? "#bbb" : "#eee"),
            "black-piano-key": t.blackPianoKey || (dark ? "#444" : "#666"), "fl-accent": t.flAccent || t.loopAccent, "fl-accent-2": t.flAccent2 || t.linkAccent,
            "fl-panel": t.flPanel || t.editorBackground,
        };
        for (const key of Object.keys(vars))
            css += "\t--" + key + ": " + vars[key] + ";\n";
        t.pitchHues.forEach((h, i) => {
            const s = Array.isArray(sat) ? sat[i] : sat;
            css += `\t--pitch${i + 1}-secondary-channel: ${flHsl(h, s, lv[0])};\n\t--pitch${i + 1}-primary-channel: ${flHsl(h, s, lv[1])};\n\t--pitch${i + 1}-secondary-note: ${flHsl(h, s, lv[2])};\n\t--pitch${i + 1}-primary-note: ${flHsl(h, s, lv[3])};\n`;
        });
        t.noiseHues.forEach((h, i) => {
            css += `\t--noise${i + 1}-secondary-channel: ${flHsl(h, noiseSat, lv[0])};\n\t--noise${i + 1}-primary-channel: ${flHsl(h, noiseSat, lv[1])};\n\t--noise${i + 1}-secondary-note: ${flHsl(h, noiseSat, lv[2])};\n\t--noise${i + 1}-primary-note: ${flHsl(h, noiseSat, lv[3])};\n`;
        });
        css += "}\n";
        if (!dark) {
            css += ":root { -webkit-text-stroke-width: 0.5px; }\n.beepboxEditor button, .beepboxEditor select { box-shadow: inset 0 0 0 1px var(--secondary-text); }\n";
        }
        if (t.extra)
            css += t.extra;
        return css;
    }
    const flRainbow = [185, 60, 25, 120, 300, 240, 75, 350, 160, 275];
    const flNoiseHues = [0, 30, 210, 275, 85];
    FLConfigThemes: {
        const themes = {
            "FL Studio": { pageMargin: "#1f2528", editorBackground: "#2c3539", pitchBackground: "#3d4b52", tonic: "#56704a", fifthNote: "#46597a", uiWidgetBackground: "#47575f", uiWidgetFocus: "#5c6f78", primaryText: "#e8eff2", secondaryText: "#98aab3", invertedText: "#182024", loopAccent: "#ff9b21", linkAccent: "#ffb54d", playhead: "#9be36b", textSelection: "rgba(255,155,33,0.6)", whitePianoKey: "#d7dde0", blackPianoKey: "#30393d", pitchHues: [140, 30, 200, 330, 265, 52, 5, 178, 92, 228], noiseHues: [25, 205, 290, 115, 48], sat: 70, noiseSat: 45, flAccent: "#ff9b21", flAccent2: "#9be36b", flPanel: "#252d31" },
            "FL Studio Neon": { pageMargin: "#101315", editorBackground: "#171c1f", pitchBackground: "#252d32", tonic: "#3b5530", fifthNote: "#2d3d58", uiWidgetBackground: "#2f393f", uiWidgetFocus: "#425058", primaryText: "#f2f7f9", secondaryText: "#8b9ca5", loopAccent: "#7bff4f", linkAccent: "#ffcf3d", playhead: "#7bff4f", textSelection: "rgba(123,255,79,0.5)", whitePianoKey: "#c9d1d5", blackPianoKey: "#262d31", pitchHues: [110, 45, 190, 320, 270, 60, 0, 170, 85, 225], noiseHues: [30, 200, 300, 110, 50], sat: 95, noiseSat: 55, levels: [30, 58, 46, 72], flAccent: "#7bff4f", flAccent2: "#ffcf3d", flPanel: "#12171a" },
            "Midnight": { pageMargin: "#05070f", editorBackground: "#0b1020", pitchBackground: "#18203a", tonic: "#3a2f5e", fifthNote: "#1f3d5c", uiWidgetBackground: "#222b4a", uiWidgetFocus: "#2f3b63", primaryText: "#e4e9ff", secondaryText: "#7d88b5", loopAccent: "#7a5cff", linkAccent: "#9db4ff", playhead: "#b3c3ff", pitchHues: [195, 285, 320, 160, 230, 55, 260, 175, 340, 210], noiseHues: [220, 260, 190, 300, 170], sat: 80, noiseSat: 40 },
            "Neon Night": { pageMargin: "#000", editorBackground: "#05050a", pitchBackground: "#16161f", tonic: "#4a1550", fifthNote: "#123f4a", uiWidgetBackground: "#1e1e2a", uiWidgetFocus: "#2c2c3d", primaryText: "#ffffff", secondaryText: "#8f8fb0", loopAccent: "#ff2bd6", linkAccent: "#2bf5ff", playhead: "#2bf5ff", pitchHues: [180, 300, 60, 120, 330, 30, 270, 150, 90, 210], noiseHues: [320, 190, 60, 270, 140], sat: 100, noiseSat: 70, levels: [32, 55, 45, 70] },
            "Retro Terminal": { pageMargin: "#000", editorBackground: "#020a03", pitchBackground: "#0b220e", tonic: "#1f4a1c", fifthNote: "#163a24", uiWidgetBackground: "#0f2e13", uiWidgetFocus: "#17421c", primaryText: "#7dff7a", secondaryText: "#3c9a3a", invertedText: "#001a00", loopAccent: "#33ff66", linkAccent: "#a8ff9e", playhead: "#b8ffb0", textSelection: "rgba(51,255,102,0.5)", whitePianoKey: "#4fbf4c", blackPianoKey: "#0b2a0c", pitchHues: [120, 100, 140, 85, 155, 110, 130, 95, 145, 75], noiseHues: [120, 90, 150, 105, 135], sat: 75, noiseSat: 45, extra: ".beepboxEditor { font-family: 'Courier New', monospace; }\n" },
            "Amber Terminal": { pageMargin: "#000", editorBackground: "#0d0700", pitchBackground: "#2a1a05", tonic: "#4f3305", fifthNote: "#3a2a12", uiWidgetBackground: "#33210a", uiWidgetFocus: "#4a300f", primaryText: "#ffbf47", secondaryText: "#a8762a", invertedText: "#1a0f00", loopAccent: "#ffa21a", linkAccent: "#ffd27a", playhead: "#ffe0a3", textSelection: "rgba(255,162,26,0.5)", whitePianoKey: "#c98f2e", blackPianoKey: "#2b1a04", pitchHues: [38, 28, 48, 20, 55, 33, 43, 15, 50, 25], noiseHues: [35, 25, 45, 30, 40], sat: 90, noiseSat: 60, extra: ".beepboxEditor { font-family: 'Courier New', monospace; }\n" },
            "Sunset": { pageMargin: "#140812", editorBackground: "#1f0d1c", pitchBackground: "#3a1a2f", tonic: "#6b3121", fifthNote: "#45284f", uiWidgetBackground: "#46213b", uiWidgetFocus: "#5c2c4e", primaryText: "#ffe9d6", secondaryText: "#c08aa0", loopAccent: "#ff7a45", linkAccent: "#ffb36b", playhead: "#ffd59e", pitchHues: [20, 345, 45, 300, 5, 270, 35, 325, 55, 280], noiseHues: [15, 330, 40, 290, 0], sat: 85, noiseSat: 45 },
            "Ocean": { pageMargin: "#021016", editorBackground: "#06202a", pitchBackground: "#0d3442", tonic: "#1a5560", fifthNote: "#18405e", uiWidgetBackground: "#124050", uiWidgetFocus: "#195368", primaryText: "#dff8ff", secondaryText: "#6fa9bb", loopAccent: "#2ad4c8", linkAccent: "#7fe3ff", playhead: "#a8f6ff", pitchHues: [185, 200, 165, 215, 150, 230, 175, 195, 140, 245], noiseHues: [190, 170, 210, 155, 225], sat: 75, noiseSat: 40 },
            "Forest": { pageMargin: "#0b1006", editorBackground: "#141c0e", pitchBackground: "#243118", tonic: "#4b4a1c", fifthNote: "#24402c", uiWidgetBackground: "#2c3b1f", uiWidgetFocus: "#3b4f29", primaryText: "#eef5df", secondaryText: "#93a77a", loopAccent: "#c7d93a", linkAccent: "#e3c06b", playhead: "#f5f7d0", pitchHues: [95, 40, 140, 25, 70, 160, 55, 110, 15, 125], noiseHues: [35, 90, 20, 130, 60], sat: 60, noiseSat: 35 },
            "Cherry Blossom": { light: true, pageMargin: "#f3c6d6", editorBackground: "#fff7fa", pitchBackground: "#f8e1ea", tonic: "#f5c1c1", fifthNote: "#d9e4f7", uiWidgetBackground: "#fbe6ee", uiWidgetFocus: "#fdf0f5", primaryText: "#4a2233", secondaryText: "#a8738a", loopAccent: "#ff6fa5", linkAccent: "#d1407a", playhead: "rgba(120,30,70,0.55)", textSelection: "rgba(255,111,165,0.4)", whitePianoKey: "#fffafc", blackPianoKey: "#a8738a", pitchHues: [335, 200, 30, 140, 280, 50, 0, 175, 310, 225], noiseHues: [340, 20, 260, 160, 45], sat: 70, noiseSat: 35 },
            "Paper": { light: true, pageMargin: "#d9cfbd", editorBackground: "#fbf6ec", pitchBackground: "#efe6d4", tonic: "#ecd3a8", fifthNote: "#d5e0e8", uiWidgetBackground: "#efe5d2", uiWidgetFocus: "#f7f0e2", primaryText: "#3a2f22", secondaryText: "#8b7a62", loopAccent: "#c46b2a", linkAccent: "#8a4a1c", playhead: "rgba(60,40,20,0.55)", whitePianoKey: "#fffaf0", blackPianoKey: "#7a6a52", pitchHues: [200, 40, 10, 130, 290, 230, 60, 340, 170, 270], noiseHues: [30, 200, 0, 120, 260], sat: 55, noiseSat: 25 },
            "Monochrome": { pageMargin: "#000", editorBackground: "#0a0a0a", pitchBackground: "#262626", tonic: "#4a4a4a", fifthNote: "#383838", uiWidgetBackground: "#2e2e2e", uiWidgetFocus: "#454545", primaryText: "#f0f0f0", secondaryText: "#8a8a8a", loopAccent: "#bbbbbb", linkAccent: "#dddddd", playhead: "#ffffff", pitchHues: flRainbow, noiseHues: flNoiseHues, sat: 0, noiseSat: 0, levels: [30, 70, 50, 85] },
            "Dracula": { pageMargin: "#191a21", editorBackground: "#282a36", pitchBackground: "#383a4a", tonic: "#5a4b72", fifthNote: "#3d4f6b", uiWidgetBackground: "#44475a", uiWidgetFocus: "#565a73", primaryText: "#f8f8f2", secondaryText: "#8f95b8", loopAccent: "#bd93f9", linkAccent: "#ff79c6", playhead: "#f8f8f2", pitchHues: [265, 326, 135, 191, 31, 65, 0, 160, 290, 225], noiseHues: [265, 326, 191, 31, 135], sat: 90, noiseSat: 45, levels: [35, 70, 55, 82] },
            "Nord": { pageMargin: "#242933", editorBackground: "#2e3440", pitchBackground: "#3b4252", tonic: "#5e5a4a", fifthNote: "#3f5068", uiWidgetBackground: "#434c5e", uiWidgetFocus: "#4c566a", primaryText: "#eceff4", secondaryText: "#93a1ba", loopAccent: "#88c0d0", linkAccent: "#81a1c1", playhead: "#eceff4", pitchHues: [193, 40, 355, 92, 311, 213, 14, 179, 260, 60], noiseHues: [210, 30, 355, 100, 300], sat: 45, noiseSat: 25, levels: [35, 65, 50, 80] },
            "Cyberpunk": { pageMargin: "#05010d", editorBackground: "#0d0221", pitchBackground: "#1d0b3b", tonic: "#4d1b45", fifthNote: "#0f3a4f", uiWidgetBackground: "#261145", uiWidgetFocus: "#371a61", primaryText: "#fdf500", secondaryText: "#b47cff", invertedText: "#0d0221", loopAccent: "#ff2a6d", linkAccent: "#05d9e8", playhead: "#05d9e8", textSelection: "rgba(255,42,109,0.6)", pitchHues: [56, 340, 185, 285, 120, 20, 205, 310, 90, 260], noiseHues: [340, 185, 56, 285, 120], sat: 100, noiseSat: 70, levels: [33, 55, 45, 70] },
            "High Contrast": { pageMargin: "#000", editorBackground: "#000", pitchBackground: "#1e1e1e", tonic: "#663d00", fifthNote: "#003d66", uiWidgetBackground: "#222", uiWidgetFocus: "#3a3a3a", primaryText: "#ffffff", secondaryText: "#c8c8c8", loopAccent: "#ffff00", linkAccent: "#00ffff", playhead: "#ffff00", pitchHues: flRainbow, noiseHues: flNoiseHues, sat: 100, noiseSat: 60, levels: [35, 55, 50, 75], extra: ".beepboxEditor button, .beepboxEditor select { box-shadow: inset 0 0 0 1px #fff; }\n" },
        };
        for (const name of Object.keys(themes)) {
            ColorConfig.themes[name] = flMakeTheme(themes[name]);
        }
        ColorConfig.flThemePreviews = {};
        for (const name of Object.keys(themes)) {
            const t = themes[name];
            ColorConfig.flThemePreviews[name] = { bg: t.editorBackground, panel: t.uiWidgetBackground, row: t.pitchBackground, text: t.primaryText, accent: t.loopAccent, colors: t.pitchHues.slice(0, 5).map(h => flHsl(h, Array.isArray(t.sat) ? t.sat[0] : (t.sat == undefined ? 85 : t.sat), t.light ? 45 : 62)) };
        }
        ColorConfig.flThemePreviews["dark classic"] = { bg: "black", panel: "#444", row: "#444", text: "white", accent: "#74f", colors: ["#25F3FF", "#FFFF25", "#FF9752", "#50FF50", "#FF90FF"] };
        ColorConfig.flThemePreviews["light classic"] = { bg: "white", panel: "#ececec", row: "#ececec", text: "black", accent: "#98f", colors: ["#00A0BD", "#B49700", "#E14E00", "#00A800", "#C500C5"] };
    }
