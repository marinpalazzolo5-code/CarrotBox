/*
 * Synth Vault - a sound browser full of classic instruments for CarrotBox
 * (in the style of Arturia's Analog Lab Pro).
 *
 * Nine sound engines modelled on the instruments that defined pop music -
 * a three-oscillator ladder monosynth, polyphonic analog synths, a dual-layer
 * "dream machine", six-operator FM, tine/reed electric pianos and a clav, an
 * acoustic piano, a tonewheel organ with a rotary speaker, a string machine
 * and a tape-replay keyboard - behind one browser of tagged presets with
 * likes, four macros, a Multi mode (split or layer two sounds) and an FX rack.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, CarrotADSR, CarrotSVF, CarrotDelayLine, carrotFxRack } = A;

    const BLOCK = 16;
    const TWO_PI = Math.PI * 2;
    const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
    const ftanh = (x) => x <= -3 ? -1 : x >= 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x);
    const blep = (t, dt) => CarrotDSP.polyBlep(t, dt);
    const saw = (t, dt) => 2 * t - 1 - blep(t, dt);
    const tri = (t) => 1 - 4 * Math.abs(t - 0.5);
    function pulse(t, dt, w) {
        let v = t < w ? 1 : -1;
        v += blep(t, dt);
        v -= blep((t + 1 - w) % 1, dt);
        return v;
    }
    const noise = () => Math.random() * 2 - 1;
    const SINE = new Float32Array(4097);
    for (let i = 0; i <= 4096; i++) SINE[i] = Math.sin(TWO_PI * i / 4096);
    const fastSin = (ph) => { const x = ph * 4096, i = x | 0; return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i); };
    const onePoleCoef = (hz, sr) => 1 - Math.exp(-TWO_PI * Math.min(hz, sr * 0.45) / sr);

    // Four one-pole stages with saturating feedback (transistor ladder).
    class Ladder {
        constructor() { this.y1 = this.y2 = this.y3 = this.y4 = 0; this.g = 0.1; this.k = 0; }
        set(fc, res, sr) {
            this.g = 1 - Math.exp(-TWO_PI * Math.min(Math.max(fc, 10), sr * 0.42) / sr);
            this.k = clamp(res, 0, 1) * 4.2;
        }
        tick(x) {
            const u = ftanh(x - this.k * this.y4);
            this.y1 += this.g * (u - this.y1);
            this.y2 += this.g * (this.y1 - this.y2);
            this.y3 += this.g * (this.y2 - this.y3);
            this.y4 += this.g * (this.y3 - this.y4);
            return this.y4 * (1 + this.k * 0.35);
        }
    }
    function releaseVoice(v, info, envs) {
        if (!info.gate && !v.rel) {
            v.rel = true;
            for (const e of envs) e.release();
        }
    }
    function env(a, d, s, r, sr) {
        const e = new CarrotADSR();
        e.set(a, d, s, r, sr);
        e.trigger();
        return e;
    }
    const velOf = (info) => info.velocity == undefined ? 0.8 : info.velocity;

    // spec helpers: knob K(key, label, min, max, default, extra) and option list O(key, label, options, default)
    const K = (k, l, min, max, def, x) => Object.assign({ k, l, min, max, def }, x || {});
    const O = (k, l, o, def) => ({ k, l, o, def });
    const PC = { pc: true };
    const EXP = { c: "exp" };
    const SEC = (x) => Object.assign({ c: "exp", u: " s" }, x || {});
    const HZ = (x) => Object.assign({ c: "exp", u: " Hz" }, x || {});
    const DIRECT = (x) => x;

    // =================================================================== engines
    const ENGINES = {};
    const ENGINE_ORDER = [];
    function engine(def) {
        ENGINES[def.id] = def;
        ENGINE_ORDER.push(def.id);
        def.specs = [];
        for (const [, list] of def.sections) for (const s of list) def.specs.push(s);
        def.defaults = () => {
            const p = {};
            for (const s of def.specs) p[s.k] = s.def;
            return p;
        };
    }
    // Macros: x is -1..1 (the knob's middle is the preset as saved).
    const scaleTime = (p, keys, x, range = 3) => { for (const k of keys) if (typeof p[k] == "number") p[k] *= Math.pow(2, x * range); };

    // ------------------------------------------------------------ Mono 3-Osc
    const MINI_WAVES = ["Triangle", "Tri-saw", "Saw", "Square", "Wide pulse", "Narrow pulse"];
    const RANGES = ["32'", "16'", "8'", "4'", "2'"];
    function miniWave(w, t, dt) {
        switch (w) {
            case 0: return tri(t);
            case 1: return 0.5 * (tri(t) + saw(t, dt));
            case 2: return saw(t, dt);
            case 3: return pulse(t, dt, 0.5);
            case 4: return pulse(t, dt, 0.3);
            default: return pulse(t, dt, 0.12);
        }
    }
    engine({
        id: "mini", name: "Mono Ladder", style: "Minimoog-style", color: "#ff9e40", icon: "Mo",
        about: "Three oscillators and noise into a saturating four-pole ladder filter, with the classic contour envelopes and glide.",
        sections: [
            ["Oscillators", [
                O("o1w", "Osc 1", MINI_WAVES, 2), O("o1r", "Range", RANGES, 1), K("o1l", "Level", 0, 1, 0.9, PC),
                O("o2w", "Osc 2", MINI_WAVES, 2), O("o2r", "Range", RANGES, 1), K("o2t", "Tune", -7, 7, 0.08, { u: " st", st: 0.01 }), K("o2l", "Level", 0, 1, 0.7, PC),
                O("o3w", "Osc 3", MINI_WAVES, 3), O("o3r", "Range", RANGES, 0), K("o3t", "Tune", -7, 7, -0.05, { u: " st", st: 0.01 }), K("o3l", "Level", 0, 1, 0.5, PC),
                K("nz", "Noise", 0, 1, 0, PC),
            ]],
            ["Filter", [
                K("cut", "Cutoff", 30, 16000, 900, HZ()), K("emp", "Emphasis", 0, 1, 0.35, PC), K("cont", "Contour", 0, 1, 0.55, PC),
                O("kt", "Key track", ["Off", "1/3", "2/3", "Full"], 1), K("drv", "Overload", 0, 1, 0.2, PC),
                K("fa", "Attack", 0.001, 5, 0.005, SEC()), K("fd", "Decay", 0.01, 8, 0.45, SEC()), K("fs", "Sustain", 0, 1, 0.3, PC),
            ]],
            ["Loudness", [
                K("aa", "Attack", 0.001, 5, 0.003, SEC()), K("ad", "Decay", 0.01, 8, 0.6, SEC()), K("as", "Sustain", 0, 1, 0.85, PC), K("ar", "Release", 0.01, 8, 0.15, SEC()),
            ]],
            ["Play", [
                K("glide", "Glide", 0, 1, 0, { u: " s" }), K("vib", "Vibrato", 0, 1, 0, PC), K("vibr", "Rate", 0.5, 12, 5.5, HZ()), K("fmod", "Filter mod", 0, 1, 0, PC),
                K("vel", "Velocity", 0, 1, 0.3, PC), K("vol", "Volume", 0, 1, 0.75, PC),
            ]],
        ],
        macros: [
            (p, x) => { p.cut *= Math.pow(2, x * 2.5); p.emp = clamp(p.emp + Math.max(0, x) * 0.15, 0, 1); },
            (p, x) => { p.o2l = clamp(p.o2l + x * 0.5, 0, 1); p.drv = clamp(p.drv + x * 0.5, 0, 1); },
            (p, x) => scaleTime(p, ["aa", "ar", "fa", "fd", "ad"], x),
            (p, x) => { p.vib = clamp(p.vib + x * 0.6, 0, 1); p.fmod = clamp(p.fmod + x * 0.5, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate;
            const v = { ph: [Math.random(), Math.random(), Math.random()], lad: new Ladder(), lfo: Math.random(), glide: 1, rel: false };
            if (p.glide > 0.001 && info.prevDelta != null && info.prevGap != null && info.prevGap < 0.05) v.glide = Math.pow(2, -info.prevDelta / 12);
            v.amp = env(p.aa, p.ad, p.as, p.ar, sr);
            v.fe = env(p.fa, p.fd, p.fs, p.ar, sr);
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            releaseVoice(v, info, [v.amp, v.fe]);
            v.amp.set(p.aa, p.ad, p.as, p.ar, sr);
            v.fe.set(p.fa, p.fd, p.fs, p.ar, sr);
            const vel = velOf(info), velAmp = 1 - p.vel * 0.6 + p.vel * 0.6 * vel;
            const l1 = p.o1l, l2 = p.o2l, l3 = p.o3l, w1 = p.o1w | 0, w2 = p.o2w | 0, w3 = p.o3w | 0;
            const m1 = Math.pow(2, (p.o1r | 0) - 2), m2 = Math.pow(2, (p.o2r | 0) - 2 + p.o2t / 12), m3 = Math.pow(2, (p.o3r | 0) - 2 + p.o3t / 12);
            const drv = 1 + p.drv * 4, comp = 1 / Math.sqrt(drv);
            const kt = [0, 1 / 3, 2 / 3, 1][p.kt | 0] || 0;
            const glideCoef = p.glide > 0.001 ? Math.exp(-BLOCK / (p.glide * sr * 0.35)) : 0;
            const gain = p.vol * velAmp * 0.72 * (p._gain == undefined ? 1 : p._gain);
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const ph = v.ph;
            for (let i = start, end = start + len; i < end;) {
                const n = Math.min(BLOCK, end - i);
                v.glide = 1 + (v.glide - 1) * glideCoef;
                v.lfo += p.vibr * n / sr;
                v.lfo -= Math.floor(v.lfo);
                const lv = Math.sin(TWO_PI * v.lfo);
                const base = freq * v.glide * Math.pow(2, lv * p.vib * 0.6 / 12);
                const fc = p.cut * Math.pow(2, p.cont * v.fe.level * 5 + kt * (info.midi - 60) / 12 + p.fmod * lv * 1.5 + p.vel * (vel - 0.7) * 1.5);
                v.lad.set(fc, p.emp, sr);
                const d1 = Math.min(0.45, base * m1 / sr), d2 = Math.min(0.45, base * m2 / sr), d3 = Math.min(0.45, base * m3 / sr);
                for (let j = 0; j < n; j++) {
                    let x = 0;
                    if (l1 > 0.001) x += miniWave(w1, ph[0], d1) * l1;
                    if (l2 > 0.001) x += miniWave(w2, ph[1], d2) * l2;
                    if (l3 > 0.001) x += miniWave(w3, ph[2], d3) * l3;
                    ph[0] += d1; if (ph[0] >= 1) ph[0] -= 1;
                    ph[1] += d2; if (ph[1] >= 1) ph[1] -= 1;
                    ph[2] += d3; if (ph[2] >= 1) ph[2] -= 1;
                    if (p.nz > 0) x += noise() * p.nz;
                    const y = v.lad.tick(x * 0.42 * drv) * comp;
                    v.fe.next();
                    out[i + j] += y * v.amp.next() * gain;
                }
                i += n;
                freq *= fstep;
            }
            if (v.rel && v.amp.done) v.done = true;
        },
    });

    // ------------------------------------------------------------ Poly Analog
    function polyWaveA(w, t, dt, pw) {
        switch (w) {
            case 0: return saw(t, dt);
            case 1: return pulse(t, dt, pw);
            case 2: return tri(t);
            default: return 0.6 * (saw(t, dt) + pulse(t, dt, pw));
        }
    }
    engine({
        id: "poly", name: "Poly Analog", style: "Jupiter-8, Prophet-5 and OB-X-style", color: "#ff5c6c", icon: "Po",
        about: "Two oscillators per voice with sync and poly-mod, a high-pass and a choice of three filter characters, unison, analog drift and a stereo chorus.",
        sections: [
            ["Oscillators", [
                O("model", "Character", ["Smooth 4-pole (Jup)", "Punchy ladder (Prophet)", "12 dB SVF (OB)"], 0),
                O("aw", "Osc A", ["Saw", "Pulse", "Triangle", "Saw + pulse"], 0), O("aoct", "Octave", ["-2", "-1", "0", "+1", "+2"], 2), K("apw", "Pulse width", 0.05, 0.95, 0.5, PC), K("al", "Level A", 0, 1, 0.9, PC),
                O("bw", "Osc B", ["Saw", "Pulse", "Triangle", "Noise"], 0), O("boct", "Octave", ["-2", "-1", "0", "+1", "+2"], 2), K("bsemi", "Semitones", -12, 12, 0, { st: 1, u: " st" }), K("bdet", "Detune", -50, 50, 7, { u: " ct" }), K("bl", "Level B", 0, 1, 0.7, PC),
                O("sync", "Sync B to A", ["Off", "On"], 0), K("pm", "Poly-mod (B > A)", 0, 1, 0, PC), K("pme", "Env > B pitch", 0, 1, 0, PC), K("nz", "Noise", 0, 1, 0, PC),
            ]],
            ["Filter", [
                K("hpf", "High pass", 20, 2000, 20, HZ()), K("cut", "Cutoff", 30, 16000, 2400, HZ()), K("res", "Resonance", 0, 1, 0.25, PC), K("fenv", "Env amount", -1, 1, 0.4, PC),
                K("kt", "Key track", 0, 1, 0.5, PC), K("fvel", "Velocity", 0, 1, 0.3, PC),
                K("fa", "Attack", 0.001, 5, 0.005, SEC()), K("fd", "Decay", 0.01, 8, 0.6, SEC()), K("fs", "Sustain", 0, 1, 0.4, PC), K("fr", "Release", 0.01, 8, 0.4, SEC()),
            ]],
            ["Amplifier", [
                K("aa", "Attack", 0.001, 5, 0.004, SEC()), K("ad", "Decay", 0.01, 8, 0.8, SEC()), K("as", "Sustain", 0, 1, 0.85, PC), K("ar", "Release", 0.01, 8, 0.4, SEC()), K("vel", "Velocity", 0, 1, 0.4, PC),
            ]],
            ["LFO and voice", [
                K("lr", "LFO rate", 0.05, 20, 4.5, HZ()), O("lshape", "LFO shape", ["Sine", "Triangle", "Square", "Sample & hold"], 0), K("ldel", "LFO delay", 0, 3, 0, { u: " s" }),
                K("lp", "> Pitch", 0, 1, 0, PC), K("lf", "> Filter", 0, 1, 0, PC), K("lpw", "> PW", 0, 1, 0, PC),
                O("uni", "Unison", ["1", "2", "3", "4"], 0), K("udet", "Spread", 0, 1, 0.2, PC), K("drift", "Drift", 0, 1, 0.3, PC), K("glide", "Glide", 0, 1, 0, { u: " s" }),
                O("chorus", "Chorus", ["Off", "I", "II", "I + II"], 0), K("vol", "Volume", 0, 1, 0.7, PC),
            ]],
        ],
        macros: [
            (p, x) => { p.cut *= Math.pow(2, x * 2.5); },
            (p, x) => { p.apw = clamp(p.apw - x * 0.3, 0.05, 0.95); p.bl = clamp(p.bl + x * 0.4, 0, 1); p.res = clamp(p.res + x * 0.2, 0, 1); },
            (p, x) => scaleTime(p, ["aa", "ar", "fa", "fd", "fr", "ad"], x),
            (p, x) => { p.lf = clamp(p.lf + x * 0.5, 0, 1); p.lp = clamp(p.lp + Math.max(0, x) * 0.15, 0, 1); p.udet = clamp(p.udet + x * 0.3, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate, n = (p.uni | 0) + 1;
            const v = { n, pa: new Float64Array(n), pb: new Float64Array(n), cents: new Float64Array(n), wob: new Float64Array(n), f: [new CarrotSVF(), new CarrotSVF()], lad: new Ladder(), hp: 0, lfo: Math.random(), sh: noise(), age: 0, glide: 1, rel: false };
            for (let u = 0; u < n; u++) {
                v.pa[u] = Math.random(); v.pb[u] = Math.random(); v.wob[u] = Math.random();
                const spread = n == 1 ? 0 : (u / (n - 1)) * 2 - 1;
                v.cents[u] = spread * p.udet * 22 + noise() * p.drift * 5;
            }
            if (p.glide > 0.001 && info.prevDelta != null && info.prevGap != null && info.prevGap < 0.05) v.glide = Math.pow(2, -info.prevDelta / 12);
            v.amp = env(p.aa, p.ad, p.as, p.ar, sr);
            v.fe = env(p.fa, p.fd, p.fs, p.fr, sr);
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            releaseVoice(v, info, [v.amp, v.fe]);
            v.amp.set(p.aa, p.ad, p.as, p.ar, sr);
            v.fe.set(p.fa, p.fd, p.fs, p.fr, sr);
            const vel = velOf(info), velAmp = 1 - p.vel * 0.7 + p.vel * 0.7 * vel;
            const n = v.n, model = p.model | 0, aw = p.aw | 0, bw = p.bw | 0, sync = (p.sync | 0) == 1;
            const octA = (p.aoct | 0) - 2, octB = (p.boct | 0) - 2;
            const glideCoef = p.glide > 0.001 ? Math.exp(-BLOCK / (p.glide * sr * 0.35)) : 0;
            const hpK = onePoleCoef(p.hpf, sr);
            const norm = 1 / Math.sqrt(n);
            const gain = p.vol * velAmp * (p._gain == undefined ? 1 : p._gain) * 0.75;
            const dA = new Float64Array(n), dB = new Float64Array(n);
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                v.age += m / sr;
                v.glide = 1 + (v.glide - 1) * glideCoef;
                // LFO (with delay)
                v.lfo += p.lr * m / sr;
                if (v.lfo >= 1) { v.lfo -= Math.floor(v.lfo); v.sh = noise(); }
                const shape = p.lshape | 0;
                let lv = shape == 0 ? Math.sin(TWO_PI * v.lfo) : shape == 1 ? tri(v.lfo) : shape == 2 ? (v.lfo < 0.5 ? 1 : -1) : v.sh;
                if (p.ldel > 0) lv *= Math.min(1, v.age / p.ldel);
                const fe = v.fe.level;
                const base = freq * v.glide * Math.pow(2, lv * p.lp * 0.5 / 12);
                for (let u = 0; u < n; u++) {
                    v.wob[u] += (0.13 + 0.05 * u) * m / sr;
                    const drift = Math.sin(TWO_PI * v.wob[u]) * p.drift * 3;
                    const c = Math.pow(2, (v.cents[u] + drift) / 1200);
                    dA[u] = Math.min(0.45, base * c * Math.pow(2, octA) / sr);
                    dB[u] = Math.min(0.45, base * c * Math.pow(2, octB + (p.bsemi + p.bdet / 100 + p.pme * fe * 24) / 12) / sr);
                }
                const pw = clamp(p.apw + lv * p.lpw * 0.4, 0.05, 0.95);
                const fc = p.cut * Math.pow(2, p.fenv * fe * 6 + p.kt * (info.midi - 60) / 12 + p.lf * lv * 2 + p.fvel * (vel - 0.7) * 2);
                if (model == 1) v.lad.set(fc, p.res, sr);
                else {
                    const r = model == 0 ? p.res * 0.85 : p.res;
                    v.f[0].set(fc, r, sr);
                    if (model == 0) v.f[1].set(fc, r * 0.6, sr);
                }
                for (let j = 0; j < m; j++) {
                    let x = 0;
                    for (let u = 0; u < n; u++) {
                        const b = bw == 3 ? noise() : polyWaveA(bw == 0 ? 0 : bw == 1 ? 1 : 2, v.pb[u], dB[u], pw);
                        const da = Math.max(0, dA[u] * (1 + p.pm * b * 1.5));
                        const a = polyWaveA(aw, v.pa[u], da, pw);
                        v.pa[u] += da;
                        if (v.pa[u] >= 1) { v.pa[u] -= 1; if (sync) v.pb[u] = v.pa[u] * dB[u] / Math.max(1e-9, da); }
                        v.pb[u] += dB[u];
                        if (v.pb[u] >= 1) v.pb[u] -= 1;
                        x += a * p.al + b * p.bl;
                    }
                    x *= norm;
                    if (p.nz > 0) x += noise() * p.nz * 0.7;
                    v.hp += (x - v.hp) * hpK;
                    if (p.hpf > 21) x -= v.hp;
                    let y;
                    if (model == 1) y = v.lad.tick(x * 0.45) * 1.3;
                    else if (model == 0) y = v.f[1].process(v.f[0].process(ftanh(x * 0.5) * 2, 0), 0) * 0.5;
                    else y = v.f[0].process(x, 0) * 0.55;
                    v.fe.next();
                    out[i + j] += y * v.amp.next() * gain;
                }
                i += m;
                freq *= fstep;
            }
            if (v.rel && v.amp.done) v.done = true;
        },
        fx: {
            create: (sr) => new Chorus(sr),
            process: (st, p, L, R, start, end) => {
                const mode = p.chorus | 0;
                if (mode) st.process(L, R, start, end, [null, { rate: 0.513, depth: 1.6, base: 3.6, mix: 0.5 }, { rate: 0.863, depth: 1.9, base: 3.6, mix: 0.55 }, { rate: 9.75, depth: 0.35, base: 3.2, mix: 0.45 }][mode]);
            },
        },
    });

    // ------------------------------------------------------------ Dual Layer
    function layerSpecs(n, d) {
        const k = (s) => "l" + n + s;
        return [
            K(k("saw"), "Saw", 0, 1, d.saw, PC), K(k("sq"), "Pulse", 0, 1, d.sq, PC), K(k("pw"), "Width", 0.05, 0.5, d.pw, PC), K(k("sin"), "Sine", 0, 1, d.sin, PC), K(k("nz"), "Noise", 0, 1, 0, PC),
            K(k("hp"), "High pass", 20, 4000, d.hp, HZ()), K(k("lp"), "Low pass", 60, 16000, d.lp, HZ()), K(k("res"), "Resonance", 0, 1, d.res, PC),
            K(k("il"), "Initial level", -1, 1, d.il, PC), K(k("al"), "Attack level", -1, 1, d.al, PC), K(k("fa"), "Filter attack", 0.001, 5, d.fa, SEC()), K(k("fd"), "Filter decay", 0.01, 10, d.fd, SEC()),
            K(k("aa"), "Attack", 0.001, 5, d.aa, SEC()), K(k("ad"), "Decay", 0.01, 10, d.ad, SEC()), K(k("as"), "Sustain", 0, 1, d.as, PC), K(k("ar"), "Release", 0.01, 10, d.ar, SEC()),
            K(k("lvl"), "Level", 0, 1, d.lvl, PC),
        ];
    }
    function csFilterEnv(st, il, al, fa, fd, dt) {
        // initial level -> attack level over the attack, then back towards 0 (the knob setting) over the decay
        st.t += dt;
        if (st.t < fa) return il + (al - il) * (st.t / fa);
        return al * Math.exp(-(st.t - fa) / Math.max(0.01, fd) * 2.3);
    }
    engine({
        id: "cs", name: "Dual Layer", style: "CS-80-style", color: "#d4a373", icon: "DL",
        about: "Two complete synth layers, each with saw, pulse, sine and noise through its own high- and low-pass filters and envelopes, plus brilliance, touch, ring modulation and a lush chorus.",
        sections: [
            ["Layer I", layerSpecs(1, { saw: 0.8, sq: 0, pw: 0.3, sin: 0, hp: 40, lp: 1400, res: 0.2, il: 0, al: 0.5, fa: 0.2, fd: 1.2, aa: 0.08, ad: 1, as: 0.85, ar: 0.6, lvl: 0.8 })],
            ["Layer II", layerSpecs(2, { saw: 0.4, sq: 0.6, pw: 0.25, sin: 0, hp: 120, lp: 2600, res: 0.15, il: -0.2, al: 0.6, fa: 0.4, fd: 2, aa: 0.25, ad: 1.5, as: 0.8, ar: 1, lvl: 0.6 })],
            ["Performance", [
                K("det", "Layer II detune", 0, 30, 8, { u: " ct" }), O("feet", "Layer II octave", ["-1", "0", "+1"], 1), K("bril", "Brilliance", -1, 1, 0, PC), K("touch", "Touch", 0, 1, 0.6, PC),
                K("ring", "Ring mod", 0, 1, 0, PC), K("ringr", "Ring speed", 1, 60, 8, HZ()), K("vib", "Vibrato", 0, 1, 0.1, PC), K("vibr", "Vibrato rate", 1, 12, 5.8, HZ()),
                O("chorus", "Chorus", ["Off", "On"], 1), K("vol", "Volume", 0, 1, 0.7, PC),
            ]],
        ],
        macros: [
            (p, x) => { p.bril = clamp(p.bril + x, -1, 1); },
            (p, x) => { p.l1lvl = clamp(p.l1lvl * (1 - x * 0.8), 0, 1); p.l2lvl = clamp(p.l2lvl * (1 + x * 0.8), 0, 1); },
            (p, x) => scaleTime(p, ["l1aa", "l1ar", "l2aa", "l2ar", "l1fa", "l2fa", "l1fd", "l2fd"], x),
            (p, x) => { p.vib = clamp(p.vib + x * 0.5, 0, 1); p.ring = clamp(p.ring + Math.max(0, x) * 0.3, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate;
            const layer = (n) => ({ ph: [Math.random(), Math.random(), Math.random()], hp: new CarrotSVF(), lp: new CarrotSVF(), fe: { t: 0 }, amp: env(p["l" + n + "aa"], p["l" + n + "ad"], p["l" + n + "as"], p["l" + n + "ar"], sr) });
            return { L: [layer(1), layer(2)], ring: 0, vib: Math.random(), rel: false };
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            releaseVoice(v, info, [v.L[0].amp, v.L[1].amp]);
            const vel = velOf(info), touch = p.touch;
            const velAmp = 1 - touch * 0.6 + touch * 0.6 * vel;
            const gain = p.vol * velAmp * (p._gain == undefined ? 1 : p._gain) * 0.55;
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const key = (info.midi - 60) / 12;
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                v.vib += p.vibr * m / sr;
                v.vib -= Math.floor(v.vib);
                const vibMul = Math.pow(2, Math.sin(TWO_PI * v.vib) * p.vib * 0.35 / 12);
                for (let n = 0; n < 2; n++) {
                    const L = v.L[n], k = "l" + (n + 1);
                    L.amp.set(p[k + "aa"], p[k + "ad"], p[k + "as"], p[k + "ar"], sr);
                    L.saw = p[k + "saw"]; L.sq = p[k + "sq"]; L.pw = p[k + "pw"]; L.sin = p[k + "sin"]; L.nz = p[k + "nz"]; L.lvl = p[k + "lvl"];
                    const fev = csFilterEnv(L.fe, p[k + "il"], p[k + "al"], p[k + "fa"], p[k + "fd"], m / sr);
                    const oct = n == 1 ? (p.feet | 0) - 1 : 0;
                    const hz = freq * vibMul * Math.pow(2, oct + (n == 1 ? p.det / 1200 : 0));
                    L.dt = Math.min(0.45, hz / sr);
                    const fc = p[k + "lp"] * Math.pow(2, fev * 4 + p.bril * 1.5 + touch * (vel - 0.7) * 2 + 0.5 * key);
                    L.lp.set(fc, p[k + "res"], sr);
                    L.hp.set(p[k + "hp"], p[k + "res"] * 0.5, sr);
                }
                const ringInc = p.ringr / sr;
                for (let j = 0; j < m; j++) {
                    let sum = 0;
                    for (let n = 0; n < 2; n++) {
                        const L = v.L[n], dt = L.dt, ph = L.ph;
                        let x = 0;
                        if (L.saw > 0.001) x += saw(ph[0], dt) * L.saw;
                        if (L.sq > 0.001) x += pulse(ph[0], dt, L.pw) * L.sq;
                        if (L.sin > 0.001) x += fastSin(ph[0]) * L.sin;
                        if (L.nz > 0.001) x += noise() * L.nz * 0.6;
                        ph[0] += dt; if (ph[0] >= 1) ph[0] -= 1;
                        const y = L.lp.process(L.hp.process(x, 1), 0);
                        sum += y * L.amp.next() * L.lvl;
                    }
                    if (p.ring > 0.001) {
                        v.ring += ringInc; if (v.ring >= 1) v.ring -= 1;
                        sum *= 1 - p.ring + p.ring * Math.sin(TWO_PI * v.ring);
                    }
                    out[i + j] += sum * gain;
                }
                i += m;
                freq *= fstep;
            }
            if (v.rel && v.L[0].amp.done && v.L[1].amp.done) v.done = true;
        },
        fx: {
            create: (sr) => new Chorus(sr),
            process: (st, p, L, R, start, end) => { if ((p.chorus | 0) == 1) st.process(L, R, start, end, { rate: 0.7, depth: 2.2, base: 5, mix: 0.45, three: true }); },
        },
    });

    // ------------------------------------------------------------ 6-Op FM
    // Who modulates whom (ops 1..6 are 0..5; modulators always have a higher number).
    const FM_ALGS = {
        "1": { mods: [[1], [], [3], [4], [5], []], car: [0, 2], fb: 5 },
        "2": { mods: [[1], [], [3], [4], [5], []], car: [0, 2], fb: 1 },
        "5": { mods: [[1], [], [3], [], [5], []], car: [0, 2, 4], fb: 5 },
        "7": { mods: [[1], [], [3, 4], [], [5], []], car: [0, 2], fb: 5 },
        "16": { mods: [[1, 2, 4], [], [3], [], [5], []], car: [0], fb: 5 },
        "19": { mods: [[1], [2], [], [5], [5], []], car: [0, 3, 4], fb: 5 },
        "22": { mods: [[1], [], [5], [5], [5], []], car: [0, 2, 3, 4], fb: 5 },
        "25": { mods: [[], [], [], [5], [5], []], car: [0, 1, 2, 3, 4], fb: 5 },
        "31": { mods: [[], [], [], [], [5], []], car: [0, 1, 2, 3, 4], fb: 5 },
        "32": { mods: [[], [], [], [], [], []], car: [0, 1, 2, 3, 4, 5], fb: 5 },
    };
    const FM_ALG_NAMES = Object.keys(FM_ALGS);
    function opSpecs(i, d) {
        return [
            K("r" + i, "Ratio", 0.5, 16, d[0], { st: 0.01, u: "x" }), K("dt" + i, "Detune", -20, 20, d[1] || 0, { u: " ct" }), K("l" + i, "Level", 0, 1, d[2], PC),
            K("a" + i, "Attack", 0.001, 4, d[3], SEC()), K("d" + i, "Decay", 0.01, 12, d[4], SEC()), K("s" + i, "Sustain", 0, 1, d[5], PC), K("rl" + i, "Release", 0.01, 8, d[6], SEC()),
            K("v" + i, "Velocity", 0, 1, d[7], PC),
        ];
    }
    engine({
        id: "fm", name: "6-Op FM", style: "DX7-style", color: "#7e57c2", icon: "FM",
        about: "Six sine operators in ten classic algorithms with feedback, per-operator envelopes and velocity, and keyboard rate scaling: tine pianos, bells, slap basses and glassy pads.",
        sections: [
            ["Algorithm", [
                O("alg", "Algorithm", FM_ALG_NAMES, 2), K("fb", "Feedback", 0, 1, 0.3, PC), K("mi", "Mod depth", 0, 2, 1, PC), K("ks", "Rate scaling", 0, 1, 0.4, PC),
                K("tr", "Transpose", -24, 24, 0, { st: 1, u: " st" }), K("vib", "Vibrato", 0, 1, 0, PC), K("vibr", "Rate", 0.5, 12, 5.5, HZ()), K("vol", "Volume", 0, 1, 0.7, PC),
            ]],
            ["Op 1", opSpecs(1, [1, 3, 0.9, 0.001, 3, 0, 0.5, 0.3])],
            ["Op 2", opSpecs(2, [1, -3, 0.5, 0.001, 1.4, 0.1, 0.4, 0.7])],
            ["Op 3", opSpecs(3, [1, 0, 0.8, 0.001, 3.5, 0, 0.6, 0.3])],
            ["Op 4", opSpecs(4, [14, 0, 0.25, 0.001, 0.25, 0, 0.2, 0.9])],
            ["Op 5", opSpecs(5, [1, 2, 0.6, 0.001, 2.5, 0, 0.5, 0.3])],
            ["Op 6", opSpecs(6, [1, 0, 0.4, 0.001, 1.2, 0, 0.4, 0.6])],
        ],
        macros: [
            (p, x) => { p.mi = clamp(p.mi * Math.pow(2, x * 1.2), 0, 3); },
            (p, x) => { p.fb = clamp(p.fb + x * 0.5, 0, 1); },
            (p, x) => { for (let i = 1; i <= 6; i++) { p["d" + i] *= Math.pow(2, x * 2); p["rl" + i] *= Math.pow(2, x * 2); p["a" + i] *= Math.pow(2, Math.max(0, x) * 6); } },
            (p, x) => { p.vib = clamp(p.vib + x * 0.6, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate;
            const v = { ph: new Float64Array(6), out: new Float64Array(6), fb1: 0, fb2: 0, env: [], vib: Math.random(), rel: false };
            const ks = Math.pow(2, -p.ks * (info.midi - 60) / 24);
            for (let i = 1; i <= 6; i++) v.env.push(env(p["a" + i], p["d" + i] * ks, p["s" + i], p["rl" + i] * ks, sr));
            v.ks = ks;
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            releaseVoice(v, info, v.env);
            const alg = FM_ALGS[FM_ALG_NAMES[p.alg | 0]] || FM_ALGS["5"];
            const isCar = [false, false, false, false, false, false];
            for (const c of alg.car) isCar[c] = true;
            const vel = velOf(info);
            const ratio = new Float64Array(6), amp = new Float64Array(6);
            for (let o = 0; o < 6; o++) {
                const i = o + 1;
                v.env[o].set(p["a" + i], p["d" + i] * v.ks, p["s" + i], p["rl" + i] * v.ks, sr);
                ratio[o] = p["r" + i] * Math.pow(2, p["dt" + i] / 1200);
                const lvl = p["l" + i] * (1 - p["v" + i] + p["v" + i] * vel);
                amp[o] = isCar[o] ? Math.pow(lvl, 1.5) : 7 * Math.pow(lvl, 2.5) * p.mi;
            }
            const carNorm = 1 / Math.sqrt(alg.car.length);
            const fbAmt = p.fb * 1.6, fbOp = alg.fb;
            const gain = p.vol * (p._gain == undefined ? 1 : p._gain) * carNorm * 0.5;
            const tr = Math.pow(2, p.tr / 12);
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const inc = new Float64Array(6), o_ = v.out, ph = v.ph, mods = alg.mods;
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                v.vib += p.vibr * m / sr;
                v.vib -= Math.floor(v.vib);
                const base = freq * tr * Math.pow(2, Math.sin(TWO_PI * v.vib) * p.vib * 0.4 / 12) / sr;
                for (let o = 0; o < 6; o++) inc[o] = base * ratio[o];
                for (let j = 0; j < m; j++) {
                    let sum = 0;
                    for (let o = 5; o >= 0; o--) {
                        const e = v.env[o].next();
                        let pm = 0;
                        const list = mods[o];
                        for (let k = 0; k < list.length; k++) pm += o_[list[k]];
                        if (o == fbOp) pm += fbAmt * 0.5 * (v.fb1 + v.fb2);
                        const s = Math.sin(TWO_PI * ph[o] + pm);
                        if (o == fbOp) { v.fb2 = v.fb1; v.fb1 = s * e; }
                        o_[o] = s * e * amp[o];
                        ph[o] += inc[o];
                        if (ph[o] >= 1) ph[o] -= Math.floor(ph[o]);
                        if (isCar[o]) sum += o_[o];
                    }
                    out[i + j] += sum * gain;
                }
                i += m;
                freq *= fstep;
            }
            if (v.rel && alg.car.every(c => v.env[c].done)) v.done = true;
        },
    });

    // ------------------------------------------------------------ Electric Piano
    engine({
        id: "ep", name: "Electric Piano", style: "Rhodes, Wurlitzer and Clavinet-style", color: "#e35d4f", icon: "EP",
        about: "Struck tines with their bell overtones and a magnetic pickup that barks when you play hard, a reed piano, and a plucked clav with pickup position and mute. Tremolo and auto-pan built in.",
        sections: [
            ["Instrument", [
                O("model", "Model", ["Stage tine", "Suitcase tine", "Reed", "Clav"], 0), K("bark", "Bark", 0, 1, 0.35, PC), K("bell", "Bell", 0, 1, 0.4, PC),
                K("decay", "Decay", 0.3, 3, 1, { u: "x" }), K("tone", "Tone", 500, 12000, 6000, HZ()), K("vel", "Velocity", 0, 1, 0.7, PC), K("damp", "Damper", 0.02, 1, 0.12, SEC()),
            ]],
            ["Clav", [K("pick", "Pickup", 0.05, 0.5, 0.25, PC), K("mute", "Mute", 0, 1, 0, PC)]],
            ["Tremolo", [K("trem", "Depth", 0, 1, 0, PC), K("tremr", "Rate", 1, 10, 4.5, HZ())]],
            ["Output", [K("vol", "Volume", 0, 1, 0.75, PC)]],
        ],
        macros: [
            (p, x) => { p.tone *= Math.pow(2, x * 1.5); },
            (p, x) => { p.bark = clamp(p.bark + x * 0.5, 0, 1); p.bell = clamp(p.bell + x * 0.4, 0, 1); },
            (p, x) => { p.decay *= Math.pow(2, x); p.damp *= Math.pow(2, x * 2); },
            (p, x) => { p.trem = clamp(p.trem + x * 0.7, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate, midi = info.midi, vel = velOf(info);
            const model = p.model | 0;
            const v = { model, t: 0, ph: 0, a1: 1, a2: 1, ab: 1, hn: 1, lp: 0, nlp: 0, dcx: 0, dcy: 0, rg: 1, rel: false, vel };
            v.T = p.decay * clamp(5 * Math.pow(2, -(midi - 40) / 17), 0.5, 8) * (model == 2 ? 0.6 : 1);
            v.ampVel = (1 - p.vel) + p.vel * Math.pow(vel, 1.4);
            if (model == 3) {
                const L = sr / Math.max(20, info.freq);
                const size = Math.min(8192, Math.ceil(L) + 4);
                v.buf = new Float32Array(size);
                // the pluck: noise, darker when soft
                let lp = 0;
                const k = onePoleCoef(1500 + 9000 * vel * (p.tone / 12000), sr);
                for (let i = 0; i < size; i++) { lp += (noise() - lp) * k; v.buf[i] = lp * (0.4 + vel); }
                v.w = 0;
                v.kslp = 0;
            }
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            if (!info.gate && !v.rel) v.rel = true;
            const gain = p.vol * v.ampVel * (p._gain == undefined ? 1 : p._gain);
            const relK = v.rel ? Math.exp(-1 / (Math.max(0.01, p.damp) * sr)) : 1;
            const toneK = onePoleCoef(p.tone * (0.6 + v.vel * 0.6), sr);
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            if (v.model == 3) {
                // plucked string: a delay line with a damping filter, read through a pickup
                const buf = v.buf, size = buf.length;
                const loopGain = (v.rel ? 0.93 : 0.9992 - p.mute * 0.012) * Math.pow(0.999, Math.max(0, (info.midi - 60) / 12));
                const bright = 0.15 + 0.35 * (1 - p.mute);
                for (let i = start, end = start + len; i < end;) {
                    const m = Math.min(BLOCK, end - i);
                    const L = clamp(sr / Math.max(20, freq), 2, size - 3);
                    const pick = Math.max(1, L * p.pick);
                    for (let j = 0; j < m; j++) {
                        const r = v.w - L;
                        const i0 = Math.floor(r), fr = r - i0;
                        const a = buf[(i0 % size + size) % size], b = buf[((i0 + 1) % size + size) % size];
                        const x = a + (b - a) * fr;
                        v.kslp = v.kslp + (x - v.kslp) * (1 - bright);
                        const y = (x * bright + v.kslp * (1 - bright)) * loopGain;
                        buf[v.w] = y;
                        const pr = v.w - pick, p0 = Math.floor(pr), pf = pr - p0;
                        const pa = buf[(p0 % size + size) % size], pb = buf[((p0 + 1) % size + size) % size];
                        let s = y - (pa + (pb - pa) * pf);
                        s = s + p.bark * s * Math.abs(s) * 0.8;
                        v.lp += (s - v.lp) * toneK;
                        v.w = (v.w + 1) % size;
                        out[i + j] += v.lp * gain * 0.6;
                    }
                    i += m;
                    freq *= fstep;
                }
                v.t += len / sr;
                if ((v.rel && v.t > 0.05 && Math.abs(v.lp) < 1e-5) || v.t > 20) v.done = true;
                return;
            }
            const T = v.T;
            const k1 = Math.exp(-1 / (T * sr)), k2 = Math.exp(-1 / (T * 0.45 * sr));
            const kb = Math.exp(-1 / (clamp(0.16 * Math.pow(2, -(info.midi - 60) / 24), 0.03, 0.4) * sr));
            const kh = Math.exp(-1 / (0.006 * sr));
            const bark = p.bark * (0.25 + v.vel * 1.4);
            const bell = p.bell * (0.3 + v.vel * 0.9) * (v.model == 2 ? 0.25 : 1);
            const reed = v.model == 2, drive = 1 + p.bark * v.vel * 5;
            const nK = onePoleCoef(1200, sr);
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                const dt = freq / sr;
                for (let j = 0; j < m; j++) {
                    const ph = v.ph;
                    let x = Math.sin(TWO_PI * ph) * v.a1 + 0.18 * Math.sin(TWO_PI * 2 * ph) * v.a2;
                    if (bell > 0.001) x += bell * v.ab * (0.5 * Math.sin(TWO_PI * 6.267 * ph) + 0.18 * Math.sin(TWO_PI * 17.55 * ph));
                    v.nlp += (noise() - v.nlp) * nK;
                    x += v.nlp * v.hn * 0.3 * v.vel;
                    let y;
                    if (reed) y = ftanh(x * drive) / ftanh(drive) + 0.2 * p.bark * x * x;
                    else y = x + bark * x * x;
                    // DC blocker (the pickup's asymmetry adds an offset)
                    const dc = y - v.dcx + 0.995 * v.dcy;
                    v.dcx = y; v.dcy = dc;
                    v.lp += (dc - v.lp) * toneK;
                    out[i + j] += v.lp * gain * v.rg * 0.36;
                    v.ph = ph + dt;
                    if (v.ph >= 1) v.ph -= 1;
                    v.a1 *= k1; v.a2 *= k2; v.ab *= kb; v.hn *= kh; v.rg *= relK;
                }
                i += m;
                freq *= fstep;
            }
            v.t += len / sr;
            if (v.a1 * v.rg < 2e-4) v.done = true;
        },
        fx: {
            create: () => ({ ph: 0 }),
            process: (st, p, L, R, start, end, ctx) => {
                if (p.trem <= 0.001) return;
                const inc = p.tremr / ctx.sampleRate, stereo = (p.model | 0) == 1, d = p.trem;
                for (let i = start; i < end; i++) {
                    const s = Math.sin(TWO_PI * st.ph);
                    st.ph += inc; if (st.ph >= 1) st.ph -= 1;
                    if (stereo) { L[i] *= 1 - d * 0.5 * (1 + s); R[i] *= 1 - d * 0.5 * (1 - s); }
                    else { const g = 1 - d * 0.35 * (1 + s); L[i] *= g; R[i] *= g; }
                }
            },
        },
    });

    // ------------------------------------------------------------ Piano
    const PIANO_MODELS = [
        { B: 0.00035, decay: 1, bright: 0, noise: 1, det: 1 },
        { B: 0.0009, decay: 0.65, bright: 0.05, noise: 1.2, det: 1.7 },
        { B: 0.0004, decay: 0.85, bright: 0.3, noise: 1, det: 1.2 },
        { B: 0.0004, decay: 0.75, bright: -0.45, noise: 1.8, det: 0.8 },
    ];
    engine({
        id: "piano", name: "Piano", style: "acoustic grand and upright", color: "#d9d9d9", icon: "Pn",
        about: "A modelled piano: stretched (inharmonic) partials shaped by where and how hard the hammer strikes, two-stage decay, beating unison strings, hammer noise and dampers.",
        sections: [
            ["Piano", [
                O("model", "Model", ["Concert grand", "Upright", "Bright pop", "Felt"], 0), K("hard", "Hammer", 0, 1, 0.5, PC), K("tone", "Tone", 800, 16000, 9000, HZ()),
                K("decay", "Decay", 0.3, 2, 1, { u: "x" }), K("det", "Unison detune", 0, 1, 0.35, PC), K("noise", "Hammer noise", 0, 1, 0.3, PC),
                O("pedal", "Sustain pedal", ["Up", "Down"], 0), K("vel", "Velocity", 0, 1, 0.8, PC), K("vol", "Volume", 0, 1, 0.8, PC),
            ]],
        ],
        macros: [
            (p, x) => { p.tone *= Math.pow(2, x * 1.5); },
            (p, x) => { p.hard = clamp(p.hard + x * 0.5, 0, 1); },
            (p, x) => { p.decay = clamp(p.decay * Math.pow(2, x), 0.1, 4); },
            (p, x) => { p.det = clamp(p.det + x * 0.6, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate, midi = info.midi, f0 = Math.max(20, info.freq), vel = velOf(info);
            const md = PIANO_MODELS[p.model | 0] || PIANO_MODELS[0];
            const B = md.B * Math.pow(2, (midi - 60) / 12 * 0.9);
            const hard = clamp(p.hard * 0.6 + vel * 0.5 + md.bright, 0, 1.25);
            const toneHz = p.tone * (0.45 + vel * 0.75);
            const TB = p.decay * md.decay * clamp(14 * Math.pow(2, -(midi - 21) / 16), 0.6, 16);
            const re = [], im = [], cw = [], sw = [], a1 = [], a2 = [], k1 = [], k2 = [];
            const top = Math.min(sr * 0.45, 14000);
            for (let n = 1; n <= 24; n++) {
                const fn = n * f0 * Math.sqrt(1 + B * n * n);
                if (fn > top) break;
                let amp = Math.pow(n, -(1.9 - 1.2 * hard)) * (0.12 + Math.abs(Math.sin(Math.PI * n / 8)));
                amp /= 1 + Math.pow(fn / toneHz, 2);
                const Ta = TB / (1 + n * 0.18), Tp = Ta * 0.22;
                const strings = n <= 10 && midi > 30 ? 2 : 1;
                for (let s = 0; s < strings; s++) {
                    const cents = strings == 1 ? 0 : (s ? 1 : -1) * p.det * md.det * (0.6 + 0.4 * Math.random()) * (1 + n * 0.08);
                    const w = TWO_PI * fn * Math.pow(2, cents / 1200) / sr;
                    const phase = Math.random() * TWO_PI * 0.05;
                    re.push(Math.cos(phase)); im.push(Math.sin(phase)); cw.push(Math.cos(w)); sw.push(Math.sin(w));
                    const a = amp / strings;
                    a1.push(a * 0.7); a2.push(a * 0.3);
                    k1.push(Math.exp(-BLOCK / (Tp * sr))); k2.push(Math.exp(-BLOCK / (Ta * sr)));
                }
            }
            // brighter, not louder: the partials share a fixed loudness
            let energy = 0;
            for (let k = 0; k < a1.length; k++) energy += Math.pow(a1[k] + a2[k], 2);
            const norm = 0.42 / Math.sqrt(energy || 1);
            for (let k = 0; k < a1.length; k++) { a1[k] *= norm; a2[k] *= norm; }
            const F = (arr) => Float64Array.from(arr);
            const v = { re: F(re), im: F(im), cw: F(cw), sw: F(sw), a1: F(a1), a2: F(a2), k1: F(k1), k2: F(k2), count: re.length, t: 0, rel: false, damp: 1, vel };
            v.velGain = ((1 - p.vel) + p.vel * Math.pow(vel, 1.3)) * 0.5;
            v.hammer = new CarrotSVF();
            v.hammer.set(clamp(f0 * 3, 400, 4000), 0.3, sr);
            v.hn = p.noise * md.noise * vel * 0.35;
            v.hk = Math.exp(-1 / (0.004 * sr * (md.noise > 1.5 ? 2 : 1)));
            v.dampK = Math.exp(-BLOCK / ((0.08 + 0.25 * clamp(1 - (midi - 21) / 67, 0, 1)) * sr));
            v.noDamper = midi >= 89;
            return v;
        },
        render(v, p, out, start, len, info) {
            if (!info.gate && !v.rel) v.rel = true;
            const damping = v.rel && (p.pedal | 0) == 0 && !v.noDamper;
            const gain = p.vol * v.velGain * (p._gain == undefined ? 1 : p._gain);
            const { re, im, cw, sw, a1, a2, k1, k2 } = v;
            const count = v.count;
            let total = 0;
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                if (damping) v.damp *= v.dampK;
                const g = gain * v.damp;
                for (let j = 0; j < m; j++) {
                    let s = 0;
                    for (let k = 0; k < count; k++) {
                        const r = re[k] * cw[k] - im[k] * sw[k];
                        const q = re[k] * sw[k] + im[k] * cw[k];
                        re[k] = r; im[k] = q;
                        s += q * (a1[k] + a2[k]);
                    }
                    if (v.hn > 1e-5) { s += v.hammer.process(noise(), 2) * v.hn; v.hn *= v.hk; }
                    out[i + j] += s * g;
                }
                total = 0;
                for (let k = 0; k < count; k++) {
                    a1[k] *= k1[k]; a2[k] *= k2[k];
                    // keep the phasors on the unit circle
                    const n = 1.5 - 0.5 * (re[k] * re[k] + im[k] * im[k]);
                    re[k] *= n; im[k] *= n;
                    total += a1[k] + a2[k];
                }
                i += m;
            }
            v.t += len / info.sampleRate;
            if (total * v.damp < 1e-4) v.done = true;
        },
    });

    // ------------------------------------------------------------ shared effects
    // Stereo chorus: two modulated delays (or three taps 120 degrees apart for an ensemble).
    class Chorus {
        constructor(sr) {
            this.sr = sr;
            this.dl = new CarrotDelayLine(Math.ceil(sr * 0.05));
            this.dr = new CarrotDelayLine(Math.ceil(sr * 0.05));
            this.ph = Math.random();
            this.ph2 = Math.random();
        }
        process(L, R, start, end, o) {
            const ms = this.sr / 1000, inc = o.rate / this.sr, inc2 = 6.1 / this.sr, mix = o.mix;
            for (let i = start; i < end; i++) {
                this.dl.write(L[i]);
                this.dr.write(R[i]);
                this.ph += inc; if (this.ph >= 1) this.ph -= 1;
                let wl, wr;
                if (o.three) {
                    this.ph2 += inc2; if (this.ph2 >= 1) this.ph2 -= 1;
                    wl = 0; wr = 0;
                    for (let k = 0; k < 3; k++) {
                        const a = Math.sin(TWO_PI * (this.ph + k / 3)) * o.depth + Math.sin(TWO_PI * (this.ph2 + k / 3)) * 0.22;
                        const b = Math.sin(TWO_PI * (this.ph + k / 3 + 0.5)) * o.depth + Math.sin(TWO_PI * (this.ph2 + k / 3 + 0.5)) * 0.22;
                        wl += this.dl.read((o.base + a) * ms);
                        wr += this.dr.read((o.base + b) * ms);
                    }
                    wl /= 3; wr /= 3;
                }
                else {
                    const m = Math.sin(TWO_PI * this.ph) * o.depth;
                    wl = this.dl.read((o.base + m) * ms);
                    wr = this.dr.read((o.base - m) * ms);
                }
                L[i] = L[i] * (1 - mix) + wl * mix;
                R[i] = R[i] * (1 - mix) + wr * mix;
            }
        }
    }
    // Organ cabinet: vibrato/chorus scanner, tube drive and a rotary speaker (horn and drum spin up and down).
    class Rotary {
        constructor(sr) {
            this.sr = sr;
            this.scan = new CarrotDelayLine(Math.ceil(sr * 0.01));
            this.horn = new CarrotDelayLine(Math.ceil(sr * 0.02));
            this.vph = 0; this.ha = 0; this.da = 0; this.hs = 0.8; this.ds = 0.7;
            this.lp1 = 0; this.lp2 = 0;
        }
        process(p, L, R, start, end) {
            const sr = this.sr, ms = sr / 1000;
            const vc = p.vc | 0, scanDepth = [0, 0.25, 0.5, 0.9, 0.25, 0.5, 0.9][vc] * ms, chorus = vc >= 4;
            const drive = p.drive, dg = 1 + drive * 5, dn = 1 / (1 + drive * 1.5);
            const mode = p.leslie | 0;
            const hornTarget = mode == 2 ? 6.7 : 0.83, drumTarget = mode == 2 ? 5.8 : 0.67;
            const hk = 1 - Math.exp(-1 / (0.7 * sr)), dk = 1 - Math.exp(-1 / (3.5 * sr));
            const xk = onePoleCoef(800, sr);
            for (let i = start; i < end; i++) {
                let x = 0.5 * (L[i] + R[i]);
                if (vc) {
                    this.scan.write(x);
                    this.vph += 6.9 / sr; if (this.vph >= 1) this.vph -= 1;
                    const wet = this.scan.read(1 + scanDepth * (1 + Math.sin(TWO_PI * this.vph)));
                    x = chorus ? 0.5 * (x + wet) : wet;
                }
                if (drive > 0.001) x = ftanh(x * dg) * dn;
                if (mode == 0) { L[i] = x; R[i] = x; continue; }
                this.hs += (hornTarget - this.hs) * hk;
                this.ds += (drumTarget - this.ds) * dk;
                this.ha += this.hs / sr; if (this.ha >= 1) this.ha -= 1;
                this.da += this.ds / sr; if (this.da >= 1) this.da -= 1;
                this.lp1 += (x - this.lp1) * xk;
                this.lp2 += (this.lp1 - this.lp2) * xk;
                const low = this.lp2, high = x - low;
                this.horn.write(high);
                const hs = Math.sin(TWO_PI * this.ha), hc = Math.cos(TWO_PI * this.ha);
                const hornL = this.horn.read(2 * ms + 0.35 * ms * hs) * (1 + 0.32 * hs);
                const hornR = this.horn.read(2 * ms - 0.35 * ms * hc) * (1 - 0.32 * hc);
                const ds = Math.sin(TWO_PI * this.da);
                L[i] = hornL + low * (1 + 0.22 * ds);
                R[i] = hornR + low * (1 - 0.22 * ds);
            }
        }
    }

    // ------------------------------------------------------------ Tonewheel Organ
    const FOOTAGE = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
    const BAR_NAMES = ["16'", "5 1/3'", "8'", "4'", "2 2/3'", "2'", "1 3/5'", "1 1/3'", "1'"];
    const DRAWBAR = { st: 1, fmt: (v) => String(Math.round(v)) };
    engine({
        id: "organ", name: "Tonewheel Organ", style: "B-3, combo and pipe organ", color: "#b5651d", icon: "Or",
        about: "Nine drawbars of tonewheel sine (with the top octave folding back), percussion, key click, the vibrato/chorus scanner, tube drive and a rotary speaker. Combo and pipe models too.",
        sections: [
            ["Drawbars", BAR_NAMES.map((name, i) => K("d" + (i + 1), name, 0, 8, [8, 8, 8, 0, 0, 0, 0, 0, 0][i], DRAWBAR))],
            ["Voice", [
                O("model", "Model", ["Tonewheel", "Combo (transistor)", "Church pipes"], 0), O("perc", "Percussion", ["Off", "2nd", "3rd"], 0), O("pfast", "Perc decay", ["Slow", "Fast"], 1),
                O("psoft", "Perc volume", ["Normal", "Soft"], 0), K("click", "Key click", 0, 1, 0.4, PC),
            ]],
            ["Cabinet", [O("vc", "Vibrato / chorus", ["Off", "V1", "V2", "V3", "C1", "C2", "C3"], 6), O("leslie", "Rotary", ["Off", "Slow", "Fast"], 1), K("drive", "Drive", 0, 1, 0.2, PC), K("vol", "Volume", 0, 1, 0.6, PC)]],
        ],
        macros: [
            (p, x) => { for (let i = 5; i <= 9; i++) p["d" + i] = clamp(Math.round(p["d" + i] + x * 5), 0, 8); },
            (p, x) => { p.drive = clamp(p.drive + x * 0.6, 0, 1); },
            (p, x) => { p.click = clamp(p.click + x * 0.6, 0, 1); },
            (p, x) => { if (x > 0.33) p.leslie = 2; else if (x < -0.33) p.leslie = 0; },
        ],
        voice(p, info) {
            const v = { ph: new Float64Array(9), pp: 0, pa: 1, ck: 1, a: 0, rel: false, t: 0, bp: new CarrotSVF(), chiff: new CarrotSVF() };
            for (let i = 0; i < 9; i++) v.ph[i] = Math.random();
            v.bp.set(2600, 0.2, info.sampleRate);
            v.chiff.set(clamp(info.freq * 4, 500, 6000), 0.6, info.sampleRate);
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            if (!info.gate && !v.rel) v.rel = true;
            const model = p.model | 0, pipes = model == 2, combo = model == 1;
            const att = 1 / ((pipes ? 0.07 : 0.003) * sr), rel = 1 / ((pipes ? 0.25 : 0.008) * sr);
            const percOn = (p.perc | 0) > 0;
            const gains = new Float64Array(9);
            for (let i = 0; i < 9; i++) {
                const d = Math.round(p["d" + (i + 1)]);
                gains[i] = d <= 0 || (percOn && i == 8) ? 0 : Math.pow(10, -(8 - d) * 3 / 20);
            }
            const percRatio = (p.perc | 0) == 1 ? 2 : 3;
            const percK = Math.exp(-1 / (((p.pfast | 0) == 1 ? 0.2 : 1.0) * sr));
            const percLevel = (p.psoft | 0) == 1 ? 0.3 : 0.6;
            const clickK = Math.exp(-1 / (0.0025 * sr));
            const gain = p.vol * (p._gain == undefined ? 1 : p._gain) * 0.13;
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const inc = new Float64Array(9);
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                for (let b = 0; b < 9; b++) {
                    let hz = freq * FOOTAGE[b];
                    if (!pipes) while (hz > 5900) hz *= 0.5;
                    inc[b] = Math.min(0.45, hz / sr);
                }
                const pinc = Math.min(0.45, freq * percRatio / sr);
                for (let j = 0; j < m; j++) {
                    if (v.rel) v.a = Math.max(0, v.a - rel); else v.a = Math.min(1, v.a + att);
                    let x = 0;
                    for (let b = 0; b < 9; b++) {
                        const g = gains[b];
                        const ph = v.ph[b];
                        if (g > 0) {
                            if (combo) x += g * 0.45 * pulse(ph, inc[b], 0.5);
                            else if (pipes) x += g * (fastSin(ph) + 0.25 * fastSin((ph * 2) % 1) + 0.08 * fastSin((ph * 3) % 1));
                            else x += g * fastSin(ph);
                        }
                        v.ph[b] = ph + inc[b] >= 1 ? ph + inc[b] - 1 : ph + inc[b];
                    }
                    if (percOn && v.pa > 1e-4) {
                        x += fastSin(v.pp) * v.pa * percLevel * 2;
                        v.pp += pinc; if (v.pp >= 1) v.pp -= 1;
                        v.pa *= percK;
                    }
                    if (v.ck > 1e-4 && p.click > 0) { x += v.bp.process(noise(), 2) * v.ck * p.click * 2.5; v.ck *= clickK; }
                    if (pipes && v.t < 0.15) x += v.chiff.process(noise(), 2) * 0.4 * (1 - v.t / 0.15);
                    out[i + j] += x * v.a * gain;
                }
                v.t += m / sr;
                i += m;
                freq *= fstep;
            }
            if (v.rel && v.a <= 0) v.done = true;
        },
        fx: { create: (sr) => new Rotary(sr), process: (st, p, L, R, start, end) => st.process(p, L, R, start, end) },
    });

    // ------------------------------------------------------------ String Machine
    engine({
        id: "strings", name: "String Machine", style: "Solina-style ensemble strings", color: "#5dade2", icon: "St",
        about: "Divide-down violins, violas, cellos and contrabass with horn and trumpet voices, a crescendo and sustain, and the famous three-phase ensemble chorus.",
        sections: [
            ["Voices", [K("vln", "Violin", 0, 1, 0.8, PC), K("vla", "Viola", 0, 1, 0.5, PC), K("cel", "Cello", 0, 1, 0.4, PC), K("cb", "Contrabass", 0, 1, 0, PC), K("horn", "Horn", 0, 1, 0, PC), K("tpt", "Trumpet", 0, 1, 0, PC)]],
            ["Shape", [K("cresc", "Crescendo", 0.005, 4, 0.25, SEC()), K("sus", "Sustain", 0.05, 6, 1.2, SEC()), K("tone", "Tone", 500, 12000, 4500, HZ())]],
            ["Ensemble", [K("ens", "Ensemble", 0, 1, 0.8, PC), K("vol", "Volume", 0, 1, 0.7, PC)]],
        ],
        macros: [
            (p, x) => { p.tone *= Math.pow(2, x * 1.5); },
            (p, x) => { p.vln = clamp(p.vln + x * 0.6, 0, 1); p.cel = clamp(p.cel - x * 0.6, 0, 1); },
            (p, x) => scaleTime(p, ["cresc", "sus"], x),
            (p, x) => { p.ens = clamp(p.ens + x * 0.6, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate;
            return { ph: [Math.random(), Math.random(), Math.random()], amp: env(p.cresc, 0.3, 1, p.sus, sr), be: env(0.12, 0.6, 0.7, p.sus, sr), bf: new CarrotSVF(), lp1: 0, lp2: 0, rel: false };
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate;
            releaseVoice(v, info, [v.amp, v.be]);
            v.amp.set(p.cresc, 0.3, 1, p.sus, sr);
            const toneK = onePoleCoef(p.tone, sr), vel = velOf(info);
            const gain = p.vol * (p._gain == undefined ? 1 : p._gain) * 0.55;
            const brass = p.horn + p.tpt > 0.001;
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const ph = v.ph;
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                const d = Math.min(0.2, freq / sr);
                if (brass) v.bf.set(400 + 3600 * v.be.level * (0.5 + vel * 0.6), 0.25, sr);
                for (let j = 0; j < m; j++) {
                    const t0 = ph[0], t1 = ph[1], t2 = ph[2];
                    let x = 0;
                    if (p.vln > 0.001) x += saw(t0, d) * p.vln;
                    if (p.vla > 0.001) x += (0.6 * pulse(t0, d, 0.5) + 0.4 * pulse(t1, d * 2, 0.5)) * p.vla;
                    if (p.cel > 0.001) x += (0.7 * saw(t2, d * 0.5) + 0.3 * saw(t0, d)) * p.cel;
                    if (p.cb > 0.001) x += tri(t2) * p.cb * 1.2;
                    if (brass) {
                        const b = (p.horn * pulse(t0, d, 0.35) + p.tpt * saw(t1, d * 2) * 0.7) * v.be.next();
                        x += v.bf.process(b, 0) * 0.75;
                    }
                    ph[0] += d; if (ph[0] >= 1) ph[0] -= 1;
                    ph[1] += d * 2; if (ph[1] >= 1) ph[1] -= 1;
                    ph[2] += d * 0.5; if (ph[2] >= 1) ph[2] -= 1;
                    v.lp1 += (x - v.lp1) * toneK;
                    v.lp2 += (v.lp1 - v.lp2) * toneK;
                    out[i + j] += v.lp2 * v.amp.next() * gain;
                }
                i += m;
                freq *= fstep;
            }
            if (v.rel && v.amp.done) v.done = true;
        },
        fx: {
            create: (sr) => new Chorus(sr),
            process: (st, p, L, R, start, end) => { if (p.ens > 0.001) st.process(L, R, start, end, { rate: 0.6, depth: 1.4, base: 4.5, mix: 0.25 + 0.5 * p.ens, three: true }); },
        },
    });

    // ------------------------------------------------------------ Tape Replay
    engine({
        id: "tape", name: "Tape Replay", style: "Mellotron-style", color: "#8d6e63", icon: "Tp",
        about: "A keyboard that plays a strip of tape per key: violins, flutes, choir, cello, brass and vibes with wow, flutter, hiss and the eight-second tape limit.",
        sections: [
            ["Tape", [
                O("snd", "Sound", ["Strings", "Flute", "Choir", "Cello", "Brass", "Vibes"], 0), K("att", "Attack", 0.005, 1, 0.06, SEC()), K("rel", "Release", 0.05, 3, 0.4, SEC()),
                K("tone", "Tone", 800, 12000, 5500, HZ()), O("tape", "Tape length", ["8 seconds", "Endless"], 0),
            ]],
            ["Machine", [K("wow", "Wow", 0, 1, 0.35, PC), K("flut", "Flutter", 0, 1, 0.3, PC), K("hiss", "Hiss", 0, 1, 0.15, PC), K("vol", "Volume", 0, 1, 0.7, PC)]],
        ],
        macros: [
            (p, x) => { p.tone *= Math.pow(2, x * 1.5); },
            (p, x) => { p.hiss = clamp(p.hiss + x * 0.4, 0, 1); p.flut = clamp(p.flut + x * 0.4, 0, 1); },
            (p, x) => scaleTime(p, ["att", "rel"], x),
            (p, x) => { p.wow = clamp(p.wow + x * 0.6, 0, 1); },
        ],
        voice(p, info) {
            const sr = info.sampleRate, snd = p.snd | 0;
            const v = { snd, ph: [Math.random(), Math.random(), Math.random(), Math.random()], t: 0, amp: env(p.att, 0.3, 1, p.rel, sr), f: [new CarrotSVF(), new CarrotSVF(), new CarrotSVF()], lp: 0, wow: Math.random(), fl: Math.random(), vib: 0, a1: 1, a2: 1, rel: false, vel: velOf(info) };
            const set = (i, hz, q) => v.f[i].set(hz, q, sr);
            if (snd == 0) { set(0, 500, 0.5); set(1, 2400, 0.4); }
            else if (snd == 1) set(0, clamp(info.freq * 2, 300, 8000), 0.7);
            else if (snd == 2) { set(0, 730, 0.75); set(1, 1090, 0.75); set(2, 2440, 0.7); }
            else if (snd == 3) { set(0, 1800, 0.1); set(1, 280, 0.5); }
            return v;
        },
        render(v, p, out, start, len, info) {
            const sr = info.sampleRate, snd = v.snd;
            releaseVoice(v, info, [v.amp]);
            v.amp.set(p.att, 0.3, 1, p.rel, sr);
            const toneK = onePoleCoef(p.tone, sr);
            const gain = p.vol * (0.5 + 0.5 * v.vel) * (p._gain == undefined ? 1 : p._gain) * 0.42;
            let freq = info.freq;
            const fstep = Math.pow(info.freqScale || 1, BLOCK);
            const ph = v.ph;
            const k1 = Math.exp(-1 / (2.5 * sr)), k2 = Math.exp(-1 / (0.4 * sr));
            for (let i = start, end = start + len; i < end;) {
                const m = Math.min(BLOCK, end - i);
                v.wow += 0.55 * m / sr; v.fl += 11.3 * m / sr;
                v.wow -= Math.floor(v.wow); v.fl -= Math.floor(v.fl);
                let speed = 1 + p.wow * 0.0035 * Math.sin(TWO_PI * v.wow) + p.flut * 0.0012 * Math.sin(TWO_PI * v.fl);
                if (snd == 1 && v.t > 0.3) { v.vib += 5 * m / sr; speed *= Math.pow(2, Math.sin(TWO_PI * v.vib) * 0.15 / 12); }
                if (snd == 4) v.f[0].set(400 + 3100 * Math.min(1, v.t / 0.15) * (0.6 + 0.5 * v.vel), 0.2, sr);
                const d = Math.min(0.45, freq * speed / sr);
                // eight seconds of tape, then it runs out
                let tapeGain = 1;
                if ((p.tape | 0) == 0 && v.t > 8) tapeGain = Math.max(0, 1 - (v.t - 8) / 0.25);
                for (let j = 0; j < m; j++) {
                    let x = 0;
                    if (snd == 0) {
                        const s = (saw(ph[0], d * 0.996) + saw(ph[1], d) + saw(ph[2], d * 1.0035)) / 3;
                        x = 0.45 * s + 0.9 * v.f[0].process(s, 2) + 0.5 * v.f[1].process(s, 2);
                    }
                    else if (snd == 1) {
                        x = Math.sin(TWO_PI * ph[0]) + 0.12 * Math.sin(TWO_PI * 2 * ph[0]) + 0.05 * Math.sin(TWO_PI * 3 * ph[0]);
                        x += v.f[0].process(noise(), 2) * 0.12;
                    }
                    else if (snd == 2) {
                        const s = (saw(ph[0], d * 0.993) + saw(ph[1], d) + saw(ph[2], d * 1.006) + saw(ph[3], d * 1.002)) / 4;
                        x = v.f[0].process(s, 2) + 0.6 * v.f[1].process(s, 2) + 0.35 * v.f[2].process(s, 2);
                        x *= 1.6;
                    }
                    else if (snd == 3) {
                        const s = saw(ph[0], d) + 0.5 * pulse(ph[1], d, 0.3);
                        x = 0.36 * v.f[0].process(s, 0) + 0.5 * v.f[1].process(s, 2);
                    }
                    else if (snd == 4) x = v.f[0].process(saw(ph[0], d) + 0.3 * saw(ph[1], d * 1.004), 0);
                    else {
                        x = Math.sin(TWO_PI * ph[0]) * v.a1 + 0.25 * Math.sin(TWO_PI * 4 * ph[0]) * v.a2;
                        x *= 1 - 0.3 * (0.5 + 0.5 * Math.sin(TWO_PI * v.t * 5));
                        v.a1 *= k1; v.a2 *= k2;
                    }
                    ph[0] += d; if (ph[0] >= 1) ph[0] -= 1;
                    ph[1] += d; if (ph[1] >= 1) ph[1] -= 1;
                    ph[2] += d; if (ph[2] >= 1) ph[2] -= 1;
                    ph[3] += d; if (ph[3] >= 1) ph[3] -= 1;
                    if (p.hiss > 0) x += noise() * p.hiss * 0.03;
                    v.lp += (x - v.lp) * toneK;
                    out[i + j] += v.lp * v.amp.next() * gain * tapeGain;
                }
                v.t += m / sr;
                i += m;
                freq *= fstep;
            }
            if ((v.rel && v.amp.done) || ((p.tape | 0) == 0 && v.t > 8.25) || (snd == 5 && v.a1 < 1e-4)) v.done = true;
        },
    });

    // =================================================================== params
    const MACRO_NAMES = ["Brightness", "Timbre", "Time", "Movement"];
    const TYPES = ["Bass", "Lead", "Pad", "Keys", "Piano", "Organ", "Strings", "Brass", "Pluck", "Bells", "Choir", "Winds", "Sequence", "FX", "Multi"];
    const STYLES = ["Bright", "Dark", "Warm", "Soft", "Aggressive", "Punchy", "Clean", "Ambient", "Cinematic", "Evolving", "Huge", "Funky", "Vintage", "Classic", "Lo-fi"];
    const toNorm = (s, v) => s.c == "exp" ? Math.log(Math.max(v, s.min) / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min);
    function fromNorm(s, n) {
        n = clamp(n, 0, 1);
        let v = s.c == "exp" ? s.min * Math.pow(s.max / s.min, n) : s.min + (s.max - s.min) * n;
        if (s.st) v = Math.round(v / s.st) * s.st;
        return +v.toFixed(5);
    }
    function makePart(e, name, over) {
        const eng = ENGINES[e];
        return { e, n: name || eng.name, p: Object.assign(eng.defaults(), over || {}), m: [0.5, 0.5, 0.5, 0.5], vol: 1, oct: 0 };
    }
    const filledParts = new WeakSet();
    function fillPart(part) {
        if (filledParts.has(part)) return part;
        if (!ENGINES[part.e]) part.e = "poly";
        const eng = ENGINES[part.e];
        if (!part.p || typeof part.p != "object") part.p = {};
        for (const s of eng.specs) if (typeof part.p[s.k] != "number" || !isFinite(part.p[s.k])) part.p[s.k] = s.def;
        if (!Array.isArray(part.m)) part.m = [0.5, 0.5, 0.5, 0.5];
        for (let i = 0; i < 4; i++) if (typeof part.m[i] != "number" || !isFinite(part.m[i])) part.m[i] = 0.5;
        if (typeof part.vol != "number" || !isFinite(part.vol)) part.vol = 1;
        if (typeof part.oct != "number" || !isFinite(part.oct)) part.oct = 0;
        if (typeof part.n != "string") part.n = eng.name;
        filledParts.add(part);
        return part;
    }
    function fill(params) {
        const p = params && typeof params == "object" ? params : {};
        if (!p.a || typeof p.a != "object") p.a = makePart("ep", "Stage Tine Classic");
        fillPart(p.a);
        if (p.b && typeof p.b == "object") fillPart(p.b); else p.b = null;
        p.multi = p.multi ? 1 : 0;
        p.mode = p.mode ? 1 : 0;
        if (typeof p.split != "number" || !isFinite(p.split)) p.split = 60;
        if (!Array.isArray(p.fx)) p.fx = [];
        return p;
    }
    // The part's settings with its macros applied (the saved settings stay as they are).
    function effective(part) {
        const eng = ENGINES[part.e];
        const q = Object.assign({}, part.p);
        for (let i = 0; i < 4; i++) {
            const x = (part.m[i] - 0.5) * 2;
            if (Math.abs(x) > 0.001) eng.macros[i](q, x);
        }
        for (const s of eng.specs) if (!s.o) q[s.k] = clamp(q[s.k], s.min, s.max);
        q._gain = part.vol;
        return q;
    }

    // ================================================================== presets
    const fxd = (type, over) => Object.assign(CarrotFX.defaults(type), over || {});
    const REV = (mix = 0.25, size = 0.7) => fxd("reverb", { mix, size });
    const DLY = (time = 7, feedback = 0.35, mix = 0.2) => fxd("delay", { time, feedback, mix });
    const CHO = (mix = 0.35) => fxd("chorus", { mix, depth: 0.55 });
    function fmOps(ops, extra) {
        const o = Object.assign({}, extra || {});
        ops.forEach((d, i) => {
            const k = i + 1;
            [o["r" + k], o["dt" + k], o["l" + k], o["a" + k], o["d" + k], o["s" + k], o["rl" + k], o["v" + k]] = [d[0], d[1] || 0, d[2], d[3], d[4], d[5], d[6], d[7] == undefined ? 0.5 : d[7]];
        });
        return o;
    }
    function bars(s) {
        const o = {};
        for (let i = 0; i < 9; i++) o["d" + (i + 1)] = +s[i];
        return o;
    }
    const LIB = [];
    const P = (e, name, type, styles, over, fx) => LIB.push({ e, name, type, styles, over, fx: fx || [] });
    // Mono Ladder
    P("mini", "Classic Mono Bass", "Bass", ["Warm", "Classic", "Punchy"], { o1w: 2, o1r: 1, o2w: 2, o2r: 1, o2t: 0.06, o3w: 3, o3r: 0, o3l: 0.6, cut: 420, emp: 0.25, cont: 0.6, fa: 0.002, fd: 0.35, fs: 0.15, aa: 0.002, ad: 0.5, as: 0.8, ar: 0.08, drv: 0.35 });
    P("mini", "Funk Pluck Bass", "Bass", ["Funky", "Punchy"], { o1w: 3, o1r: 1, o2w: 2, o2r: 1, o2t: -0.07, o3l: 0, cut: 300, emp: 0.55, cont: 0.75, fd: 0.18, fs: 0, ad: 0.3, as: 0.5, ar: 0.06 });
    P("mini", "Deep Sub Pedal", "Bass", ["Dark", "Huge"], { o1w: 0, o1r: 0, o2w: 2, o2r: 0, o2t: 0.04, o2l: 0.5, o3l: 0, cut: 250, emp: 0.1, cont: 0.3, glide: 0.05, as: 0.95, ar: 0.2 });
    P("mini", "Acid Ladder", "Bass", ["Aggressive"], { o1w: 2, o1r: 1, o2l: 0, o3l: 0, cut: 260, emp: 0.82, cont: 0.85, fd: 0.2, fs: 0, drv: 0.6, glide: 0.06, ad: 0.4, as: 0.7, ar: 0.06 });
    P("mini", "Fat Mono Lead", "Lead", ["Classic", "Warm"], { o1r: 2, o2r: 2, o2t: 0.1, o3r: 1, o3t: -0.08, cut: 1800, emp: 0.3, cont: 0.45, fa: 0.01, fd: 0.8, fs: 0.5, glide: 0.08, vib: 0.25, aa: 0.005, ad: 1, as: 0.9, ar: 0.25 }, [DLY(7, 0.3, 0.18), REV(0.15)]);
    P("mini", "Square Solo", "Lead", ["Vintage"], { o1w: 3, o1r: 2, o2w: 4, o2r: 3, o2l: 0.4, o3l: 0, cut: 2600, emp: 0.2, glide: 0.05, vib: 0.3, as: 0.9, ar: 0.2 }, [REV(0.15)]);
    P("mini", "Screamer", "Lead", ["Aggressive", "Bright"], { o1r: 2, o2r: 2, o2t: 0.12, o3w: 2, o3r: 2, o3t: 7, cut: 3500, emp: 0.6, drv: 0.8, cont: 0.4, glide: 0.04, ar: 0.2 }, [DLY(7, 0.3, 0.15)]);
    P("mini", "Whistling Filter", "Lead", ["Soft", "Clean"], { o1w: 0, o1r: 3, o1l: 0.25, o2l: 0, o3l: 0, cut: 600, emp: 0.97, kt: 3, cont: 0.1, vib: 0.3, aa: 0.02, ar: 0.3 }, [REV(0.3)]);
    P("mini", "Mono Brass", "Brass", ["Vintage", "Punchy"], { o1r: 2, o2r: 2, o2t: 0.05, o3l: 0, cut: 700, emp: 0.15, cont: 0.6, fa: 0.08, fd: 0.6, fs: 0.6, aa: 0.03, ar: 0.2 }, [REV(0.2)]);
    P("mini", "Rubber Pluck", "Pluck", ["Clean"], { o1w: 1, o1r: 2, o2r: 3, o2l: 0.3, o3l: 0, cut: 900, emp: 0.4, cont: 0.8, fd: 0.25, fs: 0, ad: 0.4, as: 0, ar: 0.25 }, [DLY(9, 0.3, 0.2)]);
    P("mini", "Wind Noise Sweep", "FX", ["Cinematic", "Evolving"], { o1l: 0, o2l: 0, o3l: 0, nz: 1, cut: 300, emp: 0.85, kt: 0, fa: 2, fd: 4, fs: 0.4, cont: 1, aa: 1.5, ad: 3, as: 0.6, ar: 2 }, [REV(0.35, 0.85)]);
    P("mini", "Growl Bass", "Bass", ["Aggressive", "Dark"], { o1w: 1, o1r: 1, o2w: 5, o2r: 1, o2t: -0.12, o3l: 0, cut: 380, emp: 0.45, drv: 0.9, fmod: 0.35, vibr: 3 });
    P("mini", "Disco Octave Bass", "Bass", ["Funky"], { o1r: 1, o2r: 2, o2w: 3, o3l: 0, cut: 600, cont: 0.5, fd: 0.25, fs: 0.2, ad: 0.25, as: 0.6, ar: 0.05 });
    P("mini", "Soft Round Bass", "Bass", ["Soft", "Warm"], { o1w: 0, o1r: 1, o2w: 1, o2r: 1, o2l: 0.5, o3l: 0, cut: 500, emp: 0.2, cont: 0.3, aa: 0.01, ar: 0.15 });
    P("mini", "Portamento Lead", "Lead", ["Vintage", "Warm"], { o1r: 2, o2r: 2, o2t: -0.08, o3l: 0, cut: 2000, emp: 0.35, glide: 0.25, vib: 0.2, ar: 0.3 }, [DLY(7, 0.35, 0.2)]);
    P("mini", "Pulse Sequence", "Sequence", ["Punchy"], { o1w: 4, o1r: 2, o2l: 0, o3l: 0, cut: 1200, emp: 0.5, cont: 0.6, fd: 0.12, fs: 0, ad: 0.18, as: 0, ar: 0.1 }, [DLY(7, 0.4, 0.25)]);
    // Poly Analog
    P("poly", "Jup Brass", "Brass", ["Classic", "Bright", "Punchy"], { model: 0, bdet: 8, bl: 0.8, cut: 900, res: 0.15, fenv: 0.55, fa: 0.06, fd: 0.45, fs: 0.55, fr: 0.3, aa: 0.03, ad: 0.5, as: 0.85, ar: 0.35, uni: 1, udet: 0.2 }, [REV(0.2)]);
    P("poly", "Sync Lead", "Lead", ["Aggressive", "Vintage"], { model: 1, sync: 1, boct: 3, bl: 0.9, al: 0.2, pme: 0.5, cut: 3200, res: 0.25, fenv: 0.25, fd: 0.6, fs: 0.2, glide: 0.03 }, [DLY(7, 0.3, 0.15)]);
    P("poly", "Warm Poly Pad", "Pad", ["Warm", "Soft", "Ambient"], { model: 0, bdet: 9, cut: 1300, res: 0.1, fenv: 0.2, fa: 1.2, fd: 2, fs: 0.6, fr: 1.8, aa: 0.9, ad: 2, as: 0.9, ar: 1.8, lf: 0.15, lr: 0.25, chorus: 1 }, [REV(0.35, 0.8)]);
    P("poly", "OB Strings", "Strings", ["Huge", "Vintage"], { model: 2, cut: 2200, res: 0.1, fenv: 0.1, aa: 0.5, ad: 1, as: 0.95, ar: 1.2, uni: 1, udet: 0.3, chorus: 2 }, [REV(0.25)]);
    P("poly", "Synth Stab 84", "Brass", ["Punchy", "Bright"], { model: 2, uni: 1, udet: 0.25, cut: 1600, fenv: 0.35, fa: 0.01, fd: 0.3, fs: 0.5, aa: 0.005, ad: 0.4, as: 0.8, ar: 0.25 }, [REV(0.15)]);
    P("poly", "Poly-Mod Bell", "Bells", ["Bright", "Clean"], { model: 1, aw: 2, bw: 0, boct: 4, bl: 0, pm: 0.6, cut: 6000, res: 0, fenv: 0, aa: 0.001, ad: 2.5, as: 0, ar: 1.5 }, [REV(0.3)]);
    P("poly", "Chorus Keys", "Keys", ["Clean", "Vintage"], { model: 0, aw: 1, apw: 0.35, lpw: 0.4, lr: 0.6, bl: 0, cut: 2200, fenv: 0.3, fd: 0.6, fs: 0.4, aa: 0.002, ad: 1, as: 0.6, ar: 0.5, chorus: 1 });
    P("poly", "Analog Pluck", "Pluck", ["Clean"], { model: 1, cut: 800, res: 0.3, fenv: 0.65, fd: 0.22, fs: 0, ad: 0.5, as: 0, ar: 0.4 }, [DLY(7, 0.35, 0.22)]);
    P("poly", "Sweeping Pad", "Pad", ["Evolving", "Cinematic"], { model: 0, cut: 500, res: 0.45, lf: 0.5, lr: 0.12, aa: 1.5, as: 0.9, ar: 2.5, fenv: 0.1, chorus: 2 }, [REV(0.4, 0.85)]);
    P("poly", "Sync Sweep FX", "FX", ["Aggressive"], { model: 1, sync: 1, pme: 1, fa: 0.001, fd: 1.5, fs: 0, boct: 2, al: 0, bl: 1, cut: 5000, fenv: 0 }, [DLY(7, 0.4, 0.25)]);
    P("poly", "Unison Saw Lead", "Lead", ["Huge", "Aggressive"], { uni: 3, udet: 0.45, cut: 4000, res: 0.2, glide: 0.05, fenv: 0.2, ar: 0.25 }, [DLY(7, 0.3, 0.15), REV(0.15)]);
    P("poly", "Poly Bass", "Bass", ["Punchy", "Warm"], { model: 1, aoct: 1, boct: 1, bdet: 5, cut: 500, res: 0.3, fenv: 0.5, fd: 0.3, fs: 0.2, ad: 0.4, as: 0.8, ar: 0.1 });
    P("poly", "Glassy Pad", "Pad", ["Bright", "Ambient"], { aw: 1, apw: 0.15, bw: 2, boct: 3, hpf: 300, cut: 5000, aa: 0.8, ar: 2, lpw: 0.5, lr: 0.3, chorus: 3 }, [REV(0.4, 0.85)]);
    P("poly", "Arp Pulse", "Sequence", ["Punchy"], { aw: 1, apw: 0.25, bl: 0, cut: 1400, res: 0.5, fenv: 0.5, fd: 0.12, fs: 0, ad: 0.2, as: 0, ar: 0.12 }, [DLY(6, 0.4, 0.25)]);
    P("poly", "Soft Triangle Keys", "Keys", ["Soft"], { aw: 2, bw: 2, boct: 3, bl: 0.3, cut: 3000, fenv: 0, ad: 1.5, as: 0.3, ar: 0.6, chorus: 1 }, [REV(0.2)]);
    P("poly", "Dark Drone", "Pad", ["Dark", "Cinematic"], { model: 1, aoct: 0, boct: 0, bsemi: 7, cut: 350, res: 0.5, lf: 0.4, lr: 0.07, aa: 2.5, as: 1, ar: 4 }, [REV(0.45, 0.9)]);
    P("poly", "Sample & Hold Bleeps", "FX", ["Lo-fi"], { lshape: 3, lf: 0.8, lr: 7, cut: 1500, res: 0.7, fenv: 0, bl: 0 }, [DLY(7, 0.45, 0.3)]);
    P("poly", "Brass Section", "Brass", ["Warm"], { model: 0, uni: 2, udet: 0.25, fa: 0.12, fd: 0.8, fs: 0.6, cut: 800, fenv: 0.5, aa: 0.06, ar: 0.4, lp: 0.08, ldel: 0.4, lr: 5.5 }, [REV(0.2)]);
    // Dual Layer
    P("cs", "Neon Rain Brass", "Brass", ["Cinematic", "Huge"], { l1lp: 900, l1il: -0.3, l1al: 0.7, l1fa: 0.35, l1fd: 1.8, l1aa: 0.12, l1ar: 1.2, l2saw: 0.6, l2sq: 0.4, l2lp: 1400, l2il: -0.2, l2al: 0.6, l2fa: 0.6, l2aa: 0.3, l2ar: 1.5, det: 9, vib: 0.18 }, [REV(0.4, 0.9), DLY(9, 0.25, 0.12)]);
    P("cs", "Velvet Pad", "Pad", ["Warm", "Soft"], { l1saw: 0.6, l1sin: 0.4, l1lp: 900, l1al: 0.2, l1aa: 1.2, l1ar: 2, l2saw: 0.3, l2sq: 0.5, l2lp: 1600, l2aa: 1.8, l2ar: 2.5, det: 6 }, [REV(0.35, 0.85)]);
    P("cs", "Ring Bells", "Bells", ["Bright", "Evolving"], { l1saw: 0, l1sin: 1, l1lp: 8000, l1aa: 0.001, l1ad: 2, l1as: 0, l1ar: 1.5, l2saw: 0, l2sq: 0.4, l2sin: 0.6, l2lp: 6000, l2aa: 0.001, l2ad: 3, l2as: 0, l2ar: 2, ring: 0.65, ringr: 11, feet: 2 }, [REV(0.35)]);
    P("cs", "Sweeping Strings", "Strings", ["Cinematic"], { l1lp: 1800, l1il: -0.4, l1al: 0.3, l1fa: 1.2, l1aa: 0.6, l1ar: 1.5, l2saw: 0.7, l2sq: 0, l2lp: 2500, l2aa: 0.8, l2ar: 1.8, det: 10, vib: 0.15 }, [REV(0.3, 0.8)]);
    P("cs", "Stadium Brass", "Brass", ["Huge", "Vintage"], { l1lp: 1200, l1il: 0, l1al: 0.8, l1fa: 0.08, l1fd: 0.8, l1aa: 0.05, l2saw: 0.8, l2sq: 0, l2lp: 1600, l2il: 0, l2al: 0.7, l2fa: 0.1, l2aa: 0.06, det: 12 }, [REV(0.3)]);
    P("cs", "Touch Lead", "Lead", ["Vintage"], { l1lp: 2200, l1aa: 0.02, l1as: 0.9, l2lvl: 0.3, touch: 1, vib: 0.3, chorus: 0 }, [DLY(7, 0.3, 0.18), REV(0.2)]);
    P("cs", "Dark Swell", "Pad", ["Dark", "Cinematic"], { l1lp: 400, l1res: 0.4, l1il: -0.5, l1al: 0.5, l1fa: 3, l1aa: 2.5, l1ar: 3, l2lp: 700, l2aa: 3, l2ar: 3.5, bril: -0.4 }, [REV(0.45, 0.9)]);
    P("cs", "Glass Choir", "Choir", ["Ambient"], { l1saw: 0.2, l1sin: 0.8, l1hp: 400, l1lp: 2500, l1aa: 0.6, l1ar: 1.8, l2saw: 0, l2sq: 0.6, l2pw: 0.12, l2hp: 900, l2lp: 3000, l2aa: 0.9, l2ar: 2, vib: 0.2 }, [REV(0.45, 0.85)]);
    P("cs", "Twin Pluck", "Pluck", ["Clean"], { l1lp: 700, l1al: 0.9, l1fa: 0.001, l1fd: 0.3, l1aa: 0.001, l1ad: 0.5, l1as: 0, l1ar: 0.4, l2lp: 1200, l2al: 0.8, l2fa: 0.001, l2fd: 0.4, l2aa: 0.001, l2ad: 0.7, l2as: 0, l2ar: 0.5 }, [DLY(7, 0.3, 0.2)]);
    P("cs", "Dual Bass", "Bass", ["Warm", "Punchy"], { l1lp: 400, l1al: 0.6, l1fa: 0.001, l1fd: 0.3, l1aa: 0.002, l1ar: 0.12, l2saw: 0, l2sq: 0.8, l2lp: 300, l2aa: 0.002, l2ar: 0.1, feet: 0, chorus: 0, vib: 0 });
    P("cs", "Detuned Keys", "Keys", ["Vintage"], { l1lp: 2000, l1al: 0.3, l1aa: 0.002, l1ad: 1.5, l1as: 0.3, l1ar: 0.5, l2lp: 2600, l2aa: 0.002, l2ad: 1.2, l2as: 0.2, l2ar: 0.5, det: 16 }, [REV(0.2)]);
    P("cs", "Evolving Layers", "Pad", ["Evolving", "Ambient"], { l1lp: 1200, l1aa: 0.05, l1ad: 2, l1as: 0.4, l1ar: 2, l2saw: 0.2, l2sq: 0.7, l2lp: 2200, l2il: -0.6, l2al: 0.4, l2fa: 4, l2aa: 3, l2ar: 3, ring: 0.15, ringr: 3 }, [REV(0.4, 0.9)]);
    // 6-Op FM: [ratio, detune, level, attack, decay, sustain, release, velocity]
    const TINE = [[1, 3, 0.9, 0.001, 3, 0, 0.5, 0.3], [1, -3, 0.5, 0.001, 1.4, 0.1, 0.4, 0.7], [1, 0, 0.8, 0.001, 3.5, 0, 0.6, 0.3], [14, 0, 0.25, 0.001, 0.25, 0, 0.2, 0.9], [1, 2, 0.6, 0.001, 2.5, 0, 0.5, 0.3], [1, 0, 0.4, 0.001, 1.2, 0, 0.4, 0.6]];
    P("fm", "Tine E.Piano", "Keys", ["Classic", "Bright", "Clean"], fmOps(TINE, { alg: 2, fb: 0.3 }), [CHO(0.3), REV(0.2)]);
    P("fm", "FM Slap Bass", "Bass", ["Punchy", "Funky"], fmOps([[0.5, 0, 0.9, 0.001, 1.2, 0.3, 0.1, 0.3], [0.5, 0, 0.7, 0.001, 0.25, 0.1, 0.1, 0.8], [1.5, 0, 0.45, 0.001, 0.2, 0, 0.1, 0.8], [3, 0, 0.3, 0.001, 0.15, 0, 0.1, 0.5], [1, 0, 0.4, 0.001, 0.3, 0.2, 0.1, 0.5], [1, 0, 0.3, 0.001, 0.2, 0, 0.1, 0.5]], { alg: 4, fb: 0.4 }));
    P("fm", "Solid Bass", "Bass", ["Funky"], fmOps([[0.5, 0, 0.9, 0.001, 1.5, 0.4, 0.15, 0.3], [0.5, 0, 0.62, 0.001, 0.5, 0.3, 0.15, 0.6], [1, 0, 0.5, 0.001, 0.8, 0.2, 0.15, 0.3], [1, 0, 0.55, 0.001, 0.3, 0.1, 0.1, 0.8], [0.5, 0, 0, 0.001, 1, 0, 0.1, 0.3], [1, 0, 0.3, 0.001, 0.5, 0, 0.1, 0.3]], { alg: 2, fb: 0.2 }));
    P("fm", "Tubular Bells", "Bells", ["Bright", "Classic"], fmOps([[1, 0, 0.9, 0.001, 6, 0, 4, 0.3], [3.5, 0, 0.6, 0.001, 4, 0, 3, 0.5], [1, 4, 0.7, 0.001, 5, 0, 3, 0.3], [3.5, -3, 0.55, 0.001, 3, 0, 2, 0.5], [2, 0, 0.4, 0.001, 2, 0, 2, 0.3], [7, 0, 0.35, 0.001, 1.5, 0, 1, 0.5]], { alg: 2, fb: 0.1 }), [REV(0.3, 0.8)]);
    P("fm", "Crystal Bell", "Bells", ["Ambient", "Bright"], fmOps([[1, 0, 0.85, 0.001, 4, 0, 3, 0.3], [7.1, 0, 0.5, 0.001, 1.5, 0, 1.5, 0.6], [2, 0, 0.5, 0.001, 3, 0, 2, 0.3], [4, 0, 0.4, 0.001, 2, 0, 1.5, 0.5], [1, 0, 0.3, 0.001, 2, 0, 1.5, 0.3], [11, 0, 0.25, 0.001, 0.8, 0, 0.8, 0.5]], { alg: 0, fb: 0.2 }), [REV(0.4, 0.85)]);
    P("fm", "FM Brass", "Brass", ["Vintage", "Punchy"], fmOps([[1, 0, 0.8, 0.03, 1, 0.8, 0.3, 0.3], [1, 0, 0.55, 0.06, 0.6, 0.6, 0.3, 0.6], [1, 5, 0.7, 0.03, 1, 0.8, 0.3, 0.3], [1, -5, 0.7, 0.03, 1, 0.8, 0.3, 0.3], [1, 0, 0.6, 0.03, 1, 0.8, 0.3, 0.3], [1, 0, 0.55, 0.08, 0.5, 0.5, 0.3, 0.6]], { alg: 6, fb: 0.5 }), [REV(0.2)]);
    P("fm", "Marimba", "Pluck", ["Clean", "Warm"], fmOps([[1, 0, 0.9, 0.001, 0.5, 0, 0.3, 0.3], [4, 0, 0.45, 0.001, 0.12, 0, 0.1, 0.7], [1, 0, 0.6, 0.001, 0.8, 0, 0.4, 0.3], [10, 0, 0.3, 0.001, 0.05, 0, 0.05, 0.7], [1, 0, 0.3, 0.001, 0.3, 0, 0.2, 0.3], [2, 0, 0.2, 0.001, 0.1, 0, 0.1, 0.5]], { alg: 2, fb: 0 }), [REV(0.2)]);
    P("fm", "Glass Pad", "Pad", ["Ambient"], fmOps([[1, 0, 0.8, 1.2, 3, 0.7, 2, 0.2], [2, 0, 0.4, 1.5, 3, 0.5, 2, 0.3], [1, 6, 0.7, 1.4, 3, 0.7, 2.5, 0.2], [3, 0, 0.35, 2, 3, 0.4, 2, 0.3], [0.5, 0, 0.6, 1, 3, 0.8, 2, 0.2], [1, 0, 0.3, 1, 3, 0.5, 2, 0.3]], { alg: 2, fb: 0.2 }), [CHO(0.4), REV(0.45, 0.85)]);
    P("fm", "Clav FM", "Keys", ["Funky"], fmOps([[1, 0, 0.9, 0.001, 0.8, 0.2, 0.08, 0.3], [3, 0, 0.6, 0.001, 0.4, 0.1, 0.08, 0.8], [1, 0, 0.6, 0.001, 0.6, 0.2, 0.08, 0.3], [5, 0, 0.45, 0.001, 0.2, 0, 0.08, 0.8], [1, 0, 0.3, 0.001, 0.2, 0, 0.08, 0.5], [7, 0, 0.3, 0.001, 0.1, 0, 0.08, 0.5]], { alg: 0, fb: 0.6 }));
    P("fm", "Reed Lead", "Lead", ["Vintage"], fmOps([[1, 0, 0.9, 0.04, 1, 0.9, 0.2, 0.3], [2, 0, 0.5, 0.05, 1, 0.6, 0.2, 0.5], [1, 0, 0.5, 0.04, 1, 0.9, 0.2, 0.3], [3, 0, 0.3, 0.05, 1, 0.5, 0.2, 0.5], [1, 0, 0.3, 0.05, 1, 0.5, 0.2, 0.5], [1, 0, 0.3, 0.05, 1, 0.5, 0.2, 0.5]], { alg: 3, fb: 0.4, vib: 0.3 }), [DLY(7, 0.3, 0.15), REV(0.2)]);
    P("fm", "Digital Strings", "Strings", ["Bright"], fmOps([[1, 0, 0.8, 0.3, 2, 0.9, 1, 0.2], [1, 3, 0.45, 0.4, 2, 0.6, 1, 0.3], [1, -6, 0.7, 0.35, 2, 0.9, 1, 0.2], [2, 0, 0.35, 0.5, 2, 0.5, 1, 0.3], [1, 6, 0.7, 0.3, 2, 0.9, 1, 0.2], [1, 0, 0.4, 0.5, 2, 0.6, 1, 0.3]], { alg: 2, fb: 0.3, vib: 0.2 }), [CHO(0.4), REV(0.3)]);
    P("fm", "FM Organ", "Organ", ["Clean"], fmOps([[0.5, 0, 0.6, 0.002, 1, 1, 0.05, 0], [1, 0, 0.8, 0.002, 1, 1, 0.05, 0], [1.5, 0, 0.4, 0.002, 1, 1, 0.05, 0], [2, 0, 0.6, 0.002, 1, 1, 0.05, 0], [3, 0, 0.4, 0.002, 1, 1, 0.05, 0], [4, 0, 0.35, 0.002, 1, 1, 0.05, 0]], { alg: 9, fb: 0 }), [CHO(0.3), REV(0.2)]);
    P("fm", "Log Drum", "Pluck", ["Punchy"], fmOps([[1, 0, 0.9, 0.001, 0.35, 0, 0.2, 0.3], [1.41, 0, 0.5, 0.001, 0.08, 0, 0.05, 0.6], [0.5, 0, 0.6, 0.001, 0.25, 0, 0.15, 0.3], [2.3, 0, 0.4, 0.001, 0.05, 0, 0.05, 0.6], [1, 0, 0, 0.001, 0.1, 0, 0.1, 0.3], [1, 0, 0, 0.001, 0.1, 0, 0.1, 0.3]], { alg: 2, fb: 0 }));
    P("fm", "Sweet FM Lead", "Lead", ["Soft"], fmOps([[1, 0, 0.85, 0.02, 1, 0.9, 0.3, 0.3], [1, 0, 0.4, 0.05, 1, 0.4, 0.3, 0.5], [2, 0, 0.3, 0.02, 1, 0.8, 0.3, 0.3], [1, 0, 0.3, 0.02, 1, 0.5, 0.3, 0.3], [1, 0, 0.2, 0.02, 1, 0.5, 0.3, 0.3], [1, 0, 0.2, 0.02, 1, 0.5, 0.3, 0.3]], { alg: 0, fb: 0.2, vib: 0.35 }), [DLY(7, 0.3, 0.2), REV(0.25)]);
    P("fm", "Hard Tine Keys", "Keys", ["Bright", "Punchy"], fmOps(TINE.map((o, i) => i == 1 ? [1, -3, 0.65, 0.001, 1.4, 0.1, 0.4, 0.8] : i == 3 ? [14, 0, 0.4, 0.001, 0.25, 0, 0.2, 1] : o), { alg: 2, fb: 0.5, mi: 1.2 }), [REV(0.15)]);
    P("fm", "Wood Pluck", "Pluck", ["Warm"], fmOps([[1, 0, 0.9, 0.001, 0.7, 0, 0.3, 0.3], [1, 0, 0.55, 0.001, 0.15, 0, 0.1, 0.8], [2, 0, 0.5, 0.001, 0.5, 0, 0.3, 0.3], [5, 0, 0.3, 0.001, 0.06, 0, 0.05, 0.7], [1, 0, 0, 0.001, 0.2, 0, 0.1, 0.3], [1, 0, 0, 0.001, 0.2, 0, 0.1, 0.3]], { alg: 2, fb: 0 }), [REV(0.2)]);
    // Electric Piano
    P("ep", "Stage Tine Classic", "Keys", ["Classic", "Warm"], {}, [REV(0.15)]);
    P("ep", "Suitcase Tremolo", "Keys", ["Vintage"], { model: 1, trem: 0.6, tremr: 4.5 }, [REV(0.18)]);
    P("ep", "Bright Dyno Tines", "Keys", ["Bright"], { tone: 10000, bell: 0.8, bark: 0.2 }, [CHO(0.3), REV(0.15)]);
    P("ep", "Ballad Tines", "Keys", ["Soft", "Warm"], { tone: 2800, bark: 0.15, bell: 0.2, decay: 1.4 }, [REV(0.3, 0.8)]);
    P("ep", "Barking Funk Tines", "Keys", ["Funky", "Aggressive"], { bark: 0.85, vel: 1, tone: 7000 });
    P("ep", "Reed Piano", "Keys", ["Vintage"], { model: 2, bark: 0.4, tone: 5000 }, [REV(0.15)]);
    P("ep", "Reed Tremolo", "Keys", ["Vintage", "Lo-fi"], { model: 2, trem: 0.5, tremr: 5.5, bark: 0.5 }, [REV(0.15)]);
    P("ep", "Funky Clav", "Keys", ["Funky"], { model: 3, pick: 0.2, tone: 7000, bark: 0.3 });
    P("ep", "Muted Clav", "Keys", ["Funky", "Punchy"], { model: 3, mute: 0.6, pick: 0.15, tone: 6000 });
    P("ep", "Lo-fi Tines", "Keys", ["Lo-fi", "Warm"], { tone: 2000, bark: 0.3 }, [fxd("lofi", { crackle: 0.3, hiss: 0.2, wow: 0.3 }), REV(0.2)]);
    P("ep", "Chorused Tines", "Keys", ["Classic", "Clean"], { bell: 0.5 }, [CHO(0.45), REV(0.2)]);
    P("ep", "Dreamy Tines", "Keys", ["Ambient", "Soft"], { model: 1, trem: 0.3, tremr: 3, tone: 4000 }, [DLY(7, 0.4, 0.25), REV(0.4, 0.85)]);
    // Piano
    P("piano", "Concert Grand", "Piano", ["Classic", "Clean"], {}, [REV(0.18, 0.75)]);
    P("piano", "Bright Pop Piano", "Piano", ["Bright", "Punchy"], { model: 2, hard: 0.75, tone: 13000 }, [REV(0.12)]);
    P("piano", "Felt Piano", "Piano", ["Soft", "Ambient"], { model: 3, hard: 0.15, tone: 2500, noise: 0.6 }, [REV(0.35, 0.85)]);
    P("piano", "Upright Bar Piano", "Piano", ["Vintage"], { model: 1, det: 0.6, hard: 0.55 }, [REV(0.12, 0.5)]);
    P("piano", "Ballad Grand", "Piano", ["Warm", "Soft"], { hard: 0.35, tone: 6000, decay: 1.2 }, [REV(0.3, 0.85)]);
    P("piano", "Rock Piano", "Piano", ["Bright", "Punchy"], { model: 2, hard: 0.9, tone: 14000, det: 0.45 });
    P("piano", "Dark Grand", "Piano", ["Dark"], { hard: 0.25, tone: 3000 }, [REV(0.2)]);
    P("piano", "Pedal Down Grand", "Piano", ["Ambient", "Cinematic"], { pedal: 1, hard: 0.4, tone: 7000 }, [REV(0.4, 0.9)]);
    // Organ
    P("organ", "Jazz Trio Organ", "Organ", ["Classic", "Warm"], Object.assign(bars("888000000"), { perc: 2, pfast: 1, vc: 6, leslie: 1, drive: 0.15 }));
    P("organ", "Gospel Full", "Organ", ["Huge"], Object.assign(bars("888888888"), { leslie: 2, drive: 0.35, click: 0.5 }), [REV(0.15)]);
    P("organ", "Rock Organ", "Organ", ["Aggressive"], Object.assign(bars("888800000"), { leslie: 2, drive: 0.7, click: 0.6 }));
    P("organ", "Soft Ballad Organ", "Organ", ["Soft", "Warm"], Object.assign(bars("008800000"), { click: 0.1, vc: 4, leslie: 1, drive: 0 }), [REV(0.2)]);
    P("organ", "Church Pipes", "Organ", ["Cinematic", "Classic"], Object.assign(bars("808806004"), { model: 2, vc: 0, leslie: 0, drive: 0, click: 0 }), [REV(0.5, 0.95)]);
    P("organ", "Combo 60s", "Organ", ["Vintage"], Object.assign(bars("008808000"), { model: 1, vc: 3, leslie: 0, drive: 0.1, click: 0 }), [REV(0.15)]);
    P("organ", "Garage Combo", "Organ", ["Aggressive", "Lo-fi"], Object.assign(bars("088808000"), { model: 1, vc: 0, leslie: 0, drive: 0.6, click: 0 }));
    P("organ", "Procession Organ", "Organ", ["Classic", "Ambient"], Object.assign(bars("688600000"), { leslie: 1, vc: 6 }), [REV(0.35, 0.85)]);
    P("organ", "Percussive Jazz", "Organ", ["Clean"], Object.assign(bars("800000000"), { perc: 1, pfast: 1, vc: 0, leslie: 1 }));
    P("organ", "Blues Organ", "Organ", ["Warm", "Aggressive"], Object.assign(bars("888600000"), { click: 0.7, leslie: 2, drive: 0.45 }));
    P("organ", "Reggae Skank Organ", "Organ", ["Funky"], Object.assign(bars("008800000"), { click: 0.8, perc: 2, pfast: 1, leslie: 0, vc: 0 }));
    P("organ", "Flute Drawbars", "Organ", ["Soft"], Object.assign(bars("006000000"), { vc: 3, leslie: 1, click: 0.2 }), [REV(0.2)]);
    // String Machine
    P("strings", "String Machine", "Strings", ["Vintage", "Classic"], {}, [REV(0.25)]);
    P("strings", "Cello Ensemble", "Strings", ["Warm", "Dark"], { vln: 0, vla: 0.3, cel: 1, cb: 0.5, tone: 3000 }, [REV(0.25)]);
    P("strings", "Bright Violins", "Strings", ["Bright"], { vln: 1, vla: 0.3, cel: 0, tone: 7500 }, [REV(0.25)]);
    P("strings", "Synth Horns", "Brass", ["Vintage"], { vln: 0, vla: 0, cel: 0, horn: 0.8, tpt: 0.4, ens: 0.5, cresc: 0.05, sus: 0.4 }, [REV(0.2)]);
    P("strings", "Slow Swell Strings", "Strings", ["Cinematic"], { cresc: 1.5, sus: 2.5 }, [REV(0.4, 0.9)]);
    P("strings", "80s String Pad", "Pad", ["Vintage", "Warm"], { vla: 0.7, cel: 0.5, cresc: 0.6, sus: 1.8, ens: 1 }, [REV(0.35)]);
    P("strings", "Dark Ensemble", "Strings", ["Dark"], { vln: 0.3, vla: 0.6, cel: 0.8, tone: 2200 }, [REV(0.3)]);
    P("strings", "Disco Strings", "Strings", ["Funky", "Bright"], { vln: 1, vla: 0.4, cel: 0.2, cresc: 0.04, sus: 0.35, tone: 6500 }, [REV(0.2)]);
    // Tape Replay
    P("tape", "Tape Violins", "Strings", ["Vintage", "Lo-fi"], {}, [REV(0.2)]);
    P("tape", "Tape Flute", "Winds", ["Vintage", "Soft"], { snd: 1 }, [REV(0.2)]);
    P("tape", "Tape Choir", "Choir", ["Cinematic", "Vintage"], { snd: 2 }, [REV(0.3, 0.8)]);
    P("tape", "Tape Cello", "Strings", ["Dark", "Vintage"], { snd: 3 }, [REV(0.2)]);
    P("tape", "Tape Brass", "Brass", ["Vintage"], { snd: 4 }, [REV(0.2)]);
    P("tape", "Tape Vibes", "Bells", ["Lo-fi"], { snd: 5, tape: 1 }, [REV(0.25)]);
    P("tape", "Worn Tape Strings", "Strings", ["Lo-fi"], { wow: 0.8, flut: 0.6, hiss: 0.5, tone: 3000 }, [REV(0.2)]);
    P("tape", "Endless Choir", "Choir", ["Ambient"], { snd: 2, tape: 1, att: 0.3, rel: 1.5 }, [REV(0.45, 0.9)]);
    // Multis: two sounds split across the keyboard or layered
    const MULTIS = [
        ["Split: Mono Bass / Tines", "Stage Tine Classic", "Classic Mono Bass", 0, 55, 0.9, ["Classic", "Warm"]],
        ["Layer: Grand + Strings", "Concert Grand", "Slow Swell Strings", 1, 60, 0.45, ["Cinematic", "Warm"]],
        ["Layer: Tines + Pad", "Chorused Tines", "Warm Poly Pad", 1, 60, 0.45, ["Ambient", "Soft"]],
        ["Split: Organ / Bass", "Jazz Trio Organ", "Soft Round Bass", 0, 52, 0.9, ["Classic", "Funky"]],
    ];
    const LIB_BY_NAME = new Map(LIB.map(it => [it.name, it]));
    for (const [name, a, b, mode, split, volB, styles] of MULTIS) LIB.push({ e: LIB_BY_NAME.get(a).e, name, type: "Multi", styles, multi: { a, b, mode, split, volB } });
    for (const it of LIB) it.id = it.e + "/" + it.name;
    const LIB_BY_ID = new Map(LIB.map(it => [it.id, it]));
    function presetParams(item) {
        if (item.multi) {
            const a = presetParams(LIB_BY_NAME.get(item.multi.a)), b = presetParams(LIB_BY_NAME.get(item.multi.b));
            b.a.vol = item.multi.volB;
            const fx = a.fx.concat(b.fx.filter(x => !a.fx.some(y => y.type == x.type)));
            return { v: 1, a: a.a, b: b.a, multi: 1, mode: item.multi.mode, split: item.multi.split, fx, n: item.name };
        }
        return { v: 1, a: makePart(item.e, item.name, item.over), b: null, multi: 0, mode: 0, split: 60, fx: item.fx.map(x => Object.assign({}, x)) };
    }
    const PRESETS = LIB.map(it => ({ group: it.type, name: it.name, params: presetParams(it) }));
    function defaultParams() {
        return presetParams(LIB_BY_NAME.get("Stage Tine Classic"));
    }
    function randomize() {
        const item = LIB.filter(it => !it.multi)[Math.floor(Math.random() * (LIB.length - MULTIS.length))];
        const p = presetParams(item);
        for (const s of ENGINES[p.a.e].specs) {
            if (Math.random() > 0.35) continue;
            if (s.o) { if (Math.random() < 0.3) p.a.p[s.k] = Math.floor(Math.random() * s.o.length); }
            else p.a.p[s.k] = fromNorm(s, toNorm(s, p.a.p[s.k]) + (Math.random() - 0.5) * 0.35);
        }
        p.a.n = item.name + " (mutated)";
        return p;
    }

    // ============================================================ voices
    function partInfo(info, part, sub) {
        const o = sub || {};
        const mul = Math.pow(2, part.oct | 0);
        o.freq = info.freq * mul;
        o.freqScale = info.freqScale;
        o.gate = info.gate;
        o.midi = info.midi + 12 * (part.oct | 0);
        o.velocity = info.velocity;
        o.sampleRate = info.sampleRate;
        o.bpm = info.bpm;
        o.prevDelta = info.prevDelta;
        o.prevGap = info.prevGap;
        return o;
    }
    function createVoice(params, info) {
        const p = fill(params);
        const subs = [];
        const add = (part) => {
            const eng = ENGINES[part.e];
            const pi = partInfo(info, part);
            subs.push({ part, eng, info: pi, v: eng.voice(effective(part), pi) });
        };
        if (!p.multi || !p.b) add(p.a);
        else if (p.mode == 1) { add(p.a); add(p.b); }
        else add(info.midi >= p.split ? p.a : p.b);
        return { subs, done: false };
    }
    function render(voice, out, start, len, info) {
        let done = true;
        for (const s of voice.subs) {
            if (s.v.done) continue;
            partInfo(info, s.part, s.info);
            s.eng.render(s.v, effective(s.part), out, start, len, s.info);
            if (!s.v.done) done = false;
        }
        voice.done = done;
    }
    function createInstrumentState() {
        return { fx: [], fxStates: [] };
    }
    function processInstrument(state, params, L, R, start, end, ctx) {
        const p = fill(params);
        const parts = p.multi && p.b ? [p.a, p.b] : [p.a];
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i], eng = ENGINES[part.e];
            if (!eng.fx || (i == 1 && part.e == parts[0].e)) continue;
            let s = state.fx[i];
            if (!s || s.e != part.e || s.sr != ctx.sampleRate) s = state.fx[i] = { e: part.e, sr: ctx.sampleRate, st: eng.fx.create(ctx.sampleRate) };
            eng.fx.process(s.st, effective(part), L, R, start, end, ctx);
        }
        if (p.fx.length > 0) CarrotFX.processChain(state.fxStates, p.fx, L, R, start, end, ctx);
    }

    // ======================================================================= UI
    A.addStyle(`
.cb-window.cb-plugin-synthvault { --cb-plugin-color: #ff8a2a; }
.cb-plugin-synthvault .cb-window-body { background: #1b1c1f !important; }
.cb-window.cb-plugin-synthvault .cb-section { background: #222327 !important; border: 1px solid #33353b !important; border-radius: 10px !important; }
.cb-sv-top { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: linear-gradient(#2c2d33, #232428); border: 1px solid #36383f; border-radius: 10px; margin-bottom: 8px; }
.cb-sv-nav { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #3b3d44; background: #2c2e34; color: #ddd; cursor: pointer; flex: none; }
.cb-sv-nav:hover { border-color: #ff8a2a; }
.cb-sv-title { flex: 1; min-width: 0; }
.cb-sv-name { font-size: 16px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-sv-sub { font-size: 11px; color: #9a9ca3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-sv-heart { font-size: 19px; background: none; border: none; color: #5d6068; cursor: pointer; padding: 0 4px; flex: none; }
.cb-sv-heart.cb-on { color: #ff5a7a; }
.cb-sv-seg { display: flex; gap: 2px; background: #17181b; border-radius: 8px; padding: 2px; flex: none; }
.cb-sv-seg button { border: none; background: none; color: #a9abb2; padding: 5px 11px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.cb-sv-seg button.cb-on { background: #ff8a2a; color: #111; font-weight: 700; }
.cb-sv-browser { display: grid; grid-template-columns: 228px minmax(0, 1fr); gap: 8px; height: 410px; }
.cb-sv-filters { overflow-y: auto; padding-right: 4px; }
.cb-sv-search { width: 100%; box-sizing: border-box; height: 28px; border-radius: 6px; border: 1px solid #3b3d44; background: #121316; color: #eee; padding: 0 8px; }
.cb-sv-h { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #7d8088; margin: 10px 0 4px; display: flex; justify-content: space-between; }
.cb-sv-chips { display: flex; flex-wrap: wrap; gap: 3px; }
.cb-sv-chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; border: 1px solid #3b3d44; background: #25272c; color: #c5c7cd; cursor: pointer; }
.cb-sv-chip.cb-on { background: #ff8a2a; border-color: #ff8a2a; color: #111; }
.cb-sv-inst { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; padding: 4px 6px; border-radius: 6px; border: none; background: none; color: #c5c7cd; cursor: pointer; font-size: 12px; }
.cb-sv-inst.cb-on { background: #33353c; color: #fff; }
.cb-sv-inst .cb-sv-count { margin-left: auto; color: #7d8088; font-size: 10px; }
.cb-sv-badge { width: 22px; height: 18px; border-radius: 4px; font-size: 9px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; color: #111; flex: none; }
.cb-sv-listwrap { display: flex; flex-direction: column; min-height: 0; }
.cb-sv-list { flex: 1; overflow-y: auto; border: 1px solid #2e3036; border-radius: 8px; background: #141518; outline: none; }
.cb-sv-list:focus { border-color: #5a4630; }
.cb-sv-row { display: grid; grid-template-columns: 22px minmax(0, 1.5fr) 74px minmax(0, 1fr) minmax(0, 1.1fr); gap: 6px; align-items: center; padding: 5px 8px; border-bottom: 1px solid #1d1e22; font-size: 12px; color: #d4d6db; cursor: pointer; }
.cb-sv-row:hover { background: #1f2126; }
.cb-sv-row.cb-sel { background: #3a2a1d; color: #fff; }
.cb-sv-row .cb-sv-dim { color: #8b8e96; font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cb-sv-row .cb-sv-like { color: #4d5058; }
.cb-sv-row .cb-sv-like.cb-on { color: #ff5a7a; }
.cb-sv-row.cb-head { cursor: default; color: #7d8088; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; background: #1a1b1f; position: sticky; top: 0; }
.cb-sv-foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8b8e96; padding-top: 5px; gap: 6px; }
.cb-sv-macros { display: flex; gap: 10px; align-items: center; margin-top: 8px; padding: 6px 12px; background: #222327; border: 1px solid #33353b; border-radius: 10px; flex-wrap: wrap; }
.cb-sv-macros .cb-knob { width: 74px; }
.cb-sv-macros .cb-knob svg { width: 44px; height: 44px; }
.cb-sv-engine { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.cb-sv-engine .cb-sv-badge { width: 42px; height: 32px; font-size: 13px; border-radius: 7px; }
.cb-sv-scroll { max-height: 470px; overflow-y: auto; padding-right: 4px; }
.cb-sv-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cb-sv-card { border: 1px solid #34363c; border-radius: 10px; padding: 8px 10px; background: #202125; }
.cb-sv-card.cb-off { opacity: 0.45; }
.cb-sv-card b { color: #fff; }
`);
    const PREVIEW = { Bass: [36], Lead: [72], Pluck: [72], Bells: [79], Sequence: [60], FX: [60], Winds: [72], Multi: [43, 60, 64, 67] };
    const uiState = { view: "sounds", types: [], styles: [], engine: null, liked: false, q: "", preview: true };
    try { Object.assign(uiState, JSON.parse(window.localStorage.getItem("carrotVaultUi") || "{}")); } catch (error) { }
    const saveUi = () => { try { window.localStorage.setItem("carrotVaultUi", JSON.stringify(uiState)); } catch (error) { } };
    let likes = new Set();
    try { likes = new Set(JSON.parse(window.localStorage.getItem("carrotVaultLikes") || "[]")); } catch (error) { }
    const saveLikes = () => { try { window.localStorage.setItem("carrotVaultLikes", JSON.stringify([...likes])); } catch (error) { } };
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
    const badge = (eng) => HTML.span({ class: "cb-sv-badge", style: "background: " + eng.color + ";" }, eng.icon);

    function buildEditor(host) {
        fill(host.params());
        const root = HTML.div();
        let cur = "a";
        const params = () => fill(host.params());
        const part = () => { const p = params(); return cur == "b" && p.multi && p.b ? p.b : p.a; };
        const currentItem = () => {
            const p = params();
            if (p.multi && p.n && cur == "a") { const m = LIB.find(it => it.name == p.n && it.type == "Multi"); if (m) return m; }
            const pt = part();
            return LIB_BY_ID.get(pt.e + "/" + pt.n) || null;
        };
        const filtered = () => {
            const q = uiState.q.trim().toLowerCase();
            return LIB.filter(it => {
                if (uiState.types.length && !uiState.types.includes(it.type)) return false;
                if (uiState.styles.length && !uiState.styles.every(s => it.styles.includes(s))) return false;
                if (uiState.engine && it.e != uiState.engine) return false;
                if (uiState.liked && !likes.has(it.id)) return false;
                if (q && !(it.name + " " + it.type + " " + it.styles.join(" ") + " " + ENGINES[it.e].name + " " + ENGINES[it.e].style).toLowerCase().includes(q)) return false;
                return true;
            });
        };

        // ---- preview notes
        let held = [];
        let previewTimer = null;
        const stopPreview = () => { clearTimeout(previewTimer); for (const n of held) host.noteOff(n); held = []; };
        const preview = (type) => {
            stopPreview();
            held = (PREVIEW[type] || [60, 64, 67]).slice();
            for (const n of held) host.noteOn(n);
            previewTimer = setTimeout(stopPreview, 1100);
        };

        // ---- loading sounds
        const load = (item, listen) => {
            const p = params();
            const made = presetParams(item);
            if (item.multi) {
                p.a = made.a; p.b = made.b; p.multi = 1; p.mode = made.mode; p.split = made.split; p.fx = made.fx; p.n = made.n;
                cur = "a";
            }
            else if (cur == "b" && p.multi) {
                const prev = p.b;
                p.b = made.a;
                if (prev) { p.b.vol = prev.vol; p.b.oct = prev.oct; }
            }
            else {
                p.a = made.a;
                if (!p.multi) { p.fx = made.fx; delete p.n; }
            }
            host.changed(true);
            host.refresh();
            if (listen && uiState.preview) preview(item.type);
        };
        const step = (dir) => {
            const list = filtered().length ? filtered() : LIB;
            const item = currentItem();
            let i = item ? list.findIndex(it => it.id == item.id) : -1;
            i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
            load(list[i], true);
        };

        // ---- top bar
        const nameEl = HTML.div({ class: "cb-sv-name" }), subEl = HTML.div({ class: "cb-sv-sub" });
        const prevBtn = HTML.button({ type: "button", class: "cb-sv-nav", title: "Previous sound in the list" }, "◀");
        const nextBtn = HTML.button({ type: "button", class: "cb-sv-nav", title: "Next sound in the list" }, "▶");
        const heart = HTML.button({ type: "button", class: "cb-sv-heart", title: "Like this sound (find it again with 'Liked')" }, "♥");
        prevBtn.addEventListener("click", () => step(-1));
        nextBtn.addEventListener("click", () => step(1));
        heart.addEventListener("click", () => {
            const item = currentItem();
            if (!item) { host.toast("Edited sounds can be saved with the Presets menu above."); return; }
            if (likes.has(item.id)) likes.delete(item.id); else likes.add(item.id);
            saveLikes();
            renderHeader();
            if (uiState.view == "sounds") renderList();
        });
        const views = HTML.div({ class: "cb-sv-seg" });
        const parts = HTML.div({ class: "cb-sv-seg" });
        const renderHeader = () => {
            const p = params(), pt = part(), eng = ENGINES[pt.e], item = currentItem();
            nameEl.textContent = p.multi && p.n && cur == "a" ? p.n : pt.n;
            subEl.textContent = (p.multi ? "Part " + cur.toUpperCase() + ": " + pt.n + " · " : "") + (item && !item.multi ? item.type + " · " : "") + eng.name + " (" + eng.style + ")";
            heart.classList.toggle("cb-on", !!item && likes.has(item.id));
            views.innerHTML = "";
            for (const [key, label] of [["sounds", "Sounds"], ["edit", "Edit"], ["studio", "Studio"]]) {
                const b = HTML.button({ type: "button", class: uiState.view == key ? "cb-on" : "" }, label);
                b.addEventListener("click", () => { uiState.view = key; saveUi(); renderAll(); });
                views.appendChild(b);
            }
            parts.innerHTML = "";
            parts.style.display = p.multi && p.b ? "" : "none";
            for (const key of ["a", "b"]) {
                const b = HTML.button({ type: "button", class: cur == key ? "cb-on" : "", title: key == "a" ? "Part A" : "Part B" }, "Part " + key.toUpperCase());
                b.addEventListener("click", () => { cur = key; renderAll(); });
                parts.appendChild(b);
            }
        };
        const top = HTML.div({ class: "cb-sv-top" }, prevBtn, HTML.div({ class: "cb-sv-title" }, nameEl, subEl), heart, nextBtn, parts, views);

        // ---- Sounds (the browser)
        const search = HTML.input({ type: "text", class: "cb-sv-search", placeholder: "Search sounds…", value: uiState.q, spellcheck: "false" });
        for (const type of ["keydown", "keyup", "keypress"]) search.addEventListener(type, (e) => e.stopPropagation());
        search.addEventListener("input", () => { uiState.q = search.value; saveUi(); renderList(); });
        const typeChips = HTML.div({ class: "cb-sv-chips" }), styleChips = HTML.div({ class: "cb-sv-chips" }), instList = HTML.div();
        const chipSet = (holder, values, key) => {
            holder.innerHTML = "";
            for (const v of values) {
                const on = uiState[key].includes(v);
                const c = HTML.button({ type: "button", class: "cb-sv-chip" + (on ? " cb-on" : "") }, v);
                c.addEventListener("click", () => {
                    uiState[key] = on ? uiState[key].filter(x => x != v) : uiState[key].concat([v]);
                    saveUi();
                    renderFilters();
                    renderList();
                });
                holder.appendChild(c);
            }
        };
        const likedToggle = CarrotUI.toggle({ label: "♥ Liked only", value: uiState.liked, onChange: (v) => { uiState.liked = v; saveUi(); renderList(); } });
        const clearBtn = CarrotUI.button("Clear filters", () => {
            Object.assign(uiState, { types: [], styles: [], engine: null, liked: false, q: "" });
            search.value = "";
            likedToggle.setValue(false);
            saveUi();
            renderFilters();
            renderList();
        });
        const renderFilters = () => {
            chipSet(typeChips, TYPES, "types");
            chipSet(styleChips, STYLES, "styles");
            instList.innerHTML = "";
            const all = HTML.button({ type: "button", class: "cb-sv-inst" + (!uiState.engine ? " cb-on" : "") }, HTML.span({ class: "cb-sv-badge", style: "background: #777;" }, "All"), "All instruments", HTML.span({ class: "cb-sv-count" }, String(LIB.length)));
            all.addEventListener("click", () => { uiState.engine = null; saveUi(); renderFilters(); renderList(); });
            instList.appendChild(all);
            for (const id of ENGINE_ORDER) {
                const eng = ENGINES[id];
                const b = HTML.button({ type: "button", class: "cb-sv-inst" + (uiState.engine == id ? " cb-on" : ""), title: eng.style }, badge(eng), eng.name, HTML.span({ class: "cb-sv-count" }, String(LIB.filter(it => it.e == id).length)));
                b.addEventListener("click", () => { uiState.engine = uiState.engine == id ? null : id; saveUi(); renderFilters(); renderList(); });
                instList.appendChild(b);
            }
        };
        const list = HTML.div({ class: "cb-sv-list", tabindex: "0", title: "Click a sound to load it. Up and down arrows step through the list." });
        const countEl = HTML.span();
        const previewToggle = CarrotUI.toggle({ label: "Preview", value: uiState.preview, title: "Play a few notes when you pick a sound", onChange: (v) => { uiState.preview = v; saveUi(); } });
        const renderList = () => {
            const items = filtered(), current = currentItem();
            list.innerHTML = "";
            list.appendChild(HTML.div({ class: "cb-sv-row cb-head" }, HTML.span("♥"), HTML.span("Name"), HTML.span("Type"), HTML.span("Instrument"), HTML.span("Character")));
            for (const it of items) {
                const eng = ENGINES[it.e];
                const like = HTML.span({ class: "cb-sv-like" + (likes.has(it.id) ? " cb-on" : ""), title: "Like" }, "♥");
                const row = HTML.div({ class: "cb-sv-row" + (current && current.id == it.id ? " cb-sel" : "") }, like, HTML.span(it.name), HTML.span({ class: "cb-sv-dim" }, it.type), HTML.span({ class: "cb-sv-dim" }, it.multi ? "Multi" : eng.name), HTML.span({ class: "cb-sv-dim" }, it.styles.join(", ")));
                like.addEventListener("click", (event) => {
                    event.stopPropagation();
                    if (likes.has(it.id)) likes.delete(it.id); else likes.add(it.id);
                    saveLikes();
                    like.classList.toggle("cb-on", likes.has(it.id));
                    renderHeader();
                });
                row.addEventListener("click", () => load(it, true));
                list.appendChild(row);
            }
            if (items.length == 0) list.appendChild(HTML.div({ class: "cb-hint", style: "padding: 12px;" }, "No sounds match. Try fewer filters."));
            countEl.textContent = items.length + " of " + LIB.length + " sounds";
            const sel = list.querySelector(".cb-sel");
            if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: "nearest" });
        };
        list.addEventListener("keydown", (event) => {
            if (event.key == "ArrowDown" || event.key == "ArrowUp") { event.preventDefault(); event.stopPropagation(); step(event.key == "ArrowDown" ? 1 : -1); list.focus(); }
            else if (event.key == "Enter") { event.preventDefault(); event.stopPropagation(); const it = currentItem(); if (it) preview(it.type); }
        });
        const soundsView = HTML.div({ class: "cb-sv-browser" },
            HTML.div({ class: "cb-sv-filters" }, search,
                HTML.div({ class: "cb-sv-h" }, "Type"), typeChips,
                HTML.div({ class: "cb-sv-h" }, "Character"), styleChips,
                HTML.div({ class: "cb-sv-h" }, "Instruments"), instList,
                HTML.div({ style: "display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;" }, likedToggle, clearBtn)),
            HTML.div({ class: "cb-sv-listwrap" }, list, HTML.div({ class: "cb-sv-foot" }, countEl, HTML.span({ style: "display: flex; gap: 4px;" }, previewToggle, CarrotUI.button("▶ Play", () => { const it = currentItem(); preview(it ? it.type : "Keys"); }, { title: "Hear the current sound" })))));

        // ---- Edit
        const editView = HTML.div({ class: "cb-sv-scroll" });
        const fmtPercent = (v) => Math.round(v * 100) + "%";
        const control = (path, s) => s.o
            ? host.select(path, { label: s.l, options: s.o, def: s.def })
            : host.knob(path, { label: s.l, min: s.min, max: s.max, def: s.def, step: s.st, unit: s.u, curve: s.c, small: true, format: s.fmt || (s.pc ? fmtPercent : undefined) });
        const renderEdit = () => {
            const pt = part(), eng = ENGINES[pt.e], base = (cur == "b" && params().multi ? "b" : "a") + ".p.";
            editView.innerHTML = "";
            editView.appendChild(HTML.div({ class: "cb-sv-engine" }, badge(eng), HTML.div(HTML.b(eng.name), HTML.div({ class: "cb-hint" }, eng.style[0].toUpperCase() + eng.style.slice(1) + ". " + eng.about))));
            for (const [title, specs] of eng.sections) editView.appendChild(CarrotUI.section(title, CarrotUI.row(...specs.map(s => control(base + s.k, s)))));
        };

        // ---- Studio
        const studioView = HTML.div({ class: "cb-sv-scroll" });
        const fxRack = carrotFxRack(host, "fx", { max: 6 });
        const renderStudio = () => {
            const p = params();
            studioView.innerHTML = "";
            const multi = CarrotUI.toggle({ label: "Multi: two sounds", value: !!p.multi, title: "Split the keyboard between two sounds, or layer them", onChange: (v) => {
                const q = params();
                q.multi = v ? 1 : 0;
                if (v && !q.b) { q.b = presetParams(LIB_BY_NAME.get(q.a.e == "mini" ? "Warm Poly Pad" : "Classic Mono Bass")).a; q.b.vol = 0.8; }
                if (!v) cur = "a";
                host.changed(true);
                host.refresh();
            } });
            const mode = CarrotUI.select({ label: "Mode", options: ["Split", "Layer"], value: p.mode, onChange: (v) => { params().mode = v; host.changed(true); renderAll(); } });
            const splitNotes = [];
            for (let m = 24; m <= 96; m++) splitNotes.push(noteName(m));
            const split = CarrotUI.select({ label: "Split at", options: splitNotes, value: clamp(p.split - 24, 0, 72), onChange: (v) => { params().split = 24 + v; host.changed(true); renderAll(); } });
            studioView.appendChild(CarrotUI.section("Multi", CarrotUI.row(multi, mode, split), CarrotUI.hint(p.multi ? (p.mode ? "Both parts play every note." : "Part B plays below " + noteName(p.split) + ", Part A from " + noteName(p.split) + " up.") : "Turn Multi on to split or layer two sounds (bass in the left hand, keys in the right; piano with strings).")));
            const card = (key) => {
                const pt = key == "a" ? p.a : p.b;
                if (!pt) return HTML.div({ class: "cb-sv-card cb-off" }, HTML.b("Part B"), CarrotUI.hint("Turn Multi on to add a second sound."));
                const eng = ENGINES[pt.e];
                const oct = CarrotUI.select({ label: "Octave", options: ["-2", "-1", "0", "+1", "+2"], value: (pt.oct | 0) + 2, onChange: (v) => { pt.oct = v - 2; host.changed(true); } });
                return HTML.div({ class: "cb-sv-card" + (key == "b" && !p.multi ? " cb-off" : "") },
                    HTML.div({ style: "display: flex; gap: 8px; align-items: center; margin-bottom: 6px;" }, badge(eng), HTML.div(HTML.b("Part " + key.toUpperCase() + ": " + pt.n), HTML.div({ class: "cb-hint" }, eng.name))),
                    CarrotUI.row(host.knob(key + ".vol", { label: "Volume", min: 0, max: 1.5, def: 1, small: true, format: fmtPercent }), oct,
                        CarrotUI.button("Choose sound", () => { cur = key; uiState.view = "sounds"; saveUi(); renderAll(); }),
                        CarrotUI.button("Edit", () => { cur = key; uiState.view = "edit"; saveUi(); renderAll(); })));
            };
            studioView.appendChild(CarrotUI.section("Parts", HTML.div({ class: "cb-sv-cards" }, card("a"), card("b"))));
            studioView.appendChild(CarrotUI.section("Effects (both parts)", fxRack));
        };

        // ---- macros
        const macroBar = HTML.div({ class: "cb-sv-macros" });
        const renderMacros = () => {
            const key = cur == "b" && params().multi ? "b" : "a";
            macroBar.innerHTML = "";
            macroBar.appendChild(HTML.div({ class: "cb-hint", style: "width: 70px;" }, "Macros" + (params().multi ? " (Part " + key.toUpperCase() + ")" : "")));
            MACRO_NAMES.forEach((name, i) => macroBar.appendChild(host.knob(key + ".m." + i, { label: name, min: 0, max: 1, def: 0.5, format: v => (v >= 0.5 ? "+" : "") + Math.round((v - 0.5) * 200) + "%", title: name + ": the middle is the sound as it was made" })));
        };

        const body = HTML.div();
        const renderAll = () => {
            const p = params();
            if (cur == "b" && !(p.multi && p.b)) cur = "a";
            renderHeader();
            body.innerHTML = "";
            if (uiState.view == "edit") { renderEdit(); body.appendChild(editView); }
            else if (uiState.view == "studio") { renderStudio(); body.appendChild(studioView); }
            else { renderFilters(); renderList(); body.appendChild(soundsView); }
            renderMacros();
        };
        root.append(top, body, macroBar);
        host.onRefresh(() => renderAll());
        renderAll();
        return root;
    }

    B.CarrotPlugins.register({
        id: "synthvault",
        width: 980,
        defaultParams,
        presets: PRESETS,
        randomize,
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
        // for tests and tools
        library: LIB,
        engineIds: ENGINE_ORDER,
        presetParams,
    });
})();
