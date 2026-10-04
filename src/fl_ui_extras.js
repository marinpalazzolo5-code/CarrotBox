    // ======================================================================
    // CarrotBox: settings, optional modern skin, UI sounds, keyboard
    // shortcuts, kit loader, idea generator, audio recorder and toolbar.
    // ======================================================================
    // ------------------------------------------------------------- settings
    const CARROT_SETTING_DEFAULTS = {
        confirmLeave: false,
        toasts: true,
        playingTitle: true,
        modernUI: false,
        flStudioUI: false,
        uiSounds: true,
        uiSoundVolume: 0.35,
        extraShortcuts: true,
        uiScale: 100,
        reduceMotion: false,
        openPluginOnLoad: true,
        welcomeSeen: false,
    };
    class CarrotSettings {
        static get(key) {
            if (CarrotSettings._cache.has(key))
                return CarrotSettings._cache.get(key);
            let value = CARROT_SETTING_DEFAULTS[key];
            try {
                const stored = window.localStorage.getItem("carrot:" + key);
                if (stored != null)
                    value = JSON.parse(stored);
            }
            catch (error) { }
            CarrotSettings._cache.set(key, value);
            return value;
        }
        static set(key, value) {
            CarrotSettings._cache.set(key, value);
            try {
                window.localStorage.setItem("carrot:" + key, JSON.stringify(value));
            }
            catch (error) { }
            carrotApplySettings();
        }
    }
    CarrotSettings._cache = new Map();
    function carrotApplySettings() {
        const root = document.documentElement;
        root.classList.toggle("carrot-modern", !!CarrotSettings.get("modernUI"));
        root.classList.toggle("carrot-reduce-motion", !!CarrotSettings.get("reduceMotion"));
        if (typeof CarrotFLStudio != "undefined" && CarrotFLStudio.editor)
            CarrotFLStudio.apply();
        const container = document.getElementById("beepboxEditorContainer");
        const scale = CarrotSettings.get("uiScale") / 100;
        if (container)
            container.style.zoom = scale == 1 ? "" : String(scale);
    }
    // ------------------------------------------------------------- UI sounds
    // Tiny synthesized clicks and chimes, on their own audio context so they
    // never touch the song's audio.
    function carrotUISound(kind) {
        if (!CarrotSettings.get("uiSounds"))
            return;
        const now = performance.now();
        if (now - (carrotUISound._last || 0) < 35)
            return;
        carrotUISound._last = now;
        try {
            let ctx = carrotUISound._ctx;
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC)
                    return;
                ctx = carrotUISound._ctx = new AC({ latencyHint: "interactive" });
            }
            if (ctx.state == "suspended")
                ctx.resume();
            const volume = CarrotSettings.get("uiSoundVolume") * 0.18;
            const t = ctx.currentTime + 0.005;
            const out = ctx.createGain();
            out.gain.value = volume;
            out.connect(ctx.destination);
            const tone = (freq, endFreq, start, length, type = "sine", gain = 1) => {
                const osc = ctx.createOscillator();
                const env = ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, t + start);
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + start + length);
                env.gain.setValueAtTime(0, t + start);
                env.gain.linearRampToValueAtTime(gain, t + start + 0.004);
                env.gain.exponentialRampToValueAtTime(0.0008, t + start + length);
                osc.connect(env);
                env.connect(out);
                osc.start(t + start);
                osc.stop(t + start + length + 0.02);
            };
            switch (kind) {
                case "click":
                    tone(1900, 1400, 0, 0.025, "sine", 0.6);
                    break;
                case "toggle":
                    tone(1100, 1650, 0, 0.04, "triangle", 0.6);
                    break;
                case "menu":
                    tone(1500, 1500, 0, 0.03, "sine", 0.5);
                    break;
                case "open":
                    tone(660, 990, 0, 0.09, "sine", 0.7);
                    break;
                case "close":
                    tone(880, 520, 0, 0.08, "sine", 0.6);
                    break;
                case "success":
                    tone(1046.5, 1046.5, 0, 0.12, "sine", 0.6);
                    tone(1568, 1568, 0.07, 0.2, "sine", 0.6);
                    break;
                case "error":
                    tone(220, 180, 0, 0.12, "square", 0.25);
                    break;
                case "generate":
                    tone(784, 784, 0, 0.08, "triangle", 0.5);
                    tone(988, 988, 0.06, 0.08, "triangle", 0.5);
                    tone(1319, 1319, 0.12, 0.16, "triangle", 0.5);
                    break;
                case "record":
                    tone(440, 440, 0, 0.15, "sine", 0.6);
                    break;
            }
        }
        catch (error) { }
    }
    function carrotInstallUISounds() {
        document.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (!target || !target.closest)
                return;
            if (!target.closest(".beepboxEditor, .cb-window, .cb-launcher"))
                return;
            const button = target.closest("button");
            if (button) {
                carrotUISound(button.classList.contains("cb-toggle") || button.classList.contains("fl-icon-button") ? "toggle" : "click");
                return;
            }
            if (target.closest(".cb-knob"))
                carrotUISound("click");
        }, true);
        document.addEventListener("change", (event) => {
            const target = event.target;
            if (target && target.tagName == "SELECT" && target.closest && target.closest(".beepboxEditor, .cb-window"))
                carrotUISound("menu");
        }, true);
    }
    // ----------------------------------------------------------------- styles
    document.head.appendChild(HTML.style({ type: "text/css" }, `
:root {
	--carrot-kit-symbol: ${flIcon('<ellipse cx="0" cy="-3" rx="8" ry="3" fill="none" stroke="gray" stroke-width="1.6"/><path d="M -8 -3 L -8 5 A 8 3 0 0 0 8 5 L 8 -3" fill="none" stroke="gray" stroke-width="1.6"/><path d="M -6 -11 L -1 -4 M 6 -11 L 1 -4" stroke="gray" stroke-width="1.6"/>')};
	--carrot-plugin-symbol: ${flIcon('<path d="M -8 -8 L -2 -8 A 2.5 2.5 0 1 1 3 -8 L 8 -8 L 8 -3 A 2.5 2.5 0 1 0 8 2 L 8 8 L -8 8 z" fill="gray"/>')};
	--carrot-mic-symbol: ${flIcon('<rect x="-3.5" y="-10" width="7" height="12" rx="3.5" fill="gray"/><path d="M -7 -1 A 7 7 0 0 0 7 -1" fill="none" stroke="gray" stroke-width="1.6"/><path d="M 0 6 L 0 10 M -4 10 L 4 10" stroke="gray" stroke-width="1.6"/>')};
	--carrot-spark-symbol: ${flIcon('<path d="M -2 -10 L 0 -3 L 7 -1 L 0 1 L -2 8 L -4 1 L -11 -1 L -4 -3 z" fill="gray"/><path d="M 7 -10 L 8 -7 L 11 -6 L 8 -5 L 7 -2 L 6 -5 L 3 -6 L 6 -7 z" fill="gray"/>')};
}
.beepboxEditor .fl-bar.carrot-bar-2 { margin-top: 0; }
.beepboxEditor .carrot-settings-button { font-size: 12px; }
.carrot-drop {
	border: 2px dashed ${ColorConfig.uiWidgetFocus};
	border-radius: 10px;
	padding: 18px 10px;
	text-align: center;
	color: ${ColorConfig.secondaryText};
	transition: background 0.15s;
}
.carrot-drop.fl-drop-hover { background: rgba(255,155,33,0.12); color: ${ColorConfig.primaryText}; }
.carrot-list { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow-y: auto; }
.carrot-list-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px; background: rgba(127,127,127,0.07); }
.carrot-list-row .carrot-grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.carrot-chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.carrot-chip { font-size: 10px; padding: 1px 7px; border-radius: 9px; background: ${ColorConfig.uiWidgetBackground}; color: ${ColorConfig.secondaryText}; }
.carrot-kbd { display: inline-block; min-width: 16px; padding: 0 5px; border-radius: 4px; background: ${ColorConfig.uiWidgetBackground}; text-align: center; font-size: 11px; margin-right: 2px; }
.carrot-shortcuts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 18px; font-size: 12px; }
.carrot-shortcuts div { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; border-bottom: 1px solid rgba(127,127,127,0.12); }
.carrot-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; border-bottom: 1px solid rgba(127,127,127,0.12); }
.carrot-settings-row .carrot-label { display: flex; flex-direction: column; }
.carrot-settings-row .carrot-label small { color: ${ColorConfig.secondaryText}; font-size: 11px; }
.carrot-meter { height: 8px; border-radius: 4px; background: ${ColorConfig.uiWidgetBackground}; overflow: hidden; }
.carrot-meter div { height: 100%; width: 0%; background: linear-gradient(90deg, #7bd88f 0%, #ffd866 70%, #ff6188 100%); transition: width 0.05s; }
.carrot-rec-time { font-family: monospace; font-size: 20px; letter-spacing: 0.05em; min-width: 92px; text-align: center; }
.carrot-rec-button.cb-recording { background: #e0344d !important; color: white !important; animation: carrot-pulse 1s infinite; }
@keyframes carrot-pulse { 50% { opacity: 0.65; } }
.carrot-seed { display: flex; flex-direction: column; gap: 2px; align-items: stretch; }
.carrot-gen .cb-section { margin-top: 8px; }
.carrot-gen .cb-row { gap: 8px 12px; align-items: flex-end; }
.carrot-gen-top { margin-bottom: 4px; }
.carrot-gen-chords { display: flex; flex-wrap: wrap; gap: 4px; min-height: 22px; margin: 10px 0 4px; }
.carrot-gen-chord { padding: 2px 8px; border-radius: 10px; font-size: 11px; background: rgba(199,146,234,0.16); border: 1px solid rgba(199,146,234,0.35); }
.carrot-gen-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.carrot-gen-status { flex: 1 1 220px; min-height: 16px; }
.carrot-gen-buttons { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.carrot-gen-buttons .cb-button:disabled { opacity: 0.4; }
.carrot-welcome p { margin: 4px 0; font-size: 12px; line-height: 1.4; }
/* --------------------------------------------------------------- modern skin */
html.carrot-modern, html.carrot-modern body { font-family: "Inter", "SF Pro Text", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
html.carrot-modern #beepboxEditorContainer { border-radius: 16px; margin-top: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.35); }
html.carrot-modern .beepboxEditor { font-size: 13px; letter-spacing: 0.01em; }
html.carrot-modern .beepboxEditor button, html.carrot-modern .beepboxEditor select {
	border-radius: 9px;
	box-shadow: inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 3px rgba(0,0,0,0.3);
	transition: filter 0.15s, transform 0.08s, box-shadow 0.15s, background 0.15s;
}
html.carrot-modern .beepboxEditor button:hover, html.carrot-modern .beepboxEditor select:hover { filter: brightness(1.15); }
html.carrot-modern .beepboxEditor button:active { transform: translateY(1px) scale(0.985); }
html.carrot-modern .beepboxEditor button:focus-visible, html.carrot-modern .beepboxEditor select:focus-visible { box-shadow: 0 0 0 2px var(--fl-accent, #ff9b21); }
html.carrot-modern .beepboxEditor .play-pause-area,
html.carrot-modern .beepboxEditor .menu-area,
html.carrot-modern .beepboxEditor .song-settings-area,
html.carrot-modern .beepboxEditor .instrument-settings-area {
	background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015));
	border: 1px solid rgba(127,127,127,0.16);
	border-radius: 14px;
	padding: 8px !important;
	margin-bottom: 8px;
	box-shadow: 0 4px 16px rgba(0,0,0,0.18);
}
html.carrot-modern .beepboxEditor .settings-area { padding-left: 4px; }
html.carrot-modern .beepboxEditor .pattern-area, html.carrot-modern .beepboxEditor .track-area { border-radius: 14px; }
html.carrot-modern .beepboxEditor .trackContainer, html.carrot-modern .beepboxEditor .fl-playlist, html.carrot-modern .beepboxEditor .fl-browser { border-radius: 12px; }
html.carrot-modern .beepboxEditor .tip { text-decoration: none; opacity: 0.9; }
html.carrot-modern .beepboxEditor .prompt { border-radius: 20px; border-width: 1px; box-shadow: 0 24px 80px rgba(0,0,0,0.6); }
html.carrot-modern .beepboxEditor .promptContainer { backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
html.carrot-modern .beepboxEditor input[type=range]::-webkit-slider-thumb { border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
html.carrot-modern .beepboxEditor input[type=range]::-moz-range-thumb { border-radius: 50%; }
html.carrot-modern .beepboxEditor ::-webkit-scrollbar { width: 9px; height: 9px; }
html.carrot-modern .beepboxEditor ::-webkit-scrollbar-thumb { background: rgba(127,127,127,0.35); border-radius: 6px; }
html.carrot-modern .beepboxEditor ::-webkit-scrollbar-track { background: transparent; }
html.carrot-modern .beepboxEditor .version-area { text-align: center; }
html.carrot-modern .beepboxEditor .version-area div, html.carrot-modern .beepboxEditor .version-area span {
	font-weight: 800; letter-spacing: 0.04em;
	background: linear-gradient(90deg, #ff9b21, #ffcf5c 55%, #7bd88f);
	-webkit-background-clip: text; background-clip: text; color: transparent;
}
html.carrot-modern .beepboxEditor .fl-icon-button { border-radius: 10px; }
html.carrot-modern .cb-window { border-radius: 14px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 18px 60px rgba(0,0,0,0.6); }
html.carrot-modern .cb-launcher { border-radius: 16px; }
html.carrot-modern .fl-toast { border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
html.carrot-modern .cb-knob .cb-arc { filter: drop-shadow(0 0 3px var(--cb-plugin-color, #ff9b21)); }
html.carrot-reduce-motion *, html.carrot-reduce-motion *::before { transition: none !important; animation: none !important; }
`));
    // --------------------------------------------------------- local "host"
    // The plugin UI kit works on a plain object here (recorder settings).
    class CarrotLocalHost extends CarrotPluginHost {
        constructor(editor, params, onChange) {
            super(editor, { type: "tool" }, { id: "local", defaultParams: () => ({}) });
            this._params = params;
            this._onChange = onChange;
        }
        params() {
            return this._params;
        }
        isValid() {
            return true;
        }
        changed(commit = true) {
            if (this._onChange)
                this._onChange();
        }
        commitNow() { }
        replaceParams(params) {
            this._params = params;
            this.changed();
            this.refresh();
        }
    }
    // ------------------------------------------------------------- settings UI
    class CarrotSettingsPanel extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("settings", () => new CarrotSettingsPanel(editor));
        }
        constructor(editor) {
            super(editor, { key: "settings", title: "CarrotBox Settings", color: "#ff9b21", width: 540, modal: true });
            const doc = editor.doc;
            const row = (label, help, control) => HTML.div({ class: "carrot-settings-row" }, HTML.div({ class: "carrot-label" }, HTML.span(label), help ? HTML.small(help) : ""), control);
            const toggle = (key, onChange) => CarrotUI.toggle({ label: CarrotSettings.get(key) ? "On" : "Off", value: CarrotSettings.get(key), onChange: (v) => {
                    CarrotSettings.set(key, v);
                    if (onChange)
                        onChange(v);
                    this._refreshLabels();
                } });
            this._toggles = [];
            const t = (key, onChange) => {
                const el = toggle(key, onChange);
                el.dataset.key = key;
                this._toggles.push(el);
                return el;
            };
            const scale = CarrotUI.select({ options: ["80%", "90%", "100%", "110%", "125%", "150%"], value: [80, 90, 100, 110, 125, 150].indexOf(CarrotSettings.get("uiScale")), onChange: (i) => {
                    CarrotSettings.set("uiScale", [80, 90, 100, 110, 125, 150][i]);
                    setTimeout(() => editor.whenUpdated());
                } });
            const volume = CarrotUI.knob({ label: "Volume", min: 0, max: 1, def: 0.35, value: CarrotSettings.get("uiSoundVolume"), small: true, format: CARROT_PERCENT, onChange: (v) => {
                    CarrotSettings.set("uiSoundVolume", v);
                    carrotUISound("success");
                } });
            const metronome = CarrotUI.knob({ label: "Metronome", min: 0, max: 1.5, def: 0.7, value: doc.prefs.metronomeVolume, small: true, format: CARROT_PERCENT, onChange: (v) => {
                    doc.prefs.metronomeVolume = v;
                    doc.prefs.save();
                    doc.synth.metronomeVolume = v;
                } });
            const section = (title, ...rows) => CarrotUI.section(title, ...rows);
            this.setBody(HTML.div(section("Appearance", row("FL Studio interface", "A full-window FL Studio style workspace: menu strip and hint bar, PAT / SONG, transport, LCD tempo, channel rack (F6), mixer (F9), FL colors and F-keys.", t("flStudioUI")), row("Modern UI", "An optional polished skin: rounded panels, softer shadows, smoother controls. Off = classic BeepBox look.", t("modernUI")), row("Interface size", "Zooms the whole editor.", scale), row("Color theme", "18 themes, including FL Studio style ones.", CarrotUI.button("Choose…", () => {
                this.close();
                editor._openPrompt("flTheme");
            })), row("Layout", "BeepBox's layouts (wide, tall, focus…).", CarrotUI.button("Choose…", () => {
                this.close();
                editor._openPrompt("layout");
            })), row("Reduce motion", "Turns off animations.", t("reduceMotion"))), section("Sound", row("UI sounds", "Soft clicks when you press buttons, open windows and generate ideas.", HTML.div({ style: "display: flex; align-items: center; gap: 6px;" }, volume, t("uiSounds"))), row("Metronome volume", "Toggle the metronome with its toolbar button or T.", metronome)), section("Workflow", row("Extra keyboard shortcuts", "K kits, G generator, E edit plugin, B browser, T metronome, , settings, ? help (Tab, F5, F8, F9 always work).", t("extraShortcuts")), row("Open plugin window when loading a plugin", "Turn off to load plugins without opening their window.", t("openPluginOnLoad")), row("Show messages", "The little notices at the bottom of the editor.", t("toasts")), row("Warn before leaving", "Ask for confirmation when you close or reload the page with edits that weren't saved or exported.", t("confirmLeave")), row("Show play state in the page title", "The browser tab says Playing while the song plays.", t("playingTitle")), row("Keyboard shortcuts", "", CarrotUI.button("Show list…", () => {
                this.close();
                CarrotShortcutsPanel.open(editor);
            })), row("Hardware", "Roland SP-404MKII and other USB MIDI devices: pads, tempo sync, sequencing, audio and samples.", CarrotUI.button("SP-404MKII / MIDI…", () => {
                this.close();
                CarrotHardwarePanel.open(editor);
            })), row("Plugins", "Install or remove plugins to keep CarrotBox light.", CarrotUI.button("Plugin Manager…", () => {
                this.close();
                CarrotPluginManager.open(editor);
            }))), section("Storage", row("Imported samples & kits", "Kept in this browser (IndexedDB). Songs that use them need the .json project file to move to another computer.", HTML.div({ style: "display: flex; align-items: center; gap: 8px;" }, this._storage = HTML.span({ class: "cb-hint" }, "..."), CarrotUI.button("Clear...", async () => {
                if (!window.confirm("Remove every imported sample and sound kit from this browser? Built-in sounds are not affected."))
                    return;
                await FLSampleBank.clearStored();
                await FLKitLibrary.clearAll();
                if (editor._flBrowser) {
                    editor._flBrowser._dirty = true;
                    editor._flBrowser._storedSamples = [];
                    editor._flBrowser.render();
                }
                this._updateStorage();
                flToast("Cleared imported samples and kits");
            }))), row("Reset these settings", "Puts every option in this panel back to its default.", CarrotUI.button("Reset", () => {
                for (const key of Object.keys(CARROT_SETTING_DEFAULTS))
                    if (key != "welcomeSeen") {
                        try {
                            window.localStorage.removeItem("carrot:" + key);
                        }
                        catch (error) { }
                    }
                CarrotSettings._cache.clear();
                carrotApplySettings();
                this.close();
                CarrotSettingsPanel.open(editor);
                flToast("Settings reset");
            })), row("BeepBox preferences", "Ghost notes, piano keys, auto-play and more are in the Preferences menu.", HTML.span(""))), HTML.div({ style: "display: flex; justify-content: flex-end; margin-top: 8px;" }, CarrotUI.button("Done", () => this.close(), { primary: true }))));
            this._refreshLabels();
            this._updateStorage();
            this.mount();
        }
        _updateStorage() {
            if (navigator.storage && navigator.storage.estimate) {
                navigator.storage.estimate().then((estimate) => {
                    this._storage.textContent = (estimate.usage / 1048576).toFixed(1) + " MB used";
                }).catch(() => { this._storage.textContent = ""; });
            }
            else
                this._storage.textContent = "";
        }
        _refreshLabels() {
            for (const el of this._toggles)
                el.textContent = CarrotSettings.get(el.dataset.key) ? "On" : "Off";
        }
    }
    // ----------------------------------------------------------- shortcuts
    class CarrotShortcutsPanel extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("shortcuts", () => new CarrotShortcutsPanel(editor));
        }
        constructor(editor) {
            super(editor, { key: "shortcuts", title: "Keyboard Shortcuts", color: "#4fc3f7", width: 640, modal: true });
            const k = (...keys) => HTML.span(...keys.map(key => HTML.span({ class: "carrot-kbd" }, key)));
            const item = (keys, label) => HTML.div(HTML.span(label), keys);
            const extra = CarrotSettings.get("extraShortcuts");
            const groups = [
                ["Playback", [
                        [k("Space"), "Play / pause"], [k("⇧", "Space"), "Play from the mouse"], [k("[", "]"), "Move playhead a bar"], [k("F"), "Back to start"], [k("H"), "Jump to selected bar"], [k("T"), "Metronome on/off" + (extra ? "" : " (extra)")],
                    ]],
                ["Editing", [
                        [k("Z"), "Undo"], [k("Y"), "Redo"], [k("C"), "Copy"], [k("V"), "Paste"], [k("A"), "Select all"], [k("Ctrl", "D"), "Copy bar to next bar"], [k("⇧", "⌫"), "Clear pattern"], [k("⇧", "H"), "Humanize volumes"], [k("⇧", "Q"), "Quantize to grid"], [k("0–9"), "Set pattern number"], [k("Alt"), "Hold while dragging: no snapping"], [k("Alt", "click"), "Jump to a ghost note's channel"], [k("M"), "Mute channel (hold ⇧ for all others)"], [k("S"), "Solo channel (hold ⇧ for the whole group)"],
                    ]],
                ["Views & windows", [
                        [k("F5"), "BeepBox grid ⇄ FL playlist"], [k("F8"), "Sound browser"], [k("B"), "Sound browser"], [k("F9"), "Master effects"], [k("Tab"), "Plugin launcher"], [k("E"), "Edit current plugin / sample"], [k("Esc"), "Close window"],
                    ]],
                ["FL Studio mode", [
                        [k("F6"), "Channel rack"], [k("F7"), "Piano roll"], [k("F9"), "Mixer (instead of master effects)"], [k("F10"), "Settings"], [k("F1"), "This list"], [k("L"), "Pattern / song mode"],
                    ]],
                ["Tools", [
                        [k("K"), "Drum kit / sound kit loader"], [k("G"), "Melody / rhythm generator"], [k(","), "CarrotBox settings"], [k("?"), "This list"], [k("Ctrl", "S"), "Export song"], [k("Ctrl", "O"), "Import song"],
                    ]],
            ];
            const body = HTML.div();
            if (!extra)
                body.appendChild(CarrotUI.hint("Extra shortcuts (K, G, E, B, T, comma, ?) are turned off in Settings."));
            for (const [title, items] of groups) {
                body.appendChild(HTML.h3({ style: "margin: 10px 0 4px;" }, title));
                body.appendChild(HTML.div({ class: "carrot-shortcuts" }, ...items.map(([keys, label]) => item(keys, label))));
            }
            body.appendChild(HTML.div({ style: "display: flex; justify-content: flex-end; margin-top: 10px;" }, CarrotUI.button("Done", () => this.close(), { primary: true })));
            this.setBody(body);
            this.mount();
        }
    }
    // ------------------------------------------------------------- kit loader
    const CARROT_KIT_CATEGORIES = [
        ["808", /808/i], ["kick", /kick|\bbd\b|bassdrum|bass drum|\bkck/i], ["snare", /snare|\bsd\b|\bsnr/i], ["clap", /clap|\bclp/i],
        ["open hat", /open.?hat|\boh\b|openhh|hat.?open/i], ["closed hat", /hat|\bhh\b|hihat|hi-hat|\bchh/i], ["cymbal", /crash|ride|cymbal|splash|china/i],
        ["tom", /\btom/i], ["rim / snap", /rim|snap|click|stick/i], ["perc", /perc|conga|bongo|shaker|tamb|cowbell|clave|wood|tabla|guiro|triangle/i],
        ["fx", /\bfx|riser|impact|sweep|whoosh|transition|uplift|downlift|noise/i], ["vocal", /vox|vocal|voice|chant|shout/i], ["loop", /loop|\d{2,3}\s?bpm/i],
        ["melodic", /piano|key|synth|lead|pad|bell|pluck|guitar|string|brass|chord|melody|bass/i],
    ];
    function carrotCategorize(path) {
        const lower = path.toLowerCase();
        for (const [name, regex] of CARROT_KIT_CATEGORIES)
            if (regex.test(lower))
                return name;
        return "other";
    }
    // Picks up to 12 sounds from a kit for FPC pads, in a drummer-friendly order.
    function carrotAutoMapKit(kit) {
        const byCategory = new Map();
        for (const file of kit.files) {
            const category = carrotCategorize(file.path);
            if (!byCategory.has(category))
                byCategory.set(category, []);
            byCategory.get(category).push(file);
        }
        const order = ["kick", "snare", "clap", "closed hat", "open hat", "rim / snap", "perc", "perc", "tom", "808", "cymbal", "fx", "vocal", "other", "melodic"];
        const used = new Set();
        const picks = [];
        const take = (category) => {
            const list = byCategory.get(category) || [];
            const file = list.find(f => !used.has(f.path));
            if (file) {
                used.add(file.path);
                picks.push(file);
                return true;
            }
            return false;
        };
        for (const category of order) {
            if (picks.length >= FLConfig.fpcPadCount)
                break;
            take(category);
        }
        for (const file of kit.files) {
            if (picks.length >= FLConfig.fpcPadCount)
                break;
            if (!used.has(file.path) && carrotCategorize(file.path) != "loop") {
                used.add(file.path);
                picks.push(file);
            }
        }
        return { picks, byCategory };
    }
    class CarrotKitLoader extends CarrotFloatingWindow {
        static open(editor, tab = 0) {
            const win = CarrotWindows.openPanel("kits", () => new CarrotKitLoader(editor));
            win._tabs.show(tab);
            return win;
        }
        constructor(editor) {
            super(editor, { key: "kits", title: "Drum Kit / Sound Kit Loader", color: "#ff9b21", width: 560 });
            this._doc = editor.doc;
            this._status = HTML.div({ class: "cb-hint", style: "min-height: 16px; margin-top: 6px;" });
            // ---- Load tab
            const folderInput = HTML.input({ type: "file", style: "display: none;" });
            folderInput.setAttribute("webkitdirectory", "");
            folderInput.setAttribute("directory", "");
            folderInput.multiple = true;
            const filesInput = HTML.input({ type: "file", multiple: true, accept: "audio/*,.wav,.aif,.aiff,.flac,.ogg,.mp3,.zip", style: "display: none;" });
            folderInput.addEventListener("change", () => {
                this._import(Array.from(folderInput.files || []));
                folderInput.value = "";
            });
            filesInput.addEventListener("change", () => {
                this._import(Array.from(filesInput.files || []));
                filesInput.value = "";
            });
            const drop = HTML.div({ class: "carrot-drop" }, HTML.div("Drop a kit folder, a .zip or audio files here"), HTML.div({ class: "cb-hint" }, "Works with kits made for FL Studio (WAV, AIFF, FLAC, OGG, MP3 in any folder layout)."), HTML.div({ style: "display: flex; gap: 6px; justify-content: center; margin-top: 8px;" }, CarrotUI.button("Choose kit folder…", () => folderInput.click(), { primary: true }), CarrotUI.button("Choose files or .zip…", () => filesInput.click())), folderInput, filesInput);
            drop.addEventListener("dragover", (event) => {
                if (flDragHasFiles(event)) {
                    event.preventDefault();
                    drop.classList.add("fl-drop-hover");
                }
            });
            drop.addEventListener("dragleave", () => drop.classList.remove("fl-drop-hover"));
            drop.addEventListener("drop", async (event) => {
                drop.classList.remove("fl-drop-hover");
                if (!flDragHasFiles(event))
                    return;
                event.preventDefault();
                this._import(await FLKitLibrary.filesFromDataTransfer(event.dataTransfer));
            });
            this._result = HTML.div();
            const loadTab = HTML.div(drop, this._result);
            // ---- My kits tab
            this._myKits = HTML.div({ class: "carrot-list" });
            const myTab = HTML.div(CarrotUI.hint("Kits you've imported live in this browser. Auto-map picks a kick, snare, clap, hats, percs, toms, an 808 and a cymbal for the 12 FPC pads."), HTML.div({ style: "height: 6px;" }), this._myKits);
            // ---- Built-in kits tab
            const builtIn = HTML.div({ class: "carrot-list" });
            for (const kit of FLSoundFactory.getKits()) {
                const names = kit.pads.slice(0, 5).map(p => (FLSoundFactory.getInfo(p[0]) || { name: p[0] }).name).join(", ");
                builtIn.appendChild(HTML.div({ class: "carrot-list-row" }, HTML.span({ class: "carrot-grow", title: names }, HTML.b(kit.name), HTML.span({ class: "cb-hint" }, "  " + names + "…")), CarrotUI.button("Load into FPC", () => this._loadBuiltin(kit.name), { primary: true })));
            }
            const builtTab = HTML.div(CarrotUI.hint("Built-in kits load onto FPC pads on the current drum channel (one is created if needed)."), HTML.div({ style: "height: 6px;" }), builtIn);
            // ---- FL Studio packs tab
            const packsInput = HTML.input({ type: "file", style: "display: none;" });
            packsInput.setAttribute("webkitdirectory", "");
            packsInput.multiple = true;
            packsInput.addEventListener("change", () => {
                this._import(Array.from(packsInput.files || []), true);
                packsInput.value = "";
            });
            const packsTab = HTML.div(HTML.p({ class: "cb-hint", style: "margin: 0 0 6px;" }, "If FL Studio is installed on this computer you can bring its whole sample library (the Packs folder) into CarrotBox. Choose the folder below; the sounds are copied into this browser, so it can take a minute for big libraries."), HTML.div({ class: "carrot-list" }, HTML.div({ class: "carrot-list-row" }, HTML.b("Windows"), HTML.span({ class: "carrot-grow", style: "user-select: text;" }, "C:\\Program Files\\Image-Line\\FL Studio 21\\Data\\Patches\\Packs")), HTML.div({ class: "carrot-list-row" }, HTML.b("macOS"), HTML.span({ class: "carrot-grow", style: "user-select: text;" }, "Applications ▸ FL Studio 21 ▸ (right-click) Show Package Contents ▸ Contents/Resources/FL/Data/Patches/Packs")), HTML.div({ class: "carrot-list-row" }, HTML.b("User data"), HTML.span({ class: "carrot-grow", style: "user-select: text;" }, "Documents/Image-Line/FL Studio/Data/Patches/Packs (packs you downloaded)"))), HTML.div({ style: "display: flex; justify-content: center; margin-top: 10px;" }, CarrotUI.button("Choose Packs folder…", () => packsInput.click(), { primary: true })), packsInput, CarrotUI.hint("Tip: on macOS, press ⌘⇧G in the folder picker and paste the path. Your version number may differ (20, 21, 2024…)."));
            this._tabs = CarrotUI.tabs([["Load a kit", loadTab], ["My kits", myTab], ["Built-in kits", builtTab], ["FL Studio Packs", packsTab]], (index) => {
                if (index == 1)
                    this._renderMyKits();
            });
            this.setBody(HTML.div(this._tabs, this._status));
            this._kitListener = () => {
                if (this._tabs.current == 1)
                    this._renderMyKits();
            };
            FLSampleBank.onChange(this._kitListener);
            this.mount();
        }
        onClose() {
            FLSampleBank._listeners.delete(this._kitListener);
        }
        async _import(files, isPacks = false) {
            if (!files || files.length == 0)
                return;
            const audio = files.filter(f => flIsAudioFileName(f.webkitRelativePath || f.flRelativePath || f.name) || flFileExtension(f.name) == "zip");
            if (audio.length == 0) {
                this._status.textContent = "No audio files found there.";
                carrotUISound("error");
                return;
            }
            this._status.textContent = "Importing " + audio.length + " file" + (audio.length == 1 ? "" : "s") + "…";
            try {
                const kits = await FLKitLibrary.importFiles(audio, (message) => { this._status.textContent = message; });
                if (kits.length == 0) {
                    this._status.textContent = "Nothing was imported.";
                    return;
                }
                carrotUISound("success");
                this._status.textContent = "Imported " + kits.map(k => "“" + k.name + "” (" + k.files.length + " sounds)").join(", ") + (isPacks ? " — open the Sound Browser (F8) ▸ My Kits to explore." : "");
                this._showResult(kits[kits.length - 1]);
                if (this.editor._flBrowser) {
                    this.editor._flBrowser._dirty = true;
                    this.editor._flBrowser.render();
                }
            }
            catch (error) {
                console.error(error);
                this._status.textContent = "Import failed: " + (error.message || error);
                carrotUISound("error");
            }
        }
        _showResult(kit) {
            const { picks, byCategory } = carrotAutoMapKit(kit);
            const chips = HTML.div({ class: "carrot-chips" });
            for (const [category, list] of byCategory)
                chips.appendChild(HTML.span({ class: "carrot-chip" }, list.length + " " + category));
            this._result.innerHTML = "";
            this._result.appendChild(CarrotUI.section("“" + kit.name + "” — " + kit.files.length + " sounds", chips, HTML.div({ class: "cb-hint" }, "Auto-mapped pads: " + picks.map(f => f.path.split("/").pop().replace(/\.[^.]+$/, "")).join(" · ")), HTML.div({ style: "display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;" }, CarrotUI.button("Load into FPC pads", () => this._loadKitToFPC(kit), { primary: true }), CarrotUI.button("808 → new Sampler channel", () => this._load808(kit)), CarrotUI.button("Show in browser", () => {
                this.editor.flShowBrowser(true);
                const browser = this.editor._flBrowser;
                browser._expanded.add("mykits");
                browser._expanded.add("mykit:" + kit.id);
                browser._dirty = true;
                browser.render();
            }))));
        }
        // Makes sure the current channel is a drum channel (FPC lives there).
        _ensureDrumChannel() {
            const doc = this._doc;
            if (doc.song.getChannelIsNoise(doc.channel))
                return true;
            for (let c = doc.song.pitchChannelCount; c < doc.song.getChannelCount(); c++) {
                doc.selection.setChannelBar(c, doc.bar);
                return true;
            }
            const added = carrotNewChannel(doc, true);
            if (!added) {
                flToast("No room for another drum channel.");
                return false;
            }
            doc.record(added.group);
            return true;
        }
        async _loadKitToFPC(kit) {
            if (!this._ensureDrumChannel())
                return;
            const { picks } = carrotAutoMapKit(kit);
            await FLActions.loadFolderIntoFPC(this._doc, picks.map(f => ({ kitId: kit.id, path: f.path, name: f.path.split("/").pop() })), kit.name);
            carrotUISound("success");
        }
        async _load808(kit) {
            const file = kit.files.find(f => carrotCategorize(f.path) == "808") || kit.files.find(f => /bass/i.test(f.path));
            if (!file) {
                flToast("No 808 found in this kit.");
                return;
            }
            const doc = this._doc;
            const added = carrotNewChannel(doc, false);
            if (!added) {
                flToast("No room for another channel.");
                return;
            }
            doc.record(added.group);
            await FLActions.loadSample(doc, { kitId: kit.id, path: file.path, name: file.path.split("/").pop() });
            doc.record(new ChangeFL(doc, () => {
                const instrument = flCurrentInstrument(doc);
                instrument.fl.sampler.root = 36;
                doc.song.channels[doc.channel].name = "808";
            }));
        }
        _loadBuiltin(name) {
            if (!this._ensureDrumChannel())
                return;
            FLActions.loadBuiltinKit(this._doc, name);
            flToast("Loaded " + name + " into FPC");
            carrotUISound("success");
        }
        async _renderMyKits() {
            await FLKitLibrary.load();
            this._myKits.innerHTML = "";
            if (FLKitLibrary.kits.length == 0) {
                this._myKits.appendChild(CarrotUI.hint("No kits yet — import one from the first tab."));
                return;
            }
            for (const kit of FLKitLibrary.kits.slice().reverse()) {
                this._myKits.appendChild(HTML.div({ class: "carrot-list-row" }, HTML.span({ class: "carrot-grow" }, HTML.b(kit.name), HTML.span({ class: "cb-hint" }, "  " + kit.files.length + " sounds")), CarrotUI.button("→ FPC", () => this._loadKitToFPC(kit), { primary: true, title: "Auto-map onto the FPC pads" }), CarrotUI.button("Details", () => {
                    this._tabs.show(0);
                    this._showResult(kit);
                }), CarrotUI.button("x", async () => {
                    if (!window.confirm("Remove “" + kit.name + "” from this browser?"))
                        return;
                    await FLKitLibrary.removeKit(kit.id);
                    this._renderMyKits();
                }, { title: "Remove kit" })));
            }
        }
    }
    // ------------------------------------------------------------- generator
    // Drum kit and instrument presets for "Full beat" (first name that exists wins).
    const CARROT_GEN_KITS = {
        pop: ["Pop Kit", "TR-909 Kit"], trap: ["Trap Kit"], drill: ["Drill Kit", "Trap Kit"], house: ["House Kit"], techno: ["Techno Kit", "TR-909 Kit"],
        dnb: ["Drum & Bass Kit"], breakcore: ["Breakcore Kit", "Drum & Bass Kit"], lofi: ["Lo-Fi Kit"], boombap: ["Boom Bap Kit"], rnb: ["R&B Kit", "Lo-Fi Kit"],
        afro: ["Afro / Amapiano Kit"], reggaeton: ["Reggaeton Kit", "TR-808 Kit"], rock: ["Rock Kit", "Acoustic Kit"], indie: ["Indie Kit", "Acoustic Kit"],
        synthwave: ["Synthwave Kit", "TR-909 Kit"], chiptune: ["Chiptune Kit", "TR-808 Kit"], hyperpop: ["Hyperpop Kit", "Trap Kit"], webcore: ["Webcore Kit", "Hyperpop Kit", "Trap Kit"],
        funk: ["Funk Kit", "Acoustic Kit"], jazz: ["Jazz Kit", "Acoustic Kit"], ambient: ["Ambient Kit", "Lo-Fi Kit"],
    };
    // [bass, chords, lead]
    const CARROT_GEN_SOUNDS = {
        pop: ["3x Osc Sub Bass", "E-Piano (sampled)", "3x Osc Pluck"], trap: ["808 Bass", "Warm Pad (sampled)", "Bell (sampled)"], drill: ["808 Glide Bass", "Strings (sampled)", "Pluck (sampled)"],
        house: ["Boo Bass (3x Osc)", "Grand Piano (sampled)", "3x Osc Pluck"], techno: ["Acid Bass (sampled)", "Brass Stab (sampled)", "3x Osc Square Lead"], dnb: ["Reese Bass (sampled)", "Warm Pad (sampled)", "Pluck (sampled)"],
        breakcore: ["Reese Bass (sampled)", "Strings (sampled)", "3x Osc Supersaw"], lofi: ["3x Osc Sub Bass", "E-Piano (sampled)", "Kalimba (sampled)"], boombap: ["3x Osc Sub Bass", "E-Piano (sampled)", "Bell (sampled)"],
        rnb: ["3x Osc Sub Bass", "E-Piano (sampled)", "Bell (sampled)"], afro: ["Boo Bass (3x Osc)", "Kalimba (sampled)", "Pluck (sampled)"], reggaeton: ["808 Bass (punchy)", "3x Osc Pluck", "3x Osc Square Lead"],
        rock: ["3x Osc Growl (AM)", "Organ (sampled)", "3x Osc Square Lead"], indie: ["3x Osc (classic)", "Grand Piano (sampled)", "Bell (sampled)"], synthwave: ["3x Osc Sub Bass", "Warm Pad (sampled)", "Supersaw Lead (sampled)"],
        chiptune: ["3x Osc Square Lead", "3x Osc Pluck", "3x Osc Square Lead"], hyperpop: ["808 Bass (distorted)", "3x Osc Supersaw", "Supersaw Lead (sampled)"], webcore: ["808 Bass (clean)", "Choir Aah (sampled)", "Bell (sampled)"],
        funk: ["Boo Bass (3x Osc)", "Organ (sampled)", "Brass Stab (sampled)"], jazz: ["3x Osc Sub Bass", "Grand Piano (sampled)", "E-Piano (sampled)"], ambient: ["3x Osc Sub Bass", "Strings (sampled)", "Bell (sampled)"],
    };
    const CARROT_GEN_BARS = [1, 2, 4, 8, 16];
    const CARROT_GEN_SWING = [null, 0, 0.3, 0.6, 0.95];
    class CarrotGeneratorPanel extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("generator", () => new CarrotGeneratorPanel(editor));
        }
        constructor(editor) {
            super(editor, { key: "generator", title: "Melody / Rhythm Generator", color: "#c792ea", width: 660 });
            const doc = editor.doc;
            this._doc = doc;
            this._seed = Math.floor(Math.random() * 100000);
            this._last = null;
            this._history = [];
            this._historyIndex = -1;
            this._lastChannel = null;
            this._fullChannels = {};
            const isNoise = doc.song.getChannelIsNoise(doc.channel);
            const defaults = { part: 0, style: 0, bars: 2, form: 0, source: 2, density: 0.5, complexity: 0.4, register: 0, target: 0, play: true, progression: 0, chordEvery: 0, notes: 0, contour: 0, swing: 0, harmony: 0, followKick: true, lockRhythm: false, lockNotes: false, loop: false };
            let saved = {};
            try {
                saved = JSON.parse(window.localStorage.getItem("carrotGenerator") || "{}") || {};
            }
            catch (error) { }
            this._state = Object.assign({}, defaults);
            for (const key in defaults)
                if (saved[key] != undefined && typeof saved[key] == typeof defaults[key])
                    this._state[key] = saved[key];
            const s = this._state;
            const partIndex = (id) => CARROT_GEN_PARTS.findIndex(p => p[0] == id);
            if (isNoise && ["drums", "perc", "full"].indexOf(CARROT_GEN_PARTS[s.part] ? CARROT_GEN_PARTS[s.part][0] : "") == -1)
                s.part = partIndex("drums");
            s.part = Math.max(0, Math.min(CARROT_GEN_PARTS.length - 1, s.part));
            const styleKeys = Object.keys(CARROT_GEN_STYLES);
            const formKeys = Object.keys(CARROT_GEN_FORMS);
            s.style = Math.max(0, Math.min(styleKeys.length - 1, s.style));
            s.bars = Math.max(0, Math.min(CARROT_GEN_BARS.length - 1, s.bars));
            s.progression = Math.max(0, Math.min(CARROT_GEN_PROGRESSIONS.length + 1, s.progression));
            const sel = (label, options, key, title = "") => CarrotUI.select({ label, title, options, value: s[key], onChange: (v) => {
                    s[key] = v;
                    this._save();
                    this._updateVisibility();
                } });
            const tog = (label, key, title = "") => CarrotUI.toggle({ label, title, value: s[key], onChange: (v) => {
                    s[key] = v;
                    if (key == "lockRhythm" && v) {
                        s.lockNotes = false;
                        this._lockNotes.setValue(false);
                    }
                    if (key == "lockNotes" && v) {
                        s.lockRhythm = false;
                        this._lockRhythm.setValue(false);
                    }
                    this._save();
                } });
            this._partSelect = sel("Make a", CARROT_GEN_PARTS.map(p => p[1]), "part");
            this._styleSelect = sel("Style", styleKeys.map(k => CARROT_GEN_STYLES[k].name), "style");
            this._barsSelect = sel("Length", CARROT_GEN_BARS.map(n => n + (n == 1 ? " bar" : " bars")), "bars");
            this._formSelect = sel("Form", formKeys, "form", "How the bars repeat: A' is A with a new ending");
            this._sourceSelect = sel("Start from", ["My 4 notes", "Ideas in my song", "Both"], "source");
            this._progressionSelect = sel("Chords", this._progressionLabels(), "progression", "Auto follows the chords already in your song and uses the style's progression elsewhere");
            this._chordEverySelect = sel("Chord every", ["Bar", "2 bars", "Half bar"], "chordEvery");
            this._notesSelect = sel("Notes", ["Full scale", "Pentatonic", "Chord tones only"], "notes");
            this._contourSelect = sel("Contour", ["Auto", "Arch", "Rising", "Falling", "Wave", "Valley"], "contour", "The overall shape of each 4-bar phrase");
            this._harmonySelect = sel("Harmony", CARROT_GEN_HARMONY, "harmony");
            this._swingSelect = sel("Swing", ["Style", "Straight", "Light", "Medium", "Heavy (triplet)"], "swing");
            this._registerSelect = sel("Register", ["Auto", "Low", "Middle", "High"], "register");
            this._targetSelect = sel("Write into", ["Current channel", "New channel"], "target");
            this._followKick = tog("Follow the kick", "followKick", "Put bass notes on the kicks of your drum channel");
            this._lockRhythm = tog("Keep rhythm", "lockRhythm", "Generate keeps the last idea's rhythm and finds new notes for it");
            this._lockNotes = tog("Keep notes", "lockNotes", "Generate keeps the last idea's notes and gives them a new rhythm");
            this._playToggle = tog("Play afterwards", "play");
            this._loopToggle = tog("Loop the idea", "loop", "Set the song's loop to the generated bars");
            // Seed notes.
            this._seedSelects = [];
            const seedRow = HTML.div({ class: "cb-row" });
            for (let i = 0; i < 4; i++) {
                const select = HTML.select({ class: "cb-select", title: "Seed note " + (i + 1) });
                select.addEventListener("keydown", (event) => event.stopPropagation());
                select.addEventListener("change", () => {
                    const pitch = parseInt(select.value);
                    if (pitch >= 0)
                        doc.performance.setTemporaryPitches([pitch], Config.partsPerBeat);
                });
                this._seedSelects.push(select);
                seedRow.appendChild(HTML.div({ class: "carrot-seed" }, HTML.span({ class: "cb-hint" }, "Note " + (i + 1)), select));
            }
            seedRow.appendChild(HTML.div({ class: "carrot-seed" }, HTML.span({ class: "cb-hint" }, " "), HTML.div({ style: "display: flex; gap: 6px;" }, CarrotUI.button("From pattern", () => this._seedsFromPattern(), { title: "Use the first 4 notes of the current pattern" }), CarrotUI.button("Play", () => this._playSeeds(), { title: "Hear the seed notes" }), CarrotUI.button("Clear", () => this._setSeeds([]), { title: "No seed notes" }))));
            this._fillSeedOptions();
            this._setSeeds(this._defaultSeeds());
            this._seedSection = CarrotUI.section("Your 4 notes (the idea starts from these)", seedRow);
            // Knobs.
            const local = new CarrotLocalHost(editor, s, () => this._save());
            const density = local.knob("density", { label: "Density", min: 0, max: 1, def: 0.5, format: CARROT_PERCENT, title: "How many notes" });
            const complexity = local.knob("complexity", { label: "Complexity", min: 0, max: 1, def: 0.4, format: CARROT_PERCENT, title: "More leaps, syncopation, ghost notes, fills and variation" });
            this._barInput = HTML.input({ type: "number", min: "1", max: String(Config.barCountMax), value: String(doc.bar + 1), style: "width: 60px;" });
            this._barInput.addEventListener("keydown", (event) => event.stopPropagation());
            this._barTouched = false;
            this._barInput.addEventListener("input", () => { this._barTouched = true; });
            this._refLabel = HTML.div({ class: "cb-hint" });
            this._chordChips = HTML.div({ class: "carrot-gen-chords" });
            this._preview = CarrotUI.canvas(120);
            this._statusText = HTML.div({ class: "cb-hint carrot-gen-status" }, "Pick what to make, then press Generate (or Enter). Every press gives a new idea; Z undoes.");
            this._historyLabel = HTML.span({ class: "cb-hint", style: "min-width: 52px; text-align: center;" }, "");
            this._backButton = CarrotUI.button("<", () => this._stepHistory(-1), { title: "Previous idea" });
            this._forwardButton = CarrotUI.button(">", () => this._stepHistory(1), { title: "Next idea" });
            const generate = CarrotUI.button("Generate", () => this._generate("new"), { primary: true, title: "A brand new idea (Enter)" });
            const vary = CarrotUI.button("Variation", () => this._generate("variation"), { title: "The same idea with a few notes changed (same chords)" });
            const next = CarrotUI.button("Continue", () => this._generate("continue"), { title: "Write the next bars of this idea" });
            const field = (label, control) => HTML.label({ class: "cb-field" }, label, control);
            this.setBody(HTML.div({ class: "carrot-gen" },
                HTML.div({ class: "cb-row carrot-gen-top" }, this._partSelect, this._styleSelect, this._barsSelect, this._formSelect, this._sourceSelect),
                this._seedSection,
                CarrotUI.section("Harmony", HTML.div({ class: "cb-row" }, this._progressionSelect, this._chordEverySelect, this._notesSelect, this._contourSelect, this._harmonySelect, this._followKick), this._refLabel),
                CarrotUI.section("Feel", HTML.div({ class: "cb-row cb-center" }, density, complexity, this._swingSelect, this._registerSelect)),
                CarrotUI.section("Output", HTML.div({ class: "cb-row cb-center" }, this._targetSelect, field("Bar", this._barInput), this._playToggle, this._loopToggle, this._lockRhythm, this._lockNotes)),
                this._chordChips, this._preview,
                HTML.div({ class: "carrot-gen-footer" }, this._statusText, HTML.div({ class: "carrot-gen-buttons" }, this._backButton, this._historyLabel, this._forwardButton, vary, next, generate))));
            this.container.addEventListener("keydown", (event) => {
                if (event.key == "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) {
                    event.preventDefault();
                    event.stopPropagation();
                    this._generate("new");
                }
            }, true);
            this._songKey = doc.song.key + ":" + doc.song.scale;
            this.watchSong(() => {
                if (!this._barTouched && !this._writing)
                    this._barInput.value = String(this._doc.bar + 1);
                const key = this._doc.song.key + ":" + this._doc.song.scale;
                if (key != this._songKey) {
                    this._songKey = key;
                    const labels = this._progressionLabels();
                    const menu = this._progressionSelect.menu;
                    for (let i = 0; i < menu.options.length && i < labels.length; i++)
                        menu.options[i].textContent = labels[i];
                    this._fillSeedOptions();
                }
                this._updateRefLabel();
            });
            this._updateVisibility();
            this.mount();
            this._drawPreview(null);
            this._updateHistoryButtons();
        }
        _save() {
            try {
                window.localStorage.setItem("carrotGenerator", JSON.stringify(this._state));
            }
            catch (error) { }
        }
        _progressionLabels() {
            return ["Auto (follow my song)", "Style progression"].concat(CARROT_GEN_PROGRESSIONS.map(p => CarrotIdeaGen.progressionLabel(this._doc.song, p)));
        }
        _part() {
            return CARROT_GEN_PARTS[this._state.part][0];
        }
        _barCount() {
            return CARROT_GEN_BARS[this._state.bars];
        }
        _pitchLabel(pitch) {
            return flMidiName(Config.keys[this._doc.song.key].basePitch + pitch);
        }
        _fillSeedOptions() {
            for (const select of this._seedSelects) {
                const value = select.value;
                select.innerHTML = "";
                select.appendChild(HTML.option({ value: "-1" }, "-"));
                const scale = Config.scales[this._doc.song.scale].flags;
                for (let p = 24; p <= 72; p++) {
                    const inScale = scale[p % 12];
                    select.appendChild(HTML.option({ value: String(p) }, this._pitchLabel(p) + (inScale ? "" : " (off scale)")));
                }
                select.value = value || "-1";
            }
        }
        _defaultSeeds() {
            const pattern = this._doc.getCurrentPattern();
            if (pattern && pattern.notes.length >= 2 && !this._doc.song.getChannelIsNoise(this._doc.channel))
                return this._patternSeeds(pattern);
            const classes = CarrotIdeaGen.scaleClasses(this._doc.song, []).classes;
            const pick = (degree) => 48 + classes[degree % classes.length];
            return [pick(0), pick(2), pick(4), pick(classes.length > 5 ? 5 : 3)];
        }
        _patternSeeds(pattern) {
            const pitches = [];
            for (const note of pattern.notes.slice().sort((a, b) => a.start - b.start)) {
                const top = note.pitches[note.pitches.length - 1];
                if (pitches[pitches.length - 1] != top)
                    pitches.push(top);
                if (pitches.length >= 4)
                    break;
            }
            return pitches.filter(p => p >= 24 && p <= 72);
        }
        _seedsFromPattern() {
            const pattern = this._doc.getCurrentPattern();
            if (!pattern || pattern.notes.length == 0 || this._doc.song.getChannelIsNoise(this._doc.channel)) {
                flToast("This pattern has no notes to start from. Draw a few notes or pick them here.");
                return;
            }
            this._setSeeds(this._patternSeeds(pattern));
        }
        _setSeeds(pitches) {
            this._seedSelects.forEach((select, i) => { select.value = pitches[i] != undefined ? String(pitches[i]) : "-1"; });
        }
        _getSeeds() {
            return this._seedSelects.map(s => parseInt(s.value)).filter(p => p >= 0);
        }
        _playSeeds() {
            const seeds = this._getSeeds();
            seeds.forEach((pitch, i) => setTimeout(() => this._doc.performance.setTemporaryPitches([pitch], Config.partsPerBeat / 2), i * 260));
        }
        _updateVisibility() {
            const part = this._part();
            const s = this._state;
            const melodic = part == "lead" || part == "hook" || part == "counter" || part == "full";
            const show = (el, on) => { el.style.display = on ? "" : "none"; };
            show(this._seedSection, (part == "lead" || part == "hook" || part == "full") && s.source != 1);
            show(this._formSelect, part == "lead" || part == "counter" || part == "full");
            show(this._sourceSelect, part != "drums" && part != "perc" && part != "harmony");
            show(this._notesSelect, melodic);
            show(this._contourSelect, melodic);
            show(this._harmonySelect, part == "harmony");
            show(this._followKick, part == "bass" || part == "full");
            show(this._progressionSelect, part != "drums" && part != "perc");
            show(this._chordEverySelect, part != "drums" && part != "perc" && part != "harmony");
            show(this._lockRhythm, melodic);
            show(this._lockNotes, melodic);
            show(this._targetSelect, part != "full");
            this._updateRefLabel();
        }
        _updateRefLabel() {
            const part = this._part();
            if (part != "counter" && part != "harmony") {
                this._refLabel.style.display = "none";
                return;
            }
            const ref = this._referenceChannel();
            this._refLabel.style.display = "";
            this._refLabel.textContent = ref == null ? "Select the channel with your lead melody: the " + (part == "harmony" ? "harmony" : "counter-melody") + " follows it." : "Follows channel " + (ref + 1) + (this._doc.song.channels[ref].name ? " (" + this._doc.song.channels[ref].name + ")" : "") + ". Select another channel to follow that one.";
        }
        // The lead that counter-melodies and harmonies follow: the selected
        // channel, unless it is one this window wrote a counter / harmony into.
        _referenceChannel() {
            const doc = this._doc;
            const song = doc.song;
            const hasNotes = (c) => {
                const start = this._startBar();
                for (let b = start; b < Math.min(song.barCount, start + this._barCount()); b++) {
                    const p = song.getPattern(c, b);
                    if (p && p.notes.length > 0)
                        return true;
                }
                return false;
            };
            const followers = this._followers || (this._followers = new Set());
            if (!song.getChannelIsNoise(doc.channel) && !followers.has(doc.channel) && hasNotes(doc.channel))
                this._ref = doc.channel;
            if (this._ref != null && (this._ref >= song.pitchChannelCount || followers.has(this._ref)))
                this._ref = null;
            return this._ref != null ? this._ref : null;
        }
        // Picks (or makes) the channel to write into.
        _targetChannel(part, forceNew = false) {
            const doc = this._doc;
            const wantsNoise = part == "drums" || part == "perc";
            let channel = doc.channel;
            if (this._state.target == 1 || forceNew || doc.song.getChannelIsNoise(channel) != wantsNoise) {
                if (this._lastChannel != null && this._lastChannel < doc.song.getChannelCount() && doc.song.getChannelIsNoise(this._lastChannel) == wantsNoise && this._lastPart == part && this._lastChannel != this._ref) {
                    channel = this._lastChannel;
                }
                else if (this._state.target == 1 || forceNew || !wantsNoise || doc.song.noiseChannelCount == 0) {
                    channel = this._newChannel(part, wantsNoise);
                }
                else {
                    channel = doc.song.pitchChannelCount;
                }
            }
            return channel;
        }
        _newChannel(part, isNoise) {
            const doc = this._doc;
            const added = carrotNewChannel(doc, isNoise);
            if (!added) {
                flToast("No room for another channel.");
                return null;
            }
            doc.record(added.group);
            const channel = added.index;
            // A new pitched channel goes before the drum channels: move the
            // channel numbers this window remembers.
            if (!isNoise)
                this._shiftChannels(channel);
            const label = (CARROT_GEN_PARTS.find(p => p[0] == part) || [part, part])[1].replace(/ \(.*\)$/, "");
            doc.record(new ChangeFL(doc, () => { doc.song.channels[channel].name = label; }, false));
            return channel;
        }
        _shiftChannels(from) {
            const shift = (c) => c != null && c >= from ? c + 1 : c;
            if (this._followers)
                this._followers = new Set(Array.from(this._followers).map(shift));
            this._lastChannel = shift(this._lastChannel);
            this._ref = shift(this._ref);
            for (const key in this._fullChannels)
                this._fullChannels[key] = shift(this._fullChannels[key]);
            const ideas = this._history.slice();
            if (this._pending)
                ideas.push(this._pending);
            for (const idea of ideas)
                for (const t of idea.tracks)
                    t.channel = shift(t.channel);
        }
        _options(part, extra = {}) {
            const s = this._state;
            const doc = this._doc;
            const registers = { lead: [null, 40, 50, 62], hook: [null, 40, 50, 62], counter: [null, 34, 44, 54], bass: [null, 22, 28, 36], arp: [null, 42, 52, 64], chords: [null, 42, 50, 60] };
            return Object.assign({
                song: doc.song, part, bars: this._barCount(),
                style: Object.keys(CARROT_GEN_STYLES)[s.style], density: s.density, complexity: s.complexity,
                center: (registers[part] || [null, null, null, null])[s.register], form: Object.keys(CARROT_GEN_FORMS)[s.form],
                seeds: (s.source != 1 && (part == "lead" || part == "hook")) ? this._getSeeds() : [], learn: s.source != 0 || part == "counter" || part == "harmony",
                progression: s.progression == 0 ? null : s.progression == 1 ? "style" : CARROT_GEN_PROGRESSIONS[s.progression - 2],
                chordEvery: s.chordEvery, notes: s.notes, contour: CARROT_GEN_CONTOURS[s.contour], swing: CARROT_GEN_SWING[s.swing],
                harmony: s.harmony, followKick: s.followKick,
            }, extra);
        }
        _startBar() {
            const doc = this._doc;
            return Math.max(0, Math.min(Config.barCountMax - 1, (parseInt(this._barInput.value) || (doc.bar + 1)) - 1));
        }
        _generate(kind) {
            const doc = this._doc;
            const s = this._state;
            const last = this._last;
            if ((kind == "variation" || kind == "continue") && !last) {
                kind = "new";
            }
            let idea;
            if (kind == "new") {
                const part = this._part();
                this._seed = Math.floor(Math.random() * 1000000);
                idea = { part, seed: this._seed, startBar: this._startBar(), bars: this._barCount(), tracks: [] };
                const parts = part == "full" ? ["chords", "drums", "bass", "lead"] : [part];
                let degrees = null;
                this._pending = idea;
                if (part == "full") {
                    // Make the channels first (pitched ones before the drums).
                    for (const p of ["chords", "bass", "lead", "drums"])
                        if (this._fullChannel(p) == null) {
                            this._pending = null;
                            return;
                        }
                }
                for (const p of parts) {
                    let channel;
                    if (part == "full")
                        channel = this._fullChannels[p];
                    else if (p == "harmony" || p == "counter") {
                        const ref = this._referenceChannel();
                        channel = this._targetChannel(p, ref != null && ref == doc.channel);
                        if (channel != null)
                            (this._followers || (this._followers = new Set())).add(channel);
                    }
                    else
                        channel = this._targetChannel(p);
                    if (channel == null) {
                        this._pending = null;
                        return;
                    }
                    const extra = { channel, startBar: idea.startBar, seed: this._seed, refChannel: this._ref };
                    if (degrees) {
                        extra.fixedChords = degrees;
                        extra.scale = idea.scale;
                    }
                    const melodic = p == "lead" || p == "hook" || p == "counter";
                    const prevTrack = last && last.tracks.find(t => t.part == p);
                    if (melodic && prevTrack && prevTrack.result.straight && prevTrack.result.bars.length == idea.bars) {
                        if (s.lockRhythm)
                            extra.keepRhythmOf = prevTrack.result.straight;
                        else if (s.lockNotes)
                            extra.keepNotesOf = prevTrack.result.straight;
                    }
                    const options = this._options(p, extra);
                    const result = CarrotIdeaGen.generate(options);
                    if (!result.bars || result.bars.length == 0) {
                        this._statusText.textContent = result.description || "Couldn't make anything here.";
                        carrotUISound("error");
                        this._pending = null;
                        return;
                    }
                    if (!degrees) {
                        const first = CarrotIdeaGen.context(options);
                        degrees = first.chords;
                        idea.scale = first.scale;
                    }
                    delete options.keepRhythmOf;
                    delete options.keepNotesOf;
                    idea.tracks.push({ part: p, channel, options, result, chain: idea.bars });
                }
                this._pending = null;
            }
            else if (kind == "variation") {
                idea = { part: last.part, seed: Math.floor(Math.random() * 1000000), startBar: last.startBar, bars: last.bars, tracks: [] };
                for (const t of last.tracks) {
                    const melodic = t.part == "lead" || t.part == "hook" || t.part == "counter" || t.part == "drums" || t.part == "perc";
                    const before = CarrotIdeaGen.context(Object.assign({}, t.options, { bars: t.chain }));
                    const options = Object.assign({}, t.options, { bars: t.chain, seed: idea.seed, fixedChords: before.chords, scale: before.scale });
                    if (melodic)
                        options.variationOf = t.result.straight;
                    const result = CarrotIdeaGen.generate(options);
                    delete options.variationOf;
                    if (result.bars.length == 0)
                        continue;
                    idea.tracks.push({ part: t.part, channel: t.channel, options: Object.assign({}, t.options, { seed: idea.seed }), result, chain: t.chain, varied: melodic });
                }
            }
            else {
                // Continue: the same idea, longer; only the new bars are written.
                const add = this._barCount();
                idea = { part: last.part, seed: last.seed, startBar: last.startBar, bars: last.bars + add, tracks: [], from: last.bars };
                for (const t of last.tracks) {
                    const options = Object.assign({}, t.options, { bars: t.chain + add });
                    const result = CarrotIdeaGen.generate(options);
                    if (result.bars.length == 0)
                        continue;
                    // Keep the bars already written (they may be variations).
                    result.bars = t.result.bars.concat(result.bars.slice(t.chain));
                    result.straight = (t.result.straight || t.result.bars).concat((result.straight || result.bars).slice(t.chain));
                    idea.tracks.push({ part: t.part, channel: t.channel, options, result, chain: t.chain + add });
                }
            }
            if (idea.tracks.length == 0)
                return;
            this._write(idea, kind == "continue" ? idea.from : 0);
            this._pushHistory(idea);
            const first = idea.tracks[idea.tracks.length - 1];
            const desc = idea.part == "full" ? "Full beat, " + CARROT_GEN_STYLES[first.options.style].name + " (" + idea.tracks.map(t => t.part).join(", ") + ")" : first.result.description;
            const range = "bars " + (idea.startBar + 1 + (kind == "continue" ? idea.from : 0)) + "-" + (idea.startBar + idea.bars);
            this._statusText.textContent = (kind == "variation" ? "Variation: " : kind == "continue" ? "Continued: " : "") + desc + ", " + range + " (Z to undo)";
            carrotUISound("generate");
        }
        _fullChannel(part) {
            const doc = this._doc;
            const wantsNoise = part == "drums";
            const known = this._fullChannels[part];
            if (known != null && known < doc.song.getChannelCount() && doc.song.getChannelIsNoise(known) == wantsNoise)
                return known;
            const channel = this._newChannel(part, wantsNoise);
            if (channel == null)
                return null;
            this._fullChannels[part] = channel;
            // Give the new channel a sound that suits the style.
            const style = Object.keys(CARROT_GEN_STYLES)[this._state.style];
            try {
                doc.selection.setChannelBar ? doc.selection.setChannelBar(channel, doc.bar) : doc.record(new ChangeChannelBar(doc, channel, doc.bar));
                if (wantsNoise) {
                    const names = FLSoundFactory.getKits().map(k => k.name);
                    const kit = (CARROT_GEN_KITS[style] || []).find(n => names.indexOf(n) != -1);
                    if (kit)
                        FLActions.loadBuiltinKit(doc, kit);
                }
                else {
                    const sounds = CARROT_GEN_SOUNDS[style] || CARROT_GEN_SOUNDS.pop;
                    const name = sounds[["bass", "chords", "lead"].indexOf(part)];
                    const value = name ? EditorConfig.nameToPresetValue(name) : null;
                    if (value != null)
                        doc.record(new ChangePreset(doc, value));
                }
            }
            catch (error) {
                console.warn("CarrotBox generator: could not set the instrument", error);
            }
            return channel;
        }
        _write(idea, fromBar) {
            const doc = this._doc;
            this._writing = true;
            try {
                for (const t of idea.tracks) {
                    if (t.channel == null || t.channel >= doc.song.getChannelCount())
                        continue;
                    if (doc.song.getChannelIsNoise(t.channel) != (t.part == "drums" || t.part == "perc"))
                        continue;
                    t.options.channel = t.channel;
                    const bars = t.result.bars.slice(fromBar);
                    carrotWriteNotes(doc, bars, { channel: t.channel, startBar: idea.startBar + fromBar, replace: true, freshPatterns: true });
                    this._lastChannel = t.channel;
                    this._lastPart = t.part;
                }
                if (this._state.loop) {
                    const length = Math.min(idea.bars, doc.song.barCount - idea.startBar);
                    if (length > 0 && (doc.song.loopStart != idea.startBar || doc.song.loopLength != length))
                        doc.record(new ChangeLoop(doc, doc.song.loopStart, doc.song.loopLength, idea.startBar, length));
                }
            }
            finally {
                this._writing = false;
            }
            this._last = idea;
            this._drawPreview(idea);
            if (this._state.play) {
                doc.synth.goToBar(idea.startBar + fromBar);
                doc.synth.snapToBar();
                if (!doc.synth.playing)
                    doc.performance.play();
            }
        }
        _pushHistory(idea) {
            this._history = this._history.slice(0, this._historyIndex + 1);
            this._history.push(idea);
            if (this._history.length > 30)
                this._history.shift();
            this._historyIndex = this._history.length - 1;
            this._updateHistoryButtons();
        }
        _stepHistory(delta) {
            const index = this._historyIndex + delta;
            if (index < 0 || index >= this._history.length)
                return;
            this._historyIndex = index;
            const idea = this._history[index];
            this._write(idea, 0);
            this._statusText.textContent = "Idea " + (index + 1) + " of " + this._history.length + " written back (Z to undo).";
            this._updateHistoryButtons();
        }
        _updateHistoryButtons() {
            this._backButton.disabled = this._historyIndex <= 0;
            this._forwardButton.disabled = this._historyIndex >= this._history.length - 1;
            this._historyLabel.textContent = this._history.length > 0 ? (this._historyIndex + 1) + " / " + this._history.length : "";
        }
        _drawPreview(idea) {
            // Chord names above the notes.
            this._chordChips.innerHTML = "";
            const track = idea ? (idea.tracks.find(t => t.part == "lead") || idea.tracks[idea.tracks.length - 1]) : null;
            if (track && track.result.chords && track.part != "drums" && track.part != "perc") {
                const total = idea.bars;
                for (const c of track.result.chords) {
                    if (c.bar >= total)
                        break;
                    this._chordChips.appendChild(HTML.span({ class: "carrot-gen-chord", title: c.roman }, c.name));
                }
            }
            const { ctx, w, h } = CarrotUI.ctx(this._preview);
            const css = getComputedStyle(this.container);
            ctx.fillStyle = css.getPropertyValue("--cb-canvas-bg").trim() || "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            if (!idea) {
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("Your idea will appear here", w / 2, h / 2 + 4);
                return;
            }
            const barParts = this._doc.song.beatsPerBar * Config.partsPerBeat;
            const bars = idea.bars;
            const total = barParts * bars;
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            for (let b = 0; b <= bars; b++) {
                const x = b * barParts / total * w;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, 0);
                ctx.lineTo(x + 0.5, h);
                ctx.stroke();
            }
            const colors = { drums: "#ff8a65", perc: "#ffb74d", bass: "#4fc3f7", chords: "#81c784", arp: "#aed581", lead: css.getPropertyValue("--cb-plugin-color").trim() || "#c792ea", hook: "#f48fb1", counter: "#90caf9", harmony: "#ce93d8" };
            const lanes = idea.tracks.length;
            idea.tracks.forEach((t, lane) => {
                const top = lane * h / lanes, height = h / lanes;
                let lo = 1e9, hi = -1e9;
                for (const bar of t.result.bars)
                    for (const n of bar)
                        for (const p of n.pitches) {
                            lo = Math.min(lo, p);
                            hi = Math.max(hi, p);
                        }
                if (lo > hi)
                    return;
                lo -= 1;
                hi += 1;
                const rowH = Math.max(1.5, Math.min(8, (height - 4) / Math.max(1, hi - lo)));
                ctx.fillStyle = colors[t.part] || "#c792ea";
                t.result.bars.forEach((bar, b) => {
                    if (b >= bars)
                        return;
                    for (const n of bar)
                        for (const p of n.pitches) {
                            const x = (b * barParts + n.start) / total * w;
                            const x2 = (b * barParts + n.end) / total * w;
                            const y = top + height - 2 - (p - lo + 1) * rowH;
                            ctx.globalAlpha = 0.45 + 0.55 * ((n.size == undefined ? 3 : n.size) / 3);
                            ctx.fillRect(x + 1, y, Math.max(2, x2 - x - 2), Math.max(1.5, rowH - 1));
                        }
                });
                ctx.globalAlpha = 1;
                if (lanes > 1) {
                    ctx.fillStyle = "rgba(255,255,255,0.45)";
                    ctx.font = "10px sans-serif";
                    ctx.textAlign = "left";
                    ctx.fillText(t.part, 4, top + 11);
                }
            });
        }
    }
    // -------------------------------------------------------------- recorder
    const CARROT_RECORDER_PRESETS = [
        ["Raw (no effects)", []],
        ["Clean vocal", [{ type: "gate", threshold: -55 }, { type: "eq3", low: -3, mid: -1.5, midfreq: 350, high: 3 }, { type: "compressor", threshold: -20, ratio: 3, attack: 8, release: 120, makeup: 4 }, { type: "deesser", amount: 0.5 }, { type: "reverb", size: 0.45, mix: 0.12 }]],
        ["Pop vocal", [{ type: "gate", threshold: -55 }, { type: "eq3", low: -4, mid: 1.5, midfreq: 2500, high: 4 }, { type: "compressor", threshold: -22, ratio: 4, attack: 5, release: 100, makeup: 6 }, { type: "deesser", amount: 0.6 }, { type: "delay", time: 6, feedback: 0.25, mix: 0.12 }, { type: "reverb", size: 0.6, mix: 0.2 }]],
        ["Rap vocal", [{ type: "gate", threshold: -50 }, { type: "eq3", low: -3, mid: 2, midfreq: 3000, high: 3 }, { type: "compressor", threshold: -24, ratio: 6, attack: 3, release: 80, makeup: 8 }, { type: "deesser", amount: 0.55 }, { type: "distortion", mode: 0, drive: 6, mix: 0.2 }, { type: "reverb", size: 0.3, mix: 0.08 }]],
        ["Podcast / voice-over", [{ type: "gate", threshold: -50 }, { type: "eq3", low: 1.5, mid: -2, midfreq: 400, high: 2 }, { type: "compressor", threshold: -24, ratio: 3, attack: 10, release: 150, makeup: 6 }, { type: "multiband", depth: 0.3, out: 0 }, { type: "deesser", amount: 0.4 }]],
        ["Radio / telephone", [{ type: "filter", mode: 3, cutoff: 1500, res: 0.2 }, { type: "distortion", mode: 0, drive: 10, tone: 4000, mix: 0.6 }, { type: "compressor", threshold: -26, ratio: 6, makeup: 8 }]],
        ["Lo-fi", [{ type: "filter", mode: 0, cutoff: 3500, res: 0.1 }, { type: "crusher", bits: 10, rate: 2, mix: 0.5 }, { type: "lofi", crackle: 0.5, hiss: 0.3, wow: 0.4 }, { type: "reverb", size: 0.4, mix: 0.15 }]],
        ["Big hall", [{ type: "compressor", threshold: -20, ratio: 3, makeup: 3 }, { type: "delay", time: 9, feedback: 0.3, mix: 0.15 }, { type: "reverb", size: 0.92, damp: 0.4, mix: 0.4, predelay: 30 }]],
        ["Guitar amp", [{ type: "compressor", threshold: -24, ratio: 4, makeup: 4 }, { type: "distortion", mode: 2, drive: 26, tone: 5000, out: -4 }, { type: "eq3", low: 2, mid: 3, midfreq: 900, high: -2 }, { type: "reverb", size: 0.4, mix: 0.15 }]],
        ["Chorus dream", [{ type: "compressor", threshold: -20, ratio: 3, makeup: 3 }, { type: "chorus", depth: 0.7, mix: 0.5 }, { type: "delay", time: 7, feedback: 0.45, mix: 0.25 }, { type: "reverb", size: 0.8, mix: 0.3 }]],
    ];
    function carrotPresetChain(index) {
        return (CARROT_RECORDER_PRESETS[index] || CARROT_RECORDER_PRESETS[0])[1].map(slot => Object.assign(CarrotFX.defaults(slot.type), slot));
    }
    class CarrotRecorder extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("recorder", () => new CarrotRecorder(editor));
        }
        constructor(editor) {
            super(editor, { key: "recorder", title: "Audio Recorder", color: "#ff6188", width: 600 });
            this._doc = editor.doc;
            this._takes = [];
            this._take = -1;
            this._recording = false;
            this._monitoring = false;
            this._settings = { inputGain: 0, outputGain: 0, tail: 1.5, fadeIn: 5, fadeOut: 30, normalize: true, withSong: true, countIn: true, mono: true, chain: carrotPresetChain(2), preset: 2, latency: 0 };
            const st = this._settings;
            this._host = new CarrotLocalHost(editor, st, () => this._onSettingsChanged());
            // Input.
            this._deviceSelect = HTML.select({ class: "cb-select", style: "max-width: 230px;" }, HTML.option({ value: "" }, "Default microphone"));
            this._deviceSelect.addEventListener("keydown", (event) => event.stopPropagation());
            this._deviceSelect.addEventListener("change", () => {
                if (this._stream)
                    this._enableMic();
            });
            this._enableButton = CarrotUI.button("Enable microphone", () => this._enableMic(), { primary: true });
            this._meter = HTML.div({ class: "carrot-meter", style: "flex: 1; min-width: 120px;" }, HTML.div());
            this._monitorToggle = CarrotUI.toggle({ label: "Monitor", title: "Hear yourself with the effects (use headphones!)", onChange: (v) => { this._monitoring = v; } });
            this._cleanupToggle = CarrotUI.toggle({ label: "Voice cleanup", title: "Browser noise suppression & echo cancellation (good for talking, bad for music)", onChange: (v) => {
                    this._voiceCleanup = v;
                    if (this._stream)
                        this._enableMic();
                } });
            const inputSection = CarrotUI.section("Input", HTML.div({ class: "cb-row cb-center" }, this._enableButton, this._deviceSelect, this._cleanupToggle), HTML.div({ class: "cb-row cb-center", style: "margin-top: 6px;" }, this._host.knob("inputGain", { label: "Input gain", min: -24, max: 24, def: 0, unit: "dB", small: true }), this._meter, this._monitorToggle));
            // Transport.
            this._recordButton = CarrotUI.button("Record", () => this._toggleRecord(), { primary: true });
            this._recordButton.classList.add("carrot-rec-button");
            this._time = HTML.div({ class: "carrot-rec-time" }, "0:00.0");
            this._playButton = CarrotUI.button("Play take", () => this._playTake());
            this._withSongToggle = this._host.toggle("withSong", { label: "Record with song", def: true, title: "Starts the song at the current bar while recording" });
            this._countInToggle = this._host.toggle("countIn", { label: "Count-in", def: true, title: "One bar of clicks before recording starts" });
            this._takeSelect = HTML.select({ class: "cb-select" });
            this._takeSelect.addEventListener("keydown", (event) => event.stopPropagation());
            this._takeSelect.addEventListener("change", () => {
                this._take = this._takeSelect.selectedIndex;
                this._drawTake();
            });
            const deleteTake = HTML.button({ type: "button", class: "cb-mini-button", title: "Delete take" }, "Delete");
            deleteTake.addEventListener("click", () => {
                if (this._take < 0)
                    return;
                this._takes.splice(this._take, 1);
                this._take = Math.min(this._take, this._takes.length - 1);
                this._fillTakes();
            });
            const transport = CarrotUI.section("Record", HTML.div({ class: "cb-row cb-center" }, this._recordButton, this._time, this._playButton, this._withSongToggle, this._countInToggle, HTML.span({ style: "flex: 1;" }), this._takeSelect, deleteTake));
            // Waveform with trim handles.
            this._wave = CarrotUI.canvas(90);
            this._wave.style.cursor = "ew-resize";
            this._installTrim();
            // Effects.
            this._presetSelect = CarrotUI.select({ options: CARROT_RECORDER_PRESETS.map(p => p[0]), value: st.preset, onChange: (i) => {
                    st.preset = i;
                    st.chain = carrotPresetChain(i);
                    this._rack.render();
                    this._onSettingsChanged();
                } });
            this._rack = carrotFxRack(this._host, "chain", { max: 8 });
            const fxSection = CarrotUI.section("Mixing effects (applied when you preview or save)", HTML.div({ class: "cb-row cb-center", style: "margin-bottom: 6px;" }, HTML.span({ class: "cb-hint" }, "Preset:"), this._presetSelect, this._host.knob("tail", { label: "FX tail", min: 0, max: 6, def: 1.5, unit: "s", small: true }), this._host.knob("fadeIn", { label: "Fade in", min: 0, max: 500, def: 5, unit: "ms", small: true }), this._host.knob("fadeOut", { label: "Fade out", min: 0, max: 2000, def: 30, unit: "ms", small: true }), this._host.knob("outputGain", { label: "Output", min: -24, max: 12, def: 0, unit: "dB", small: true }), this._host.toggle("normalize", { label: "Normalize", def: true })), this._rack);
            // Output.
            const output = CarrotUI.section("Use it", HTML.div({ class: "cb-row" }, CarrotUI.button("Preview with FX", () => this._preview()), CarrotUI.button("Place in song", () => this._placeInSong(), { primary: true, title: "New Sampler channel, starting at the bar where you recorded" }), CarrotUI.button("Load into current instrument", () => this._loadIntoInstrument()), CarrotUI.button("Download WAV", () => this._download())), this._status = CarrotUI.hint("Enable the microphone to start. Recordings stay in this browser until you save them."));
            this.setBody(HTML.div(inputSection, transport, this._wave, fxSection, output));
            this._fillTakes();
            this.mount();
            this._drawTake();
            this._listDevices();
        }
        _onSettingsChanged() {
            this._monitorStates = null;
        }
        async _listDevices() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter(d => d.kind == "audioinput");
                const current = this._deviceSelect.value;
                this._deviceSelect.innerHTML = "";
                this._deviceSelect.appendChild(HTML.option({ value: "" }, "Default microphone"));
                inputs.forEach((d, i) => this._deviceSelect.appendChild(HTML.option({ value: d.deviceId }, d.label || "Input " + (i + 1))));
                this._deviceSelect.value = current;
            }
            catch (error) { }
        }
        async _enableMic() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this._status.textContent = "This browser can't record audio here (try Chrome, Edge or Firefox, from http://localhost or https).";
                carrotUISound("error");
                return;
            }
            this._stopMic();
            const deviceId = this._deviceSelect.value;
            const cleanup = !!this._voiceCleanup;
            try {
                this._stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: cleanup, noiseSuppression: cleanup, autoGainControl: false, channelCount: { ideal: 2 } } });
            }
            catch (error) {
                this._status.textContent = "Microphone access was blocked or unavailable: " + (error.message || error.name);
                carrotUISound("error");
                return;
            }
            const AC = window.AudioContext || window.webkitAudioContext;
            this._ctx = new AC({ latencyHint: "interactive" });
            this._source = this._ctx.createMediaStreamSource(this._stream);
            this._processor = this._ctx.createScriptProcessor(1024, 2, 2);
            this._source.connect(this._processor);
            this._processor.connect(this._ctx.destination);
            this._processor.onaudioprocess = (event) => this._process(event);
            this._enableButton.textContent = "Microphone on";
            this._status.textContent = "Ready. Sample rate " + this._ctx.sampleRate + " Hz.";
            this._settings.latency = Math.round(((this._ctx.baseLatency || 0.01) + (this._ctx.outputLatency || 0.02)) * 1000);
            this._listDevices();
        }
        _stopMic() {
            if (this._processor) {
                this._processor.onaudioprocess = null;
                this._processor.disconnect();
            }
            if (this._source)
                this._source.disconnect();
            if (this._stream)
                for (const track of this._stream.getTracks())
                    track.stop();
            if (this._ctx && this._ctx.close)
                this._ctx.close();
            this._processor = this._source = this._stream = this._ctx = null;
        }
        _process(event) {
            const input = event.inputBuffer;
            const output = event.outputBuffer;
            const gain = CarrotDSP.dbToGain(this._settings.inputGain);
            const inL = input.getChannelData(0);
            const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL;
            const n = inL.length;
            const l = new Float32Array(n), r = new Float32Array(n);
            let peak = 0;
            for (let i = 0; i < n; i++) {
                l[i] = inL[i] * gain;
                r[i] = (this._settings.mono ? inL[i] : inR[i]) * gain;
                peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
            }
            this._peak = Math.max(peak, (this._peak || 0) * 0.85);
            if (this._recording) {
                this._chunksL.push(l);
                this._chunksR.push(r);
                this._recordedFrames += n;
            }
            const outL = output.getChannelData(0), outR = output.getChannelData(1);
            if (this._monitoring) {
                const ml = l.slice(), mr = r.slice();
                if (!this._monitorStates)
                    this._monitorStates = [];
                const ctx = { sampleRate: this._ctx.sampleRate, beatPos: 0, samplesPerBeat: this._ctx.sampleRate * 60 / this._doc.song.tempo, bpm: this._doc.song.tempo, beatsPerBar: this._doc.song.beatsPerBar, playing: true };
                CarrotFX.processChain(this._monitorStates, this._settings.chain, ml, mr, 0, n, ctx);
                outL.set(ml);
                outR.set(mr);
            }
            else {
                outL.fill(0);
                outR.fill(0);
            }
            if (!this._meterQueued) {
                this._meterQueued = true;
                requestAnimationFrame(() => {
                    this._meterQueued = false;
                    this._meter.firstChild.style.width = Math.min(100, Math.sqrt(this._peak || 0) * 100) + "%";
                    if (this._recording)
                        this._time.textContent = CarrotRecorder.formatTime(this._recordedFrames / this._ctx.sampleRate);
                });
            }
        }
        static formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = seconds - m * 60;
            return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
        }
        async _toggleRecord() {
            if (this._recording || this._countingIn) {
                this._stopRecording();
                return;
            }
            if (!this._ctx) {
                await this._enableMic();
                if (!this._ctx)
                    return;
            }
            if (this._ctx.state == "suspended")
                await this._ctx.resume();
            const doc = this._doc;
            const st = this._settings;
            const startBar = doc.bar;
            const beginRecording = () => {
                this._countingIn = false;
                this._chunksL = [];
                this._chunksR = [];
                this._recordedFrames = 0;
                this._recording = true;
                this._recordStartBar = startBar;
                if (st.withSong) {
                    doc.synth.goToBar(startBar);
                    doc.synth.snapToBar();
                    if (!doc.synth.playing)
                        doc.performance.play();
                }
                this._recordButton.textContent = "Stop";
                this._recordButton.classList.add("cb-recording");
                this._status.textContent = "Recording… press Stop when you're done.";
            };
            if (st.countIn) {
                this._countingIn = true;
                this._recordButton.textContent = "Cancel";
                const beats = doc.song.beatsPerBar;
                const beatSeconds = 60 / doc.song.tempo;
                const t0 = this._ctx.currentTime + 0.05;
                for (let b = 0; b < beats; b++) {
                    const osc = this._ctx.createOscillator();
                    const env = this._ctx.createGain();
                    osc.frequency.value = b == 0 ? 1600 : 1000;
                    env.gain.setValueAtTime(0.0001, t0 + b * beatSeconds);
                    env.gain.exponentialRampToValueAtTime(0.25, t0 + b * beatSeconds + 0.003);
                    env.gain.exponentialRampToValueAtTime(0.0001, t0 + b * beatSeconds + 0.06);
                    osc.connect(env);
                    env.connect(this._ctx.destination);
                    osc.start(t0 + b * beatSeconds);
                    osc.stop(t0 + b * beatSeconds + 0.08);
                }
                this._status.textContent = "Count-in…";
                this._countInTimer = setTimeout(() => {
                    if (this._countingIn)
                        beginRecording();
                }, (0.05 + beats * beatSeconds) * 1000);
            }
            else {
                beginRecording();
            }
            carrotUISound("record");
        }
        _stopRecording() {
            clearTimeout(this._countInTimer);
            const wasRecording = this._recording;
            this._recording = false;
            this._countingIn = false;
            this._recordButton.textContent = "Record";
            this._recordButton.classList.remove("cb-recording");
            if (this._settings.withSong && this._doc.synth.playing)
                this._doc.performance.pause();
            if (!wasRecording || this._recordedFrames < 100) {
                this._status.textContent = "Nothing recorded.";
                return;
            }
            const join = (chunks) => {
                const out = new Float32Array(this._recordedFrames);
                let o = 0;
                for (const c of chunks) {
                    out.set(c, o);
                    o += c.length;
                }
                return out;
            };
            // Line the take up with the song by removing the round-trip latency.
            let L = join(this._chunksL), R = join(this._chunksR);
            const latencyFrames = this._settings.withSong ? Math.floor(this._settings.latency / 1000 * this._ctx.sampleRate) : 0;
            if (latencyFrames > 0 && latencyFrames < L.length / 2) {
                L = L.subarray(latencyFrames).slice();
                R = R.subarray(latencyFrames).slice();
            }
            this._takes.push({ L, R, rate: this._ctx.sampleRate, name: "Take " + (this._takes.length + 1), trimStart: 0, trimEnd: 1, bar: this._recordStartBar, withSong: this._settings.withSong });
            this._take = this._takes.length - 1;
            this._fillTakes();
            this._status.textContent = "Recorded " + CarrotRecorder.formatTime(L.length / this._ctx.sampleRate) + ". Drag the edges of the waveform to trim, then preview or place it in the song.";
            carrotUISound("success");
        }
        _fillTakes() {
            this._takeSelect.innerHTML = "";
            if (this._takes.length == 0)
                this._takeSelect.appendChild(HTML.option({ value: "" }, "No takes yet"));
            this._takes.forEach(t => this._takeSelect.appendChild(HTML.option({ value: t.name }, t.name + " · " + CarrotRecorder.formatTime(t.L.length / t.rate))));
            this._takeSelect.selectedIndex = Math.max(0, this._take);
            this._drawTake();
        }
        _installTrim() {
            let drag = null;
            this._wave.addEventListener("pointerdown", (event) => {
                const take = this._takes[this._take];
                if (!take)
                    return;
                const rect = this._wave.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                drag = Math.abs(x - take.trimStart) < Math.abs(x - take.trimEnd) ? "start" : "end";
                this._wave.setPointerCapture(event.pointerId);
                this._moveTrim(event, drag);
            });
            this._wave.addEventListener("pointermove", (event) => {
                if (drag)
                    this._moveTrim(event, drag);
            });
            const end = () => { drag = null; };
            this._wave.addEventListener("pointerup", end);
            this._wave.addEventListener("pointercancel", end);
        }
        _moveTrim(event, which) {
            const take = this._takes[this._take];
            const rect = this._wave.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            if (which == "start")
                take.trimStart = Math.min(x, take.trimEnd - 0.01);
            else
                take.trimEnd = Math.max(x, take.trimStart + 0.01);
            this._drawTake();
        }
        _drawTake() {
            const { ctx, w, h } = CarrotUI.ctx(this._wave);
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            const take = this._takes[this._take];
            if (!take) {
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("Your recording will appear here", w / 2, h / 2 + 4);
                return;
            }
            const data = take.L;
            const step = data.length / w;
            ctx.fillStyle = "#ff6188";
            for (let x = 0; x < w; x++) {
                let peak = 0;
                const s = Math.floor(x * step), e = Math.min(data.length, Math.floor((x + 1) * step));
                for (let i = s; i < e; i += 4)
                    peak = Math.max(peak, Math.abs(data[i]));
                const ph = Math.min(1, peak) * (h / 2 - 2);
                ctx.fillRect(x, h / 2 - ph, 1, Math.max(1, ph * 2));
            }
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(0, 0, take.trimStart * w, h);
            ctx.fillRect(take.trimEnd * w, 0, w - take.trimEnd * w, h);
            ctx.fillStyle = "#7bd88f";
            ctx.fillRect(take.trimStart * w - 1, 0, 2, h);
            ctx.fillStyle = "#ff6188";
            ctx.fillRect(take.trimEnd * w - 1, 0, 2, h);
        }
        // Applies trim, effects, fades and gain. Returns {L, R, rate}.
        _render() {
            const take = this._takes[this._take];
            if (!take)
                return null;
            const st = this._settings;
            const s = Math.floor(take.trimStart * take.L.length), e = Math.floor(take.trimEnd * take.L.length);
            const tail = Math.floor(st.tail * take.rate * (st.chain.length > 0 ? 1 : 0));
            const L = new Float32Array(e - s + tail), R = new Float32Array(e - s + tail);
            L.set(take.L.subarray(s, e));
            R.set(take.R.subarray(s, e));
            const fadeIn = Math.min(L.length, Math.floor(st.fadeIn / 1000 * take.rate));
            for (let i = 0; i < fadeIn; i++) {
                L[i] *= i / fadeIn;
                R[i] *= i / fadeIn;
            }
            CarrotFX.renderChain(st.chain, L, R, take.rate, this._doc.song.tempo);
            const dry = e - s;
            const fadeOut = Math.min(dry, Math.floor(st.fadeOut / 1000 * take.rate));
            for (let i = 0; i < fadeOut && tail == 0; i++) {
                const k = dry - 1 - i;
                L[k] *= i / fadeOut;
                R[k] *= i / fadeOut;
            }
            // Trim silent tail.
            let end = L.length;
            while (end > dry && Math.abs(L[end - 1]) < 0.0005 && Math.abs(R[end - 1]) < 0.0005)
                end--;
            const outL = L.subarray(0, end), outR = R.subarray(0, end);
            let gain = CarrotDSP.dbToGain(st.outputGain);
            if (st.normalize) {
                let peak = 0;
                for (let i = 0; i < end; i++)
                    peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
                if (peak > 0)
                    gain *= 0.89 / peak;
            }
            for (let i = 0; i < end; i++) {
                outL[i] = Math.max(-1, Math.min(1, outL[i] * gain));
                outR[i] = Math.max(-1, Math.min(1, outR[i] * gain));
            }
            return { L: outL, R: outR, rate: take.rate };
        }
        _playTake() {
            const take = this._takes[this._take];
            if (!take) {
                flToast("Record something first.");
                return;
            }
            const s = take.trimStart, e = take.trimEnd;
            FLSampleBank.previewPcm(take.L, take.rate, s, e);
        }
        _preview() {
            const result = this._render();
            if (!result) {
                flToast("Record something first.");
                return;
            }
            const mono = new Float32Array(result.L.length);
            for (let i = 0; i < mono.length; i++)
                mono[i] = (result.L[i] + result.R[i]) * 0.5;
            FLSampleBank.previewPcm(mono, result.rate);
        }
        async _toSample() {
            const result = this._render();
            if (!result) {
                flToast("Record something first.");
                return null;
            }
            const take = this._takes[this._take];
            const bytes = new Uint8Array(flEncodeWav([result.L, result.R], result.rate));
            const name = "Recording " + new Date().toLocaleTimeString().replace(/:/g, "-") + " " + take.name;
            const id = await FLSampleBank.addBytes(bytes, name + ".wav");
            return { id, name, bytes };
        }
        async _placeInSong() {
            const sample = await this._toSample();
            if (!sample)
                return;
            const doc = this._doc;
            const take = this._takes[this._take];
            const added = carrotNewChannel(doc, false);
            if (!added) {
                flToast("No room for another channel.");
                return;
            }
            doc.record(added.group);
            const channel = added.index;
            await FLActions.loadSample(doc, { id: sample.id, name: sample.name });
            const bar = take.bar != null ? take.bar : doc.bar;
            const offsetParts = Math.round(take.trimStart * take.L.length / take.rate / (60 / doc.song.tempo) * Config.partsPerBeat);
            doc.record(new ChangeFL(doc, () => {
                const instrument = doc.song.channels[channel].instruments[0];
                instrument.fl.sampler.oneShot = true;
                instrument.fl.sampler.keytrack = false;
                doc.song.channels[channel].name = "Vocal " + take.name;
            }));
            const barParts = doc.song.beatsPerBar * Config.partsPerBeat;
            const targetBar = bar + Math.floor(offsetParts / barParts);
            const start = offsetParts % barParts;
            carrotWriteNotes(doc, [[{ start, end: Math.min(barParts, start + Config.partsPerBeat), pitches: [48], size: Config.noteSizeMax }]], { channel, startBar: targetBar, replace: true, freshPatterns: true });
            flToast("Placed " + take.name + " on a new channel at bar " + (targetBar + 1) + " (it plays to the end as a one-shot)");
            carrotUISound("success");
        }
        async _loadIntoInstrument() {
            const sample = await this._toSample();
            if (!sample)
                return;
            await FLActions.loadSample(this._doc, { id: sample.id, name: sample.name });
        }
        _download() {
            const result = this._render();
            if (!result) {
                flToast("Record something first.");
                return;
            }
            const take = this._takes[this._take];
            save(new Blob([flEncodeWav([result.L, result.R], result.rate)], { type: "audio/wav" }), "CarrotBox " + take.name + ".wav");
        }
        onClose() {
            if (this._recording)
                this._stopRecording();
            this._stopMic();
        }
    }
    // --------------------------------------------------------------- routing
    // Opens CarrotBox windows by the names the menus use.
    function carrotOpen(editor, name) {
        switch (name) {
            case "flPlugins": return CarrotPluginManager.open(editor);
            case "flSettings": return CarrotSettingsPanel.open(editor);
            case "flShortcuts": return CarrotShortcutsPanel.open(editor);
            case "flKits": return CarrotKitLoader.open(editor, 0);
            case "flKits:packs": return CarrotKitLoader.open(editor, 3);
            case "flLeadGen": return CarrotGeneratorPanel.open(editor);
            case "flRecorder": return CarrotRecorder.open(editor);
            case "flHardware": return CarrotHardwarePanel.open(editor);
        }
        editor._openPrompt(name);
        return null;
    }
    // A stale history entry for one of the windows above: open it and leave.
    function flCreateExtraPrompt(editor, name) {
        if (["flPlugins", "flSettings", "flShortcuts", "flKits", "flKits:packs", "flLeadGen", "flRecorder"].indexOf(name) == -1)
            return null;
        setTimeout(() => {
            editor.doc.undo();
            carrotOpen(editor, name);
        });
        return { container: HTML.div({ class: "prompt", style: "display: none;" }), cleanUp() { }, flKeepsPlaying: true };
    }
    function flHandleExtraKey(editor, event) {
        const doc = editor.doc;
        if (event.key == "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
            CarrotLauncher.toggle(editor);
            event.preventDefault();
            return true;
        }
        if (!CarrotSettings.get("extraShortcuts") || event.ctrlKey || event.metaKey || event.altKey)
            return false;
        const shift = event.shiftKey;
        const key = event.key;
        if (shift && (key == "Backspace" || key == "Delete")) {
            flClearPattern(doc);
            event.preventDefault();
            return true;
        }
        if (shift && (key == "H" || key == "h")) {
            flHumanize(doc);
            event.preventDefault();
            return true;
        }
        if (shift && (key == "Q" || key == "q")) {
            doc.selection.forceRhythm();
            flToast("Snapped notes to the rhythm grid");
            event.preventDefault();
            return true;
        }
        if (key == "?" || (shift && key == "/")) {
            CarrotShortcutsPanel.open(editor);
            event.preventDefault();
            return true;
        }
        if (shift)
            return false;
        switch (key) {
            case "k":
                CarrotKitLoader.open(editor, 0);
                break;
            case "g":
                CarrotGeneratorPanel.open(editor);
                break;
            case ",":
                CarrotSettingsPanel.open(editor);
                break;
            case "b":
                editor.flShowBrowser(!doc.prefs.flBrowserOpen);
                break;
            case "t":
                editor._flMetronomeButton.click();
                break;
            case "e":
                carrotEditCurrent(editor);
                break;
            default:
                return false;
        }
        event.preventDefault();
        return true;
    }
    // "E": opens the most useful editor for the current instrument.
    function carrotEditCurrent(editor) {
        const doc = editor.doc;
        const instrument = flCurrentInstrument(doc);
        if (carrotOpenCurrentInstrumentPlugin(editor))
            return;
        if (instrument.type == FLConfig.typeSampler || instrument.type == FLConfig.typeSlicex) {
            editor._openPrompt("flSample");
            return;
        }
        if (instrument.fl.inserts.length > 0) {
            const plugin = CarrotPlugins.get(instrument.fl.inserts[0].id);
            if (plugin) {
                CarrotWindows.open(editor, { type: "insert", channel: doc.channel, instrument: doc.getCurrentInstrument(), index: 0 }, plugin);
                return;
            }
        }
        if (instrument.fl.fx & FLConfig.fxPEQ) {
            editor._openPrompt("flEQ:instrument");
            return;
        }
        flToast("Nothing to edit here — press Tab to load a plugin.");
    }
    // ----------------------------------------------------------- editor setup
    function carrotInitEditor(editor) {
        const doc = editor.doc;
        CarrotFLStudio.install(editor);
        carrotApplySettings();
        carrotInstallUISounds();
        // Second toolbar row: kits, plugins, recorder, generator.
        editor._carrotKitButton = flIconButton("--carrot-kit-symbol", "Drum kit / sound kit loader (K)");
        editor._carrotPluginButton = flIconButton("--carrot-plugin-symbol", "Plugins: launch (Tab) or manage");
        editor._carrotRecordButton = flIconButton("--carrot-mic-symbol", "Audio recorder with mixing effects");
        editor._carrotGenButton = flIconButton("--carrot-spark-symbol", "Melody / rhythm generator (G)");
        editor._carrotBar = HTML.div({ class: "fl-bar carrot-bar-2" }, editor._carrotKitButton, editor._carrotPluginButton, editor._carrotRecordButton, editor._carrotGenButton);
        editor._flBar.parentElement.insertBefore(editor._carrotBar, editor._flBar.nextSibling);
        editor._carrotKitButton.addEventListener("click", () => CarrotKitLoader.open(editor, 0));
        editor._carrotPluginButton.addEventListener("click", (event) => {
            if (event.shiftKey || CarrotPlugins.installedIds().length == 0)
                CarrotPluginManager.open(editor);
            else
                CarrotLauncher.toggle(editor);
        });
        editor._carrotPluginButton.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            CarrotPluginManager.open(editor);
        });
        editor._carrotRecordButton.addEventListener("click", () => CarrotRecorder.open(editor));
        editor._carrotGenButton.addEventListener("click", () => CarrotGeneratorPanel.open(editor));
        // Settings button under the menus.
        const menuArea = editor.mainLayer.querySelector(".menu-area");
        if (menuArea) {
            editor._carrotSettingsButton = HTML.button({ type: "button", class: "carrot-settings-button", title: "CarrotBox settings (,)" }, "Settings");
            editor._carrotSettingsButton.addEventListener("click", () => CarrotSettingsPanel.open(editor));
            menuArea.appendChild(editor._carrotSettingsButton);
        }
        // Esc closes the plugin launcher, then the top window, wherever the focus is.
        document.addEventListener("keydown", (event) => {
            if (event.key != "Escape" || event.defaultPrevented || editor.prompt)
                return;
            if (CarrotLauncher.isOpen()) {
                CarrotLauncher._current.close();
                event.preventDefault();
            }
            else if (event.shiftKey && CarrotWindows.count() > 0) {
                CarrotWindows.closeAll();
                event.preventDefault();
            }
            else if (CarrotWindows.closeTop())
                event.preventDefault();
        });
        // Ask before leaving with unsaved edits (optional).
        doc.flDirty = false;
        const recordChange = doc.record.bind(doc);
        doc.record = (change, replace, newSong) => {
            if (!change.isNoop())
                doc.flDirty = true;
            return recordChange(change, replace, newSong);
        };
        window.addEventListener("carrot-saved", () => { doc.flDirty = false; });
        window.addEventListener("beforeunload", (event) => {
            if (CarrotSettings.get("confirmLeave") && doc.flDirty) {
                event.preventDefault();
                event.returnValue = "";
            }
        });
        // Drop a song (.json project or .mid) anywhere on the page to open it.
        window.addEventListener("dragover", (event) => {
            if (flDragHasFiles(event))
                event.preventDefault();
        });
        window.addEventListener("drop", (event) => {
            if (event.defaultPrevented || !flDragHasFiles(event))
                return;
            const file = Array.from(event.dataTransfer.files || []).find(f => /\.(json|mid|midi)$/i.test(f.name));
            if (!file)
                return;
            event.preventDefault();
            if (doc.flDirty && !window.confirm("Open " + file.name + "? Your current song has changes that haven't been saved."))
                return;
            const reader = new FileReader();
            if (/\.json$/i.test(file.name)) {
                reader.onload = () => {
                    doc.goBackToStart();
                    doc.record(new ChangeSong(doc, reader.result), true, true);
                    doc.flDirty = false;
                    flToast("Opened " + file.name);
                };
                reader.readAsText(file);
            }
            else {
                reader.onload = () => {
                    doc.goBackToStart();
                    new ImportPrompt(doc)._parseMidiFile(reader.result);
                    flToast("Opened " + file.name);
                };
                reader.readAsArrayBuffer(file);
            }
        });
        // Plugins.
        CarrotPlugins.onChange(() => {
            doc.notifier.changed();
            doc.notifier.enqueueTaskToNotifyWatchers();
        });
        CarrotPlugins.loadInstalled();
        // First-run welcome.
        if (!CarrotSettings.get("welcomeSeen")) {
            CarrotSettings.set("welcomeSeen", true);
            setTimeout(() => flToast("Welcome to CarrotBox! Press Tab for plugins, ? for shortcuts, Settings for options.", 6000), 800);
        }
    }
    function flEditorUpdateExtras(editor) {
        const doc = editor.doc;
        const title = (CarrotSettings.get("playingTitle") && doc.synth.playing ? "Playing - " : "") + "CarrotBox";
        if (document.title != title)
            document.title = title;
        const missing = CarrotPlugins.missingForSong(doc.song).filter(id => !CarrotPlugins.isInstalled(id) || !CarrotPlugins._loading.has(id));
        if (missing.length > 0) {
            const names = missing.map(id => (CarrotPlugins.info(id) || { name: id }).name);
            editor._flMissingSamples.style.display = "block";
            editor._flMissingSamples.textContent = "This song uses " + names.join(", ") + " — click to install";
            editor._flMissingSamples.onclick = (event) => {
                event.stopPropagation();
                CarrotPluginManager.open(editor);
            };
        }
        else {
            editor._flMissingSamples.onclick = null;
        }
    }
