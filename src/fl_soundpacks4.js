    // ======================================================================
    // CarrotBox: Sound Library 4.
    //  - Every genre folder (the 66 genre packs of Sound Libraries 2 and 3
    //    and the classic Genre Kits) gets Plucks, Leads and Synths folders
    //    with two sounds each, voiced for that genre, and two more basses.
    //  - Packs/Essentials: 75 new sounds of every sound type, from kicks to
    //    melodic loops. Each one is a named character (an archetype with a
    //    treatment, like "Kick 909 Saturated"), not a random variant.
    // Like the other libraries everything is synthesized on demand.
    // ======================================================================
    // Renders another generator, then processes the result: filters, drive,
    // crushing, tremolo, chorus, echo, reverb, reverse and a length gate.
    // It lets one recipe come in several finished characters.
    FLGen.post = (p, r) => {
        let pcm = FLGen[p.gen](p.params, r);
        const fx = p.fx || {};
        if (!pcm || pcm.length < 2)
            return flBuf(0.05);
        pcm = pcm.slice();
        if (fx.gate && pcm.length > fx.gate * FL_SR) {
            const keep = Math.floor(fx.gate * FL_SR), fade = Math.floor(0.02 * FL_SR);
            for (let i = Math.max(0, keep - fade); i < keep; i++)
                pcm[i] *= (keep - i) / fade;
            pcm = pcm.slice(0, keep);
        }
        if (fx.hp)
            flHP(fx.hp, fx.hpQ || 0.71).run(pcm);
        if (fx.lp)
            flLP(fx.lp, fx.lpQ || 0.71).run(pcm);
        if (fx.drive)
            for (let i = 0; i < pcm.length; i++)
                pcm[i] = flDrive(pcm[i], fx.drive);
        if (fx.crush)
            flCrush(flNormalize(pcm), fx.crush, fx.downsample || 1);
        if (fx.tremolo) {
            const rate = fx.tremRate || 6;
            for (let i = 0; i < pcm.length; i++)
                pcm[i] *= 1 - fx.tremolo * (0.5 - 0.5 * Math.cos(2 * Math.PI * rate * i / FL_SR));
        }
        let result = flNormalize(pcm);
        if (fx.chorus) {
            const copy = result.slice();
            const base = Math.floor(0.013 * FL_SR), depth = 0.0045 * FL_SR;
            for (let i = 0; i < result.length; i++) {
                const x = i - (base + depth * Math.sin(2 * Math.PI * 0.7 * i / FL_SR));
                const i0 = Math.floor(x);
                const v = i0 >= 0 ? copy[i0] + (copy[Math.min(copy.length - 1, i0 + 1)] - copy[i0]) * (x - i0) : 0;
                result[i] = copy[i] * (1 - fx.chorus * 0.5) + v * fx.chorus * 0.5;
            }
        }
        if (fx.echo) {
            const delay = Math.floor((fx.echoTime || 0.25) * FL_SR);
            const extended = new Float32Array(result.length + delay * 3);
            extended.set(result);
            for (let i = delay; i < extended.length; i++)
                extended[i] += extended[i - delay] * (fx.echoFeedback || 0.38) * fx.echo;
            result = extended;
        }
        if (fx.verb)
            result = flReverb(result, fx.verb, fx.verbDecay || 1.8, fx.verbTail || 1.1);
        if (fx.reverse)
            result.reverse();
        return flFades(flTrimSilence(flNormalize(result)), fx.reverse ? 30 : 0.2, fx.reverse ? 6 : 25);
    };
    // Sung syllables for vocal chops: a consonant (a plosive burst, a nasal
    // hum, a fricative hiss, a breath or a liquid glide) into one or more vowels.
    const FL4_CONSONANTS = {
        b: { type: "plosive", bp: 700, voiced: true }, d: { type: "plosive", bp: 2800, voiced: true }, g: { type: "plosive", bp: 1800, voiced: true },
        p: { type: "plosive", bp: 900 }, t: { type: "plosive", bp: 4200 }, k: { type: "plosive", bp: 2200 },
        m: { type: "nasal", f: [280, 1100, 2400] }, n: { type: "nasal", f: [300, 1600, 2600] },
        s: { type: "fricative", hp: 5200, lp: 11000, amp: 0.5 }, sh: { type: "fricative", bp: 2700, q: 1.2, amp: 0.6 }, f: { type: "fricative", hp: 2500, lp: 9000, amp: 0.25 },
        h: { type: "breath" },
        l: { type: "liquid", f: [360, 1300, 2800] }, r: { type: "liquid", f: [420, 1250, 1650] }, w: { type: "liquid", f: [300, 700, 2300] }, y: { type: "liquid", f: [280, 2250, 3000] },
    };
    FLGen.syllable = (p, r) => {
        const len = p.len || 0.5;
        const out = flBuf(len);
        const scale = p.female ? 1.18 : 1;
        const cons = p.cons ? FL4_CONSONANTS[p.cons] : null;
        const vowels = (p.vowels || ["a"]).map(v => FL_VOWELS[v].map(f => f * scale));
        const consLen = !cons ? 0 : cons.type == "plosive" ? 0.03 : cons.type == "liquid" ? 0.05 : cons.type == "nasal" ? 0.07 : 0.085;
        const glide = 0.05;
        const voiceStart = cons && (cons.type == "plosive" || cons.type == "fricative" || cons.type == "breath") ? consLen : 0;
        const f0 = p.f || 196;
        const filters = [flBP(500, 6), flBP(1500, 8), flBP(2500, 9)];
        const breathFilters = [flBP(500, 4), flBP(1500, 5), flBP(2500, 6)];
        const gains = [1, 0.55, 0.3];
        const hum = flLP(380, 1.2);
        const fricA = cons && cons.type == "fricative" ? (cons.bp ? flBP(cons.bp, cons.q || 1.2) : flHP(cons.hp || 4000)) : null;
        const fricB = cons && cons.type == "fricative" && cons.lp ? flLP(cons.lp) : null;
        const burst = cons && cons.type == "plosive" ? flBP(cons.bp, 1.4) : null;
        const vowelSpan = Math.max(0.01, len - consLen);
        let phase = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const vx = Math.max(0, Math.min(0.999, (t - consLen) / vowelSpan)) * (vowels.length - 1);
            const a = Math.floor(vx), fr = vx - a, b = Math.min(vowels.length - 1, a + 1);
            if ((i & 31) == 0) {
                const x = cons && (cons.type == "liquid" || cons.type == "nasal") ? Math.max(0, Math.min(1, (t - consLen) / glide)) : 1;
                for (let k = 0; k < 3; k++) {
                    let f = vowels[a][k] + (vowels[b][k] - vowels[a][k]) * fr;
                    if (x < 1)
                        f = cons.f[k] * scale * (1 - x) + f * x;
                    filters[k].set(f);
                    breathFilters[k].set(f);
                }
            }
            const contour = p.contour ? Math.pow(2, (p.contour[0] + (p.contour[1] - p.contour[0]) * (t / len)) / 12) : 1;
            const vib = 1 + (p.vib == undefined ? 0.01 : p.vib) * Math.sin(2 * Math.PI * 5.4 * t) * Math.min(1, t / 0.25);
            const dt = f0 * contour * vib / FL_SR;
            phase += dt;
            const noise = r() * 2 - 1;
            const src = flSaw(phase, dt) * 0.8 + noise * (p.breath || 0.05);
            let voiced = 0;
            for (let k = 0; k < 3; k++)
                voiced += filters[k].p(src) * gains[k];
            let env = t < voiceStart ? 0 : Math.min(1, (t - voiceStart) / (p.attack || 0.02));
            env *= Math.min(1, Math.max(0, (len - t) / (p.release || 0.08)));
            let s = voiced * env;
            const humming = hum.p(src);
            if (cons) {
                if (cons.type == "nasal" && t < consLen + glide) {
                    const w = Math.max(0, 1 - Math.max(0, t - consLen) / glide);
                    s = s * (1 - w) + humming * 1.6 * w * Math.min(1, t / 0.01);
                }
                else if (cons.type == "plosive") {
                    const tb = t - consLen * 0.6;
                    if (tb >= 0 && tb < 0.035)
                        s += burst.p(noise) * 2.4 * Math.exp(-tb / 0.007);
                    if (cons.voiced && t < consLen)
                        s += humming * 0.3;
                }
                else if (cons.type == "fricative" && t < consLen + 0.03) {
                    let n = fricA.p(noise);
                    if (fricB)
                        n = fricB.p(n);
                    s += n * cons.amp * 2.6 * Math.min(1, t / 0.012) * Math.max(0, Math.min(1, (consLen + 0.03 - t) / 0.035));
                }
                else if (cons.type == "breath" && t < consLen + 0.04) {
                    let n = 0;
                    for (let k = 0; k < 3; k++)
                        n += breathFilters[k].p(noise) * gains[k];
                    s += n * 1.8 * Math.min(1, t / 0.01) * Math.max(0, Math.min(1, (consLen + 0.04 - t) / 0.05));
                }
            }
            out[i] = s;
        }
        let result = flNormalize(out);
        if (p.verb)
            result = flNormalize(flReverb(result, p.verb, p.verbDecay || 1.6, 0.9));
        return flFades(flTrimSilence(result), 0.3, 20);
    };
    {
        const K = FLPackKit;
        const { PK, hz, pad2, merge, jitter, BASS, MELODIC, FXR, PERC } = K;
        const clone = (o) => JSON.parse(JSON.stringify(o));
        // ---------------------------------------------------- new recipes
        // Same shape as the Sound Library 2 recipes: (changes) => [generator, params, extra].
        const tone = (base, extra) => (p) => ["tone2", merge(base, p), extra];
        const PLUCKS = {
            "Bell Pluck": tone({ osc: "fm", ratio: 3.5, index: 2.2, indexDecay: 0.12, decay: 0.5, sustain: 0, len: 1.2, verb: 0.15 }),
            "Dark Pluck": tone({ osc: "saw", voices: 2, detune: 0.08, cutoff: 300, filterEnv: 2500, filterDecay: 0.06, res: 1.2, decay: 0.3, sustain: 0, len: 0.9 }),
            "Future Pluck": tone({ osc: "saw", voices: 7, detune: 0.3, cutoff: 700, filterEnv: 9000, filterDecay: 0.09, decay: 0.4, sustain: 0, len: 1.1, chorus: 0.4, verb: 0.2 }),
            "House Pluck": tone({ osc: "saw", voices: 2, detune: 0.12, chord: [0, 7, 12], cutoff: 500, filterEnv: 7000, filterDecay: 0.05, decay: 0.22, sustain: 0, len: 0.7 }),
            "Trance Pluck": tone({ osc: "saw", voices: 5, detune: 0.2, cutoff: 900, filterEnv: 10000, filterDecay: 0.11, decay: 0.45, sustain: 0.05, len: 1, echo: 0.5, echoTime: 0.17 }),
            "Glass Pluck": tone({ osc: "fm", ratio: 5.19, index: 2.5, indexDecay: 0.15, decay: 0.6, sustain: 0, len: 1.4 }),
            "Chip Pluck": tone({ osc: "square", width: 0.25, decay: 0.18, sustain: 0, len: 0.5, crush: 6 }),
            "Lo-Fi Pluck": tone({ osc: "ks", damping: 0.995, pick: 2000, len: 1.3, crush: 9, chorus: 0.3 }),
            "Mallet Pluck": tone({ osc: "bell", bellPartials: [[1, 1, 0.5], [3.9, 0.35, 0.1], [9.3, 0.1, 0.03]], len: 1.2 }),
            "Synth Pizz": tone({ osc: "saw", voices: 3, detune: 0.1, cutoff: 400, filterEnv: 4500, filterDecay: 0.03, decay: 0.12, sustain: 0, len: 0.45 }),
            "Muted Guitar": tone({ osc: "ks", damping: 0.985, pick: 2500, len: 0.5 }),
            "Water Pluck": tone({ osc: "sine", pitchDrop: 12, pitchTime: 0.012, decay: 0.25, sustain: 0, len: 0.8, verb: 0.2 }),
            "Steel Pluck": tone({ osc: "ks", damping: 0.998, pick: 9000, len: 2.2, drive: 0.5 }),
            "Pizzicato": tone({ osc: "ks", damping: 0.98, pick: 1800, len: 0.6 }),
            "Square Pluck": tone({ osc: "square", width: 0.5, cutoff: 600, filterEnv: 6000, filterDecay: 0.07, decay: 0.3, sustain: 0, len: 0.8 }),
            "Wood Pluck": tone({ osc: "bell", bellPartials: [[1, 1, 0.25], [2.9, 0.5, 0.06], [5.8, 0.2, 0.02]], len: 0.7, noise: 0.08, noiseDecay: 0.01 }),
        };
        const LEADS = {
            "Sine Lead": tone({ osc: "sine", attack: 0.01, vib: 0.15, len: 2, release: 0.15 }, { loop: [0.2, 0.9] }),
            "Whistle Lead": tone({ osc: "sine", attack: 0.06, vib: 0.25, vibRate: 6, noise: 0.015, len: 2, release: 0.15 }, { loop: [0.25, 0.9] }),
            "Glide Lead": tone({ osc: "saw", voices: 2, detune: 0.08, cutoff: 4500, glide: -12, glideTime: 0.09, vib: 0.12, len: 2, release: 0.15 }, { loop: [0.3, 0.9] }),
            "Supersaw Lead": tone({ osc: "saw", voices: 9, detune: 0.28, cutoff: 8000, vib: 0.1, len: 2, chorus: 0.3, release: 0.2 }, { loop: [0.2, 0.9] }),
            "Acid Lead": tone({ osc: "saw", cutoff: 500, filterEnv: 5000, filterDecay: 0.18, res: 8, drive: 2, decay: 0.6, sustain: 0.4, len: 1.2 }),
            "Sync Lead": tone({ osc: "square", width: 0.35, cutoff: 6000, res: 2, filterEnv: 3000, filterDecay: 0.2, drive: 1.5, vib: 0.1, len: 2, release: 0.15 }, { loop: [0.3, 0.9] }),
            "Vowel Lead": (p) => ["vowel", merge({ seq: ["a", "o"], attack: 0.02, len: 1.6, release: 0.15, breath: 0.03 }, p), { loop: [0.3, 0.85] }],
            "Distorted Lead": tone({ osc: "saw", voices: 3, detune: 0.1, cutoff: 5000, drive: 6, vib: 0.12, len: 2, release: 0.15 }, { loop: [0.2, 0.9] }),
            "Bit Lead": tone({ osc: "square", width: 0.5, crush: 5, downsample: 2, vib: 0.15, len: 1.5, release: 0.1 }, { loop: [0.2, 0.9] }),
            "Organ Lead": tone({ osc: "organ", drawbars: [[1, 1], [2, 0.8], [3, 0.6], [4, 0.4]], vib: 0.1, len: 2, drive: 1, release: 0.1 }, { loop: [0.2, 0.9] }),
            "Brass Lead": tone({ osc: "saw", voices: 2, detune: 0.06, cutoff: 1400, filterEnv: 3800, filterDecay: 0.2, attack: 0.03, vib: 0.12, len: 2, release: 0.15 }, { loop: [0.3, 0.9] }),
            "Pan Flute": tone({ osc: "sine", attack: 0.04, vib: 0.1, noise: 0.08, noiseDecay: 0.08, len: 1.6, release: 0.2 }, { loop: [0.3, 0.9] }),
            "Violin Lead": tone({ osc: "saw", voices: 2, detune: 0.05, cutoff: 3500, attack: 0.12, vib: 0.22, vibRate: 5.8, len: 2.2, chorus: 0.2, release: 0.25 }, { loop: [0.3, 0.9] }),
            "Vapor Lead": tone({ osc: "square", width: 0.4, cutoff: 2500, vib: 0.2, vibRate: 0.9, chorus: 0.5, verb: 0.4, len: 2, release: 0.3 }),
            "Guitar Lead": tone({ osc: "saw", cutoff: 4000, drive: 7, vib: 0.2, vibDelay: 0.25, len: 2.2, release: 0.15 }, { loop: [0.3, 0.9] }),
            "Reed Lead": tone({ osc: "square", width: 0.2, cutoff: 1800, res: 1.5, vib: 0.12, len: 2, release: 0.15 }, { loop: [0.3, 0.9] }),
        };
        const SYNTHS = {
            "Poly Synth": tone({ osc: "saw", voices: 4, detune: 0.15, cutoff: 2500, filterEnv: 3000, filterDecay: 0.4, decay: 1, sustain: 0.6, len: 1.8, chorus: 0.4, release: 0.25 }),
            "Juno Stab": tone({ osc: "square", width: 0.4, pwm: 0.2, voices: 2, chord: [0, 4, 7, 11], cutoff: 1500, filterEnv: 4000, filterDecay: 0.15, decay: 0.5, sustain: 0.2, len: 1, chorus: 0.6 }),
            "Rave Stab": tone({ osc: "saw", voices: 5, detune: 0.25, chord: [0, 3, 7, 10], cutoff: 3500, drive: 2, decay: 0.5, sustain: 0.1, len: 0.9 }),
            "Detuned Stab": tone({ osc: "saw", voices: 7, detune: 0.45, chord: [0, 3, 7], cutoff: 2500, filterEnv: 5000, filterDecay: 0.15, decay: 0.4, sustain: 0.2, len: 1 }),
            "Synth Brass": tone({ osc: "saw", voices: 3, detune: 0.1, chord: [0, 7], cutoff: 900, filterEnv: 3500, filterDecay: 0.25, attack: 0.05, len: 1.6, release: 0.2 }, { loop: [0.3, 0.9] }),
            "PWM Synth": tone({ osc: "square", width: 0.5, pwm: 0.3, pwmRate: 0.7, voices: 3, detune: 0.12, cutoff: 3500, len: 2, attack: 0.02, chorus: 0.4, release: 0.25 }, { loop: [0.3, 0.9] }),
            "FM Synth": tone({ osc: "fm", ratio: 2, index: 3, indexDecay: 0.3, indexFloor: 0.8, decay: 1.2, sustain: 0.4, len: 1.8 }),
            "Hyper Synth": tone({ osc: "saw", voices: 9, detune: 0.4, cutoff: 9000, drive: 3, chorus: 0.5, len: 1.6, release: 0.2 }, { loop: [0.2, 0.9] }),
            "Wobble Synth": tone({ osc: "saw", voices: 2, detune: 0.08, cutoff: 600, res: 4, lfoRate: 3, lfoDepth: 4, len: 2 }, { loop: [0, 1] }),
            "Saw Chord": tone({ osc: "saw", voices: 3, detune: 0.15, chord: [0, 4, 7, 12], cutoff: 3000, len: 1.6, release: 0.3 }),
            "Reso Synth": tone({ osc: "saw", cutoff: 700, res: 6, filterEnv: 3000, filterDecay: 0.35, decay: 0.8, sustain: 0.5, len: 1.5 }),
            "Lo-Fi Synth": tone({ osc: "square", width: 0.3, cutoff: 1800, crush: 8, chorus: 0.5, vib: 0.08, vibRate: 0.7, vibDelay: 0, len: 1.8, release: 0.25 }),
            "Glass Synth": tone({ osc: "fm", ratio: 3, index: 1.6, indexDecay: 1, indexFloor: 0.3, attack: 0.05, len: 2, verb: 0.3 }),
            "Organ Synth": tone({ osc: "organ", len: 1.8, chorus: 0.5, release: 0.15 }, { loop: [0.2, 0.9] }),
            "Sweep Synth": tone({ osc: "saw", voices: 4, detune: 0.2, cutoff: 400, res: 2, lfoRate: 0.25, lfoDepth: 3, attack: 0.1, len: 3, release: 0.3 }, { loop: [0.1, 0.95] }),
            "Vowel Synth": (p) => ["vowel", merge({ seq: ["o", "a", "e"], len: 1.8, attack: 0.08, release: 0.3, breath: 0.06, verb: 0.2 }, p), { loop: [0.3, 0.85] }],
        };
        const BASSES = {
            "Moog Bass": tone({ f: hz(36), osc: "saw", voices: 2, detune: 0.03, cutoff: 300, filterEnv: 1800, filterDecay: 0.15, res: 2, decay: 0.6, sustain: 0.5, len: 1.2, drive: 1 }, { rootKey: 36 }),
            "Rubber Bass": tone({ f: hz(36), osc: "sine", pitchDrop: 7, pitchTime: 0.03, decay: 0.4, sustain: 0.3, len: 1, drive: 1.5 }, { rootKey: 36 }),
            "Square Bass": tone({ f: hz(36), osc: "square", width: 0.5, cutoff: 1200, decay: 0.6, sustain: 0.5, len: 1.2, sub: 0.4 }, { rootKey: 36 }),
            "Slap Bass": tone({ f: hz(36), osc: "ks", damping: 0.992, pick: 6000, len: 1.2, drive: 1.2 }, { rootKey: 36 }),
            "Upright Bass": tone({ f: hz(36), osc: "ks", damping: 0.99, pick: 1100, len: 1.4, verb: 0.08 }, { rootKey: 36 }),
            "Growl Bass": tone({ f: hz(36), osc: "fm", ratio: 2, index: 5, indexDecay: 2, indexFloor: 2, len: 2, drive: 3, cutoff: 2500, res: 3, lfoRate: 2, lfoDepth: 2 }, { rootKey: 36, loop: [0.1, 0.95] }),
            "Fuzz Bass": tone({ f: hz(36), osc: "saw", cutoff: 1600, drive: 8, len: 1.3 }, { rootKey: 36 }),
            "Kick Bass": (p) => ["bass808", merge({ hold: 0.05, decay: 0.5, click: 0.5, drop: 4, sweep: 0.015, len: 1, drive: 2 }, p), { rootKey: 36 }],
            "Pluck Sub": tone({ f: hz(36), osc: "sine", decay: 0.5, sustain: 0.2, len: 1, drive: 0.5 }, { rootKey: 36 }),
            "Neuro Bass": tone({ f: hz(36), osc: "saw", voices: 3, detune: 0.3, cutoff: 1500, res: 4, lfoRate: 6, lfoDepth: 3, drive: 4, len: 2 }, { rootKey: 36, loop: [0, 1] }),
            "Dub Bass": tone({ f: hz(36), osc: "sine", sub: 0.3, drive: 0.8, len: 2, decay: 1.2, sustain: 0.6 }, { rootKey: 36, loop: [0.2, 0.9] }),
            "Juno Bass": tone({ f: hz(36), osc: "square", width: 0.4, pwm: 0.15, cutoff: 900, filterEnv: 1500, filterDecay: 0.2, decay: 0.7, sustain: 0.5, len: 1.3, sub: 0.5 }, { rootKey: 36 }),
            "Chip Bass": tone({ f: hz(36), osc: "square", width: 0.25, len: 1.2, release: 0.05, crush: 6 }, { rootKey: 36 }),
        };
        const ALL = Object.assign({}, BASS, MELODIC, PLUCKS, LEADS, SYNTHS, BASSES);
        // A recipe that sets its own pitch (and root key) keeps it; the others play at fallbackF.
        const recipe = (name, mods, fallbackF) => {
            const fn = ALL[name];
            if (!fn)
                throw new Error("Sound Library 4: no recipe " + name);
            const [gen, params, extra] = fn(Object.assign({}, mods || {}));
            if (params.f == undefined && gen != "bass808" && gen != "logdrum")
                params.f = fallbackF;
            return [gen, params, extra];
        };
        // --------------------------------------------- genre synth parts
        // [shown name, recipe, changes] for: pluck, pluck, lead, lead, synth, synth, bass, bass.
        const GENRE_PARTS = {
            "Trap": [["Bell Pluck", "Bell Pluck", { verb: 0.3 }], ["Dark Pluck", "Dark Pluck"], ["Flute Lead", "Flute", { verb: 0.25 }], ["Glide Lead", "Glide Lead"], ["Dark Synth", "Poly Synth", { cutoff: 1400, verb: 0.2 }], ["Choir Synth", "Vowel Synth"], ["808 Glide", "808 Slide", { drop: 2.2, sweep: 0.35 }], ["808 Knock", "808 Punch", { drive: 4 }]],
            "Drill": [["Slide Pluck", "Dark Pluck", { glide: -2, glideTime: 0.05 }], ["Echo Bell", "Bell Pluck", { echo: 0.45, echoTime: 0.21 }], ["Whistle Lead", "Whistle Lead"], ["Violin Lead", "Violin Lead"], ["Strings Synth", "Poly Synth", { cutoff: 1200, attack: 0.2 }], ["Choir Synth", "Vowel Synth", { seq: ["a", "o"] }], ["808 Slide Long", "808 Slide", { hold: 0.4, decay: 3 }], ["808 Drill", "808 Punch", { drive: 5, decay: 1.2 }]],
            "Boom Bap": [["Muted Guitar", "Muted Guitar", { crush: 11 }], ["Dusty Pluck", "Lo-Fi Pluck"], ["Jazz Flute", "Flute", { crush: 11 }], ["Horn Lead", "Brass Lead", { cutoff: 1100 }], ["Dusty Keys", "Tape Keys"], ["Organ Synth", "Organ Synth", { crush: 10 }], ["Upright Bass", "Upright Bass"], ["Dusty Sub", "Pluck Sub", { crush: 10 }]],
            "Lo-Fi": [["Lo-Fi Pluck", "Lo-Fi Pluck"], ["Wood Pluck", "Wood Pluck", { crush: 9 }], ["Tape Flute", "Flute", { crush: 9, vib: 0.25, vibRate: 0.8 }], ["Soft Sine Lead", "Sine Lead", { crush: 10, chorus: 0.4 }], ["Lo-Fi Synth", "Lo-Fi Synth"], ["Tape Chords", "Juno Stab", { crush: 9, cutoff: 1100 }], ["Warm Upright", "Upright Bass", { crush: 10 }], ["Tape Sub", "Dub Bass", { crush: 10 }]],
            "R&B": [["Glass Pluck", "Glass Pluck", { verb: 0.25 }], ["Silk Pluck", "Square Pluck", { cutoff: 900, verb: 0.2 }], ["Smooth Sine Lead", "Sine Lead", { vib: 0.18, verb: 0.25 }], ["Whistle Lead", "Whistle Lead", { verb: 0.3 }], ["Velvet Synth", "Poly Synth", { cutoff: 1800, attack: 0.08 }], ["Glass Synth", "Glass Synth"], ["Sub Glide", "808 Slide", { drive: 0.6 }], ["Round Bass", "Moog Bass", { cutoff: 220 }]],
            "Pop": [["Bright Pluck", "Future Pluck", { voices: 3 }], ["Piano Pluck", "Mallet Pluck"], ["Pop Lead", "Supersaw Lead", { voices: 5 }], ["Sine Lead", "Sine Lead"], ["Pop Synth", "Poly Synth"], ["Chord Synth", "Saw Chord"], ["Pop Bass", "Moog Bass"], ["Pluck Bass", "Pluck Bass", { cutoff: 380 }]],
            "House": [["House Pluck", "House Pluck"], ["Organ Pluck", "Organ Stab", { decay: 0.15, len: 0.5 }], ["Piano Lead", "Mallet Pluck", { len: 1.5 }], ["Saw Lead", "Saw Lead"], ["House Chords", "Juno Stab", { chord: [0, 3, 7, 10] }], ["Organ Synth", "Organ Synth"], ["House Bass", "Juno Bass"], ["Organ Bass", "Organ Bass", { len: 0.6 }]],
            "Deep House": [["Deep Pluck", "Dark Pluck", { verb: 0.25 }], ["Kalimba Pluck", "Kalimba"], ["Deep Lead", "Sine Lead", { chorus: 0.3 }], ["Reed Lead", "Reed Lead", { cutoff: 1300 }], ["Deep Chords", "Juno Stab", { chord: [0, 3, 7, 10, 14], cutoff: 1100 }], ["Pad Synth", "Sweep Synth"], ["Deep Bass", "Dub Bass"], ["Sub Pluck", "Pluck Sub"]],
            "Tech House": [["Tech Pluck", "Synth Pizz", { drive: 1 }], ["Perc Pluck", "Wood Pluck"], ["Acid Lead", "Acid Lead"], ["Stab Lead", "Square Lead", { cutoff: 2500 }], ["Tech Stab", "Rave Stab", { voices: 2, chord: [0, 7] }], ["Reso Synth", "Reso Synth"], ["Rolling Bass", "Moog Bass", { decay: 0.25, sustain: 0.2, len: 0.6 }], ["Tech Bass", "Acid", { res: 4 }]],
            "Techno": [["Techno Pluck", "Dark Pluck", { drive: 1.5 }], ["Metal Pluck", "Glass Pluck", { ratio: 3.7 }], ["Acid Lead", "Acid Lead", { res: 9 }], ["Sync Lead", "Sync Lead"], ["Techno Stab", "Rave Stab", { chord: [0, 3, 7] }], ["Sweep Synth", "Sweep Synth", { lfoRate: 0.5 }], ["Techno Bass", "Moog Bass", { drive: 2 }], ["Rumble Bass", "Dub Bass", { drive: 2 }]],
            "Drum & Bass": [["Liquid Pluck", "Glass Pluck", { verb: 0.3 }], ["Roller Pluck", "Synth Pizz"], ["Liquid Lead", "Sine Lead", { verb: 0.3 }], ["Neuro Lead", "Distorted Lead"], ["Liquid Synth", "Poly Synth", { attack: 0.1 }], ["Reese Synth", "Detuned Stab", { chord: [0] }], ["Neuro Bass", "Neuro Bass"], ["Rolling Sub", "Dub Bass"]],
            "Jungle": [["Jungle Pluck", "Pizzicato", { crush: 10 }], ["Bell Pluck", "Bell Pluck", { crush: 10 }], ["Rave Lead", "Hoover Lead", { voices: 5 }], ["Ragga Lead", "Brass Lead"], ["Rave Stab", "Rave Stab", { crush: 10 }], ["Pad Synth", "Poly Synth", { cutoff: 1500, attack: 0.3 }], ["Jungle Sub", "Dub Bass"], ["Reese Bass", "Reese", { detune: 0.4 }]],
            "Dubstep": [["Laser Pluck", "Bell Pluck", { ratio: 7 }], ["Dark Pluck", "Dark Pluck", { drive: 2 }], ["Screech Lead", "Distorted Lead", { cutoff: 7000 }], ["Wobble Lead", "Wobble Synth", { lfoRate: 6 }], ["Growl Synth", "Wobble Synth"], ["Dark Choir", "Vowel Synth", { seq: ["o", "u"] }], ["Growl Bass", "Growl Bass"], ["Wub Bass", "Wobble", { lfoRate: 2 }]],
            "Future Bass": [["Future Pluck", "Future Pluck"], ["Chop Pluck", "Vowel Lead", { len: 0.35, release: 0.08 }], ["Future Lead", "Supersaw Lead"], ["Vocal Lead", "Vowel Lead", { seq: ["e", "a"] }], ["Future Chords", "Hyper Synth", { chord: [0, 4, 7, 11, 14], drive: 1 }], ["Wobble Chords", "Wobble Synth", { chord: [0, 7, 12] }], ["Future Bass", "Moog Bass", { cutoff: 600 }], ["Sub Bass", "Pluck Sub"]],
            "Phonk": [["Cowbell Pluck", "Bell Pluck", { ratio: 1.48, drive: 3 }], ["Dark Pluck", "Dark Pluck", { crush: 9 }], ["Phonk Lead", "Square Lead", { crush: 9 }], ["Memphis Lead", "Flute", { crush: 8 }], ["Phonk Synth", "Rave Stab", { crush: 9 }], ["Choir Synth", "Vowel Synth", { crush: 9 }], ["808 Phonk", "808 Distorted", { drive: 11 }], ["808 Slide", "808 Slide", { drive: 3 }]],
            "Afrobeats": [["Highlife Pluck", "Steel Pluck"], ["Log Pluck", "Wood Pluck"], ["Flute Lead", "Flute"], ["Whistle Lead", "Whistle Lead"], ["Afro Keys", "Poly Synth", { cutoff: 1600 }], ["Afro Chords", "Juno Stab", { chord: [0, 4, 7] }], ["Afro Bass", "Pluck Sub"], ["Groove Bass", "Moog Bass", { decay: 0.3 }]],
            "Amapiano": [["Piano Pluck", "Mallet Pluck"], ["Kalimba Pluck", "Kalimba"], ["Flute Lead", "Flute"], ["Whistle Lead", "Whistle Lead"], ["Deep Chords", "Juno Stab", { chord: [0, 3, 7, 10, 14] }], ["Pad Synth", "Sweep Synth"], ["Log Bass", "Log Bass", { decay: 0.7 }], ["Log Bass Short", "Log Bass", { decay: 0.35, drive: 3 }]],
            "Reggaeton": [["Dembow Pluck", "Square Pluck"], ["Guitar Pluck", "Steel Pluck"], ["Latin Lead", "Brass Lead"], ["Sine Lead", "Sine Lead"], ["Reggaeton Synth", "Poly Synth"], ["Stab Synth", "Rave Stab", { chord: [0, 3, 7] }], ["808 Reggaeton", "808 Punch"], ["Sub Glide", "808 Slide"]],
            "Jersey Club": [["Bounce Pluck", "Synth Pizz"], ["Bell Pluck", "Bell Pluck"], ["Chop Lead", "Vowel Lead", { len: 0.4 }], ["Square Lead", "Square Lead"], ["Club Stab", "Rave Stab"], ["Chord Synth", "Saw Chord"], ["808 Jersey", "808 Punch", { drop: 4.5 }], ["Kick Bass", "Kick Bass"]],
            "UK Garage": [["Garage Pluck", "Synth Pizz", { chord: [0, 7] }], ["Organ Pluck", "Organ Stab", { decay: 0.15, len: 0.5 }], ["Vocal Lead", "Vowel Lead"], ["Garage Lead", "Reed Lead"], ["Garage Chords", "Juno Stab", { chord: [0, 3, 7, 10] }], ["Organ Synth", "Organ Synth"], ["Garage Bass", "Reese", { cutoff: 900 }], ["Sub Bass", "Pluck Sub"]],
            "Synthwave": [["Retro Pluck", "Square Pluck"], ["Arp Pluck", "Arp Pluck"], ["Retro Lead", "Saw Lead", { chorus: 0.5 }], ["Sync Lead", "Sync Lead"], ["Retro Brass", "Synth Brass"], ["PWM Synth", "PWM Synth"], ["Retro Bass", "Moog Bass"], ["Octave Bass", "Juno Bass"]],
            "Hyperpop": [["Hyper Pluck", "Future Pluck", { drive: 3 }], ["Glitch Pluck", "Chip Pluck"], ["Hyper Lead", "Supersaw Lead", { drive: 3 }], ["Bit Lead", "Bit Lead"], ["Hyper Synth", "Hyper Synth"], ["Glass Synth", "Glass Synth"], ["Blown 808", "808 Distorted", { drive: 14 }], ["Distorted Bass", "Fuzz Bass"]],
            "Hardstyle": [["Hard Pluck", "Trance Pluck", { drive: 1.5 }], ["Rave Pluck", "Future Pluck"], ["Screech Lead", "Distorted Lead"], ["Hardstyle Lead", "Supersaw Lead", { drive: 2 }], ["Hardstyle Synth", "Hyper Synth"], ["Anthem Chords", "Saw Chord", { voices: 5 }], ["Hard Bass", "Fuzz Bass"], ["Reverse Bass", "Reese", { drive: 3 }]],
            "Disco & Funk": [["Funk Pluck", "Muted Guitar"], ["Clav Pluck", "Synth Pizz", { osc: "square" }], ["Disco Strings", "Violin Lead"], ["Funk Lead", "Sync Lead"], ["Disco Brass", "Synth Brass"], ["Disco Chords", "Juno Stab"], ["Slap Bass", "Slap Bass"], ["Disco Bass", "Moog Bass", { decay: 0.3, sustain: 0.3 }]],
            "Breakcore": [["Break Pluck", "Chip Pluck", { crush: 6 }], ["Glitch Pluck", "Glass Pluck", { crush: 6 }], ["Amen Lead", "Distorted Lead"], ["Rave Lead", "Hoover Lead"], ["Breakcore Stab", "Rave Stab"], ["Strings Synth", "Poly Synth", { attack: 0.2, cutoff: 3000 }], ["Reese Bass", "Reese", { drive: 4 }], ["Neuro Bass", "Neuro Bass"]],
            "Underground UG": [["UG Pluck", "Dark Pluck", { crush: 10 }], ["Echo Pluck", "Bell Pluck", { echo: 0.5 }], ["UG Lead", "Square Lead", { crush: 10 }], ["Flute Lead", "Flute", { crush: 10 }], ["UG Synth", "Poly Synth", { cutoff: 1300 }], ["Choir Synth", "Vowel Synth", { crush: 10 }], ["808 Blown", "808 Distorted", { drive: 12 }], ["808 Long", "808 Long"]],
            "UK Drill": [["Drill Pluck", "Dark Pluck", { glide: -2 }], ["Piano Pluck", "Mallet Pluck"], ["Drill Lead", "Violin Lead"], ["Whistle Lead", "Whistle Lead"], ["Drill Strings", "Poly Synth", { attack: 0.15, cutoff: 1500 }], ["Choir Synth", "Vowel Synth"], ["808 Slide", "808 Slide", { drop: 2.5 }], ["808 Drill", "808 Punch", { drive: 5 }]],
            "NY Drill": [["Bronx Pluck", "Bell Pluck", { drive: 2 }], ["Dark Pluck", "Dark Pluck"], ["Choir Lead", "Vowel Lead", { seq: ["o", "a"] }], ["Brass Lead", "Brass Lead"], ["NY Synth", "Poly Synth", { cutoff: 1500 }], ["Choir Synth", "Vowel Synth"], ["808 Bronx", "808 Punch", { drive: 6 }], ["808 Slide", "808 Slide"]],
            "Rock": [["Clean Pluck", "Steel Pluck"], ["Muted Pluck", "Muted Guitar"], ["Lead Guitar", "Guitar Lead"], ["Organ Lead", "Organ Lead"], ["Power Synth", "Saw Chord", { chord: [0, 7, 12], drive: 5 }], ["Organ Synth", "Organ Synth"], ["Pick Bass", "Slap Bass", { pick: 3000 }], ["Rock Bass", "Fuzz Bass", { drive: 3 }]],
            "Indie": [["Jangle Pluck", "Steel Pluck", { chorus: 0.5 }], ["Glock Pluck", "Mallet Pluck"], ["Indie Lead", "Guitar Lead", { drive: 3 }], ["Synth Lead", "Square Lead"], ["Indie Synth", "Poly Synth"], ["Organ Synth", "Organ Synth"], ["Indie Bass", "Upright Bass"], ["Synth Bass", "Moog Bass"]],
            "Webcore": [["Web Pluck", "Glass Pluck", { echo: 0.45 }], ["Chip Pluck", "Chip Pluck"], ["Web Lead", "Bit Lead"], ["Dream Lead", "Sine Lead", { verb: 0.4 }], ["Dream Synth", "Glass Synth"], ["Bit Synth", "Lo-Fi Synth", { crush: 6 }], ["Bit 808", "808 Punch", { crush: 6 }], ["Sub Bass", "Pluck Sub"]],
            "Digicore": [["Digi Pluck", "Future Pluck", { drive: 2 }], ["Glitch Pluck", "Chip Pluck"], ["Digi Lead", "Supersaw Lead"], ["Pitch Lead", "Glide Lead", { glide: 12 }], ["Digi Synth", "Hyper Synth"], ["Bell Synth", "Glass Synth"], ["808 Blown", "808 Distorted", { drive: 13 }], ["Reese Bass", "Reese"]],
            "Rage": [["Rage Pluck", "Future Pluck", { drive: 3 }], ["Bell Pluck", "Bell Pluck"], ["Rage Lead", "Supersaw Lead", { drive: 4 }], ["Synth Lead", "Saw Lead", { drive: 2 }], ["Rage Synth", "Hyper Synth", { drive: 4 }], ["Dark Pad Synth", "Poly Synth", { cutoff: 1100 }], ["808 Rage", "808 Distorted", { drive: 12, decay: 0.9 }], ["808 Long", "808 Long"]],
            "Plugg": [["Plugg Bell", "Bell Pluck", { verb: 0.3 }], ["Glass Pluck", "Glass Pluck"], ["Plugg Lead", "Square Lead", { verb: 0.2 }], ["Flute Lead", "Flute"], ["Plugg Synth", "Glass Synth"], ["Soft Synth", "Poly Synth", { cutoff: 2000, attack: 0.05 }], ["808 Soft", "808 Long", { drive: 0.5 }], ["808 Slide", "808 Slide"]],
            "Pluggnb": [["Pluggnb Pluck", "Glass Pluck", { verb: 0.3 }], ["Guitar Pluck", "Steel Pluck"], ["Smooth Lead", "Sine Lead", { verb: 0.3 }], ["Bell Lead", "Kalimba", { len: 1.6 }], ["Pluggnb Keys", "Poly Synth", { cutoff: 1700 }], ["Pad Synth", "Sweep Synth"], ["808 Smooth", "808 Long"], ["Sub Glide", "808 Slide"]],
            "Emo Rap": [["Sad Pluck", "Steel Pluck", { verb: 0.3 }], ["Lo Pluck", "Lo-Fi Pluck"], ["Emo Lead", "Guitar Lead", { drive: 3, verb: 0.2 }], ["Sine Lead", "Sine Lead"], ["Emo Synth", "Poly Synth", { cutoff: 1500 }], ["Choir Synth", "Vowel Synth"], ["808 Emo", "808 Long"], ["808 Distorted", "808 Distorted"]],
            "Glitchcore": [["Glitch Pluck", "Chip Pluck", { crush: 5 }], ["Stutter Pluck", "Glass Pluck", { echo: 0.6, echoTime: 0.06 }], ["Glitch Lead", "Bit Lead"], ["Hyper Lead", "Supersaw Lead", { crush: 7 }], ["Glitch Synth", "Hyper Synth", { crush: 6 }], ["Bit Synth", "Lo-Fi Synth", { crush: 5 }], ["Glitch 808", "808 Punch", { crush: 5 }], ["Fuzz Bass", "Fuzz Bass"]],
            "Nightcore": [["Nightcore Pluck", "Future Pluck"], ["Piano Pluck", "Mallet Pluck"], ["Nightcore Lead", "Supersaw Lead"], ["Sine Lead", "Sine Lead"], ["Nightcore Synth", "Hyper Synth"], ["Trance Synth", "Saw Chord"], ["Nightcore Bass", "Moog Bass"], ["Octave Bass", "Juno Bass"]],
            "Metal": [["Chug Pluck", "Muted Guitar", { drive: 9 }], ["Clean Pluck", "Steel Pluck"], ["Shred Lead", "Guitar Lead", { drive: 9 }], ["Dark Lead", "Distorted Lead"], ["Power Synth", "Saw Chord", { chord: [0, 7, 12], drive: 8 }], ["Choir Synth", "Vowel Synth"], ["Metal Bass", "Fuzz Bass", { drive: 9 }], ["Pick Bass", "Slap Bass", { pick: 3500, drive: 2 }]],
            "Punk": [["Punk Pluck", "Muted Guitar", { drive: 5 }], ["Clean Pluck", "Steel Pluck"], ["Punk Lead", "Guitar Lead", { drive: 6 }], ["Organ Lead", "Organ Lead"], ["Power Synth", "Saw Chord", { chord: [0, 7, 12], drive: 6 }], ["Organ Synth", "Organ Synth", { drive: 2 }], ["Punk Bass", "Fuzz Bass", { drive: 4 }], ["Pick Bass", "Slap Bass"]],
            "Grunge": [["Grunge Pluck", "Muted Guitar", { drive: 6 }], ["Clean Pluck", "Steel Pluck", { chorus: 0.5 }], ["Grunge Lead", "Guitar Lead", { drive: 8 }], ["Fuzz Lead", "Distorted Lead"], ["Sludge Synth", "Saw Chord", { chord: [0, 7, 12], drive: 7, cutoff: 2000 }], ["Organ Synth", "Organ Synth"], ["Grunge Bass", "Fuzz Bass", { drive: 6 }], ["Dark Bass", "Moog Bass", { cutoff: 220 }]],
            "Shoegaze": [["Dream Pluck", "Steel Pluck", { chorus: 0.6, verb: 0.5 }], ["Glow Pluck", "Glass Pluck", { verb: 0.5 }], ["Wall Lead", "Guitar Lead", { drive: 6, verb: 0.5 }], ["Dream Lead", "Sine Lead", { chorus: 0.6, verb: 0.5 }], ["Wall Synth", "Hyper Synth", { cutoff: 3000, verb: 0.4 }], ["Haze Synth", "Sweep Synth", { verb: 0.5 }], ["Fuzz Bass", "Fuzz Bass", { drive: 4 }], ["Warm Bass", "Moog Bass"]],
            "Bedroom Pop": [["Bedroom Pluck", "Steel Pluck", { chorus: 0.5 }], ["Lo-Fi Pluck", "Lo-Fi Pluck"], ["Soft Lead", "Sine Lead", { chorus: 0.4 }], ["Tape Lead", "Vapor Lead"], ["Bedroom Synth", "Lo-Fi Synth"], ["Juno Synth", "Juno Stab"], ["Bedroom Bass", "Upright Bass"], ["Synth Bass", "Moog Bass", { cutoff: 260 }]],
            "Jazz": [["Jazz Guitar", "Steel Pluck", { pick: 2500 }], ["Vibes Pluck", "Mallet Pluck", { verb: 0.25 }], ["Muted Trumpet", "Trumpet", { cutoff: 900 }], ["Sax Lead", "Reed Lead", { vib: 0.2 }], ["Jazz Organ", "Organ Synth"], ["Jazz Chords", "Juno Stab", { chord: [0, 4, 10, 14], cutoff: 1300 }], ["Walking Bass", "Upright Bass"], ["Electric Bass", "Moog Bass", { cutoff: 260, decay: 0.4 }]],
            "Neo Soul": [["Soul Pluck", "Glass Pluck", { ratio: 1, index: 1.5 }], ["Guitar Pluck", "Steel Pluck", { pick: 3000 }], ["Soul Lead", "Sine Lead", { vib: 0.2 }], ["Moog Lead", "Saw Lead", { cutoff: 2000 }], ["Neo Keys", "Juno Stab", { chord: [0, 3, 7, 10, 14] }], ["Soul Organ", "Organ Synth"], ["Soul Bass", "Moog Bass", { cutoff: 250 }], ["Upright Bass", "Upright Bass"]],
            "Gospel": [["Gospel Pluck", "Mallet Pluck"], ["Organ Pluck", "Organ Stab", { decay: 0.2, len: 0.6 }], ["Organ Lead", "Organ Lead"], ["Choir Lead", "Vowel Lead", { seq: ["o", "o"] }], ["Gospel Organ", "Organ Synth", { drive: 1 }], ["Choir Synth", "Vowel Synth", { seq: ["a", "o"] }], ["Gospel Bass", "Organ Bass"], ["Sub Bass", "Pluck Sub"]],
            "City Pop": [["Funk Pluck", "Muted Guitar"], ["Bell Pluck", "Glass Pluck"], ["City Lead", "Saw Lead", { chorus: 0.4 }], ["Brass Lead", "Brass Lead"], ["City Chords", "Juno Stab", { chord: [0, 4, 7, 11, 14] }], ["Brass Synth", "Synth Brass"], ["Slap Bass", "Slap Bass"], ["Synth Bass", "Moog Bass"]],
            "K-Pop": [["K-Pop Pluck", "Future Pluck"], ["Bell Pluck", "Bell Pluck"], ["K-Pop Lead", "Supersaw Lead"], ["Synth Lead", "Square Lead"], ["K-Pop Synth", "Hyper Synth", { drive: 1 }], ["Brass Synth", "Synth Brass"], ["808 Pop", "808 Punch"], ["Synth Bass", "Moog Bass"]],
            "Vaporwave": [["Mall Pluck", "Glass Pluck", { chorus: 0.6, verb: 0.4 }], ["Marimba Pluck", "Marimba", { verb: 0.3 }], ["Vapor Lead", "Vapor Lead"], ["Sax Lead", "Reed Lead", { verb: 0.4 }], ["Vapor Synth", "Juno Stab", { chord: [0, 4, 7, 11], verb: 0.4 }], ["Glass Synth", "Glass Synth", { chorus: 0.6 }], ["Fretless Bass", "Upright Bass", { pick: 800 }], ["FM Bass", "FM Bass"]],
            "Chiptune": [["Chip Pluck", "Chip Pluck"], ["Arp Pluck", "Arp Pluck", { crush: 5 }], ["Pulse Lead", "Chip Lead", { width: 0.125, vib: 0.2 }], ["Square Lead", "Chip Lead", { width: 0.5 }], ["Chip Synth", "Lo-Fi Synth", { crush: 5 }], ["Triangle Synth", "Sine Lead", { osc: "tri", crush: 5 }], ["Triangle Bass", "Chip Bass", { osc: "tri" }], ["Pulse Bass", "Chip Bass"]],
            "Gabber": [["Gabber Pluck", "Trance Pluck", { drive: 4 }], ["Hoover Pluck", "Synth Pizz", { voices: 7, detune: 0.45 }], ["Hoover Lead", "Hoover Lead"], ["Screech Lead", "Distorted Lead", { drive: 9 }], ["Gabber Synth", "Rave Stab", { drive: 6 }], ["Hoover Synth", "Hyper Synth", { drive: 5 }], ["Gabber Bass", "Fuzz Bass", { drive: 10 }], ["Kick Bass", "Kick Bass", { drive: 8 }]],
            "Footwork": [["Footwork Pluck", "Synth Pizz"], ["Vocal Pluck", "Vowel Lead", { len: 0.3 }], ["Footwork Lead", "Square Lead"], ["Vocal Lead", "Vowel Lead"], ["Footwork Synth", "Juno Stab"], ["Pad Synth", "Sweep Synth"], ["808 Footwork", "808 Punch"], ["Sub Bass", "Pluck Sub"]],
            "Baile Funk": [["Baile Pluck", "Bell Pluck", { ratio: 1.48 }], ["Brass Pluck", "Synth Pizz", { chord: [0, 4, 7] }], ["Baile Lead", "Brass Lead"], ["Whistle Lead", "Whistle Lead"], ["Baile Stab", "Rave Stab"], ["Brass Synth", "Synth Brass"], ["808 Baile", "808 Distorted", { drive: 6 }], ["Kick Bass", "Kick Bass"]],
            "Dancehall": [["Dancehall Pluck", "Steel Pluck"], ["Marimba Pluck", "Marimba"], ["Dancehall Lead", "Square Lead"], ["Whistle Lead", "Whistle Lead"], ["Dancehall Synth", "Poly Synth"], ["Organ Synth", "Organ Synth"], ["Dancehall Bass", "Dub Bass"], ["808 Dancehall", "808 Long"]],
            "Moombahton": [["Moombah Pluck", "House Pluck"], ["Steel Pluck", "Steel Pluck"], ["Moombah Lead", "Supersaw Lead"], ["Brass Lead", "Brass Lead"], ["Moombah Stab", "Rave Stab"], ["Chord Synth", "Saw Chord"], ["Reese Bass", "Reese"], ["Moombah Bass", "Moog Bass"]],
            "Brazilian Phonk": [["Phonk Cowbell", "Bell Pluck", { ratio: 1.48, drive: 4 }], ["Dark Pluck", "Dark Pluck", { crush: 9 }], ["Phonk Lead", "Square Lead", { crush: 9, drive: 2 }], ["Brass Lead", "Brass Lead", { drive: 2 }], ["Phonk Synth", "Rave Stab", { crush: 9 }], ["Choir Synth", "Vowel Synth", { crush: 9 }], ["808 Blown", "808 Distorted", { drive: 14 }], ["808 Punch", "808 Punch", { drive: 5 }]],
            "Hard Techno": [["Hard Pluck", "Dark Pluck", { drive: 3 }], ["Metal Pluck", "Glass Pluck", { ratio: 3.7, drive: 1 }], ["Acid Lead", "Acid Lead", { res: 10, drive: 3 }], ["Hoover Lead", "Hoover Lead"], ["Hard Stab", "Rave Stab", { drive: 4 }], ["Sweep Synth", "Sweep Synth", { drive: 2 }], ["Rumble Bass", "Dub Bass", { drive: 3 }], ["Acid Bass", "Acid", { drive: 3 }]],
            "Trance": [["Trance Pluck", "Trance Pluck"], ["Gate Pluck", "Future Pluck", { decay: 0.2 }], ["Trance Lead", "Supersaw Lead"], ["Saw Lead", "Saw Lead"], ["Trance Synth", "Hyper Synth", { drive: 0.5 }], ["Pad Synth", "Sweep Synth"], ["Rolling Bass", "Moog Bass", { decay: 0.25, sustain: 0.2, len: 0.6 }], ["Pluck Bass", "Pluck Bass"]],
            "Big Room": [["Big Room Pluck", "Future Pluck", { drive: 1 }], ["Bounce Pluck", "Synth Pizz"], ["Big Room Lead", "Supersaw Lead", { drive: 2 }], ["Brass Lead", "Brass Lead"], ["Big Room Synth", "Hyper Synth"], ["Chord Synth", "Saw Chord"], ["Big Room Bass", "Reese", { drive: 2 }], ["Kick Bass", "Kick Bass"]],
            "Cinematic": [["Harp Pluck", "Harp"], ["Glass Pluck", "Glass Pluck", { verb: 0.5 }], ["Horn Lead", "Brass Lead", { attack: 0.08, verb: 0.4 }], ["Violin Lead", "Violin Lead", { verb: 0.4 }], ["Epic Synth", "Synth Brass", { verb: 0.4 }], ["Choir Synth", "Vowel Synth", { seq: ["a", "a"], verb: 0.5 }], ["Cinematic Sub", "Dub Bass"], ["Dark Bass", "Moog Bass", { cutoff: 200 }]],
            "Ambient": [["Ambient Pluck", "Glass Pluck", { verb: 0.6 }], ["Kalimba Pluck", "Kalimba", { verb: 0.5 }], ["Ambient Lead", "Sine Lead", { verb: 0.5 }], ["Breath Lead", "Pan Flute", { verb: 0.5 }], ["Ambient Synth", "Sweep Synth", { verb: 0.6 }], ["Glass Synth", "Glass Synth", { verb: 0.6 }], ["Ambient Sub", "Dub Bass"], ["Soft Bass", "Pluck Sub", { verb: 0.2 }]],
            "Witch House": [["Witch Pluck", "Bell Pluck", { verb: 0.6 }], ["Dark Pluck", "Dark Pluck", { verb: 0.4 }], ["Witch Lead", "Vowel Lead", { seq: ["u", "o"], verb: 0.5 }], ["Hoover Lead", "Hoover Lead", { verb: 0.3 }], ["Witch Synth", "Vowel Synth", { seq: ["u", "o"], verb: 0.5 }], ["Dark Synth", "Poly Synth", { cutoff: 900, verb: 0.4 }], ["808 Witch", "808 Long", { lp: 1500 }], ["Distorted 808", "808 Distorted"]],
            "Grime": [["Grime Pluck", "Square Pluck"], ["Eski Pluck", "Chip Pluck", { crush: 0 }], ["Eski Lead", "Square Lead"], ["Grime Lead", "Brass Lead"], ["Grime Stab", "Rave Stab", { chord: [0, 3, 7] }], ["Strings Synth", "Poly Synth", { attack: 0.15, cutoff: 1800 }], ["Grime Bass", "Square Bass"], ["Reese Bass", "Reese"]],
            "Breakbeat": [["Break Pluck", "Synth Pizz", { crush: 11 }], ["Bell Pluck", "Bell Pluck"], ["Break Lead", "Acid Lead"], ["Rave Lead", "Hoover Lead"], ["Break Stab", "Rave Stab"], ["Strings Synth", "Poly Synth", { attack: 0.2 }], ["Break Bass", "Reese"], ["Acid Bass", "Acid"]],
            "Electro": [["Electro Pluck", "Square Pluck"], ["Robot Pluck", "Chip Pluck", { crush: 0 }], ["Electro Lead", "Sync Lead"], ["Vocoder Lead", "Vowel Lead", { seq: ["e", "o"], breath: 0 }], ["Electro Synth", "PWM Synth"], ["Electro Stab", "Juno Stab"], ["Electro Bass", "Moog Bass", { decay: 0.3 }], ["808 Electro", "808 Punch"]],
            "Memphis Rap": [["Memphis Pluck", "Bell Pluck", { crush: 10 }], ["Dark Pluck", "Dark Pluck", { crush: 10 }], ["Memphis Lead", "Flute", { crush: 10 }], ["Horror Lead", "Square Lead", { crush: 10, vib: 0.3 }], ["Memphis Synth", "Poly Synth", { crush: 10, cutoff: 1200 }], ["Choir Synth", "Vowel Synth", { crush: 10 }], ["808 Memphis", "808 Long", { crush: 10 }], ["808 Punch", "808 Punch", { crush: 10 }]],
        };
        // The classic Genre Kits folders get parts too.
        const CLASSIC_PARTS = {
            "Trap": [["Classic Bell Pluck", "Bell Pluck", { ratio: 4 }], ["Classic Dark Pluck", "Dark Pluck", { cutoff: 250 }], ["Classic Flute", "Flute"], ["Classic Glide Lead", "Glide Lead", { glide: -7 }], ["Classic Synth", "Poly Synth", { cutoff: 1600 }], ["Classic Choir", "Vowel Synth", { seq: ["a", "a"] }], ["Classic 808", "808 Long"], ["Classic 808 Knock", "808 Punch"]],
            "Lo-Fi": [["Classic Lo-Fi Pluck", "Lo-Fi Pluck", { pick: 1500 }], ["Classic Kalimba", "Kalimba", { crush: 9 }], ["Classic Tape Lead", "Sine Lead", { crush: 9, vib: 0.2, vibRate: 0.8 }], ["Classic Flute", "Flute", { crush: 9 }], ["Classic Tape Keys", "Tape Keys"], ["Classic Lo-Fi Synth", "Lo-Fi Synth", { cutoff: 1400 }], ["Classic Upright", "Upright Bass"], ["Classic Tape Sub", "Pluck Sub", { crush: 10 }]],
            "House": [["Classic House Pluck", "House Pluck", { chord: [0, 12] }], ["Classic Organ Pluck", "Organ Stab", { decay: 0.15, len: 0.5 }], ["Classic Piano Lead", "Mallet Pluck", { len: 1.5 }], ["Classic Saw Lead", "Saw Lead"], ["Classic House Chords", "Juno Stab"], ["Classic Organ Synth", "Organ Synth"], ["Classic House Bass", "Juno Bass"], ["Classic Organ Bass", "Organ Bass", { len: 0.6 }]],
        };
        // How many sounds each genre's Bass folder already has (the new ones continue the numbering).
        const bassCounts = new Map();
        for (const item of flCatalog) {
            const at = item.path.indexOf("/Bass/");
            if (at > 0)
                bassCounts.set(item.path.slice(0, at), (bassCounts.get(item.path.slice(0, at)) || 0) + 1);
        }
        const addParts = (base, prefix, parts, seedName) => {
            const folders = ["Plucks", "Plucks", "Leads", "Leads", "Synths", "Synths", "Bass", "Bass"];
            const existingBass = bassCounts.get(base) || 0;
            const counts = { Plucks: 0, Leads: 0, Synths: 0, Bass: existingBass };
            parts.forEach(([shown, name, mods], i) => {
                const folder = folders[i];
                const isBass = folder == "Bass";
                const root = isBass ? 36 : folder == "Leads" ? 72 : 60;
                const [gen, params, extra] = recipe(name, mods, hz(root));
                if (extra && extra.rootKey != undefined && extra.rootKey != root)
                    throw new Error("Sound Library 4: " + name + " is rooted at " + extra.rootKey + ", not " + root);
                const number = ++counts[folder];
                const label = (prefix ? prefix + " " : "") + shown + " " + pad2(number);
                flAdd(base + "/" + folder + "/" + label, gen, jitter(params, "lib4/" + seedName + "/" + i, 0.03), Object.assign({ rootKey: root }, extra || {}));
            });
        };
        for (const genre of Object.keys(GENRE_PARTS)) {
            const prefix = genre.replace(/ & /g, " ").replace(/[^A-Za-z0-9 ]/g, "");
            addParts(PK + "/" + genre, prefix, GENRE_PARTS[genre], genre);
        }
        for (const genre of Object.keys(CLASSIC_PARTS))
            addParts("Genre Kits/" + genre, "", CLASSIC_PARTS[genre], "classic/" + genre);
        // ------------------------------------------------- Essentials
        // Each sound type: archetypes x treatments = 75 named sounds.
        const ESS = PK + "/Essentials";
        const essentials = [];
        // Archetypes are copied so treatments can change them; recipes (functions) are shared.
        const copyOf = (x) => typeof x == "function" || (Array.isArray(x) && x.some(y => typeof y == "function")) ? x : clone(x);
        // build(archetype, treatment) -> [gen, params, extra]
        const series = (folder, label, archetypes, treatments, build, limit = 75) => {
            let count = 0;
            for (const [aName, aBase] of archetypes) {
                for (const [tName, treat] of treatments) {
                    if (count >= limit)
                        return;
                    const made = build(copyOf(aBase), treat, aName, tName, count);
                    if (!made)
                        continue;
                    const [gen, params, extra] = made;
                    const name = (label ? label + " " : "") + aName + (tName ? " " + tName : "");
                    flAdd(ESS + "/" + folder + "/" + name, gen, params, extra || {});
                    essentials.push(flCatalog[flCatalog.length - 1].key);
                    count++;
                }
            }
        };
        const scaleBody = (p, k) => {
            if (p.body) {
                p.body.start *= k;
                p.body.end *= k;
            }
            return p;
        };
        // Generic finished treatments for any generator (through FLGen.post).
        const POST = (gen, params, fx, extra) => ["post", { gen, params, fx }, extra];
        // ---- drums
        const KICKS = [
            ["808", { body: { start: 120, end: 48, sweep: 0.04, decay: 0.9 }, click: 0.08, len: 1.8 }],
            ["909", { body: { start: 300, end: 52, sweep: 0.02, decay: 0.32 }, noise: { amp: 0.25, hp: 2500, lp: 9000, decay: 0.006 }, click: 0.5, drive: 1, len: 0.8 }],
            ["Trap", { body: { start: 230, end: 50, sweep: 0.022, decay: 0.45 }, click: 0.35, drive: 1.4, len: 1 }],
            ["Boom Bap", { body: { start: 150, end: 55, sweep: 0.03, decay: 0.22 }, click: 0.6, drive: 1.2, lp: 4500, dust: 0.015, len: 0.7 }],
            ["House", { body: { start: 190, end: 50, sweep: 0.02, decay: 0.28 }, click: 0.4, drive: 1.6, len: 0.7 }],
            ["Techno", { body: { start: 170, end: 46, sweep: 0.03, decay: 0.42 }, click: 0.3, drive: 3.5, lp: 2800, room: 0.15, len: 1 }],
            ["Hardstyle", { body: { start: 400, end: 55, sweep: 0.012, decay: 0.32, hold: 0.06 }, click: 0.4, drive: 9, lp: 7000, len: 0.9 }],
            ["Acoustic", { body: { start: 120, end: 55, sweep: 0.025, decay: 0.22 }, noise: { amp: 0.35, bp: 3000, hp: 900, lp: 8000, decay: 0.01 }, click: 0.5, room: 0.18, len: 0.8 }],
            ["Lo-Fi", { body: { start: 140, end: 50, sweep: 0.025, decay: 0.26 }, click: 0.15, drive: 1.2, lp: 1800, crush: 9, dust: 0.03, len: 0.7 }],
            ["Sub", { body: { start: 110, end: 42, sweep: 0.04, decay: 1.2 }, click: 0.05, len: 2 }],
            ["Punch", { body: { start: 260, end: 58, sweep: 0.016, decay: 0.25 }, click: 0.7, drive: 2.2, len: 0.6 }],
            ["Distorted", { body: { start: 220, end: 50, sweep: 0.02, decay: 0.35 }, click: 0.5, drive: 9, lp: 6000, len: 0.9 }],
            ["Gabber", { body: { start: 280, end: 60, sweep: 0.014, decay: 0.4 }, click: 0.9, drive: 14, lp: 7000, len: 1.1 }],
            ["Deep", { body: { start: 130, end: 45, sweep: 0.035, decay: 0.6 }, click: 0.2, lp: 3500, len: 1.2 }],
            ["Rumble", { body: { start: 160, end: 44, sweep: 0.03, decay: 0.45 }, drive: 3, room: 0.45, roomDecay: 1.6, lp: 1500, len: 2 }],
        ];
        const KICK_TREAT = [
            ["Tight", (p) => { p.body.decay *= 0.55; p.len = Math.max(0.35, p.len * 0.65); }],
            ["Long", (p) => { p.body.decay *= 1.8; p.len = Math.min(3, p.len * 1.7); }],
            ["Bright", (p) => { p.click = (p.click || 0) + 0.35; p.body.start *= 1.3; if (p.lp) p.lp *= 1.6; }],
            ["Dark", (p) => { p.lp = Math.min(p.lp || 4000, 1700); p.click = (p.click || 0) * 0.4; }],
            ["Saturated", (p) => { p.drive = (p.drive || 0) + 4; }],
        ];
        series("Kicks", "Kick", KICKS, KICK_TREAT, (p, t, a, n, i) => { t(p); return ["drum2", jitter(p, "ess/kick/" + i, 0.02)]; });
        const SNARES = [
            ["Trap", { body: { start: 260, end: 190, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 2200, lp: 13000, decay: 0.14 }, click: 0.2, len: 0.6 }],
            ["Drill", { body: { start: 300, end: 210, sweep: 0.008, decay: 0.05 }, noise: { amp: 1, hp: 2600, lp: 14000, decay: 0.11 }, click: 0.4, len: 0.5 }],
            ["Boom Bap", { body: { start: 220, end: 175, sweep: 0.01, decay: 0.08 }, noise: { amp: 0.9, hp: 900, lp: 8000, decay: 0.2 }, click: 0.3, drive: 1, len: 0.6 }],
            ["Lo-Fi", { body: { start: 210, end: 170, sweep: 0.01, decay: 0.07 }, noise: { amp: 0.8, hp: 700, lp: 5000, decay: 0.16 }, lp: 5000, crush: 9, dust: 0.02, len: 0.5 }],
            ["Pop", { body: { start: 250, end: 190, sweep: 0.01, decay: 0.07 }, noise: { amp: 1, hp: 1800, lp: 12000, decay: 0.17 }, click: 0.25, len: 0.6 }],
            ["House", { body: { start: 230, end: 180, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 1500, lp: 11000, decay: 0.15 }, len: 0.5 }],
            ["Techno", { body: { start: 230, end: 180, sweep: 0.01, decay: 0.05 }, noise: { amp: 0.9, hp: 1700, lp: 9000, decay: 0.14 }, drive: 1.5, room: 0.2, len: 0.6 }],
            ["DnB", { body: { start: 280, end: 200, sweep: 0.008, decay: 0.07 }, noise: { amp: 1.1, hp: 1900, lp: 13000, decay: 0.16 }, click: 0.4, drive: 1.2, len: 0.6 }],
            ["Acoustic", { body: { start: 210, end: 180, sweep: 0.01, decay: 0.12, amp: 1.1 }, ring: { ratio: 1.62, amp: 0.4, decay: 0.06 }, noise: { amp: 0.9, hp: 1500, lp: 11000, decay: 0.18 }, click: 0.3, room: 0.25, len: 0.8 }],
            ["Piccolo", { body: { start: 380, end: 330, sweep: 0.006, decay: 0.05 }, noise: { amp: 1, hp: 3000, lp: 14000, decay: 0.12 }, click: 0.4, len: 0.45 }],
            ["Rim Layer", { body: { start: 400, end: 380, decay: 0.03 }, ring: { ratio: 3.6, amp: 0.9, decay: 0.02 }, noise: { amp: 0.8, hp: 2200, lp: 12000, decay: 0.1 }, click: 0.6, len: 0.4 }],
            ["Gated", { body: { start: 230, end: 190, sweep: 0.01, decay: 0.08 }, noise: { amp: 1, hp: 1400, lp: 11000, decay: 0.2 }, room: 0.6, roomDecay: 0.35, len: 0.6 }],
            ["Brush", { noise: { amp: 1, hp: 1500, lp: 7000, decay: 0.2, attack: 0.03 }, body: { start: 200, end: 180, decay: 0.04, amp: 0.4 }, len: 0.6 }],
            ["Electro", { body: { start: 200, end: 165, sweep: 0.012, decay: 0.09 }, noise: { amp: 1.2, hp: 1000, lp: 9000, decay: 0.2 }, click: 0.2, len: 0.6 }],
            ["Dusty", { body: { start: 230, end: 185, sweep: 0.01, decay: 0.08 }, noise: { amp: 1, hp: 1200, lp: 6500, decay: 0.17 }, lp: 4200, crush: 8, dust: 0.03, len: 0.6 }],
        ];
        const SNARE_TREAT = [
            ["Tight", (p) => { p.noise.decay *= 0.6; if (p.body) p.body.decay *= 0.7; p.len = Math.max(0.3, p.len * 0.7); }],
            ["Fat", (p) => { if (p.body) { p.body.decay *= 1.6; p.body.amp = (p.body.amp || 1) * 1.3; } p.drive = (p.drive || 0) + 1.5; }],
            ["Crack", (p) => { p.noise.hp *= 1.5; p.click = (p.click || 0) + 0.4; }],
            ["Room", (p) => { p.room = Math.max(p.room || 0, 0.4); p.roomDecay = 1; }],
            ["Dark", (p) => { p.noise.lp *= 0.5; p.lp = Math.min(p.lp || 9000, 4500); }],
        ];
        series("Snares", "Snare", SNARES, SNARE_TREAT, (p, t, a, n, i) => { t(p); return ["drum2", jitter(p, "ess/snare/" + i, 0.02)]; });
        const CLAPS = [
            ["Classic", { freq: 1150, q: 1.8, tail: 0.14, bursts: 4 }], ["Trap", { freq: 1250, q: 1.9, tail: 0.15, bursts: 4 }], ["House", { freq: 1100, q: 1.5, tail: 0.17, bursts: 5 }],
            ["Big Room", { freq: 950, q: 1.2, tail: 0.25, bursts: 6, room: 0.4 }], ["Lo-Fi", { freq: 900, q: 1.6, tail: 0.12, bursts: 4, lp: 5000, crush: 9 }], ["Snappy", { freq: 1500, q: 2.2, tail: 0.1, bursts: 3 }],
            ["Layered", { freq: 1150, q: 1.6, tail: 0.16, bursts: 6, spacing: 0.009, humanize: 1 }], ["Wide", { freq: 1050, q: 1.4, tail: 0.2, bursts: 5, spacing: 0.014 }], ["Tight", { freq: 1300, q: 2, tail: 0.08, bursts: 3 }],
            ["Dusty", { freq: 1000, q: 1.6, tail: 0.13, bursts: 4, lp: 4500, crush: 8 }], ["Reverb", { freq: 1200, q: 1.7, tail: 0.15, bursts: 4, room: 0.55, roomDecay: 1.4 }], ["Stack", { freq: 1100, q: 1.5, tail: 0.18, bursts: 7, spacing: 0.008, humanize: 1 }],
            ["Distant", { freq: 1000, q: 1.4, tail: 0.2, bursts: 4, lp: 3000, room: 0.5 }], ["Digital", { freq: 1400, q: 2, tail: 0.12, bursts: 3, crush: 6, downsample: 2 }], ["Gospel", { freq: 1050, q: 1.3, tail: 0.22, bursts: 6, room: 0.3, humanize: 1 }],
        ];
        const CLAP_TREAT = [
            ["Dry", (p) => { }], ["Room", (p) => { p.room = Math.max(p.room || 0, 0.35); }], ["Short", (p) => { p.tail *= 0.6; }],
            ["Long", (p) => { p.tail *= 1.8; p.len = 1; }], ["Bright", (p) => { p.freq *= 1.3; p.hp = 900; }],
        ];
        series("Claps", "Clap", CLAPS, CLAP_TREAT, (p, t, a, n, i) => { t(p); return ["clap2", jitter(Object.assign({ spacing: 0.011, len: 0.6 }, p), "ess/clap/" + i, 0.02)]; });
        const HATS = [
            ["808", { f: 205, decay: 0.042, bp: 10000, hp: 7500, noise: 0.3, len: 0.2 }], ["909", { f: 240, decay: 0.05, bp: 11000, hp: 8000, noise: 0.6, len: 0.22 }], ["Trap", { f: 220, decay: 0.032, bp: 10500, hp: 8000, noise: 0.45, len: 0.16 }],
            ["Crisp", { f: 260, decay: 0.03, bp: 12000, hp: 9000, noise: 0.45, len: 0.15 }], ["Dark", { f: 180, decay: 0.05, bp: 7000, hp: 5000, noise: 0.4, len: 0.2 }], ["Dusty", { f: 200, decay: 0.045, bp: 8000, hp: 6000, noise: 0.5, len: 0.2, crush: 8, lp: 9000 }],
            ["Metal", { f: 300, decay: 0.04, bp: 9000, hp: 6500, noise: 0.15, ringMod: true, len: 0.2 }], ["Soft", { f: 210, decay: 0.05, bp: 8500, hp: 6000, noise: 0.6, attack: 0.004, len: 0.2 }], ["Shuffle", { f: 230, decay: 0.06, bp: 9500, hp: 7000, noise: 0.5, len: 0.25 }],
            ["Tick", { f: 280, decay: 0.012, bp: 12500, hp: 10000, noise: 0.7, len: 0.08 }], ["Noise", { f: 200, decay: 0.035, bp: 9000, hp: 7000, noise: 0.95, len: 0.15 }], ["Digital", { f: 250, decay: 0.03, bp: 11000, hp: 8000, noise: 0.5, crush: 6, downsample: 2, len: 0.15 }],
            ["Analog", { f: 215, decay: 0.045, bp: 9500, hp: 7000, noise: 0.35, len: 0.2, sizzle: 0.2 }], ["Tape", { f: 200, decay: 0.05, bp: 8000, hp: 6000, noise: 0.5, lp: 8000, len: 0.2 }], ["Shaker Hat", { f: 220, decay: 0.045, bp: 9000, hp: 7000, noise: 0.85, attack: 0.012, len: 0.2 }],
        ];
        const HAT_TREAT = [
            ["Tight", (p) => { p.decay *= 0.6; }], ["Loose", (p) => { p.decay *= 1.7; p.len *= 1.5; }], ["Bright", (p) => { p.bp *= 1.2; p.hp *= 1.2; p.sizzle = (p.sizzle || 0) + 0.3; }],
            ["Dark", (p) => { p.bp *= 0.75; p.hp *= 0.75; p.tune = 0.85; }], ["Lo-Fi", (p) => { p.crush = p.crush || 8; p.lp = Math.min(p.lp || 20000, 8000); }],
        ];
        series("Hats", "Hat", HATS, HAT_TREAT, (p, t, a, n, i) => { t(p); return ["hat2", jitter(p, "ess/hat/" + i, 0.02)]; });
        const OHATS = HATS.map(([name, p]) => [name, Object.assign({}, p, { decay: p.decay * 6.5, len: Math.max(0.7, p.len * 4.5), attack: undefined })]);
        const OHAT_TREAT = [
            ["Short", (p) => { p.decay *= 0.6; p.len *= 0.7; }], ["Long", (p) => { p.decay *= 1.6; p.len *= 1.5; }], ["Bright", (p) => { p.bp *= 1.2; p.sizzle = (p.sizzle || 0) + 0.35; }],
            ["Trashy", (p) => { p.noise = 0.75; p.ringMod = true; p.bp *= 0.8; }], ["Soft", (p) => { p.attack = 0.01; p.noise = 0.6; }],
        ];
        series("Open Hats", "Open Hat", OHATS, OHAT_TREAT, (p, t, a, n, i) => {
            t(p);
            if (p.attack === undefined) delete p.attack;
            return ["hat2", jitter(p, "ess/ohat/" + i, 0.02)];
        });
        const CYMBALS = [
            ["Crash", ["hat2", { f: 180, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1.2, fastDecay: 0.04, bp: 6500, q: 0.5, hp: 3800, noise: 0.6, len: 2.6, sizzle: 0.2, ringMod: true }]],
            ["Crash Thin", ["hat2", { f: 240, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 0.9, fastDecay: 0.03, bp: 8500, q: 0.6, hp: 5500, noise: 0.55, len: 2.2, sizzle: 0.3, ringMod: true }]],
            ["Crash Big", ["hat2", { f: 160, ratios: [1, 1.52, 1.83, 2.5, 2.7, 3.8], decay: 1.8, fastDecay: 0.05, bp: 5500, q: 0.45, hp: 3200, noise: 0.65, len: 3.2, sizzle: 0.25, ringMod: true }]],
            ["Ride", ["tones", { partials: [[3233, 0.6, 1.4], [5120, 0.5, 1.0], [7310, 0.4, 0.8], [9870, 0.3, 0.5]], click: 0.2, len: 2.2 }]],
            ["Ride Bell", ["tones", { partials: [[1500, 0.8, 1.3], [2980, 0.6, 0.9], [4700, 0.3, 0.5]], click: 0.15, len: 2.2 }]],
            ["Ride Dark", ["tones", { partials: [[2600, 0.6, 1.2], [4100, 0.5, 0.9], [6300, 0.3, 0.6]], click: 0.15, len: 2 }]],
            ["Splash", ["hat2", { f: 420, ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92], decay: 0.5, fastDecay: 0.03, bp: 8500, q: 0.6, hp: 5200, noise: 0.6, len: 1.3, ringMod: true }]],
            ["China", ["hat2", { f: 300, ratios: [1, 1.39, 1.97, 2.64, 3.4, 4.2], decay: 1, fastDecay: 0.05, bp: 4500, q: 0.7, hp: 2600, noise: 0.9, len: 2.5, ringMod: true }]],
            ["808 Cymbal", ["hat2", { f: 205, decay: 0.9, fastDecay: 0.08, bp: 8000, hp: 5600, noise: 0.2, len: 2.2 }]],
            ["Sizzle", ["hat2", { f: 220, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1.4, bp: 9000, q: 0.5, hp: 6000, noise: 0.5, len: 2.6, sizzle: 0.6, ringMod: true }]],
            ["Trash Crash", ["hat2", { f: 260, ratios: [1, 1.33, 1.71, 2.2, 2.9, 3.3], decay: 0.8, fastDecay: 0.03, bp: 5000, q: 0.6, hp: 3000, noise: 0.85, len: 1.8, ringMod: true }]],
            ["Reverse Crash", ["hat2", { f: 180, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1, bp: 6500, q: 0.5, hp: 3800, noise: 0.6, len: 2, ringMod: true, reverse: true }]],
            ["Swell", ["hat2", { f: 200, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1.6, bp: 6000, q: 0.5, hp: 3500, noise: 0.6, len: 3, ringMod: true, attack: 1.2 }]],
            ["Gong", ["tones", { partials: [[110, 1, 3.5], [196, 0.7, 3], [312, 0.6, 2.5], [431, 0.5, 2], [687, 0.4, 1.6], [1033, 0.25, 1.2]], click: 0.1, len: 4 }]],
            ["Bell Cymbal", ["tones", { partials: [[1870, 0.7, 1.6], [3560, 0.6, 1.2], [5900, 0.4, 0.8], [8200, 0.3, 0.6]], click: 0.25, len: 2.4 }]],
        ];
        const CYMBAL_TREAT = [
            ["Dry", () => ({})], ["Long", () => ({ verb: 0.35, verbDecay: 2.6 })], ["Bright", () => ({ hp: 3000, drive: 0.6 })], ["Dark", () => ({ lp: 4500 })], ["Lo-Fi", () => ({ crush: 8, lp: 9000 })],
        ];
        series("Cymbals", "", CYMBALS, CYMBAL_TREAT, ([gen, params], t, a, n, i) => {
            const fx = t();
            return Object.keys(fx).length == 0 ? [gen, jitter(params, "ess/cym/" + i, 0.02)] : POST(gen, jitter(params, "ess/cym/" + i, 0.02), fx);
        });
        const TOMS = [
            ["Floor", { body: { start: 120, end: 78, sweep: 0.06, decay: 0.45 }, noise: { amp: 0.2, hp: 200, lp: 4000, decay: 0.04 }, len: 1 }],
            ["Low", { body: { start: 150, end: 95, sweep: 0.05, decay: 0.38 }, noise: { amp: 0.18, hp: 300, lp: 4000, decay: 0.03 }, len: 0.8 }],
            ["Mid", { body: { start: 200, end: 135, sweep: 0.045, decay: 0.3 }, noise: { amp: 0.15, hp: 400, lp: 5000, decay: 0.03 }, len: 0.7 }],
            ["High", { body: { start: 270, end: 185, sweep: 0.04, decay: 0.24 }, noise: { amp: 0.15, hp: 500, lp: 5000, decay: 0.025 }, len: 0.6 }],
            ["Rack", { body: { start: 230, end: 165, sweep: 0.04, decay: 0.27 }, noise: { amp: 0.15, hp: 450, lp: 5000, decay: 0.025 }, len: 0.6 }],
            ["808 Low", { body: { start: 130, end: 88, sweep: 0.08, decay: 0.42 }, len: 0.9 }],
            ["808 Mid", { body: { start: 190, end: 128, sweep: 0.07, decay: 0.34 }, len: 0.8 }],
            ["808 High", { body: { start: 260, end: 180, sweep: 0.06, decay: 0.28 }, len: 0.7 }],
            ["Electro", { body: { start: 420, end: 140, sweep: 0.09, decay: 0.3 }, click: 0.2, len: 0.7 }],
            ["Syn Pew", { body: { start: 900, end: 150, sweep: 0.05, decay: 0.2, wave: "tri" }, len: 0.5 }],
            ["Concert", { body: { start: 180, end: 140, sweep: 0.03, decay: 0.5 }, ring: { ratio: 1.5, amp: 0.3, decay: 0.2 }, noise: { amp: 0.2, hp: 300, lp: 5000, decay: 0.04 }, room: 0.25, len: 1.2 }],
            ["Roto", { body: { start: 330, end: 300, sweep: 0.02, decay: 0.25 }, ring: { ratio: 2.1, amp: 0.4, decay: 0.12 }, click: 0.3, len: 0.6 }],
            ["Timpani", { body: { start: 105, end: 98, sweep: 0.08, decay: 1 }, ring: { ratio: 1.51, amp: 0.5, decay: 0.6 }, noise: { amp: 0.2, hp: 150, lp: 3000, decay: 0.05 }, room: 0.3, len: 2.2 }],
            ["Lo-Fi", { body: { start: 170, end: 110, sweep: 0.05, decay: 0.3 }, noise: { amp: 0.2, hp: 300, lp: 4000, decay: 0.03 }, crush: 9, lp: 3500, len: 0.7 }],
            ["Room", { body: { start: 160, end: 105, sweep: 0.05, decay: 0.35 }, noise: { amp: 0.2, hp: 250, lp: 4500, decay: 0.04 }, room: 0.45, roomDecay: 1.2, len: 1.2 }],
        ];
        const TOM_TREAT = [
            ["Tight", (p) => { p.body.decay *= 0.6; p.len = Math.max(0.35, p.len * 0.7); }], ["Long", (p) => { p.body.decay *= 1.6; p.len = Math.min(3, p.len * 1.5); }],
            ["Bright", (p) => { scaleBody(p, 1.2); p.click = (p.click || 0) + 0.3; }], ["Dark", (p) => { scaleBody(p, 0.85); p.lp = 2500; }], ["Saturated", (p) => { p.drive = (p.drive || 0) + 3; }],
        ];
        series("Toms", "Tom", TOMS, TOM_TREAT, (p, t, a, n, i) => { t(p); return ["drum2", jitter(p, "ess/tom/" + i, 0.02)]; });
        const PERC_KINDS = ["Conga", "Bongo", "Shaker", "Tambourine", "Cowbell", "Woodblock", "Clave", "Timbale", "Tabla", "Agogo", "Cabasa", "Djembe", "Cajon", "Talking Drum", "Steel Hit"];
        const PERC_TREAT = [["Dry", 1, {}], ["Room", 1, { verb: 0.3, verbDecay: 1 }], ["Dusty", 0.97, { crush: 8, lp: 7000 }], ["Up", 1.25, {}], ["Down", 0.8, { drive: 0.8 }]];
        series("Percussion", "", PERC_KINDS.map(k => [k, k]), PERC_TREAT.map(([n, k, fx]) => [n, [k, fx]]), (kind, [k, fx], a, n, i) => {
            const [gen, params] = PERC[kind](k);
            return Object.keys(fx).length == 0 ? [gen, params] : POST(gen, params, fx);
        });
        const RIMS = [
            ["Rim", ["drum2", { body: { start: 520, end: 470, decay: 0.014 }, ring: { ratio: 3.4, amp: 0.7, decay: 0.008 }, click: 0.7, len: 0.15 }]],
            ["Snap", ["drum2", { noise: { amp: 1, bp: 2400, q: 2.5, hp: 1000, lp: 9000, decay: 0.03 }, click: 0.3, len: 0.2 }]],
            ["Cross Stick", ["drum2", { body: { start: 1100, end: 1050, decay: 0.03 }, ring: { ratio: 2.36, amp: 0.5, decay: 0.015 }, click: 0.4, len: 0.18 }]],
            ["Finger Snap", ["drum2", { noise: { amp: 1, bp: 2800, q: 3, hp: 1200, lp: 9500, decay: 0.022 }, click: 0.5, len: 0.15 }]],
            ["Stick Click", ["tones", { partials: [[2900, 1, 0.012]], click: 0.6, len: 0.08 }]],
            ["Rimshot 909", ["tones", { partials: [[500, 1, 0.01], [1800, 0.6, 0.007]], click: 1, len: 0.12 }]],
            ["Rimshot 808", ["tones", { partials: [[455, 1, 0.012], [1667, 0.7, 0.008]], click: 0.6, len: 0.15 }]],
            ["Trap Snap", ["drum2", { noise: { amp: 1, bp: 2600, q: 3, hp: 1200, lp: 10000, decay: 0.02 }, click: 0.4, room: 0.15, len: 0.25 }]],
            ["Drill Rim", ["drum2", { body: { start: 620, end: 580, decay: 0.012 }, ring: { ratio: 3.1, amp: 0.8, decay: 0.008 }, click: 0.9, len: 0.12 }]],
            ["Wood Rim", ["drum2", { body: { start: 820, end: 790, decay: 0.03 }, ring: { ratio: 2.6, amp: 0.5, decay: 0.02 }, click: 0.4, len: 0.15 }]],
            ["Metal Rim", ["drum2", { body: { start: 700, end: 698, decay: 0.05 }, ring: { ratio: 2.71, amp: 0.9, decay: 0.04 }, click: 0.5, len: 0.25 }]],
            ["Lo-Fi Snap", ["drum2", { noise: { amp: 1, bp: 2000, q: 2, hp: 800, lp: 6000, decay: 0.03 }, click: 0.3, crush: 8, len: 0.2 }]],
            ["Double Snap", ["noiseHit", { bp: 2500, q: 2.5, hp: 1000, decay: 0.022, bursts: [0, 0.012], len: 0.2 }]],
            ["Click", ["tones", { partials: [[4000, 1, 0.003]], click: 0.8, len: 0.05 }]],
            ["Knock", ["drum2", { body: { start: 190, end: 150, decay: 0.05 }, noise: { amp: 0.4, bp: 900, hp: 200, lp: 3000, decay: 0.02 }, click: 0.3, len: 0.2 }]],
        ];
        const RIM_TREAT = [["Dry", {}], ["Room", { verb: 0.3, verbDecay: 1 }], ["Tight", { gate: 0.06 }], ["Bright", { hp: 1500, drive: 0.5 }], ["Dusty", { crush: 8, lp: 6000 }]];
        series("Rims & Snaps", "", RIMS, RIM_TREAT.map(([n, fx]) => [n, fx]), ([gen, params], fx, a, n, i) => Object.keys(fx).length == 0 ? [gen, params] : POST(gen, params, fx));
        // ---- 808s and bass
        const E808 = [
            ["Classic", { hold: 0.3, decay: 2.2, len: 3.5 }], ["Boom", { hold: 0.2, decay: 2, drop: 1.8, sweep: 0.04, click: 0.15, len: 3 }], ["Knock", { hold: 0.05, decay: 0.8, drop: 3, sweep: 0.015, click: 0.4, drive: 2, len: 1.8 }],
            ["Zay", { hold: 0.12, decay: 1, drop: 3.5, sweep: 0.06, drive: 3, len: 2.4 }], ["Mafia", { hold: 0.1, decay: 1, drop: 4, sweep: 0.03, drive: 7, clip: 0.6, len: 2 }], ["Phonk", { hold: 0.12, decay: 1.1, drop: 3, sweep: 0.025, drive: 9, clip: 0.55, lp: 5000, len: 2.2 }],
            ["Drill", { hold: 0.15, decay: 1.2, drop: 2.6, sweep: 0.05, drive: 4, lp: 3800, len: 2.6 }], ["Jersey", { hold: 0.05, decay: 0.5, drop: 4, sweep: 0.02, click: 0.5, drive: 3, len: 1.2 }], ["Memphis", { hold: 0.2, decay: 1.4, drive: 3, lp: 2200, len: 2.6 }],
            ["Slide", { hold: 0.6, decay: 2.6, drop: 0.7, sweep: 0.25, len: 3.5 }], ["Rumble", { hold: 0.3, decay: 2.4, drive: 3, lp: 600, len: 3.5 }], ["Tape", { hold: 0.2, decay: 1.6, drive: 2.5, lp: 1800, len: 3 }],
            ["Gritty", { hold: 0.2, decay: 1.4, drive: 6, lp: 3000, len: 3 }], ["Sub", { hold: 0.25, decay: 2, drop: 0.3, lp: 300, len: 3 }], ["Punch", { hold: 0.04, decay: 0.6, drop: 5, sweep: 0.012, click: 0.6, drive: 2.5, len: 1.6 }],
        ];
        const E808_TREAT = [
            ["Clean", (p) => p], ["Saturated", (p) => Object.assign(p, { drive: (p.drive || 0) + 4, lp: Math.min(p.lp || 6000, 4200) })], ["Short", (p) => Object.assign(p, { decay: (p.decay || 1.4) * 0.45, hold: (p.hold || 0.15) * 0.5, len: Math.max(1, (p.len || 3) * 0.5) })],
            ["Glide", (p) => Object.assign(p, { drop: (p.drop || 1.2) + 1.5, sweep: Math.max(p.sweep || 0.03, 0.18) })], ["Filtered", (p) => Object.assign(p, { lp: 420 })],
        ];
        series("808s", "808", E808, E808_TREAT, (p, t, a, n, i) => ["bass808", t(p), { rootKey: 36 }]);
        const BASS_LIST = ["Sub Bass", "Reese", "Wobble", "Pluck Bass", "FM Bass", "Donk", "Acid", "Finger Bass", "Synth Bass", "Organ Bass", "Hoover", "Moog Bass", "Rubber Bass", "Square Bass", "Slap Bass",
            "Upright Bass", "Growl Bass", "Fuzz Bass", "Neuro Bass", "Dub Bass", "Kick Bass", "Chip Bass", "Log Bass", "Pluck Sub", "Juno Bass"];
        const BASS_TREAT = [["Clean", {}], ["Driven", { drive: 3 }], ["Filtered", { lp: 700, lpQ: 1.4 }]];
        series("Bass", "", BASS_LIST.map(n => [n, n]), BASS_TREAT, (name, fx, a, n, i) => {
            const [gen, params, extra] = recipe(name, {}, hz(36));
            const out = Object.assign({ rootKey: 36 }, extra || {});
            return Object.keys(fx).length == 0 ? [gen, params, out] : POST(gen, params, fx, out);
        });
        // ---- melodic one-shots
        const melodicSeries = (folder, names, treatments, root) => {
            series(folder, "", names.map(n => [n, n]), treatments, (name, fx, a, n, i) => {
                const [gen, params, extra] = recipe(name, {}, hz(root));
                const out = Object.assign({ rootKey: root }, extra || {});
                // effects that change length make a loop region meaningless
                if (fx.echo || fx.verb)
                    delete out.loop;
                return Object.keys(fx).length == 0 ? [gen, params, out] : POST(gen, params, fx, out);
            });
        };
        const LEAD_LIST = ["Saw Lead", "Square Lead", "Chip Lead", "Hoover Lead", "Flute", "Trumpet", "Ocarina", "Sine Lead", "Whistle Lead", "Glide Lead", "Supersaw Lead", "Acid Lead", "Sync Lead",
            "Vowel Lead", "Distorted Lead", "Bit Lead", "Organ Lead", "Brass Lead", "Pan Flute", "Violin Lead", "Vapor Lead", "Guitar Lead", "Reed Lead", "Sitar", "Koto"];
        melodicSeries("Leads", LEAD_LIST, [["Dry", {}], ["Wide", { chorus: 0.6 }], ["Echo", { echo: 0.5, echoTime: 0.22 }]], 72);
        const PLUCK_LIST = ["Pluck", "Arp Pluck", "Guitar Pluck", "Harp", "Kalimba", "Marimba", "Bell Pluck", "Dark Pluck", "Future Pluck", "House Pluck", "Trance Pluck", "Glass Pluck", "Chip Pluck",
            "Lo-Fi Pluck", "Mallet Pluck", "Synth Pizz", "Muted Guitar", "Water Pluck", "Steel Pluck", "Pizzicato", "Square Pluck", "Wood Pluck", "Steel Pan", "Koto", "Sitar"];
        melodicSeries("Plucks", PLUCK_LIST, [["Dry", {}], ["Space", { verb: 0.35, verbDecay: 2 }], ["Echo", { echo: 0.45, echoTime: 0.19 }]], 60);
        const SYNTH_LIST = ["Poly Synth", "Juno Stab", "Rave Stab", "Detuned Stab", "Synth Brass", "PWM Synth", "FM Synth", "Hyper Synth", "Wobble Synth", "Saw Chord", "Reso Synth", "Lo-Fi Synth", "Glass Synth",
            "Organ Synth", "Sweep Synth", "Vowel Synth", "Chord Stab", "Brass Stab", "Supersaw", "Organ Stab", "Rhodes", "Tape Keys", "Glass Keys", "Strings", "Bright Pad"];
        melodicSeries("Synths", SYNTH_LIST, [["Dry", {}], ["Wide", { chorus: 0.6 }], ["Dirty", { drive: 2.5, crush: 10 }]], 60);
        // Pads: archetype x treatment.
        const PADS = [
            ["Warm", tone({ osc: "saw", voices: 6, detune: 0.22, cutoff: 1600, attack: 0.7, release: 0.8, len: 4, chorus: 0.4 }, { loop: [0.3, 0.9] })],
            ["Bright", MELODIC["Bright Pad"]], ["Dark", MELODIC["Dark Pad"]], ["Choir", MELODIC["Choir"]], ["Vocal", MELODIC["Vocal Pad"]],
            ["Glass", tone({ osc: "fm", ratio: 3, index: 1.2, indexDecay: 3, indexFloor: 0.3, attack: 0.6, len: 4, release: 0.8 }, { loop: [0.3, 0.9] })],
            ["Organ", tone({ osc: "organ", attack: 0.5, release: 0.8, len: 4, chorus: 0.5 }, { loop: [0.3, 0.9] })],
            ["Strings", tone({ osc: "saw", voices: 6, detune: 0.14, cutoff: 3000, attack: 0.6, vib: 0.1, release: 0.8, len: 4, chorus: 0.4 }, { loop: [0.3, 0.9] })],
            ["Supersaw", tone({ osc: "saw", voices: 9, detune: 0.35, cutoff: 7000, attack: 0.4, release: 0.8, len: 4, chorus: 0.4 }, { loop: [0.3, 0.9] })],
            ["Square", tone({ osc: "square", voices: 4, detune: 0.15, cutoff: 2200, attack: 0.6, release: 0.8, len: 4 }, { loop: [0.3, 0.9] })],
            ["Sweep", tone({ osc: "saw", voices: 6, detune: 0.25, cutoff: 500, res: 3, lfoRate: 0.25, lfoDepth: 3, attack: 0.5, release: 0.8, len: 4 }, { loop: [0.1, 0.95] })],
            ["Vapor", tone({ osc: "saw", voices: 6, detune: 0.4, cutoff: 1200, attack: 0.8, vib: 0.1, vibRate: 0.8, release: 0.8, len: 4, chorus: 0.6 }, { loop: [0.3, 0.9] })],
            ["Ambient", tone({ osc: "tri", voices: 5, detune: 0.2, attack: 1, release: 1, len: 4, verb: 0.5, chorus: 0.5 }, { loop: [0.3, 0.9] })],
            ["Air", tone({ osc: "saw", voices: 4, detune: 0.3, cutoff: 900, noise: 0.18, attack: 0.9, release: 1, len: 4, chorus: 0.5 }, { loop: [0.3, 0.9] })],
            ["Bell", tone({ osc: "bell", bellPartials: [[1, 1, 3], [2.76, 0.5, 2], [5.4, 0.25, 1]], attack: 0.3, len: 4, chorus: 0.5, verb: 0.3 })],
        ];
        const PAD_TREAT = [["Soft", { lp: 2500 }], ["Wide", { chorus: 0.7 }], ["Shimmer", { verb: 0.55, verbDecay: 3, verbTail: 1.6 }], ["Filtered", { lp: 900, lpQ: 1.2 }], ["Lo-Fi", { crush: 9, tremolo: 0.15, tremRate: 0.9 }]];
        series("Pads", "Pad", PADS, PAD_TREAT, (fn, fx, a, n, i) => {
            const [gen, params, extra] = fn({ f: hz(60) });
            const out = Object.assign({ rootKey: 60 }, extra || {});
            if (fx.verb)
                delete out.loop;
            return POST(gen, params, fx, out);
        });
        // Keys, bells, strings, brass and winds, guitars: archetype x five treatments through FLGen.post.
        const FIVE_MELODIC = [["Dry", {}], ["Room", { verb: 0.3, verbDecay: 1.4 }], ["Chorus", { chorus: 0.6 }], ["Dark", { lp: 1800 }], ["Tape", { crush: 10, tremolo: 0.1, tremRate: 0.7, lp: 6000 }]];
        const piano = (bright, decay = 1) => [[1, 1, 2.2 * decay], [2, 0.6 * bright, 1.5 * decay], [3, 0.35 * bright, 1.0 * decay], [4, 0.22 * bright, 0.8 * decay], [5, 0.15 * bright, 0.6 * decay], [6, 0.1 * bright, 0.45 * decay], [7, 0.06 * bright, 0.35 * decay], [8, 0.04 * bright, 0.28 * decay]];
        const KEYS = [
            ["Grand Piano", ["additive", { len: 3, inharm: 0.0004, hammer: 0.08, partials: piano(1) }]],
            ["Bright Piano", ["additive", { len: 3, inharm: 0.0005, hammer: 0.12, partials: piano(1.5) }]],
            ["Soft Piano", ["additive", { len: 3, inharm: 0.0003, hammer: 0.03, partials: piano(0.55) }]],
            ["Upright Piano", ["additive", { len: 2.4, inharm: 0.0009, hammer: 0.1, partials: piano(1.1, 0.7) }]],
            ["Rhodes", ["fm", { ratio: 1, index: 1.4, indexDecay: 0.8, indexFloor: 0.25, ratio2: 14, index2: 0.9, index2Decay: 0.04, decay: 2.2, len: 3 }]],
            ["Wurli", ["fm", { ratio: 1, index: 2.4, indexDecay: 0.3, indexFloor: 0.5, decay: 1.4, len: 2.2 }]],
            ["DX Keys", ["fm", { ratio: 1, index: 2.2, indexDecay: 0.5, ratio2: 7, index2: 1.6, index2Decay: 0.08, decay: 1.6, len: 2.5 }]],
            ["Tape Keys", ["tone2", { osc: "fm", ratio: 1, index: 1.1, indexDecay: 0.6, indexFloor: 0.15, decay: 1.6, sustain: 0, len: 2, vib: 0.08, vibRate: 0.8, vibDelay: 0 }]],
            ["Clav", ["pluck", { damping: 0.99, len: 0.9, bright: 9000, body: 1800 }]],
            ["Harpsichord", ["pluck", { damping: 0.996, len: 1.8, bright: 12000, body: 2500 }]],
            ["Celesta", ["additive", { len: 1.6, partials: [[1, 1, 0.9], [4, 0.3, 0.3], [10, 0.08, 0.06]] }]],
            ["Toy Piano", ["additive", { len: 1.2, partials: [[1, 1, 0.5], [3.1, 0.6, 0.25], [6.3, 0.3, 0.1]] }]],
            ["Jazz Organ", ["additive", { len: 2.5, partials: [[0.5, 0.8, 0], [1, 1, 0], [1.5, 0.6, 0], [2, 0.5, 0], [3, 0.3, 0]], vib: 0.004 }, { loop: [0.2, 0.9] }]],
            ["Church Organ", ["additive", { len: 3, attack: 0.08, partials: [[0.5, 0.7, 0], [1, 1, 0], [2, 0.8, 0], [4, 0.5, 0], [8, 0.3, 0], [3, 0.4, 0]] }, { loop: [0.25, 0.9] }]],
            ["Rock Organ", ["additive", { len: 2.5, partials: [[1, 1, 0], [2, 0.9, 0], [3, 0.7, 0], [4, 0.5, 0], [6, 0.4, 0], [8, 0.3, 0]], vib: 0.006 }, { loop: [0.2, 0.9] }]],
        ];
        const fiveSeries = (folder, list, root, treatments = FIVE_MELODIC) => series(folder, "", list, treatments, ([gen, params, extra], fx, a, n, i) => {
            const out = Object.assign({ rootKey: root }, extra || {});
            const p = Object.assign({ f: hz(root) }, params);
            if (fx.verb)
                delete out.loop;
            return Object.keys(fx).length == 0 ? [gen, p, out] : POST(gen, p, fx, out);
        });
        fiveSeries("Keys", KEYS, 60);
        const BELLS = [
            ["Tubular Bell", ["additive", { len: 4, partials: [[1, 0.6, 3], [2.76, 1, 2.4], [5.4, 0.6, 1.6], [8.93, 0.4, 1], [13.3, 0.2, 0.6]] }]],
            ["FM Bell", ["fm", { ratio: 3.5, index: 3, indexDecay: 1.2, decay: 2.6, len: 3.5 }]],
            ["Glass Bell", ["fm", { ratio: 5.19, index: 2, indexDecay: 0.6, decay: 2.2, len: 3 }]],
            ["Chime", ["additive", { len: 3, partials: [[1, 1, 2.2], [2.4, 0.5, 1.3], [5.95, 0.3, 0.6]] }]],
            ["Trap Bell", ["fm", { ratio: 4, index: 2.5, indexDecay: 0.3, decay: 1.2, len: 1.8 }]],
            ["Music Box", ["additive", { len: 2, partials: [[1, 1, 1.1], [2, 0.25, 0.5], [3.9, 0.3, 0.25], [8.1, 0.1, 0.08]] }]],
            ["Glockenspiel", ["additive", { len: 2.2, partials: [[1, 1, 1.4], [2.7, 0.5, 0.6], [5.4, 0.3, 0.3]] }]],
            ["Vibraphone", ["additive", { len: 3, vib: 0.008, partials: [[1, 1, 2.0], [4, 0.35, 0.6], [10, 0.1, 0.2]] }]],
            ["Xylophone", ["additive", { len: 0.8, partials: [[1, 1, 0.3], [3, 0.5, 0.12], [6, 0.2, 0.05]] }]],
            ["Marimba", ["additive", { len: 1.4, partials: [[1, 1, 0.6], [4, 0.3, 0.12]] }]],
            ["Kalimba", ["additive", { len: 1.6, hammer: 0.03, partials: [[1, 1, 0.9], [5.4, 0.25, 0.08], [10.3, 0.08, 0.03]] }]],
            ["Steel Pan", ["additive", { len: 1.6, partials: [[1, 1, 0.9], [2, 0.6, 0.5], [3, 0.3, 0.3], [4.2, 0.25, 0.2], [5.8, 0.12, 0.1]] }]],
            ["Crystal", ["fm", { ratio: 7.1, index: 1.6, indexDecay: 0.4, decay: 2, len: 2.8 }]],
            ["Church Bell", ["additive", { len: 4, partials: [[0.5, 0.5, 3.5], [1, 1, 3], [1.19, 0.6, 2.6], [1.5, 0.4, 2], [2, 0.5, 1.6], [2.5, 0.3, 1.2], [3, 0.25, 0.9]] }]],
            ["Gamelan", ["additive", { len: 2.5, partials: [[1, 1, 1.8], [2.12, 0.5, 1.1], [3.45, 0.4, 0.7], [5.3, 0.2, 0.4]] }]],
        ];
        fiveSeries("Bells & Mallets", BELLS, 72, [["Dry", {}], ["Room", { verb: 0.35, verbDecay: 2 }], ["Echo", { echo: 0.45, echoTime: 0.24 }], ["Dark", { lp: 2500 }], ["Lo-Fi", { crush: 8, lp: 7000 }]]);
        const STRINGS = [
            ["Ensemble", ["tone2", { osc: "saw", voices: 6, detune: 0.14, cutoff: 3000, attack: 0.3, vib: 0.1, release: 0.5, len: 3, chorus: 0.4 }, { loop: [0.3, 0.9] }]],
            ["Staccato", ["tone2", { osc: "saw", voices: 5, detune: 0.12, cutoff: 3500, attack: 0.02, decay: 0.15, sustain: 0, len: 0.5 }]],
            ["Pizzicato", ["tone2", { osc: "ks", damping: 0.978, pick: 2600, len: 0.6 }]],
            ["Cello", ["tone2", { osc: "saw", voices: 2, detune: 0.06, cutoff: 1800, attack: 0.15, vib: 0.18, release: 0.4, len: 3 }, { loop: [0.3, 0.9] }]],
            ["Violin", ["tone2", { osc: "saw", voices: 2, detune: 0.05, cutoff: 4500, attack: 0.12, vib: 0.22, vibRate: 5.8, release: 0.4, len: 3 }, { loop: [0.3, 0.9] }]],
            ["Viola", ["tone2", { osc: "saw", voices: 2, detune: 0.05, cutoff: 3000, attack: 0.14, vib: 0.2, release: 0.4, len: 3 }, { loop: [0.3, 0.9] }]],
            ["Tremolo", ["tone2", { osc: "saw", voices: 5, detune: 0.12, cutoff: 3200, attack: 0.1, release: 0.4, len: 3 }, { loop: [0.3, 0.9] }]],
            ["Spiccato", ["tone2", { osc: "saw", voices: 4, detune: 0.1, cutoff: 3000, attack: 0.01, decay: 0.08, sustain: 0, len: 0.3 }]],
            ["Swell", ["tone2", { osc: "saw", voices: 6, detune: 0.14, cutoff: 2600, attack: 1.4, release: 0.5, len: 3.5, chorus: 0.3 }, { loop: [0.5, 0.9] }]],
            ["Synth Strings", ["tone2", { osc: "saw", voices: 8, detune: 0.3, cutoff: 5000, attack: 0.25, release: 0.6, len: 3, chorus: 0.6 }, { loop: [0.3, 0.9] }]],
            ["String Machine", ["tone2", { osc: "saw", voices: 3, detune: 0.1, cutoff: 2600, attack: 0.2, release: 0.6, len: 3, chorus: 0.9 }, { loop: [0.3, 0.9] }]],
            ["Octave Strings", ["tone2", { osc: "saw", voices: 3, detune: 0.12, chord: [0, 12], cutoff: 3500, attack: 0.25, vib: 0.1, release: 0.5, len: 3 }, { loop: [0.3, 0.9] }]],
            ["Legato", ["tone2", { osc: "saw", voices: 4, detune: 0.1, cutoff: 3200, attack: 0.08, vib: 0.15, release: 0.3, len: 2.5 }, { loop: [0.3, 0.9] }]],
            ["Dark Strings", ["tone2", { osc: "saw", voices: 5, detune: 0.14, cutoff: 1300, attack: 0.4, release: 0.6, len: 3 }, { loop: [0.3, 0.9] }]],
            ["High Strings", ["tone2", { osc: "saw", voices: 5, detune: 0.1, cutoff: 6000, attack: 0.25, vib: 0.14, release: 0.5, len: 3 }, { loop: [0.3, 0.9] }]],
        ];
        fiveSeries("Strings", STRINGS, 60, [["Dry", {}], ["Hall", { verb: 0.4, verbDecay: 2.4 }], ["Wide", { chorus: 0.6 }], ["Soft", { lp: 1800 }], ["Lo-Fi", { crush: 9, tremolo: 0.12, tremRate: 0.8, lp: 6000 }]]);
        const BRASS = [
            ["Brass Section", ["synth", { len: 2, voices: 4, detune: 0.1, filterEnv: [5000, 1700, 0.15], attack: 0.05 }, { loop: [0.3, 0.9] }]],
            ["Trumpet", ["tone2", { osc: "saw", cutoff: 1500, filterEnv: 3500, filterDecay: 0.15, attack: 0.04, vib: 0.12, len: 1.8, release: 0.15 }, { loop: [0.3, 0.9] }]],
            ["Muted Trumpet", ["tone2", { osc: "saw", cutoff: 900, filterEnv: 1500, filterDecay: 0.15, attack: 0.04, vib: 0.12, len: 1.8, release: 0.15 }, { loop: [0.3, 0.9] }]],
            ["Trombone", ["tone2", { osc: "saw", cutoff: 1000, filterEnv: 2200, filterDecay: 0.2, attack: 0.06, vib: 0.1, len: 2, release: 0.2 }, { loop: [0.3, 0.9] }]],
            ["French Horn", ["tone2", { osc: "saw", voices: 2, detune: 0.04, cutoff: 800, attack: 0.12, vib: 0.08, len: 2.4, release: 0.3 }, { loop: [0.3, 0.9] }]],
            ["Brass Stab", ["tone2", { osc: "saw", voices: 4, detune: 0.1, chord: [0, 4, 7], cutoff: 1200, filterEnv: 4500, filterDecay: 0.12, attack: 0.02, decay: 0.4, sustain: 0.3, len: 0.9 }]],
            ["Sax", ["tone2", { osc: "square", width: 0.3, cutoff: 2200, res: 1.3, filterEnv: 1800, filterDecay: 0.2, attack: 0.04, vib: 0.2, noise: 0.03, len: 2, release: 0.15 }, { loop: [0.3, 0.9] }]],
            ["Flute", ["tone2", { osc: "sine", attack: 0.08, vib: 0.18, vibDelay: 0.2, noise: 0.05, len: 2, release: 0.2 }, { loop: [0.3, 0.9] }]],
            ["Pan Flute", ["additive", { len: 2, attack: 0.08, vib: 0.006, partials: [[1, 1, 0], [3, 0.08, 0]] }, { loop: [0.25, 0.9] }]],
            ["Clarinet", ["synth", { len: 2, wave: "square", voices: 1, cutoff: 2200, attack: 0.05, vib: 0.004 }, { loop: [0.25, 0.9] }]],
            ["Oboe", ["vowel", { len: 2, seq: ["e", "e"], breath: 0.02 }, { loop: [0.25, 0.85] }]],
            ["Ocarina", ["additive", { len: 2, attack: 0.05, vib: 0.01, partials: [[1, 1, 0], [2, 0.03, 0]] }, { loop: [0.25, 0.9] }]],
            ["Recorder", ["tone2", { osc: "tri", attack: 0.05, vib: 0.1, noise: 0.03, len: 1.8, release: 0.15 }, { loop: [0.25, 0.9] }]],
            ["Synth Brass", ["tone2", { osc: "saw", voices: 3, detune: 0.1, chord: [0, 7], cutoff: 900, filterEnv: 3500, filterDecay: 0.25, attack: 0.05, len: 1.6, release: 0.2 }, { loop: [0.3, 0.9] }]],
            ["Horn Swell", ["synth", { len: 2.5, voices: 2, detune: 0.06, cutoff: 1500, attack: 0.5 }, { loop: [0.3, 0.9] }]],
        ];
        fiveSeries("Brass & Winds", BRASS, 60, [["Dry", {}], ["Room", { verb: 0.3, verbDecay: 1.6 }], ["Soft", { lp: 1500 }], ["Bright", { hp: 300, drive: 1 }], ["Tremolo", { tremolo: 0.25, tremRate: 5.5 }]]);
        const GUITARS = [
            ["Nylon", ["pluck", { damping: 0.997, len: 2.4, body: 700, bright: 3500 }]],
            ["Clean", ["pluck", { damping: 0.998, len: 2.6, body: 1100, bright: 6000 }]],
            ["Muted", ["pluck", { damping: 0.97, len: 0.35, body: 900, bright: 3000 }]],
            ["Funk", ["pluck", { damping: 0.985, len: 0.5, body: 1600, bright: 8000 }]],
            ["Jangle", ["tone2", { osc: "ks", damping: 0.997, pick: 7000, len: 2.2, chorus: 0.6 }]],
            ["Power Chord", ["tone2", { osc: "saw", voices: 2, detune: 0.08, chord: [0, 7, 12], cutoff: 2800, drive: 6, len: 2, release: 0.2 }, { loop: [0.2, 0.9] }]],
            ["Crunch", ["tone2", { osc: "ks", damping: 0.996, pick: 6000, len: 2, drive: 4 }]],
            ["Distorted", ["tone2", { osc: "ks", damping: 0.998, pick: 7000, len: 2.2, drive: 9 }]],
            ["Fuzz", ["tone2", { osc: "saw", cutoff: 3000, drive: 10, len: 2, release: 0.2 }, { loop: [0.2, 0.9] }]],
            ["Lo-Fi", ["tone2", { osc: "ks", damping: 0.996, pick: 2500, len: 1.8, crush: 9, chorus: 0.4 }]],
            ["Steel", ["tone2", { osc: "ks", damping: 0.998, pick: 9000, len: 2.4 }]],
            ["Sitar", ["tone2", { osc: "ks", damping: 0.998, pick: 11000, len: 2.4, drive: 0.8 }]],
            ["Koto", ["pluck", { damping: 0.995, len: 1.8, bright: 7000, body: 1200 }]],
            ["Banjo", ["pluck", { damping: 0.985, len: 0.9, bright: 10000, body: 2400 }]],
            ["12-String", ["tone2", { osc: "ks", damping: 0.997, pick: 7000, chord: [0, 12], len: 2.4 }]],
        ];
        fiveSeries("Guitars", GUITARS, 48, [["Dry", {}], ["Room", { verb: 0.3, verbDecay: 1.4 }], ["Chorus", { chorus: 0.7 }], ["Drive", { drive: 4, lp: 5000 }], ["Dark", { lp: 1500 }]]);
        // Chords: timbres x chord types.
        const CHORD_TYPES = [["Minor 7", [0, 3, 7, 10]], ["Major 7", [0, 4, 7, 11]], ["Minor 9", [0, 3, 7, 10, 14]], ["Sus 4", [0, 5, 7, 12]], ["Add 9", [0, 4, 7, 14]]];
        const CHORD_TIMBRES = [
            ["Piano", (c) => ["chordAdd", { f: hz(60), chord: c, len: 2.5, inharm: 0.0004, hammer: 0.05, partials: piano(0.9) }]],
            ["Rhodes", (c) => ["tone2", { f: hz(60), chord: c, osc: "fm", ratio: 1, index: 1.2, indexDecay: 0.7, indexFloor: 0.2, decay: 1.8, sustain: 0, len: 2.2, chorus: 0.3 }]],
            ["Organ", (c) => ["tone2", { f: hz(60), chord: c, osc: "organ", decay: 0.6, sustain: 0.5, len: 1.5 }]],
            ["Pad", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 3, detune: 0.2, cutoff: 1800, attack: 0.4, release: 0.6, len: 3, chorus: 0.4, verb: 0.3 }]],
            ["Pluck", (c) => ["tone2", { f: hz(60), chord: c, osc: "square", width: 0.35, cutoff: 700, filterEnv: 7000, filterDecay: 0.06, decay: 0.25, sustain: 0, len: 0.8, verb: 0.2 }]],
            ["Brass", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 3, detune: 0.08, cutoff: 1300, filterEnv: 4200, filterDecay: 0.12, attack: 0.02, decay: 0.45, sustain: 0.35, len: 1 }]],
            ["Strings", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 3, detune: 0.12, cutoff: 2800, attack: 0.3, vib: 0.1, release: 0.5, len: 3 }]],
            ["Supersaw", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 5, detune: 0.3, cutoff: 7000, len: 1.8, chorus: 0.4, release: 0.2 }]],
            ["Juno", (c) => ["tone2", { f: hz(60), chord: c, osc: "square", width: 0.4, pwm: 0.2, cutoff: 1500, filterEnv: 4000, filterDecay: 0.15, decay: 0.5, sustain: 0.2, len: 1.2, chorus: 0.6 }]],
            ["Guitar", (c) => ["tone2", { f: hz(60), chord: c, osc: "ks", damping: 0.997, pick: 5000, len: 2.2 }]],
            ["Glass", (c) => ["tone2", { f: hz(60), chord: c, osc: "fm", ratio: 5.19, index: 1.4, indexDecay: 0.5, decay: 1.8, sustain: 0, len: 2.4, verb: 0.25 }]],
            ["Lo-Fi Keys", (c) => ["tone2", { f: hz(60), chord: c, osc: "fm", ratio: 1, index: 1.1, indexDecay: 0.6, indexFloor: 0.15, decay: 1.6, sustain: 0, len: 2, vib: 0.08, vibRate: 0.8, vibDelay: 0, crush: 10, chorus: 0.4 }]],
            ["House Organ", (c) => ["tone2", { f: hz(60), chord: c, osc: "organ", drawbars: [[1, 1], [2, 0.6], [3, 0.4], [4, 0.3]], decay: 0.25, sustain: 0.15, len: 0.7 }]],
            ["Detuned", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 7, detune: 0.45, cutoff: 2500, filterEnv: 5000, filterDecay: 0.15, decay: 0.4, sustain: 0.2, len: 1 }]],
            ["Choir", (c) => ["tone2", { f: hz(60), chord: c, osc: "saw", voices: 2, detune: 0.1, cutoff: 1100, res: 2.2, attack: 0.3, vib: 0.12, release: 0.5, len: 2.5, chorus: 0.5, verb: 0.3 }]],
        ];
        series("Chords", "", CHORD_TIMBRES, CHORD_TYPES.map(([n, c]) => [n, c]), (make, chord, a, n, i) => {
            const [gen, params] = make(chord);
            return [gen, params, { rootKey: 60 }];
        });
        // ---- vocals
        const SYLLABLES = [
            ["La", "l", ["a"]], ["Na", "n", ["a"]], ["Da", "d", ["a"]], ["Ba", "b", ["a", "a"]], ["Mm", "m", ["u"]], ["Wo", "w", ["o"]], ["Ya", "y", ["a"]], ["Hey", "h", ["e", "i"]],
            ["Oh", null, ["o", "u"]], ["Sa", "s", ["a"]], ["Ka", "k", ["a"]], ["Pa", "p", ["a"]], ["Ta", "t", ["a"]], ["Ma", "m", ["a"]], ["Shi", "sh", ["i"]],
        ];
        const VOICES = [["Male", 50, false, {}], ["Female", 64, true, {}], ["High", 72, true, { contour: [0, 1] }], ["Breathy", 60, true, { breath: 0.25 }], ["Wet", 57, false, { verb: 0.45 }]];
        series("Vocal Chops", "Vox", SYLLABLES.map(([n, cons, vowels]) => [n, { cons, vowels }]), VOICES.map(([n, root, female, extra]) => [n, { root, female, extra }]), (syl, voice, a, n, i) => {
            const params = Object.assign({ f: hz(voice.root), female: voice.female, len: [0.45, 0.5, 0.55, 0.6][i % 4] }, syl, voice.extra);
            if (!params.cons)
                delete params.cons;
            return ["syllable", params, { rootKey: voice.root }];
        });
        // ---- FX
        const RISERS = [
            ["Riser", FXR["Riser"]({})], ["Noise Riser", FXR["Noise Riser"]({})], ["Stutter Riser", FXR["Stutter Riser"]({})], ["Tonal Riser", FXR["Riser"]({ tone: 0.8, voices: 5, detune: 0.02 })],
            ["Siren Riser", ["fx2", { type: "riser", f0: 600, f1: 7000, q: 6, len: 4, tone: 0.6, toneF0: 220, toneF1: 1760, wave: "square", voices: 2 }]],
            ["Sub Riser", FXR["Riser"]({ sub: 0.7, subF0: 40, subF1: 110 })], ["Laser Riser", ["fx2", { type: "riser", f0: 1000, f1: 12000, q: 8, len: 3, tone: 0.5, toneF0: 400, toneF1: 4000, wave: "saw", voices: 1 }]],
            ["Wash Riser", FXR["Noise Riser"]({ verb: 0.5 })], ["Pulse Riser", FXR["Stutter Riser"]({ stutter: 8 })],
            ["Downlifter", FXR["Downlifter"]({})], ["Tonal Downlifter", FXR["Downlifter"]({ tone: 0.6, toneF0: 1760, toneF1: 110, voices: 3 })], ["Sub Downlifter", FXR["Downlifter"]({ sub: 0.9 })],
            ["Air Fall", FXR["Downlifter"]({ q: 0.8, f0: 12000, f1: 400 })], ["Dark Fall", FXR["Downlifter"]({ f0: 3000, f1: 120, lp: 3000 })], ["Long Fall", FXR["Downlifter"]({ len: 6 })],
        ];
        const FX_TREAT = [["2 Bars", { len: 2 }], ["4 Bars", { len: 4 }], ["Long", { len: 7 }], ["Wide", { voices: 6, detune: 0.03 }], ["Big", { verb: 0.45 }]];
        series("Risers & Downlifters", "", RISERS, FX_TREAT, ([gen, params], mods, a, n, i) => [gen, Object.assign({}, params, mods)]);
        const IMPACTS = [
            ["Impact", FXR["Impact"]({})], ["Sub Drop", FXR["Sub Drop"]({})], ["Boom", ["drum2", { body: { start: 120, end: 32, sweep: 0.08, decay: 1.4 }, click: 0.4, drive: 2, room: 0.4, roomDecay: 2, len: 3 }]],
            ["Noise Hit", ["noiseHit", { hp: 200, lp: 9000, decay: 0.6, len: 2.5 }]], ["Metal Impact", ["hat2", { f: 120, ratios: [1, 1.41, 2.06, 2.73, 3.3, 4.1], decay: 1.4, bp: 2500, q: 0.4, hp: 300, noise: 0.3, len: 3, ringMod: true }]],
            ["Thunder", ["fx2", { type: "burst", f0: 900, f1: 80, q: 0.6, decay: 1.6, len: 4, sub: 0.6, subF0: 60, subF1: 28, verb: 0.5, lp: 3000 }]],
            ["Cinematic Hit", FXR["Impact"]({ decay: 0.9, sub: 1.4, verb: 0.6, len: 5 })], ["Laser Impact", FXR["Impact"]({ tone: 0.6, toneF0: 3000, toneF1: 100, wave: "saw" })],
            ["Distorted Impact", FXR["Impact"]({ drive: 4 })], ["Short Impact", FXR["Impact"]({ decay: 0.2, len: 1.2 })], ["Deep Drop", FXR["Sub Drop"]({ subF0: 160, subF1: 24, len: 4 })],
            ["Glass Smash", ["hat2", { f: 900, ratios: [1, 1.7, 2.9, 3.7, 5.1, 6.6], decay: 0.5, bp: 7000, q: 0.5, hp: 2500, noise: 0.7, len: 1.5, ringMod: true, sizzle: 0.6 }]],
            ["Door Slam", ["drum2", { body: { start: 90, end: 60, decay: 0.12 }, noise: { amp: 1, bp: 600, q: 0.6, hp: 80, lp: 4000, decay: 0.12 }, click: 0.4, room: 0.45, roomDecay: 1.4, len: 1.6 }]],
            ["Reverse Impact", FXR["Impact"]({ reverse: true })], ["Gun Hit", ["noiseHit", { hp: 300, lp: 6000, decay: 0.12, len: 0.8 }]],
        ];
        const IMPACT_TREAT = [["Dry", {}], ["Big", { verb: 0.5, verbDecay: 3 }], ["Dark", { lp: 1800 }], ["Crushed", { crush: 7, drive: 1 }], ["Tight", { gate: 0.6 }]];
        series("Impacts", "", IMPACTS, IMPACT_TREAT, ([gen, params], fx, a, n, i) => Object.keys(fx).length == 0 ? [gen, params] : POST(gen, params, fx));
        const SWEEPS = [
            ["Sweep Up", FXR["Sweep"]({})], ["Sweep Down", FXR["Sweep"]({ f0: 7000, f1: 300 })], ["Whoosh", ["whoosh", { f0: 500, f1: 5000, len: 1.6, skew: 0.8 }]], ["Fast Swish", ["whoosh", { f0: 800, f1: 9000, len: 0.4, skew: 0.8 }]],
            ["Tape Stop", ["pitchFX", { f0: 220, f1: 20, len: 1, wave: "saw", curve: 2, hold: 0.85 }]], ["Spin Back", ["pitchFX", { f0: 2000, f1: 50, len: 0.8, wave: "saw", curve: 0.3, hold: 0.7 }]],
            ["Scratch", ["pitchFX", { f0: 300, f1: 1400, len: 0.3, wave: "saw", lfo: 9, lfoDepth: 1.4, hold: 0.7, drive: 1 }]], ["Reverse Swell", FXR["Reverse Swell"]({})],
            ["Filter Sweep", ["fx2", { type: "sweep", f0: 200, f1: 9000, q: 6, len: 2.5, tone: 0.4, toneF0: 110, toneF1: 110, wave: "saw", voices: 3, detune: 0.01 }]],
            ["Stutter Sweep", ["fx2", { type: "sweep", f0: 300, f1: 7000, q: 2, len: 2, stutter: 8 }]], ["Power Down", ["pitchFX", { f0: 600, f1: 40, len: 1.2, wave: "saw", curve: 0.6, hold: 0.7, drive: 1 }]],
            ["Power Up", ["pitchFX", { f0: 100, f1: 1600, len: 0.8, wave: "saw", curve: 1.5, hold: 0.9 }]], ["Zap", FXR["Zap"]({})],
            ["Air Pass", ["whoosh", { f0: 2000, f1: 12000, q: 0.8, len: 1.2, skew: 0.5 }]], ["Low Pass", ["whoosh", { f0: 150, f1: 1200, q: 1.2, len: 1.8, skew: 0.7 }]],
        ];
        const SWEEP_TREAT = [["Dry", {}], ["Wide", { chorus: 0.7 }], ["Space", { verb: 0.45, verbDecay: 2.2 }], ["Echo", { echo: 0.5, echoTime: 0.18 }], ["Crushed", { crush: 7 }]];
        series("Sweeps & Transitions", "", SWEEPS, SWEEP_TREAT, ([gen, params], fx, a, n, i) => Object.keys(fx).length == 0 ? [gen, params] : POST(gen, params, fx));
        const TEXTURES = [
            ["Drift", FXR["Texture"]({})], ["Glow", FXR["Texture"]({ f0: 400, f1: 6000, tone: 0.5 })], ["Wind", ["wind", { len: 6 }]], ["Dark Wind", ["wind", { len: 6, base: 200, rate: 0.12 }]],
            ["Rain", ["crackle", { len: 6 }]], ["Drone", ["tone2", { f: hz(36), osc: "saw", voices: 5, detune: 0.2, cutoff: 500, res: 1.5, lfoRate: 0.07, lfoDepth: 2, attack: 1.5, release: 1.5, len: 6, chorus: 0.5 }]],
            ["Vinyl Noise", ["crackle", { len: 5 }]], ["Space", ["tone2", { f: hz(48), osc: "tri", voices: 6, detune: 0.3, attack: 2, release: 2, len: 6, verb: 0.6, chorus: 0.6 }]],
            ["Shimmer", ["tone2", { f: hz(72), osc: "sine", chord: [0, 7, 12, 19], attack: 1.5, release: 2, len: 6, vib: 0.1, vibRate: 0.4, verb: 0.7 }]],
            ["Ocean", ["wind", { len: 6, base: 350, rate: 0.09 }]], ["Radio", FXR["Texture"]({ f0: 900, f1: 2600, q: 8, rate: 0.6 })], ["Machine Hum", ["tone2", { f: 55, osc: "saw", cutoff: 300, noise: 0.05, len: 6, attack: 0.8, release: 1 }]],
            ["Bubbles", FXR["Texture"]({ f0: 300, f1: 2000, q: 12, rate: 1.2 })], ["Choir Air", ["vowel", { f: hz(55), seq: ["a", "o", "u", "a"], len: 6, attack: 1.2, release: 1.2, breath: 0.4, verb: 0.6 }]], ["Static", FXR["Texture"]({ f0: 3000, f1: 9000, q: 1.5, rate: 0.4 })],
        ];
        const TEXTURE_TREAT = [["Calm", { lp: 3000 }], ["Wide", { chorus: 0.7 }], ["Deep", { verb: 0.5, verbDecay: 3.5, verbTail: 1.5 }], ["Pulsing", { tremolo: 0.6, tremRate: 2 }], ["Lo-Fi", { crush: 8, lp: 6000 }]];
        series("Textures & Atmospheres", "", TEXTURES, TEXTURE_TREAT, ([gen, params], fx, a, n, i) => POST(gen, params, fx));
        const FOLEY = [
            ["Paper Crumple", ["crackle", { len: 0.8 }]], ["Glass Tap", ["tones", { partials: [[2850, 1, 0.45], [6700, 0.5, 0.25], [10400, 0.2, 0.1]], click: 0.3, len: 0.9 }]],
            ["Metal Pipe", ["tones", { partials: [[523, 1, 1.4], [1430, 0.6, 1], [2789, 0.4, 0.7], [4610, 0.2, 0.4]], click: 0.4, len: 2 }]],
            ["Wood Knock", ["drum2", { body: { start: 210, end: 170, decay: 0.05 }, noise: { amp: 0.5, bp: 800, hp: 150, lp: 2500, decay: 0.02 }, click: 0.3, len: 0.25 }]],
            ["Key Turn", ["hat2", { f: 1900, decay: 0.08, bp: 6000, hp: 3500, noise: 0.5, len: 0.3, sizzle: 0.3 }]],
            ["Door Creak", ["pitchFX", { f0: 180, f1: 260, len: 1.2, wave: "saw", lfo: 23, lfoDepth: 0.3, hold: 0.85 }]],
            ["Pen Click", ["drum2", { body: { start: 2600, end: 2500, decay: 0.006 }, noise: { amp: 0.5, hp: 2500, lp: 12000, decay: 0.004 }, click: 0.8, len: 0.06 }]],
            ["Drawer", ["guiro", { bp: 900, scrapes: 14, span: 0.4, len: 0.6 }]], ["Gravel Step", ["noiseHit", { bp: 1500, q: 0.6, hp: 300, decay: 0.08, bursts: [0, 0.015, 0.03, 0.05], len: 0.3 }]],
            ["Book Close", ["drum2", { body: { start: 110, end: 70, decay: 0.08 }, noise: { amp: 1, bp: 900, q: 0.6, hp: 100, lp: 4000, decay: 0.08 }, click: 0.3, len: 0.5 }]],
            ["Cloth Rustle", ["noiseHit", { hp: 1500, lp: 7000, decay: 0.25, attack: 0.08, len: 0.5 }]], ["Water Splash", ["noiseHit", { hp: 800, lp: 9000, decay: 0.3, attack: 0.005, len: 0.8 }]],
            ["Bottle Clink", ["tones", { partials: [[1760, 1, 0.3], [4300, 0.6, 0.15], [7200, 0.3, 0.07]], click: 0.4, len: 0.6 }]],
            ["Phone Buzz", ["pitchFX", { f0: 170, f1: 170, len: 0.6, wave: "square", lfo: 30, lfoDepth: 0.05, hold: 0.9 }]],
            ["Clock Tick", ["tones", { partials: [[3100, 1, 0.006], [5200, 0.5, 0.004]], click: 0.5, len: 0.06 }]],
        ];
        const FOLEY_TREAT = [["Close", {}], ["Room", { verb: 0.3, verbDecay: 1 }], ["Distant", { lp: 2500, verb: 0.4 }], ["Bright", { hp: 1200 }], ["Lo-Fi", { crush: 8 }]];
        series("Foley", "", FOLEY, FOLEY_TREAT, ([gen, params], fx, a, n, i) => Object.keys(fx).length == 0 ? [gen, params] : POST(gen, params, fx));
        // ---- loops built from the Essentials drums
        let essPaths = null;
        const essKey = (folder, name) => {
            if (!essPaths) {
                essPaths = new Map();
                for (const item of flCatalog)
                    if (item.path.startsWith(ESS + "/"))
                        essPaths.set(item.path, item.key);
            }
            const key = essPaths.get(ESS + "/" + folder + "/" + name);
            if (!key)
                throw new Error("Sound Library 4: missing " + folder + "/" + name);
            return key;
        };
        // genre: bpm, steps, kick, snare, hat, extra lane, swing; patterns are 32 steps (2 bars of 16ths at steps 16) or 32ths
        const LOOP_STYLES = [
            ["Trap", 140, 32, "Kick Trap Saturated", "Snare Trap Crack", "Hat Trap Tight", "Open Hat Trap Short", 0,
                ["x.......x.x.......x.....x.......", "........x...............x.......", "x.x.x.x.x.x.xxx.x.x.x.x.x.xxxxx.", "..............x...............x."]],
            ["Drill", 142, 32, "Kick Punch Tight", "Snare Drill Crack", "Hat Crisp Tight", "Open Hat Crisp Short", 0,
                ["x.........x.......x.............", "............x...............x...", "x..x..x.x..x..x.x..x..x.x.x..x..", "......................x........."]],
            ["Boom Bap", 90, 16, "Kick Boom Bap Dark", "Snare Boom Bap Fat", "Hat Dusty Tight", "Open Hat Dusty Short", 0.14,
                ["x.....x...x.....x.....x.x.......", "....x.......x.......x.......x...", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.xx", "..............x................."]],
            ["Lo-Fi", 80, 16, "Kick Lo-Fi Dark", "Snare Lo-Fi Tight", "Hat Tape Lo-Fi", "Open Hat Tape Soft", 0.18,
                ["x......x..x.....x......x........", "....x.......x.......x.......x...", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "..............................x."]],
            ["House", 124, 16, "Kick House Tight", "Clap House Room", "Hat 909 Tight", "Open Hat 909 Short", 0,
                ["x...x...x...x...x...x...x...x...", "....x.......x.......x.......x...", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "..x...x...x...x...x...x...x...x."]],
            ["Techno", 130, 16, "Kick Techno Saturated", "Clap Distant Dry", "Hat Metal Tight", "Open Hat Metal Short", 0,
                ["x...x...x...x...x...x...x...x...", "....x.......x.......x.......x...", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "..x...x...x...x...x...x...x...x."]],
            ["Drum & Bass", 174, 16, "Kick Punch Bright", "Snare DnB Crack", "Hat Crisp Tight", "Open Hat Crisp Short", 0,
                ["x.........x.....x.........x.....", "....x.......x.......x.......x...", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "..............x..............x.."]],
            ["Reggaeton", 95, 16, "Kick Trap Tight", "Snare Rim Layer Tight", "Hat Analog Tight", "Open Hat Analog Short", 0,
                ["x...x...x...x...x...x...x...x...", "...x..x....x..x....x..x....x..x.", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "................................"]],
            ["Afrobeats", 105, 16, "Kick Deep Tight", "Snare Rim Layer Dark", "Hat Shaker Hat Tight", "Open Hat Shuffle Short", 0.08,
                ["x.....x...x.....x.....x...x.....", "...x..x....x..x....x..x....x..x.", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "......x.x.....x.......x.x.....x."]],
            ["UK Garage", 132, 16, "Kick House Bright", "Snare House Tight", "Hat Shuffle Tight", "Open Hat Shuffle Short", 0.2,
                ["x.......x.x.....x.......x.x.....", "....x.......x.......x.......x...", "..x..xx...x..xx...x..xx...x..xx.", "..............x..............x.."]],
            ["Jersey Club", 140, 16, "Kick Punch Saturated", "Clap Snappy Dry", "Hat Trap Tight", "Open Hat Trap Short", 0,
                ["x...x...x.x.x...x...x...x.x.x...", "....x.......x.......x.......x...", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "................................"]],
            ["Phonk", 130, 32, "Kick Distorted Dark", "Clap Lo-Fi Short", "Hat Dusty Bright", "Open Hat Dusty Trashy", 0,
                ["x.....x...x.....x.....x.x.......", "........x...............x.......", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "................................"]],
            ["Breakbeat", 136, 16, "Kick Acoustic Bright", "Snare Acoustic Crack", "Hat Analog Bright", "Open Hat Analog Trashy", 0.05,
                ["x.x.......xx....x.x...x...x.....", "....x..x.x..x..x....x..x.x..x..x", "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", "................................"]],
            ["Funk", 100, 16, "Kick Acoustic Tight", "Snare Acoustic Fat", "Hat Soft Tight", "Open Hat Soft Short", 0.1,
                ["x..x..x...x..x..x..x..x...x..x..", "....x..x.x..x.......x..x.x..x...", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "................................"]],
            ["Hardstyle", 150, 16, "Kick Hardstyle Long", "Clap Big Room Room", "Hat Crisp Bright", "Open Hat Crisp Long", 0,
                ["x...x...x...x...x...x...x...x...", "....x.......x.......x.......x...", "..x...x...x...x...x...x...x...x.", "................................"]],
        ];
        // five variations of each groove: as written, half the hats, fills, sparse, busy percussion
        const LOOP_VARIANTS = [
            ["Groove", (lanes) => lanes],
            ["Sparse", (lanes) => lanes.map((l, i) => i == 2 ? Object.assign({}, l, { pattern: l.pattern.replace(/x(.)x/g, "x$1.") }) : l)],
            ["Fill", (lanes) => lanes.map((l, i) => i == 1 ? Object.assign({}, l, { pattern: l.pattern.slice(0, 24) + "x.x.xxxx" }) : l)],
            ["Ghost", (lanes) => lanes.map((l, i) => i == 1 ? Object.assign({}, l, { pattern: l.pattern.split("").map((c, k) => c == "." && k % 4 == 3 ? "-" : c).join("") }) : l)],
            ["Perc", (lanes, rimKey) => lanes.concat([{ sound: rimKey, pattern: "...x..x....x.x.....x..x....x..x.", gain: 0.45 }])],
        ];
        const rimKey = essKey("Rims & Snaps", "Rim Dry");
        series("Drum Loops", "", LOOP_STYLES.map(s => [s[0], s]), LOOP_VARIANTS, (style, vary, a, n, i) => {
            const [genre, bpm, steps, kick, snare, hat, ohat, swing, patterns] = style;
            const kickFolder = "Kicks";
            const snareFolder = /^Clap/.test(snare) ? "Claps" : "Snares";
            let lanes = [
                { sound: essKey(kickFolder, kick), pattern: patterns[0], gain: 1 },
                { sound: essKey(snareFolder, snare), pattern: patterns[1], gain: 0.85 },
                { sound: essKey("Hats", hat), pattern: patterns[2], gain: 0.4 },
                { sound: essKey("Open Hats", ohat), pattern: patterns[3], gain: 0.4 },
            ];
            lanes = vary(lanes, rimKey);
            // "-" marks a ghost note: a quiet hit ("x" is full, "o" medium, anything else quiet)
            lanes = lanes.map(l => Object.assign({}, l, { pattern: l.pattern.replace(/-/g, "g") }));
            const spec = { bpm, steps: steps == 32 ? 32 : 16, bars: steps == 32 ? 1 : 2, lanes, swing };
            if (steps != 32)
                for (const l of spec.lanes)
                    l.pattern = l.pattern.slice(0, 32);
            return ["loop", spec, { bpm }];
        }, 75);
        // Melodic loops: progressions and riffs played by five instruments.
        const voiceOf = (name) => {
            switch (name) {
                case "Keys": return { gen: "fm", params: { f: C4, ratio: 1, index: 1.4, indexDecay: 0.8, indexFloor: 0.25, decay: 2, len: 2 }, tail: 0.4, gain: 0.5 };
                case "Pluck": return { gen: "synth", params: { f: C4, voices: 2, detune: 0.1, filterEnv: [9000, 500, 0.08], decay: 0.3 }, tail: 0.3, gain: 0.5 };
                case "Pad": return { gen: "synth", params: { f: C4, voices: 3, detune: 0.2, cutoff: 1800, attack: 0.3 }, tail: 0.1, gain: 0.45 };
                case "Bell": return { gen: "fm", params: { f: C4, ratio: 3.5, index: 2, indexDecay: 0.6, decay: 1.2, len: 1.4 }, tail: 0.6, gain: 0.45 };
                default: return { gen: "pluck", params: { f: C4, damping: 0.996, bright: 4000, body: 900 }, tail: 0.3, gain: 0.55 };
            }
        };
        // [name, bpm, beats, notes [[start, length, semitones...]]] in C (minor ones in C minor)
        const chordsOf = (degrees, beatsEach) => degrees.map((chord, i) => [i * beatsEach, beatsEach].concat(chord));
        const PROGRESSIONS = [
            ["Pop Progression", 120, 16, chordsOf([[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], 4)],
            ["Sad Progression", 85, 16, chordsOf([[-3, 0, 4], [-7, -3, 0], [-12, -8, -5], [-5, -1, 2]], 4)],
            ["Jazz ii-V-I", 95, 16, chordsOf([[2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11], [0, 4, 7, 11]], 4)],
            ["Lo-Fi Sevenths", 80, 16, chordsOf([[-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5], [0, 4, 7, 11]], 4)],
            ["Minor Epic", 140, 16, chordsOf([[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], 4)],
            ["House Chords", 124, 16, chordsOf([[0, 3, 7, 10], [0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9]], 4)],
            ["Dark Trap", 140, 16, chordsOf([[0, 3, 7], [1, 5, 8], [0, 3, 7], [-1, 3, 6]], 4)],
            ["Gospel Turn", 76, 16, chordsOf([[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]], 4)],
            ["Uplifting", 128, 16, chordsOf([[5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16]], 4)],
            ["Neo Soul", 90, 16, chordsOf([[2, 5, 9, 12, 16], [-5, -1, 2, 5, 9], [0, 4, 7, 11, 14], [-3, 0, 4, 7, 11]], 4)],
            ["Arp Up", 128, 8, Array.from({ length: 16 }, (_, k) => [k * 0.5, 0.5, [0, 3, 7, 12, 15, 12, 7, 3][k % 8]])],
            ["Arp Bounce", 110, 8, Array.from({ length: 16 }, (_, k) => [k * 0.5, 0.5, [0, 7, 12, 7, 3, 10, 15, 10][k % 8]])],
            ["Melody Hook", 100, 8, [[0, 1, 7], [1, 0.5, 10], [1.5, 0.5, 12], [2, 1, 10], [3, 1, 7], [4, 1.5, 5], [5.5, 0.5, 3], [6, 2, 5]]],
            ["Bell Melody", 140, 16, [[0, 1, 14], [1, 0.5, 17], [1.5, 0.5, 21], [2, 1, 19], [3, 1, 17], [4, 1.5, 14], [6, 1, 12], [7, 1, 14], [8, 1, 14], [9, 0.5, 17], [9.5, 0.5, 21], [10, 1, 22], [11, 1, 21], [12, 2, 17], [14, 2, 14]]],
            ["Riff", 120, 8, [[0, 0.75, 0], [0.75, 0.75, 3], [1.5, 0.5, 5], [2, 1, 7], [3, 0.5, 5], [3.5, 0.5, 3], [4, 0.75, 0], [4.75, 0.75, 3], [5.5, 0.5, 7], [6, 2, 10]]],
        ];
        const INSTRUMENTS = ["Keys", "Pluck", "Pad", "Bell", "Guitar"];
        series("Melodic Loops", "", PROGRESSIONS.map(p => [p[0] + " " + p[1], p]), INSTRUMENTS.map(n => [n, n]), (prog, instrument, a, n, i) => {
            const [name, bpm, beats, notes] = prog;
            const flat = notes.map(nn => [nn[0], nn[1]].concat(nn.slice(2).flat()));
            return ["phrase", { bpm, beats, voice: voiceOf(instrument), notes: flat }, { bpm, rootKey: 60 }];
        });
        FLPackKit.lib4 = { genres: Object.keys(GENRE_PARTS), essentials, recipes: { PLUCKS, LEADS, SYNTHS, BASSES } };
    }
