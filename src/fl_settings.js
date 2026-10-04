    // ======================================================================
    // BeepBox FL: plugin settings (stored per instrument / per song and
    // serialized into the song URL with the "X" and "Z" tags in version 10).
    // ======================================================================
    class FLConfig {
    }
    FLConfig.typeSampler = 9;
    FLConfig.typeThreeOsc = 10;
    FLConfig.typeFPC = 11;
    FLConfig.typeSlicex = 12;
    FLConfig.typePlugin = 13;
    FLConfig.isSampleType = (type) => type == 9 || type == 11 || type == 12;
    FLConfig.isFLType = (type) => type >= 9 && type <= 13;
    FLConfig.maxInserts = 6;
    FLConfig.fxPEQ = 1;
    FLConfig.fxGross = 2;
    FLConfig.fxSoundgoodizer = 4;
    FLConfig.fxNames = ["parametric EQ 2", "gross beat", "soundgoodizer"];
    FLConfig.fxBits = [1, 2, 4];
    FLConfig.oscShapes = ["sine", "triangle", "square", "saw", "rounded saw", "noise", "pulse"];
    FLConfig.peqTypes = ["low cut", "low shelf", "peak", "band pass", "notch", "high shelf", "high cut"];
    FLConfig.peqShortTypes = ["LC", "LS", "PK", "BP", "N", "HS", "HC"];
    FLConfig.peqBandColors = ["#ff5f5f", "#ffa94d", "#ffe066", "#69db7c", "#4dabf7", "#9775fa", "#f783ac"];
    FLConfig.peqMinHz = 16;
    FLConfig.peqMaxHz = 22000;
    FLConfig.peqMaxDb = 18;
    FLConfig.fpcPadCount = 12;
    FLConfig.sgModes = ["A (glue)", "B (bright)", "C (loud)", "D (bass)"];
    FLConfig.grossLengths = [{ name: "1 beat", beats: 1 }, { name: "2 beats", beats: 2 }, { name: "1 bar", beats: 0 }, { name: "2 bars", beats: -1 }];
    function flSteps(pattern) {
        return (x) => pattern[Math.min(pattern.length - 1, Math.floor(x * pattern.length))];
    }
    FLConfig.grossVolumePresets = [
        { name: "none", fn: (x) => 1.0 },
        { name: "trance gate 1/16", fn: flSteps([1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]) },
        { name: "trance gate 1/8", fn: flSteps([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]) },
        { name: "dotted gate", fn: flSteps([1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]) },
        { name: "offbeat", fn: flSteps([0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]) },
        { name: "sidechain pump", fn: (x, beats) => { const b = (x * beats) % 1; return b < 0.55 ? Math.pow(b / 0.55, 1.6) : 1.0; } },
        { name: "hard sidechain", fn: (x, beats) => { const b = (x * beats) % 1; return b < 0.12 ? 0.0 : b < 0.4 ? Math.pow((b - 0.12) / 0.28, 1.2) : 1.0; } },
        { name: "tremolo", fn: (x, beats) => 0.5 + 0.5 * Math.cos(x * beats * 4 * Math.PI * 2) },
        { name: "stutter cut", fn: flSteps([1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0]) },
        { name: "half mute", fn: flSteps([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]) },
        { name: "fade in", fn: (x) => x },
        { name: "fade out", fn: (x) => 1.0 - x },
        { name: "build up", fn: (x) => { const rate = 2 + Math.floor(x * 4) * 2; return ((x * rate * 4) % 1) < 0.5 ? 1.0 : 0.15; } },
        { name: "custom steps", fn: null },
    ];
    FLConfig.grossCustomIndex = FLConfig.grossVolumePresets.length - 1;
    // Each time preset returns how far back (in beats) to read from the input.
    // It must never be negative because the effect can't see the future.
    FLConfig.grossTimePresets = [
        { name: "none", fn: (b, len) => 0.0 },
        { name: "half speed", fn: (b, len) => b * 0.5 },
        { name: "half-time (per beat)", fn: (b, len) => (b % 1) * 0.5 },
        { name: "repeat 1/2", fn: (b, len) => b - (b % (len / 2)) },
        { name: "repeat 1/4", fn: (b, len) => b - (b % (len / 4)) },
        { name: "stutter 1/8", fn: (b, len) => { const seg = b % 0.5; return seg - (seg % 0.125); } },
        { name: "stutter 1/16", fn: (b, len) => { const seg = b % 0.5; return seg - (seg % 0.0625); } },
        { name: "machine gun", fn: (b, len) => { const seg = b % 1; return seg - (seg % 0.0625); } },
        { name: "reverse beat", fn: (b, len) => 2.0 * (b % 1) },
        { name: "reverse half", fn: (b, len) => 2.0 * (b % 0.5) },
        { name: "tape stop", fn: (b, len) => b * b / (2 * len) },
        { name: "tape stop (end)", fn: (b, len) => { const s = len * 0.75; return b < s ? 0 : (b - s) * (b - s) / (2 * (len - s)); } },
        { name: "scratch", fn: (b, len) => 0.18 * (1 - Math.cos((b % 1) * Math.PI * 2)) },
        { name: "wobble", fn: (b, len) => 0.03 * (1 - Math.cos(b * Math.PI * 4)) },
    ];
    // ---------------------------------------------------------- Parametric EQ 2
    class PEQBand {
        constructor(on, type, freq, gain, q, slope) {
            this.on = on;
            this.type = type;
            this.freq = freq;
            this.gain = gain;
            this.q = q;
            this.slope = slope;
        }
        clone() {
            return new PEQBand(this.on, this.type, this.freq, this.gain, this.q, this.slope);
        }
    }
    class PEQSettings {
        constructor() {
            this.bands = [];
            this.outGain = 0;
            this.reset();
        }
        reset() {
            this.bands = [
                new PEQBand(false, 0, 40, 0, 0.71, 2),
                new PEQBand(true, 1, 100, 0, 0.71, 1),
                new PEQBand(true, 2, 250, 0, 1.0, 1),
                new PEQBand(true, 2, 1000, 0, 1.0, 1),
                new PEQBand(true, 2, 3000, 0, 1.0, 1),
                new PEQBand(true, 5, 8000, 0, 0.71, 1),
                new PEQBand(false, 6, 18000, 0, 0.71, 2),
            ];
            this.outGain = 0;
        }
        isNeutral() {
            if (this.outGain != 0)
                return false;
            for (const band of this.bands) {
                if (!band.on)
                    continue;
                if (band.type == 0 || band.type == 6 || band.type == 3 || band.type == 4)
                    return false;
                if (band.gain != 0)
                    return false;
            }
            return true;
        }
        hash() {
            let s = "" + this.outGain;
            for (const b of this.bands)
                s += "|" + (b.on ? 1 : 0) + "," + b.type + "," + b.freq + "," + b.gain + "," + b.q + "," + b.slope;
            return s;
        }
        toJsonObject() {
            return { "b": this.bands.map(b => [b.on ? 1 : 0, b.type, Math.round(b.freq * 10) / 10, Math.round(b.gain * 10) / 10, Math.round(b.q * 100) / 100, b.slope]), "o": Math.round(this.outGain * 10) / 10 };
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            if (Array.isArray(obj["b"])) {
                for (let i = 0; i < Math.min(7, obj["b"].length); i++) {
                    const a = obj["b"][i];
                    if (!Array.isArray(a))
                        continue;
                    const band = this.bands[i];
                    band.on = !!a[0];
                    band.type = clamp(0, FLConfig.peqTypes.length, a[1] | 0);
                    band.freq = Math.max(FLConfig.peqMinHz, Math.min(FLConfig.peqMaxHz, +a[2] || 1000));
                    band.gain = Math.max(-FLConfig.peqMaxDb, Math.min(FLConfig.peqMaxDb, +a[3] || 0));
                    band.q = Math.max(0.1, Math.min(18, +a[4] || 1));
                    band.slope = clamp(1, 6, a[5] | 0);
                }
            }
            this.outGain = Math.max(-18, Math.min(18, +obj["o"] || 0));
        }
        copyFrom(other) {
            this.bands = other.bands.map(b => b.clone());
            this.outGain = other.outGain;
        }
    }
    // Coefficients for one biquad section, normalized so a0 == 1.
    function flBiquad(type, freq, gainDb, q, sampleRate, out) {
        const w0 = 2 * Math.PI * Math.max(1, Math.min(freq, sampleRate * 0.49)) / sampleRate;
        const cos = Math.cos(w0);
        const sin = Math.sin(w0);
        const A = Math.pow(10, gainDb / 40);
        const alpha = sin / (2 * Math.max(0.05, q));
        let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
        switch (type) {
            case 0:
                b0 = (1 + cos) / 2;
                b1 = -(1 + cos);
                b2 = (1 + cos) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cos;
                a2 = 1 - alpha;
                break;
            case 6:
                b0 = (1 - cos) / 2;
                b1 = 1 - cos;
                b2 = (1 - cos) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cos;
                a2 = 1 - alpha;
                break;
            case 1: {
                const sq = 2 * Math.sqrt(A) * alpha;
                b0 = A * ((A + 1) - (A - 1) * cos + sq);
                b1 = 2 * A * ((A - 1) - (A + 1) * cos);
                b2 = A * ((A + 1) - (A - 1) * cos - sq);
                a0 = (A + 1) + (A - 1) * cos + sq;
                a1 = -2 * ((A - 1) + (A + 1) * cos);
                a2 = (A + 1) + (A - 1) * cos - sq;
                break;
            }
            case 5: {
                const sq = 2 * Math.sqrt(A) * alpha;
                b0 = A * ((A + 1) + (A - 1) * cos + sq);
                b1 = -2 * A * ((A - 1) + (A + 1) * cos);
                b2 = A * ((A + 1) + (A - 1) * cos - sq);
                a0 = (A + 1) - (A - 1) * cos + sq;
                a1 = 2 * ((A - 1) - (A + 1) * cos);
                a2 = (A + 1) - (A - 1) * cos - sq;
                break;
            }
            case 2:
                b0 = 1 + alpha * A;
                b1 = -2 * cos;
                b2 = 1 - alpha * A;
                a0 = 1 + alpha / A;
                a1 = -2 * cos;
                a2 = 1 - alpha / A;
                break;
            case 3:
                b0 = alpha;
                b1 = 0;
                b2 = -alpha;
                a0 = 1 + alpha;
                a1 = -2 * cos;
                a2 = 1 - alpha;
                break;
            case 4:
                b0 = 1;
                b1 = -2 * cos;
                b2 = 1;
                a0 = 1 + alpha;
                a1 = -2 * cos;
                a2 = 1 - alpha;
                break;
        }
        out.b0 = b0 / a0;
        out.b1 = b1 / a0;
        out.b2 = b2 / a0;
        out.a1 = a1 / a0;
        out.a2 = a2 / a0;
        return out;
    }
    // Number of cascaded biquads a band uses (cuts can be 12..60 dB/oct).
    function flBandSections(band) {
        return (band.type == 0 || band.type == 6) ? band.slope : 1;
    }
    function flBandSectionQ(band, section) {
        if ((band.type == 0 || band.type == 6) && band.slope > 1) {
            const n = band.slope * 2;
            const butterworth = 1 / (2 * Math.cos(Math.PI * (2 * section + 1) / (2 * n)));
            return section == 0 ? butterworth * (band.q / 0.71) : butterworth;
        }
        return band.q;
    }
    function flBiquadMagnitudeDb(c, freq, sampleRate) {
        const w = 2 * Math.PI * freq / sampleRate;
        const cos1 = Math.cos(w), sin1 = Math.sin(w), cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w);
        const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2;
        const ni = -(c.b1 * sin1 + c.b2 * sin2);
        const dr = 1 + c.a1 * cos1 + c.a2 * cos2;
        const di = -(c.a1 * sin1 + c.a2 * sin2);
        const mag = Math.sqrt((nr * nr + ni * ni) / Math.max(1e-30, dr * dr + di * di));
        return 20 * Math.log10(Math.max(1e-9, mag));
    }
    function flBandResponseDb(band, freq, sampleRate) {
        if (!band.on)
            return 0;
        const c = {};
        let db = 0;
        const sections = flBandSections(band);
        for (let s = 0; s < sections; s++) {
            flBiquad(band.type, band.freq, band.gain, flBandSectionQ(band, s), sampleRate, c);
            db += flBiquadMagnitudeDb(c, freq, sampleRate);
        }
        return db;
    }
    function flPEQResponseDb(settings, freq, sampleRate) {
        let db = settings.outGain;
        for (const band of settings.bands)
            db += flBandResponseDb(band, freq, sampleRate);
        return db;
    }
    // ---------------------------------------------------------- Gross Beat
    class GrossBeatSettings {
        constructor() {
            this.reset();
        }
        reset() {
            this.volume = 0;
            this.time = 0;
            this.mix = 100;
            this.length = 2;
            this.steps = [8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 0, 8, 8, 8, 8];
        }
        toJsonObject() {
            return { "v": this.volume, "t": this.time, "m": this.mix, "l": this.length, "s": this.steps.concat() };
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            this.volume = clamp(0, FLConfig.grossVolumePresets.length, obj["v"] | 0);
            this.time = clamp(0, FLConfig.grossTimePresets.length, obj["t"] | 0);
            this.mix = clamp(0, 101, obj["m"] == undefined ? 100 : (obj["m"] | 0));
            this.length = clamp(0, FLConfig.grossLengths.length, obj["l"] == undefined ? 2 : (obj["l"] | 0));
            if (Array.isArray(obj["s"])) {
                for (let i = 0; i < 16; i++)
                    this.steps[i] = clamp(0, 9, obj["s"][i] | 0);
            }
        }
        copyFrom(other) {
            this.fromJsonObject(other.toJsonObject());
        }
    }
    // ---------------------------------------------------------- Soundgoodizer
    class SoundgoodizerSettings {
        constructor() {
            this.mode = 0;
            this.amount = 50;
        }
        toJsonObject() {
            return { "m": this.mode, "a": this.amount };
        }
        fromJsonObject(obj) {
            this.mode = obj ? clamp(0, 4, obj["m"] | 0) : 0;
            this.amount = obj && obj["a"] != undefined ? clamp(0, 101, obj["a"] | 0) : 50;
        }
        copyFrom(other) {
            this.mode = other.mode;
            this.amount = other.amount;
        }
    }
    // ---------------------------------------------------------- Sampler / Slicex
    class SamplerSettings {
        constructor() {
            this.reset();
        }
        reset() {
            this.sampleId = null;
            this.sampleName = "";
            this.root = 60;
            this.tune = 0;
            this.start = 0;
            this.end = 1;
            this.loop = false;
            this.loopStart = 0;
            this.loopEnd = 1;
            this.reverse = false;
            this.oneShot = false;
            this.keytrack = true;
            this.crunchy = false;
            this.gain = 0;
            this.slices = [];
        }
        toJsonObject() {
            const o = { "s": this.sampleId, "n": this.sampleName, "r": this.root };
            if (this.tune != 0)
                o["t"] = this.tune;
            if (this.start != 0)
                o["st"] = Math.round(this.start * 1e6) / 1e6;
            if (this.end != 1)
                o["en"] = Math.round(this.end * 1e6) / 1e6;
            if (this.loop) {
                o["lp"] = 1;
                o["ls"] = Math.round(this.loopStart * 1e6) / 1e6;
                o["le"] = Math.round(this.loopEnd * 1e6) / 1e6;
            }
            if (this.reverse)
                o["rv"] = 1;
            if (this.oneShot)
                o["os"] = 1;
            if (!this.keytrack)
                o["kt"] = 0;
            if (this.crunchy)
                o["cr"] = 1;
            if (this.gain != 0)
                o["g"] = this.gain;
            if (this.slices.length > 0)
                o["sl"] = this.slices.map(x => Math.round(x * 1e6) / 1e6);
            return o;
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            this.sampleId = (typeof obj["s"] == "string") ? obj["s"] : null;
            this.sampleName = (typeof obj["n"] == "string") ? obj["n"] : "";
            this.root = obj["r"] != undefined ? clamp(0, 128, obj["r"] | 0) : 60;
            this.tune = obj["t"] != undefined ? Math.max(-100, Math.min(100, obj["t"] | 0)) : 0;
            this.start = obj["st"] != undefined ? Math.max(0, Math.min(1, +obj["st"])) : 0;
            this.end = obj["en"] != undefined ? Math.max(0, Math.min(1, +obj["en"])) : 1;
            this.loop = !!obj["lp"];
            this.loopStart = obj["ls"] != undefined ? Math.max(0, Math.min(1, +obj["ls"])) : 0;
            this.loopEnd = obj["le"] != undefined ? Math.max(0, Math.min(1, +obj["le"])) : 1;
            this.reverse = !!obj["rv"];
            this.oneShot = !!obj["os"];
            this.keytrack = obj["kt"] == undefined ? true : !!obj["kt"];
            this.crunchy = !!obj["cr"];
            this.gain = obj["g"] != undefined ? Math.max(-24, Math.min(24, +obj["g"])) : 0;
            this.slices = Array.isArray(obj["sl"]) ? obj["sl"].map(x => Math.max(0, Math.min(1, +x))).filter(x => isFinite(x)).sort((a, b) => a - b) : [];
        }
        copyFrom(other) {
            this.fromJsonObject(other.toJsonObject());
        }
        // Slice boundaries as [start, end) pairs, always starting at 0.
        getSliceRegions() {
            const points = [0].concat(this.slices.filter(x => x > 0 && x < 1));
            const regions = [];
            for (let i = 0; i < points.length; i++) {
                regions.push([points[i], i + 1 < points.length ? points[i + 1] : 1]);
            }
            return regions;
        }
    }
    // ---------------------------------------------------------- 3x Osc
    class ThreeOscOscillator {
        constructor(shape, coarse, fine, level) {
            this.shape = shape;
            this.coarse = coarse;
            this.fine = fine;
            this.level = level;
            this.phase = 0;
            this.invert = false;
            this.phaseRand = false;
        }
    }
    class ThreeOscSettings {
        constructor() {
            this.reset();
        }
        reset() {
            this.oscs = [
                new ThreeOscOscillator(3, 0, 0, 100),
                new ThreeOscOscillator(3, -12, 6, 60),
                new ThreeOscOscillator(2, -24, 0, 35),
            ];
            this.osc3AM = false;
        }
        toJsonObject() {
            return { "o": this.oscs.map(o => [o.shape, o.coarse, o.fine, o.level, o.phase, o.invert ? 1 : 0, o.phaseRand ? 1 : 0]), "am": this.osc3AM ? 1 : 0 };
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            if (Array.isArray(obj["o"])) {
                for (let i = 0; i < 3; i++) {
                    const a = obj["o"][i];
                    if (!Array.isArray(a))
                        continue;
                    const o = this.oscs[i];
                    o.shape = clamp(0, FLConfig.oscShapes.length, a[0] | 0);
                    o.coarse = Math.max(-48, Math.min(48, a[1] | 0));
                    o.fine = Math.max(-100, Math.min(100, a[2] | 0));
                    o.level = clamp(0, 101, a[3] | 0);
                    o.phase = clamp(0, 101, a[4] | 0);
                    o.invert = !!a[5];
                    o.phaseRand = !!a[6];
                }
            }
            this.osc3AM = !!obj["am"];
        }
        copyFrom(other) {
            this.fromJsonObject(other.toJsonObject());
        }
    }
    // ---------------------------------------------------------- FPC
    class FPCPad {
        constructor() {
            this.reset();
        }
        reset() {
            this.sampleId = null;
            this.name = "";
            this.volume = 80;
            this.tune = 0;
            this.cut = 0;
            this.reverse = false;
        }
    }
    class FPCSettings {
        constructor() {
            this.pads = [];
            for (let i = 0; i < FLConfig.fpcPadCount; i++)
                this.pads.push(new FPCPad());
            this.kitName = "";
            this.selectedPad = 0;
        }
        toJsonObject() {
            return { "k": this.kitName, "p": this.pads.map(p => p.sampleId == null ? 0 : [p.sampleId, p.name, p.volume, p.tune, p.cut, p.reverse ? 1 : 0]) };
        }
        fromJsonObject(obj) {
            for (const pad of this.pads)
                pad.reset();
            this.kitName = "";
            if (!obj)
                return;
            if (typeof obj["kit"] == "string") {
                this.loadBuiltinKit(obj["kit"]);
                return;
            }
            this.kitName = typeof obj["k"] == "string" ? obj["k"] : "";
            if (Array.isArray(obj["p"])) {
                for (let i = 0; i < Math.min(FLConfig.fpcPadCount, obj["p"].length); i++) {
                    const a = obj["p"][i];
                    if (!Array.isArray(a))
                        continue;
                    const pad = this.pads[i];
                    pad.sampleId = typeof a[0] == "string" ? a[0] : null;
                    pad.name = typeof a[1] == "string" ? a[1] : "";
                    pad.volume = clamp(0, 101, a[2] == undefined ? 80 : (a[2] | 0));
                    pad.tune = Math.max(-24, Math.min(24, a[3] | 0));
                    pad.cut = clamp(0, 5, a[4] | 0);
                    pad.reverse = !!a[5];
                }
            }
        }
        copyFrom(other) {
            this.fromJsonObject(other.toJsonObject());
        }
        loadBuiltinKit(kitName) {
            const kit = FLSoundFactory.getKits().find(k => k.name == kitName) || FLSoundFactory.getKits()[0];
            for (let i = 0; i < this.pads.length; i++) {
                const pad = this.pads[i];
                pad.reset();
                const def = kit.pads[i];
                if (def) {
                    pad.sampleId = "b:" + def[0];
                    pad.cut = def[1];
                    const info = FLSoundFactory.getInfo(def[0]);
                    pad.name = info ? info.name : def[0];
                }
            }
            this.kitName = kit.name;
        }
    }
    // ---------------------------------------------------------- plugins
    // Plugin parameters are plain JSON owned by the plugin. They are kept as
    // JSON so a song still loads (and keeps its settings) when a plugin isn't
    // installed in this browser.
    function flCloneJson(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }
    function flCollectIdsDeep(value, out, depth = 0) {
        if (value == null || depth > 8)
            return;
        if (typeof value == "string") {
            if (/^[ub]:\S/.test(value))
                out.add(value);
        }
        else if (Array.isArray(value)) {
            for (const item of value)
                flCollectIdsDeep(item, out, depth + 1);
        }
        else if (typeof value == "object") {
            for (const key of Object.keys(value))
                flCollectIdsDeep(value[key], out, depth + 1);
        }
    }
    class PluginInstrumentSettings {
        constructor() {
            this.reset();
        }
        reset() {
            this.id = null;
            this.params = {};
        }
        toJsonObject() {
            return { "id": this.id, "p": this.params };
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            this.id = typeof obj["id"] == "string" ? obj["id"] : null;
            this.params = (obj["p"] && typeof obj["p"] == "object") ? obj["p"] : {};
        }
        copyFrom(other) {
            this.id = other.id;
            this.params = flCloneJson(other.params) || {};
        }
    }
    class PluginInsert {
        constructor(id, params, on = true) {
            this.id = id;
            this.params = params || {};
            this.on = on;
        }
        toJsonObject() {
            const o = { "id": this.id, "p": this.params };
            if (!this.on)
                o["off"] = 1;
            return o;
        }
        static fromJsonObject(obj) {
            if (!obj || typeof obj["id"] != "string")
                return null;
            return new PluginInsert(obj["id"], (obj["p"] && typeof obj["p"] == "object") ? obj["p"] : {}, !obj["off"]);
        }
        clone() {
            return new PluginInsert(this.id, flCloneJson(this.params), this.on);
        }
    }
    function flInsertsFromJson(list) {
        const result = [];
        if (Array.isArray(list)) {
            for (const item of list) {
                const insert = PluginInsert.fromJsonObject(item);
                if (insert && result.length < FLConfig.maxInserts)
                    result.push(insert);
            }
        }
        return result;
    }
    // ---------------------------------------------------------- per instrument
    class FLInstrumentSettings {
        constructor() {
            this.sampler = new SamplerSettings();
            this.osc3 = new ThreeOscSettings();
            this.fpc = new FPCSettings();
            this.plugin = new PluginInstrumentSettings();
            this.inserts = [];
            this.fx = 0;
            this.peq = new PEQSettings();
            this.gross = new GrossBeatSettings();
            this.sg = new SoundgoodizerSettings();
        }
        reset() {
            this.sampler.reset();
            this.osc3.reset();
            this.fpc.fromJsonObject(null);
            this.plugin.reset();
            this.inserts = [];
            this.fx = 0;
            this.peq.reset();
            this.gross.reset();
            this.sg.fromJsonObject(null);
        }
        isDefaultFor(type) {
            return this.fx == 0 && this.inserts.length == 0 && !FLConfig.isFLType(type);
        }
        hasProcessing(type) {
            return this.fx != 0 || this.inserts.length > 0 || type == FLConfig.typePlugin;
        }
        toJsonObject(type) {
            const o = {};
            if (type == FLConfig.typeSampler || type == FLConfig.typeSlicex)
                o["sm"] = this.sampler.toJsonObject();
            if (type == FLConfig.typeThreeOsc)
                o["x3"] = this.osc3.toJsonObject();
            if (type == FLConfig.typeFPC)
                o["fpc"] = this.fpc.toJsonObject();
            if (type == FLConfig.typePlugin)
                o["pl"] = this.plugin.toJsonObject();
            if (this.fx != 0)
                o["fx"] = this.fx;
            if (this.fx & FLConfig.fxPEQ)
                o["eq"] = this.peq.toJsonObject();
            if (this.fx & FLConfig.fxGross)
                o["gb"] = this.gross.toJsonObject();
            if (this.fx & FLConfig.fxSoundgoodizer)
                o["sg"] = this.sg.toJsonObject();
            if (this.inserts.length > 0)
                o["fi"] = this.inserts.map(insert => insert.toJsonObject());
            return o;
        }
        fromJsonObject(obj) {
            this.reset();
            if (!obj)
                return;
            if (obj["sm"])
                this.sampler.fromJsonObject(obj["sm"]);
            if (obj["x3"])
                this.osc3.fromJsonObject(obj["x3"]);
            if (obj["fpc"])
                this.fpc.fromJsonObject(obj["fpc"]);
            if (obj["pl"])
                this.plugin.fromJsonObject(obj["pl"]);
            this.fx = (obj["fx"] | 0) & 7;
            if (obj["eq"])
                this.peq.fromJsonObject(obj["eq"]);
            if (obj["gb"])
                this.gross.fromJsonObject(obj["gb"]);
            if (obj["sg"])
                this.sg.fromJsonObject(obj["sg"]);
            this.inserts = flInsertsFromJson(obj["fi"]);
        }
        copyFrom(other) {
            this.sampler.copyFrom(other.sampler);
            this.osc3.copyFrom(other.osc3);
            this.fpc.copyFrom(other.fpc);
            this.plugin.copyFrom(other.plugin);
            this.inserts = other.inserts.map(insert => insert.clone());
            this.fx = other.fx;
            this.peq.copyFrom(other.peq);
            this.gross.copyFrom(other.gross);
            this.sg.copyFrom(other.sg);
        }
        // Every sample id this instrument depends on.
        collectSampleIds(type, out) {
            if ((type == FLConfig.typeSampler || type == FLConfig.typeSlicex) && this.sampler.sampleId != null)
                out.add(this.sampler.sampleId);
            if (type == FLConfig.typeFPC) {
                for (const pad of this.fpc.pads)
                    if (pad.sampleId != null)
                        out.add(pad.sampleId);
            }
            if (type == FLConfig.typePlugin)
                flCollectIdsDeep(this.plugin.params, out);
            for (const insert of this.inserts)
                flCollectIdsDeep(insert.params, out);
        }
        // Plugin ids this instrument depends on.
        collectPluginIds(type, out) {
            if (type == FLConfig.typePlugin && this.plugin.id)
                out.add(this.plugin.id);
            for (const insert of this.inserts)
                out.add(insert.id);
        }
    }
    // ---------------------------------------------------------- per song
    class FLSongSettings {
        constructor() {
            this.masterFx = 0;
            this.masterPeq = new PEQSettings();
            this.masterSg = new SoundgoodizerSettings();
            this.masterGross = new GrossBeatSettings();
            this.masterInserts = [];
            this.swing = 0;
        }
        reset() {
            this.masterFx = 0;
            this.masterPeq.reset();
            this.masterSg.fromJsonObject(null);
            this.masterGross.reset();
            this.masterInserts = [];
            this.swing = 0;
        }
    }
    // Songs as JSON-able objects for the "Z" tag. Channel and pattern names
    // live on the Channel/Pattern objects so they follow them around.
    function flSongToJsonObject(song) {
        const o = {};
        const fl = song.fl;
        if (fl.masterFx != 0)
            o["mfx"] = fl.masterFx;
        if (fl.masterFx & FLConfig.fxPEQ)
            o["meq"] = fl.masterPeq.toJsonObject();
        if (fl.masterFx & FLConfig.fxSoundgoodizer)
            o["msg"] = fl.masterSg.toJsonObject();
        if (fl.masterFx & FLConfig.fxGross)
            o["mgb"] = fl.masterGross.toJsonObject();
        if (fl.masterInserts.length > 0)
            o["mfi"] = fl.masterInserts.map(insert => insert.toJsonObject());
        const names = song.channels.map(c => c.name || "");
        if (names.some(n => n != ""))
            o["cn"] = names;
        const patternNames = {};
        let anyPatternNames = false;
        for (let c = 0; c < song.channels.length; c++) {
            const channel = song.channels[c];
            for (let p = 0; p < channel.patterns.length; p++) {
                if (channel.patterns[p].name) {
                    patternNames[c + "," + p] = channel.patterns[p].name;
                    anyPatternNames = true;
                }
            }
        }
        if (anyPatternNames)
            o["pn"] = patternNames;
        return o;
    }
    function flSongFromJsonObject(song, o) {
        const fl = song.fl;
        fl.reset();
        if (!o)
            return;
        fl.masterFx = (o["mfx"] | 0) & 7;
        if (o["meq"])
            fl.masterPeq.fromJsonObject(o["meq"]);
        if (o["msg"])
            fl.masterSg.fromJsonObject(o["msg"]);
        if (o["mgb"])
            fl.masterGross.fromJsonObject(o["mgb"]);
        fl.masterInserts = flInsertsFromJson(o["mfi"]);
        if (Array.isArray(o["cn"])) {
            for (let c = 0; c < Math.min(o["cn"].length, song.channels.length); c++) {
                song.channels[c].name = typeof o["cn"][c] == "string" ? o["cn"][c].slice(0, 40) : "";
            }
        }
        if (o["pn"] && typeof o["pn"] == "object") {
            for (const key of Object.keys(o["pn"])) {
                const parts = key.split(",");
                const c = parts[0] | 0, p = parts[1] | 0;
                if (c < song.channels.length && p < song.channels[c].patterns.length && typeof o["pn"][key] == "string") {
                    song.channels[c].patterns[p].name = o["pn"][key].slice(0, 40);
                }
            }
        }
    }
    function flSortNotes(notes) {
        let sorted = true;
        for (let i = 1; i < notes.length; i++) {
            if (notes[i - 1].start > notes[i].start) {
                sorted = false;
                break;
            }
        }
        if (sorted)
            return false;
        const indexed = notes.map((note, index) => ({ note, index }));
        indexed.sort((a, b) => (a.note.start - b.note.start) || (a.index - b.index));
        for (let i = 0; i < notes.length; i++)
            notes[i] = indexed[i].note;
        return true;
    }
