    // ======================================================================
    // CarrotBox: the full built-in pack library.
    //
    // Hundreds of original, synthesized sounds organised like FL Studio's
    // Packs folder (Drums, 808s, Instruments, FX, Vocals, Loops...). They are
    // rendered on demand, so the library costs almost nothing until used.
    // (Image-Line's own samples can't be shipped; owners of FL Studio can
    // import their real Packs folder with File ▸ Import FL Studio Packs.)
    // ======================================================================
    // ---------------------------------------------------- extra generators
    FLGen.hardkick = (p, r) => {
        const out = flBuf(p.len || 1.2);
        let phase = 0;
        const lp = flLP(p.lp || 6000);
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const f = p.f0 + (p.f1 - p.f0) * Math.exp(-t / p.sweep) + (p.tail || 0) * Math.exp(-t / 0.25);
            phase += f / FL_SR;
            const amp = t < (p.hold || 0.05) ? 1 : Math.exp(-(t - (p.hold || 0.05)) / p.decay);
            let s = Math.sin(2 * Math.PI * phase) * amp;
            s += (r() * 2 - 1) * (p.click || 0.3) * Math.exp(-t / 0.002);
            s = flDrive(s, p.drive || 6);
            out[i] = lp.p(s);
        }
        return flFades(flNormalize(out), 0.3, 25);
    };
    FLGen.brush = (p, r) => {
        const out = flBuf(p.len || 0.6);
        const bp = flBP(p.bp || 3500, 0.7);
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const swish = Math.min(1, t / (p.attack || 0.06)) * Math.exp(-t / (p.decay || 0.25));
            const tap = Math.exp(-t / 0.01) * (p.tap || 0.5);
            out[i] = bp.p(r() * 2 - 1) * (swish + tap);
        }
        return flFades(flTrimSilence(flNormalize(out)), 1, 20);
    };
    FLGen.guiro = (p, r) => {
        const out = flBuf(p.len || 0.45);
        const bp = flBP(p.bp || 3000, 2);
        const scrapes = p.scrapes || 9;
        const span = p.span || 0.3;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            let env = 0;
            for (let k = 0; k < scrapes; k++) {
                const at = k * span / scrapes;
                if (t >= at)
                    env = Math.max(env, Math.exp(-(t - at) / 0.008));
            }
            out[i] = bp.p(r() * 2 - 1) * env * Math.exp(-t / 0.4);
        }
        return flFades(flTrimSilence(flNormalize(out)), 0.3, 10);
    };
    FLGen.logdrum = (p, r) => {
        const out = flBuf(p.len || 0.9);
        const f = p.f || 65.406;
        let phase = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const freq = f * (1 + (p.drop || 0.6) * Math.exp(-t / 0.018));
            phase += freq / FL_SR;
            let s = Math.sin(2 * Math.PI * phase) + 0.25 * Math.sin(4 * Math.PI * phase);
            s *= Math.exp(-t / (p.decay || 0.35)) * Math.min(1, t / 0.002);
            out[i] = flDrive(s, p.drive || 1.5);
        }
        return flFades(flNormalize(out), 0.2, 30);
    };
    FLGen.drop = (p, r) => {
        const out = flBuf(p.len || 0.25);
        let phase = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const f = p.f0 * Math.pow(p.f1 / p.f0, Math.min(1, t / (p.glide || 0.06)));
            phase += f / FL_SR;
            out[i] = Math.sin(2 * Math.PI * phase) * Math.exp(-t / (p.decay || 0.05)) * Math.min(1, t / 0.001);
        }
        return flFades(flNormalize(out), 0.1, 10);
    };
    FLGen.whoosh = (p, r) => {
        const len = p.len || 1.5;
        const out = flBuf(len);
        const bp = flBP(p.f0 || 400, p.q || 1.5);
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const x = t / len;
            const shape = Math.sin(Math.PI * Math.pow(x, p.skew || 0.6));
            if ((i & 31) == 0)
                bp.set((p.f0 || 400) * Math.pow((p.f1 || 6000) / (p.f0 || 400), shape));
            out[i] = bp.p(r() * 2 - 1) * shape * shape;
        }
        return flNormalize(out);
    };
    FLGen.wind = (p, r) => {
        const len = p.len || 5;
        const out = flBuf(len);
        const lp = flLP(800, 2);
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            if ((i & 63) == 0)
                lp.set((p.base || 500) * Math.pow(3, 0.5 + 0.5 * Math.sin(2 * Math.PI * (p.rate || 0.23) * t + Math.sin(t * 0.7))));
            out[i] = lp.p(r() * 2 - 1);
        }
        return flFades(flNormalize(out, 0.7), 200, 300);
    };
    // Additive tone with a chord of fundamentals (semitone offsets).
    FLGen.chordAdd = (p, r) => {
        const parts = [];
        for (const semis of p.chord) {
            const f = (p.f || 261.63) * Math.pow(2, semis / 12);
            parts.push(FLGen.additive(Object.assign({}, p, { f, chord: undefined }), r));
        }
        const out = flBuf(p.len || 2);
        for (const part of parts)
            for (let i = 0; i < Math.min(out.length, part.length); i++)
                out[i] += part[i];
        return flFades(flNormalize(out), 0.1, 30);
    };
    // Vowel formant tables [F1, F2, F3] (adult male); scaled up for "female".
    const FL_VOWELS = { a: [800, 1150, 2900], e: [480, 1720, 2520], i: [300, 2200, 2960], o: [480, 820, 2600], u: [330, 760, 2600], ae: [660, 1720, 2410], er: [490, 1350, 1690] };
    FLGen.vowel = (p, r) => {
        const len = p.len || 1;
        const out = flBuf(len);
        const scale = p.female ? 1.18 : 1;
        const seq = p.seq.map(v => FL_VOWELS[v].map(f => f * scale));
        const filters = [flBP(seq[0][0], 6), flBP(seq[0][1], 8), flBP(seq[0][2], 9)];
        const gains = [1, 0.55, 0.3];
        let phase = 0;
        const f0 = p.f || 196;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const x = Math.min(0.999, t / len) * (seq.length - 1);
            const a = Math.floor(x), frac = x - a;
            const b = Math.min(seq.length - 1, a + 1);
            if ((i & 31) == 0) {
                for (let k = 0; k < 3; k++)
                    filters[k].set(seq[a][k] + (seq[b][k] - seq[a][k]) * frac);
            }
            const contour = p.contour ? Math.pow(2, (p.contour[0] + (p.contour[1] - p.contour[0]) * (t / len)) / 12) : 1;
            const vib = 1 + 0.01 * Math.sin(2 * Math.PI * 5.4 * t) * Math.min(1, t / 0.25);
            const dt = f0 * contour * vib / FL_SR;
            phase += dt;
            const src = flSaw(phase, dt) * 0.8 + (r() * 2 - 1) * (p.breath || 0.05);
            let s = 0;
            for (let k = 0; k < 3; k++)
                s += filters[k].p(src) * gains[k];
            const attack = Math.min(1, t / (p.attack || 0.03));
            const release = Math.min(1, Math.max(0, (len - t) / (p.release || 0.08)));
            out[i] = s * attack * release;
        }
        let result = flNormalize(out);
        if (p.verb)
            result = flNormalize(flReverb(result, p.verb, 1.6, 0.9));
        return flFades(result, 0.2, 20);
    };
    // A short melodic phrase rendered with another generator.
    // notes: [[startBeat, lengthBeats, semitones...], ...]
    FLGen.phrase = (p, r) => {
        const beat = 60 / p.bpm;
        const total = (p.beats || 16) * beat;
        const out = new Float32Array(Math.floor(total * FL_SR));
        const voice = p.voice;
        for (const n of p.notes) {
            const start = Math.floor(n[0] * beat * FL_SR);
            const length = n[1] * beat;
            for (const semis of n.slice(2)) {
                const params = Object.assign({}, voice.params, { f: (voice.params.f || 261.63) * Math.pow(2, semis / 12), len: Math.min(length + (voice.tail || 0.15), 6) });
                if (voice.gen == "synth" && !params.decay)
                    params.len = length + 0.05;
                // a decaying voice is inaudible after about seven time constants (-60 dB)
                if (voice.params.decay > 0)
                    params.len = Math.min(params.len, voice.params.decay * 7 + 0.05);
                const rendered = FLGen[voice.gen](params, r);
                const gain = (voice.gain || 0.5) / Math.sqrt(n.length - 1);
                for (let i = 0; i < rendered.length && start + i < out.length; i++)
                    out[start + i] += rendered[i] * gain;
            }
        }
        return flNormalize(out);
    };
    // A drum loop plus an optional bass/melody phrase.
    FLGen.groove = (p, r) => {
        const drums = flRenderLoop(p);
        if (!p.phrase)
            return drums;
        const phrase = FLGen.phrase(Object.assign({ bpm: p.bpm, beats: (p.bars || 1) * 4 }, p.phrase), r);
        const out = new Float32Array(drums.length);
        for (let i = 0; i < out.length; i++)
            out[i] = Math.tanh(drums[i] * 0.85 + (phrase[i] || 0) * (p.phraseGain || 0.5));
        return flNormalize(out);
    };
    // ------------------------------------------------------- variant helper
    // Makes `count` deterministic variations of a parameter set. `spread`
    // maps parameter names to a relative random range (0.2 = ±20%).
    function flVaryParams(base, spread, seed, index) {
        const r = flRng(seed + "#" + index);
        const params = Object.assign({}, base);
        for (const key of Object.keys(spread)) {
            if (typeof params[key] == "number")
                params[key] *= 1 + (r() * 2 - 1) * spread[key];
        }
        return params;
    }
    function flAddVariants(folder, label, gen, base, spread, count, extra = {}) {
        for (let i = 0; i < count; i++) {
            const name = label + " " + String(i + 1).padStart(2, "0");
            flAdd(folder + "/" + name, gen, i == 0 ? Object.assign({}, base) : flVaryParams(base, spread, folder + label, i), extra);
        }
    }
    // ------------------------------------------------- reorganise originals
    // The first library's sounds keep their ids but move into the new folders.
    {
        const moves = [
            ["808 Bass/", "808s/Classic/"], ["808/", "Drum Machines/TR-808/"], ["909/", "Drum Machines/TR-909/"],
            ["Trap/", "Genre Kits/Trap/"], ["Lo-Fi/", "Genre Kits/Lo-Fi/"], ["House/", "Genre Kits/House/"],
            ["Percussion/", "Drums/Percussion/Classic/"], ["Cymbals/", "Drums/Cymbals/Classic/"], ["FX/", "FX/Classic/"],
            ["Instruments/", "Instruments/Classic/"], ["Bass/", "Instruments/Bass/Classic/"], ["Loops/", "Loops/Drum Loops/"],
        ];
        for (const item of flCatalog) {
            for (const [from, to] of moves) {
                if (item.path.startsWith(from)) {
                    item.path = to + item.path.slice(from.length);
                    break;
                }
            }
        }
    }
    // ----------------------------------------------------------------- Drums
    {
    const K = "Drums/Kicks";
    flAddVariants(K, "Kick Punchy", "kick", { f0: 52, f1: 260, sweep: 0.018, decay: 0.3, len: 0.8, click: 0.5, drive: 1.4 }, { f0: 0.12, f1: 0.25, sweep: 0.3, decay: 0.3, click: 0.4, drive: 0.5 }, 8);
    flAddVariants(K, "Kick Deep", "kick", { f0: 44, f1: 140, sweep: 0.03, decay: 0.7, len: 1.5, click: 0.1 }, { f0: 0.1, f1: 0.2, sweep: 0.3, decay: 0.35, click: 0.6 }, 6);
    flAddVariants(K, "Kick Tight", "kick", { f0: 62, f1: 340, sweep: 0.01, decay: 0.12, len: 0.4, click: 0.7, drive: 2 }, { f0: 0.15, f1: 0.2, sweep: 0.3, decay: 0.3, drive: 0.5 }, 6);
    flAddVariants(K, "Kick Acoustic", "kick", { f0: 58, f1: 120, sweep: 0.03, decay: 0.2, len: 0.6, click: 0.9, lp: 3500, dust: 0.02 }, { f0: 0.1, decay: 0.3, click: 0.3, lp: 0.3 }, 5);
    flAddVariants(K, "Kick Techno", "kick", { f0: 48, f1: 230, sweep: 0.03, decay: 0.38, len: 0.9, click: 0.3, drive: 3, lp: 2500 }, { f0: 0.1, f1: 0.2, decay: 0.3, drive: 0.5, lp: 0.4 }, 6);
    flAddVariants(K, "Kick Hardstyle", "hardkick", { f0: 55, f1: 400, sweep: 0.012, decay: 0.32, tail: 30, hold: 0.06, drive: 9, len: 0.9, lp: 7000 }, { f0: 0.1, f1: 0.2, tail: 0.5, drive: 0.4, decay: 0.3 }, 5);
    flAddVariants(K, "Kick Distorted", "hardkick", { f0: 50, f1: 220, sweep: 0.02, decay: 0.25, tail: 0, hold: 0.03, drive: 4, len: 0.6, lp: 5000 }, { f0: 0.1, f1: 0.3, drive: 0.6, decay: 0.3 }, 5);
    flAddVariants(K, "Kick Lo-Fi", "kick", { f0: 50, f1: 160, sweep: 0.02, decay: 0.28, len: 0.7, click: 0.15, drive: 1.5, lp: 1200, crush: 6, dust: 0.04 }, { f0: 0.1, f1: 0.2, decay: 0.3, lp: 0.4 }, 5);
    flAddVariants(K, "Kick Sub", "kick", { f0: 42, f1: 90, sweep: 0.04, decay: 0.9, len: 1.8, click: 0.02 }, { f0: 0.12, decay: 0.3 }, 4);
    flAddVariants(K, "Kick Clicky", "kick", { f0: 56, f1: 500, sweep: 0.006, decay: 0.18, len: 0.5, click: 1.2, drive: 1 }, { f0: 0.12, f1: 0.25, decay: 0.3, click: 0.3 }, 4);
    const S = "Drums/Snares";
    flAddVariants(S, "Snare Tight", "snare", { t1: 210, t2: 360, toneDecay: 0.04, noiseDecay: 0.12, tone: 0.5, snappy: 1.3, noiseHP: 2200 }, { t1: 0.15, t2: 0.15, noiseDecay: 0.3, tone: 0.4, noiseHP: 0.3 }, 6);
    flAddVariants(S, "Snare Fat", "snare", { t1: 160, t2: 280, toneDecay: 0.08, noiseDecay: 0.22, tone: 0.8, snappy: 1.0, noiseHP: 900, drive: 1.5 }, { t1: 0.15, noiseDecay: 0.3, tone: 0.3, drive: 0.5 }, 6);
    flAddVariants(S, "Snare Acoustic", "snare", { t1: 190, t2: 340, toneDecay: 0.07, noiseDecay: 0.26, tone: 0.55, snappy: 1.4, noiseHP: 600, noiseLP: 9000, bp: 4500, verb: 0.15 }, { t1: 0.1, noiseDecay: 0.25, verb: 0.6 }, 6);
    flAddVariants(S, "Snare Piccolo", "snare", { t1: 330, t2: 520, toneDecay: 0.035, noiseDecay: 0.14, tone: 0.5, snappy: 1.2, noiseHP: 2800 }, { t1: 0.1, t2: 0.1, noiseDecay: 0.3 }, 4);
    flAddVariants(S, "Snare Reverb", "snare", { t1: 200, t2: 350, toneDecay: 0.05, noiseDecay: 0.2, tone: 0.5, snappy: 1.3, noiseHP: 1600, verb: 0.55 }, { t1: 0.15, noiseDecay: 0.3, verb: 0.3 }, 5);
    flAddVariants(S, "Snare Lo-Fi", "snare", { t1: 180, t2: 310, toneDecay: 0.06, noiseDecay: 0.15, tone: 0.65, snappy: 1.0, noiseHP: 800, noiseLP: 3800, drive: 1.6 }, { t1: 0.15, noiseLP: 0.3, noiseDecay: 0.3 }, 5);
    flAddVariants(S, "Snare Rim Layer", "snare", { t1: 420, t2: 1600, toneDecay: 0.015, noiseDecay: 0.1, tone: 0.8, snappy: 1.1, noiseHP: 2500 }, { t1: 0.1, noiseDecay: 0.3 }, 3);
    flAddVariants(S, "Snare Brush", "brush", { bp: 3500, attack: 0.05, decay: 0.22, tap: 0.6, len: 0.6 }, { bp: 0.3, attack: 0.4, decay: 0.3 }, 4);
    const CL = "Drums/Claps";
    flAddVariants(CL, "Clap Tight", "clap", { freq: 1300, q: 2.2, tail: 0.09 }, { freq: 0.2, tail: 0.3 }, 5);
    flAddVariants(CL, "Clap Wide", "clap", { freq: 1050, q: 1.4, tail: 0.18, bursts: [0, 0.012, 0.024, 0.038, 0.05] }, { freq: 0.2, tail: 0.3 }, 5);
    flAddVariants(CL, "Clap Reverb", "clap", { freq: 1200, q: 1.8, tail: 0.15, verb: 0.5 }, { freq: 0.2, tail: 0.3, verb: 0.3 }, 5);
    flAddVariants(CL, "Clap Big Room", "clap", { freq: 950, q: 1.2, tail: 0.25, bursts: [0, 0.009, 0.019, 0.03, 0.041, 0.052], verb: 0.4 }, { freq: 0.2, tail: 0.3 }, 4);
    flAddVariants(CL, "Clap Lo-Fi", "clap", { freq: 900, q: 2.5, tail: 0.1 }, { freq: 0.3, tail: 0.3 }, 3);
    const SN = "Drums/Snaps & Rims";
    flAddVariants(SN, "Finger Snap", "noiseHit", { bp: 2500, q: 2.5, hp: 1000, decay: 0.028, len: 0.2 }, { bp: 0.25, decay: 0.3 }, 5);
    flAddVariants(SN, "Rimshot", "tones", { partials: [[460, 1, 0.012], [1700, 0.7, 0.008]], click: 0.7, len: 0.15 }, {}, 1);
    flAdd(SN + "/Rimshot 02", "tones", { partials: [[520, 1, 0.014], [1900, 0.6, 0.009]], click: 0.9, len: 0.15 });
    flAdd(SN + "/Rimshot 03", "tones", { partials: [[380, 1, 0.01], [1450, 0.8, 0.007]], click: 0.5, len: 0.12 });
    flAdd(SN + "/Cross Stick", "tones", { partials: [[1100, 1, 0.03], [2600, 0.5, 0.015]], click: 0.4, len: 0.18 });
    flAdd(SN + "/Stick Click", "tones", { partials: [[2900, 1, 0.012]], click: 0.6, len: 0.08 });
    const H = "Drums/Hats";
    flAddVariants(H, "Closed Hat Crisp", "metal", { decay: 0.035, bp: 11000, hp: 8500, noise: 0.5, tune: 1.3 }, { decay: 0.35, bp: 0.15, tune: 0.15 }, 6);
    flAddVariants(H, "Closed Hat Dark", "metal", { decay: 0.05, bp: 7000, hp: 5000, noise: 0.4, tune: 0.8 }, { decay: 0.3, bp: 0.2, tune: 0.15 }, 5);
    flAddVariants(H, "Closed Hat Analog", "metal", { decay: 0.045, bp: 10000, hp: 7500 }, { decay: 0.3, bp: 0.15, tune: 0.2 }, 5);
    flAddVariants(H, "Closed Hat Noise", "noiseHit", { hp: 6500, lp: 15000, decay: 0.03, len: 0.15 }, { hp: 0.25, decay: 0.35 }, 5);
    flAddVariants(H, "Pedal Hat", "noiseHit", { hp: 5000, lp: 11000, decay: 0.04, attack: 0.006, len: 0.15 }, { hp: 0.2, decay: 0.3 }, 3);
    const OH = "Drums/Open Hats";
    flAddVariants(OH, "Open Hat", "metal", { decay: 0.28, bp: 10000, hp: 7200, noise: 0.5, len: 0.9 }, { decay: 0.35, bp: 0.15, tune: 0.15 }, 6);
    flAddVariants(OH, "Open Hat Long", "metal", { decay: 0.55, bp: 9500, hp: 6800, noise: 0.6, len: 1.4 }, { decay: 0.3, bp: 0.15 }, 4);
    flAddVariants(OH, "Open Hat Trashy", "metal", { decay: 0.3, bp: 7000, q: 0.6, hp: 4000, noise: 0.9, len: 0.9, tune: 0.7 }, { decay: 0.3, tune: 0.2 }, 4);
    const CY = "Drums/Cymbals";
    flAddVariants(CY, "Crash", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.4, fastDecay: 0.05, bp: 7000, q: 0.5, hp: 4000, noise: 0.6, len: 3.0 }, { decay: 0.3, bp: 0.2, tune: 0.15 }, 6);
    flAddVariants(CY, "Ride", "tones", { partials: [[3233, 0.6, 1.4], [5120, 0.5, 1.0], [7310, 0.4, 0.8], [9870, 0.3, 0.5]], click: 0.2, len: 2.2 }, {}, 1);
    flAdd(CY + "/Ride 02", "tones", { partials: [[2950, 0.6, 1.2], [4680, 0.5, 0.9], [6900, 0.35, 0.6], [9300, 0.25, 0.4]], click: 0.25, len: 2.0 });
    flAdd(CY + "/Ride 03", "tones", { partials: [[3520, 0.6, 1.6], [5600, 0.4, 1.1], [8000, 0.35, 0.7]], click: 0.15, len: 2.4 });
    flAdd(CY + "/Ride Bell 02", "tones", { partials: [[1500, 0.8, 1.3], [2980, 0.6, 0.9], [4700, 0.3, 0.5]], click: 0.15, len: 2.2 });
    flAddVariants(CY, "Splash", "metal", { freqs: [449, 667, 828, 1088, 1217, 1660], decay: 0.5, fastDecay: 0.03, bp: 8500, q: 0.6, hp: 5200, noise: 0.6, len: 1.3 }, { decay: 0.3, tune: 0.15 }, 3);
    flAddVariants(CY, "China", "metal", { freqs: [299, 417, 588, 788, 1017, 1260], decay: 1.0, fastDecay: 0.05, bp: 4500, q: 0.7, hp: 2600, noise: 0.9, len: 2.5 }, { decay: 0.3, tune: 0.15 }, 3);
    flAddVariants(CY, "Reverse Cymbal", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.0, bp: 7000, q: 0.5, hp: 4000, noise: 0.6, len: 2.0, reverse: true }, { decay: 0.3, len: 0.3 }, 4);
    const T = "Drums/Toms";
    for (const [label, f, decay] of [["Floor Tom", 82, 0.4], ["Low Tom", 100, 0.35], ["Mid Tom", 140, 0.3], ["High Tom", 190, 0.25], ["Rack Tom", 165, 0.28]]) {
        flAddVariants(T, label, "tom", { f, decay, noise: 0.15, bend: 0.3 }, { f: 0.08, decay: 0.25, bend: 0.4 }, 3);
    }
    flAddVariants(T, "Electro Tom", "tom", { f: 160, decay: 0.3, bend: 1.2, sweep: 0.08, noise: 0.05 }, { f: 0.3, decay: 0.3, bend: 0.3 }, 4);
    flAddVariants(T, "Syn Tom Pew", "pitchFX", { f0: 600, f1: 120, len: 0.35, decay: 0.15, curve: 0.5 }, { f0: 0.3, f1: 0.3, decay: 0.3 }, 3);
    const P = "Drums/Percussion";
    flAddVariants(P, "Conga Open", "tom", { f: 260, decay: 0.18, bend: 0.12, sweep: 0.02 }, { f: 0.15, decay: 0.25 }, 3);
    flAddVariants(P, "Conga Slap", "noiseHit", { bp: 1800, q: 1.5, hp: 600, decay: 0.03, len: 0.15 }, { bp: 0.2, decay: 0.3 }, 2);
    flAddVariants(P, "Bongo", "tom", { f: 420, decay: 0.1, bend: 0.12, sweep: 0.02 }, { f: 0.2, decay: 0.25 }, 4);
    flAddVariants(P, "Timbale", "tones", { partials: [[410, 1, 0.25], [1010, 0.4, 0.12], [2330, 0.2, 0.05]], click: 0.6, len: 0.6 }, {}, 1);
    flAddVariants(P, "Cowbell", "metal", { freqs: [540, 800], decay: 0.22, fastDecay: 0.012, bp: 2600, q: 0.7, hp: 400, len: 0.6 }, { decay: 0.3, tune: 0.15 }, 4);
    flAddVariants(P, "Clave", "tones", { partials: [[2500, 1, 0.025]], len: 0.15 }, {}, 1);
    flAdd(P + "/Clave 02", "tones", { partials: [[2200, 1, 0.03], [5100, 0.2, 0.01]], len: 0.15 });
    flAddVariants(P, "Woodblock", "tones", { partials: [[1050, 1, 0.035], [2650, 0.5, 0.018]], click: 0.3, len: 0.15 }, {}, 1);
    flAdd(P + "/Woodblock 02", "tones", { partials: [[780, 1, 0.04], [2000, 0.5, 0.02]], click: 0.3, len: 0.18 });
    flAdd(P + "/Woodblock 03", "tones", { partials: [[1400, 1, 0.03], [3500, 0.4, 0.015]], click: 0.4, len: 0.12 });
    flAddVariants(P, "Shaker", "noiseHit", { hp: 4500, lp: 12000, decay: 0.045, attack: 0.015, len: 0.18 }, { hp: 0.25, decay: 0.3, attack: 0.4 }, 6);
    flAddVariants(P, "Tambourine", "metal", { freqs: [5400, 7200, 9100, 11200], decay: 0.12, bp: 8000, q: 0.6, hp: 5000, noise: 0.7, len: 0.4 }, { decay: 0.3, tune: 0.1 }, 4);
    flAddVariants(P, "Guiro", "guiro", { bp: 3000, scrapes: 9, span: 0.3, len: 0.45 }, { bp: 0.3, span: 0.3 }, 3);
    flAddVariants(P, "Cabasa", "noiseHit", { hp: 6000, decay: 0.06, attack: 0.01, len: 0.2 }, { hp: 0.2, decay: 0.3 }, 2);
    flAddVariants(P, "Triangle", "tones", { partials: [[2032, 0.8, 1.6], [5230, 0.5, 1.1], [8800, 0.3, 0.7]], len: 2.0 }, {}, 1);
    flAdd(P + "/Triangle Muted", "tones", { partials: [[2032, 0.8, 0.08], [5230, 0.5, 0.05]], len: 0.2 });
    flAddVariants(P, "Agogo", "tones", { partials: [[870, 1, 0.3], [2240, 0.4, 0.15]], click: 0.1, len: 0.6 }, {}, 1);
    flAdd(P + "/Castanets", "noiseHit", { bp: 3200, q: 3, hp: 1500, decay: 0.012, bursts: [0, 0.03], len: 0.12 });
    flAdd(P + "/Djembe Bass", "tom", { f: 85, decay: 0.3, bend: 0.4, noise: 0.2 });
    flAdd(P + "/Djembe Tone", "tom", { f: 240, decay: 0.15, bend: 0.2, noise: 0.2 });
    flAdd(P + "/Djembe Slap", "noiseHit", { bp: 1500, q: 1.2, hp: 500, decay: 0.04, len: 0.2 });
    flAdd(P + "/Cajon Low", "tom", { f: 75, decay: 0.2, bend: 0.3, noise: 0.25 });
    flAdd(P + "/Cajon Snare", "snare", { t1: 230, t2: 400, toneDecay: 0.03, noiseDecay: 0.12, tone: 0.5, snappy: 1.0, noiseHP: 1200, noiseLP: 6000 });
    flAddVariants(P, "Log Drum", "logdrum", { f: 65.406, decay: 0.35, drop: 0.6, drive: 1.5 }, {}, 1, { rootKey: 36 });
    flAdd(P + "/Log Drum Long", "logdrum", { f: 65.406, decay: 0.7, drop: 0.5, drive: 2, len: 1.4 }, { rootKey: 36 });
    flAdd(P + "/Log Drum Bright", "logdrum", { f: 65.406, decay: 0.3, drop: 0.9, drive: 3.5 }, { rootKey: 36 });
    flAddVariants(P, "Water Drop", "drop", { f0: 500, f1: 1800, glide: 0.04, decay: 0.05 }, { f0: 0.3, f1: 0.3, glide: 0.3 }, 4);
    flAdd(P + "/Glass Tink 02", "tones", { partials: [[3100, 1, 0.4], [7900, 0.4, 0.2]], len: 0.8 });
    flAdd(P + "/Metal Clank", "metal", { freqs: [315, 500, 845, 1290], decay: 0.25, fastDecay: 0.015, bp: 2400, q: 0.5, hp: 250, len: 0.7 });
    flAdd(P + "/Click", "tones", { partials: [[4000, 1, 0.003]], click: 0.8, len: 0.04 });
    flAdd(P + "/Pop", "drop", { f0: 300, f1: 900, glide: 0.015, decay: 0.03 });
    flAdd(P + "/Tick", "noiseHit", { hp: 7000, decay: 0.006, len: 0.05 });
    // ------------------------------------------------------------------ 808s
    const B8 = "808s";
    const b808 = (label, params, folder = B8 + "/Tuned C") => flAdd(folder + "/" + label, "bass808", Object.assign({ len: 3 }, params), { rootKey: 36 });
    b808("808 Clean Long", { hold: 0.3, decay: 2.2, len: 4 });
    b808("808 Clean Short", { hold: 0.06, decay: 0.45, len: 1.2 });
    b808("808 Boom", { hold: 0.2, decay: 1.8, drop: 1.8, sweep: 0.04, click: 0.15 });
    b808("808 Knock", { hold: 0.05, decay: 0.8, drop: 3, sweep: 0.015, click: 0.4, drive: 2 });
    b808("808 Warm", { hold: 0.2, decay: 1.6, drive: 1.5, lp: 900 });
    b808("808 Bright", { hold: 0.2, decay: 1.5, drive: 3, lp: 6000 });
    b808("808 Gritty", { hold: 0.2, decay: 1.4, drive: 6, lp: 3000 });
    b808("808 Crushed", { hold: 0.2, decay: 1.4, drive: 12, clip: 0.5, lp: 4500 });
    b808("808 Tape", { hold: 0.2, decay: 1.6, drive: 2.5, lp: 1800 });
    b808("808 Slide", { hold: 0.5, decay: 2.5, drop: 0.5, sweep: 0.2, len: 4 });
    b808("808 Sliding Long", { hold: 0.8, decay: 3.2, drop: 0.9, sweep: 0.35, len: 5 });
    b808("808 Drill", { hold: 0.15, decay: 1.2, drop: 2.6, sweep: 0.05, drive: 4, lp: 3800 });
    b808("808 Mafia", { hold: 0.1, decay: 1.0, drop: 4, sweep: 0.03, drive: 7, clip: 0.6 });
    b808("808 Pluck", { hold: 0.02, decay: 0.3, drop: 2, click: 0.3, len: 0.9 });
    b808("808 Sub Only", { hold: 0.25, decay: 2, drop: 0.3, lp: 300 });
    b808("808 Punchy Hit", { hold: 0.04, decay: 0.6, drop: 5, sweep: 0.012, click: 0.6, drive: 2.5 });
    b808("808 Rumble", { hold: 0.3, decay: 2.4, drive: 3, lp: 600, len: 4 });
    b808("808 Distorted Long", { hold: 0.4, decay: 2.6, drive: 10, clip: 0.65, lp: 4000, len: 4 });
    b808("808 Phonk", { hold: 0.12, decay: 1.1, drop: 3, sweep: 0.025, drive: 9, clip: 0.55, lp: 5000 });
    b808("808 Jersey", { hold: 0.05, decay: 0.5, drop: 4, sweep: 0.02, click: 0.5, drive: 3 });
    // --------------------------------------------------------------- Instruments
    const I = "Instruments";
    const flInstr = (folder, label, gen, params, rootKey = 60, loop = null) => flAdd(I + "/" + folder + "/" + label, gen, Object.assign({ f: CarrotNoteHz(rootKey) }, params), loop ? { rootKey, loop } : { rootKey });
    function CarrotNoteHz(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    // Keys
    const pianoPartials = (bright) => [[1, 1, 2.2], [2, 0.6 * bright, 1.5], [3, 0.35 * bright, 1.0], [4, 0.22 * bright, 0.8], [5, 0.15 * bright, 0.6], [6, 0.1 * bright, 0.45], [7, 0.06 * bright, 0.35], [8, 0.04 * bright, 0.28]];
    flInstr("Keys", "Piano Bright", "additive", { len: 3, inharm: 0.0005, hammer: 0.12, partials: pianoPartials(1.4) });
    flInstr("Keys", "Piano Soft", "additive", { len: 3, inharm: 0.0003, hammer: 0.03, partials: pianoPartials(0.6) });
    flInstr("Keys", "Piano Upright", "additive", { len: 2.4, inharm: 0.0009, hammer: 0.1, partials: pianoPartials(1.1).map(p => [p[0], p[1], p[2] * 0.7]) });
    flInstr("Keys", "Piano Lo-Fi", "additive", { len: 2.4, inharm: 0.0006, hammer: 0.05, vib: 0.003, partials: pianoPartials(0.5) });
    flInstr("Keys", "Piano Low", "additive", { len: 3.5, inharm: 0.0004, hammer: 0.1, partials: pianoPartials(1.2) }, 48);
    flInstr("Keys", "Rhodes", "fm", { ratio: 1, index: 1.4, indexDecay: 0.8, indexFloor: 0.25, ratio2: 14, index2: 0.9, index2Decay: 0.04, decay: 2.2, len: 3 });
    flInstr("Keys", "Wurli", "fm", { ratio: 1, index: 2.4, indexDecay: 0.3, indexFloor: 0.5, decay: 1.4, len: 2.2 });
    flInstr("Keys", "DX Keys", "fm", { ratio: 1, index: 2.2, indexDecay: 0.5, ratio2: 7, index2: 1.6, index2Decay: 0.08, decay: 1.6, len: 2.5 });
    flInstr("Keys", "Organ Jazz", "additive", { len: 2.5, partials: [[0.5, 0.8, 0], [1, 1, 0], [1.5, 0.6, 0], [2, 0.5, 0], [3, 0.3, 0]], vib: 0.004 }, 60, [0.2, 0.9]);
    flInstr("Keys", "Organ Church", "additive", { len: 3, attack: 0.08, partials: [[0.5, 0.7, 0], [1, 1, 0], [2, 0.8, 0], [4, 0.5, 0], [8, 0.3, 0], [3, 0.4, 0]] }, 60, [0.25, 0.9]);
    flInstr("Keys", "Organ Rock", "additive", { len: 2.5, partials: [[1, 1, 0], [2, 0.9, 0], [3, 0.7, 0], [4, 0.5, 0], [6, 0.4, 0], [8, 0.3, 0]], vib: 0.006 }, 60, [0.2, 0.9]);
    flInstr("Keys", "Clavinet", "pluck", { damping: 0.99, len: 0.9, bright: 9000, body: 1800 });
    flInstr("Keys", "Harpsichord", "pluck", { damping: 0.996, len: 1.8, bright: 12000, body: 2500 });
    flInstr("Keys", "Celesta", "additive", { len: 1.6, partials: [[1, 1, 0.9], [4, 0.3, 0.3], [10, 0.08, 0.06]] }, 72);
    flInstr("Keys", "Toy Piano", "additive", { len: 1.2, partials: [[1, 1, 0.5], [3.1, 0.6, 0.25], [6.3, 0.3, 0.1]] }, 72);
    // Mallets & bells
    flInstr("Mallets", "Vibraphone", "additive", { len: 3, vib: 0.008, partials: [[1, 1, 2.0], [4, 0.35, 0.6], [10, 0.1, 0.2]] });
    flInstr("Mallets", "Glockenspiel", "additive", { len: 2.2, partials: [[1, 1, 1.4], [2.7, 0.5, 0.6], [5.4, 0.3, 0.3]] }, 84);
    flInstr("Mallets", "Xylophone", "additive", { len: 0.8, partials: [[1, 1, 0.3], [3, 0.5, 0.12], [6, 0.2, 0.05]] }, 72);
    flInstr("Mallets", "Marimba Soft", "additive", { len: 1.4, partials: [[1, 1, 0.6], [4, 0.3, 0.12]] });
    flInstr("Mallets", "Steel Drum", "additive", { len: 1.6, partials: [[1, 1, 0.9], [2, 0.6, 0.5], [3, 0.3, 0.3], [4.2, 0.25, 0.2], [5.8, 0.12, 0.1]] });
    flInstr("Bells", "Tubular Bell", "additive", { len: 4, partials: [[1, 0.6, 3], [2.76, 1, 2.4], [5.4, 0.6, 1.6], [8.93, 0.4, 1], [13.3, 0.2, 0.6]] });
    flInstr("Bells", "FM Bell", "fm", { ratio: 3.5, index: 3, indexDecay: 1.2, decay: 2.6, len: 3.5 });
    flInstr("Bells", "Glass Bell", "fm", { ratio: 5.19, index: 2, indexDecay: 0.6, decay: 2.2, len: 3 }, 72);
    flInstr("Bells", "Chime", "additive", { len: 3, partials: [[1, 1, 2.2], [2.4, 0.5, 1.3], [5.95, 0.3, 0.6]] }, 72);
    flInstr("Bells", "Bell Pad", "fm", { ratio: 2, index: 1.5, indexDecay: 2, decay: 3.5, attack: 0.15, len: 4 });
    flInstr("Bells", "Trap Bell", "fm", { ratio: 4, index: 2.5, indexDecay: 0.3, decay: 1.2, len: 1.8 }, 72);
    // Plucks
    flInstr("Plucks", "Pluck Bright", "pluck", { damping: 0.994, len: 1.4, bright: 9000 });
    flInstr("Plucks", "Pluck Soft", "pluck", { damping: 0.993, len: 1.2, bright: 2500 });
    flInstr("Plucks", "Pluck Synth", "synth", { len: 0.8, voices: 2, detune: 0.1, filterEnv: [9000, 500, 0.08], decay: 0.4 });
    flInstr("Plucks", "Pluck Square", "synth", { len: 0.8, wave: "square", voices: 1, filterEnv: [7000, 600, 0.07], decay: 0.35 });
    flInstr("Plucks", "Pluck Future", "synth", { len: 0.9, voices: 5, detune: 0.25, filterEnv: [12000, 700, 0.1], decay: 0.45 });
    flInstr("Plucks", "Pluck House", "synth", { len: 0.6, voices: 3, detune: 0.12, chord: [0, 7, 12], filterEnv: [8000, 400, 0.06], decay: 0.25 });
    flInstr("Plucks", "Harp", "pluck", { damping: 0.998, len: 2.5, bright: 5000, body: 700 });
    flInstr("Plucks", "Koto", "pluck", { damping: 0.995, len: 1.8, bright: 7000, body: 1200 });
    flInstr("Plucks", "Kalimba 02", "additive", { len: 1.4, hammer: 0.04, partials: [[1, 1, 0.7], [6.2, 0.2, 0.06]] });
    flInstr("Plucks", "Sitar-ish", "pluck", { damping: 0.997, len: 2.5, bright: 11000, body: 3200 });
    // Guitars
    flInstr("Guitars", "Nylon Guitar", "pluck", { damping: 0.997, len: 2.4, body: 700, bright: 3500 }, 48);
    flInstr("Guitars", "Clean Guitar", "pluck", { damping: 0.998, len: 2.6, body: 1100, bright: 6000 }, 48);
    flInstr("Guitars", "Muted Guitar", "pluck", { damping: 0.97, len: 0.35, body: 900, bright: 3000 }, 48);
    flInstr("Guitars", "Funk Guitar", "pluck", { damping: 0.985, len: 0.5, body: 1600, bright: 8000 }, 52);
    flInstr("Guitars", "Power Chord", "synth", { len: 2, voices: 2, detune: 0.08, chord: [0, 7, 12], cutoff: 2800, drive: 5 }, 40, [0.2, 0.9]);
    flInstr("Guitars", "Distorted Lead", "synth", { len: 2, voices: 2, detune: 0.1, cutoff: 3500, drive: 7, vib: 0.006 }, 52, [0.2, 0.9]);
    // Synth leads
    flInstr("Synth Leads", "Lead Saw", "synth", { len: 2, voices: 3, detune: 0.12, cutoff: 6000 }, 60, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Square", "synth", { len: 2, wave: "square", voices: 2, detune: 0.06, cutoff: 5000 }, 60, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Pulse", "synth", { len: 2, wave: "square", width: 0.2, voices: 1, cutoff: 6000 }, 60, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Supersaw", "synth", { len: 2.2, voices: 9, detune: 0.35, cutoff: 10000 }, 60, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Chip", "synth", { len: 1.5, wave: "square", voices: 1, cutoff: 16000 }, 72, [0.1, 0.9]);
    flInstr("Synth Leads", "Lead Sine", "additive", { len: 2, attack: 0.01, vib: 0.008, partials: [[1, 1, 0], [2, 0.05, 0]] }, 72, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Whistle", "additive", { len: 2, attack: 0.06, vib: 0.01, partials: [[1, 1, 0]] }, 84, [0.25, 0.9]);
    flInstr("Synth Leads", "Lead Hoover", "synth", { len: 2, voices: 7, detune: 0.45, cutoff: 3000, drive: 2, vib: 0.02 }, 48, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Acid", "synth", { len: 0.8, voices: 1, res: 8, filterEnv: [4000, 400, 0.15], decay: 0.6, drive: 2 }, 48);
    flInstr("Synth Leads", "Lead Trance", "synth", { len: 2, voices: 7, detune: 0.25, cutoff: 7000, vib: 0.004 }, 60, [0.2, 0.9]);
    flInstr("Synth Leads", "Lead Brassy", "synth", { len: 1.6, voices: 3, detune: 0.1, filterEnv: [6000, 1800, 0.2], attack: 0.04 }, 60, [0.3, 0.9]);
    flInstr("Synth Leads", "Lead Formant", "vowel", { len: 1.5, seq: ["a", "o"], breath: 0.02 }, 60);
    // Pads
    flInstr("Pads", "Pad Warm", "synth", { len: 4, voices: 6, detune: 0.22, cutoff: 1600, attack: 0.7 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Bright", "synth", { len: 4, voices: 7, detune: 0.3, cutoff: 6000, attack: 0.5 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Dark", "synth", { len: 4, voices: 5, detune: 0.18, cutoff: 700, attack: 0.9 }, 48, [0.3, 0.9]);
    flInstr("Pads", "Pad Sweep", "synth", { len: 4, voices: 6, detune: 0.25, res: 3, lfoCutoff: [400, 4000, 0.25], attack: 0.5 }, 60, [0.0, 1.0]);
    flInstr("Pads", "Pad Square", "synth", { len: 4, wave: "square", voices: 4, detune: 0.15, cutoff: 2200, attack: 0.6 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Choir", "vowel", { len: 3.5, seq: ["a", "a"], attack: 0.5, release: 0.4, breath: 0.08, verb: 0.3 }, 60, [0.3, 0.85]);
    flInstr("Pads", "Pad Glass", "fm", { ratio: 3, index: 1.2, indexDecay: 3, indexFloor: 0.3, attack: 0.6, decay: 0, len: 4 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Organ", "additive", { len: 4, attack: 0.5, partials: [[0.5, 0.5, 0], [1, 1, 0], [2, 0.4, 0], [3, 0.2, 0]] }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Vapor", "synth", { len: 4, voices: 6, detune: 0.4, cutoff: 1200, attack: 0.8, vib: 0.01 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Major Chord", "synth", { len: 4, voices: 3, detune: 0.2, chord: [0, 4, 7, 11], cutoff: 2000, attack: 0.5 }, 60, [0.3, 0.9]);
    flInstr("Pads", "Pad Minor Chord", "synth", { len: 4, voices: 3, detune: 0.2, chord: [0, 3, 7, 10], cutoff: 2000, attack: 0.5 }, 60, [0.3, 0.9]);
    // Strings, brass, winds
    flInstr("Strings", "Strings Ensemble", "synth", { len: 3, voices: 6, detune: 0.14, cutoff: 3000, attack: 0.3, vib: 0.005 }, 60, [0.3, 0.9]);
    flInstr("Strings", "Strings Staccato", "synth", { len: 0.4, voices: 5, detune: 0.12, cutoff: 3500, attack: 0.02, decay: 0.15 }, 60);
    flInstr("Strings", "Cello-ish", "synth", { len: 3, voices: 2, detune: 0.06, cutoff: 1800, attack: 0.15, vib: 0.006 }, 48, [0.3, 0.9]);
    flInstr("Strings", "Violin-ish", "synth", { len: 3, voices: 2, detune: 0.05, cutoff: 4500, attack: 0.12, vib: 0.008 }, 72, [0.3, 0.9]);
    flInstr("Strings", "Pizzicato 02", "pluck", { damping: 0.978, len: 0.5, bright: 2600, body: 600 });
    flInstr("Brass", "Brass Section", "synth", { len: 2, voices: 4, detune: 0.1, filterEnv: [5000, 1700, 0.15], attack: 0.05 }, 60, [0.3, 0.9]);
    flInstr("Brass", "Brass Stab 02", "synth", { len: 0.8, voices: 4, detune: 0.12, chord: [0, 4, 7], filterEnv: [6000, 1200, 0.1], attack: 0.02, decay: 0.4 });
    flInstr("Brass", "Trumpet-ish", "synth", { len: 1.8, voices: 1, filterEnv: [5500, 2500, 0.1], attack: 0.04, vib: 0.006 }, 72, [0.3, 0.9]);
    flInstr("Brass", "Horn Swell", "synth", { len: 2.5, voices: 2, detune: 0.06, cutoff: 1500, attack: 0.5 }, 60, [0.3, 0.9]);
    flInstr("Winds", "Flute 02", "additive", { len: 2.4, attack: 0.1, vib: 0.008, partials: [[1, 1, 0], [2, 0.12, 0], [3, 0.05, 0]] }, 72, [0.25, 0.9]);
    flInstr("Winds", "Pan Flute", "additive", { len: 2, attack: 0.08, vib: 0.006, partials: [[1, 1, 0], [3, 0.08, 0]] }, 72, [0.25, 0.9]);
    flInstr("Winds", "Clarinet-ish", "synth", { len: 2, wave: "square", voices: 1, cutoff: 2200, attack: 0.05, vib: 0.004 }, 60, [0.25, 0.9]);
    flInstr("Winds", "Oboe-ish", "vowel", { len: 2, seq: ["e", "e"], breath: 0.02 }, 72, [0.25, 0.85]);
    flInstr("Winds", "Ocarina", "additive", { len: 2, attack: 0.05, vib: 0.01, partials: [[1, 1, 0], [2, 0.03, 0]] }, 72, [0.25, 0.9]);
    // Basses
    const BA = I + "/Bass";
    flAdd(BA + "/Sub Sine", "additive", { f: C2, len: 2.5, attack: 0.008, partials: [[1, 1, 0]] }, { rootKey: 36, loop: [0.2, 0.9] });
    flAdd(BA + "/Sub Triangle", "additive", { f: C2, len: 2.5, attack: 0.008, partials: [[1, 1, 0], [3, 0.11, 0], [5, 0.04, 0]] }, { rootKey: 36, loop: [0.2, 0.9] });
    flAdd(BA + "/Saw Bass", "synth", { f: C2, len: 1.6, voices: 1, cutoff: 1800, decay: 1.2 }, { rootKey: 36 });
    flAdd(BA + "/Reese Bass 02", "synth", { f: C2, len: 2.5, voices: 3, detune: 0.3, cutoff: 700, drive: 1.5 }, { rootKey: 36, loop: [0.2, 0.9] });
    flAdd(BA + "/Growl Bass", "fm", { f: C2, ratio: 2, index: 5, indexDecay: 2, indexFloor: 2, decay: 0, len: 2 }, { rootKey: 36, loop: [0.1, 0.9] });
    flAdd(BA + "/Donk Bass", "fm", { f: C2, ratio: 1, index: 4, indexDecay: 0.04, decay: 0.25, len: 0.6 }, { rootKey: 36 });
    flAdd(BA + "/Slap Bass", "pluck", { f: C2, damping: 0.992, len: 1.2, bright: 5000, body: 400 }, { rootKey: 36 });
    flAdd(BA + "/Upright Bass", "pluck", { f: C2, damping: 0.99, len: 1.4, bright: 1200, body: 250 }, { rootKey: 36 });
    flAdd(BA + "/Finger Bass", "pluck", { f: C2, damping: 0.994, len: 1.6, bright: 1800, body: 300 }, { rootKey: 36 });
    flAdd(BA + "/PWM Bass", "synth", { f: C2, len: 1.5, wave: "square", width: 0.3, voices: 2, detune: 0.05, cutoff: 1500, decay: 1 }, { rootKey: 36 });
    flAdd(BA + "/Moog-ish Bass", "synth", { f: C2, len: 1.2, voices: 2, detune: 0.04, res: 2, filterEnv: [2500, 300, 0.12], decay: 0.9, drive: 1 }, { rootKey: 36 });
    flAdd(BA + "/House Organ Bass", "additive", { f: C2, len: 0.8, partials: [[1, 1, 0.4], [2, 0.6, 0.2], [3, 0.3, 0.1]] }, { rootKey: 36 });
    flAdd(BA + "/Wobble Bass 02", "synth", { f: C2, len: 2.5, voices: 2, detune: 0.1, res: 4, lfoCutoff: [180, 2600, 4], drive: 3 }, { rootKey: 36, loop: [0.0, 1.0] });
    flAdd(BA + "/Acid Bass 02", "synth", { f: C2, len: 0.6, voices: 1, res: 9, filterEnv: [3500, 250, 0.09], decay: 0.4, drive: 2 }, { rootKey: 36 });
    // Chords (one-shot stabs, root C)
    const CH = I + "/Chords";
    const chords = [["Major", [0, 4, 7]], ["Minor", [0, 3, 7]], ["Maj7", [0, 4, 7, 11]], ["Min7", [0, 3, 7, 10]], ["Dom7", [0, 4, 7, 10]], ["Sus2", [0, 2, 7]], ["Sus4", [0, 5, 7]], ["Min9", [0, 3, 7, 10, 14]], ["Maj9", [0, 4, 7, 11, 14]], ["Dim", [0, 3, 6]]];
    for (const [name, chord] of chords) {
        flAdd(CH + "/Piano " + name, "chordAdd", { f: C4, chord, len: 2.5, inharm: 0.0004, hammer: 0.05, partials: pianoPartials(0.9) }, { rootKey: 60 });
        flAdd(CH + "/Stab " + name, "synth", { f: C4, len: 0.8, voices: 2, detune: 0.1, chord, filterEnv: [7000, 900, 0.1], decay: 0.35 }, { rootKey: 60 });
    }
    flAdd(CH + "/Organ Chord", "chordAdd", { f: C4, chord: [0, 4, 7], len: 2, partials: [[1, 1, 0], [2, 0.6, 0], [3, 0.3, 0]] }, { rootKey: 60, loop: [0.2, 0.9] });
    flAdd(CH + "/Rhodes Min9", "fm", { f: C4, ratio: 1, index: 1.2, indexDecay: 0.8, indexFloor: 0.2, decay: 2, len: 2.5 }, { rootKey: 60 });
    // ------------------------------------------------------------------ Vocals
    const V = "Vocals";
    const vox = (folder, label, params, rootKey = 55) => flAdd(V + "/" + folder + "/" + label, "vowel", Object.assign({ f: CarrotNoteHz(rootKey) }, params), { rootKey });
    vox("Chops", "Vox Ah", { seq: ["a", "a"], len: 0.45, release: 0.12 });
    vox("Chops", "Vox Oh", { seq: ["o", "o"], len: 0.45, release: 0.12 });
    vox("Chops", "Vox Ee", { seq: ["i", "i"], len: 0.4, release: 0.1 });
    vox("Chops", "Vox Oo", { seq: ["u", "u"], len: 0.45, release: 0.12 });
    vox("Chops", "Vox Yeah", { seq: ["i", "e", "ae", "a"], len: 0.55, contour: [0, -2] });
    vox("Chops", "Vox Hey", { seq: ["e", "e", "i"], len: 0.35, contour: [2, -1], breath: 0.15 });
    vox("Chops", "Vox Woah", { seq: ["u", "o", "a"], len: 0.7, contour: [-1, 1] });
    vox("Chops", "Vox Ay", { seq: ["a", "e", "i"], len: 0.4 });
    vox("Chops", "Vox Ooh Female", { seq: ["u", "u"], len: 0.6, female: true }, 67);
    vox("Chops", "Vox Ah Female", { seq: ["a", "a"], len: 0.5, female: true }, 67);
    vox("Chops", "Vox Eh Female", { seq: ["e", "e"], len: 0.45, female: true }, 67);
    vox("Chops", "Vox Yeah Female", { seq: ["i", "e", "ae", "a"], len: 0.6, female: true, contour: [0, -2] }, 67);
    vox("Chops", "Vox Rise", { seq: ["a", "a"], len: 0.6, contour: [-5, 2] }, 60);
    vox("Chops", "Vox Fall", { seq: ["o", "a"], len: 0.6, contour: [3, -5] }, 60);
    vox("Chops", "Vox Stutter Ah", { seq: ["a", "er", "a"], len: 0.3 });
    vox("Sustains", "Choir Aah Male", { seq: ["a", "a"], len: 2.5, attack: 0.25, release: 0.3, breath: 0.08, verb: 0.25 }, 48);
    vox("Sustains", "Choir Ooh Male", { seq: ["u", "u"], len: 2.5, attack: 0.25, release: 0.3, breath: 0.08, verb: 0.25 }, 48);
    vox("Sustains", "Choir Aah Female", { seq: ["a", "a"], len: 2.5, attack: 0.25, release: 0.3, female: true, breath: 0.08, verb: 0.25 }, 67);
    vox("Sustains", "Choir Ooh Female", { seq: ["u", "u"], len: 2.5, attack: 0.25, release: 0.3, female: true, breath: 0.08, verb: 0.25 }, 67);
    vox("Sustains", "Choir Mmm", { seq: ["u", "u"], len: 2.5, attack: 0.3, release: 0.3, breath: 0.02 }, 55);
    vox("Sustains", "Choir Eeh", { seq: ["i", "i"], len: 2.5, attack: 0.25, release: 0.3, female: true, breath: 0.06, verb: 0.25 }, 67);
    vox("Shouts", "Shout Hey", { seq: ["e", "e"], len: 0.3, breath: 0.4, contour: [3, 0], verb: 0.25 }, 62);
    vox("Shouts", "Shout Ho", { seq: ["o", "o"], len: 0.3, breath: 0.4, contour: [2, -1], verb: 0.25 }, 58);
    vox("Shouts", "Shout Yeah", { seq: ["i", "e", "a"], len: 0.5, breath: 0.35, contour: [4, -3], verb: 0.3 }, 62);
    vox("Shouts", "Shout Uh", { seq: ["er", "er"], len: 0.25, breath: 0.35, contour: [1, -2] }, 52);
    vox("Shouts", "Shout Ah", { seq: ["a", "a"], len: 0.35, breath: 0.35, contour: [2, -2], verb: 0.2 }, 60);
    vox("Shouts", "Crowd Hey", { seq: ["e", "e"], len: 0.4, breath: 0.6, verb: 0.5 }, 60);
    flAdd(V + "/Breaths/Breath In", "whoosh", { f0: 900, f1: 2600, q: 0.8, len: 0.7, skew: 1.2 });
    flAdd(V + "/Breaths/Breath Out", "whoosh", { f0: 2400, f1: 700, q: 0.8, len: 0.6, skew: 0.4 });
    flAdd(V + "/Breaths/Whisper Sh", "noiseHit", { hp: 2500, lp: 8000, decay: 0.3, attack: 0.08, len: 0.6 });
    flAdd(V + "/Breaths/Whisper S", "noiseHit", { hp: 5000, lp: 12000, decay: 0.25, attack: 0.05, len: 0.5 });
    // -------------------------------------------------------------------- FX
    const FXF = "FX";
    for (const len of [2, 4, 8]) {
        flAdd(FXF + "/Risers/Noise Riser " + len + "s", "sweepFX", { f0: 300, f1: 10000, q: 3, len, rise: true });
        flAdd(FXF + "/Risers/Tonal Riser " + len + "s", "sweepFX", { f0: 200, f1: 6000, q: 4, len, rise: true, tone: 0.35, toneRatio: 0.5 });
        flAdd(FXF + "/Downlifters/Downlifter " + len + "s", "sweepFX", { f0: 9000, f1: 200, q: 3, len, rise: false });
    }
    flAdd(FXF + "/Risers/Pitch Riser", "pitchFX", { f0: 110, f1: 1760, len: 4, wave: "saw", curve: 2, hold: 0.95 });
    flAdd(FXF + "/Risers/Snare Roll Riser", "loop", { bpm: 140, steps: 32, bars: 2, lanes: [{ sound: "drums/snares/snare-tight-01", pattern: "x.......x.......x...x...x...x...x.x.x.x.x.x.x.x.xxxxxxxxxxxxxxxx", gain: 1 }] });
    flAdd(FXF + "/Downlifters/Pitch Fall", "pitchFX", { f0: 1200, f1: 60, len: 2, wave: "saw", curve: 0.5, hold: 0.8 });
    flAddVariants(FXF + "/Impacts", "Impact", "impact", { len: 3 }, {}, 1);
    flAdd(FXF + "/Impacts/Impact Boom", "kick", { f0: 32, f1: 120, sweep: 0.08, decay: 1.4, len: 3, click: 0.4, drive: 2 });
    flAdd(FXF + "/Impacts/Impact Noise", "noiseHit", { hp: 200, lp: 9000, decay: 0.6, len: 2.5 });
    flAdd(FXF + "/Impacts/Sub Drop 02", "pitchFX", { f0: 120, f1: 25, len: 2.5, hold: 0.5 });
    flAdd(FXF + "/Impacts/Sub Drop Short", "pitchFX", { f0: 100, f1: 30, len: 1, hold: 0.3 });
    flAdd(FXF + "/Sweeps/Whoosh Up", "whoosh", { f0: 300, f1: 7000, len: 1.2, skew: 1.4 });
    flAdd(FXF + "/Sweeps/Whoosh Down", "whoosh", { f0: 7000, f1: 300, len: 1.2, skew: 0.5 });
    flAdd(FXF + "/Sweeps/Whoosh Pass", "whoosh", { f0: 500, f1: 5000, len: 1.6, skew: 0.8 });
    flAdd(FXF + "/Sweeps/Fast Swish", "whoosh", { f0: 800, f1: 9000, len: 0.4, skew: 0.8 });
    flAdd(FXF + "/Sci-Fi/Laser 02", "pitchFX", { f0: 4500, f1: 300, len: 0.25, wave: "square", curve: 0.4, decay: 0.12 });
    flAdd(FXF + "/Sci-Fi/Blip Up", "pitchFX", { f0: 600, f1: 2400, len: 0.12, wave: "square", decay: 0.08 });
    flAdd(FXF + "/Sci-Fi/Blip Down", "pitchFX", { f0: 2400, f1: 600, len: 0.12, wave: "square", decay: 0.08 });
    flAdd(FXF + "/Sci-Fi/Coin", "pitchFX", { f0: 988, f1: 1319, len: 0.35, wave: "square", curve: 0.01, decay: 0.2 });
    flAdd(FXF + "/Sci-Fi/Power Up", "pitchFX", { f0: 100, f1: 1600, len: 0.8, wave: "saw", curve: 1.5, hold: 0.9 });
    flAdd(FXF + "/Sci-Fi/Glitch", "loop", { bpm: 180, steps: 32, lanes: [{ sound: "fx/sci-fi/blip-up", pattern: "x.x..xx.x...xxx.", gain: 1 }, { sound: "fx/sci-fi/laser-02", pattern: ".x...x...x.x....", gain: 0.6 }] });
    flAdd(FXF + "/Sci-Fi/Wobble Zap", "pitchFX", { f0: 300, f1: 300, len: 0.8, wave: "saw", lfo: 12, lfoDepth: 1, hold: 0.6 });
    flAdd(FXF + "/Sci-Fi/Alarm", "pitchFX", { f0: 900, f1: 900, len: 2, wave: "square", lfo: 2, lfoDepth: 0.3, hold: 0.9 });
    flAdd(FXF + "/Atmosphere/Wind", "wind", { len: 6 });
    flAdd(FXF + "/Atmosphere/Dark Wind", "wind", { len: 6, base: 200, rate: 0.12 });
    flAdd(FXF + "/Atmosphere/Rain-ish", "crackle", { len: 6 });
    flAdd(FXF + "/Atmosphere/White Noise", "noiseHit", { hp: 20, lp: 20000, decay: 100, len: 4 });
    flAdd(FXF + "/Atmosphere/Pink-ish Noise", "noiseHit", { hp: 20, lp: 3000, decay: 100, len: 4 });
    flAdd(FXF + "/Transitions/Tape Stop", "pitchFX", { f0: 220, f1: 20, len: 1, wave: "saw", curve: 2, hold: 0.85 });
    flAdd(FXF + "/Transitions/Reverse Swell", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.6, bp: 6000, q: 0.5, hp: 3000, noise: 0.7, len: 3.0, reverse: true });
    flAdd(FXF + "/Transitions/Scratch", "pitchFX", { f0: 300, f1: 1400, len: 0.3, wave: "saw", lfo: 9, lfoDepth: 1.4, hold: 0.7, drive: 1 });
    flAdd(FXF + "/Transitions/Vinyl Spin Back", "pitchFX", { f0: 2000, f1: 50, len: 0.8, wave: "saw", curve: 0.3, hold: 0.7 });
    flAdd(FXF + "/Hits/Gunshot-ish", "noiseHit", { hp: 300, lp: 6000, decay: 0.12, len: 0.8 });
    flAdd(FXF + "/Hits/Explosion-ish", "impact", { len: 3 }, { key: "fx/hits/explosion" });
    flAdd(FXF + "/Hits/Airhorn 02", "airhorn", {});
    flAdd(FXF + "/Hits/Cash Register-ish", "tones", { partials: [[2637, 1, 0.6], [3520, 0.8, 0.5], [5274, 0.4, 0.3]], click: 0.5, len: 1 });
    // ----------------------------------------------------------------- Loops
    const DL = "Loops/Drum Loops";
    const lp = (bpm, name, lanes, extra = {}) => flAdd(DL + "/" + name, "loop", Object.assign({ bpm, lanes }, extra), { bpm });
    lp(85, "Boom Bap 85 BPM", [
        { sound: "drums/kicks/kick-acoustic-01", pattern: "x.......x.x.....", gain: 1 },
        { sound: "drums/snares/snare-lo-fi-01", pattern: "....x.......x...", gain: 0.9 },
        { sound: "drums/hats/closed-hat-dark-01", pattern: "x.x.x.x.x.x.x.xo", gain: 0.45 },
    ], { swing: 0.15 });
    lp(95, "Boom Bap 95 BPM", [
        { sound: "drums/kicks/kick-punchy-02", pattern: "x.....x...x..x..", gain: 1 },
        { sound: "drums/snares/snare-fat-01", pattern: "....x.......x...", gain: 0.9 },
        { sound: "drums/hats/closed-hat-analog-01", pattern: "x.o.x.o.x.o.x.o.", gain: 0.45 },
    ], { swing: 0.1 });
    lp(80, "Lo-Fi Chill 80 BPM", [
        { sound: "drums/kicks/kick-lo-fi-01", pattern: "x......x..x.....", gain: 1 },
        { sound: "drums/snares/snare-lo-fi-02", pattern: "....x.......x...", gain: 0.8 },
        { sound: "drums/percussion/shaker-01", pattern: "..x...x...x...x.", gain: 0.4 },
        { sound: "drums/hats/closed-hat-noise-01", pattern: "x.x.x.x.x.x.x.x.", gain: 0.3 },
    ], { swing: 0.18 });
    lp(140, "Trap 140 BPM 02", [
        { sound: "drums/kicks/kick-punchy-01", pattern: "x......x..x.....x.....x...x.....", gain: 1 },
        { sound: "drums/claps/clap-reverb-01", pattern: "........x...............x.......", gain: 0.8 },
        { sound: "drums/hats/closed-hat-crisp-01", pattern: "x.x.x.x.xxx.x.x.x.x.x.x.x.xxxxx.", gain: 0.4 },
    ], { steps: 32 });
    lp(150, "Trap 150 BPM Triplets", [
        { sound: "drums/kicks/kick-deep-01", pattern: "x.........x.............x.......", gain: 1 },
        { sound: "drums/snares/snare-tight-02", pattern: "........x...............x.......", gain: 0.85 },
        { sound: "drums/hats/closed-hat-crisp-03", pattern: "x.x.x.x.x.x.xxxxx.x.x.x.x.xxx.x.", gain: 0.4 },
        { sound: "drums/open-hats/open-hat-01", pattern: "..............x...............x.", gain: 0.35 },
    ], { steps: 32 });
    lp(142, "Drill 142 BPM", [
        { sound: "drums/kicks/kick-tight-01", pattern: "x.........x.......x.............", gain: 1 },
        { sound: "drums/snares/snare-tight-03", pattern: "............x...............x...", gain: 0.85 },
        { sound: "drums/hats/closed-hat-crisp-02", pattern: "x..x..x.x..x..x.x..x..x.x.x..x..", gain: 0.4 },
        { sound: "drums/percussion/shaker-02", pattern: "..x...x...x...x...x...x...x...x.", gain: 0.25 },
    ], { steps: 32 });
    lp(130, "Phonk 130 BPM", [
        { sound: "808s/tuned-c/808-phonk", pattern: "x.....x...x.....x.....x.x.......", gain: 0.8 },
        { sound: "drums/snaps-rims/finger-snap-01", pattern: "........x...............x.......", gain: 0.8 },
        { sound: "drums/percussion/cowbell-01", pattern: "x.x...x.x.x...x.x.x...x.x.x...x.", gain: 0.35 },
        { sound: "drums/hats/closed-hat-crisp-04", pattern: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", gain: 0.3 },
    ], { steps: 32 });
    lp(124, "House 124 BPM 02", [
        { sound: "drums/kicks/kick-punchy-03", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/claps/clap-wide-01", pattern: "....x.......x...", gain: 0.7 },
        { sound: "drums/open-hats/open-hat-02", pattern: "..x...x...x...x.", gain: 0.45 },
        { sound: "drums/percussion/shaker-03", pattern: "xoxoxoxoxoxoxoxo", gain: 0.3 },
    ]);
    lp(128, "Tech House 128 BPM", [
        { sound: "drums/kicks/kick-techno-01", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/snaps-rims/rimshot-02", pattern: "......x.....x..x", gain: 0.5 },
        { sound: "drums/hats/closed-hat-analog-02", pattern: "..x...x...x...x.", gain: 0.5 },
        { sound: "drums/percussion/bongo-01", pattern: "...x.....x.x....", gain: 0.4 },
    ]);
    lp(130, "Techno 130 BPM", [
        { sound: "drums/kicks/kick-techno-02", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/hats/closed-hat-noise-02", pattern: "..x...x...x...x.", gain: 0.5 },
        { sound: "drums/open-hats/open-hat-trashy-01", pattern: "..x...x...x...x.", gain: 0.3 },
        { sound: "drums/claps/clap-tight-02", pattern: "....x.......x...", gain: 0.5 },
    ]);
    lp(174, "Drum & Bass 174 BPM", [
        { sound: "drums/kicks/kick-punchy-04", pattern: "x.........x.....x.........x.....", gain: 1 },
        { sound: "drums/snares/snare-tight-04", pattern: "....x.......x.......x.......x...", gain: 0.9 },
        { sound: "drums/hats/closed-hat-crisp-05", pattern: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", gain: 0.35 },
    ], { bars: 2 });
    lp(132, "UK Garage 132 BPM", [
        { sound: "drums/kicks/kick-punchy-05", pattern: "x.......x.x.....", gain: 1 },
        { sound: "drums/snares/snare-tight-05", pattern: "....x.......x...", gain: 0.8 },
        { sound: "drums/hats/closed-hat-crisp-06", pattern: "..x..xx...x..xx.", gain: 0.45 },
    ], { swing: 0.2 });
    lp(95, "Reggaeton 95 BPM", [
        { sound: "drums/kicks/kick-punchy-06", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/snares/snare-rim-layer-01", pattern: "...x..x....x..x.", gain: 0.8 },
        { sound: "drums/hats/closed-hat-analog-03", pattern: "x.x.x.x.x.x.x.x.", gain: 0.3 },
    ]);
    lp(105, "Afrobeats 105 BPM", [
        { sound: "drums/kicks/kick-deep-02", pattern: "x.....x...x.....", gain: 1 },
        { sound: "drums/snaps-rims/rimshot-03", pattern: "...x..x....x..x.", gain: 0.6 },
        { sound: "drums/percussion/shaker-04", pattern: "xoxxxoxxxoxxxoxx", gain: 0.35 },
        { sound: "drums/percussion/conga-open-01", pattern: "......x.x.....x.", gain: 0.5 },
    ]);
    lp(112, "Amapiano 112 BPM", [
        { sound: "drums/kicks/kick-deep-03", pattern: "x...x...x...x...", gain: 0.9 },
        { sound: "drums/percussion/log-drum-01", pattern: "..x....x..x...x.", gain: 0.8 },
        { sound: "drums/percussion/shaker-05", pattern: "xoxoxoxoxoxoxoxo", gain: 0.35 },
        { sound: "drums/claps/clap-tight-03", pattern: "....x.......x...", gain: 0.5 },
    ]);
    lp(100, "Funk 100 BPM", [
        { sound: "drums/kicks/kick-acoustic-02", pattern: "x..x..x...x..x..", gain: 1 },
        { sound: "drums/snares/snare-acoustic-01", pattern: "....x..o.o..x...", gain: 0.85 },
        { sound: "drums/hats/closed-hat-analog-04", pattern: "xxxxxxxxxxxxxxxx", gain: 0.3 },
    ]);
    lp(120, "Disco 120 BPM", [
        { sound: "drums/kicks/kick-punchy-07", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/snares/snare-acoustic-02", pattern: "....x.......x...", gain: 0.8 },
        { sound: "drums/open-hats/open-hat-03", pattern: "..x...x...x...x.", gain: 0.5 },
    ]);
    lp(150, "Hardstyle 150 BPM", [
        { sound: "drums/kicks/kick-hardstyle-01", pattern: "x...x...x...x...", gain: 1 },
        { sound: "drums/claps/clap-big-room-01", pattern: "....x.......x...", gain: 0.6 },
        { sound: "drums/hats/closed-hat-crisp-03", pattern: "..x...x...x...x.", gain: 0.4 },
    ]);
    lp(160, "Breakcore 160 BPM", [
        { sound: "drums/kicks/kick-tight-02", pattern: "x.x...x...xx..x.x...x.x...x..x..", gain: 1 },
        { sound: "drums/snares/snare-tight-06", pattern: "....x..x.x..x.xx....x..x.x.xx..x", gain: 0.8 },
        { sound: "drums/cymbals/ride-01", pattern: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", gain: 0.3 },
    ], { bars: 2 });
    const PL = "Loops/Percussion Loops";
    flAdd(PL + "/Shaker Loop 120", "loop", { bpm: 120, lanes: [{ sound: "drums/percussion/shaker-01", pattern: "xoxoxoxoxoxoxoxo", gain: 1 }] }, { bpm: 120 });
    flAdd(PL + "/Conga Loop 110", "loop", { bpm: 110, lanes: [{ sound: "drums/percussion/conga-open-01", pattern: "..x.x...x..x.x..", gain: 1 }, { sound: "drums/percussion/conga-slap-01", pattern: "x.....x.....x...", gain: 0.7 }] }, { bpm: 110 });
    flAdd(PL + "/Bongo Loop 100", "loop", { bpm: 100, lanes: [{ sound: "drums/percussion/bongo-01", pattern: "x.xx..x.x.xx..x.", gain: 1 }, { sound: "drums/percussion/bongo-02", pattern: "...x.x.....x.x..", gain: 0.8 }] }, { bpm: 100 });
    flAdd(PL + "/Hat Roll Loop 140", "loop", { bpm: 140, steps: 32, lanes: [{ sound: "drums/hats/closed-hat-crisp-01", pattern: "x.x.x.x.xxxxx.x.x.x.x.xxx.x.xxxx", gain: 1 }] }, { bpm: 140 });
    flAdd(PL + "/Tambourine Loop 120", "loop", { bpm: 120, lanes: [{ sound: "drums/percussion/tambourine-01", pattern: "..x...x...x...x.", gain: 1 }, { sound: "drums/percussion/tambourine-02", pattern: "x.o.x.o.x.o.x.o.", gain: 0.4 }] }, { bpm: 120 });
    const ML = "Loops/Melodic Loops";
    const bassVoice = { gen: "pluck", params: { f: C2, damping: 0.993, bright: 1500 }, tail: 0.2, gain: 0.9 };
    const keysVoice = { gen: "fm", params: { f: C4, ratio: 1, index: 1.4, indexDecay: 0.8, indexFloor: 0.25, decay: 2, len: 2 }, tail: 0.4, gain: 0.5 };
    const pluckVoice = { gen: "synth", params: { f: C4, voices: 2, detune: 0.1, filterEnv: [9000, 500, 0.08], decay: 0.3 }, tail: 0.3, gain: 0.5 };
    const padVoice = { gen: "synth", params: { f: C4, voices: 4, detune: 0.2, cutoff: 1800, attack: 0.3 }, tail: 0.1, gain: 0.5 };
    flAdd(ML + "/Rhodes Chords 85 (C minor)", "phrase", { bpm: 85, beats: 16, voice: keysVoice, notes: [[0, 4, -12, 3, 7, 10], [4, 4, -16, -1, 3, 7], [8, 4, -19, -2, 3, 5], [12, 4, -17, -1, 2, 7]] }, { bpm: 85, rootKey: 60 });
    flAdd(ML + "/Lo-Fi Keys 80 (F major)", "phrase", { bpm: 80, beats: 16, voice: keysVoice, notes: [[0, 4, -7, 4, 9, 12], [4, 4, -10, 2, 5, 9], [8, 4, -3, 4, 7, 12], [12, 4, -5, 2, 5, 11]] }, { bpm: 80, rootKey: 60 });
    flAdd(ML + "/Pluck Arp 128 (A minor)", "phrase", { bpm: 128, beats: 8, voice: pluckVoice, notes: [[0, 0.5, 9], [0.5, 0.5, 12], [1, 0.5, 16], [1.5, 0.5, 12], [2, 0.5, 9], [2.5, 0.5, 12], [3, 0.5, 16], [3.5, 0.5, 19], [4, 0.5, 5], [4.5, 0.5, 9], [5, 0.5, 12], [5.5, 0.5, 9], [6, 0.5, 7], [6.5, 0.5, 11], [7, 0.5, 14], [7.5, 0.5, 11]] }, { bpm: 128, rootKey: 60 });
    flAdd(ML + "/Pad Progression 120 (C major)", "phrase", { bpm: 120, beats: 16, voice: padVoice, notes: [[0, 4, 0, 4, 7], [4, 4, -3, 0, 4], [8, 4, -7, -3, 0], [12, 4, -5, -1, 2]] }, { bpm: 120, rootKey: 60 });
    flAdd(ML + "/Bassline 124 (G minor)", "phrase", { bpm: 124, beats: 8, voice: bassVoice, notes: [[0, 0.5, 7], [0.75, 0.25, 7], [1.5, 0.5, 19], [2, 0.5, 7], [3, 0.5, 10], [4, 0.5, 3], [4.75, 0.25, 3], [5.5, 0.5, 15], [6, 0.5, 5], [7, 0.5, 10]] }, { bpm: 124, rootKey: 36 });
    flAdd(ML + "/Trap Bells 140 (D minor)", "phrase", { bpm: 140, beats: 16, voice: { gen: "fm", params: { f: C4 * 2, ratio: 4, index: 2.5, indexDecay: 0.3, decay: 1, len: 1 }, tail: 0.6, gain: 0.5 }, notes: [[0, 1, 2], [1, 0.5, 5], [1.5, 0.5, 9], [2, 1, 7], [3, 1, 5], [4, 1.5, 2], [6, 1, 0], [7, 1, 2], [8, 1, 2], [9, 0.5, 5], [9.5, 0.5, 9], [10, 1, 10], [11, 1, 9], [12, 2, 5], [14, 2, 2]] }, { bpm: 140, rootKey: 72 });
    const GL = "Loops/Full Grooves";
    flAdd(GL + "/Boom Bap Groove 90", "groove", { bpm: 90, swing: 0.12, lanes: [
            { sound: "drums/kicks/kick-acoustic-01", pattern: "x.....x...x.....", gain: 1 },
            { sound: "drums/snares/snare-lo-fi-01", pattern: "....x.......x...", gain: 0.9 },
            { sound: "drums/hats/closed-hat-dark-01", pattern: "x.o.x.o.x.o.x.oo", gain: 0.4 },
        ], phrase: { voice: bassVoice, notes: [[0, 0.75, 0], [1.5, 0.5, 0], [2.5, 1, 3], [3.5, 0.5, -2]] }, phraseGain: 0.6 }, { bpm: 90 });
    flAdd(GL + "/House Groove 124", "groove", { bpm: 124, lanes: [
            { sound: "drums/kicks/kick-punchy-03", pattern: "x...x...x...x...", gain: 1 },
            { sound: "drums/claps/clap-wide-01", pattern: "....x.......x...", gain: 0.7 },
            { sound: "drums/open-hats/open-hat-02", pattern: "..x...x...x...x.", gain: 0.45 },
        ], phrase: { voice: bassVoice, notes: [[0.5, 0.4, 0], [1.5, 0.4, 0], [2.5, 0.4, 12], [3.5, 0.4, 10]] }, phraseGain: 0.6 }, { bpm: 124 });
    // --------------------------------------------------------- more FPC kits
    flKits.push({ name: "Boom Bap Kit", pads: [["drums/kicks/kick-acoustic-01", 0], ["drums/snares/snare-lo-fi-01", 0], ["drums/claps/clap-lo-fi-01", 0], ["drums/hats/closed-hat-dark-01", 1], ["drums/open-hats/open-hat-01", 1], ["drums/snaps-rims/rimshot-01", 0], ["drums/percussion/shaker-01", 0], ["drums/percussion/tambourine-01", 0], ["drums/kicks/kick-lo-fi-01", 0], ["drums/snares/snare-fat-01", 0], ["drums/cymbals/crash-01", 0], ["fx/vinyl-crackle", 0]] });
    flKits.push({ name: "Drill Kit", pads: [["drums/kicks/kick-tight-01", 0], ["drums/snares/snare-tight-03", 0], ["drums/claps/clap-reverb-01", 0], ["drums/hats/closed-hat-crisp-02", 1], ["drums/open-hats/open-hat-01", 1], ["drums/hats/closed-hat-crisp-01", 1], ["808s/tuned-c/808-drill", 0], ["drums/snaps-rims/finger-snap-01", 0], ["drums/percussion/shaker-02", 0], ["drums/percussion/woodblock-02", 0], ["drums/cymbals/crash-02", 0], ["fx/sci-fi/blip-up", 0]] });
    flKits.push({ name: "Techno Kit", pads: [["drums/kicks/kick-techno-01", 0], ["drums/snares/snare-tight-01", 0], ["drums/claps/clap-tight-02", 0], ["drums/hats/closed-hat-noise-02", 1], ["drums/open-hats/open-hat-trashy-01", 1], ["drums/hats/closed-hat-analog-02", 1], ["drums/snaps-rims/rimshot-02", 0], ["drums/percussion/cowbell-02", 0], ["drums/toms/electro-tom-01", 0], ["drums/toms/electro-tom-02", 0], ["drums/cymbals/ride-01", 0], ["drums/cymbals/crash-03", 0]] });
    flKits.push({ name: "Drum & Bass Kit", pads: [["drums/kicks/kick-punchy-04", 0], ["drums/snares/snare-tight-04", 0], ["drums/snares/snare-reverb-01", 0], ["drums/hats/closed-hat-crisp-05", 1], ["drums/open-hats/open-hat-02", 1], ["drums/cymbals/ride-02", 0], ["drums/snaps-rims/rimshot-03", 0], ["drums/percussion/shaker-03", 0], ["drums/toms/high-tom-01", 0], ["drums/toms/low-tom-01", 0], ["drums/cymbals/crash-04", 0], ["drums/cymbals/china-01", 0]] });
    flKits.push({ name: "Acoustic Kit", pads: [["drums/kicks/kick-acoustic-01", 0], ["drums/snares/snare-acoustic-01", 0], ["drums/snaps-rims/cross-stick", 0], ["drums/hats/closed-hat-analog-01", 1], ["drums/open-hats/open-hat-01", 1], ["drums/hats/pedal-hat-01", 1], ["drums/toms/floor-tom-01", 0], ["drums/toms/mid-tom-01", 0], ["drums/toms/high-tom-01", 0], ["drums/cymbals/ride-01", 0], ["drums/cymbals/crash-01", 0], ["drums/cymbals/splash-01", 0]] });
    flKits.push({ name: "Afro / Amapiano Kit", pads: [["drums/kicks/kick-deep-02", 0], ["drums/snaps-rims/rimshot-03", 0], ["drums/claps/clap-tight-03", 0], ["drums/percussion/shaker-04", 0], ["drums/percussion/shaker-05", 0], ["drums/percussion/log-drum-01", 0], ["drums/percussion/conga-open-01", 0], ["drums/percussion/conga-slap-01", 0], ["drums/percussion/bongo-01", 0], ["drums/percussion/djembe-tone", 0], ["drums/percussion/cowbell-03", 0], ["drums/percussion/woodblock-01", 0]] });
    flKits.push({ name: "Phonk Kit", pads: [["808s/tuned-c/808-phonk", 0], ["drums/snaps-rims/finger-snap-01", 0], ["drums/claps/clap-lo-fi-01", 0], ["drums/hats/closed-hat-crisp-04", 1], ["drums/open-hats/open-hat-trashy-02", 1], ["drums/percussion/cowbell-01", 0], ["drums/percussion/cowbell-04", 0], ["drums/kicks/kick-distorted-01", 0], ["drums/snares/snare-lo-fi-03", 0], ["vocals/shouts/shout-uh", 0], ["fx/hits/airhorn-02", 0], ["drums/cymbals/crash-05", 0]] });
    flKits.push({ name: "Hardstyle Kit", pads: [["drums/kicks/kick-hardstyle-01", 0], ["drums/snares/snare-reverb-02", 0], ["drums/claps/clap-big-room-01", 0], ["drums/hats/closed-hat-crisp-03", 1], ["drums/open-hats/open-hat-long-01", 1], ["drums/kicks/kick-hardstyle-02", 0], ["drums/kicks/kick-distorted-02", 0], ["fx/impacts/impact-boom", 0], ["fx/risers/noise-riser-2s", 0], ["fx/sweeps/fast-swish", 0], ["drums/cymbals/crash-06", 0], ["vocals/shouts/shout-hey", 0]] });
    flKits.push({ name: "Vocal Chop Kit", pads: [["vocals/chops/vox-ah", 0], ["vocals/chops/vox-oh", 0], ["vocals/chops/vox-ee", 0], ["vocals/chops/vox-oo", 0], ["vocals/chops/vox-yeah", 0], ["vocals/chops/vox-hey", 0], ["vocals/chops/vox-woah", 0], ["vocals/chops/vox-ay", 0], ["vocals/chops/vox-ooh-female", 0], ["vocals/chops/vox-ah-female", 0], ["vocals/chops/vox-rise", 0], ["vocals/chops/vox-fall", 0]] });
    flKits.push({ name: "FX Kit", pads: [["fx/impacts/impact-01", 0], ["fx/impacts/sub-drop-02", 0], ["fx/risers/noise-riser-2s", 0], ["fx/downlifters/downlifter-2s", 0], ["fx/sweeps/whoosh-up", 0], ["fx/sweeps/whoosh-down", 0], ["fx/sci-fi/laser-02", 0], ["fx/sci-fi/coin", 0], ["fx/transitions/tape-stop", 0], ["fx/transitions/scratch", 0], ["fx/hits/airhorn-02", 0], ["fx/transitions/reverse-swell", 0]] });
    }
