    // ======================================================================
    // CarrotBox: plugin UI kit, floating plugin windows, the Tab launcher
    // and the plugin manager.
    // ======================================================================
    document.head.appendChild(HTML.style({ type: "text/css" }, `
.cb-window {
	position: fixed;
	z-index: 40;
	display: flex;
	flex-direction: column;
	max-height: calc(100vh - 16px);
	max-width: calc(100vw - 16px);
	background: ${ColorConfig.editorBackground};
	color: ${ColorConfig.primaryText};
	border: 1px solid var(--cb-plugin-color, ${ColorConfig.uiWidgetFocus});
	border-radius: 8px;
	box-shadow: 0 10px 40px rgba(0,0,0,0.55);
	font-size: 12px;
	overflow: hidden;
	user-select: none;
	-webkit-user-select: none;
}
.cb-window.cb-focused { z-index: 41; }
.cb-window.cb-modal { position: relative; max-height: 84vh; z-index: auto; }
.cb-modal-overlay { z-index: 60; padding-top: 6vh; }
.cb-window .cb-window-body h3 { margin: 0 0 6px; font-size: 14px; }
.beepboxEditor .fl-wide-button { width: 100%; }
.cb-window-title {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 6px 4px 8px;
	background: linear-gradient(90deg, var(--cb-plugin-color, ${ColorConfig.uiWidgetBackground}) 0%, ${ColorConfig.uiWidgetBackground} 70%);
	color: ${ColorConfig.primaryText};
	cursor: move;
	flex-shrink: 0;
}
.cb-window-title .cb-window-name { font-weight: bold; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.cb-window-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 3px; box-sizing: border-box; border-radius: 5px; background: rgba(0,0,0,0.38); font-size: 10px; font-weight: bold; letter-spacing: 0.02em; }
.cb-window-title .cb-window-target { opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.cb-window-title select { height: 22px; font-size: 11px; max-width: 150px; }
.cb-window-title button, .cb-mini-button {
	height: 22px;
	min-width: 22px;
	padding: 0 6px;
	border: none;
	border-radius: 4px;
	background: ${ColorConfig.editorBackground};
	color: ${ColorConfig.primaryText};
	cursor: pointer;
	font-size: 12px;
	line-height: 22px;
}
.cb-window-title button:hover, .cb-mini-button:hover { background: ${ColorConfig.uiWidgetFocus}; }
.cb-window-body { overflow: auto; padding: 8px; flex: 1; min-height: 0; }
.cb-window.cb-collapsed .cb-window-body, .cb-window.cb-collapsed .cb-keys { display: none; }
.cb-keys {
	position: relative;
	height: 34px;
	flex-shrink: 0;
	border-top: 1px solid ${ColorConfig.uiWidgetBackground};
	background: #111;
	touch-action: none;
}
.cb-keys div { position: absolute; top: 0; box-sizing: border-box; border-radius: 0 0 3px 3px; }
.cb-keys .cb-white { height: 100%; background: #e8e8e8; border: 1px solid #555; }
.cb-keys .cb-black { height: 60%; background: #222; border: 1px solid #000; z-index: 1; }
.cb-keys .cb-down { background: var(--cb-plugin-color, ${ColorConfig.loopAccent}) !important; }
.cb-keys .cb-root::after { content: ""; position: absolute; bottom: 3px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 2px; background: #888; }
.cb-section {
	border: 1px solid ${ColorConfig.uiWidgetBackground};
	border-radius: 6px;
	padding: 4px 6px 6px;
	margin: 0 0 6px 0;
	background: rgba(127,127,127,0.04);
}
.cb-section-title {
	font-size: 10px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: ${ColorConfig.secondaryText};
	margin-bottom: 3px;
	display: flex;
	align-items: center;
	gap: 6px;
}
.cb-section-title .cb-grow { flex: 1; }
.cb-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 6px; }
.cb-row.cb-center { align-items: center; }
.cb-cols { display: grid; gap: 6px; }
.cb-knob {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 52px;
	cursor: ns-resize;
	outline: none;
	touch-action: none;
}
.cb-knob svg { width: 34px; height: 34px; overflow: visible; }
.cb-knob .cb-track { stroke: ${ColorConfig.uiWidgetBackground}; }
.cb-knob .cb-arc { stroke: var(--cb-plugin-color, ${ColorConfig.loopAccent}); }
.cb-knob .cb-dot { fill: ${ColorConfig.primaryText}; }
.cb-knob:focus .cb-track { stroke: ${ColorConfig.uiWidgetFocus}; }
.cb-knob-label { font-size: 10px; color: ${ColorConfig.secondaryText}; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
.cb-knob-value { font-size: 10px; color: ${ColorConfig.primaryText}; white-space: nowrap; min-height: 12px; }
.cb-knob.cb-small { width: 42px; }
.cb-knob.cb-small svg { width: 26px; height: 26px; }
.cb-field { display: flex; flex-direction: column; gap: 1px; font-size: 10px; color: ${ColorConfig.secondaryText}; }
.cb-field select, .cb-select {
	height: 22px;
	font-size: 11px;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	border: none;
	border-radius: 4px;
	padding: 0 4px;
}
.cb-toggle {
	height: 22px;
	padding: 0 8px;
	border: none;
	border-radius: 4px;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.secondaryText};
	cursor: pointer;
	font-size: 11px;
}
.cb-toggle.cb-on { background: var(--cb-plugin-color, ${ColorConfig.loopAccent}); color: #111; }
.cb-button {
	height: 24px;
	padding: 0 10px;
	border: none;
	border-radius: 4px;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	cursor: pointer;
	font-size: 12px;
	white-space: nowrap;
}
.cb-button:hover { background: ${ColorConfig.uiWidgetFocus}; }
.cb-button.cb-primary { background: var(--cb-plugin-color, ${ColorConfig.loopAccent}); color: #111; font-weight: bold; }
.cb-button:disabled { opacity: 0.5; cursor: default; }
.cb-tabs { display: flex; gap: 2px; margin-bottom: 6px; border-bottom: 1px solid ${ColorConfig.uiWidgetBackground}; }
.cb-tab {
	padding: 4px 10px;
	border: none;
	border-radius: 5px 5px 0 0;
	background: transparent;
	color: ${ColorConfig.secondaryText};
	cursor: pointer;
	font-size: 12px;
}
.cb-tab.cb-on { background: ${ColorConfig.uiWidgetBackground}; color: ${ColorConfig.primaryText}; }
.cb-canvas { display: block; width: 100%; border-radius: 5px; background: #0b0d12; }
.cb-hint { font-size: 11px; color: ${ColorConfig.secondaryText}; line-height: 1.35; }
.cb-fx-slot {
	display: flex;
	flex-direction: column;
	border: 1px solid ${ColorConfig.uiWidgetBackground};
	border-radius: 6px;
	padding: 4px 6px 6px;
	margin-bottom: 5px;
}
.cb-fx-slot.cb-off { opacity: 0.55; }
.cb-fx-head { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
.cb-fx-head .cb-fx-name { font-weight: bold; flex: 1; }
/* ---------------------------------------------------------------- launcher */
.cb-overlay {
	position: fixed;
	inset: 0;
	z-index: 60;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 9vh;
	background: rgba(0,0,0,0.35);
}
.cb-window-body input[type=number] {
	height: 22px;
	padding: 0 4px;
	border: 1px solid transparent;
	border-radius: 4px;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	font: inherit;
	font-size: 12px;
}
.cb-window-body input[type=number]:focus { outline: none; border-color: ${ColorConfig.uiWidgetFocus}; }
.cb-ask {
	width: min(380px, calc(100vw - 32px));
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px 14px;
	background: ${ColorConfig.editorBackground};
	color: ${ColorConfig.primaryText};
	border: 1px solid ${ColorConfig.uiWidgetFocus};
	border-radius: 10px;
	box-shadow: 0 18px 60px rgba(0,0,0,0.6);
}
.cb-ask-title { font-weight: bold; font-size: 15px; }
.cb-ask input {
	height: 30px;
	padding: 0 8px;
	font-size: 14px;
	border-radius: 6px;
	border: none;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	outline: 1px solid transparent;
}
.cb-ask input:focus { outline-color: ${ColorConfig.uiWidgetFocus}; }
.cb-ask-buttons { display: flex; justify-content: flex-end; gap: 6px; }
.cb-launcher {
	width: min(560px, calc(100vw - 32px));
	max-height: 76vh;
	display: flex;
	flex-direction: column;
	background: ${ColorConfig.editorBackground};
	color: ${ColorConfig.primaryText};
	border: 1px solid ${ColorConfig.uiWidgetFocus};
	border-radius: 10px;
	box-shadow: 0 18px 60px rgba(0,0,0,0.6);
	overflow: hidden;
}
.cb-launcher input {
	margin: 10px;
	height: 32px;
	padding: 0 10px;
	font-size: 15px;
	border-radius: 6px;
	border: none;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	outline: none;
}
.cb-launcher-list { overflow-y: auto; padding: 0 6px 6px; }
.cb-launcher-group { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: ${ColorConfig.secondaryText}; margin: 8px 6px 3px; }
.cb-launcher-item {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 8px;
	border-radius: 6px;
	cursor: pointer;
}
.cb-launcher-item.cb-selected { background: ${ColorConfig.uiWidgetBackground}; }
.cb-launcher-icon { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: #111; flex-shrink: 0; }
.cb-launcher-text { flex: 1; min-width: 0; }
.cb-launcher-text b { display: block; }
.cb-launcher-text span { display: block; font-size: 11px; color: ${ColorConfig.secondaryText}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: ${ColorConfig.uiWidgetBackground}; color: ${ColorConfig.secondaryText}; white-space: nowrap; }
.cb-launcher-foot { padding: 6px 12px; font-size: 11px; color: ${ColorConfig.secondaryText}; border-top: 1px solid ${ColorConfig.uiWidgetBackground}; display: flex; gap: 12px; flex-wrap: wrap; }
.cb-launcher-foot a { color: ${ColorConfig.linkAccent}; cursor: pointer; }
/* ---------------------------------------------------------------- manager */
.cb-manager-list { display: flex; flex-direction: column; gap: 6px; max-height: 58vh; overflow-y: auto; padding-right: 4px; }
.cb-manager-card { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 8px; background: rgba(127,127,127,0.07); }
.cb-manager-card .cb-launcher-icon { width: 40px; height: 40px; font-size: 15px; border-radius: 9px; }
.cb-manager-card p { margin: 2px 0 0; font-size: 11px; color: ${ColorConfig.secondaryText}; line-height: 1.3; }
.cb-manager-actions { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
.cb-status { font-size: 10px; text-align: center; }
.cb-inserts { display: flex; flex-direction: column; gap: 3px; margin: 2px 0 4px; }
.cb-insert-row { display: flex; align-items: center; gap: 4px; }
.cb-insert-row .cb-button { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
`));
    // ------------------------------------------------------------------ format
    function carrotFormatValue(spec, value) {
        if (spec.format)
            return spec.format(value);
        const unit = spec.unit || "";
        if (unit == "Hz") {
            return value >= 1000 ? (value / 1000).toFixed(value >= 10000 ? 1 : 2) + "k" : Math.round(value) + "Hz";
        }
        if (unit == "s") {
            return value < 1 ? Math.round(value * 1000) + "ms" : value.toFixed(2) + "s";
        }
        const abs = Math.abs(value);
        const digits = spec.step >= 1 ? 0 : abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
        return (unit == "dB" && value > 0 ? "+" : "") + value.toFixed(digits) + unit;
    }
    // Typing an exact value into a knob: understands what the knob displays (percentages, "1.2k",
    // "250ms") so typing 90 on a knob that shows "90%" means 90%, not 90 times full scale.
    function carrotLeadingNumber(text) {
        const match = /^\s*([+-]?(?:\d+[.,]?\d*|[.,]\d+))/.exec(String(text));
        return match ? parseFloat(match[1].replace(",", ".")) : NaN;
    }
    function carrotParseTyped(spec, text, current) {
        const match = /^\s*([+-]?(?:\d+[.,]?\d*|[.,]\d+))\s*([a-zA-Z%]*)/.exec(String(text));
        if (!match)
            return NaN;
        const x = parseFloat(match[1].replace(",", "."));
        const suffix = match[2].toLowerCase();
        const unit = spec.unit || "";
        if (!spec.format) {
            if (unit == "Hz")
                return suffix == "k" || suffix == "khz" ? x * 1000 : x;
            if (unit == "s")
                return suffix == "ms" ? x / 1000 : suffix == "s" ? x : (current < 1 ? x / 1000 : x);
            return x;
        }
        // A custom display format: if what it shows is a straight line through the knob's range,
        // convert the typed number back through that line.
        const shown = (raw) => carrotLeadingNumber(spec.format(raw));
        const lo = spec.min, hi = spec.max, mid = (lo + hi) / 2, quarter = lo + (hi - lo) * 0.25;
        const shownLo = shown(lo), shownHi = shown(hi), shownMid = shown(mid), shownQuarter = shown(quarter);
        if ([shownLo, shownHi, shownMid, shownQuarter].every(Number.isFinite) && shownHi != shownLo) {
            const tolerance = Math.abs(shownHi - shownLo) * 0.02 + 1e-9;
            const line = (raw) => shownLo + (raw - lo) * (shownHi - shownLo) / (hi - lo);
            if (Math.abs(line(mid) - shownMid) <= tolerance && Math.abs(line(quarter) - shownQuarter) <= tolerance)
                return lo + (x - shownLo) * (hi - lo) / (shownHi - shownLo);
        }
        return x;
    }
    function carrotToNorm(spec, value) {
        if (spec.curve == "exp" && spec.min > 0)
            return CarrotDSP.expUnmap(value, spec.min, spec.max);
        return (value - spec.min) / (spec.max - spec.min);
    }
    function carrotFromNorm(spec, norm) {
        norm = Math.max(0, Math.min(1, norm));
        let value = (spec.curve == "exp" && spec.min > 0) ? CarrotDSP.expMap(norm, spec.min, spec.max) : spec.min + (spec.max - spec.min) * norm;
        if (spec.step)
            value = Math.round(value / spec.step) * spec.step;
        return Math.max(spec.min, Math.min(spec.max, value));
    }
    // ---------------------------------------------------------------- CarrotUI
    class CarrotUI {
        static knob(spec) {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("viewBox", "-20 -20 40 40");
            const track = document.createElementNS(svgNS, "path");
            const arc = document.createElementNS(svgNS, "path");
            const dot = document.createElementNS(svgNS, "circle");
            for (const p of [track, arc]) {
                p.setAttribute("fill", "none");
                p.setAttribute("stroke-width", "4");
                p.setAttribute("stroke-linecap", "round");
            }
            track.setAttribute("class", "cb-track");
            arc.setAttribute("class", "cb-arc");
            dot.setAttribute("class", "cb-dot");
            dot.setAttribute("r", "2.6");
            svg.append(track, arc, dot);
            const label = HTML.div({ class: "cb-knob-label" }, spec.label || "");
            const readout = HTML.div({ class: "cb-knob-value" });
            const el = HTML.div({ class: "cb-knob" + (spec.small ? " cb-small" : ""), tabindex: "0", title: "" }, svg, label, readout);
            const R = 15;
            const point = (deg) => {
                const rad = deg * Math.PI / 180;
                return [R * Math.sin(rad), -R * Math.cos(rad)];
            };
            const arcPath = (a0, a1) => {
                if (Math.abs(a1 - a0) < 0.01)
                    return "";
                const [x0, y0] = point(Math.min(a0, a1));
                const [x1, y1] = point(Math.max(a0, a1));
                const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
                return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
            };
            track.setAttribute("d", arcPath(-135, 135));
            const bipolar = spec.min < 0 && spec.max > 0;
            const zeroAngle = bipolar ? -135 + 270 * carrotToNorm(spec, 0) : -135;
            let value = spec.value != undefined ? spec.value : (spec.def != undefined ? spec.def : spec.min);
            const baseTitle = (spec.title || spec.label || "") + " - drag up/down (Shift = fine), wheel, double-click resets, right-click types a value";
            const draw = () => {
                const norm = carrotToNorm(spec, value);
                const angle = -135 + 270 * Math.max(0, Math.min(1, norm));
                arc.setAttribute("d", arcPath(zeroAngle, angle));
                const [x, y] = point(angle);
                dot.setAttribute("cx", (x * 0.62).toFixed(2));
                dot.setAttribute("cy", (y * 0.62).toFixed(2));
                readout.textContent = carrotFormatValue(spec, value);
                el.title = (spec.label ? spec.label + ": " : "") + readout.textContent + "  |  " + baseTitle;
            };
            el.setValue = (v) => {
                if (typeof v == "number" && Number.isFinite(v) && v != value) {
                    value = v;
                    draw();
                }
            };
            el.getValue = () => value;
            const emit = (v, final) => {
                if (v == value && !final)
                    return;
                value = v;
                draw();
                if (spec.onInput)
                    spec.onInput(v);
                if (final && spec.onChange)
                    spec.onChange(v);
            };
            let dragging = null;
            el.addEventListener("pointerdown", (event) => {
                if (event.button != 0)
                    return;
                el.focus();
                el.setPointerCapture(event.pointerId);
                dragging = { y: event.clientY, norm: carrotToNorm(spec, value) };
                event.preventDefault();
            });
            el.addEventListener("pointermove", (event) => {
                if (!dragging)
                    return;
                const range = event.shiftKey ? 900 : 180;
                const norm = dragging.norm + (dragging.y - event.clientY) / range;
                if (event.shiftKey != dragging.shift) {
                    dragging.shift = event.shiftKey;
                    dragging.y = event.clientY;
                    dragging.norm = carrotToNorm(spec, value);
                    return;
                }
                emit(carrotFromNorm(spec, norm), false);
            });
            const end = () => {
                if (dragging) {
                    dragging = null;
                    if (spec.onChange)
                        spec.onChange(value);
                }
            };
            el.addEventListener("pointerup", end);
            el.addEventListener("pointercancel", end);
            el.addEventListener("dblclick", () => {
                if (spec.def != undefined)
                    emit(spec.def, true);
            });
            // Right-click: type an exact value.
            el.addEventListener("contextmenu", (event) => {
                event.preventDefault();
                const shownNow = carrotFormatValue(spec, value);
                const parseable = Number.isFinite(carrotLeadingNumber(shownNow));
                CarrotUI.ask({ title: spec.label || "Value", label: parseable ? "Type a value from " + carrotFormatValue(spec, spec.min) + " to " + carrotFormatValue(spec, spec.max) : "Type a number from " + spec.min + " to " + spec.max, value: parseable ? shownNow : String(Math.round(value * 1000) / 1000), okLabel: "Set", maxLength: 24 }).then((text) => {
                    if (text == null)
                        return;
                    const typed = carrotParseTyped(spec, text, value);
                    if (Number.isFinite(typed)) {
                        let v = Math.max(spec.min, Math.min(spec.max, typed));
                        if (spec.step)
                            v = Math.round(v / spec.step) * spec.step;
                        emit(v, true);
                    }
                    else {
                        flToast("That isn't a number");
                    }
                });
            });
            el.addEventListener("wheel", (event) => {
                event.preventDefault();
                const delta = (event.deltaY < 0 ? 1 : -1) * (event.shiftKey ? 0.004 : 0.02);
                emit(carrotFromNorm(spec, carrotToNorm(spec, value) + delta), true);
            }, { passive: false });
            el.addEventListener("keydown", (event) => {
                let delta = 0;
                if (event.key == "ArrowUp" || event.key == "ArrowRight")
                    delta = 0.02;
                if (event.key == "ArrowDown" || event.key == "ArrowLeft")
                    delta = -0.02;
                if (delta != 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    emit(carrotFromNorm(spec, carrotToNorm(spec, value) + delta * (event.shiftKey ? 0.2 : 1)), true);
                }
            });
            draw();
            return el;
        }
        static select(spec) {
            const menu = HTML.select({ class: "cb-select", title: spec.title || spec.label || "" });
            spec.options.forEach((option, index) => menu.appendChild(HTML.option({ value: index }, option)));
            menu.selectedIndex = spec.value | 0;
            menu.addEventListener("change", () => {
                if (spec.onChange)
                    spec.onChange(menu.selectedIndex);
            });
            menu.addEventListener("keydown", (event) => event.stopPropagation());
            const el = spec.label ? HTML.label({ class: "cb-field" }, spec.label, menu) : menu;
            el.setValue = (v) => {
                if (menu.selectedIndex != (v | 0))
                    menu.selectedIndex = v | 0;
            };
            el.getValue = () => menu.selectedIndex;
            el.menu = menu;
            return el;
        }
        static toggle(spec) {
            const el = HTML.button({ type: "button", class: "cb-toggle", title: spec.title || "" }, spec.label);
            let value = !!spec.value;
            const draw = () => el.classList.toggle("cb-on", value);
            el.addEventListener("click", () => {
                value = !value;
                draw();
                if (spec.onChange)
                    spec.onChange(value);
            });
            el.setValue = (v) => {
                value = !!v;
                draw();
            };
            draw();
            return el;
        }
        static button(label, onClick, options = {}) {
            const el = HTML.button({ type: "button", class: "cb-button" + (options.primary ? " cb-primary" : ""), title: options.title || "" }, label);
            el.addEventListener("click", onClick);
            return el;
        }
        // A small in-page replacement for window.prompt (which freezes the page, and with it the audio,
        // while it is open). Resolves with the text, or null when cancelled.
        //   options: title, label, hint, value, okLabel, maxLength, readOnly (just show text to copy)
        static ask(options = {}) {
            return new Promise((resolve) => {
                const previous = document.activeElement;
                let finished = false;
                const input = HTML.input({ type: "text", value: options.value == undefined ? "" : String(options.value), maxlength: String(options.maxLength || 4000), spellcheck: "false", autocomplete: "off" });
                if (options.readOnly)
                    input.readOnly = true;
                const finish = (result) => {
                    if (finished)
                        return;
                    finished = true;
                    overlay.remove();
                    try {
                        if (previous && previous.focus && document.contains(previous))
                            previous.focus({ preventScroll: true });
                    }
                    catch (error) { }
                    resolve(result);
                };
                const cancel = CarrotUI.button(options.readOnly ? "Close" : "Cancel", () => finish(null));
                const ok = CarrotUI.button(options.okLabel || "OK", () => finish(input.value), { primary: true });
                const children = [HTML.div({ class: "cb-ask-title" }, options.title || "Enter a value")];
                if (options.label)
                    children.push(HTML.div({ class: "cb-hint" }, options.label));
                children.push(input);
                if (options.hint)
                    children.push(HTML.div({ class: "cb-hint" }, options.hint));
                children.push(HTML.div({ class: "cb-ask-buttons" }, options.readOnly ? ok : cancel, options.readOnly ? "" : ok));
                const card = HTML.div({ class: "cb-ask", role: "dialog", "aria-modal": "true" }, ...children);
                const overlay = HTML.div({ class: "cb-overlay cb-ask-overlay", style: "z-index: 95;" }, card);
                // Typing here must never reach the editor's shortcuts.
                for (const type of ["keydown", "keyup", "keypress"])
                    card.addEventListener(type, (event) => event.stopPropagation());
                card.addEventListener("keydown", (event) => {
                    if (event.key == "Enter") {
                        event.preventDefault();
                        finish(options.readOnly ? null : input.value);
                    }
                    else if (event.key == "Escape") {
                        event.preventDefault();
                        finish(null);
                    }
                });
                overlay.addEventListener("pointerdown", (event) => {
                    if (event.target == overlay)
                        finish(null);
                });
                document.body.appendChild(overlay);
                input.focus();
                input.select();
            });
        }
        static section(title, ...children) {
            const header = HTML.div({ class: "cb-section-title" }, title);
            const el = HTML.div({ class: "cb-section" }, header, ...children);
            el.header = header;
            return el;
        }
        static row(...children) {
            return HTML.div({ class: "cb-row" }, ...children);
        }
        static cols(count, ...children) {
            return HTML.div({ class: "cb-cols", style: `grid-template-columns: repeat(${count}, minmax(0, 1fr));` }, ...children);
        }
        static hint(text) {
            return HTML.div({ class: "cb-hint" }, text);
        }
        // tabs: [[name, element], ...]
        static tabs(tabs, onSwitch = null) {
            const bar = HTML.div({ class: "cb-tabs" });
            const body = HTML.div();
            const buttons = [];
            const show = (index) => {
                tabs.forEach((tab, i) => {
                    tab[1].style.display = i == index ? "" : "none";
                    buttons[i].classList.toggle("cb-on", i == index);
                });
                el.current = index;
                if (onSwitch)
                    onSwitch(index);
            };
            tabs.forEach((tab, i) => {
                const b = HTML.button({ type: "button", class: "cb-tab" }, tab[0]);
                b.addEventListener("click", () => show(i));
                buttons.push(b);
                bar.appendChild(b);
                body.appendChild(tab[1]);
            });
            const el = HTML.div(bar, body);
            el.show = show;
            show(0);
            return el;
        }
        static canvas(height, width = null) {
            const c = HTML.canvas({ class: "cb-canvas", style: `height: ${height}px;` + (width ? ` width: ${width}px;` : "") });
            return c;
        }
        // Prepares a canvas for drawing at its CSS size.
        static ctx(canvas) {
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(10, rect.width || parseFloat(canvas.style.width) || 300);
            const h = Math.max(10, rect.height || parseFloat(canvas.style.height) || 100);
            const ctx = flSetupCanvas(canvas, w, h);
            ctx.clearRect(0, 0, w, h);
            return { ctx, w, h };
        }
        // A draggable ADSR graph. spec: {value: {a,d,s,r}, color, height, maxA, maxD, maxR, onInput(value), onChange(value), label}
        static envelope(spec) {
            const canvas = HTML.canvas({ class: "cb-canvas cb-env", style: `height: ${spec.height || 64}px; cursor: crosshair; touch-action: none;`, title: (spec.label ? spec.label + ": " : "") + "drag the handles - attack, decay/sustain and release. Double-click to reset." });
            const ranges = { a: [0.001, spec.maxA || 4], d: [0.005, spec.maxD || 5], r: [0.005, spec.maxR || 8] };
            const defaults = { a: 0.01, d: 0.3, s: 0.7, r: 0.3 };
            let value = Object.assign({}, defaults, spec.value);
            const state = { drag: null };
            const geometry = (w, h) => {
                const pad = 7;
                const segW = (w - pad * 2) * 0.27;
                const sustainW = (w - pad * 2) * 0.19;
                const x0 = pad;
                const x1 = x0 + CarrotDSP.expUnmap(value.a, ranges.a[0], ranges.a[1]) * segW;
                const x2 = x1 + CarrotDSP.expUnmap(value.d, ranges.d[0], ranges.d[1]) * segW;
                const x3 = x2 + sustainW;
                const x4 = x3 + CarrotDSP.expUnmap(value.r, ranges.r[0], ranges.r[1]) * segW;
                const yTop = pad + 8, yBase = h - pad;
                const ySus = yBase - Math.max(0, Math.min(1, value.s)) * (yBase - yTop);
                return { pad, segW, x0, x1, x2, x3, x4, yTop, yBase, ySus };
            };
            const fmtTime = (t) => t < 1 ? Math.round(t * 1000) + "ms" : t.toFixed(2) + "s";
            const draw = () => {
                const { ctx, w, h } = CarrotUI.ctx(canvas);
                const g = geometry(w, h);
                const color = spec.color || getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#ff9b21";
                ctx.fillStyle = "#0b0d12";
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = "rgba(255,255,255,0.06)";
                ctx.lineWidth = 1;
                for (let i = 1; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(g.pad, g.yTop + (g.yBase - g.yTop) * i / 4 + 0.5);
                    ctx.lineTo(w - g.pad, g.yTop + (g.yBase - g.yTop) * i / 4 + 0.5);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.moveTo(g.x0, g.yBase);
                ctx.lineTo(g.x1, g.yTop);
                ctx.quadraticCurveTo(g.x1 + (g.x2 - g.x1) * 0.18, g.ySus, g.x2, g.ySus);
                ctx.lineTo(g.x3, g.ySus);
                ctx.quadraticCurveTo(g.x3 + (g.x4 - g.x3) * 0.18, g.yBase, g.x4, g.yBase);
                ctx.lineTo(g.x4, g.yBase);
                ctx.save();
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = color;
                ctx.lineTo(g.x0, g.yBase);
                ctx.fill();
                ctx.restore();
                ctx.beginPath();
                ctx.moveTo(g.x0, g.yBase);
                ctx.lineTo(g.x1, g.yTop);
                ctx.quadraticCurveTo(g.x1 + (g.x2 - g.x1) * 0.18, g.ySus, g.x2, g.ySus);
                ctx.lineTo(g.x3, g.ySus);
                ctx.quadraticCurveTo(g.x3 + (g.x4 - g.x3) * 0.18, g.yBase, g.x4, g.yBase);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.stroke();
                for (const [x, y, id] of [[g.x1, g.yTop, "a"], [g.x2, g.ySus, "ds"], [g.x4, g.yBase, "r"]]) {
                    ctx.beginPath();
                    ctx.arc(x, y, state.drag == id ? 5.5 : 4, 0, Math.PI * 2);
                    ctx.fillStyle = state.drag == id ? "#fff" : color;
                    ctx.fill();
                }
                ctx.fillStyle = "rgba(255,255,255,0.55)";
                ctx.font = "10px sans-serif";
                ctx.textBaseline = "top";
                ctx.textAlign = "left";
                ctx.fillText("A " + fmtTime(value.a) + "  D " + fmtTime(value.d) + "  S " + Math.round(value.s * 100) + "%  R " + fmtTime(value.r), g.pad, 2);
            };
            const emit = (final) => {
                draw();
                if (spec.onInput)
                    spec.onInput(Object.assign({}, value));
                if (final && spec.onChange)
                    spec.onChange(Object.assign({}, value));
            };
            const pointerValue = (event) => {
                const rect = canvas.getBoundingClientRect();
                return { x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width, h: rect.height };
            };
            canvas.addEventListener("pointerdown", (event) => {
                if (event.button != 0)
                    return;
                const p = pointerValue(event);
                const g = geometry(p.w, p.h);
                const handles = [[g.x1, g.yTop, "a"], [g.x2, g.ySus, "ds"], [g.x4, g.yBase, "r"]];
                let best = null, bestDistance = 1e9;
                for (const [x, y, id] of handles) {
                    const d = Math.hypot(x - p.x, y - p.y);
                    if (d < bestDistance) {
                        bestDistance = d;
                        best = id;
                    }
                }
                state.drag = best;
                canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
                draw();
            });
            canvas.addEventListener("pointermove", (event) => {
                if (!state.drag)
                    return;
                const p = pointerValue(event);
                const g = geometry(p.w, p.h);
                const unit = (x, from) => Math.max(0, Math.min(1, (x - from) / g.segW));
                if (state.drag == "a")
                    value.a = CarrotDSP.expMap(unit(p.x, g.x0), ranges.a[0], ranges.a[1]);
                else if (state.drag == "ds") {
                    value.d = CarrotDSP.expMap(unit(p.x, g.x1), ranges.d[0], ranges.d[1]);
                    value.s = Math.max(0, Math.min(1, (g.yBase - p.y) / (g.yBase - g.yTop)));
                }
                else
                    value.r = CarrotDSP.expMap(unit(p.x, g.x3), ranges.r[0], ranges.r[1]);
                emit(false);
            });
            const end = () => {
                if (!state.drag)
                    return;
                state.drag = null;
                emit(true);
            };
            canvas.addEventListener("pointerup", end);
            canvas.addEventListener("pointercancel", end);
            canvas.addEventListener("dblclick", () => {
                value = Object.assign({}, spec.reset || defaults);
                emit(true);
            });
            canvas.setValue = (v) => {
                if (!v || state.drag)
                    return;
                const next = Object.assign({}, defaults, v);
                if (next.a != value.a || next.d != value.d || next.s != value.s || next.r != value.r || !canvas._drawn) {
                    value = next;
                    canvas._drawn = canvas.isConnected;
                    draw();
                }
            };
            canvas.redraw = draw;
            requestAnimationFrame(() => { canvas._drawn = true; draw(); });
            return canvas;
        }
    }
    // ---------------------------------------------------------- plugin host
    // A plugin's view of the document: reads/writes its params (wherever they
    // live in the song), records undo steps and plays preview notes.
    class CarrotPluginHost {
        constructor(editor, target, plugin) {
            this.editor = editor;
            this.doc = editor.doc;
            this.target = target;
            this.plugin = plugin;
            this._controls = [];
            this._refreshers = [];
            this._commitTimer = null;
            this._heldPitches = [];
        }
        get song() {
            return this.doc.song;
        }
        get sampleRate() {
            return (this.doc.synth && this.doc.synth.samplesPerSecond) || 44100;
        }
        get api() {
            return carrotPluginApi();
        }
        // The object holding this plugin's params, or null if it disappeared.
        _owner() {
            const t = this.target;
            const song = this.doc.song;
            if (t.type == "tool")
                return CarrotPluginHost._toolParams[this.plugin.id] || (CarrotPluginHost._toolParams[this.plugin.id] = { params: this.plugin.defaultParams() });
            if (t.type == "master") {
                const insert = song.fl.masterInserts[t.index];
                return (insert && insert.id == this.plugin.id) ? insert : null;
            }
            const channel = song.channels[t.channel];
            const instrument = channel && channel.instruments[t.instrument];
            if (!instrument)
                return null;
            if (t.type == "instrument")
                return (instrument.type == FLConfig.typePlugin && instrument.fl.plugin.id == this.plugin.id) ? instrument.fl.plugin : null;
            const insert = instrument.fl.inserts[t.index];
            return (insert && insert.id == this.plugin.id) ? insert : null;
        }
        isValid() {
            return this._owner() != null;
        }
        instrument() {
            const t = this.target;
            if (t.type != "instrument" && t.type != "insert")
                return null;
            const channel = this.doc.song.channels[t.channel];
            return channel ? channel.instruments[t.instrument] || null : null;
        }
        params() {
            const owner = this._owner();
            if (!owner)
                return this._orphan || (this._orphan = this.plugin.defaultParams());
            if (!owner.params || typeof owner.params != "object")
                owner.params = this.plugin.defaultParams();
            return owner.params;
        }
        get(path, fallback = undefined) {
            let node = this.params();
            for (const key of String(path).split(".")) {
                if (node == null || typeof node != "object")
                    return fallback;
                node = node[key];
            }
            return node === undefined ? fallback : node;
        }
        set(path, value, commit = true) {
            const keys = String(path).split(".");
            let node = this.params();
            for (let i = 0; i < keys.length - 1; i++) {
                if (node[keys[i]] == null || typeof node[keys[i]] != "object")
                    node[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
                node = node[keys[i]];
            }
            node[keys[keys.length - 1]] = value;
            this.changed(commit);
        }
        // Call after mutating params() directly.
        changed(commit = true) {
            const instrument = this.instrument();
            if (instrument)
                instrument.preset = instrument.type;
            this._localChange = true;
            this.doc.notifier.changed();
            if (commit)
                this._scheduleCommit();
        }
        replaceParams(params) {
            const owner = this._owner();
            if (owner)
                owner.params = params;
            else
                this._orphan = params;
            this.changed(false);
            this.commitNow();
            this.refresh();
        }
        _scheduleCommit() {
            clearTimeout(this._commitTimer);
            this._commitTimer = setTimeout(() => this.commitNow(), 450);
        }
        commitNow() {
            clearTimeout(this._commitTimer);
            this._commitTimer = null;
            if (this.target.type == "tool" || !this.isValid())
                return;
            const isInstrument = this.target.type != "master";
            this.doc.record(new ChangeFL(this.doc, () => { }, isInstrument));
        }
        // --------------------------------------------------------- bound controls
        _bind(el, path, fallback) {
            this._controls.push({ el, path, fallback });
            return el;
        }
        knob(path, spec) {
            const full = Object.assign({}, spec);
            full.value = this.get(path, spec.def);
            full.onInput = (v) => {
                this.set(path, v, true);
                if (spec.onInput)
                    spec.onInput(v);
            };
            return this._bind(CarrotUI.knob(full), path, spec.def);
        }
        select(path, spec) {
            const full = Object.assign({}, spec);
            full.value = this.get(path, spec.def || 0);
            full.onChange = (v) => {
                this.set(path, v, true);
                if (spec.onChange)
                    spec.onChange(v);
            };
            return this._bind(CarrotUI.select(full), path, spec.def || 0);
        }
        toggle(path, spec) {
            const full = Object.assign({}, spec);
            full.value = this.get(path, !!spec.def);
            full.onChange = (v) => {
                this.set(path, v, true);
                if (spec.onChange)
                    spec.onChange(v);
            };
            return this._bind(CarrotUI.toggle(full), path, !!spec.def);
        }
        // A draggable ADSR graph bound to {a, d, s, r} at `path`.
        envelope(path, spec = {}) {
            const full = Object.assign({}, spec);
            full.value = this.get(path, spec.value);
            full.onInput = (v) => {
                const target = this.get(path);
                if (target && typeof target == "object") {
                    Object.assign(target, v);
                    this.changed(true);
                }
                else
                    this.set(path, v, true);
            };
            return this._bind(CarrotUI.envelope(full), path, spec.value);
        }
        // A control for one FX parameter spec (knob or select).
        fxParam(path, spec) {
            if (spec.options)
                return this.select(path, { label: spec.label, options: spec.options, def: spec.def });
            return this.knob(path, spec);
        }
        onRefresh(fn) {
            this._refreshers.push(fn);
        }
        refresh() {
            for (const c of this._controls) {
                if (!c.el.isConnected)
                    continue;
                c.el._everConnected = true;
                const value = this.get(c.path, c.fallback);
                if (c.el.setValue)
                    c.el.setValue(value);
            }
            // Forget controls whose elements were thrown away (rebuilt lists, closed tabs).
            this._controls = this._controls.filter(c => c.el.isConnected || !c.el._everConnected);
            for (const fn of this._refreshers) {
                try {
                    fn();
                }
                catch (error) {
                    console.error(error);
                }
            }
        }
        // --------------------------------------------------------- previews
        noteOn(pitch) {
            const t = this.target;
            const synth = this.doc.synth;
            if (t.type == "instrument" || t.type == "insert") {
                synth.liveInputChannel = t.channel;
                synth.liveInputInstruments = [t.instrument];
            }
            if (synth.liveInputPitches.indexOf(pitch) == -1)
                synth.liveInputPitches.push(pitch);
            synth.liveInputDuration = Number.MAX_SAFE_INTEGER;
            synth.liveInputStarted = true;
            synth.maintainLiveInput();
        }
        noteOff(pitch) {
            const synth = this.doc.synth;
            const index = synth.liveInputPitches.indexOf(pitch);
            if (index != -1)
                synth.liveInputPitches.splice(index, 1);
        }
        previewNote(pitch, seconds = 0.6) {
            this.noteOn(pitch);
            setTimeout(() => this.noteOff(pitch), seconds * 1000);
        }
        toast(message) {
            flToast(message);
        }
        // Asks for an audio file and adds it to the sample bank.
        pickAudioFile() {
            return new Promise((resolve) => {
                const input = HTML.input({ type: "file", accept: "audio/*,.wav,.aif,.aiff,.flac,.ogg,.mp3", style: "display: none;" });
                input.addEventListener("change", async () => {
                    const file = input.files && input.files[0];
                    input.remove();
                    if (!file)
                        return resolve(null);
                    try {
                        const id = await FLSampleBank.addFile(file);
                        resolve({ id, name: file.name.replace(/\.[^.]+$/, "") });
                    }
                    catch (error) {
                        flToast("Couldn't load " + file.name + ": " + (error.message || error));
                        resolve(null);
                    }
                });
                document.body.appendChild(input);
                input.click();
            });
        }
        // Accepts drops from the sound browser or the OS onto an element.
        acceptSampleDrops(element, onSample) {
            element.addEventListener("dragover", (event) => {
                if (flDragHasPayload(event) || flDragHasFiles(event)) {
                    event.preventDefault();
                    element.classList.add("fl-drop-hover");
                }
            });
            element.addEventListener("dragleave", () => element.classList.remove("fl-drop-hover"));
            element.addEventListener("drop", async (event) => {
                element.classList.remove("fl-drop-hover");
                const payload = flReadDragPayload(event);
                event.preventDefault();
                try {
                    if (payload) {
                        const id = await FLActions.payloadToSampleId(payload);
                        onSample({ id, name: payload.name || FLSampleBank.getName(id) });
                    }
                    else if (flDragHasFiles(event)) {
                        const files = await FLKitLibrary.filesFromDataTransfer(event.dataTransfer);
                        const audio = files.find(f => flIsAudioFileName(f.name));
                        if (audio) {
                            const id = await FLSampleBank.addFile(audio);
                            onSample({ id, name: audio.name.replace(/\.[^.]+$/, "") });
                        }
                    }
                }
                catch (error) {
                    flToast("Couldn't load that sound: " + (error.message || error));
                }
            });
        }
        // A sample that's ready to play (or null while it loads).
        sample(id) {
            if (!id)
                return null;
            const entry = FLSampleBank.request(id);
            return entry && entry.status == "ready" ? entry : null;
        }
        // Writes generated notes into the song (see carrotWriteNotes).
        writeNotes(bars, options = {}) {
            return carrotWriteNotes(this.doc, bars, options);
        }
    }
    CarrotPluginHost._toolParams = {};
    // A UI for a chain of CarrotFX slots stored at `path` in a host's params.
    function carrotFxRack(host, path, options = {}) {
        const max = options.max || 8;
        const list = HTML.div();
        const addMenu = HTML.select({ class: "cb-select" });
        const types = options.types || CarrotFX.typeOrder;
        addMenu.appendChild(HTML.option({ value: "" }, "+ Add effect..."));
        for (const type of types)
            addMenu.appendChild(HTML.option({ value: type }, CarrotFX.types[type].name));
        addMenu.addEventListener("keydown", (event) => event.stopPropagation());
        const getChain = () => {
            let chain = host.get(path);
            if (!Array.isArray(chain)) {
                chain = [];
                host.set(path, chain, false);
            }
            return chain;
        };
        let renderedHash = "";
        const render = () => {
            const chain = getChain();
            const hash = chain.map(s => s && s.type).join(",") + "|" + chain.length;
            if (hash == renderedHash) {
                for (let i = 0; i < chain.length; i++) {
                    const slotEl = list.children[i];
                    if (slotEl)
                        slotEl.classList.toggle("cb-off", chain[i].on === false);
                }
                return;
            }
            renderedHash = hash;
            list.innerHTML = "";
            chain.forEach((slot, index) => {
                const def = CarrotFX.types[slot.type];
                if (!def)
                    return;
                const power = CarrotUI.toggle({ label: "On", value: slot.on !== false, title: "Bypass", onChange: (v) => {
                        getChain()[index].on = v;
                        host.changed();
                        render();
                    } });
                const up = HTML.button({ type: "button", class: "cb-mini-button", title: "Move up" }, "▲");
                const down = HTML.button({ type: "button", class: "cb-mini-button", title: "Move down" }, "▼");
                const remove = HTML.button({ type: "button", class: "cb-mini-button", title: "Remove" }, "✕");
                up.addEventListener("click", () => move(index, -1));
                down.addEventListener("click", () => move(index, 1));
                remove.addEventListener("click", () => {
                    getChain().splice(index, 1);
                    host.changed();
                    render();
                });
                const controls = CarrotUI.row(...def.params.map(spec => host.fxParam(path + "." + index + "." + spec.key, spec)));
                const slotEl = HTML.div({ class: "cb-fx-slot" + (slot.on === false ? " cb-off" : "") }, HTML.div({ class: "cb-fx-head" }, power, HTML.span({ class: "cb-fx-name" }, (index + 1) + ". " + def.name), up, down, remove), controls);
                list.appendChild(slotEl);
            });
            addMenu.disabled = chain.length >= max;
            if (options.onRender)
                options.onRender();
        };
        const move = (index, dir) => {
            const chain = getChain();
            const other = index + dir;
            if (other < 0 || other >= chain.length)
                return;
            const temp = chain[index];
            chain[index] = chain[other];
            chain[other] = temp;
            host.changed();
            renderedHash = "";
            render();
        };
        addMenu.addEventListener("change", () => {
            const type = addMenu.value;
            addMenu.selectedIndex = 0;
            if (!type)
                return;
            const chain = getChain();
            if (chain.length >= max)
                return;
            chain.push(CarrotFX.defaults(type));
            host.changed();
            render();
        });
        host.onRefresh(render);
        render();
        const el = HTML.div(list, addMenu);
        el.render = () => {
            renderedHash = "";
            render();
        };
        return el;
    }
    // --------------------------------------------------------------- windows
    // Floating windows (plugins, generator, recorder...) and centered modal
    // panels. None of them are part of BeepBox's undo history, so changes
    // made from them are normal undoable edits.
    class CarrotWindows {
        static open(editor, target, plugin) {
            const key = CarrotWindows.key(target, plugin);
            const existing = CarrotWindows._open.get(key);
            if (existing) {
                existing.focus();
                return existing;
            }
            const win = new CarrotPluginWindow(editor, target, plugin, key);
            win.focus();
            return win;
        }
        // Opens (or focuses) a non-plugin window made by `factory()`.
        static openPanel(key, factory) {
            const existing = CarrotWindows._open.get(key);
            if (existing) {
                existing.focus();
                return existing;
            }
            const win = factory();
            win.focus();
            return win;
        }
        static key(target, plugin) {
            return [plugin.id, target.type, target.channel, target.instance != undefined ? target.instance : target.instrument, target.index].join(":");
        }
        static closeAll() {
            for (const win of Array.from(CarrotWindows._open.values()))
                win.close();
        }
        static refreshAll() {
            for (const win of Array.from(CarrotWindows._open.values()))
                if (win.sync)
                    win.sync();
        }
        static count() {
            return CarrotWindows._open.size;
        }
        // The window Esc should close: modal ones first, then the most recently used.
        static topWindow() {
            let best = null;
            for (const win of CarrotWindows._open.values()) {
                if (best == null || (win.modal && !best.modal) || (win.modal == best.modal && (win._z || 0) >= (best._z || 0)))
                    best = win;
            }
            return best;
        }
        static closeTop() {
            const win = CarrotWindows.topWindow();
            if (win == null)
                return false;
            win.close();
            return true;
        }
        static anyModal() {
            for (const win of CarrotWindows._open.values())
                if (win.modal)
                    return true;
            return false;
        }
    }
    CarrotWindows._open = new Map();
    CarrotWindows._z = 40;
    // Keep floating windows reachable when the browser window gets smaller.
    window.addEventListener("resize", () => {
        for (const win of CarrotWindows._open.values()) {
            if (win.modal)
                continue;
            const rect = win.container.getBoundingClientRect();
            win._moveTo(rect.left, rect.top);
        }
    });
    class CarrotFloatingWindow {
        // options: key, title, icon, color, width, modal, titleExtras (elements)
        constructor(editor, options) {
            this.editor = editor;
            this.doc = editor.doc;
            this.key = options.key;
            this.modal = !!options.modal;
            this._badge = options.icon ? HTML.span({ class: "cb-window-badge" }, options.icon) : "";
            this._name = HTML.span({ class: "cb-window-name" }, options.title);
            this._targetLabel = HTML.span({ class: "cb-window-target" }, options.subtitle || "");
            this._collapseButton = HTML.button({ type: "button", title: "Collapse" }, "▁");
            this._closeButton = HTML.button({ type: "button", title: "Close (Esc)" }, "✕");
            this._title = HTML.div({ class: "cb-window-title" }, this._badge, this._name, this._targetLabel, ...(options.titleExtras || []), this.modal ? "" : this._collapseButton, this._closeButton);
            this._body = HTML.div({ class: "cb-window-body" });
            this.container = HTML.div({ class: "cb-window" + (this.modal ? " cb-modal" : ""), tabindex: "-1" }, this._title, this._body);
            this.container.style.setProperty("--cb-plugin-color", options.color || "#888");
            if (options.width)
                this.container.style.width = options.width + "px";
            this._collapseButton.addEventListener("click", () => this.container.classList.toggle("cb-collapsed"));
            this._closeButton.addEventListener("click", () => this.close());
            this.container.addEventListener("pointerdown", () => this.focus(), true);
            this.container.addEventListener("keydown", (event) => {
                if (event.key == "Escape") {
                    event.stopPropagation();
                    event.preventDefault();
                    this.close();
                    return;
                }
                this._forwardKey(event, "_whenKeyPressed");
            });
            this.container.addEventListener("keyup", (event) => this._forwardKey(event, "_whenKeyReleased"));
            if (!this.modal) {
                this._title.addEventListener("dblclick", (event) => {
                    if (!event.target.closest("button, select, input"))
                        this.container.classList.toggle("cb-collapsed");
                });
            }
            if (this.modal) {
                this._overlay = HTML.div({ class: "cb-overlay cb-modal-overlay" }, this.container);
                this._overlay.addEventListener("pointerdown", (event) => {
                    if (event.target == this._overlay)
                        this.close();
                });
            }
            else {
                this._installDrag();
            }
            CarrotWindows._open.set(this.key, this);
        }
        // Space, note keys, [ ] and friends keep working while a plugin window has
        // the focus: they are handed to the editor unless you are typing or
        // pressing a button.
        _forwardKey(event, handlerName) {
            if (this.modal || this.editor.prompt)
                return;
            const target = event.target;
            if (target && target != this.container && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable))
                return;
            if (event.ctrlKey || event.metaKey || event.altKey)
                return;
            const handler = this.editor[handlerName];
            if (typeof handler == "function")
                handler(event);
        }
        // Call once the body is filled.
        mount() {
            document.body.appendChild(this.modal ? this._overlay : this.container);
            if (!this.modal)
                this._place();
            // Keyboard focus: modal windows take it (so Esc works), plugin windows hand it
            // back to the editor so Space, note keys and the launcher keep working.
            if (this.modal)
                this.container.focus({ preventScroll: true });
            else if (this.editor && this.editor._refocusStage)
                this.editor._refocusStage();
            if (typeof carrotUISound == "function")
                carrotUISound("open");
        }
        setBody(element) {
            this._body.innerHTML = "";
            this._body.appendChild(element);
        }
        _installDrag() {
            let drag = null;
            this._title.addEventListener("pointerdown", (event) => {
                if (event.target.closest("button, select, input"))
                    return;
                const rect = this.container.getBoundingClientRect();
                drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
                this._title.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            this._title.addEventListener("pointermove", (event) => {
                if (drag)
                    this._moveTo(event.clientX - drag.dx, event.clientY - drag.dy);
            });
            const end = () => {
                if (!drag)
                    return;
                drag = null;
                const rect = this.container.getBoundingClientRect();
                try {
                    window.localStorage.setItem("carrotWindowPos:" + this._positionKey(), JSON.stringify([Math.round(rect.left), Math.round(rect.top)]));
                }
                catch (error) { }
            };
            this._title.addEventListener("pointerup", end);
            this._title.addEventListener("pointercancel", end);
        }
        _positionKey() {
            return this.key.split(":")[0];
        }
        _moveTo(x, y) {
            const rect = this.container.getBoundingClientRect();
            x = Math.max(-rect.width + 80, Math.min(window.innerWidth - 80, x));
            y = Math.max(0, Math.min(window.innerHeight - 30, y));
            this.container.style.left = x + "px";
            this.container.style.top = y + "px";
        }
        _place() {
            let pos = null;
            try {
                pos = JSON.parse(window.localStorage.getItem("carrotWindowPos:" + this._positionKey()) || "null");
            }
            catch (error) { }
            const rect = this.container.getBoundingClientRect();
            const offset = ((CarrotWindows._open.size - 1) % 5) * 24;
            if (!Array.isArray(pos))
                pos = [Math.max(8, (window.innerWidth - rect.width) / 2 + offset), Math.max(8, (window.innerHeight - rect.height) / 3 + offset)];
            this._moveTo(pos[0], pos[1]);
        }
        focus() {
            for (const win of CarrotWindows._open.values())
                win.container.classList.remove("cb-focused");
            this.container.classList.add("cb-focused");
            const z = String(++CarrotWindows._z);
            this._z = CarrotWindows._z;
            if (this.modal)
                this._overlay.style.zIndex = String(Math.max(60, CarrotWindows._z));
            else
                this.container.style.zIndex = z;
            CarrotWindows._focused = this;
        }
        close() {
            if (this._closed)
                return;
            this._closed = true;
            if (this.onClose) {
                try {
                    this.onClose();
                }
                catch (error) {
                    console.error(error);
                }
            }
            if (this._watcher) {
                const watcher = this._watcher;
                setTimeout(() => this.doc.notifier.unwatch(watcher));
            }
            (this.modal ? this._overlay : this.container).remove();
            CarrotWindows._open.delete(this.key);
            if (CarrotWindows._focused == this)
                CarrotWindows._focused = null;
            if (this.editor && this.editor._refocusStage && !this.editor.prompt)
                this.editor._refocusStage();
            if (typeof carrotUISound == "function")
                carrotUISound("close");
        }
        // Re-run `fn` whenever the song changes (until closed).
        watchSong(fn) {
            this._watcher = () => {
                if (!this._closed)
                    fn();
            };
            this.doc.notifier.watch(this._watcher);
        }
    }
    class CarrotPluginWindow extends CarrotFloatingWindow {
        constructor(editor, target, plugin, key) {
            const presetSelect = HTML.select({ title: "Presets" });
            const randomButton = HTML.button({ type: "button", title: "Randomize every setting" }, "Random");
            super(editor, { key, title: plugin.name, icon: plugin.icon || "Pl", color: plugin.color || (CarrotPlugins.info(plugin.id) || {}).color, width: plugin.width, titleExtras: [presetSelect, randomButton] });
            this.plugin = plugin;
            this.host = new CarrotPluginHost(editor, target, plugin);
            this._presetSelect = presetSelect;
            this._randomButton = randomButton;
            presetSelect.addEventListener("keydown", (event) => event.stopPropagation());
            let content = null;
            try {
                content = plugin.kind == "tool" ? plugin.open(this.host) : (plugin.buildEditor ? plugin.buildEditor(this.host) : HTML.div("This plugin has no controls."));
            }
            catch (error) {
                console.error(error);
                content = HTML.div({ class: "cb-hint" }, "This plugin failed to open: " + (error.message || error));
            }
            this._body.appendChild(content);
            if (target.type != "tool" && target.type != "master") {
                this._keys = this._buildKeys();
                this.container.appendChild(this._keys);
            }
            this._presets = plugin.presets ? (typeof plugin.presets == "function" ? plugin.presets() : plugin.presets) : [];
            this._fillPresets();
            presetSelect.addEventListener("change", () => {
                const value = presetSelect.value;
                presetSelect.selectedIndex = 0;
                if (value)
                    this._choosePreset(value);
            });
            presetSelect.style.display = target.type != "tool" ? "" : "none";
            randomButton.style.display = plugin.randomize ? "" : "none";
            randomButton.addEventListener("click", () => {
                this.host.replaceParams(plugin.randomize(this.host.params()));
                flToast("Randomized " + plugin.name);
            });
            this.mount();
            this.watchSong(() => this.sync());
            this.sync();
            this.host.refresh();
        }
        _positionKey() {
            return this.plugin.id;
        }
        _userPresetKey() {
            return "carrotUserPresets:" + this.plugin.id;
        }
        _userPresets() {
            try {
                const list = JSON.parse(window.localStorage.getItem(this._userPresetKey()) || "[]");
                return Array.isArray(list) ? list.filter(p => p && typeof p.name == "string" && p.params && typeof p.params == "object") : [];
            }
            catch (error) {
                return [];
            }
        }
        _saveUserPresets(list) {
            try {
                window.localStorage.setItem(this._userPresetKey(), JSON.stringify(list));
            }
            catch (error) {
                flToast("Couldn't save the preset in this browser.");
            }
        }
        _fillPresets() {
            const select = this._presetSelect;
            select.innerHTML = "";
            select.appendChild(HTML.option({ value: "" }, "Presets"));
            let group = null;
            for (const preset of this._presets) {
                if (preset.group && (!group || group.label != preset.group)) {
                    group = HTML.optgroup({ label: preset.group });
                    select.appendChild(group);
                }
                (group || select).appendChild(HTML.option({ value: "p:" + preset.name }, preset.name));
            }
            const mine = this._userPresets();
            if (mine.length > 0) {
                const userGroup = HTML.optgroup({ label: "My presets" });
                for (const preset of mine)
                    userGroup.appendChild(HTML.option({ value: "u:" + preset.name }, preset.name));
                select.appendChild(userGroup);
            }
            const actions = HTML.optgroup({ label: "Actions" });
            actions.appendChild(HTML.option({ value: "init" }, "Reset to default"));
            actions.appendChild(HTML.option({ value: "save" }, "Save as my preset..."));
            actions.appendChild(HTML.option({ value: "copy" }, "Copy settings"));
            actions.appendChild(HTML.option({ value: "paste" }, "Paste settings"));
            select.appendChild(actions);
            if (mine.length > 0) {
                const remove = HTML.optgroup({ label: "Delete one of my presets" });
                for (const preset of mine)
                    remove.appendChild(HTML.option({ value: "d:" + preset.name }, "Delete \"" + preset.name + "\""));
                select.appendChild(remove);
            }
        }
        _choosePreset(value) {
            const plugin = this.plugin;
            if (value == "init") {
                this.host.replaceParams(plugin.defaultParams());
                flToast("Reset " + plugin.name);
            }
            else if (value == "save") {
                CarrotUI.ask({ title: "Save preset", label: "Name for this preset", value: plugin.name + " " + (this._userPresets().length + 1), okLabel: "Save", maxLength: 40 }).then((name) => {
                    if (!name || !name.trim())
                        return;
                    const list = this._userPresets().filter(p => p.name != name.trim());
                    list.push({ name: name.trim().slice(0, 40), params: flCloneJson(this.host.params()) });
                    this._saveUserPresets(list);
                    this._fillPresets();
                    flToast("Saved preset " + name.trim());
                });
            }
            else if (value == "copy") {
                const text = JSON.stringify({ carrotbox: 1, plugin: plugin.id, params: this.host.params() });
                if (navigator.clipboard && navigator.clipboard.writeText)
                    navigator.clipboard.writeText(text).then(() => flToast("Copied " + plugin.name + " settings"), () => CarrotUI.ask({ title: "Copy these settings", label: "Copy the text below (Ctrl+C)", value: text, readOnly: true }));
                else
                    CarrotUI.ask({ title: "Copy these settings", label: "Copy the text below (Ctrl+C)", value: text, readOnly: true });
            }
            else if (value == "paste") {
                const apply = (text) => {
                    try {
                        const data = JSON.parse(text);
                        if (!data || data.carrotbox != 1 || data.plugin != plugin.id || typeof data.params != "object")
                            throw new Error("wrong plugin");
                        this.host.replaceParams(Object.assign(plugin.defaultParams(), data.params));
                        flToast("Pasted " + plugin.name + " settings");
                    }
                    catch (error) {
                        flToast("The clipboard doesn't hold " + plugin.name + " settings.");
                    }
                };
                if (navigator.clipboard && navigator.clipboard.readText)
                    navigator.clipboard.readText().then(apply, () => CarrotUI.ask({ title: "Paste settings", label: "Paste the copied settings here (Ctrl+V)", okLabel: "Paste" }).then((text) => { if (text != null) apply(text); }));
                else
                    CarrotUI.ask({ title: "Paste settings", label: "Paste the copied settings here (Ctrl+V)", okLabel: "Paste" }).then((text) => { if (text != null) apply(text); });
            }
            else if (value.startsWith("u:")) {
                const preset = this._userPresets().find(p => p.name == value.slice(2));
                if (preset) {
                    this.host.replaceParams(Object.assign(plugin.defaultParams(), flCloneJson(preset.params)));
                    flToast(plugin.name + ": " + preset.name);
                }
            }
            else if (value.startsWith("d:")) {
                this._saveUserPresets(this._userPresets().filter(p => p.name != value.slice(2)));
                this._fillPresets();
                flToast("Deleted preset " + value.slice(2));
            }
            else if (value.startsWith("p:")) {
                const preset = this._presets.find(p => p.name == value.slice(2));
                if (preset) {
                    this.host.replaceParams(Object.assign(plugin.defaultParams(), flCloneJson(preset.params)));
                    flToast(plugin.name + ": " + preset.name);
                }
            }
        }
        _buildKeys() {
            const keys = HTML.div({ class: "cb-keys", title: "Click to hear the instrument" });
            const startPitch = 36, octaves = 3;
            const whiteOffsets = [0, 2, 4, 5, 7, 9, 11];
            const blackOffsets = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];
            const whiteCount = octaves * 7;
            const elements = new Map();
            for (let o = 0; o < octaves; o++) {
                whiteOffsets.forEach((offset, i) => {
                    const k = HTML.div({ class: "cb-white" + (offset == 0 ? " cb-root" : "") });
                    k.style.left = ((o * 7 + i) / whiteCount * 100) + "%";
                    k.style.width = (100 / whiteCount) + "%";
                    elements.set(startPitch + o * 12 + offset, k);
                    keys.appendChild(k);
                });
                for (const [offset, after] of blackOffsets) {
                    const k = HTML.div({ class: "cb-black" });
                    k.style.left = ((o * 7 + after + 0.68) / whiteCount * 100) + "%";
                    k.style.width = (0.64 / whiteCount * 100) + "%";
                    elements.set(startPitch + o * 12 + offset, k);
                    keys.appendChild(k);
                }
            }
            let held = null;
            const pitchOf = (target) => {
                for (const [pitch, el] of elements)
                    if (el == target)
                        return pitch;
                return null;
            };
            const release = () => {
                if (held != null) {
                    this.host.noteOff(held);
                    elements.get(held).classList.remove("cb-down");
                    held = null;
                }
            };
            const press = (pitch) => {
                if (pitch == held)
                    return;
                release();
                if (pitch == null)
                    return;
                held = pitch;
                elements.get(pitch).classList.add("cb-down");
                this.host.noteOn(pitch);
            };
            keys.addEventListener("pointerdown", (event) => {
                keys.setPointerCapture(event.pointerId);
                press(pitchOf(document.elementFromPoint(event.clientX, event.clientY)));
                event.preventDefault();
            });
            keys.addEventListener("pointermove", (event) => {
                if (held == null)
                    return;
                const pitch = pitchOf(document.elementFromPoint(event.clientX, event.clientY));
                if (pitch != null)
                    press(pitch);
            });
            keys.addEventListener("pointerup", release);
            keys.addEventListener("pointercancel", release);
            this._releaseKeys = release;
            return keys;
        }
        // Follows the song: closes when the target is gone, refreshes controls.
        sync() {
            if (!this.host.isValid() && this.host.target.type != "tool") {
                this.close();
                return;
            }
            const t = this.host.target;
            let label = "";
            if (t.type == "instrument" || t.type == "insert") {
                const channel = this.doc.song.channels[t.channel];
                const name = (channel && channel.name) || ((this.doc.song.getChannelIsNoise(t.channel) ? "Drums " : "Channel ") + (t.channel + 1));
                label = name + (channel && channel.instruments.length > 1 ? " · inst " + (t.instrument + 1) : "") + (t.type == "insert" ? " · FX " + (t.index + 1) : "");
            }
            else if (t.type == "master") {
                label = "Master FX " + (t.index + 1);
            }
            this._targetLabel.textContent = label == this.plugin.name ? "" : label;
            this.host._localChange = false;
            this.host.refresh();
        }
        onClose() {
            if (this._releaseKeys)
                this._releaseKeys();
            if (this.host._commitTimer)
                this.host.commitNow();
            if (this.plugin.onClose)
                this.plugin.onClose(this.host);
        }
    }
    // ------------------------------------------------------- plugin actions
    function carrotNewChannel(doc, isNoise) {
        const group = new ChangeGroup();
        const index = isNoise ? doc.song.getChannelCount() : doc.song.pitchChannelCount;
        group.append(new ChangeAddChannel(doc, index, isNoise));
        if (group.isNoop())
            return null;
        group.append(new ChangeChannelBar(doc, index, doc.bar));
        return { group, index };
    }
    function carrotNameChannel(doc, channel, name) {
        doc.record(new ChangeFL(doc, () => { doc.song.channels[channel].name = name; }, false));
    }
    // Loads an instrument plugin on the current instrument (or a new channel).
    function carrotLoadInstrumentPlugin(editor, id, newChannel = false) {
        const doc = editor.doc;
        const plugin = CarrotPlugins.get(id);
        if (!plugin) {
            flToast("Install " + ((CarrotPlugins.info(id) || {}).name || id) + " first (Plugin Manager).");
            return;
        }
        let group = new ChangeGroup();
        let channelIndex = doc.channel;
        let addedChannel = false;
        const wantsNoise = !!plugin.preferDrums;
        if (newChannel || doc.song.getChannelIsNoise(doc.channel) != wantsNoise && !plugin.anyChannel) {
            const added = carrotNewChannel(doc, wantsNoise);
            if (added == null) {
                flToast("No room for another channel.");
                return;
            }
            group = added.group;
            channelIndex = added.index;
            addedChannel = true;
        }
        // A brand new channel always starts with its first instrument.
        const pickInstrument = () => {
            const channel = doc.song.channels[channelIndex];
            const wanted = (addedChannel || channelIndex != doc.channel) ? 0 : (doc.getCurrentInstrument() | 0);
            return Math.max(0, Math.min(channel.instruments.length - 1, wanted));
        };
        group.append(new ChangeFL(doc, () => {
            const channel = doc.song.channels[channelIndex];
            const instrumentIndex = pickInstrument();
            const instrument = channel.instruments[instrumentIndex];
            instrument.setTypeAndReset(FLConfig.typePlugin, doc.song.getChannelIsNoise(channelIndex));
            instrument.fl.plugin.id = id;
            instrument.fl.plugin.params = plugin.defaultParams();
            if (!channel.name)
                channel.name = plugin.name;
        }));
        doc.record(group);
        if (CarrotSettings.get("openPluginOnLoad"))
            CarrotWindows.open(editor, { type: "instrument", channel: channelIndex, instrument: pickInstrument() }, plugin);
        flToast("Loaded " + plugin.name + (addedChannel ? " on a new channel" : ""));
    }
    function carrotAddInsert(editor, id, master = false) {
        const doc = editor.doc;
        const plugin = CarrotPlugins.get(id);
        if (!plugin) {
            flToast("Install " + ((CarrotPlugins.info(id) || {}).name || id) + " first (Plugin Manager).");
            return;
        }
        const list = master ? doc.song.fl.masterInserts : flCurrentInstrument(doc).fl.inserts;
        if (list.length >= FLConfig.maxInserts) {
            flToast("That's the maximum of " + FLConfig.maxInserts + " plugin effects.");
            return;
        }
        const channel = doc.channel, instrument = doc.getCurrentInstrument();
        doc.record(new ChangeFL(doc, () => {
            const target = master ? doc.song.fl.masterInserts : doc.song.channels[channel].instruments[instrument].fl.inserts;
            target.push(new PluginInsert(id, plugin.defaultParams()));
        }, !master));
        const index = (master ? doc.song.fl.masterInserts : doc.song.channels[channel].instruments[instrument].fl.inserts).length - 1;
        if (CarrotSettings.get("openPluginOnLoad"))
            CarrotWindows.open(editor, master ? { type: "master", index } : { type: "insert", channel, instrument, index }, plugin);
        flToast("Added " + plugin.name + (master ? " to the master" : " to this instrument"));
    }
    function carrotOpenTool(editor, id) {
        const plugin = CarrotPlugins.get(id);
        if (!plugin) {
            flToast("Install " + ((CarrotPlugins.info(id) || {}).name || id) + " first (Plugin Manager).");
            return;
        }
        CarrotWindows.open(editor, { type: "tool" }, plugin);
    }
    // Opens whatever plugin the current instrument uses.
    function carrotOpenCurrentInstrumentPlugin(editor) {
        const doc = editor.doc;
        const instrument = flCurrentInstrument(doc);
        if (instrument.type != FLConfig.typePlugin || !instrument.fl.plugin.id)
            return false;
        const plugin = CarrotPlugins.get(instrument.fl.plugin.id);
        if (!plugin) {
            flToast(((CarrotPlugins.info(instrument.fl.plugin.id) || {}).name || "This plugin") + " isn't installed. Open the Plugin Manager to install it.");
            return true;
        }
        CarrotWindows.open(editor, { type: "instrument", channel: doc.channel, instrument: doc.getCurrentInstrument() }, plugin);
        return true;
    }
    // A compact list of plugin effects for an instrument or the master.
    class CarrotInsertsUI {
        constructor(editor, master) {
            this._editor = editor;
            this._master = master;
            this._list = HTML.div({ class: "cb-inserts" });
            this._add = HTML.select({ class: "cb-select", style: "width: 100%;" });
            this._add.addEventListener("change", () => {
                const id = this._add.value;
                this._add.selectedIndex = 0;
                if (id == "manage")
                    carrotOpen(editor, "flPlugins");
                else if (id)
                    carrotAddInsert(editor, id, master);
            });
            this.container = HTML.div(this._list, this._add);
            this._hash = "";
        }
        _inserts() {
            const doc = this._editor.doc;
            return this._master ? doc.song.fl.masterInserts : flCurrentInstrument(doc).fl.inserts;
        }
        render() {
            const doc = this._editor.doc;
            const inserts = this._inserts();
            const effects = CarrotPlugins.loaded("effect");
            const hash = inserts.map(i => i.id + (i.on ? "1" : "0")).join(",") + "|" + effects.map(e => e.id).join(",") + "|" + doc.channel + "," + doc.getCurrentInstrument();
            if (hash == this._hash)
                return;
            this._hash = hash;
            this._list.innerHTML = "";
            inserts.forEach((insert, index) => {
                const plugin = CarrotPlugins.get(insert.id);
                const info = CarrotPlugins.info(insert.id) || { name: insert.id, icon: "Pl" };
                const power = CarrotUI.toggle({ label: "On", value: insert.on, title: "Bypass", onChange: (v) => {
                        doc.record(new ChangeFL(doc, () => { this._inserts()[index].on = v; }, !this._master));
                    } });
                const open = CarrotUI.button(info.name + (plugin ? "" : " (not installed)"), () => {
                    if (!plugin) {
                        carrotOpen(this._editor, "flPlugins");
                        return;
                    }
                    const target = this._master ? { type: "master", index } : { type: "insert", channel: doc.channel, instrument: doc.getCurrentInstrument(), index };
                    CarrotWindows.open(this._editor, target, plugin);
                }, { title: "Open the plugin window" });
                const remove = HTML.button({ type: "button", class: "cb-mini-button", title: "Remove" }, "✕");
                remove.addEventListener("click", () => {
                    doc.record(new ChangeFL(doc, () => { this._inserts().splice(index, 1); }, !this._master));
                });
                this._list.appendChild(HTML.div({ class: "cb-insert-row" }, power, open, remove));
            });
            this._add.innerHTML = "";
            this._add.appendChild(HTML.option({ value: "" }, "+ Plugin effect..."));
            for (const effect of effects)
                this._add.appendChild(HTML.option({ value: effect.id }, (effect.icon || "") + " " + effect.name));
            this._add.appendChild(HTML.option({ value: "manage" }, "Plugin Manager..."));
        }
    }
    // -------------------------------------------------------------- launcher
    function carrotRecent() {
        try {
            const list = JSON.parse(window.localStorage.getItem("carrotRecentPlugins") || "[]");
            return Array.isArray(list) ? list : [];
        }
        catch (error) {
            return [];
        }
    }
    function carrotRecordUse(key) {
        if (!key)
            return;
        const list = carrotRecent().filter(k => k != key);
        list.unshift(key);
        try {
            window.localStorage.setItem("carrotRecentPlugins", JSON.stringify(list.slice(0, 12)));
        }
        catch (error) { }
    }
    // Tab pops up every installed plugin (and the built-in ones) to launch.
    class CarrotLauncher {
        static toggle(editor) {
            if (CarrotLauncher._current) {
                CarrotLauncher._current.close();
                return;
            }
            CarrotLauncher._current = new CarrotLauncher(editor);
        }
        static isOpen() {
            return CarrotLauncher._current != null;
        }
        constructor(editor) {
            this._editor = editor;
            const doc = editor.doc;
            this._input = HTML.input({ type: "text", placeholder: "Launch a plugin… (type to search)", spellcheck: "false" });
            this._list = HTML.div({ class: "cb-launcher-list" });
            const manage = HTML.a("Plugin Manager…");
            manage.addEventListener("click", () => {
                this.close();
                carrotOpen(editor, "flPlugins");
            });
            this._foot = HTML.div({ class: "cb-launcher-foot" }, HTML.span("Enter: load on this channel"), HTML.span("Shift+Enter: new channel / master"), HTML.span("Esc: close"), manage);
            this._box = HTML.div({ class: "cb-launcher" }, this._input, this._list, this._foot);
            this.container = HTML.div({ class: "cb-overlay" }, this._box);
            this.container.addEventListener("pointerdown", (event) => {
                if (event.target == this.container)
                    this.close();
            });
            this._input.addEventListener("input", () => {
                this._selected = 0;
                this._render();
            });
            this._input.addEventListener("keydown", (event) => this._onKey(event));
            this._selected = 0;
            this._items = this._buildItems(doc);
            document.body.appendChild(this.container);
            this._render();
            this._input.focus();
            if (typeof carrotUISound == "function")
                carrotUISound("open");
        }
        _buildItems(doc) {
            const items = [];
            const isNoise = doc.song.getChannelIsNoise(doc.channel);
            for (const info of CARROT_PLUGIN_CATALOG) {
                if (!CarrotPlugins.isInstalled(info.id))
                    continue;
                const loaded = CarrotPlugins.isLoaded(info.id);
                const kindLabel = info.kind == "instrument" ? "Generator" : info.kind == "effect" ? "Effect" : "Tool";
                items.push({
                    key: info.id, group: "Installed plugins", icon: info.icon, color: info.color, name: info.name, sub: (loaded ? "" : "loading… · ") + (info.alt ? info.alt + "-style " : "CarrotBox ") + kindLabel.toLowerCase() + " — " + info.blurb, badge: kindLabel,
                    run: (shift) => {
                        if (info.kind == "instrument")
                            carrotLoadInstrumentPlugin(this._editor, info.id, shift);
                        else if (info.kind == "effect")
                            carrotAddInsert(this._editor, info.id, shift);
                        else
                            carrotOpenTool(this._editor, info.id);
                    },
                });
            }
            const setType = (type, name) => (shift) => {
                if (shift) {
                    const added = carrotNewChannel(doc, type == FLConfig.typeFPC);
                    if (added) {
                        doc.record(added.group);
                    }
                }
                doc.record(new ChangePreset(doc, type));
                flToast("This channel now uses " + name);
            };
            const builtins = [
                { icon: "Sm", name: "Sampler", sub: "Play any sample across the keyboard", badge: "Generator", run: setType(FLConfig.typeSampler, "Sampler") },
                { icon: "3x", name: "3x Osc", sub: "Classic three-oscillator synth", badge: "Generator", run: setType(FLConfig.typeThreeOsc, "3x Osc") },
                { icon: "FP", name: "FPC", sub: "12 drum pads (drum channels)", badge: "Generator", run: setType(FLConfig.typeFPC, "FPC") },
                { icon: "Sx", name: "Slicex", sub: "Chop a loop into slices", badge: "Generator", run: setType(FLConfig.typeSlicex, "Slicex") },
                { icon: "EQ", name: "Parametric EQ 2", sub: "7-band EQ with analyzer (Shift: master)", badge: "Effect", run: (shift) => this._builtinFx(FLConfig.fxPEQ, shift, shift ? "flEQ:master" : "flEQ:instrument") },
                { icon: "GB", name: "Gross Beat", sub: "Gates, stutters & time effects", badge: "Effect", run: (shift) => this._builtinFx(FLConfig.fxGross, shift, shift ? "flMaster" : null) },
                { icon: "Sg", name: "Soundgoodizer", sub: "One-knob maximizer", badge: "Effect", run: (shift) => this._builtinFx(FLConfig.fxSoundgoodizer, shift, shift ? "flMaster" : null) },
            ];
            for (const b of builtins)
                items.push(Object.assign({ group: "Built in", color: "#666", key: b.name }, b));
            const tools = [
                { icon: "Gn", name: "Melody / Rhythm Generator", sub: "Leads, hooks, harmonies, bass, chords, drums or a full beat in 21 styles", badge: "Tool", run: () => carrotOpen(this._editor, "flLeadGen") },
                { icon: "Kt", name: "Drum Kit / Sound Kit Loader", sub: "Load FL Studio kits, folders and zips", badge: "Tool", run: () => carrotOpen(this._editor, "flKits") },
                { icon: "Rc", name: "Audio Recorder", sub: "Record vocals or instruments with mixing effects", badge: "Tool", run: () => carrotOpen(this._editor, "flRecorder") },
                { icon: "Br", name: "Sound Browser", sub: "Samples, kits and packs (F8)", badge: "Tool", run: () => this._editor.flShowBrowser(true) },
                { icon: "SP", name: "SP-404MKII / MIDI Devices", sub: "USB pads, tempo sync, sequencing, audio and samples", badge: "Tool", run: () => carrotOpen(this._editor, "flHardware") },
            ];
            for (const t of tools)
                items.push(Object.assign({ group: "Tools", color: "#555", key: t.name }, t));
            if (isNoise)
                items.sort((a, b) => (a.name == "FPC" ? -1 : 0) - (b.name == "FPC" ? -1 : 0));
            // The things you used last come first.
            const recents = carrotRecent().map(key => items.find(item => item.key == key)).filter(item => item != null).slice(0, 4);
            return recents.map(item => Object.assign({}, item, { group: "Recently used" })).concat(items);
        }
        _builtinFx(bit, master, promptName) {
            const doc = this._editor.doc;
            if (master) {
                if ((doc.song.fl.masterFx & bit) == 0)
                    doc.record(new ChangeFL(doc, () => { doc.song.fl.masterFx |= bit; }, false));
            }
            else {
                const instrument = flCurrentInstrument(doc);
                if ((instrument.fl.fx & bit) == 0) {
                    doc.record(new ChangeFL(doc, () => { instrument.fl.fx |= bit; }));
                    doc.addedEffect = true;
                }
            }
            if (promptName)
                setTimeout(() => this._editor._openPrompt(promptName));
            flToast(FLConfig.fxNames[FLConfig.fxBits.indexOf(bit)] + (master ? " is on the master" : " added to this instrument"));
        }
        _filtered() {
            const query = this._input.value.trim().toLowerCase();
            if (!query)
                return this._items;
            return this._items.filter(item => item.group != "Recently used" && (item.name + " " + item.sub + " " + item.badge).toLowerCase().indexOf(query) != -1);
        }
        _render() {
            const items = this._filtered();
            this._list.innerHTML = "";
            let group = null;
            if (items.length == 0)
                this._list.appendChild(HTML.div({ class: "cb-hint", style: "padding: 12px;" }, "Nothing matches. Install more plugins in the Plugin Manager."));
            items.forEach((item, index) => {
                if (item.group != group) {
                    group = item.group;
                    this._list.appendChild(HTML.div({ class: "cb-launcher-group" }, group));
                }
                const row = HTML.div({ class: "cb-launcher-item" + (index == this._selected ? " cb-selected" : "") }, HTML.div({ class: "cb-launcher-icon", style: `background: ${item.color};` }, item.icon), HTML.div({ class: "cb-launcher-text" }, HTML.b(item.name), HTML.span(item.sub)), HTML.span({ class: "cb-badge" }, item.badge));
                row.addEventListener("click", (event) => this._run(item, event.shiftKey));
                row.addEventListener("pointermove", () => {
                    if (this._selected != index) {
                        this._selected = index;
                        for (const other of this._list.querySelectorAll(".cb-launcher-item"))
                            other.classList.remove("cb-selected");
                        row.classList.add("cb-selected");
                    }
                });
                this._list.appendChild(row);
            });
            const selected = this._list.querySelector(".cb-selected");
            if (selected)
                selected.scrollIntoView({ block: "nearest" });
        }
        _onKey(event) {
            const items = this._filtered();
            event.stopPropagation();
            if (event.key == "Escape" || event.key == "Tab") {
                event.preventDefault();
                this.close();
            }
            else if (event.key == "ArrowDown") {
                event.preventDefault();
                this._selected = Math.min(items.length - 1, this._selected + 1);
                this._render();
            }
            else if (event.key == "ArrowUp") {
                event.preventDefault();
                this._selected = Math.max(0, this._selected - 1);
                this._render();
            }
            else if (event.key == "Enter") {
                event.preventDefault();
                const item = items[this._selected];
                if (item)
                    this._run(item, event.shiftKey);
            }
        }
        _run(item, shift) {
            this.close();
            carrotRecordUse(item.key);
            item.run(shift);
        }
        close() {
            this.container.remove();
            CarrotLauncher._current = null;
            if (this._editor && this._editor._refocusStage)
                this._editor._refocusStage();
        }
    }
    CarrotLauncher._current = null;
    // ---------------------------------------------------------- plugin manager
    class CarrotPluginManager extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("manager", () => new CarrotPluginManager(editor));
        }
        constructor(editor) {
            super(editor, { key: "manager", title: "Plugin Manager", color: "#ff9b21", width: 660, modal: true });
            this._editor = editor;
            this._doc = editor.doc;
            this._doneButton = CarrotUI.button("Done", () => this.close(), { primary: true });
            this._list = HTML.div({ class: "cb-manager-list" });
            this._summary = HTML.div({ class: "cb-hint" });
            const installAll = CarrotUI.button("Install all", () => this._all(true));
            const removeAll = CarrotUI.button("Uninstall all", () => this._all(false));
            this.setBody(HTML.div(HTML.p({ class: "cb-hint", style: "margin: 0 0 8px;" }, "Plugins are downloaded only when you install them, so you can keep CarrotBox light. Press Tab anywhere to launch installed plugins. These are original CarrotBox plugins inspired by the workflows of popular commercial plugins — not copies of them."), this._list, HTML.div({ style: "display: flex; justify-content: space-between; margin-top: 10px; align-items: center; gap: 6px;" }, HTML.div({ style: "display: flex; gap: 6px; align-items: center;" }, installAll, removeAll, this._summary), this._doneButton)));
            this._listener = () => this._render();
            CarrotPlugins.onChange(this._listener);
            this._render();
            this.mount();
        }
        async _all(install) {
            for (const info of CARROT_PLUGIN_CATALOG) {
                if (install && !CarrotPlugins.isLoaded(info.id))
                    await CarrotPlugins.install(info.id).catch(error => flToast(error.message));
                else if (!install && CarrotPlugins.isInstalled(info.id))
                    CarrotPlugins.uninstall(info.id);
            }
            this._render();
        }
        _render() {
            this._list.innerHTML = "";
            let installedKB = 0, count = 0;
            for (const info of CARROT_PLUGIN_CATALOG) {
                const installed = CarrotPlugins.isInstalled(info.id);
                const loaded = CarrotPlugins.isLoaded(info.id);
                if (installed) {
                    installedKB += info.sizeKB;
                    count++;
                }
                const status = HTML.div({ class: "cb-status", style: `color: ${loaded ? "#7bd88f" : installed ? "#ffcb6b" : "inherit"};` }, loaded ? "✓ Installed" : installed ? "Downloading…" : info.sizeKB + " KB");
                const actions = HTML.div({ class: "cb-manager-actions" }, status);
                if (installed) {
                    if (loaded && info.kind != "effect")
                        actions.appendChild(CarrotUI.button("Open", () => {
                            this.close();
                            if (info.kind == "instrument")
                                carrotLoadInstrumentPlugin(this._editor, info.id, true);
                            else
                                carrotOpenTool(this._editor, info.id);
                        }, { primary: true, title: info.kind == "instrument" ? "Load it on a new channel" : "" }));
                    if (loaded && info.kind == "effect")
                        actions.appendChild(CarrotUI.button("Add", () => {
                            this.close();
                            carrotAddInsert(this._editor, info.id, false);
                        }, { primary: true, title: "Add it to the current instrument" }));
                    actions.appendChild(CarrotUI.button("Uninstall", () => {
                        CarrotPlugins.uninstall(info.id);
                        flToast(info.name + " uninstalled");
                    }));
                }
                else {
                    actions.appendChild(CarrotUI.button("Install", async () => {
                        status.textContent = "Downloading…";
                        try {
                            await CarrotPlugins.install(info.id);
                            flToast(info.name + " installed — press Tab to launch it");
                            if (typeof carrotUISound == "function")
                                carrotUISound("success");
                        }
                        catch (error) {
                            flToast(error.message || String(error));
                            this._render();
                        }
                    }, { primary: true }));
                }
                const kind = info.kind == "instrument" ? "Generator" : info.kind == "effect" ? "Effect" : "Tool";
                this._list.appendChild(HTML.div({ class: "cb-manager-card" }, HTML.div({ class: "cb-launcher-icon", style: `background: ${info.color};` }, info.icon), HTML.div({ style: "flex: 1; min-width: 0;" }, HTML.div(HTML.b(info.name), " ", HTML.span({ class: "cb-badge" }, kind), info.alt ? " " : "", info.alt ? HTML.span({ class: "cb-badge" }, info.alt + "-style") : ""), HTML.p(info.blurb)), actions));
            }
            const builtins = HTML.div({ class: "cb-hint", style: "margin-top: 6px;" }, "Always built in: " + CARROT_BUILTIN_PLUGINS.map(b => b.name).join(", ") + ".");
            this._list.appendChild(builtins);
            this._summary.textContent = count + " of " + CARROT_PLUGIN_CATALOG.length + " installed · " + installedKB + " KB";
        }
        onClose() {
            const index = CarrotPlugins._listeners.indexOf(this._listener);
            if (index != -1)
                CarrotPlugins._listeners.splice(index, 1);
        }
    }
    // ------------------------------------------------------------ plugin API
    // Everything a plugin file may use. Built lazily so it can reference
    // anything in the bundle.
    function carrotPluginApi() {
        if (carrotPluginApi._api)
            return carrotPluginApi._api;
        carrotPluginApi._api = {
            HTML, SVG, Config, FLConfig, CarrotDSP, CarrotADSR, CarrotSVF, CarrotBiquad, CarrotDelayLine, CarrotFX, CarrotUI,
            CarrotWavetable, CarrotWavetableBank, FLSampleBank, FLSoundFactory, FLKitLibrary, FLLoops, CarrotIdeaGen, CARROT_GEN_STYLES, carrotWriteNotes, carrotNormalizeNotes, flToast, flMidiName, flSetupCanvas, flCss, flResolve, flCloneJson,
            carrotFxRack, carrotWriteNotes, carrotSongScale, carrotSyncOptions, carrotSyncBeats, carrotFormatValue, carrotToNorm, carrotFromNorm,
            CarrotWindows, CarrotPlugins, carrotNewChannel, carrotNameChannel,
            // song editing (for tools that write into the song)
            Note, Pattern, Instrument, ChangeGroup, ChangeFL, ChangeBarCount, ChangeChannelBar, ChangeInstrumentsFlags, ChangeNoteAdded, ChangeNoteTruncate, ChangeEnsurePatternExists, ChangePatternNumbers,
            addStyle: (css) => document.head.appendChild(HTML.style({ type: "text/css" }, css)),
        };
        return carrotPluginApi._api;
    }
    // ------------------------------------------------------- writing notes
    // Scale info for generators: pitch classes (relative to the song key) that
    // are in the song's scale.
    function carrotSongScale(song) {
        const flags = Config.scales[song.scale].flags;
        const classes = [];
        for (let i = 0; i < 12; i++)
            if (flags[i])
                classes.push(i);
        return { classes, flags, key: song.key, name: Config.scales[song.scale].name };
    }
    // bars: array (one per bar) of note lists [{start, end, pitches, size}] in
    // parts (Config.partsPerBeat per beat). Writes into `channel` starting at
    // `startBar`, replacing what's there (options.replace) and making new
    // patterns where needed. Returns true if anything was written.
    // BeepBox patterns hold one note at a time (a chord is one note with several
    // pitches), sorted and never overlapping. Notes that start together become one
    // chord; a note that is still sounding when the next one starts is cut there.
    function carrotNormalizeNotes(notes, barLength, maxPitch) {
        const list = [];
        for (const n of notes || []) {
            if (!n || !n.pitches)
                continue;
            const start = Math.max(0, Math.min(barLength - 1, Math.round(n.start)));
            const end = Math.max(start + 1, Math.min(barLength, Math.round(n.end)));
            const pitches = n.pitches.map(p => Math.max(0, Math.min(maxPitch, Math.round(p)))).filter(p => isFinite(p));
            if (pitches.length == 0)
                continue;
            const size = n.size != undefined && isFinite(n.size) ? Math.max(0, Math.min(Config.noteSizeMax, Math.round(n.size))) : Config.noteSizeMax;
            list.push({ start, end, pitches, size, pins: n.pins });
        }
        list.sort((a, b) => a.start - b.start || b.end - a.end);
        const out = [];
        for (const n of list) {
            const last = out[out.length - 1];
            if (last && last.start == n.start) {
                for (const p of n.pitches)
                    if (last.pitches.indexOf(p) == -1)
                        last.pitches.push(p);
                last.size = Math.max(last.size, n.size);
                if (last.pitches.length > 1)
                    last.pins = null;
                continue;
            }
            if (last && last.end > n.start) {
                last.end = n.start;
                if (last.pins)
                    last.pins = last.pins.filter(pin => pin.time <= last.end - last.start);
            }
            out.push({ start: n.start, end: n.end, pitches: n.pitches.slice(), size: n.size, pins: n.pins ? n.pins.slice() : null });
        }
        for (const n of out)
            n.pitches = Array.from(new Set(n.pitches)).sort((a, b) => a - b).slice(0, Config.maxChordSize);
        return out;
    }
    function carrotWriteNotes(doc, bars, options = {}) {
        const song = doc.song;
        const channel = options.channel != undefined ? options.channel : doc.channel;
        const startBar = options.startBar != undefined ? options.startBar : doc.bar;
        const replace = options.replace != false;
        const isNoise = song.getChannelIsNoise(channel);
        const barLength = song.beatsPerBar * Config.partsPerBeat;
        const maxPitch = isNoise ? Config.drumCount - 1 : Config.maxPitch;
        const group = new ChangeGroup();
        // Channels added a moment ago are not known to the document's
        // per-channel state until it is next validated.
        if (!doc.recentPatternInstruments[channel] && typeof doc._validateDocState == "function")
            doc._validateDocState();
        if (!doc.recentPatternInstruments[channel])
            doc.recentPatternInstruments[channel] = [0];
        const needed = startBar + bars.length;
        if (needed > song.barCount) {
            if (needed > Config.barCountMax)
                bars = bars.slice(0, Config.barCountMax - startBar);
            group.append(new ChangeBarCount(doc, Math.min(Config.barCountMax, needed), false));
        }
        let wrote = false;
        for (let b = 0; b < bars.length; b++) {
            const bar = startBar + b;
            const notes = bars[b];
            if (!notes || (notes.length == 0 && !replace))
                continue;
            if (options.freshPatterns && song.channels[channel].bars[bar] != 0) {
                // Copy-on-write: don't change other bars that share this pattern.
                let shared = false;
                const patternIndex = song.channels[channel].bars[bar];
                for (let other = 0; other < song.barCount; other++)
                    if (other != bar && song.channels[channel].bars[other] == patternIndex)
                        shared = true;
                if (shared)
                    group.append(new ChangePatternNumbers(doc, 0, bar, channel, 1, 1));
            }
            group.append(new ChangeEnsurePatternExists(doc, channel, bar));
            const pattern = song.getPattern(channel, bar);
            if (pattern == null)
                continue;
            if (replace && pattern.notes.length > 0)
                group.append(new ChangeNoteTruncate(doc, pattern, 0, barLength));
            for (const n of carrotNormalizeNotes(notes, barLength, maxPitch)) {
                const note = new Note(n.pitches[0], n.start, n.end, n.size, isNoise);
                note.pitches = n.pitches;
                if (n.pins && n.pins.length >= 2) {
                    // Pitch bends / volume shapes: times relative to the note start.
                    const length = n.end - n.start;
                    const pins = [];
                    for (const pin of n.pins) {
                        const time = Math.max(0, Math.min(length, Math.round(pin.time)));
                        if (pins.length > 0 && time <= pins[pins.length - 1].time)
                            continue;
                        pins.push(makeNotePin(Math.round(pin.interval || 0), time, Math.max(0, Math.min(Config.noteSizeMax, pin.size != undefined ? Math.round(pin.size) : n.size))));
                    }
                    if (pins.length >= 2 && pins[0].time == 0) {
                        if (pins[pins.length - 1].time != length)
                            pins.push(makeNotePin(pins[pins.length - 1].interval, length, pins[pins.length - 1].size));
                        note.pins = pins;
                    }
                }
                group.append(new ChangeNoteAdded(doc, pattern, note, pattern.notes.length));
                wrote = true;
            }
        }
        if (wrote || replace) {
            group.append(new ChangeChannelBar(doc, channel, startBar));
            doc.record(group);
        }
        return wrote;
    }
