/*
 * Curvebox - a wave-shaping multi-effect for CarrotBox (in the style of ShaperBox 3).
 *
 * Eleven shapers - Time, Pitch, Filter, Liquid, Drive, Crush, Noise, Volume,
 * Pan, Width and Reverb - each driven by its own curve that you draw. Curves
 * loop in time with the song (1/32 note to 8 bars, straight, triplet or
 * dotted, with swing) or restart on every hit of the incoming audio, and any
 * shaper can work on the whole signal or only on the low, middle or high band.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, CarrotSVF } = A;

    // ------------------------------------------------------------------ tables
    const RATE_NAMES = ["8 bars", "4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16", "1/32", "1/2 T", "1/4 T", "1/8 T", "1/16 T", "1/2 D", "1/4 D", "1/8 D"];
    function rateBeats(index, beatsPerBar) {
        const bar = beatsPerBar > 0 ? beatsPerBar : 4;
        const beats = [8 * bar, 4 * bar, 2 * bar, bar, 2, 1, 0.5, 0.25, 0.125, 4 / 3, 2 / 3, 1 / 3, 1 / 6, 3, 1.5, 0.75][index | 0];
        return beats || bar;
    }
    const GRIDS = [4, 8, 16, 32, 3, 6, 12, 24];
    const GRID_NAMES = ["4", "8", "16", "32", "3 (T)", "6 (T)", "12 (T)", "24 (T)"];
    const BANDS = ["Full", "Low", "Mid", "High"];
    const TRIGGERS = ["Song tempo", "Audio hits"];
    const TABLE = 1024;
    const HALF_PI = Math.PI / 2;

    // Each shaper: what the top and the bottom of its curve mean, its colour and its own controls.
    const SHAPERS = [
        { id: "time", name: "Time", color: "#ffb347", top: "Top: plays in time", bottom: "Bottom: one whole cycle behind (draw slopes for slow-downs, stops and reverses)", wave: "halfTime", params: [
            { key: "mix", label: "Mix", min: 0, max: 1, def: 1, percent: true },
        ] },
        { id: "pitch", name: "Pitch", color: "#c3e88d", top: "Top: up by the range", bottom: "Bottom: down by the range (middle = no change)", wave: "octaves", params: [
            { key: "range", label: "Range", min: 1, max: 24, def: 12, step: 1, unit: " st" },
            { key: "grain", label: "Grain", min: 20, max: 120, def: 50, unit: " ms" },
            { key: "mix", label: "Mix", min: 0, max: 1, def: 1, percent: true },
        ] },
        { id: "filter", name: "Filter", color: "#4fc3f7", top: "Top: the high frequency", bottom: "Bottom: the low frequency", wave: "sine", params: [
            { key: "type", label: "Type", options: ["Low pass", "High pass", "Band pass", "Notch", "Low pass 24"], def: 0 },
            { key: "lo", label: "Low", min: 20, max: 20000, def: 150, unit: " Hz", curve: "exp" },
            { key: "hi", label: "High", min: 20, max: 20000, def: 16000, unit: " Hz", curve: "exp" },
            { key: "res", label: "Resonance", min: 0, max: 1, def: 0.3, percent: true },
        ] },
        { id: "liquid", name: "Liquid", color: "#80deea", top: "Top and bottom: the two ends of the sweep", bottom: "", wave: "sine", params: [
            { key: "mode", label: "Mode", options: ["Chorus", "Flanger", "Phaser", "Vibrato"], def: 1 },
            { key: "fb", label: "Feedback", min: -0.95, max: 0.95, def: 0.5, percent: true },
            { key: "mix", label: "Mix", min: 0, max: 1, def: 0.6, percent: true },
        ] },
        { id: "drive", name: "Drive", color: "#ff7043", top: "Top: full drive", bottom: "Bottom: clean", wave: "sawDown", params: [
            { key: "type", label: "Type", options: ["Soft clip", "Hard clip", "Tube", "Wavefold", "Rectify", "Sine shaper"], def: 2 },
            { key: "drive", label: "Drive", min: 0, max: 48, def: 24, unit: " dB" },
            { key: "tone", label: "Tone", min: 300, max: 20000, def: 9000, unit: " Hz", curve: "exp" },
            { key: "mix", label: "Mix", min: 0, max: 1, def: 1, percent: true },
        ] },
        { id: "crush", name: "Crush", color: "#f06292", top: "Top: fully crushed", bottom: "Bottom: clean", wave: "square", params: [
            { key: "bits", label: "Bits", min: 1, max: 16, def: 4, step: 0.1 },
            { key: "down", label: "Downsample", min: 1, max: 40, def: 10, step: 0.1, unit: "x" },
            { key: "mix", label: "Mix", min: 0, max: 1, def: 1, percent: true },
        ] },
        { id: "noise", name: "Noise", color: "#bdbdbd", top: "Top: full noise", bottom: "Bottom: no noise", wave: "swell", params: [
            { key: "color", label: "Colour", options: ["White", "Pink", "Vinyl", "Tape hiss"], def: 1 },
            { key: "level", label: "Level", min: -60, max: 0, def: -18, unit: " dB" },
            { key: "follow", label: "Follow", min: 0, max: 1, def: 0.5, percent: true, title: "How much the noise follows the loudness of the audio" },
            { key: "tone", label: "Tone", min: 500, max: 20000, def: 12000, unit: " Hz", curve: "exp" },
            { key: "width", label: "Width", min: 0, max: 1, def: 1, percent: true },
        ] },
        { id: "volume", name: "Volume", color: "#ffd54f", top: "Top: full volume", bottom: "Bottom: silent", wave: "pump", params: [] },
        { id: "pan", name: "Pan", color: "#a5d6a7", top: "Top: right", bottom: "Bottom: left (middle = centre)", wave: "sine", params: [] },
        { id: "width", name: "Width", color: "#b39ddb", top: "Top: extra wide", bottom: "Bottom: mono (middle = as it is)", wave: "triangle", params: [] },
        { id: "reverb", name: "Reverb", color: "#90caf9", top: "Top: full send into the reverb", bottom: "Bottom: no send", wave: "swell", params: [
            { key: "size", label: "Size", min: 0, max: 1, def: 0.75, percent: true },
            { key: "damp", label: "Damping", min: 0, max: 1, def: 0.4, percent: true },
            { key: "predelay", label: "Pre-delay", min: 0, max: 200, def: 20, unit: " ms" },
            { key: "level", label: "Level", min: 0, max: 1.5, def: 0.7, percent: true },
        ] },
    ];
    const ORDER = SHAPERS.map(s => s.id);
    const BY_ID = {};
    for (const s of SHAPERS) BY_ID[s.id] = s;

    // ------------------------------------------------------------------ curves
    // A curve is a list of nodes [x, y, bend]: x runs from 0 to 1 (one cycle), y is 0..1 and
    // bend (-1..1) bends the segment to the next node. Two nodes with the same x make a jump.
    const r3 = (v) => Math.round(v * 1000) / 1000;
    function segment(y0, y1, bend, t) {
        if (!bend) return y0 + (y1 - y0) * t;
        return y0 + (y1 - y0) * Math.pow(t, Math.pow(4, bend));
    }
    function cleanWave(w) {
        let nodes = Array.isArray(w) ? w.filter(n => Array.isArray(n) && n.length >= 2).map(n => [
            CarrotDSP.clamp(+n[0] || 0, 0, 1), CarrotDSP.clamp(+n[1] || 0, 0, 1), CarrotDSP.clamp(+n[2] || 0, -1, 1),
        ]) : [];
        nodes.sort((a, b) => a[0] - b[0]);
        if (nodes.length == 0) nodes = [[0, 1, 0], [1, 1, 0]];
        if (nodes[0][0] != 0) nodes.unshift([0, nodes[0][1], 0]);
        if (nodes[nodes.length - 1][0] != 1) nodes.push([1, nodes[nodes.length - 1][1], 0]);
        if (nodes.length > 160) nodes.length = 160;
        return nodes;
    }
    function waveValue(nodes, x) {
        let k = 0;
        while (k < nodes.length - 2 && nodes[k + 1][0] <= x) k++;
        const a = nodes[k], b = nodes[k + 1] || a;
        const w = b[0] - a[0];
        return w <= 1e-9 ? b[1] : segment(a[1], b[1], a[2] || 0, CarrotDSP.clamp((x - a[0]) / w, 0, 1));
    }
    function buildTable(nodes) {
        const t = new Float32Array(TABLE + 1);
        let k = 0;
        for (let i = 0; i <= TABLE; i++) {
            const x = i / TABLE;
            while (k < nodes.length - 2 && nodes[k + 1][0] <= x) k++;
            const a = nodes[k], b = nodes[k + 1] || a;
            const w = b[0] - a[0];
            t[i] = w <= 1e-9 ? b[1] : segment(a[1], b[1], a[2] || 0, (x - a[0]) / w);
        }
        return t;
    }
    function waveHash(nodes) {
        let h = nodes.length;
        for (const n of nodes) h = (h * 31 + n[0] * 10007 + n[1] * 7919 + (n[2] || 0) * 3571) % 1e9;
        return h;
    }
    // Removes nodes that change nothing (repeats and points in the middle of a flat line).
    function simplify(nodes) {
        const out = [];
        for (const n of nodes) {
            const last = out[out.length - 1];
            if (last && last[0] == n[0] && last[1] == n[1]) { last[2] = n[2]; continue; }
            out.push(n);
        }
        for (let i = out.length - 2; i >= 1; i--) {
            const a = out[i - 1], b = out[i], c = out[i + 1];
            if (a[1] == b[1] && b[1] == c[1] && !a[2] && !b[2] && a[0] != b[0] && b[0] != c[0]) out.splice(i, 1);
        }
        return out;
    }
    let seedCounter = 1;
    function seeded(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }
    function steps(values, gate = 1) {
        const n = values.length, nodes = [];
        values.forEach((v, i) => {
            const x0 = i / n, x1 = (i + gate) / n;
            nodes.push([r3(x0), v, 0]);
            if (gate < 1) { nodes.push([r3(x1), v, 0]); nodes.push([r3(x1), 0, 0]); nodes.push([r3((i + 1) / n), 0, 0]); }
            else nodes.push([r3(x1), v, 0]);
        });
        return simplify(nodes);
    }
    function repeat(nodes, times) {
        const out = [];
        for (let k = 0; k < times; k++) for (const n of nodes) out.push([r3((k + n[0]) / times), n[1], n[2]]);
        return simplify(out);
    }
    const SHAPE_LIBRARY = {
        flat: { name: "Flat (top)", make: () => [[0, 1, 0], [1, 1, 0]] },
        mid: { name: "Flat (middle)", make: () => [[0, 0.5, 0], [1, 0.5, 0]] },
        low: { name: "Flat (bottom)", make: () => [[0, 0, 0], [1, 0, 0]] },
        sine: { name: "Sine", make: () => Array.from({ length: 17 }, (_, i) => [r3(i / 16), r3(0.5 + 0.5 * Math.cos(2 * Math.PI * i / 16)), 0]) },
        triangle: { name: "Triangle", make: () => [[0, 1, 0], [0.5, 0, 0], [1, 1, 0]] },
        sawDown: { name: "Ramp down", make: () => [[0, 1, 0], [1, 0, 0]] },
        sawUp: { name: "Ramp up", make: () => [[0, 0, 0], [1, 1, 0]] },
        square: { name: "Square", make: () => [[0, 1, 0], [0.5, 1, 0], [0.5, 0, 0], [1, 0, 0]] },
        pump: { name: "Sidechain pump", make: () => [[0, 0, -0.7], [0.55, 1, 0], [1, 1, 0]] },
        pump2: { name: "Pump x2", make: () => repeat([[0, 0, -0.7], [0.55, 1, 0], [1, 1, 0]], 2) },
        swell: { name: "Swell", make: () => [[0, 0, 0.6], [1, 1, 0]] },
        drop: { name: "Drop", make: () => [[0, 1, -0.6], [1, 0, 0]] },
        gate: { name: "Trance gate", make: () => steps([1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0], 0.7) },
        chop: { name: "Chop 1/16", make: () => steps(Array(16).fill(1), 0.5) },
        stairsDown: { name: "Stairs down", make: () => steps([1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125]) },
        stairsUp: { name: "Stairs up", make: () => steps([0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) },
        bounce: { name: "Bounce", make: () => Array.from({ length: 33 }, (_, i) => [r3(i / 32), r3(Math.abs(Math.cos(Math.PI * 4 * Math.pow(i / 32, 0.7))) * Math.exp(-2 * i / 32)), 0]) },
        random: { name: "Random steps", make: (seed) => { const rnd = seeded(seed); return steps(Array.from({ length: 16 }, () => r3(rnd()))); } },
        smoothRandom: { name: "Smooth random", make: (seed) => { const rnd = seeded(seed); const v = Array.from({ length: 8 }, () => r3(rnd())); return v.map((y, i) => [r3(i / 8), y, 0]).concat([[1, v[0], 0]]); } },
        halfTime: { name: "Time: half speed", make: () => [[0, 1, 0], [1, 0.5, 0]] },
        tapeStop: { name: "Time: tape stop", make: () => [[0, 1, 0], [0.5, 1, 0.5], [1, 0.75, 0]] },
        reverse: { name: "Time: reverse 2nd half", make: () => [[0, 1, 0], [0.5, 1, 0], [1, 0, 0]] },
        // the delay grows by a quarter cycle each quarter: the first quarter plays four times
        repeat4: { name: "Time: repeat 1/4", make: () => [[0, 1, 0], [0.25, 1, 0], [0.25, 0.75, 0], [0.5, 0.75, 0], [0.5, 0.5, 0], [0.75, 0.5, 0], [0.75, 0.25, 0], [1, 0.25, 0]] },
        // every 1/16 step plays twice (the delay grows by one step every two steps)
        stutter: { name: "Time: stutter 1/16", make: () => {
            const nodes = [];
            for (let i = 0; i < 16; i++) {
                const y = r3(1 - Math.floor((i + 1) / 2) / 16);
                nodes.push([r3(i / 16), y, 0], [r3((i + 1) / 16), y, 0]);
            }
            return simplify(nodes);
        } },
        octaves: { name: "Pitch: octave hops", make: () => steps([0.5, 1, 0.5, 0, 0.5, 1, 0.75, 0.5]) },
        dive: { name: "Pitch: dive", make: () => [[0, 0.5, 0], [0.5, 0.5, 0.4], [1, 0, 0]] },
    };
    function shape(name, seed) {
        const def = SHAPE_LIBRARY[name] || SHAPE_LIBRARY.flat;
        return cleanWave(def.make(seed || (seedCounter++ * 7919)));
    }

    // ------------------------------------------------------------------ params
    function shaperDefaults(id) {
        const def = BY_ID[id];
        const s = { on: false, rate: id == "time" || id == "pitch" ? 3 : 5, depth: 1, smooth: id == "time" ? 0.05 : 0.12, swing: 0, band: 0, trig: 0, thr: -24, grid: 2, w: shape(def.wave) };
        for (const p of def.params) s[p.key] = p.def;
        return s;
    }
    const normalizedShapers = new WeakSet();
    function fillShaper(id, s) {
        if (normalizedShapers.has(s)) return s;
        const d = shaperDefaults(id);
        for (const key in d) {
            if (key == "w") continue;
            if (typeof d[key] == "number" && !(typeof s[key] == "number" && isFinite(s[key]))) s[key] = d[key];
            if (typeof d[key] == "boolean" && typeof s[key] != "boolean") s[key] = d[key];
        }
        s.w = cleanWave(s.w || d.w);
        normalizedShapers.add(s);
        return s;
    }
    function normalize(params) {
        const p = params && typeof params == "object" ? params : {};
        if (!p.sh || typeof p.sh != "object" || Array.isArray(p.sh)) p.sh = {};
        for (const key of Object.keys(p.sh)) {
            if (!BY_ID[key] || !p.sh[key] || typeof p.sh[key] != "object") delete p.sh[key];
            else fillShaper(key, p.sh[key]);
        }
        for (const [key, def] of [["mix", 1], ["in", 0], ["out", 0], ["xlo", 200], ["xhi", 2500]])
            if (typeof p[key] != "number" || !isFinite(p[key])) p[key] = def;
        return p;
    }
    function make(shapers, extra) {
        const p = { mix: 1, in: 0, out: 0, xlo: 200, xhi: 2500, sh: {} };
        for (const [id, over] of Object.entries(shapers)) {
            const s = shaperDefaults(id);
            s.on = true;
            Object.assign(s, over);
            if (typeof s.w == "string") s.w = shape(s.w, 1234 + id.length);
            p.sh[id] = s;
        }
        return Object.assign(p, extra || {});
    }
    function defaultParams() {
        return make({ volume: { w: "pump", rate: 5 } });
    }

    const PRESETS = [
        { group: "Volume", name: "Sidechain Pump", params: defaultParams() },
        { group: "Volume", name: "Pump the Low End Only", params: make({ volume: { w: "pump", rate: 5, band: 1 } }) },
        { group: "Volume", name: "Trance Gate", params: make({ volume: { w: "gate", rate: 3, smooth: 0.18 } }) },
        { group: "Volume", name: "Stutter Chop", params: make({ volume: { w: "chop", rate: 4, smooth: 0.1 }, time: { w: "stutter", rate: 3 } }) },
        { group: "Time", name: "Half-Time", params: make({ time: { w: "halfTime", rate: 3, smooth: 0.05 } }) },
        { group: "Time", name: "Tape Stop", params: make({ time: { w: "tapeStop", rate: 2, smooth: 0.05 } }) },
        { group: "Time", name: "Reverse Tail", params: make({ time: { w: "reverse", rate: 3, smooth: 0.05 } }) },
        { group: "Time", name: "Repeat Machine", params: make({ time: { w: "repeat4", rate: 4, smooth: 0.05 }, crush: { w: [[0, 0, 0], [0.75, 0, 0], [0.75, 0.6, 0], [1, 0.6, 0]], rate: 3, bits: 6 } }) },
        { group: "Filter", name: "Wobble Bass", params: make({ filter: { w: "sine", rate: 6, type: 4, lo: 120, hi: 3200, res: 0.55 } }) },
        { group: "Filter", name: "Filter Riser", params: make({ filter: { w: "sawUp", rate: 1, type: 1, lo: 20, hi: 2500, res: 0.35 }, noise: { w: "swell", rate: 1, color: 0, level: -24, follow: 0.2 }, width: { w: [[0, 0.5, 0], [1, 1, 0]], rate: 1 } }) },
        { group: "Filter", name: "Talking Steps", params: make({ filter: { w: "random", rate: 3, type: 2, lo: 300, hi: 4000, res: 0.6, smooth: 0.3 } }) },
        { group: "Stereo", name: "Auto-Pan Bounce", params: make({ pan: { w: "triangle", rate: 4, depth: 0.8 }, volume: { w: "pump2", rate: 4, depth: 0.25 } }) },
        { group: "Stereo", name: "Breathing Width", params: make({ width: { w: "sine", rate: 3 } }) },
        { group: "Character", name: "Drive Pulse", params: make({ drive: { w: "sawDown", rate: 5, type: 2, drive: 20 } }) },
        { group: "Character", name: "Bit Crunch Stairs", params: make({ crush: { w: "stairsUp", rate: 3, bits: 3, down: 16 } }) },
        { group: "Character", name: "Vinyl Air", params: make({ noise: { w: "flat", rate: 3, color: 2, level: -26, follow: 0.85 }, filter: { w: [[0, 0.82, 0], [1, 0.82, 0]], type: 0 } }) },
        { group: "Character", name: "Lo-fi Wobble", params: make({ pitch: { w: "sine", rate: 2, range: 1, depth: 0.35, grain: 70 }, noise: { w: "flat", color: 3, level: -34, follow: 0.6 }, filter: { w: [[0, 0.72, 0], [1, 0.72, 0]], type: 0, res: 0.1 } }) },
        { group: "Movement", name: "Liquid Swirl", params: make({ liquid: { w: "sine", rate: 2, mode: 1, fb: 0.7, mix: 0.6 } }) },
        { group: "Movement", name: "Phaser Steps", params: make({ liquid: { w: "random", rate: 3, mode: 2, fb: 0.6, mix: 0.7, smooth: 0.25 } }) },
        { group: "Movement", name: "Pitch Dive", params: make({ pitch: { w: "dive", rate: 3, range: 12 } }) },
        { group: "Movement", name: "Octave Hops", params: make({ pitch: { w: "octaves", rate: 3, range: 12, smooth: 0.05 } }) },
        { group: "Space", name: "Reverb Swells", params: make({ reverb: { w: "swell", rate: 4, size: 0.85, level: 0.8 }, volume: { w: "pump", rate: 5, depth: 0.4 } }) },
        { group: "Space", name: "Dub Throws", params: make({ reverb: { w: [[0, 0, 0], [0.75, 0, 0], [0.75, 1, 0], [1, 1, 0]], rate: 3, size: 0.9, level: 1 }, filter: { w: [[0, 1, 0], [0.75, 1, 0], [0.75, 0.55, 0], [1, 0.55, 0]], rate: 3, type: 2, lo: 200, hi: 6000, res: 0.3, smooth: 0.2 } }) },
        { group: "Space", name: "Glitch Machine", params: make({ time: { w: "stutter", rate: 3 }, crush: { w: "square", rate: 5, bits: 5, down: 6 }, pan: { w: "random", rate: 3, depth: 0.7 } }) },
    ];

    // --------------------------------------------------------------------- DSP
    class SVF2 {
        constructor() { this.s1 = 0; this.s2 = 0; this.lp = 0; this.hp = 0; }
        tick(x, g, k) {
            const hp = (x - (g + k) * this.s1 - this.s2) / (1 + g * (g + k));
            const v1 = g * hp, bp = v1 + this.s1;
            this.s1 = bp + v1;
            const v2 = g * bp, lp = v2 + this.s2;
            this.s2 = lp + v2;
            this.hp = hp;
            this.lp = lp;
            return lp;
        }
    }
    // Three-band Linkwitz-Riley split (the bands add back up to the input, phase-matched).
    class BandSplit {
        constructor() { this.f = Array.from({ length: 9 }, () => new SVF2()); }
        split(x, g1, g2, out, i) {
            const f = this.f, K = Math.SQRT2;
            f[0].tick(x, g1, K);
            const low0 = f[1].tick(f[0].lp, g1, K);
            f[2].tick(f[0].hp, g1, K);
            const rest = f[2].hp;
            f[3].tick(rest, g2, K);
            out[1][i] = f[4].tick(f[3].lp, g2, K);
            f[5].tick(f[3].hp, g2, K);
            out[2][i] = f[5].hp;
            // the low band gets the same phase turn the upper split gave the others
            f[6].tick(low0, g2, K);
            f[7].tick(f[6].lp, g2, K);
            f[8].tick(f[6].hp, g2, K);
            out[0][i] = f[7].lp + f[8].hp;
        }
    }
    function lerpRead(buf, mask, pos) {
        const i = Math.floor(pos), fr = pos - i;
        const a = buf[i & mask], b = buf[(i + 1) & mask];
        return a + (b - a) * fr;
    }
    function createState(sampleRate) {
        return { sampleRate, shapers: {}, dryL: null, dryR: null, vis: null, visId: null, n: 0 };
    }
    function shaperState(state, id) {
        let st = state.shapers[id];
        if (!st) {
            st = state.shapers[id] = { y: -1, env: 0, armed: true, since: 1e9, trigPhase: 1, table: null, hash: -1, mod: null, phase: null };
        }
        if (!st.mod || st.mod.length < state.n) {
            st.mod = new Float32Array(Math.max(state.n, 1024));
            st.phase = new Float32Array(Math.max(state.n, 1024));
        }
        return st;
    }
    function computeMod(st, sh, ctx, L, R, off, n) {
        const hash = waveHash(sh.w);
        if (st.hash != hash || !st.table) { st.table = buildTable(sh.w); st.hash = hash; }
        const table = st.table, mod = st.mod, ph = st.phase;
        const sr = ctx.sampleRate, spb = ctx.samplesPerBeat > 0 ? ctx.samplesPerBeat : sr / 2;
        const cycle = rateBeats(sh.rate, ctx.beatsPerBar);
        if ((sh.trig | 0) == 1) {
            const thr = CarrotDSP.dbToGain(sh.thr), rel = Math.exp(-1 / (0.05 * sr)), hold = 0.04 * sr;
            const inc = 1 / (cycle * spb);
            for (let i = 0; i < n; i++) {
                const x = Math.max(Math.abs(L[off + i]), Math.abs(R[off + i]));
                st.env = x > st.env ? x : st.env * rel;
                if (!st.armed && st.env < thr * 0.5) st.armed = true;
                if (st.armed && st.env > thr && st.since > hold) { st.trigPhase = 0; st.armed = false; st.since = 0; }
                st.since++;
                ph[i] = st.trigPhase;
                st.trigPhase = Math.min(1, st.trigPhase + inc);
            }
        }
        else {
            const b0 = ctx.beatPos || 0, step = 1 / spb;
            for (let i = 0; i < n; i++) {
                let u = ((b0 + i * step) / cycle) % 1;
                if (u < 0) u += 1;
                ph[i] = u;
            }
        }
        const grid = GRIDS[sh.grid | 0] || 16, swing = CarrotDSP.clamp(sh.swing, 0, 0.5);
        const tau = 0.0002 + sh.smooth * sh.smooth * 0.06;
        const k = 1 - Math.exp(-1 / (tau * sr));
        if (st.y < 0) st.y = table[Math.min(TABLE, Math.round(ph[0] * TABLE))];
        for (let i = 0; i < n; i++) {
            let u = ph[i];
            if (swing > 0 && grid % 2 == 0 && u < 1) {
                const v = u * grid, pair = Math.floor(v / 2), w = v - 2 * pair;
                const w2 = w < 1 + swing ? w / (1 + swing) : 1 + (w - 1 - swing) / (1 - swing);
                u = (2 * pair + w2) / grid;
            }
            const x = u * TABLE, j = Math.floor(x), fr = x - j;
            const y = j >= TABLE ? table[TABLE] : table[j] + (table[j + 1] - table[j]) * fr;
            st.y += (y - st.y) * k;
            mod[i] = st.y;
        }
    }
    const RNG = (st) => { st.seed = (st.seed * 1664525 + 1013904223) >>> 0; return st.seed / 2147483648 - 1; };
    const RUN = {
        volume(st, sh, L, R, o, n, m) {
            const d = sh.depth;
            for (let i = 0; i < n; i++) {
                const g = 1 - d * (1 - m[i]);
                L[o + i] *= g;
                R[o + i] *= g;
            }
        },
        pan(st, sh, L, R, o, n, m) {
            const d = sh.depth;
            for (let i = 0; i < n; i++) {
                const p = (m[i] - 0.5) * 2 * d;
                if (p > 0) L[o + i] *= Math.cos(p * HALF_PI);
                else if (p < 0) R[o + i] *= Math.cos(-p * HALF_PI);
            }
        },
        width(st, sh, L, R, o, n, m) {
            const d = sh.depth;
            for (let i = 0; i < n; i++) {
                const w = 1 + d * (2 * m[i] - 1);
                const mid = 0.5 * (L[o + i] + R[o + i]), side = 0.5 * (L[o + i] - R[o + i]) * w;
                L[o + i] = mid + side;
                R[o + i] = mid - side;
            }
        },
        filter(st, sh, L, R, o, n, m, ctx) {
            const sr = ctx.sampleRate, type = sh.type | 0, two = type == 4, mode = [0, 1, 2, 3, 0][type] || 0;
            const lo = Math.max(20, sh.lo), hi = Math.max(20, sh.hi), mix = sh.depth, res = two ? sh.res * 0.75 : sh.res;
            if (!st.f) st.f = [new CarrotSVF(), new CarrotSVF(), new CarrotSVF(), new CarrotSVF()];
            const f = st.f;
            for (let i = 0; i < n; i++) {
                if ((i & 15) == 0) {
                    const fc = lo * Math.pow(hi / lo, m[i]);
                    f[0].set(fc, res, sr); f[1].set(fc, res, sr);
                    if (two) { f[2].set(fc, res, sr); f[3].set(fc, res, sr); }
                }
                const l = L[o + i], r = R[o + i];
                let wl = f[0].process(l, mode), wr = f[1].process(r, mode);
                if (two) { wl = f[2].process(wl, 0); wr = f[3].process(wr, 0); }
                L[o + i] = l + (wl - l) * mix;
                R[o + i] = r + (wr - r) * mix;
            }
        },
        drive(st, sh, L, R, o, n, m, ctx) {
            const shapeFn = CarrotFX.types.distortion.impl.shape, mode = sh.type | 0, depth = sh.depth, drive = sh.drive, mix = sh.mix;
            const toneK = 1 - Math.exp(-2 * Math.PI * Math.min(sh.tone, ctx.sampleRate * 0.45) / ctx.sampleRate);
            st.tl = st.tl || 0; st.tr = st.tr || 0;
            let g = 1, comp = 1;
            for (let i = 0; i < n; i++) {
                const a = m[i] * depth;
                if ((i & 7) == 0) { g = Math.pow(10, a * drive / 20); comp = Math.pow(10, -a * drive / 40); }
                const l = L[o + i], r = R[o + i];
                st.tl += (shapeFn(mode, l * g) * comp - st.tl) * toneK;
                st.tr += (shapeFn(mode, r * g) * comp - st.tr) * toneK;
                const k = mix * Math.min(1, a * 4);
                L[o + i] = l + (st.tl - l) * k;
                R[o + i] = r + (st.tr - r) * k;
            }
        },
        crush(st, sh, L, R, o, n, m) {
            const depth = sh.depth, mix = sh.mix, minBits = sh.bits, maxDown = sh.down;
            st.cnt = st.cnt || 0; st.hl = st.hl || 0; st.hr = st.hr || 0;
            for (let i = 0; i < n; i++) {
                const a = m[i] * depth;
                const l = L[o + i], r = R[o + i];
                st.cnt += 1;
                if (st.cnt >= 1 + a * (maxDown - 1)) {
                    st.cnt = 0;
                    const q = Math.pow(2, 16 - a * (16 - minBits) - 1);
                    st.hl = Math.round(l * q) / q;
                    st.hr = Math.round(r * q) / q;
                }
                const k = mix * Math.min(1, a * 6);
                L[o + i] = l + (st.hl - l) * k;
                R[o + i] = r + (st.hr - r) * k;
            }
        },
        noise(st, sh, L, R, o, n, m, ctx) {
            const sr = ctx.sampleRate, level = CarrotDSP.dbToGain(sh.level), follow = sh.follow, color = sh.color | 0, width = sh.width, depth = sh.depth;
            const toneK = 1 - Math.exp(-2 * Math.PI * Math.min(sh.tone, sr * 0.45) / sr), rel = Math.exp(-1 / (0.12 * sr));
            if (!st.pk) { st.pk = [new Float64Array(7), new Float64Array(7)]; st.seed = 22222; st.env = 0; st.cr = [0, 0]; st.lp = [0, 0]; st.hpPrev = [0, 0]; }
            const gen = (c) => {
                const w = RNG(st);
                if (color == 0) return w;
                if (color == 1) {
                    const b = st.pk[c];
                    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.969 * b[2] + w * 0.153852;
                    b[3] = 0.8665 * b[3] + w * 0.3104856; b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
                    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
                    b[6] = w * 0.115926;
                    return out * 0.2;
                }
                if (color == 2) {
                    // vinyl: sparse crackles over a little rumble
                    if (Math.abs(RNG(st)) < 0.0007) st.cr[c] = RNG(st) * 1.6;
                    st.cr[c] *= 0.86;
                    return st.cr[c] + w * 0.04;
                }
                const hp = w - st.hpPrev[c];
                st.hpPrev[c] = w;
                return hp * 0.6;
            };
            for (let i = 0; i < n; i++) {
                const a = m[i] * depth;
                const l = L[o + i], r = R[o + i];
                const x = Math.max(Math.abs(l), Math.abs(r));
                st.env = x > st.env ? st.env + (x - st.env) * 0.3 : st.env * rel;
                if (a <= 0) continue;
                const g = level * a * (1 - follow + follow * Math.min(1, st.env * 2));
                const n1 = gen(0), n2 = gen(1);
                st.lp[0] += (n1 - st.lp[0]) * toneK;
                st.lp[1] += (n2 - st.lp[1]) * toneK;
                L[o + i] = l + st.lp[0] * g;
                R[o + i] = r + (st.lp[1] * width + st.lp[0] * (1 - width)) * g;
            }
        },
        liquid(st, sh, L, R, o, n, m, ctx) {
            const sr = ctx.sampleRate, mode = sh.mode | 0, fb = sh.fb, depth = sh.depth, mix = mode == 3 ? 1 : sh.mix;
            if (mode == 2) {
                if (!st.ap) { st.ap = [new Float64Array(12), new Float64Array(12)]; st.fbs = [0, 0]; }
                let c = 0;
                for (let i = 0; i < n; i++) {
                    if ((i & 15) == 0) {
                        const s = 0.5 + (m[i] - 0.5) * depth;
                        const t = Math.tan(Math.PI * Math.min(sr * 0.45, 150 * Math.pow(40, s)) / sr);
                        c = (t - 1) / (t + 1);
                    }
                    for (let ch = 0; ch < 2; ch++) {
                        const buf = ch ? R : L, z = st.ap[ch];
                        const dry = buf[o + i];
                        let x = dry + st.fbs[ch] * fb * 0.9;
                        for (let s = 0; s < 6; s++) {
                            const y = c * x + z[2 * s] - c * z[2 * s + 1];
                            z[2 * s] = x; z[2 * s + 1] = y;
                            x = y;
                        }
                        st.fbs[ch] = x;
                        buf[o + i] = dry + (x - dry) * mix;
                    }
                }
                return;
            }
            if (!st.dl) {
                let size = 1;
                while (size < sr * 0.06) size <<= 1;
                st.dl = [new Float32Array(size), new Float32Array(size)]; st.mask = size - 1; st.w = 0; st.fbv = [0, 0];
            }
            const mask = st.mask, ms = sr / 1000;
            for (let i = 0; i < n; i++) {
                const s = 0.5 + (m[i] - 0.5) * depth;
                let dl, dr;
                if (mode == 0) { dl = (6 + 20 * s) * ms; dr = (6 + 20 * (1 - s)) * ms; }
                else if (mode == 1) { dl = dr = (0.25 + 7 * s * s) * ms; }
                else { dl = dr = (1 + 6 * s) * ms; }
                const w = st.w;
                for (let ch = 0; ch < 2; ch++) {
                    const buf = ch ? R : L, line = st.dl[ch];
                    const dry = buf[o + i];
                    line[w] = dry + (mode == 3 ? 0 : st.fbv[ch] * fb);
                    const wet = lerpRead(line, mask, w - (ch ? dr : dl));
                    st.fbv[ch] = wet;
                    buf[o + i] = dry + (wet - dry) * mix;
                }
                st.w = (w + 1) & mask;
            }
        },
        pitch(st, sh, L, R, o, n, m, ctx) {
            const sr = ctx.sampleRate;
            if (!st.pb) { st.pb = [new Float32Array(65536), new Float32Array(65536)]; st.w = 0; st.pp = 0; }
            const mask = 65535, G = Math.max(64, Math.min(60000, Math.round(sh.grain / 1000 * sr))), range = sh.range, depth = sh.depth, mix = sh.mix;
            let ratio = 1, semis = 0;
            for (let i = 0; i < n; i++) {
                if ((i & 7) == 0) { semis = (m[i] - 0.5) * 2 * range * depth; ratio = Math.pow(2, semis / 12); }
                const w = st.w;
                st.pb[0][w] = L[o + i];
                st.pb[1][w] = R[o + i];
                st.pp += (1 - ratio) / G;
                st.pp -= Math.floor(st.pp);
                const p1 = st.pp, p2 = (p1 + 0.5) % 1;
                const w1 = 1 - Math.abs(2 * p1 - 1), w2 = 1 - w1;
                const d1 = 1 + p1 * G, d2 = 1 + p2 * G;
                const k = mix * Math.min(1, Math.abs(semis) * 4);
                for (let ch = 0; ch < 2; ch++) {
                    const buf = ch ? R : L, line = st.pb[ch];
                    const wet = lerpRead(line, mask, w - d1) * w1 + lerpRead(line, mask, w - d2) * w2;
                    buf[o + i] += (wet - buf[o + i]) * k;
                }
                st.w = (w + 1) & mask;
            }
        },
        time(st, sh, L, R, o, n, m, ctx) {
            const sr = ctx.sampleRate;
            if (!st.tb) {
                let size = 1;
                while (size < sr * 12) size <<= 1;
                st.tb = [new Float32Array(size), new Float32Array(size)]; st.mask = size - 1; st.w = 0; st.lastD = 0; st.oldD = 0; st.xf = 0;
            }
            const mask = st.mask, spb = ctx.samplesPerBeat > 0 ? ctx.samplesPerBeat : sr / 2;
            const cycle = rateBeats(sh.rate, ctx.beatsPerBar) * spb, maxD = mask - 4, depth = sh.depth, mix = sh.mix;
            const xfLen = Math.round(0.006 * sr);
            for (let i = 0; i < n; i++) {
                const w = st.w;
                st.tb[0][w] = L[o + i];
                st.tb[1][w] = R[o + i];
                const D = Math.min(maxD, Math.max(0, (1 - m[i]) * depth * cycle));
                // a jump in the timeline crossfades from the old place to the new one
                if (Math.abs(D - st.lastD) > 12 && st.xf == 0) { st.oldD = st.lastD; st.xf = xfLen; }
                st.lastD = D;
                let wl = lerpRead(st.tb[0], mask, w - D), wr = lerpRead(st.tb[1], mask, w - D);
                if (st.xf > 0) {
                    const t = st.xf / xfLen;
                    wl = wl * (1 - t) + lerpRead(st.tb[0], mask, w - st.oldD) * t;
                    wr = wr * (1 - t) + lerpRead(st.tb[1], mask, w - st.oldD) * t;
                    st.xf--;
                }
                L[o + i] += (wl - L[o + i]) * mix;
                R[o + i] += (wr - R[o + i]) * mix;
                st.w = (w + 1) & mask;
            }
        },
        reverb(st, sh, L, R, o, n, m, ctx) {
            if (!st.rv || st.rvRate != ctx.sampleRate) {
                st.rv = CarrotFX.createState("reverb", ctx.sampleRate);
                st.rvRate = ctx.sampleRate;
                st.slot = { type: "reverb", on: true, size: 0.7, damp: 0.4, width: 1, predelay: 20, mix: 1 };
            }
            st.slot.size = sh.size; st.slot.damp = sh.damp; st.slot.predelay = sh.predelay;
            if (!st.bl || st.bl.length < n) { st.bl = new Float32Array(Math.max(n, 1024)); st.br = new Float32Array(Math.max(n, 1024)); }
            const depth = sh.depth, level = sh.level;
            for (let i = 0; i < n; i++) { const s = m[i] * depth; st.bl[i] = L[o + i] * s; st.br[i] = R[o + i] * s; }
            st.rv.process(st.slot, st.bl, st.br, 0, n, ctx);
            for (let i = 0; i < n; i++) {
                const s = m[i] * depth;
                L[o + i] += (st.bl[i] - 0.6 * L[o + i] * s) * level;
                R[o + i] += (st.br[i] - 0.6 * R[o + i] * s) * level;
            }
        },
    };
    function runShaper(state, id, sh, L, R, start, n, ctx, p) {
        const st = shaperState(state, id);
        computeMod(st, sh, ctx, L, R, start, n);
        const band = sh.band | 0;
        if (band == 0) {
            RUN[id](st, sh, L, R, start, n, st.mod, ctx);
            return st;
        }
        // only one band goes through the shaper
        if (!st.split) { st.split = [new BandSplit(), new BandSplit()]; }
        if (!st.bands || st.bands[0][0].length < n) {
            const len = Math.max(n, 1024);
            st.bands = [[0, 1, 2].map(() => new Float32Array(len)), [0, 1, 2].map(() => new Float32Array(len))];
        }
        const sr = ctx.sampleRate;
        const lo = CarrotDSP.clamp(p.xlo, 30, 2000), hi = CarrotDSP.clamp(Math.max(p.xhi, lo * 1.5), 200, 16000);
        const g1 = Math.tan(Math.PI * lo / sr), g2 = Math.tan(Math.PI * Math.min(hi, sr * 0.45) / sr);
        const bl = st.bands[0], br = st.bands[1];
        for (let i = 0; i < n; i++) {
            st.split[0].split(L[start + i], g1, g2, bl, i);
            st.split[1].split(R[start + i], g1, g2, br, i);
        }
        RUN[id](st, sh, bl[band - 1], br[band - 1], 0, n, st.mod, ctx);
        for (let i = 0; i < n; i++) {
            L[start + i] = bl[0][i] + bl[1][i] + bl[2][i];
            R[start + i] = br[0][i] + br[1][i] + br[2][i];
        }
        return st;
    }
    function process(state, params, L, R, start, end, ctx) {
        const p = normalize(params);
        if (p._live !== state) {
            try { Object.defineProperty(p, "_live", { value: state, writable: true, configurable: true, enumerable: false }); }
            catch (error) { }
        }
        const n = end - start;
        if (n <= 0) return;
        state.n = n;
        if (!state.dryL || state.dryL.length < n) {
            state.dryL = new Float32Array(Math.max(n, 2048));
            state.dryR = new Float32Array(Math.max(n, 2048));
        }
        const inGain = CarrotDSP.dbToGain(p.in), outGain = CarrotDSP.dbToGain(p.out), mix = CarrotDSP.clamp(p.mix, 0, 1);
        const dryL = state.dryL, dryR = state.dryR;
        for (let i = 0; i < n; i++) {
            dryL[i] = L[start + i];
            dryR[i] = R[start + i];
            if (inGain != 1) { L[start + i] *= inGain; R[start + i] *= inGain; }
        }
        let visSt = null;
        for (const id of ORDER) {
            const sh = p.sh[id];
            if (!sh || !sh.on) {
                if (state.shapers[id]) state.shapers[id].y = -1;
                continue;
            }
            const st = runShaper(state, id, sh, L, R, start, n, ctx, p);
            if (id == state.visId) visSt = st;
        }
        for (let i = 0; i < n; i++) {
            const j = start + i;
            L[j] = (dryL[i] + (L[j] - dryL[i]) * mix) * outGain;
            R[j] = (dryR[i] + (R[j] - dryR[i]) * mix) * outGain;
        }
        // what the editor draws: the audio in and out along the selected shaper's cycle
        if (state.visId) {
            if (!state.vis) state.vis = { inBins: new Float32Array(256), outBins: new Float32Array(256), last: -1, phase: 0, value: 0, at: 0 };
            const v = state.vis;
            if (visSt) {
                for (let i = 0; i < n; i++) {
                    const b = Math.min(255, Math.floor(visSt.phase[i] * 256));
                    if (b != v.last) { v.inBins[b] = 0; v.outBins[b] = 0; v.last = b; }
                    const a = Math.max(Math.abs(dryL[i]), Math.abs(dryR[i])), z = Math.max(Math.abs(L[start + i]), Math.abs(R[start + i]));
                    if (a > v.inBins[b]) v.inBins[b] = a;
                    if (z > v.outBins[b]) v.outBins[b] = z;
                }
                v.phase = visSt.phase[n - 1];
                v.value = visSt.mod[n - 1];
            }
            v.at = performance.now();
        }
    }

    // -------------------------------------------------------------- randomize
    function randomize() {
        const rnd = Math.random;
        const ids = ORDER.slice().sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 3));
        const shapes = Object.keys(SHAPE_LIBRARY).filter(k => !/^(flat|mid|low)$/.test(k));
        const over = {};
        for (const id of ids) {
            const s = { rate: [2, 3, 4, 5, 6, 7, 10, 14][Math.floor(rnd() * 8)], depth: 0.5 + rnd() * 0.5, smooth: rnd() * 0.3 };
            let name = shapes[Math.floor(rnd() * shapes.length)];
            if (id == "time") name = ["halfTime", "tapeStop", "reverse", "repeat4", "stutter"][Math.floor(rnd() * 5)];
            if (id != "time" && /^(halfTime|tapeStop|reverse|repeat4|stutter)$/.test(name)) name = "sine";
            s.w = shape(name, Math.floor(rnd() * 1e9));
            for (const spec of BY_ID[id].params) {
                if (spec.options) s[spec.key] = Math.floor(rnd() * spec.options.length);
                else if (spec.key == "mix") s.mix = 0.4 + rnd() * 0.6;
                else if (spec.key == "level" && id == "noise") s.level = -36 + rnd() * 18;
                else s[spec.key] = A.carrotFromNorm(spec, 0.2 + rnd() * 0.6);
            }
            if (rnd() < 0.2) s.band = 1 + Math.floor(rnd() * 3);
            over[id] = s;
        }
        return make(over);
    }

    // ---------------------------------------------------------------------- UI
    A.addStyle(`
.cb-window.cb-plugin-curvebox { --cb-plugin-color: #ffd54f; }
.cb-plugin-curvebox .cb-window-body { background: linear-gradient(#17181c, #101114) !important; }
.cb-window.cb-plugin-curvebox .cb-section { background: #1c1d22 !important; border: 1px solid #2a2c33 !important; border-radius: 10px !important; }
.cb-window.cb-plugin-curvebox .cb-section-title { color: #e8e8ea !important; letter-spacing: 0.08em; }
.cb-cv-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.cb-cv-tab { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px 5px 6px; border-radius: 7px; border: 1px solid #2c2e36; background: #22242a; color: #c9cbd1; font-size: 11.5px; cursor: pointer; }
.cb-cv-tab:hover { border-color: #444752; }
.cb-cv-tab.cb-sel { background: #2c2f37; color: #fff; border-color: var(--cv-color); box-shadow: inset 0 -2px 0 var(--cv-color); }
.cb-cv-led { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid #555a66; background: #15161a; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.cb-cv-led::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #3a3d46; }
.cb-cv-tab.cb-on .cb-cv-led { border-color: var(--cv-color); }
.cb-cv-tab.cb-on .cb-cv-led::after { background: var(--cv-color); box-shadow: 0 0 6px var(--cv-color); }
.cb-cv-tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 6px; }
.cb-cv-tools .cb-button, .cb-cv-tools .cb-toggle { padding: 3px 8px; font-size: 11px; }
.cb-cv-tools .cb-select { max-width: 150px; }
.cb-cv-canvas { width: 100%; height: 240px; border-radius: 8px; background: #0d0e11; display: block; touch-action: none; cursor: crosshair; }
.cb-cv-caption { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; color: #8b8f99; margin-top: 4px; }
.cb-cv-flow { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; font-size: 10.5px; color: #8b8f99; }
.cb-cv-chip { padding: 1px 7px; border-radius: 9px; color: #111; font-weight: 600; }
.cb-cv-chip.cb-off { opacity: 0.25; }
.cb-cv-power { margin-right: 6px; }
`);
    let clipboard = null;
    let lastSelected = null;
    try { lastSelected = window.localStorage.getItem("carrotCurveboxTab"); } catch (error) { }

    function buildEditor(host) {
        normalize(host.params());
        const root = HTML.div();
        let selected = null;
        {
            const p = host.params();
            const firstOn = ORDER.find(id => p.sh[id] && p.sh[id].on);
            selected = (lastSelected && BY_ID[lastSelected] && p.sh[lastSelected]) ? lastSelected : firstOn || "volume";
        }
        const sh = () => {
            const p = normalize(host.params());
            if (!p.sh[selected]) p.sh[selected] = shaperDefaults(selected);
            return fillShaper(selected, p.sh[selected]);
        };

        // ---- shaper tabs
        const tabs = HTML.div({ class: "cb-cv-tabs" });
        const renderTabs = () => {
            const p = normalize(host.params());
            tabs.innerHTML = "";
            for (const def of SHAPERS) {
                const s = p.sh[def.id];
                const led = HTML.span({ class: "cb-cv-led", title: "Turn " + def.name + " on or off" });
                const tab = HTML.button({ type: "button", class: "cb-cv-tab" + (def.id == selected ? " cb-sel" : "") + (s && s.on ? " cb-on" : ""), style: "--cv-color: " + def.color + ";", title: def.name + " shaper" }, led, def.name);
                led.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const q = normalize(host.params());
                    if (!q.sh[def.id]) q.sh[def.id] = shaperDefaults(def.id);
                    q.sh[def.id].on = !q.sh[def.id].on;
                    host.changed();
                    if (q.sh[def.id].on) select(def.id); else renderAll();
                });
                tab.addEventListener("click", () => select(def.id));
                tabs.appendChild(tab);
            }
        };
        const flow = HTML.div({ class: "cb-cv-flow" });
        const renderFlow = () => {
            const p = normalize(host.params());
            flow.innerHTML = "";
            flow.append("In ›");
            for (const def of SHAPERS) {
                const s = p.sh[def.id];
                if (!s) continue;
                flow.appendChild(HTML.span({ class: "cb-cv-chip" + (s.on ? "" : " cb-off"), style: "background: " + def.color + ";" }, def.name + (s.band ? " (" + BANDS[s.band] + ")" : "")));
                flow.append("›");
            }
            flow.append("Out");
        };

        // ---- the curve editor
        const canvas = HTML.canvas({ class: "cb-cv-canvas", title: "Click to add a point, drag points, drag the small diamonds to bend a segment. Double-click or right-click a point to delete it." });
        const captionTop = HTML.span(), captionBottom = HTML.span(), readout = HTML.span();
        const caption = HTML.div({ class: "cb-cv-caption" }, HTML.span(captionTop, " · ", captionBottom), readout);
        let paint = false, snap = true;
        const PAD = 10;
        const geom = () => {
            const rect = canvas.getBoundingClientRect();
            return { w: rect.width || 600, h: rect.height || 240 };
        };
        const toX = (x, g) => PAD + x * (g.w - 2 * PAD);
        const toY = (y, g) => PAD + (1 - y) * (g.h - 2 * PAD);
        const fromX = (px, g) => CarrotDSP.clamp((px - PAD) / (g.w - 2 * PAD), 0, 1);
        const fromY = (py, g) => CarrotDSP.clamp(1 - (py - PAD) / (g.h - 2 * PAD), 0, 1);
        const gridCount = () => GRIDS[sh().grid | 0] || 16;
        const snapX = (x, shift) => (snap && !shift) ? Math.round(x * gridCount()) / gridCount() : x;
        let hover = null;

        const draw = () => {
            if (!canvas.isConnected) return;
            const { ctx, w, h } = CarrotUI.ctx(canvas);
            const g = { w, h };
            const s = sh(), def = BY_ID[selected], color = def.color;
            const p = host.params(), live = p._live;
            ctx.fillStyle = "#0d0e11";
            ctx.fillRect(0, 0, w, h);
            // grid
            const count = gridCount();
            for (let i = 0; i <= count; i++) {
                const x = toX(i / count, g);
                ctx.strokeStyle = i % (count % 3 == 0 ? 3 : 4) == 0 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)";
                ctx.beginPath(); ctx.moveTo(x + 0.5, PAD); ctx.lineTo(x + 0.5, h - PAD); ctx.stroke();
            }
            for (let i = 0; i <= 4; i++) {
                const y = toY(i / 4, g);
                ctx.strokeStyle = i == 2 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)";
                ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(w - PAD, y + 0.5); ctx.stroke();
            }
            // the audio along the cycle
            const vis = live && live.vis && live.visId == selected && performance.now() - live.vis.at < 500 ? live.vis : null;
            if (vis) {
                const mid = h / 2, scale = (h - 2 * PAD) / 2;
                for (const [bins, fill] of [[vis.inBins, "rgba(160,165,180,0.18)"], [vis.outBins, color + "55"]]) {
                    ctx.fillStyle = fill;
                    ctx.beginPath();
                    ctx.moveTo(toX(0, g), mid);
                    for (let b = 0; b < 256; b++) ctx.lineTo(toX((b + 0.5) / 256, g), mid - Math.min(1, bins[b]) * scale);
                    ctx.lineTo(toX(1, g), mid);
                    for (let b = 255; b >= 0; b--) ctx.lineTo(toX((b + 0.5) / 256, g), mid + Math.min(1, bins[b]) * scale);
                    ctx.closePath();
                    ctx.fill();
                }
            }
            // the curve
            const nodes = s.w;
            const path = () => {
                ctx.beginPath();
                ctx.moveTo(toX(0, g), toY(nodes[0][1], g));
                for (let k = 0; k + 1 < nodes.length; k++) {
                    const a = nodes[k], b = nodes[k + 1];
                    const steps = Math.max(1, Math.ceil((b[0] - a[0]) * 120));
                    for (let i = 1; i <= steps; i++) {
                        const t = i / steps;
                        ctx.lineTo(toX(a[0] + (b[0] - a[0]) * t, g), toY(segment(a[1], b[1], a[2] || 0, t), g));
                    }
                }
            };
            path();
            ctx.lineTo(toX(1, g), h - PAD);
            ctx.lineTo(toX(0, g), h - PAD);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, PAD, 0, h - PAD);
            grad.addColorStop(0, color + (s.on ? "66" : "22"));
            grad.addColorStop(1, color + "05");
            ctx.fillStyle = grad;
            ctx.fill();
            path();
            ctx.strokeStyle = s.on ? color : color + "88";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
            // bend handles and points
            for (let k = 0; k + 1 < nodes.length; k++) {
                const a = nodes[k], b = nodes[k + 1];
                if (b[0] - a[0] < 0.02 || Math.abs(b[1] - a[1]) < 0.02) continue;
                const x = toX((a[0] + b[0]) / 2, g), y = toY(segment(a[1], b[1], a[2] || 0, 0.5), g);
                ctx.fillStyle = hover && hover.bend == k ? "#fff" : "rgba(255,255,255,0.45)";
                ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
            }
            nodes.forEach((n, k) => {
                const x = toX(n[0], g), y = toY(n[1], g);
                ctx.fillStyle = "#0d0e11";
                ctx.strokeStyle = hover && hover.node == k ? "#fff" : color;
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(x, y, hover && hover.node == k ? 5.5 : 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            });
            ctx.lineWidth = 1;
            // playhead
            if (vis && s.on) {
                const x = toX(vis.phase, g);
                ctx.strokeStyle = "rgba(255,255,255,0.75)";
                ctx.beginPath(); ctx.moveTo(x + 0.5, PAD); ctx.lineTo(x + 0.5, h - PAD); ctx.stroke();
                ctx.fillStyle = "#fff";
                ctx.beginPath(); ctx.arc(x, toY(vis.value, g), 3.5, 0, Math.PI * 2); ctx.fill();
            }
            if (!s.on) {
                ctx.fillStyle = "rgba(255,255,255,0.55)";
                ctx.font = "12px sans-serif";
                ctx.fillText(def.name + " is off: click its light (or the On button) to hear it", PAD + 6, PAD + 16);
            }
            readout.textContent = vis && s.on ? def.name + " " + Math.round(vis.value * 100) + "%" : "";
        };
        const hitTest = (px, py) => {
            const g = geom(), nodes = sh().w;
            for (let k = nodes.length - 1; k >= 0; k--) {
                const dx = toX(nodes[k][0], g) - px, dy = toY(nodes[k][1], g) - py;
                if (dx * dx + dy * dy < 64) return { node: k };
            }
            for (let k = 0; k + 1 < nodes.length; k++) {
                const a = nodes[k], b = nodes[k + 1];
                if (b[0] - a[0] < 0.02 || Math.abs(b[1] - a[1]) < 0.02) continue;
                const dx = toX((a[0] + b[0]) / 2, g) - px, dy = toY(segment(a[1], b[1], a[2] || 0, 0.5), g) - py;
                if (dx * dx + dy * dy < 49) return { bend: k };
            }
            return null;
        };
        const local = (event) => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
        const paintAt = (px, py) => {
            const s = sh(), g = geom(), count = gridCount();
            const x = fromX(px, g), y = r3(fromY(py, g));
            const cell = Math.min(count - 1, Math.floor(x * count)), x0 = r3(cell / count), x1 = r3((cell + 1) / count);
            const nodes = s.w;
            const before = waveValue(nodes, Math.max(0, x0 - 1e-6)), after = waveValue(nodes, Math.min(1, x1 + 1e-6));
            const out = nodes.filter(n => n[0] < x0 || n[0] > x1);
            const i = out.findIndex(n => n[0] > x1);
            const block = [];
            if (x0 > 0) block.push([x0, r3(before), 0]);
            block.push([x0, y, 0], [x1, y, 0]);
            if (x1 < 1) block.push([x1, r3(after), 0]);
            if (i == -1) out.push(...block); else out.splice(i, 0, ...block);
            s.w = cleanWave(simplify(out));
        };
        let drag = null;
        canvas.addEventListener("pointerdown", (event) => {
            if (event.button == 2) return;
            event.preventDefault();
            canvas.setPointerCapture(event.pointerId);
            const [px, py] = local(event);
            const s = sh(), g = geom();
            if (paint || event.altKey) {
                drag = { paint: true };
                paintAt(px, py);
                host.changed(false);
                return;
            }
            const hit = hitTest(px, py);
            if (hit && hit.node != undefined) drag = { node: hit.node };
            else if (hit && hit.bend != undefined) drag = { bend: hit.bend, y0: py, c0: s.w[hit.bend][2] || 0 };
            else {
                const x = r3(snapX(fromX(px, g), event.shiftKey)), y = r3(fromY(py, g));
                let k = s.w.findIndex(n => n[0] > x);
                if (k <= 0) k = s.w.length - 1;
                s.w.splice(k, 0, [x, y, 0]);
                drag = { node: k };
                host.changed(false);
            }
        });
        canvas.addEventListener("pointermove", (event) => {
            const [px, py] = local(event);
            if (!drag) {
                const hit = hitTest(px, py);
                if (JSON.stringify(hit) != JSON.stringify(hover)) { hover = hit; draw(); }
                return;
            }
            const s = sh(), g = geom(), nodes = s.w;
            if (drag.paint) { paintAt(px, py); host.changed(false); return; }
            if (drag.node != undefined) {
                const k = drag.node, node = nodes[k];
                if (!node) return;
                node[1] = r3(fromY(py, g));
                if (k > 0 && k < nodes.length - 1) node[0] = r3(CarrotDSP.clamp(snapX(fromX(px, g), event.shiftKey), nodes[k - 1][0], nodes[k + 1][0]));
            }
            else if (drag.bend != undefined) {
                const a = nodes[drag.bend], b = nodes[drag.bend + 1];
                if (!a || !b) return;
                a[2] = r3(CarrotDSP.clamp(drag.c0 + (py - drag.y0) / 70 * (b[1] > a[1] ? 1 : -1), -1, 1));
            }
            host.changed(false);
        });
        const endDrag = () => {
            if (!drag) return;
            drag = null;
            const s = sh();
            s.w = cleanWave(simplify(s.w));
            host.changed(true);
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
        const removeAt = (event) => {
            const [px, py] = local(event);
            const hit = hitTest(px, py);
            const s = sh();
            if (hit && hit.node != undefined && hit.node > 0 && hit.node < s.w.length - 1) {
                s.w.splice(hit.node, 1);
                hover = null;
                host.changed(true);
            }
            else if (hit && hit.bend != undefined) {
                s.w[hit.bend][2] = 0;
                host.changed(true);
            }
        };
        canvas.addEventListener("dblclick", removeAt);
        canvas.addEventListener("contextmenu", (event) => { event.preventDefault(); removeAt(event); });

        // ---- curve tools
        const edit = (fn) => { const s = sh(); s.w = cleanWave(simplify(fn(s.w.map(n => n.slice())))); host.changed(true); draw(); };
        const shapeMenu = HTML.select({ class: "cb-select", title: "Load a curve" }, HTML.option({ value: "" }, "Load a curve…"), ...Object.entries(SHAPE_LIBRARY).map(([key, d]) => HTML.option({ value: key }, d.name)));
        shapeMenu.addEventListener("keydown", (event) => event.stopPropagation());
        shapeMenu.addEventListener("change", () => {
            if (!shapeMenu.value) return;
            const name = shapeMenu.value;
            shapeMenu.value = "";
            edit(() => shape(name, Math.floor(Math.random() * 1e9)));
        });
        const gridMenu = HTML.select({ class: "cb-select", title: "Grid: how many steps one cycle has (for snapping, painting and swing)" }, ...GRID_NAMES.map((name, i) => HTML.option({ value: i }, "Grid " + name)));
        gridMenu.addEventListener("keydown", (event) => event.stopPropagation());
        gridMenu.addEventListener("change", () => { sh().grid = +gridMenu.value; host.changed(true); draw(); });
        const snapToggle = CarrotUI.toggle({ label: "Snap", value: snap, title: "Snap points to the grid (hold Shift to place freely)", onChange: (v) => { snap = v; } });
        const paintToggle = CarrotUI.toggle({ label: "Paint", value: paint, title: "Paint steps on the grid (or hold Alt while dragging)", onChange: (v) => { paint = v; } });
        const tool = (label, title, fn) => CarrotUI.button(label, fn, { title });
        const tools = HTML.div({ class: "cb-cv-tools" },
            shapeMenu, gridMenu, snapToggle, paintToggle,
            tool("Flip", "Turn the curve upside down", () => edit(w => w.map(n => [n[0], r3(1 - n[1]), n[2]]))),
            tool("Reverse", "Play the curve backwards", () => edit(w => {
                const out = [];
                for (let k = w.length - 1; k >= 0; k--) out.push([r3(1 - w[k][0]), w[k][1], k > 0 ? -(w[k - 1][2] || 0) : 0]);
                return out;
            })),
            tool("◀", "Shift the curve one grid step earlier", () => edit(w => shiftWave(w, -1 / gridCount()))),
            tool("▶", "Shift the curve one grid step later", () => edit(w => shiftWave(w, 1 / gridCount()))),
            tool("×2", "Fit the curve twice into the cycle", () => edit(w => repeat(w, 2))),
            tool("Random", "A new random curve", () => edit(() => shape(Math.random() < 0.5 ? "random" : "smoothRandom", Math.floor(Math.random() * 1e9)))),
            tool("Copy", "Copy this curve", () => { clipboard = sh().w.map(n => n.slice()); host.toast("Curve copied"); }),
            tool("Paste", "Paste the copied curve here", () => { if (clipboard) edit(() => clipboard.map(n => n.slice())); else host.toast("Copy a curve first."); }),
            tool("Clear", "Reset to a flat line", () => edit(() => shape(BY_ID[selected].id == "pitch" || selected == "pan" || selected == "width" ? "mid" : /^(time|volume|filter)$/.test(selected) ? "flat" : "low"))));

        // ---- per-shaper controls
        const controls = HTML.div();
        const fmtPercent = (v) => Math.round(v * 100) + "%";
        const renderControls = () => {
            const s = sh(), def = BY_ID[selected], base = "sh." + selected + ".";
            controls.innerHTML = "";
            gridMenu.value = String(s.grid | 0);
            captionTop.textContent = def.top;
            captionBottom.textContent = def.bottom;
            const power = CarrotUI.toggle({ label: s.on ? "On" : "Off", value: s.on, title: "Turn this shaper on or off", onChange: (v) => { sh().on = v; host.changed(true); renderAll(); } });
            power.classList.add("cb-cv-power");
            const own = def.params.map(spec => spec.options
                ? host.select(base + spec.key, { label: spec.label, options: spec.options, def: spec.def })
                : host.knob(base + spec.key, { label: spec.label, min: spec.min, max: spec.max, def: spec.def, step: spec.step, unit: spec.unit, curve: spec.curve, small: true, title: spec.title, format: spec.percent ? fmtPercent : undefined }));
            controls.appendChild(CarrotUI.row(
                power,
                host.select(base + "rate", { label: "Length", options: RATE_NAMES, def: 5, onChange: () => draw() }),
                host.select(base + "trig", { label: "Follows", options: TRIGGERS, def: 0 }),
                host.select(base + "band", { label: "Band", options: BANDS, def: 0, onChange: () => renderFlow() }),
                host.knob(base + "depth", { label: def.id == "filter" ? "Mix" : "Depth", min: 0, max: 1, def: 1, small: true, format: fmtPercent }),
                host.knob(base + "smooth", { label: "Smooth", min: 0, max: 1, def: 0.12, small: true, format: fmtPercent, title: "Rounds off sharp corners (no clicks)" }),
                host.knob(base + "swing", { label: "Swing", min: 0, max: 0.5, def: 0, small: true, format: v => Math.round(v * 200) + "%", title: "Delays every second grid step" }),
                host.knob(base + "thr", { label: "Hit level", min: -60, max: 0, def: -24, unit: " dB", small: true, title: "With 'Audio hits': how loud a hit must be to restart the curve" }),
                ...own));
        };
        const renderAll = () => {
            renderTabs();
            renderFlow();
            renderControls();
            draw();
        };
        function select(id) {
            selected = id;
            lastSelected = id;
            try { window.localStorage.setItem("carrotCurveboxTab", id); } catch (error) { }
            const p = normalize(host.params());
            if (!p.sh[id]) { p.sh[id] = shaperDefaults(id); host.changed(false); }
            renderAll();
        }

        root.appendChild(CarrotUI.section("Shapers", tabs, HTML.div({ style: "margin-top: 6px;" }, flow)));
        root.appendChild(CarrotUI.section("Curve", tools, canvas, caption));
        root.appendChild(CarrotUI.section("Shaper", controls));
        root.appendChild(CarrotUI.section("Output", CarrotUI.row(
            host.knob("in", { label: "Input", min: -24, max: 24, def: 0, unit: " dB", small: true }),
            host.knob("mix", { label: "Dry/Wet", min: 0, max: 1, def: 1, small: true, format: fmtPercent }),
            host.knob("out", { label: "Output", min: -24, max: 12, def: 0, unit: " dB", small: true }),
            host.knob("xlo", { label: "Low / Mid", min: 40, max: 1500, def: 200, unit: " Hz", curve: "exp", small: true, title: "Where the low band ends (for shapers set to a band)" }),
            host.knob("xhi", { label: "Mid / High", min: 300, max: 12000, def: 2500, unit: " Hz", curve: "exp", small: true, title: "Where the high band starts" })),
            CarrotUI.hint("Shapers run top to bottom in the order shown above. Set a shaper's Band to Low to pump or chop only the bass, or to High to move only the hats and air.")));

        host.onRefresh(() => {
            const p = normalize(host.params());
            if (!p.sh[selected]) p.sh[selected] = shaperDefaults(selected);
            renderAll();
        });
        renderAll();
        // live view: tell the audio which shaper to watch and redraw while the window is open
        let seen = false;
        const loop = () => {
            if (root.isConnected) seen = true;
            else if (seen) return;
            const live = host.params()._live;
            if (live) live.visId = selected;
            if (root.isConnected) draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
        return root;
    }
    // Moves a looping curve along the cycle (what leaves one end comes back in at the other).
    function shiftWave(w, dx) {
        dx = ((dx % 1) + 1) % 1;
        if (dx < 1e-6 || dx > 1 - 1e-6) return w;
        const cut = 1 - dx, v = r3(waveValue(w, cut));
        const tail = w.filter(n => n[0] >= cut).map(n => [r3(n[0] - cut), n[1], n[2]]);
        const head = w.filter(n => n[0] <= cut).map(n => [r3(n[0] + dx), n[1], n[2]]);
        if (!tail.length || tail[0][0] > 0) tail.unshift([0, v, 0]);
        if (!head.length || head[head.length - 1][0] < 1) head.push([1, v, 0]);
        return tail.concat(head);
    }

    B.CarrotPlugins.register({
        id: "curvebox",
        width: 860,
        defaultParams,
        presets: PRESETS,
        randomize,
        createState,
        process,
        buildEditor,
        // for tests
        shapeLibrary: SHAPE_LIBRARY,
        shaperIds: ORDER,
    });
})();
