/*
 * Mangler FX - a creative multi-effect rack for CarrotBox.
 *
 * Chain up to 8 effects (distortion, bitcrusher, filter sweeps, chorus,
 * phaser, flanger, delay, reverb, glitch repeats, tape stop...), bind four
 * macro knobs to any parameter in the chain and start from a bank of
 * presets. Works as an instrument effect or on the master bus.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, carrotFxRack, carrotToNorm, carrotFromNorm } = A;

    const MAX_SLOTS = 8;
    const MACRO_COUNT = 4;
    const TARGETS_PER_MACRO = 4;

    A.addStyle(`
.cb-mangler-macros { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.cb-mangler-macro { border: 1px solid var(--ui-widget-background, #444); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 4px; align-items: center; background: rgba(127,127,127,0.05); }
.cb-mangler-macro input.cb-mangler-name { width: 100%; box-sizing: border-box; height: 20px; font-size: 11px; text-align: center; border: none; border-radius: 4px; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); }
.cb-mangler-macro .cb-knob { width: 64px; }
.cb-mangler-macro .cb-knob svg { width: 48px; height: 48px; }
.cb-mangler-target { display: grid; grid-template-columns: 38px minmax(0, 1fr) 20px; gap: 3px; width: 100%; align-items: center; }
.cb-mangler-target select { min-width: 0; width: 100%; }
.cb-mangler-target .cb-amount { grid-column: 1 / 3; display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--secondary-text, #aaa); }
.cb-mangler-target .cb-amount input { flex: 1; min-width: 0; }
.cb-mangler-target { padding: 3px 0; border-top: 1px dashed rgba(127,127,127,0.25); }
.cb-mangler-flow { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 22px; }
.cb-mangler-chip { padding: 2px 8px; border-radius: 10px; font-size: 11px; background: var(--cb-plugin-color, #f78c6c); color: #111; }
.cb-mangler-chip.cb-off { opacity: 0.35; }
.cb-mangler-arrow { color: var(--secondary-text, #aaa); font-size: 11px; }
`);

    // ---------------------------------------------------------------- params
    function fx(type, over) {
        return Object.assign(CarrotFX.defaults(type), over || {});
    }
    function macro(name, targets) {
        return { name, value: 0, targets: targets || [] };
    }
    function defaultMacros() {
        return [macro("Macro 1"), macro("Macro 2"), macro("Macro 3"), macro("Macro 4")];
    }
    function blank() {
        return { chain: [], macros: defaultMacros(), mix: 1, inGain: 0, outGain: 0 };
    }
    function make(chain, macros, extra) {
        const p = blank();
        p.chain = chain;
        (macros || []).forEach((m, i) => { p.macros[i] = m; });
        return Object.assign(p, extra || {});
    }
    function defaultParams() {
        return make(
            [fx("filter", { mode: 1, cutoff: 16000, res: 0.2 }), fx("delay", { time: 7, feedback: 0.35, mix: 0.2 }), fx("reverb", { size: 0.6, mix: 0.18 })],
            [
                macro("Sweep", [{ slot: 0, key: "cutoff", amount: -0.85 }]),
                macro("Echo", [{ slot: 1, key: "mix", amount: 0.5 }, { slot: 1, key: "feedback", amount: 0.3 }]),
                macro("Space", [{ slot: 2, key: "mix", amount: 0.5 }, { slot: 2, key: "size", amount: 0.3 }]),
                macro("Grit"),
            ]);
    }
    // Always returns a complete, well-formed params object.
    function normalize(params) {
        const p = params && typeof params == "object" ? params : {};
        if (!Array.isArray(p.chain)) p.chain = [];
        if (p.chain.length > MAX_SLOTS) p.chain.length = MAX_SLOTS;
        if (!Array.isArray(p.macros)) p.macros = [];
        while (p.macros.length < MACRO_COUNT) p.macros.push(macro("Macro " + (p.macros.length + 1)));
        for (const m of p.macros) {
            if (!Array.isArray(m.targets)) m.targets = [];
            if (typeof m.value != "number" || !isFinite(m.value)) m.value = 0;
        }
        if (typeof p.mix != "number") p.mix = 1;
        if (typeof p.inGain != "number") p.inGain = 0;
        if (typeof p.outGain != "number") p.outGain = 0;
        return p;
    }

    const PRESETS = [
        { group: "Starters", name: "Clean Slate", params: blank() },
        { group: "Starters", name: "Space Sweep", params: defaultParams() },
        { group: "Starters", name: "Wide Open", params: make(
            [fx("widener", { width: 1.6 }), fx("chorus", { rate: 0.5, depth: 0.6, mix: 0.4 }), fx("reverb", { size: 0.75, mix: 0.25 })],
            [macro("Width", [{ slot: 0, key: "width", amount: 0.5 }]), macro("Chorus", [{ slot: 1, key: "mix", amount: 0.5 }]), macro("Room", [{ slot: 2, key: "mix", amount: 0.6 }, { slot: 2, key: "size", amount: 0.25 }]), macro("Macro 4")]) },
        { group: "Starters", name: "Tape Warble", params: make(
            [fx("lofi", { crackle: 0.25, hiss: 0.2, wow: 0.7, tone: 6500 }), fx("chorus", { rate: 0.3, depth: 0.35, mix: 0.3 }), fx("eq3", { low: 2, high: -3 })],
            [macro("Wobble", [{ slot: 0, key: "wow", amount: 0.3 }]), macro("Dust", [{ slot: 0, key: "crackle", amount: 0.7 }, { slot: 0, key: "hiss", amount: 0.5 }]), macro("Dark", [{ slot: 0, key: "tone", amount: -0.6 }]), macro("Macro 4")]) },
        { group: "Rhythmic", name: "Stutter Gate", params: make(
            [fx("tremolo", { rate: 3, depth: 1, shape: 1 }), fx("glitch", { chance: 0.35, grid: 1, repeat: 1 }), fx("delay", { time: 6, feedback: 0.3, mix: 0.2 })],
            [macro("Gate", [{ slot: 0, key: "depth", amount: -0.9 }]), macro("Glitch", [{ slot: 1, key: "chance", amount: 0.65 }]), macro("Echo", [{ slot: 2, key: "mix", amount: 0.5 }]), macro("Macro 4")]) },
        { group: "Rhythmic", name: "Halftime Brake", params: make(
            [fx("tapestop", { every: 1, length: 1.5 }), fx("filter", { mode: 0, cutoff: 9000, res: 0.15 }), fx("reverb", { size: 0.85, mix: 0.25 })],
            [macro("Brake", [{ slot: 0, key: "length", amount: 0.6 }]), macro("Dull", [{ slot: 1, key: "cutoff", amount: -0.7 }]), macro("Wash", [{ slot: 2, key: "mix", amount: 0.5 }]), macro("Macro 4")]) },
        { group: "Rhythmic", name: "Pulse Pan", params: make(
            [fx("tremolo", { rate: 6, depth: 0.85, shape: 0, pan: 1 }), fx("phaser", { rate: 0.25, depth: 0.8, mix: 0.5 })],
            [macro("Depth", [{ slot: 0, key: "depth", amount: 0.15 }]), macro("Phase", [{ slot: 1, key: "feedback", amount: 0.45 }]), macro("Macro 3"), macro("Macro 4")]) },
        { group: "Destruction", name: "Bit Furnace", params: make(
            [fx("crusher", { bits: 6, rate: 3, mix: 0.7 }), fx("distortion", { mode: 1, drive: 16, tone: 6000, mix: 0.8 }), fx("filter", { mode: 1, cutoff: 5000, res: 0.35 })],
            [macro("Crush", [{ slot: 0, key: "bits", amount: -0.55 }, { slot: 0, key: "rate", amount: 0.3 }]), macro("Drive", [{ slot: 1, key: "drive", amount: 0.4 }]), macro("Filter", [{ slot: 2, key: "cutoff", amount: 0.5 }]), macro("Macro 4")]) },
        { group: "Destruction", name: "Fold Machine", params: make(
            [fx("distortion", { mode: 3, drive: 20, tone: 9000, out: -3 }), fx("multiband", { depth: 0.5, time: 0.5 }), fx("widener", { width: 1.3 })],
            [macro("Fold", [{ slot: 0, key: "drive", amount: 0.5 }]), macro("Squash", [{ slot: 1, key: "depth", amount: 0.5 }]), macro("Width", [{ slot: 2, key: "width", amount: 0.5 }]), macro("Macro 4")]) },
        { group: "Destruction", name: "Radio Wreck", params: make(
            [fx("filter", { mode: 3, cutoff: 1800, res: 0.45 }), fx("distortion", { mode: 2, drive: 22, tone: 4500, mix: 0.7 }), fx("crusher", { bits: 9, rate: 2, mix: 0.4 })],
            [macro("Tune", [{ slot: 0, key: "cutoff", amount: 0.5 }]), macro("Dirt", [{ slot: 1, key: "drive", amount: 0.4 }]), macro("Crunch", [{ slot: 2, key: "mix", amount: 0.6 }]), macro("Macro 4")]) },
        { group: "Space", name: "Dub Echo", params: make(
            [fx("filter", { mode: 2, cutoff: 250, res: 0.1 }), fx("delay", { time: 8, feedback: 0.6, pingpong: 1, tone: 3500, mix: 0.45 }), fx("reverb", { size: 0.7, mix: 0.2 })],
            [macro("Feedback", [{ slot: 1, key: "feedback", amount: 0.3 }]), macro("Tone", [{ slot: 1, key: "tone", amount: -0.5 }]), macro("Reverb", [{ slot: 2, key: "mix", amount: 0.5 }]), macro("Macro 4")]) },
        { group: "Space", name: "Cathedral", params: make(
            [fx("reverb", { size: 0.97, damp: 0.35, width: 1, predelay: 45, mix: 0.55 }), fx("eq3", { low: -4, high: -2 })],
            [macro("Size", [{ slot: 0, key: "size", amount: 0.03 }, { slot: 0, key: "mix", amount: 0.4 }]), macro("Damp", [{ slot: 0, key: "damp", amount: 0.5 }]), macro("Macro 3"), macro("Macro 4")]) },
        { group: "Space", name: "Jet Flange", params: make(
            [fx("flanger", { rate: 0.12, depth: 0.9, feedback: 0.7, mix: 0.7 }), fx("phaser", { rate: 0.2, depth: 0.6, feedback: 0.5, mix: 0.4 }), fx("delay", { time: 9, feedback: 0.35, mix: 0.2 })],
            [macro("Flange", [{ slot: 0, key: "feedback", amount: 0.25 }]), macro("Phase", [{ slot: 1, key: "mix", amount: 0.5 }]), macro("Echo", [{ slot: 2, key: "mix", amount: 0.4 }]), macro("Macro 4")]) },
    ];

    // ------------------------------------------------------------------- DSP
    function createState(sampleRate) {
        return { fxStates: [], scratch: [], dryL: null, dryR: null, sampleRate };
    }
    // Copies the chain into scratch objects (so macros never edit saved values).
    function applyMacros(state, p) {
        const chain = p.chain;
        const scratch = state.scratch;
        for (let i = 0; i < chain.length; i++) {
            const slot = chain[i];
            let s = scratch[i];
            if (!s) s = scratch[i] = {};
            for (const key in s) if (!(key in slot)) delete s[key];
            Object.assign(s, slot);
        }
        scratch.length = chain.length;
        for (const m of p.macros) {
            if (!m.value) continue;
            for (const t of m.targets) {
                const s = scratch[t.slot | 0];
                if (!s) continue;
                const def = CarrotFX.types[s.type];
                if (!def) continue;
                const spec = def.params.find(x => x.key == t.key);
                if (!spec || spec.options) continue;
                const base = typeof s[t.key] == "number" ? s[t.key] : spec.def;
                const norm = carrotToNorm(spec, base) + (t.amount || 0) * m.value;
                s[t.key] = carrotFromNorm(spec, norm);
            }
        }
        return scratch;
    }
    function process(state, params, L, R, start, end, ctx) {
        const p = normalize(params);
        const n = end - start;
        if (n <= 0) return;
        const mix = p.mix;
        const inGain = CarrotDSP.dbToGain(p.inGain);
        const outGain = CarrotDSP.dbToGain(p.outGain);
        if (p.chain.length == 0 && inGain == 1 && outGain == 1) return;
        if (!state.dryL || state.dryL.length < n) {
            state.dryL = new Float32Array(Math.max(n, 2048));
            state.dryR = new Float32Array(Math.max(n, 2048));
        }
        const dryL = state.dryL, dryR = state.dryR;
        for (let i = 0; i < n; i++) {
            dryL[i] = L[start + i];
            dryR[i] = R[start + i];
            if (inGain != 1) { L[start + i] *= inGain; R[start + i] *= inGain; }
        }
        const chain = applyMacros(state, p);
        CarrotFX.processChain(state.fxStates, chain, L, R, start, end, ctx);
        for (let i = 0; i < n; i++) {
            const j = start + i;
            L[j] = (dryL[i] + (L[j] - dryL[i]) * mix) * outGain;
            R[j] = (dryR[i] + (R[j] - dryR[i]) * mix) * outGain;
        }
    }

    // -------------------------------------------------------------- randomize
    const RANDOM_POOL = ["distortion", "crusher", "filter", "chorus", "flanger", "phaser", "delay", "reverb", "glitch", "ringmod", "tremolo", "lofi", "widener", "multiband", "tapestop"];
    function randomize() {
        const rnd = Math.random;
        const p = blank();
        const count = 3 + Math.floor(rnd() * 3);
        const pool = RANDOM_POOL.slice();
        for (let i = 0; i < count && pool.length; i++) {
            const type = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
            const slot = CarrotFX.defaults(type);
            for (const spec of CarrotFX.types[type].params) {
                if (spec.options) { if (rnd() < 0.5) slot[spec.key] = Math.floor(rnd() * spec.options.length); continue; }
                if (spec.key == "mix") { slot.mix = 0.25 + rnd() * 0.6; continue; }
                slot[spec.key] = carrotFromNorm(spec, carrotToNorm(spec, spec.def) * 0.4 + rnd() * 0.6);
            }
            p.chain.push(slot);
        }
        for (let m = 0; m < MACRO_COUNT; m++) {
            const slotIndex = Math.floor(rnd() * p.chain.length);
            const def = CarrotFX.types[p.chain[slotIndex].type];
            const numeric = def.params.filter(x => !x.options);
            if (numeric.length == 0) continue;
            const spec = numeric[Math.floor(rnd() * numeric.length)];
            p.macros[m].name = spec.label;
            p.macros[m].targets.push({ slot: slotIndex, key: spec.key, amount: (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.5) });
        }
        return p;
    }

    // ------------------------------------------------------------------- UI
    function buildEditor(host) {
        normalize(host.params());
        const root = HTML.div();

        // Top bar: input/mix/output.
        const top = CarrotUI.row(
            host.knob("inGain", { label: "Input", min: -24, max: 24, def: 0, unit: "dB", small: true }),
            host.knob("mix", { label: "Dry/Wet", min: 0, max: 1, def: 1, small: true, format: v => Math.round(v * 100) + "%" }),
            host.knob("outGain", { label: "Output", min: -24, max: 12, def: 0, unit: "dB", small: true }));
        root.appendChild(CarrotUI.section("Mix", top));

        // Signal flow strip.
        const flow = HTML.div({ class: "cb-mangler-flow" });
        const renderFlow = () => {
            const p = normalize(host.params());
            flow.innerHTML = "";
            flow.appendChild(HTML.span({ class: "cb-mangler-arrow" }, "In"));
            if (p.chain.length == 0) flow.appendChild(HTML.span({ class: "cb-hint" }, " (empty - add an effect below)"));
            p.chain.forEach((slot) => {
                const def = CarrotFX.types[slot.type];
                flow.appendChild(HTML.span({ class: "cb-mangler-arrow" }, ">"));
                flow.appendChild(HTML.span({ class: "cb-mangler-chip" + (slot.on === false ? " cb-off" : "") }, def ? def.name : slot.type));
            });
            flow.appendChild(HTML.span({ class: "cb-mangler-arrow" }, "> Out"));
        };
        root.appendChild(CarrotUI.section("Signal flow", flow));

        // Macros.
        const macroGrid = HTML.div({ class: "cb-mangler-macros" });
        let macroSignature = "";
        const slotLabel = (p, i) => (i + 1) + ". " + ((CarrotFX.types[p.chain[i].type] || {}).name || "?");
        const renderMacros = (force) => {
            const p = normalize(host.params());
            const signature = p.chain.map(s => s.type).join(",") + "|" + p.macros.map(m => m.name + ":" + m.targets.map(t => t.slot + t.key).join("+")).join("/");
            if (!force && signature == macroSignature) return;
            macroSignature = signature;
            macroGrid.innerHTML = "";
            p.macros.forEach((m, mi) => {
                const name = HTML.input({ type: "text", class: "cb-mangler-name", value: m.name || ("Macro " + (mi + 1)), maxlength: "16", title: "Rename this macro" });
                name.addEventListener("keydown", e => e.stopPropagation());
                name.addEventListener("change", () => host.set("macros." + mi + ".name", name.value.slice(0, 16)));
                const knob = host.knob("macros." + mi + ".value", { label: "", min: 0, max: 1, def: 0, format: v => Math.round(v * 100) + "%", title: m.name || "Macro" });
                const box = HTML.div({ class: "cb-mangler-macro" }, name, knob);
                m.targets.forEach((t, ti) => {
                    const slot = p.chain[t.slot];
                    const def = slot && CarrotFX.types[slot.type];
                    const slotSelect = HTML.select({ class: "cb-select", title: "Effect" });
                    p.chain.forEach((s, i) => slotSelect.appendChild(HTML.option({ value: i }, String(i + 1))));
                    slotSelect.value = String(Math.min(t.slot | 0, Math.max(0, p.chain.length - 1)));
                    const numeric = def ? def.params.filter(x => !x.options) : [];
                    const keySelect = HTML.select({ class: "cb-select", title: "Parameter" });
                    numeric.forEach(x => keySelect.appendChild(HTML.option({ value: x.key }, x.label)));
                    keySelect.value = t.key;
                    const remove = HTML.button({ type: "button", class: "cb-mini-button", title: "Remove this assignment" }, "x");
                    const amount = HTML.input({ type: "range", min: "-100", max: "100", step: "1", value: String(Math.round((t.amount || 0) * 100)), title: "How far the macro pushes this parameter" });
                    for (const el of [slotSelect, keySelect, amount]) el.addEventListener("keydown", e => e.stopPropagation());
                    slotSelect.addEventListener("change", () => {
                        const idx = +slotSelect.value;
                        const d = CarrotFX.types[p.chain[idx].type];
                        const first = d.params.find(x => !x.options);
                        m.targets[ti] = { slot: idx, key: first ? first.key : "", amount: t.amount || 0.5 };
                        host.changed(); renderMacros(true);
                    });
                    keySelect.addEventListener("change", () => { t.key = keySelect.value; host.changed(); });
                    amount.addEventListener("input", () => { t.amount = (+amount.value) / 100; host.changed(); });
                    remove.addEventListener("click", () => { m.targets.splice(ti, 1); host.changed(); renderMacros(true); });
                    box.appendChild(HTML.div({ class: "cb-mangler-target" }, slotSelect, keySelect, remove, HTML.div({ class: "cb-amount" }, "Amount", amount)));
                });
                const add = CarrotUI.button("+ Assign", () => {
                    if (p.chain.length == 0) { host.toast("Add an effect to the rack first."); return; }
                    if (m.targets.length >= TARGETS_PER_MACRO) { host.toast("A macro can control up to " + TARGETS_PER_MACRO + " parameters."); return; }
                    const slot = p.chain[0];
                    const first = CarrotFX.types[slot.type].params.find(x => !x.options);
                    m.targets.push({ slot: 0, key: first ? first.key : "", amount: 0.5 });
                    host.changed(); renderMacros(true);
                }, { title: "Make this macro control an effect parameter" });
                box.appendChild(add);
                macroGrid.appendChild(box);
            });
        };
        root.appendChild(CarrotUI.section("Macros", macroGrid, CarrotUI.hint("Turn a macro up to push its assigned parameters away from the values set in the rack. Great for sweeps and drops: assign a filter cutoff, a delay mix and a reverb size to one knob.")));

        // The effect rack itself.
        const rack = carrotFxRack(host, "chain", { max: MAX_SLOTS, onRender: () => { renderFlow(); renderMacros(false); } });
        root.appendChild(CarrotUI.section("Effects (top to bottom)", rack));

        host.onRefresh(() => { renderFlow(); renderMacros(false); });
        renderFlow();
        renderMacros(true);
        return root;
    }

    B.CarrotPlugins.register({
        id: "mangler",
        width: 700,
        defaultParams,
        presets: PRESETS,
        randomize,
        createState,
        process,
        buildEditor,
    });
})();
