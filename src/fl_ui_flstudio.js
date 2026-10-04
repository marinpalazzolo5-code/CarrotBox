    // ======================================================================
    // CarrotBox: FL Studio interface mode (Settings > Appearance).
    //
    // Turns the editor into an FL Studio style workspace: full-window layout,
    // FL colors and controls, a top bar with the menu strip, hint bar,
    // PAT / SONG switch, transport, LCD tempo and song position, snap, pattern
    // picker, master volume and CPU meter, plus a Channel Rack (step
    // sequencer) and a Mixer, and FL's function keys (F5 playlist, F6 channel
    // rack, F7 piano roll, F8 browser, F9 mixer, F10 settings, F1 help, L
    // pattern / song). It is a recreation of the workflow and look; no
    // Image-Line artwork is used.
    // ======================================================================
    const CFL_CSS = `
html.carrot-fl {
	--cfl-top-h: 62px;
	--cfl-bg: #2e363a; --cfl-panel: #3a4449; --cfl-panel2: #434e54; --cfl-dark: #232a2e; --cfl-line: #1c2225;
	--cfl-text: #d3dadd; --cfl-dim: #8e9ba1; --cfl-orange: #f39d38; --cfl-green: #9be36b; --cfl-lcd: #a9f56b; --cfl-lcd-bg: #182023;
	--page-margin: #22292c;
	background: #22292c;
}
html.carrot-fl body { margin: 0; padding-top: var(--cfl-top-h); display: block; font-family: "Segoe UI", Tahoma, Verdana, Arial, sans-serif; }
html.carrot-fl #text-content { display: none; }
html.carrot-fl #beepboxEditorContainer { max-width: none !important; width: 100%; height: calc(100vh - var(--cfl-top-h)); padding: 0 6px; box-sizing: border-box; overflow: hidden; }
html.carrot-fl .beepboxEditor { width: 100% !important; height: calc(100vh - var(--cfl-top-h) - 6px) !important; font-size: 12px; font-family: "Segoe UI", Tahoma, Verdana, Arial, sans-serif; }
/* one roomy settings column: song settings, then the instrument */
@media (min-width: 711px) {
	html.carrot-fl .beepboxEditor:not(.fl-view) { grid-template-columns: minmax(0, 1fr) 300px !important; }
	html.carrot-fl .beepboxEditor.fl-view { grid-template-columns: max-content minmax(0, 1fr) 300px !important; }
	html.carrot-fl .beepboxEditor .settings-area {
		width: 300px !important; box-sizing: border-box; display: grid !important;
		grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: auto minmax(0, 1fr) !important;
		grid-template-areas: "song-settings-area" "instrument-settings-area" !important;
		gap: 8px; padding: 8px 8px 10px !important;
	}
	html.carrot-fl .beepboxEditor .instrument-settings-area > .editor-controls { position: static !important; }
	html.carrot-fl .beepboxEditor .song-settings-area, html.carrot-fl .beepboxEditor .instrument-settings-area {
		background: var(--cfl-panel2); border: 1px solid #2a3236; border-radius: 3px; padding: 6px 8px !important; overflow: visible !important;
	}
}
html.carrot-fl .beepboxEditor .selectRow { min-height: 28px; gap: 8px; }
html.carrot-fl .beepboxEditor .selectRow > span:first-child, html.carrot-fl .beepboxEditor .selectRow > .tip { flex: 0 0 auto; margin-right: 6px; }
html.carrot-fl .beepboxEditor .version-area,
html.carrot-fl .beepboxEditor .play-pause-area,
html.carrot-fl .beepboxEditor .menu-area { display: none !important; }
html.carrot-fl .beepboxEditor .settings-area { background: var(--cfl-panel); border-left: 1px solid var(--cfl-line); padding: 4px 6px; overflow-y: auto; }
html.carrot-fl .beepboxEditor .pattern-area, html.carrot-fl .beepboxEditor .track-area { background: var(--cfl-bg); }
/* buttons, selects, sliders */
html.carrot-fl .beepboxEditor button, html.carrot-fl .cb-window button, html.carrot-fl .cfl-top button {
	background: linear-gradient(#5b666c, #464f54) !important; color: var(--cfl-text) !important; border: 1px solid var(--cfl-line) !important;
	border-radius: 2px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); font-family: inherit;
}
html.carrot-fl .beepboxEditor button:hover, html.carrot-fl .cb-window button:hover, html.carrot-fl .cfl-top button:hover { background: linear-gradient(#6a767c, #50595e) !important; }
html.carrot-fl .cb-window button.cb-primary, html.carrot-fl .cb-window .cb-toggle.cb-on, html.carrot-fl .cfl-top button.cfl-on { background: linear-gradient(#f6ad4f, #d9821f) !important; color: #1b1f21 !important; }
html.carrot-fl .beepboxEditor select, html.carrot-fl .cb-window select, html.carrot-fl .cfl-top select { background-color: var(--cfl-dark) !important; color: var(--cfl-text) !important; border: 1px solid var(--cfl-line); border-radius: 2px; }
html.carrot-fl .beepboxEditor .selectContainer::after { border-top-color: var(--cfl-orange) !important; }
html.carrot-fl input[type=range] { accent-color: var(--cfl-orange); }
/* floating windows look like FL windows */
html.carrot-fl .cb-window { background: var(--cfl-panel) !important; border: 1px solid #1a1f22 !important; border-radius: 3px !important; box-shadow: 0 8px 28px rgba(0,0,0,0.55) !important; }
html.carrot-fl .cb-window-title { background: linear-gradient(#56636a, #3f494f) !important; color: #e3e9ec !important; height: 24px; font-size: 12px; border-bottom: 1px solid #1a1f22; }
html.carrot-fl .cb-window-title .cb-window-name { font-weight: 600; letter-spacing: 0.02em; }
html.carrot-fl .cb-window-title button { width: 20px; height: 18px; padding: 0 !important; font-size: 11px; }
html.carrot-fl .cb-section { background: var(--cfl-panel2) !important; border: 1px solid #2a3236 !important; border-radius: 2px !important; }
html.carrot-fl .cb-section-title { color: var(--cfl-orange) !important; }
html.carrot-fl .prompt { background: var(--cfl-panel) !important; border: 1px solid #1a1f22 !important; border-radius: 3px; }
/* the top bar */
.cfl-top { display: none; }
html.carrot-fl .cfl-top {
	display: flex; flex-wrap: wrap; position: fixed; top: 0; left: 0; right: 0; min-height: 62px; z-index: 40; box-sizing: border-box;
	background: linear-gradient(#4d585e, #3a4348); border-bottom: 1px solid #161b1e; color: var(--cfl-text);
	font: 12px "Segoe UI", Tahoma, Verdana, Arial, sans-serif; align-items: stretch; gap: 4px 8px; padding: 4px 8px; user-select: none;
}
/* groups keep their size; when the window is narrow the bar wraps onto a second row */
.cfl-top > * { flex: none; }
.cfl-col { display: flex; flex-direction: column; justify-content: space-between; gap: 3px; }
@media (max-width: 1280px) { html.carrot-fl .cfl-cpu { display: none; } html.carrot-fl .cfl-hint { width: 230px; } }
@media (max-width: 980px) { html.carrot-fl .cfl-hint { display: none; } html.carrot-fl .cfl-lcd .cfl-big { font-size: 16px; } }
.cfl-menus { display: flex; gap: 1px; }
.cfl-menus button { background: transparent !important; border: none !important; box-shadow: none !important; color: #c8d1d5 !important; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; padding: 2px 6px; border-radius: 2px !important; }
.cfl-menus button:hover, .cfl-menus button.cfl-open { background: rgba(255,255,255,0.12) !important; color: #fff !important; }
.cfl-hint { height: 24px; width: 300px; max-width: 30vw; background: var(--cfl-lcd-bg); border: 1px solid #10161a; border-radius: 2px; color: #b9c6cc; font-size: 11px; line-height: 22px; padding: 0 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cfl-hint b { color: var(--cfl-orange); font-weight: 600; }
.cfl-group { display: flex; align-items: center; gap: 4px; padding: 0 6px; border-left: 1px solid rgba(0,0,0,0.35); box-shadow: -1px 0 0 rgba(255,255,255,0.06); }
.cfl-mode { display: flex; flex-direction: column; gap: 2px; }
.cfl-mode button { height: 18px; min-width: 42px; padding: 0 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
.cfl-transport button { width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; }
.cfl-transport svg { width: 16px; height: 16px; }
.cfl-transport button.cfl-playing svg { fill: var(--cfl-green); }
.cfl-transport button.cfl-recording svg { fill: #ff4d4d; }
.cfl-lcd { background: var(--cfl-lcd-bg); border: 1px solid #10161a; border-radius: 2px; color: var(--cfl-lcd); font-family: "Consolas", "Lucida Console", "Courier New", monospace; padding: 2px 6px; display: flex; flex-direction: column; justify-content: center; min-width: 74px; cursor: ns-resize; }
.cfl-lcd .cfl-big { font-size: 19px; line-height: 20px; letter-spacing: 0.04em; text-shadow: 0 0 6px rgba(169,245,107,0.35); }
.cfl-lcd .cfl-small { font-size: 9px; color: #6f8a60; letter-spacing: 0.08em; }
.cfl-lcd.cfl-pos { cursor: default; min-width: 92px; }
.cfl-cpu { width: 46px; height: 30px; display: flex; flex-direction: column; gap: 2px; font-size: 9px; color: var(--cfl-dim); }
.cfl-meter { height: 8px; background: var(--cfl-lcd-bg); border: 1px solid #10161a; border-radius: 1px; overflow: hidden; }
.cfl-meter div { height: 100%; width: 0; background: linear-gradient(90deg, #6fd14a, #e8d13f 70%, #f2603a); }
.cfl-windows button { width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; }
.cfl-windows svg { width: 18px; height: 18px; fill: none; stroke: #dce3e6; stroke-width: 1.6; }
.cfl-windows button.cfl-on svg { stroke: #1b1f21; }
.cfl-pattern { display: flex; align-items: center; gap: 3px; }
.cfl-pattern .cfl-pname { background: var(--cfl-lcd-bg); border: 1px solid #10161a; border-radius: 2px; min-width: 86px; padding: 3px 6px; color: var(--cfl-orange); font-weight: 600; text-align: center; }
.cfl-pattern button { width: 20px; height: 22px; padding: 0; }
.cfl-dropdown { position: fixed; z-index: 96; min-width: 220px; max-height: 70vh; overflow: auto; background: #3a4449; border: 1px solid #161b1e; border-radius: 2px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); padding: 3px 0; font: 12px "Segoe UI", Tahoma, Verdana, Arial, sans-serif; color: var(--cfl-text); }
.cfl-dropdown div { padding: 4px 14px; cursor: pointer; white-space: nowrap; display: flex; justify-content: space-between; gap: 18px; }
.cfl-dropdown div:hover { background: var(--cfl-orange); color: #15191b; }
.cfl-dropdown div.cfl-sep { padding: 0; height: 1px; margin: 3px 0; background: rgba(0,0,0,0.4); cursor: default; }
.cfl-dropdown div small { opacity: 0.6; }
.cfl-dropdown div.cfl-disabled { opacity: 0.45; cursor: default; }
/* channel rack */
.cfl-rack { display: flex; flex-direction: column; gap: 3px; }
.cfl-rack-row { display: flex; align-items: center; gap: 4px; height: 26px; }
.cfl-led { width: 10px; height: 10px; border-radius: 50%; background: var(--cfl-green, #9be36b); box-shadow: 0 0 4px rgba(155,227,107,0.6); cursor: pointer; flex: none; border: 1px solid #1b2124; }
.cfl-led.cfl-off { background: #2c3437; box-shadow: none; }
.cfl-rack-name { width: 118px; height: 22px; text-align: left; padding: 0 6px !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; border-left: 4px solid var(--cfl-chan, #888) !important; flex: none; }
.cfl-rack-name.cfl-current { outline: 1px solid var(--cfl-orange, #f39d38); }
.cfl-steps { display: flex; gap: 2px; }
.cfl-step { width: 15px; height: 22px; border-radius: 2px; border: 1px solid #1d2326; cursor: pointer; background: #4b5358; }
.cfl-step.cfl-alt { background: #5b4a4c; }
.cfl-step.cfl-on { background: linear-gradient(#f2f4f5, #c9ced1); }
.cfl-step.cfl-playing { box-shadow: 0 0 0 1px var(--cfl-green, #9be36b) inset; }
.cfl-rack-row .cb-knob { width: 24px; min-width: 24px; height: 24px; padding: 0; }
.cfl-rack-row .cb-knob svg { width: 22px; height: 22px; }
.cfl-rack-row .cb-knob .cb-knob-label, .cfl-rack-row .cb-knob .cb-knob-value { display: none; }
.cfl-steps.cfl-many .cfl-step { width: 11px; }
.cfl-rack-pitch { width: 54px; font-size: 10px; height: 20px; }
/* mixer */
.cfl-mixer { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.cfl-strip { width: 70px; flex: none; background: #353f44; border: 1px solid #222a2e; border-radius: 2px; padding: 4px; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; }
.cfl-strip.cfl-current { border-color: var(--cfl-orange, #f39d38); }
.cfl-strip.cfl-master { background: #3d3a35; }
.cfl-strip .cfl-sname { width: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; border-bottom: 3px solid var(--cfl-chan, #888); padding-bottom: 2px; cursor: pointer; }
.cfl-fader { writing-mode: vertical-lr; direction: rtl; height: 120px; width: 22px; }
.cfl-strip .cfl-fx { width: 100%; display: flex; flex-direction: column; gap: 2px; }
.cfl-strip .cfl-fx button { width: 100%; height: 16px; font-size: 9px; padding: 0 !important; text-align: left; padding-left: 4px !important; }
.cfl-strip .cfl-ms { display: flex; gap: 2px; }
.cfl-strip .cfl-ms button { width: 26px; height: 18px; padding: 0 !important; font-size: 10px; }
.cfl-strip .cfl-ms button.cfl-on { background: linear-gradient(#f6ad4f, #d9821f) !important; color: #1b1f21 !important; }
`;
    function cflChannelName(song, c) {
        const channel = song.channels[c];
        if (channel.name)
            return channel.name;
        if (song.getChannelIsNoise(c)) {
            const n = c - song.pitchChannelCount + 1;
            return song.noiseChannelCount > 1 ? "Drums " + n : "Drums";
        }
        const instrument = channel.instruments[0];
        const preset = EditorConfig.valueToPreset(instrument.preset);
        if (preset && preset.customType == undefined)
            return preset.name.replace(/^./, (x) => x.toUpperCase());
        if (instrument.type == FLConfig.typePlugin && instrument.fl.plugin.id && CarrotPlugins.info(instrument.fl.plugin.id))
            return CarrotPlugins.info(instrument.fl.plugin.id).name;
        return "Channel " + (c + 1);
    }
    const CFL_ICON = {
        play: '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>',
        stop: '<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" fill="currentColor"/></svg>',
        record: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="currentColor"/></svg>',
        playlist: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14"/><path d="M2 7.5h16M2 12h16M5 4v12"/><rect x="7" y="8.5" width="4" height="2.5" fill="#dce3e6" stroke="none"/></svg>',
        pianoroll: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14"/><path d="M5.5 3v14"/><path d="M8 6h4M10 10h5M7.5 14h3"/></svg>',
        rack: '<svg viewBox="0 0 20 20"><rect x="2" y="3" width="16" height="14"/><path d="M2 7.5h16M2 12h16"/><path d="M7 3v14M10.5 3v14M14 3v14"/></svg>',
        mixer: '<svg viewBox="0 0 20 20"><path d="M5 3v14M10 3v14M15 3v14"/><rect x="3.5" y="11" width="3" height="2"/><rect x="8.5" y="6" width="3" height="2"/><rect x="13.5" y="9" width="3" height="2"/></svg>',
        browser: '<svg viewBox="0 0 20 20"><path d="M2 5h6l2 2h8v9H2z"/></svg>',
        plugin: '<svg viewBox="0 0 20 20"><path d="M7 3h6v4h4v6h-4v4H7v-4H3V7h4z"/></svg>',
    };
    class CarrotFLStudio {
        static install(editor) {
            CarrotFLStudio.editor = editor;
            if (!CarrotFLStudio._style)
                CarrotFLStudio._style = document.head.appendChild(HTML.style({ type: "text/css" }, CFL_CSS));
            // pattern mode (PAT): the synth loops the selected bar instead of the song
            CarrotFLStudio.apply();
        }
        static get on() {
            return !!CarrotSettings.get("flStudioUI");
        }
        // Called from carrotApplySettings.
        static apply() {
            const editor = CarrotFLStudio.editor;
            if (!editor)
                return;
            const on = CarrotFLStudio.on;
            const root = document.documentElement;
            const was = root.classList.contains("carrot-fl");
            root.classList.toggle("carrot-fl", on);
            const prefs = editor.doc.prefs;
            if (on && !was) {
                // remember the BeepBox side of things so turning the mode off puts it back
                try {
                    window.localStorage.setItem("carrot:flPrev", JSON.stringify({ theme: prefs.colorTheme, layout: prefs.layout, view: prefs.flView }));
                }
                catch (error) { }
                prefs.colorTheme = "FL Studio";
                ColorConfig.setTheme(prefs.colorTheme);
                if (prefs.layout == "small")
                    prefs.layout = "long";
                Layout.setLayout(prefs.layout);
                prefs.flView = "playlist";
                prefs.save();
                CarrotFLStudio._buildTop(editor);
                setTimeout(() => editor.whenUpdated(), 0);
            }
            else if (!on && was) {
                let prev = null;
                try {
                    prev = JSON.parse(window.localStorage.getItem("carrot:flPrev") || "null");
                }
                catch (error) { }
                if (prev) {
                    prefs.colorTheme = prev.theme || "dark classic";
                    prefs.layout = prev.layout || "small";
                    prefs.flView = prev.view || "grid";
                    ColorConfig.setTheme(prefs.colorTheme);
                    Layout.setLayout(prefs.layout);
                    prefs.save();
                }
                editor.doc.synth.flPatternMode = null;
                CarrotFLStudio._patternMode = false;
                for (const key of ["flChannelRack", "flMixer"]) {
                    const win = CarrotWindows._open.get(key);
                    if (win)
                        win.close();
                }
                if (CarrotFLStudio._top)
                    CarrotFLStudio._closeMenu();
                setTimeout(() => editor.whenUpdated(), 0);
            }
            else if (on && !CarrotFLStudio._top) {
                CarrotFLStudio._buildTop(editor);
            }
        }
        // ---------------------------------------------------------- top bar
        static _buildTop(editor) {
            if (CarrotFLStudio._top)
                return;
            const doc = editor.doc;
            const top = HTML.div({ class: "cfl-top" });
            CarrotFLStudio._top = top;
            // menus + hint bar
            const menus = HTML.div({ class: "cfl-menus" });
            const hint = HTML.div({ class: "cfl-hint" }, "Welcome to CarrotBox (FL Studio mode)");
            CarrotFLStudio._hint = hint;
            for (const name of ["FILE", "EDIT", "ADD", "PATTERNS", "VIEW", "OPTIONS", "TOOLS", "HELP"]) {
                const button = HTML.button({ type: "button", title: name.charAt(0) + name.slice(1).toLowerCase() + " menu" }, name);
                button.addEventListener("click", (event) => { event.stopPropagation(); CarrotFLStudio._openMenu(editor, name, button); });
                menus.appendChild(button);
            }
            top.appendChild(HTML.div({ class: "cfl-col" }, menus, hint));
            // PAT / SONG
            const pat = HTML.button({ type: "button", title: "Pattern mode: loop the selected bar (L)" }, "PAT");
            const song = HTML.button({ type: "button", title: "Song mode: play the whole song (L)" }, "SONG");
            pat.addEventListener("click", () => CarrotFLStudio.setPatternMode(true));
            song.addEventListener("click", () => CarrotFLStudio.setPatternMode(false));
            CarrotFLStudio._modeButtons = [pat, song];
            top.appendChild(HTML.div({ class: "cfl-group" }, HTML.div({ class: "cfl-mode" }, pat, song)));
            // transport
            const play = HTML.button({ type: "button", title: "Play / pause (Space)" });
            play.innerHTML = CFL_ICON.play;
            const stop = HTML.button({ type: "button", title: "Stop and return to the start" });
            stop.innerHTML = CFL_ICON.stop;
            const record = HTML.button({ type: "button", title: "Record notes you play (Ctrl+Space)" });
            record.innerHTML = CFL_ICON.record;
            play.addEventListener("click", () => editor._togglePlay());
            stop.addEventListener("click", () => {
                doc.performance.pause();
                doc.synth.goToBar(CarrotFLStudio._patternMode ? doc.bar : doc.song.loopStart);
                doc.synth.snapToBar();
                doc.notifier.changed();
            });
            record.addEventListener("click", () => editor._toggleRecord());
            CarrotFLStudio._transport = { play, record };
            top.appendChild(HTML.div({ class: "cfl-group cfl-transport" }, play, stop, record));
            // tempo LCD (drag to change, double-click to type)
            const tempoValue = HTML.div({ class: "cfl-big" }, "120.000");
            const tempo = HTML.div({ class: "cfl-lcd", title: "Tempo - drag up or down to change it, double-click to type" }, tempoValue, HTML.div({ class: "cfl-small" }, "TEMPO"));
            let drag = null;
            tempo.addEventListener("pointerdown", (event) => {
                drag = { y: event.clientY, start: doc.song.tempo, old: doc.song.tempo };
                tempo.setPointerCapture(event.pointerId);
            });
            tempo.addEventListener("pointermove", (event) => {
                if (!drag)
                    return;
                const value = Math.max(Config.tempoMin, Math.min(Config.tempoMax, Math.round(drag.start + (drag.y - event.clientY) * (event.shiftKey ? 0.1 : 0.5))));
                if (value != doc.song.tempo) {
                    doc.song.tempo = value;
                    doc.notifier.changed();
                }
            });
            const endDrag = () => {
                if (!drag)
                    return;
                const value = doc.song.tempo;
                if (value != drag.old) {
                    doc.song.tempo = drag.old;
                    doc.record(new ChangeTempo(doc, drag.old, value));
                }
                drag = null;
            };
            tempo.addEventListener("pointerup", endDrag);
            tempo.addEventListener("pointercancel", endDrag);
            tempo.addEventListener("dblclick", () => {
                CarrotUI.ask({ title: "Tempo", label: "Beats per minute (" + Config.tempoMin + "-" + Config.tempoMax + ")", value: String(doc.song.tempo), okLabel: "Set", maxLength: 6 }).then((text) => {
                    const value = Math.round(parseFloat(String(text || "").replace(",", ".")));
                    if (Number.isFinite(value))
                        doc.record(new ChangeTempo(doc, doc.song.tempo, Math.max(Config.tempoMin, Math.min(Config.tempoMax, value))));
                });
            });
            // song position LCD
            const posValue = HTML.div({ class: "cfl-big" }, "1:01:00");
            const pos = HTML.div({ class: "cfl-lcd cfl-pos", title: "Song position (bar : beat : step)" }, posValue, HTML.div({ class: "cfl-small" }, "BAR : BEAT : STEP"));
            CarrotFLStudio._lcd = { tempoValue, posValue };
            top.appendChild(HTML.div({ class: "cfl-group" }, tempo, pos));
            // snap + pattern picker
            const snap = HTML.select({ title: "Snap: the rhythm grid notes are placed on" });
            const rhythms = Config.rhythms.map((rhythm, index) => ({ rhythm, index }));
            for (const entry of rhythms)
                snap.appendChild(HTML.option({ value: String(entry.index) }, "Snap " + entry.rhythm.name));
            snap.addEventListener("keydown", (e) => e.stopPropagation());
            snap.addEventListener("change", () => doc.record(new ChangeRhythm(doc, +snap.value)));
            CarrotFLStudio._snap = snap;
            const patternName = HTML.div({ class: "cfl-pname", title: "The pattern in the selected bar of the current channel" }, "Pattern 1");
            const prevPattern = HTML.button({ type: "button", title: "Previous pattern number" }, "<");
            const nextPattern = HTML.button({ type: "button", title: "Next pattern number" }, ">");
            const stepPattern = (delta) => {
                const song = doc.song;
                const current = song.channels[doc.channel].bars[doc.bar];
                const value = Math.max(0, Math.min(song.patternsPerChannel, current + delta));
                if (value != current)
                    doc.record(new ChangePatternNumbers(doc, value, doc.bar, doc.channel, 1, 1));
            };
            prevPattern.addEventListener("click", () => stepPattern(-1));
            nextPattern.addEventListener("click", () => stepPattern(1));
            CarrotFLStudio._patternName = patternName;
            top.appendChild(HTML.div({ class: "cfl-group" }, HTML.div({ class: "cfl-col", style: "justify-content: center; gap: 3px;" }, snap, HTML.div({ class: "cfl-pattern" }, prevPattern, patternName, nextPattern))));
            // master volume + CPU
            const volume = CarrotUI.knob({ label: "", min: 0, max: 75, step: 1, def: 50, value: +editor._volumeSlider.input.value, small: true, title: "Master volume", format: v => Math.round(v / 75 * 100) + "%", onInput: (v) => {
                    editor._volumeSlider.input.value = String(Math.round(v));
                    doc.setVolume(Math.round(v));
                } });
            CarrotFLStudio._volume = volume;
            const cpuBar = HTML.div();
            const peakBar = HTML.div();
            CarrotFLStudio._meters = { cpuBar, peakBar };
            top.appendChild(HTML.div({ class: "cfl-group" }, volume, HTML.div({ class: "cfl-cpu" }, HTML.span("CPU"), HTML.div({ class: "cfl-meter" }, cpuBar), HTML.span("OUT"), HTML.div({ class: "cfl-meter" }, peakBar))));
            // window buttons
            const win = (icon, title, run) => {
                const button = HTML.button({ type: "button", title });
                button.innerHTML = CFL_ICON[icon];
                button.addEventListener("click", run);
                return button;
            };
            const windowButtons = {
                playlist: win("playlist", "Playlist (F5)", () => CarrotFLStudio.showView("playlist")),
                pianoroll: win("pianoroll", "Piano roll (F7)", () => CarrotFLStudio.showView("grid")),
                rack: win("rack", "Channel rack (F6)", () => CarrotFLChannelRack.toggle(editor)),
                mixer: win("mixer", "Mixer (F9)", () => CarrotFLMixer.toggle(editor)),
                browser: win("browser", "Browser (F8)", () => editor.flShowBrowser(!doc.prefs.flBrowserOpen)),
                plugin: win("plugin", "Plugin picker (Tab)", () => CarrotLauncher.toggle(editor)),
            };
            CarrotFLStudio._windowButtons = windowButtons;
            top.appendChild(HTML.div({ class: "cfl-group cfl-windows", style: "margin-left: auto;" }, ...Object.values(windowButtons)));
            document.body.insertBefore(top, document.body.firstChild);
            // the page starts below the bar, however many rows it wraps onto
            const fit = () => {
                if (!top.isConnected)
                    return;
                const h = Math.max(62, Math.ceil(top.getBoundingClientRect().height));
                document.documentElement.style.setProperty("--cfl-top-h", h + "px");
            };
            if (typeof ResizeObserver == "function")
                new ResizeObserver(fit).observe(top);
            window.addEventListener("resize", fit);
            setTimeout(fit, 0);
            // FL's hint bar: shows what the control under the mouse does
            document.addEventListener("mouseover", (event) => {
                if (!CarrotFLStudio.on)
                    return;
                const el = event.target && event.target.closest ? event.target.closest("[title]") : null;
                if (!el || !el.getAttribute("title"))
                    return;
                const text = el.getAttribute("title").split("\n")[0].split("  |  ")[0];
                CarrotFLStudio._hint.innerHTML = "";
                const parts = text.split(/ - | \(|: /);
                CarrotFLStudio._hint.append(HTML.b(parts[0]), text.length > parts[0].length ? text.slice(parts[0].length) : "");
            });
            // live parts: position, CPU, meters
            CarrotFLStudio._installMeters(editor);
            const loop = () => {
                if (CarrotFLStudio.on)
                    CarrotFLStudio._frame(editor);
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
            doc.notifier.watch(() => CarrotFLStudio._sync(editor));
            CarrotFLStudio._sync(editor);
        }
        static _installMeters(editor) {
            const synth = editor.doc.synth;
            if (synth._cflWrapped)
                return;
            synth._cflWrapped = true;
            const original = synth.synthesize.bind(synth);
            const stats = CarrotFLStudio._stats = { cpu: 0, peak: 0 };
            synth.synthesize = function (left, right, length, playSong) {
                const t0 = performance.now();
                const result = original(left, right, length, playSong);
                const ms = performance.now() - t0;
                const budget = length / (synth.samplesPerSecond || 44100) * 1000;
                stats.cpu = stats.cpu * 0.85 + Math.min(1, ms / Math.max(0.001, budget)) * 0.15;
                let peak = 0;
                for (let i = 0; i < length; i += 4)
                    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
                stats.peak = Math.max(peak, stats.peak * 0.9);
                return result;
            };
        }
        static _frame(editor) {
            const doc = editor.doc, synth = doc.synth;
            const lcd = CarrotFLStudio._lcd;
            if (!lcd)
                return;
            const ph = Math.max(0, synth.playhead || 0);
            const bar = Math.floor(ph);
            const beats = doc.song.beatsPerBar;
            const beatPos = (ph - bar) * beats;
            const beat = Math.floor(beatPos);
            const step = Math.floor((beatPos - beat) * 4);
            const text = (bar + 1) + ":" + String(beat + 1).padStart(2, "0") + ":" + String(step).padStart(2, "0");
            if (lcd.posValue.textContent != text)
                lcd.posValue.textContent = text;
            const stats = CarrotFLStudio._stats;
            if (stats) {
                CarrotFLStudio._meters.cpuBar.style.width = Math.round(stats.cpu * 100) + "%";
                CarrotFLStudio._meters.peakBar.style.width = Math.round(Math.min(1, stats.peak) * 100) + "%";
                if (!synth.playing)
                    stats.peak *= 0.9;
            }
            if (CarrotFLStudio._patternMode && synth.flPatternMode != doc.bar)
                synth.flPatternMode = doc.bar;
            const playing = synth.playing;
            CarrotFLStudio._transport.play.classList.toggle("cfl-playing", playing && !synth.isRecording);
            CarrotFLStudio._transport.record.classList.toggle("cfl-recording", !!synth.isRecording);
            CarrotFLChannelRack.frame(editor);
        }
        static _sync(editor) {
            if (!CarrotFLStudio._top || !CarrotFLStudio.on)
                return;
            const doc = editor.doc, song = doc.song;
            CarrotFLStudio._lcd.tempoValue.textContent = song.tempo.toFixed(3);
            CarrotFLStudio._snap.value = String(song.rhythm);
            const number = song.channels[doc.channel] ? song.channels[doc.channel].bars[doc.bar] : 0;
            const pattern = number > 0 ? song.channels[doc.channel].patterns[number - 1] : null;
            CarrotFLStudio._patternName.textContent = number > 0 ? (pattern && pattern.name ? pattern.name : "Pattern " + number) : "(empty)";
            const [pat, songButton] = CarrotFLStudio._modeButtons;
            pat.classList.toggle("cfl-on", !!CarrotFLStudio._patternMode);
            songButton.classList.toggle("cfl-on", !CarrotFLStudio._patternMode);
            const b = CarrotFLStudio._windowButtons;
            b.playlist.classList.toggle("cfl-on", doc.prefs.flView == "playlist");
            b.pianoroll.classList.toggle("cfl-on", doc.prefs.flView != "playlist");
            b.browser.classList.toggle("cfl-on", !!doc.prefs.flBrowserOpen);
            b.rack.classList.toggle("cfl-on", CarrotFLChannelRack.isOpen());
            b.mixer.classList.toggle("cfl-on", CarrotFLMixer.isOpen());
            CarrotFLStudio._volume.setValue(+editor._volumeSlider.input.value);
        }
        static setPatternMode(on) {
            const editor = CarrotFLStudio.editor;
            CarrotFLStudio._patternMode = !!on;
            editor.doc.synth.flPatternMode = on ? editor.doc.bar : null;
            CarrotFLStudio._sync(editor);
            flToast(on ? "Pattern mode: looping the selected bar" : "Song mode", 1000);
        }
        static showView(view) {
            const editor = CarrotFLStudio.editor;
            if (editor.doc.prefs.flView != view)
                flToggleView(editor);
            CarrotFLStudio._sync(editor);
        }
        // ---------------------------------------------------------- menus
        static _openMenu(editor, name, anchor) {
            CarrotFLStudio._closeMenu();
            const doc = editor.doc;
            const items = [];
            const fromSelect = (select) => {
                for (const option of Array.from(select.options)) {
                    if (option.disabled || option.hidden || !option.value)
                        continue;
                    items.push([option.textContent, () => {
                            select.value = option.value;
                            select.dispatchEvent(new Event("change"));
                        }]);
                }
            };
            switch (name) {
                case "FILE":
                    fromSelect(editor._fileMenu);
                    break;
                case "EDIT":
                    fromSelect(editor._editMenu);
                    break;
                case "OPTIONS":
                    items.push(["CarrotBox settings...", () => CarrotSettingsPanel.open(editor), "F10"]);
                    items.push(["SP-404MKII / MIDI devices...", () => CarrotHardwarePanel.open(editor)]);
                    items.push(["Turn off FL Studio mode", () => CarrotSettings.set("flStudioUI", false)]);
                    items.push(null);
                    fromSelect(editor._optionsMenu);
                    break;
                case "ADD":
                    items.push(["Plugin picker...", () => CarrotLauncher.toggle(editor), "Tab"]);
                    for (const info of CARROT_PLUGIN_CATALOG.filter(i => CarrotPlugins.isInstalled(i.id))) {
                        items.push([info.name + (info.kind == "tool" ? " (tool)" : info.kind == "effect" ? " (effect)" : ""), () => {
                                const plugin = CarrotPlugins.get(info.id);
                                if (!plugin) {
                                    flToast(info.name + " is still loading.");
                                    return;
                                }
                                if (info.kind == "instrument")
                                    carrotLoadInstrumentPlugin(editor, info.id);
                                else if (info.kind == "tool")
                                    carrotOpenTool(editor, info.id);
                                else
                                    carrotAddInsert(editor, info.id, false);
                            }]);
                    }
                    items.push(null);
                    items.push(["New channel", () => {
                            const added = carrotNewChannel(doc, false);
                            if (added)
                                doc.record(added.group);
                            else
                                flToast("No room for another channel.");
                        }]);
                    items.push(["New drum channel", () => {
                            const added = carrotNewChannel(doc, true);
                            if (added)
                                doc.record(added.group);
                            else
                                flToast("No room for another drum channel.");
                        }]);
                    break;
                case "PATTERNS":
                    items.push(["Next free pattern in this bar", () => {
                            const song = doc.song;
                            const channel = song.channels[doc.channel];
                            for (let p = 1; p <= song.patternsPerChannel; p++)
                                if (channel.bars.indexOf(p) == -1 && channel.patterns[p - 1].notes.length == 0) {
                                    doc.record(new ChangePatternNumbers(doc, p, doc.bar, doc.channel, 1, 1));
                                    return;
                                }
                            flToast("No free pattern; add notes to make one.");
                        }]);
                    items.push(["Rename pattern...", () => {
                            const number = doc.song.channels[doc.channel].bars[doc.bar];
                            if (!number) {
                                flToast("This bar has no pattern.");
                                return;
                            }
                            const pattern = doc.song.channels[doc.channel].patterns[number - 1];
                            CarrotUI.ask({ title: "Pattern name", value: pattern.name || "Pattern " + number, okLabel: "Rename", maxLength: 40 }).then((value) => {
                                if (value != null)
                                    doc.record(new ChangeFL(doc, () => { pattern.name = value.trim().slice(0, 40); }, false));
                            });
                        }]);
                    items.push(["Copy bar to next bar", () => flCopyBarToNext(doc), "Ctrl+D"]);
                    items.push(["Clear pattern", () => flClearPattern(doc), "Shift+Del"]);
                    items.push(["Humanize", () => flHumanize(doc), "Shift+H"]);
                    items.push(["Bouncify...", () => carrotOpenTool(editor, "bouncify")]);
                    items.push(null);
                    items.push(["Pattern mode (loop the bar)", () => CarrotFLStudio.setPatternMode(true), "L"]);
                    items.push(["Song mode", () => CarrotFLStudio.setPatternMode(false), "L"]);
                    break;
                case "VIEW":
                    items.push(["Playlist", () => CarrotFLStudio.showView("playlist"), "F5"]);
                    items.push(["Channel rack", () => CarrotFLChannelRack.toggle(editor), "F6"]);
                    items.push(["Piano roll", () => CarrotFLStudio.showView("grid"), "F7"]);
                    items.push(["Browser", () => editor.flShowBrowser(!doc.prefs.flBrowserOpen), "F8"]);
                    items.push(["Mixer", () => CarrotFLMixer.toggle(editor), "F9"]);
                    items.push(["Master effects", () => carrotOpen(editor, "flMaster")]);
                    items.push(null);
                    items.push(["Close all windows", () => CarrotWindows.closeAll(), "Esc"]);
                    break;
                case "TOOLS":
                    items.push(["Live Loops", () => carrotOpenTool(editor, "liveloops")]);
                    items.push(["Bouncify", () => carrotOpenTool(editor, "bouncify")]);
                    items.push(["Sketchpad", () => carrotOpenTool(editor, "sketchpad")]);
                    items.push(["Melody / rhythm generator", () => carrotOpen(editor, "flLeadGen"), "G"]);
                    items.push(["Drum kit generator / loader", () => carrotOpen(editor, "flKits"), "K"]);
                    items.push(["Audio recorder", () => carrotOpen(editor, "flRecorder")]);
                    items.push(["SP-404MKII / MIDI devices", () => CarrotHardwarePanel.open(editor)]);
                    items.push(["Plugin manager", () => CarrotPluginManager.open(editor)]);
                    break;
                case "HELP":
                    items.push(["Keyboard shortcuts", () => CarrotShortcutsPanel.open(editor), "F1"]);
                    items.push(["About CarrotBox", () => flToast("CarrotBox: BeepBox (by John Nesky) with samples, plugins and an FL Studio style workspace.", 4000)]);
                    break;
            }
            const menu = HTML.div({ class: "cfl-dropdown" });
            for (const item of items) {
                if (item == null) {
                    menu.appendChild(HTML.div({ class: "cfl-sep" }));
                    continue;
                }
                const row = HTML.div(HTML.span(item[0]), item[2] ? HTML.small(item[2]) : "");
                row.addEventListener("click", (event) => {
                    event.stopPropagation();
                    CarrotFLStudio._closeMenu();
                    try {
                        item[1]();
                    }
                    catch (error) {
                        console.error(error);
                        flToast("That didn't work: " + (error.message || error));
                    }
                });
                menu.appendChild(row);
            }
            const rect = anchor.getBoundingClientRect();
            menu.style.left = Math.round(rect.left) + "px";
            menu.style.top = Math.round(rect.bottom + 2) + "px";
            document.body.appendChild(menu);
            anchor.classList.add("cfl-open");
            CarrotFLStudio._menu = { menu, anchor };
            setTimeout(() => {
                const close = (event) => {
                    if (!menu.contains(event.target)) {
                        CarrotFLStudio._closeMenu();
                        document.removeEventListener("pointerdown", close, true);
                    }
                };
                document.addEventListener("pointerdown", close, true);
            }, 0);
        }
        static _closeMenu() {
            const m = CarrotFLStudio._menu;
            if (!m)
                return;
            m.menu.remove();
            m.anchor.classList.remove("cfl-open");
            CarrotFLStudio._menu = null;
        }
        // F5-F10, F1 and L. Returns true when the key was handled.
        static handleKey(editor, event) {
            if (!CarrotFLStudio.on || event.ctrlKey || event.metaKey || event.altKey)
                return false;
            switch (event.key) {
                case "F5":
                    CarrotFLStudio.showView("playlist");
                    break;
                case "F6":
                    CarrotFLChannelRack.toggle(editor);
                    break;
                case "F7":
                    CarrotFLStudio.showView("grid");
                    break;
                case "F9":
                    CarrotFLMixer.toggle(editor);
                    break;
                case "F10":
                    CarrotSettingsPanel.open(editor);
                    break;
                case "F1":
                    CarrotShortcutsPanel.open(editor);
                    break;
                case "l":
                case "L":
                    if (event.shiftKey)
                        return false;
                    CarrotFLStudio.setPatternMode(!CarrotFLStudio._patternMode);
                    break;
                default:
                    return false;
            }
            event.preventDefault();
            return true;
        }
    }
    CarrotFLStudio.editor = null;
    CarrotFLStudio._top = null;
    CarrotFLStudio._patternMode = false;
    // ------------------------------------------------------------ channel rack
    class CarrotFLChannelRack extends CarrotFloatingWindow {
        static isOpen() {
            return !!(CarrotFLChannelRack._current && CarrotFLChannelRack._current.container.isConnected);
        }
        static toggle(editor) {
            if (CarrotFLChannelRack.isOpen()) {
                CarrotFLChannelRack._current.close();
                return;
            }
            CarrotFLChannelRack._current = CarrotWindows.openPanel("flChannelRack", () => new CarrotFLChannelRack(editor));
            CarrotFLStudio._sync(editor);
        }
        static frame(editor) {
            const rack = CarrotFLChannelRack._current;
            if (!rack || !rack.container.isConnected)
                return;
            const synth = editor.doc.synth;
            const song = editor.doc.song;
            const step = synth.playing && Math.floor(synth.playhead) == editor.doc.bar ? Math.floor((synth.playhead % 1) * song.beatsPerBar * 4) : -1;
            if (step != rack._playingStep) {
                rack._playingStep = step;
                for (const row of rack._rows)
                    row.steps.forEach((el, i) => el.classList.toggle("cfl-playing", i == step));
            }
        }
        constructor(editor) {
            const steps = Math.min(32, editor.doc.song.beatsPerBar * 4);
            super(editor, { key: "flChannelRack", title: "Channel rack", color: "#f39d38", width: Math.min(window.innerWidth - 24, 336 + steps * (steps > 16 ? 15 : 19)) });
            this._rows = [];
            this._playingStep = -1;
            this._pitchFor = new Map();
            this._list = HTML.div({ class: "cfl-rack" });
            const addButton = CarrotUI.button("+ Channel", () => {
                const added = carrotNewChannel(this.doc, false);
                if (added)
                    this.doc.record(added.group);
                else
                    flToast("No room for another channel.");
            }, { title: "Add a pitched channel" });
            const addDrums = CarrotUI.button("+ Drum channel", () => {
                const added = carrotNewChannel(this.doc, true);
                if (added)
                    this.doc.record(added.group);
                else
                    flToast("No room for another drum channel.");
            });
            this._barLabel = HTML.span({ class: "cb-hint" });
            this.setBody(HTML.div(HTML.div({ class: "cb-row", style: "margin-bottom: 6px;" }, addButton, addDrums, this._barLabel), this._list,
                CarrotUI.hint("Steps edit the selected bar's pattern of each channel (16ths). The LED mutes, the knobs set volume and pan, the name selects the channel (double-click opens its instrument). Drum channels: pick which drum row the steps play.")));
            this.watchSong(() => this._render());
            this._render();
            this.mount();
        }
        close() {
            super.close();
            CarrotFLChannelRack._current = null;
            setTimeout(() => CarrotFLStudio._sync(this.editor), 0);
        }
        _render() {
            const doc = this.doc, song = doc.song;
            const steps = Math.min(32, song.beatsPerBar * 4);
            const stepParts = Config.partsPerBeat / 4;
            this._barLabel.textContent = "Bar " + (doc.bar + 1) + " · " + steps + " steps";
            this._list.innerHTML = "";
            this._rows = [];
            for (let c = 0; c < song.getChannelCount(); c++) {
                const channel = song.channels[c];
                const isNoise = song.getChannelIsNoise(c);
                const instrument = channel.instruments[doc.viewedInstrument[c] || 0] || channel.instruments[0];
                const color = ColorConfig.getChannelColor(song, c).primaryNote;
                const led = HTML.div({ class: "cfl-led" + (channel.muted ? " cfl-off" : ""), title: "Mute / unmute " + cflChannelName(song, c) });
                led.addEventListener("click", () => {
                    channel.muted = !channel.muted;
                    doc.notifier.changed();
                });
                const pan = CarrotUI.knob({ label: "", min: 0, max: Config.panMax, step: 1, def: Config.panCenter, value: instrument.pan, small: true, title: "Pan", format: v => v == Config.panCenter ? "C" : (v < Config.panCenter ? "L" : "R") + Math.abs(Math.round((v - Config.panCenter) / Config.panCenter * 100)), onChange: (v) => {
                        doc.record(new ChangeFL(doc, () => { instrument.pan = Math.round(v); }, false));
                    } });
                const vol = CarrotUI.knob({ label: "", min: 0, max: Config.volumeRange - 1, step: 1, def: Config.volumeRange - 1, value: Config.volumeRange - 1 - instrument.volume, small: true, title: "Volume", format: v => Math.round(v / (Config.volumeRange - 1) * 100) + "%", onChange: (v) => {
                        doc.record(new ChangeFL(doc, () => { instrument.volume = Config.volumeRange - 1 - Math.round(v); }, false));
                    } });
                pan.classList.add("cfl-mini");
                vol.classList.add("cfl-mini");
                const name = HTML.button({ type: "button", class: "cfl-rack-name" + (c == doc.channel ? " cfl-current" : ""), title: cflChannelName(song, c) + " - click selects, double-click opens the instrument", style: "--cfl-chan: " + color + ";" }, cflChannelName(song, c));
                name.addEventListener("click", () => doc.record(new ChangeChannelBar(doc, c, doc.bar), true));
                name.addEventListener("dblclick", () => {
                    doc.record(new ChangeChannelBar(doc, c, doc.bar), true);
                    setTimeout(() => carrotOpenCurrentInstrumentPlugin(this.editor), 0);
                });
                // which pitch the steps play
                const pattern = song.getPattern(c, doc.bar);
                let pitch = this._pitchFor.get(c);
                if (pitch == undefined) {
                    const counts = new Map();
                    if (pattern)
                        for (const n of pattern.notes)
                            counts.set(n.pitches[0], (counts.get(n.pitches[0]) || 0) + 1);
                    pitch = counts.size ? Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0] : (isNoise ? 0 : Math.min(Config.maxPitch, channel.octave * 12 + 12));
                }
                const pitchSelect = HTML.select({ class: "cfl-rack-pitch", title: isNoise ? "Drum row the steps play" : "Note the steps play" });
                const maxPitch = isNoise ? Config.drumCount - 1 : Config.maxPitch;
                for (let p = 0; p <= maxPitch; p++)
                    pitchSelect.appendChild(HTML.option({ value: String(p) }, isNoise ? "Row " + (p + 1) : flMidiName(Config.keys[song.key].basePitch + p)));
                pitchSelect.value = String(pitch);
                pitchSelect.addEventListener("keydown", (e) => e.stopPropagation());
                pitchSelect.addEventListener("change", () => { this._pitchFor.set(c, +pitchSelect.value); this._render(); });
                const stepEls = [];
                const stepsBox = HTML.div({ class: "cfl-steps" + (steps > 16 ? " cfl-many" : "") });
                for (let s = 0; s < steps; s++) {
                    const on = !!(pattern && pattern.notes.some(n => n.start == s * stepParts && n.pitches.includes(pitch)));
                    const el = HTML.div({ class: "cfl-step" + (Math.floor(s / 4) % 2 == 1 ? " cfl-alt" : "") + (on ? " cfl-on" : ""), title: "Step " + (s + 1) });
                    el.addEventListener("mousedown", (event) => {
                        if (event.button != 0)
                            return;
                        this._toggleStep(c, s, pitch, stepParts);
                    });
                    stepEls.push(el);
                    stepsBox.appendChild(el);
                }
                this._rows.push({ steps: stepEls });
                this._list.appendChild(HTML.div({ class: "cfl-rack-row" }, led, pan, vol, name, pitchSelect, stepsBox));
            }
            this._playingStep = -1;
        }
        _toggleStep(channelIndex, step, pitch, stepParts) {
            const doc = this.doc, song = doc.song;
            const isNoise = song.getChannelIsNoise(channelIndex);
            const start = step * stepParts;
            const group = new ChangeGroup();
            group.append(new ChangeEnsurePatternExists(doc, channelIndex, doc.bar));
            const pattern = song.getPattern(channelIndex, doc.bar);
            if (!pattern)
                return;
            group.append(new ChangeFL(doc, () => {
                const index = pattern.notes.findIndex(n => n.start == start && n.pitches.includes(pitch));
                if (index != -1) {
                    const note = pattern.notes[index];
                    if (note.pitches.length > 1)
                        note.pitches = note.pitches.filter(p => p != pitch);
                    else
                        pattern.notes.splice(index, 1);
                }
                else {
                    // make room: shorten a note that runs over this step
                    for (const n of pattern.notes)
                        if (n.start < start && n.end > start && n.pitches.includes(pitch)) {
                            n.end = start;
                            n.pins[n.pins.length - 1].time = n.end - n.start;
                        }
                    const note = new Note(pitch, start, start + stepParts, Config.noteSizeMax, isNoise);
                    let at = pattern.notes.findIndex(n => n.start > start);
                    if (at == -1)
                        at = pattern.notes.length;
                    pattern.notes.splice(at, 0, note);
                }
            }, false));
            doc.record(group);
            if (!doc.synth.playing)
                doc.performance.setTemporaryPitches && doc.channel == channelIndex && doc.performance.setTemporaryPitches([pitch], stepParts);
        }
    }
    CarrotFLChannelRack._current = null;
    // ------------------------------------------------------------ mixer
    class CarrotFLMixer extends CarrotFloatingWindow {
        static isOpen() {
            return !!(CarrotFLMixer._current && CarrotFLMixer._current.container.isConnected);
        }
        static toggle(editor) {
            if (CarrotFLMixer.isOpen()) {
                CarrotFLMixer._current.close();
                return;
            }
            CarrotFLMixer._current = CarrotWindows.openPanel("flMixer", () => new CarrotFLMixer(editor));
            CarrotFLStudio._sync(editor);
        }
        constructor(editor) {
            super(editor, { key: "flMixer", title: "Mixer", color: "#9be36b", width: 760 });
            this._strips = HTML.div({ class: "cfl-mixer" });
            this.setBody(HTML.div(this._strips, CarrotUI.hint("Each strip is a channel (its current instrument): fader, pan, mute / solo and its effects. The Master strip holds the song's master effects and volume.")));
            this.watchSong(() => this._render());
            this._render();
            this.mount();
        }
        close() {
            super.close();
            CarrotFLMixer._current = null;
            setTimeout(() => CarrotFLStudio._sync(this.editor), 0);
        }
        _render() {
            const doc = this.doc, song = doc.song, editor = this.editor;
            this._strips.innerHTML = "";
            // master
            const masterFader = HTML.input({ type: "range", class: "cfl-fader", min: "0", max: "75", step: "1", value: editor._volumeSlider.input.value, title: "Master volume" });
            masterFader.addEventListener("input", () => {
                editor._volumeSlider.input.value = masterFader.value;
                doc.setVolume(+masterFader.value);
            });
            const masterFx = HTML.div({ class: "cfl-fx" });
            const fxNames = [[FLConfig.fxPEQ, "EQ"], [FLConfig.fxGross, "Gross Beat"], [FLConfig.fxSoundgoodizer, "Soundgoodizer"]];
            for (const [bit, label] of fxNames) {
                const button = HTML.button({ type: "button", class: (song.fl.masterFx & bit) ? "cfl-on" : "", title: label + " on the master" }, ((song.fl.masterFx & bit) ? "● " : "○ ") + label);
                button.addEventListener("click", () => doc.record(new ChangeFL(doc, () => { song.fl.masterFx ^= bit; }, false)));
                masterFx.appendChild(button);
            }
            const openMaster = HTML.button({ type: "button", title: "Open the master effects" }, "Edit...");
            openMaster.addEventListener("click", () => carrotOpen(editor, "flMaster"));
            masterFx.appendChild(openMaster);
            this._strips.appendChild(HTML.div({ class: "cfl-strip cfl-master" }, HTML.div({ class: "cfl-sname", style: "--cfl-chan: #f39d38;" }, "Master"), masterFader, masterFx));
            // channels
            for (let c = 0; c < song.getChannelCount(); c++) {
                const channel = song.channels[c];
                const instrument = channel.instruments[doc.viewedInstrument[c] || 0] || channel.instruments[0];
                const color = ColorConfig.getChannelColor(song, c).primaryNote;
                const name = HTML.div({ class: "cfl-sname", style: "--cfl-chan: " + color + ";", title: cflChannelName(song, c) + " - click to select" }, cflChannelName(song, c));
                name.addEventListener("click", () => doc.record(new ChangeChannelBar(doc, c, doc.bar), true));
                const fader = HTML.input({ type: "range", class: "cfl-fader", min: "0", max: String(Config.volumeRange - 1), step: "1", value: String(Config.volumeRange - 1 - instrument.volume), title: "Volume" });
                fader.addEventListener("change", () => doc.record(new ChangeFL(doc, () => { instrument.volume = Config.volumeRange - 1 - (+fader.value); }, false)));
                const pan = CarrotUI.knob({ label: "", min: 0, max: Config.panMax, step: 1, def: Config.panCenter, value: instrument.pan, small: true, title: "Pan", format: v => v == Config.panCenter ? "C" : (v < Config.panCenter ? "L" : "R") + Math.abs(Math.round((v - Config.panCenter) / Config.panCenter * 100)), onChange: (v) => {
                        doc.record(new ChangeFL(doc, () => { instrument.pan = Math.round(v); }, false));
                    } });
                const mute = HTML.button({ type: "button", class: channel.muted ? "cfl-on" : "", title: "Mute" }, "M");
                mute.addEventListener("click", () => { channel.muted = !channel.muted; doc.notifier.changed(); });
                const solo = HTML.button({ type: "button", title: "Solo (mutes every other channel)" }, "S");
                solo.addEventListener("click", () => {
                    const soloed = song.channels.every((other, i) => (i == c) != other.muted);
                    song.channels.forEach((other, i) => { other.muted = soloed ? false : i != c; });
                    doc.notifier.changed();
                });
                if (song.channels.every((other, i) => (i == c) != other.muted))
                    solo.classList.add("cfl-on");
                const fx = HTML.div({ class: "cfl-fx" });
                for (const [bit, label] of fxNames) {
                    const on = !!(instrument.fl.fx & bit);
                    const button = HTML.button({ type: "button", class: on ? "cfl-on" : "", title: label }, (on ? "● " : "○ ") + label);
                    button.addEventListener("click", () => doc.record(new ChangeFL(doc, () => { instrument.fl.fx ^= bit; instrument.preset = instrument.type; }, false)));
                    fx.appendChild(button);
                }
                for (const insert of instrument.fl.inserts) {
                    const info = CarrotPlugins.info(insert.id);
                    fx.appendChild(HTML.button({ type: "button", title: (info ? info.name : insert.id) + " (plugin effect)" }, "● " + (info ? info.name : insert.id)));
                }
                this._strips.appendChild(HTML.div({ class: "cfl-strip" + (c == doc.channel ? " cfl-current" : "") }, name, fader, pan, HTML.div({ class: "cfl-ms" }, mute, solo), fx));
            }
        }
    }
    CarrotFLMixer._current = null;
