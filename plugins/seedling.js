/*
 * Seedling - grow sounds instead of programming them.
 *
 * Every sound is a seed: 20 "genes" (DNA) that a small synth turns into tone,
 * texture, filter and envelope. The plant view shows twelve branches of
 * mutations around the current sound - drag through them to explore, press
 * Plant to make the current sound the new root and grow new branches from it.
 * Genes can be edited directly, and Genopatch evolves a patch that imitates
 * any sample you give it.
 *
 * Instrument plugin: every note creates one voice (see createVoice/render).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, CarrotADSR, CarrotSVF, CarrotDelayLine, FLSampleBank, carrotFxRack, flToast } = A;

    const GENES = 20;
    const BRANCHES = 12;
    const BLOCK = 16;
    const GENE_INFO = [
        ["Shape", "Tone", "Sine > triangle > saw > square > pulse"],
        ["Overtone", "Tone", "Pitch ratio of the second oscillator"],
        ["Mix", "Tone", "How much of the second oscillator you hear"],
        ["Detune", "Tone", "Fine detune of the second oscillator"],
        ["FM", "Tone", "How hard the second oscillator bends the first (bells, brass, metal)"],
        ["FM fade", "Tone", "How long the FM brightness lasts after the note starts"],
        ["Noise", "Texture", "Breath / attack noise"],
        ["Drive", "Texture", "Saturation"],
        ["Sub", "Texture", "Sine one octave down"],
        ["Tremolo", "Texture", "Volume wobble"],
        ["Vibrato", "Texture", "Pitch wobble that fades in"],
        ["Cutoff", "Filter", "Where the low-pass filter opens"],
        ["Resonance", "Filter", "Filter emphasis"],
        ["Filter env", "Filter", "How much the filter opens at the start of a note"],
        ["Filter fade", "Filter", "How long the filter takes to close again"],
        ["Attack", "Envelope", "Time to reach full volume"],
        ["Decay", "Envelope", "Time to fall to the sustain level"],
        ["Sustain", "Envelope", "Level while the key is held"],
        ["Release", "Envelope", "Fade-out after the key is released"],
        ["Pitch drop", "Envelope", "A downward pitch sweep at the start (kicks, zaps)"],
    ];
    const RATIOS = [0.5, 1, 1.3333, 1.5, 2, 3, 4, 5, 7];

    A.addStyle(`
.cb-seed-top { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 8px; }
.cb-seed-plant { display: block; width: 100%; height: 300px; cursor: crosshair; touch-action: none; }
.cb-seed-dna { display: grid; grid-template-columns: repeat(20, 1fr); gap: 2px; height: 46px; align-items: end; margin-top: 4px; }
.cb-seed-dna div { background: var(--cb-plugin-color, #7bd88f); border-radius: 2px 2px 0 0; min-height: 2px; opacity: 0.85; }
.cb-seed-side { display: flex; flex-direction: column; gap: 6px; }
.cb-seed-side .cb-button { width: 100%; }
.cb-seed-genes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cb-seed-progress { height: 8px; border-radius: 4px; background: var(--ui-widget-background, #333); overflow: hidden; margin: 6px 0; }
.cb-seed-progress div { height: 100%; width: 0%; background: var(--cb-plugin-color, #7bd88f); transition: width 0.12s; }
.cb-seed-heat { display: block; width: 100%; height: 110px; }
.cb-seed-drop { border: 2px dashed var(--ui-widget-focus, #666); border-radius: 8px; padding: 14px 8px; text-align: center; color: var(--secondary-text, #aaa); }
.cb-seed-drop.fl-drop-hover { background: rgba(123,216,143,0.14); color: var(--primary-text, #fff); }
`);

    // -------------------------------------------------------------- genetics
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function expand(dna) {
        const g = (i) => clamp01((dna[i] == undefined ? 50 : dna[i]) / 100);
        return {
            shape: g(0) * 4,
            ratio: RATIOS[Math.min(RATIOS.length - 1, Math.floor(g(1) * RATIOS.length))],
            mix: Math.pow(g(2), 1.5) * 0.9,
            detune: (g(3) - 0.5) * 50,
            fm: Math.pow(g(4), 2) * 9,
            fmDecay: 0.02 + Math.pow(g(5), 2) * 2.5,
            noise: Math.pow(g(6), 2) * 0.7,
            drive: g(7) * 6,
            sub: Math.pow(g(8), 1.5) * 0.8,
            trem: Math.pow(g(9), 2) * 0.7,
            vib: Math.pow(g(10), 2) * 0.6,
            cutoff: CarrotDSP.expMap(g(11), 120, 16000),
            res: g(12) * 0.88,
            fenv: (g(13) - 0.3) * 1.5 * 6,
            fdecay: 0.05 + Math.pow(g(14), 2) * 2.5,
            att: CarrotDSP.expMap(g(15), 0.001, 1.5),
            dec: CarrotDSP.expMap(g(16), 0.04, 3),
            sus: g(17),
            rel: CarrotDSP.expMap(g(18), 0.03, 3),
            drop: Math.pow(g(19), 2) * 24,
            dropTime: 0.02 + g(19) * 0.12,
        };
    }
    function randomDna() {
        const dna = [];
        for (let i = 0; i < GENES; i++) dna.push(Math.round(Math.random() * 100));
        // keep random sounds playable: usually audible sustain, gentle attack
        dna[17] = 20 + Math.round(Math.random() * 70);
        dna[15] = Math.round(Math.random() * 55);
        dna[16] = 25 + Math.round(Math.random() * 60);
        dna[11] = 35 + Math.round(Math.random() * 60);
        return dna;
    }
    function gaussian(rand) {
        const u = Math.max(1e-9, rand()), v = rand();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const branchCache = new Map();
    function branchVectors(seed) {
        if (branchCache.has(seed)) return branchCache.get(seed);
        const rand = CarrotDSP.rng((seed * 7919 + 17) >>> 0);
        const list = [];
        for (let k = 0; k < BRANCHES; k++) {
            const v = [];
            let len = 0;
            for (let i = 0; i < GENES; i++) { const x = gaussian(rand); v.push(x); len += x * x; }
            len = Math.sqrt(len) || 1;
            // each branch mostly stirs a handful of genes so branches feel different
            const focus = [];
            for (let i = 0; i < GENES; i++) focus.push(rand() < 0.45 ? 1 : 0.25);
            let flen = 0;
            for (let i = 0; i < GENES; i++) { v[i] = v[i] / len * focus[i]; flen += v[i] * v[i]; }
            flen = Math.sqrt(flen) || 1;
            list.push(v.map(x => x / flen * 1.25));
        }
        branchCache.size > 24 && branchCache.clear();
        branchCache.set(seed, list);
        return list;
    }
    // The DNA at plant position (angle, radius).
    function dnaAt(base, seed, angle, radius, range) {
        const branches = branchVectors(seed);
        const turn = (((angle + Math.PI / 2) / (2 * Math.PI)) % 1 + 1) % 1 * BRANCHES;
        const k = Math.floor(turn) % BRANCHES, f = turn - Math.floor(turn);
        const s = f * f * (3 - 2 * f);
        const a = branches[k], b = branches[(k + 1) % BRANCHES];
        const out = [];
        for (let i = 0; i < GENES; i++) {
            const d = a[i] * (1 - s) + b[i] * s;
            out.push(Math.round(clamp01(base[i] / 100 + d * radius * range) * 100));
        }
        return out;
    }
    function crossover(a, b, rand) {
        return a.map((x, i) => rand() < 0.5 ? x : b[i]);
    }
    function mutate(dna, sigma, rand) {
        return dna.map(x => rand() < 0.35 ? Math.max(0, Math.min(100, Math.round(x + gaussian(rand) * sigma * 100))) : x);
    }

    // ---------------------------------------------------------- the synth
    function softClip(x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        return x * (27 + x * x) / (27 + 9 * x * x);
    }
    function shapeWave(shape, phase, dt) {
        // 0 sine, 1 triangle, 2 saw, 3 square, 4 pulse 25% - morphing between neighbours
        const i = Math.min(3, Math.floor(shape));
        const f = shape - i;
        return waveAt(i, phase, dt) * (1 - f) + waveAt(Math.min(4, i + 1), phase, dt) * f;
    }
    function waveAt(i, phase, dt) {
        switch (i) {
            case 0: return Math.sin(phase * 6.283185307179586);
            case 1: return 1 - 4 * Math.abs(phase - 0.5);
            case 2: {
                let v = 2 * phase - 1;
                if (phase < dt) { const t = phase / dt; v -= t + t - t * t - 1; }
                else if (phase > 1 - dt) { const t = (phase - 1) / dt; v -= t * t + t + t + 1; }
                return v * 0.8;
            }
            default: {
                const width = i == 3 ? 0.5 : 0.25;
                let v = phase < width ? 1 : -1;
                if (phase < dt) { const t = phase / dt; v += t + t - t * t - 1; }
                else if (phase > 1 - dt) { const t = (phase - 1) / dt; v += t * t + t + t + 1; }
                let q = phase - width; if (q < 0) q += 1;
                if (q < dt) { const t = q / dt; v -= t + t - t * t - 1; }
                else if (q > 1 - dt) { const t = (q - 1) / dt; v -= t * t + t + t + 1; }
                return (v - (2 * width - 1)) * 0.6;
            }
        }
    }
    function createVoice(params, info) {
        const sr = info.sampleRate;
        const x = expand(params.dna || []);
        const voice = {
            sr, done: false, released: false, t: 0,
            p1: 0, p2: 0, pSub: 0, vibPhase: 0, tremPhase: Math.random(), noiseLP: 0,
            amp: new CarrotADSR(), svf: new CarrotSVF(),
            fmEnv: 1, fEnv: 1, noiseEnv: 1,
        };
        voice.amp.set(x.att, x.dec, x.sus, x.rel, sr);
        voice.amp.trigger();
        return voice;
    }
    function render(voice, out, start, len, info) {
        const params = info.params;
        const x = expand(params.dna || []);
        const sr = info.sampleRate;
        if (!info.gate && !voice.released) { voice.released = true; voice.amp.release(); }
        voice.amp.set(x.att, x.dec, x.sus, x.rel, sr);
        const tune = Math.pow(2, ((params.tune || 0)) / 12);
        const level = (params.level == undefined ? 0.8 : params.level) * 2.0;
        const fmCoef = Math.exp(-1 / (x.fmDecay * sr));
        const fCoef = Math.exp(-1 / (x.fdecay * sr));
        const nCoef = Math.exp(-1 / (0.06 * sr));
        const dropCoef = x.dropTime;
        const detune = Math.pow(2, x.detune / 1200);
        let baseFreq = info.freq * tune;
        const freqStep = Math.pow(info.freqScale || 1, BLOCK);
        const drive = 1 + x.drive;
        const normalizeDrive = x.drive > 0.01 ? 1 / Math.sqrt(drive) : 1;
        let index = start;
        const end = start + len;
        while (index < end) {
            const n = Math.min(BLOCK, end - index);
            const seconds = voice.t / sr;
            const semis = x.drop * Math.exp(-seconds / dropCoef) + Math.sin(voice.vibPhase * 6.283185307179586) * x.vib * Math.min(1, seconds / 0.5);
            const hz = baseFreq * Math.pow(2, semis / 12);
            const dt1 = Math.min(0.45, hz / sr);
            const dt2 = Math.min(0.45, hz * x.ratio * detune / sr);
            const cutoff = Math.max(30, Math.min(sr * 0.45, x.cutoff * Math.pow(2, x.fenv * voice.fEnv)));
            voice.svf.set(cutoff, x.res, sr);
            let p1 = voice.p1, p2 = voice.p2, pSub = voice.pSub;
            for (let i = 0; i < n; i++) {
                const o2 = Math.sin(p2 * 6.283185307179586);
                const fm = x.fm * voice.fmEnv;
                let ph = p1 + fm * o2 * 0.16;
                ph -= Math.floor(ph);
                let s = shapeWave(x.shape, ph, dt1);
                s += o2 * x.mix * 0.7;
                s += Math.sin(pSub * 6.283185307179586) * x.sub;
                if (x.noise > 0.001) {
                    voice.noiseLP += ((Math.random() * 2 - 1) - voice.noiseLP) * 0.5;
                    s += voice.noiseLP * x.noise * (0.25 + 0.75 * voice.noiseEnv);
                    voice.noiseEnv *= nCoef;
                }
                if (x.drive > 0.01) s = softClip(s * drive) * normalizeDrive;
                s = voice.svf.process(s, 0);
                const env = voice.amp.next();
                const trem = x.trem > 0.001 ? 1 - x.trem * (0.5 - 0.5 * Math.sin(voice.tremPhase * 6.283185307179586)) : 1;
                out[index + i] += s * env * trem * level;
                p1 += dt1; if (p1 >= 1) p1 -= 1;
                p2 += dt2; if (p2 >= 1) p2 -= 1;
                pSub += dt1 * 0.5; if (pSub >= 1) pSub -= 1;
                voice.fmEnv *= fmCoef;
                voice.fEnv *= fCoef;
            }
            voice.p1 = p1; voice.p2 = p2; voice.pSub = pSub;
            voice.vibPhase += 5.2 * n / sr; if (voice.vibPhase >= 1) voice.vibPhase -= 1;
            voice.tremPhase += 5.8 * n / sr; if (voice.tremPhase >= 1) voice.tremPhase -= 1;
            voice.t += n;
            index += n;
            baseFreq *= freqStep;
            if (voice.released && voice.amp.done) voice.done = true;
        }
        if (!(Math.abs(voice.noiseLP) < 1e6)) voice.noiseLP = 0;
        if (voice.released && voice.amp.done) voice.done = true;
    }
    // Renders one note offline (used by Genopatch).
    function renderNote(dna, freq, seconds, sr, hold) {
        const params = { dna, tune: 0, level: 1 };
        const info = { freq, freqScale: 1, gate: true, params, sampleRate: sr, midi: 69 + 12 * Math.log2(freq / 440), velocity: 1, bpm: 120 };
        const voice = createVoice(params, info);
        const total = Math.floor(seconds * sr);
        const out = new Float32Array(total);
        const holdSamples = Math.floor(hold * sr);
        const chunk = 512;
        for (let pos = 0; pos < total; pos += chunk) {
            const n = Math.min(chunk, total - pos);
            info.gate = pos < holdSamples;
            const tmp = new Float32Array(n);
            render(voice, tmp, 0, n, info);
            out.set(tmp, pos);
        }
        return out;
    }

    // --------------------------------------------------- instrument effects
    function createInstrumentState() { return { fxStates: [] }; }
    function processInstrument(state, params, L, R, start, end, ctx) {
        if (Array.isArray(params.fx) && params.fx.length > 0) CarrotFX.processChain(state.fxStates, params.fx, L, R, start, end, ctx);
    }

    // ---------------------------------------------------------------- params
    const BASE_DNA = [38, 25, 20, 55, 30, 30, 8, 10, 0, 0, 0, 60, 18, 60, 40, 5, 45, 30, 40, 0];
    function defaults() {
        return { dna: BASE_DNA.slice(), base: BASE_DNA.slice(), seed: 1 + Math.floor(Math.random() * 99998), pos: { a: 0, r: 0 }, range: 0.7, tune: 0, level: 0.8, fx: [] };
    }
    function fill(params) {
        const d = defaults();
        if (!Array.isArray(params.dna) || params.dna.length < GENES) params.dna = (params.base || d.dna).slice();
        if (!Array.isArray(params.base) || params.base.length < GENES) params.base = params.dna.slice();
        if (typeof params.seed != "number") params.seed = d.seed;
        if (!params.pos || typeof params.pos != "object") params.pos = { a: 0, r: 0 };
        for (const key of ["range", "tune", "level"]) if (typeof params[key] != "number") params[key] = d[key];
        if (!Array.isArray(params.fx)) params.fx = [];
        return params;
    }
    const reverb = (mix) => Object.assign(CarrotFX.defaults("reverb"), { mix });
    const delay = (mix) => Object.assign(CarrotFX.defaults("delay"), { mix });
    function preset(name, group, dna, extra) {
        return { group, name, params: Object.assign({ dna: dna.slice(), base: dna.slice(), seed: 1000 + name.length * 37, pos: { a: 0, r: 0 }, range: 0.7, tune: 0, level: 0.8, fx: [] }, extra || {}) };
    }
    //         shape ovr mix det  fm  fmd noi drv sub trm vib cut res fenv fdec att dec sus rel drop
    const PRESETS = [
        preset("Soft Pluck", "Plucks", [34, 25, 18, 55, 28, 22, 6, 8, 0, 0, 0, 58, 16, 62, 38, 4, 40, 0, 38, 0]),
        preset("Glass Bell", "Plucks", [8, 55, 40, 50, 62, 70, 4, 0, 0, 0, 0, 80, 10, 40, 60, 2, 82, 0, 72, 0], { fx: [reverb(0.3)] }),
        preset("Marimba", "Plucks", [5, 60, 50, 50, 25, 18, 10, 0, 0, 0, 0, 62, 5, 45, 25, 2, 36, 0, 30, 0]),
        preset("Fat Bass", "Bass", [55, 15, 35, 56, 0, 20, 0, 22, 55, 0, 0, 38, 25, 55, 40, 2, 52, 85, 25, 5]),
        preset("808 Boom", "Bass", [3, 15, 0, 50, 0, 20, 4, 18, 30, 0, 0, 30, 5, 10, 50, 1, 70, 40, 35, 55]),
        preset("Acid Zap", "Bass", [58, 15, 0, 50, 8, 25, 0, 30, 0, 0, 0, 22, 72, 88, 28, 2, 36, 18, 22, 20]),
        preset("Warm Pad", "Pads", [42, 38, 45, 64, 12, 60, 4, 6, 25, 8, 22, 55, 15, 20, 70, 62, 70, 85, 70, 0], { fx: [reverb(0.35)] }),
        preset("Choir Aah", "Pads", [20, 48, 55, 60, 22, 72, 22, 0, 0, 12, 30, 48, 30, 15, 60, 55, 60, 82, 68, 0], { fx: [reverb(0.4)] }),
        preset("Evolving Sweep", "Pads", [60, 40, 40, 70, 30, 80, 10, 14, 10, 6, 15, 30, 40, 80, 85, 72, 80, 80, 75, 0], { fx: [reverb(0.35)] }),
        preset("Brass Stab", "Leads", [58, 15, 30, 54, 55, 30, 5, 28, 0, 0, 12, 45, 20, 70, 28, 12, 45, 50, 30, 0]),
        preset("Square Lead", "Leads", [78, 15, 22, 56, 5, 25, 0, 12, 0, 0, 25, 70, 14, 25, 40, 4, 40, 85, 35, 0], { fx: [delay(0.2)] }),
        preset("Wobble Wire", "Leads", [60, 45, 40, 50, 65, 50, 5, 25, 0, 55, 40, 52, 40, 30, 50, 6, 50, 75, 40, 0]),
        preset("Breath Flute", "Leads", [10, 30, 15, 50, 4, 40, 55, 0, 0, 0, 30, 70, 10, 15, 60, 30, 55, 80, 40, 0]),
        preset("Noise Hit", "Percussive", [30, 15, 0, 50, 0, 20, 90, 20, 0, 0, 0, 78, 30, 60, 22, 0, 22, 0, 18, 0]),
        preset("Tom Drop", "Percussive", [5, 15, 10, 50, 10, 20, 12, 10, 10, 0, 0, 40, 10, 20, 30, 0, 45, 0, 35, 45]),
    ];
    function randomize(old) {
        const p = defaults();
        p.dna = randomDna();
        p.base = p.dna.slice();
        p.fx = old && Array.isArray(old.fx) ? JSON.parse(JSON.stringify(old.fx)) : [];
        return p;
    }

    // -------------------------------------------------------- Genopatch
    const FEATURE_BANDS = 20, FEATURE_FRAMES = 12, FFT_SIZE = 1024, GENO_RATE = 22050, GENO_SECONDS = 0.9, GENO_HOLD = 0.55;
    function featuresOf(pcm, sr) {
        const frames = [];
        const total = pcm.length;
        const re = new Float64Array(FFT_SIZE), im = new Float64Array(FFT_SIZE);
        const edges = [];
        for (let b = 0; b <= FEATURE_BANDS; b++) edges.push(100 * Math.pow(9000 / 100, b / FEATURE_BANDS));
        let overall = 0, count = 0;
        const loud = [];
        for (let f = 0; f < FEATURE_FRAMES; f++) {
            const startSample = Math.floor(f * Math.max(0, total - FFT_SIZE) / (FEATURE_FRAMES - 1));
            let energy = 0;
            for (let i = 0; i < FFT_SIZE; i++) {
                const v = (pcm[startSample + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT_SIZE));
                re[i] = v; im[i] = 0; energy += v * v;
            }
            CarrotDSP.fft(re, im, false);
            const row = new Float64Array(FEATURE_BANDS);
            for (let b = 0; b < FEATURE_BANDS; b++) {
                const k0 = Math.max(1, Math.floor(edges[b] / sr * FFT_SIZE)), k1 = Math.max(k0 + 1, Math.ceil(edges[b + 1] / sr * FFT_SIZE));
                let power = 0;
                for (let k = k0; k < k1 && k < FFT_SIZE / 2; k++) power += re[k] * re[k] + im[k] * im[k];
                row[b] = 10 * Math.log10(power / (k1 - k0) + 1e-9);
                overall += row[b]; count++;
            }
            loud.push(10 * Math.log10(energy + 1e-9));
            frames.push(row);
        }
        overall /= count;
        const loudMean = loud.reduce((a, b) => a + b, 0) / loud.length;
        for (let f = 0; f < FEATURE_FRAMES; f++) {
            for (let b = 0; b < FEATURE_BANDS; b++) frames[f][b] -= overall;
            loud[f] -= loudMean;
        }
        return { frames, loud };
    }
    function featureDistance(a, b) {
        let d = 0;
        for (let f = 0; f < FEATURE_FRAMES; f++) {
            for (let k = 0; k < FEATURE_BANDS; k++) d += Math.abs(a.frames[f][k] - b.frames[f][k]);
            d += Math.abs(a.loud[f] - b.loud[f]) * 4;
        }
        return d / (FEATURE_FRAMES * (FEATURE_BANDS + 4));
    }
    // Picks the part of a sample to imitate: starts at the strongest attack.
    function analyzeTarget(pcm, rate) {
        let mono = pcm;
        if (rate != GENO_RATE) {
            const n = Math.floor(pcm.length * GENO_RATE / rate);
            mono = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const pos = i * rate / GENO_RATE, i0 = Math.floor(pos), f = pos - i0;
                mono[i] = (pcm[i0] || 0) * (1 - f) + (pcm[i0 + 1] || 0) * f;
            }
        }
        // onset: biggest jump in 5 ms energy
        const hop = Math.floor(GENO_RATE * 0.005);
        let best = 0, bestJump = 0, prev = 0;
        for (let i = 0; i + hop < mono.length; i += hop) {
            let e = 0; for (let k = 0; k < hop; k++) e += mono[i + k] * mono[i + k];
            if (e - prev > bestJump) { bestJump = e - prev; best = i; }
            prev = e;
        }
        const startSample = Math.max(0, best - Math.floor(0.005 * GENO_RATE));
        const need = Math.floor(GENO_SECONDS * GENO_RATE);
        const region = new Float32Array(need);
        for (let i = 0; i < need; i++) region[i] = mono[startSample + i] || 0;
        let peak = 1e-6; for (const v of region) peak = Math.max(peak, Math.abs(v));
        for (let i = 0; i < need; i++) region[i] /= peak;
        const hz = CarrotDSP.detectPitch(mono, GENO_RATE, Math.min(mono.length - 2048, startSample + Math.floor(0.03 * GENO_RATE)), 4096);
        return { region, hz: hz && hz > 40 && hz < 2000 ? hz : null, features: featuresOf(region, GENO_RATE) };
    }
    class Genopatch {
        constructor(target, startDna, onProgress, onDone) {
            this.target = target;
            this.freq = target.hz || 220;
            this.generation = 0;
            this.maxGenerations = 36;
            this.size = 26;
            this.onProgress = onProgress;
            this.onDone = onDone;
            this.rand = CarrotDSP.rng((Math.random() * 4294967296) >>> 0);
            this.population = [];
            const seeds = PRESETS.map(p => p.params.dna).concat(startDna ? [startDna] : []);
            for (let i = 0; i < this.size; i++) {
                const dna = i < seeds.length ? seeds[i].slice() : (i < seeds.length + 6 ? mutate(seeds[Math.floor(this.rand() * seeds.length)], 0.3, this.rand) : randomDna());
                this.population.push({ dna, score: Infinity });
            }
            this.cursor = 0;
            this.stopped = false;
            this.best = null;
        }
        evaluate(individual) {
            const pcm = renderNote(individual.dna, this.freq, GENO_SECONDS, GENO_RATE, GENO_HOLD);
            let peak = 1e-6; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
            if (peak < 1e-4) { individual.score = 1e3; return; }
            for (let i = 0; i < pcm.length; i++) pcm[i] /= peak;
            individual.score = featureDistance(this.target.features, featuresOf(pcm, GENO_RATE));
        }
        step(budgetMs) {
            const t0 = performance.now();
            while (performance.now() - t0 < budgetMs && !this.stopped) {
                if (this.cursor < this.population.length) {
                    const individual = this.population[this.cursor++];
                    if (individual.score == Infinity) this.evaluate(individual);
                    continue;
                }
                this.population.sort((a, b) => a.score - b.score);
                this.best = this.population[0];
                this.generation++;
                if (this.onProgress) this.onProgress(this.best, this.generation / this.maxGenerations);
                if (this.generation >= this.maxGenerations) { this.stopped = true; this.onDone(this.best); return; }
                const sigma = 0.25 - 0.2 * (this.generation / this.maxGenerations);
                const elite = this.population.slice(0, 5);
                const next = elite.map(e => ({ dna: e.dna.slice(), score: e.score }));
                while (next.length < this.size - 3) {
                    const a = elite[Math.floor(this.rand() * elite.length)] , b = this.population[Math.floor(this.rand() * Math.ceil(this.size / 2))];
                    next.push({ dna: mutate(crossover(a.dna, b.dna, this.rand), sigma, this.rand), score: Infinity });
                }
                while (next.length < this.size) next.push({ dna: randomDna(), score: Infinity });
                this.population = next;
                this.cursor = 0;
            }
        }
        stop() { this.stopped = true; }
    }

    // ---------------------------------------------------------------- editor
    function drawPlant(canvas, state, params) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        const color = getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#7bd88f";
        const bg = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, Math.max(w, h) * 0.7);
        bg.addColorStop(0, "#14201a");
        bg.addColorStop(1, "#080b0a");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h * 0.55;
        const R = Math.min(w / 2 - 22, h * 0.45 - 4);
        state.geom = { cx, cy, R };
        // soil line + stem
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(cx, cy, R * i / 3, 0, Math.PI * 2); ctx.stroke(); }
        ctx.lineCap = "round";
        const branchAngle = (k) => (k / BRANCHES) * Math.PI * 2 - Math.PI / 2;
        const current = params.pos || { a: 0, r: 0 };
        const turn = ((((current.a + Math.PI / 2) / (2 * Math.PI)) % 1) + 1) % 1 * BRANCHES;
        for (let k = 0; k < BRANCHES; k++) {
            const a = branchAngle(k);
            const ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
            const bend = 0.18 * Math.sin(k * 1.7 + 0.6);
            const mx = cx + Math.cos(a + bend) * R * 0.55, my = cy + Math.sin(a + bend) * R * 0.55;
            const near = Math.max(0, 1 - Math.min(Math.abs(turn - k), Math.abs(turn - k - BRANCHES), Math.abs(turn - k + BRANCHES)));
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.quadraticCurveTo(mx, my, ex, ey);
            ctx.strokeStyle = "rgba(123,216,143," + (0.22 + near * 0.55) + ")";
            ctx.lineWidth = 2 + near * 2;
            ctx.stroke();
            // leaves
            const hue = (k / BRANCHES) * 300 + 90;
            ctx.beginPath();
            ctx.arc(ex, ey, 7 + near * 4, 0, Math.PI * 2);
            ctx.fillStyle = "hsl(" + hue + ", 60%, " + (45 + near * 20) + "%)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(mx * 0.5 + ex * 0.5, my * 0.5 + ey * 0.5, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = "hsla(" + hue + ", 55%, 55%, 0.55)";
            ctx.fill();
        }
        // root
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fillStyle = "#e8d9a8";
        ctx.fill();
        ctx.strokeStyle = "#7a6a3a";
        ctx.lineWidth = 2;
        ctx.stroke();
        // handle
        const hx = cx + Math.cos(current.a) * current.r * R, hy = cy + Math.sin(current.a) * current.r * R;
        const pulse = state.growing ? 0.5 + 0.5 * Math.sin(performance.now() / 160) : 0;
        ctx.beginPath();
        ctx.arc(hx, hy, 9 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("Seed " + params.seed + "  |  drag to explore, click a leaf to jump to it", 8, 6);
    }
    function heatmap(canvas, features, title) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        if (!features) {
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(title, w / 2, h / 2);
            return;
        }
        const cw = w / FEATURE_FRAMES, ch = h / FEATURE_BANDS;
        for (let f = 0; f < FEATURE_FRAMES; f++) {
            for (let b = 0; b < FEATURE_BANDS; b++) {
                const v = Math.max(0, Math.min(1, (features.frames[f][b] + 40) / 60));
                ctx.fillStyle = "hsl(" + (220 - v * 190) + ", 70%, " + (8 + v * 52) + "%)";
                ctx.fillRect(f * cw, h - (b + 1) * ch, cw + 0.5, ch + 0.5);
            }
        }
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(title, 4, 3);
    }
    function buildEditor(host) {
        fill(host.params());
        const root = HTML.div();
        const state = { growing: false, geom: null, job: null, history: [] };
        host._seedState = state;
        const getP = () => fill(host.params());
        const redraws = [];
        const preview = () => host.previewNote(36, 0.7);

        // ---- Plant tab
        const plant = HTML.canvas({ class: "cb-canvas cb-seed-plant" });
        const dnaStrip = HTML.div({ class: "cb-seed-dna", title: "The current DNA: one bar per gene" });
        for (let i = 0; i < GENES; i++) dnaStrip.appendChild(HTML.div({ title: GENE_INFO[i][0] }));
        const drawDna = () => { const dna = getP().dna; Array.from(dnaStrip.children).forEach((bar, i) => { bar.style.height = Math.max(2, dna[i] / 100 * 44) + "px"; }); };
        const redrawPlant = () => { drawPlant(plant, state, getP()); drawDna(); };
        redraws.push(redrawPlant);
        const setPosition = (angle, radius, audition) => {
            const p = getP();
            p.pos = { a: angle, r: Math.max(0, Math.min(1, radius)) };
            p.dna = dnaAt(p.base, p.seed, p.pos.a, p.pos.r, p.range);
            host.changed();
            host.refresh();
            redrawPlant();
            if (audition) preview();
        };
        let dragging = false;
        let lastPreview = 0;
        const fromEvent = (event) => {
            const rect = plant.getBoundingClientRect();
            const g = state.geom || { cx: rect.width / 2, cy: rect.height / 2, R: rect.height * 0.4 };
            const dx = event.clientX - rect.left - g.cx, dy = event.clientY - rect.top - g.cy;
            return { a: Math.atan2(dy, dx), r: Math.min(1, Math.hypot(dx, dy) / g.R) };
        };
        plant.addEventListener("pointerdown", (event) => {
            dragging = true;
            plant.setPointerCapture(event.pointerId);
            const q = fromEvent(event);
            // near a leaf: jump straight to it
            const k = Math.round((((q.a + Math.PI / 2) / (2 * Math.PI)) % 1 + 1) % 1 * BRANCHES) % BRANCHES;
            const leafAngle = (k / BRANCHES) * Math.PI * 2 - Math.PI / 2;
            const diff = Math.abs(Math.atan2(Math.sin(q.a - leafAngle), Math.cos(q.a - leafAngle)));
            if (q.r > 0.8 && diff < 0.2) setPosition(leafAngle, 0.95, true);
            else setPosition(q.a, q.r, true);
            lastPreview = performance.now();
        });
        plant.addEventListener("pointermove", (event) => {
            if (!dragging) return;
            const q = fromEvent(event);
            const now = performance.now();
            setPosition(q.a, q.r, now - lastPreview > 450);
            if (now - lastPreview > 450) lastPreview = now;
        });
        const release = () => { dragging = false; };
        plant.addEventListener("pointerup", release);
        plant.addEventListener("pointercancel", release);
        const plantButton = CarrotUI.button("Plant this sound", () => {
            const p = getP();
            state.history.push({ base: p.base.slice(), dna: p.dna.slice(), seed: p.seed, pos: Object.assign({}, p.pos) });
            if (state.history.length > 20) state.history.shift();
            p.base = p.dna.slice();
            p.seed = 1 + Math.floor(Math.random() * 99998);
            p.pos = { a: 0, r: 0 };
            host.changed(); host.refresh(); redrawPlant();
            flToast("Planted. New branches have grown from this sound.");
        }, { primary: true, title: "Make the current sound the root and grow a new set of branches around it" });
        const undoButton = CarrotUI.button("Back to previous root", () => {
            const last = state.history.pop();
            if (!last) { flToast("Nothing to go back to."); return; }
            const p = getP();
            Object.assign(p, { base: last.base, dna: last.dna, seed: last.seed, pos: last.pos });
            host.changed(); host.refresh(); redrawPlant();
        });
        const reseed = CarrotUI.button("New branches", () => {
            const p = getP();
            p.seed = 1 + Math.floor(Math.random() * 99998);
            p.dna = dnaAt(p.base, p.seed, p.pos.a, p.pos.r, p.range);
            host.changed(); host.refresh(); redrawPlant();
        }, { title: "Same root, different mutations" });
        const centerButton = CarrotUI.button("Back to the root", () => setPosition(0, 0, true), { title: "Return to the sound at the center" });
        const playButton = CarrotUI.button("Play", preview, { title: "Hear the current sound" });
        const side = HTML.div({ class: "cb-seed-side" },
            CarrotUI.section("Grow", plantButton, reseed, centerButton, undoButton, playButton),
            CarrotUI.section("Sound", CarrotUI.row(
                host.knob("range", { label: "Mutation", min: 0.1, max: 1.5, def: 0.7, small: true, format: v => Math.round(v * 100) + "%", title: "How different the branches are from the root", onChange: () => setPosition(getP().pos.a, getP().pos.r, false) }),
                host.knob("tune", { label: "Tune", min: -24, max: 24, step: 1, def: 0, unit: "st", small: true }),
                host.knob("level", { label: "Level", min: 0, max: 1.5, def: 0.8, small: true, format: v => Math.round(v * 100) + "%" }))));
        const plantTab = HTML.div(HTML.div({ class: "cb-seed-top" }, HTML.div(plant, dnaStrip), side), CarrotUI.hint("Each leaf is a mutation of the sound at the center. Drag between leaves to blend them, farther from the center for bigger changes."));

        // ---- Genes tab
        const groups = {};
        GENE_INFO.forEach((info, i) => {
            (groups[info[1]] = groups[info[1]] || []).push(i);
        });
        const geneTab = HTML.div();
        const geneKnobs = [];
        const grid = HTML.div({ class: "cb-seed-genes" });
        for (const name of Object.keys(groups)) {
            const row = CarrotUI.row();
            for (const i of groups[name]) {
                const knob = CarrotUI.knob({ label: GENE_INFO[i][0], title: GENE_INFO[i][2], min: 0, max: 100, step: 1, def: BASE_DNA[i], value: getP().dna[i], small: true, format: v => String(Math.round(v)), onInput: (v) => {
                    const p = getP();
                    p.dna[i] = Math.round(v);
                    // editing a gene re-roots the plant at the edited sound
                    p.base = p.dna.slice();
                    p.pos = { a: 0, r: 0 };
                    host.changed();
                    drawDna();
                }, onChange: () => redrawPlant() });
                geneKnobs[i] = knob;
                row.appendChild(knob);
            }
            grid.appendChild(CarrotUI.section(name, row));
        }
        host.onRefresh(() => { const dna = getP().dna; geneKnobs.forEach((k, i) => k && k.setValue(dna[i])); });
        geneTab.append(grid, CarrotUI.hint("These are the genes the synth is grown from. Editing a gene makes the edited sound the new root of the plant."));

        // ---- Genopatch tab
        const targetHeat = HTML.canvas({ class: "cb-canvas cb-seed-heat" });
        const growHeat = HTML.canvas({ class: "cb-canvas cb-seed-heat" });
        const progressBar = HTML.div(HTML.div());
        progressBar.className = "cb-seed-progress";
        const geno = { target: null, name: "", best: null };
        const status = CarrotUI.hint("Choose or drop a sample (a note, a pluck, a drum hit, a short phrase). Seedling will evolve a patch that sounds like it.");
        const drawGeno = () => {
            heatmap(targetHeat, geno.target ? geno.target.features : null, geno.target ? "Target: " + geno.name : "Target");
            heatmap(growHeat, geno.best ? geno.best.features : null, "Grown patch");
        };
        redraws.push(drawGeno);
        const dropZone = HTML.div({ class: "cb-seed-drop" }, "Drop a sample here (or from the Sound Browser)");
        const loadTarget = async (sample) => {
            const entry = await FLSampleBank.whenReady(sample.id);
            if (!entry || entry.status != "ready") { host.toast("Couldn't read that sound."); return; }
            geno.target = analyzeTarget(entry.pcm, entry.rate);
            geno.name = sample.name || FLSampleBank.getName(sample.id);
            geno.best = null;
            geno.sample = sample;
            status.textContent = "Target: " + geno.name + (geno.target.hz ? " (pitch about " + Math.round(geno.target.hz) + " Hz)" : " (no clear pitch - matching its timbre)") + ". Press Grow.";
            drawGeno();
        };
        host.acceptSampleDrops(dropZone, loadTarget);
        const chooseButton = CarrotUI.button("Choose sample...", async () => { const s = await host.pickAudioFile(); if (s) loadTarget(s); });
        const hearTarget = CarrotUI.button("Hear target", () => { if (geno.sample) { const e = host.sample(geno.sample.id); if (e) FLSampleBank.previewPcm(e.pcm, e.rate); } });
        const growButton = CarrotUI.button("Grow a patch", () => {
            if (!geno.target) { host.toast("Choose a sample first."); return; }
            if (state.job) { state.job.stop(); state.job = null; state.growing = false; growButton.textContent = "Grow a patch"; return; }
            state.growing = true;
            growButton.textContent = "Stop growing";
            const animate = () => { if (state.growing) { redrawPlant(); requestAnimationFrame(animate); } };
            const job = new Genopatch(geno.target, getP().dna, (best, fraction) => {
                progressBar.firstChild.style.width = Math.round(fraction * 100) + "%";
                status.textContent = "Growing... generation " + Math.round(fraction * job.maxGenerations) + " of " + job.maxGenerations + " - match " + Math.max(0, Math.round(100 - best.score * 6)) + "%";
                const pcm = renderNote(best.dna, job.freq, GENO_SECONDS, GENO_RATE, GENO_HOLD);
                let peak = 1e-6; for (const v of pcm) peak = Math.max(peak, Math.abs(v));
                for (let i = 0; i < pcm.length; i++) pcm[i] /= peak;
                geno.best = { features: featuresOf(pcm, GENO_RATE), dna: best.dna };
                drawGeno();
            }, (best) => {
                state.job = null; state.growing = false;
                growButton.textContent = "Grow a patch";
                const p = getP();
                p.dna = best.dna.slice();
                p.base = best.dna.slice();
                p.seed = 1 + Math.floor(Math.random() * 99998);
                p.pos = { a: 0, r: 0 };
                host.changed(); host.refresh(); redrawPlant();
                status.textContent = "Done. Match about " + Math.max(0, Math.round(100 - best.score * 6)) + "%. The grown sound is now the root of the plant - press Play on the Plant tab.";
                flToast("Grew a patch from " + geno.name);
                preview();
            });
            state.job = job;
            const tick = () => {
                if (state.job !== job) return;
                job.step(28);
                if (!job.stopped) setTimeout(tick, 4);
            };
            animate();
            tick();
        }, { primary: true, title: "Evolve a patch that imitates the sample (takes a few seconds)" });
        const genoTab = HTML.div(CarrotUI.section("Genopatch: imitate a sample", dropZone, CarrotUI.row(chooseButton, hearTarget, growButton), progressBar, status, CarrotUI.cols(2, targetHeat, growHeat)));

        // ---- Effects tab
        const fxTab = HTML.div(CarrotUI.section("Effects", carrotFxRack(host, "fx", { max: 6 })));

        const tabs = CarrotUI.tabs([["Plant", plantTab], ["Genes", geneTab], ["Genopatch", genoTab], ["Effects", fxTab]], () => setTimeout(() => redraws.forEach(f => f()), 0));
        host.onRefresh(() => redraws.forEach(f => f()));
        root.appendChild(tabs);
        root.addEventListener("remove", () => { if (state.job) state.job.stop(); });
        setTimeout(() => redraws.forEach(f => f()), 30);
        return root;
    }

    B.CarrotPlugins.register({
        id: "seedling",
        width: 700,
        defaultParams: defaults,
        presets: PRESETS,
        randomize,
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
        onClose: (host) => {
            const state = host && host._seedState;
            if (state) {
                if (state.job) state.job.stop();
                state.job = null;
                state.growing = false;
            }
        },
    });
})();
