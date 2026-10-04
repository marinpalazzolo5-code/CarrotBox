    // ======================================================================
    // CarrotBox: Sound Library 2 - more than two thousand new, original
    // sounds. Everything is synthesized here (deterministically, on demand),
    // so the library adds no download weight and contains no third party
    // audio. The sounds are organised as genre packs ("Packs/Trap", ...) and
    // specialty packs (808s in every key, synth one-shots, chord stabs, FX,
    // vocal chops, world percussion and foley).
    // ======================================================================
    // ------------------------------------------------------------- helpers
    function flResample(pcm, ratio) {
        // ratio > 1 = higher and shorter.
        if (ratio == 1)
            return pcm.slice();
        const outLength = Math.max(1, Math.floor(pcm.length / ratio));
        const out = new Float32Array(outLength);
        for (let i = 0; i < outLength; i++) {
            const x = i * ratio;
            const i0 = Math.floor(x);
            const frac = x - i0;
            const a = pcm[i0] || 0, b = pcm[i0 + 1] || 0;
            out[i] = a + (b - a) * frac;
        }
        return out;
    }
    function flCrush(buffer, bits, downsample = 1) {
        const steps = Math.pow(2, bits);
        let hold = 0;
        for (let i = 0; i < buffer.length; i++) {
            if (i % downsample == 0)
                hold = Math.round(buffer[i] * steps) / steps;
            buffer[i] = hold;
        }
        return buffer;
    }
    function flSourcePcm(key) {
        const rendered = FLSoundFactory.render(key);
        return rendered ? rendered.pcm : null;
    }
    // ---------------------------------------------------------- generators
    // A layered drum: a pitched body with a pitch sweep, an optional ring
    // partial, a filtered noise layer, a click, saturation, crushing, a small
    // room and dust. Used for kicks, snares, toms and most percussion.
    FLGen.drum2 = (p, r) => {
        const len = p.len || 0.8;
        const out = flBuf(len);
        const b = p.body || null, ring = p.ring || null, nz = p.noise || null;
        const bodyFall = b ? Math.exp(-1 / (Math.max(0.002, b.decay || 0.2) * FL_SR)) : 0;
        const sweepFall = b ? Math.exp(-1 / (Math.max(0.001, b.sweep || 0.02) * FL_SR)) : 0;
        const holdSamples = b ? Math.floor((b.hold || 0) * FL_SR) : 0;
        const ringFall = ring ? Math.exp(-1 / (Math.max(0.002, ring.decay || (b ? b.decay * 0.5 : 0.03)) * FL_SR)) : 0;
        const noiseFall = nz ? Math.exp(-1 / (Math.max(0.002, nz.decay || 0.1) * FL_SR)) : 0;
        const noiseAttack = nz && nz.attack ? Math.max(1, Math.floor(nz.attack * FL_SR)) : 1;
        const clickFall = Math.exp(-1 / (0.0011 * FL_SR));
        const nHP = nz ? flHP(nz.hp || 600) : null, nLP = nz ? flLP(nz.lp || 12000) : null, nBP = nz && nz.bp ? flBP(nz.bp, nz.q || 1.2) : null;
        const finalLP = p.lp ? flLP(p.lp) : null, finalHP = p.hp ? flHP(p.hp) : null;
        let phase = r() * 0.02, ringPhase = 0, bodyEnv = 1, sweepEnv = 1, ringEnv = 1, noiseEnv = 1, clickEnv = p.click || 0;
        const triangle = b && b.wave == "tri";
        const drive = p.drive || 0;
        for (let i = 0; i < out.length; i++) {
            let s = 0;
            if (b) {
                const f = b.end + (b.start - b.end) * sweepEnv;
                phase += f / FL_SR;
                const w = phase - Math.floor(phase);
                const osc = triangle ? (w < 0.5 ? 4 * w - 1 : 3 - 4 * w) : Math.sin(2 * Math.PI * phase);
                s += osc * (b.amp == undefined ? 1 : b.amp) * (i < holdSamples ? 1 : bodyEnv);
                if (i >= holdSamples)
                    bodyEnv *= bodyFall;
                sweepEnv *= sweepFall;
                if (ring) {
                    ringPhase += f * ring.ratio / FL_SR;
                    s += Math.sin(2 * Math.PI * ringPhase) * ring.amp * ringEnv;
                    ringEnv *= ringFall;
                }
            }
            if (nz) {
                let n = nLP.p(nHP.p(r() * 2 - 1));
                if (nBP)
                    n = n * 0.4 + nBP.p(n) * 1.6;
                s += n * nz.amp * noiseEnv * (i < noiseAttack ? i / noiseAttack : 1);
                if (i >= noiseAttack)
                    noiseEnv *= noiseFall;
            }
            if (clickEnv > 1e-5) {
                s += (r() * 2 - 1) * clickEnv;
                clickEnv *= clickFall;
            }
            if (drive > 0)
                s = Math.tanh(s * (1 + drive)) / Math.tanh(1 + drive);
            if (finalLP)
                s = finalLP.p(s);
            if (finalHP)
                s = finalHP.p(s);
            out[i] = s;
        }
        flNormalize(out);
        if (p.crush)
            flCrush(out, p.crush, p.downsample || 1);
        if (p.dust) {
            for (let i = 0; i < out.length; i++)
                out[i] += (r() * 2 - 1) * p.dust * Math.exp(-i / FL_SR / 0.35) + (r() < 0.0006 ? (r() * 2 - 1) * p.dust * 6 : 0);
        }
        let result = flNormalize(out);
        if (p.room)
            result = flNormalize(flReverb(result, p.room, p.roomDecay || 0.6, p.roomTail || 0.35));
        return flFades(flTrimSilence(result), 0.15, 12);
    };
    // Metallic hats and cymbals: six detuned square oscillators (ring
    // modulated in pairs) plus noise, band-passed and high-passed.
    FLGen.hat2 = (p, r) => {
        const len = p.len || 0.3;
        const out = flBuf(len);
        const base = (p.f || 205) * (p.tune || 1);
        const ratios = p.ratios || [1, 1.483, 1.932, 2.546, 2.630, 3.897];
        const steps = ratios.map(x => base * x / FL_SR);
        const phases = ratios.map(() => r());
        const bp = flBP(p.bp || 9000, p.q || 0.9), hp = flHP(p.hp || 6500), hp2 = flHP(p.hp || 6500);
        const sizzleHP = flHP(9000);
        const fall = Math.exp(-1 / (Math.max(0.003, p.decay) * FL_SR));
        const fastFall = p.fastDecay ? Math.exp(-1 / (p.fastDecay * FL_SR)) : 0;
        const sizzleFall = p.sizzle ? Math.exp(-1 / ((p.sizzleDecay || p.decay * 1.6) * FL_SR)) : 0;
        const attack = p.attack ? Math.max(1, Math.floor(p.attack * FL_SR)) : 1;
        let env = 1, fastEnv = 1, sizzleEnv = 1;
        const noise = p.noise || 0.35;
        for (let i = 0; i < out.length; i++) {
            let metal = 0;
            for (let k = 0; k < steps.length; k += 2) {
                phases[k] += steps[k];
                phases[k + 1] += steps[k + 1];
                const a = (phases[k] - Math.floor(phases[k])) < 0.5 ? 1 : -1;
                const c = (phases[k + 1] - Math.floor(phases[k + 1])) < 0.5 ? 1 : -1;
                metal += p.ringMod ? a * c : (a + c) * 0.5;
            }
            metal /= steps.length / 2;
            const n = r() * 2 - 1;
            let s = metal * (1 - noise) + n * noise;
            let e = fastFall ? 0.6 * fastEnv + 0.4 * env : env;
            if (i < attack)
                e *= i / attack;
            s = hp2.p(hp.p(bp.p(s))) * e;
            if (p.sizzle) {
                s += sizzleHP.p(n) * p.sizzle * sizzleEnv;
                sizzleEnv *= sizzleFall;
            }
            env *= fall;
            fastEnv *= fastFall;
            out[i] = s;
        }
        flNormalize(out);
        if (p.crush)
            flCrush(out, p.crush, p.downsample || 1);
        let result = flNormalize(out);
        if (p.lp)
            result = flNormalize(flLP(p.lp).run(result));
        if (p.room)
            result = flNormalize(flReverb(result, p.room, 0.5, 0.3));
        if (p.reverse)
            result.reverse();
        return flFades(flTrimSilence(result), p.reverse ? 25 : 0.1, 8);
    };
    // Claps: a few noise bursts and a tail, with optional room.
    FLGen.clap2 = (p, r) => {
        const out = flBuf(p.len || 0.6);
        const bp = flBP(p.freq || 1100, p.q || 1.8), hp = flHP(p.hp || 450);
        const lp = p.lp ? flLP(p.lp) : null;
        const count = p.bursts || 4, spacing = p.spacing || 0.011;
        const tailStart = (count - 1) * spacing;
        const tail = p.tail || 0.13;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            let env = 0;
            for (let k = 0; k < count; k++) {
                const at = k * spacing * (1 + (k % 2 ? 0.15 : -0.1) * (p.humanize || 0));
                if (t >= at && t < at + spacing * 1.2)
                    env = Math.max(env, Math.exp(-(t - at) / 0.0032));
            }
            if (t >= tailStart)
                env = Math.max(env, 0.72 * Math.exp(-(t - tailStart) / tail));
            let s = hp.p(bp.p(r() * 2 - 1)) * env;
            if (lp)
                s = lp.p(s);
            out[i] = s;
        }
        flNormalize(out);
        if (p.crush)
            flCrush(out, p.crush, p.downsample || 1);
        let result = flNormalize(out);
        if (p.room)
            result = flNormalize(flReverb(result, p.room, p.roomDecay || 0.8, 0.45));
        return flFades(flTrimSilence(result), 0.1, 12);
    };
    // A general pitched one-shot: saw / square / triangle / sine / FM / plucked
    // string / organ / bell oscillators, unison, sub, a resonant filter with an
    // envelope or LFO, an ADSR, vibrato, glide, drive, chorus, echo and reverb.
    FLGen.tone2 = (p, r) => {
        const len = p.len || 1.5;
        const f = p.f || 261.63;
        const out = flBuf(len);
        const chord = p.chord || [0];
        const voices = Math.max(1, p.voices || 1);
        const osc = p.osc || "saw";
        const attackN = Math.max(1, Math.floor((p.attack || 0.004) * FL_SR));
        const decayFall = Math.exp(-1 / (Math.max(0.005, p.decay || 1e3) * FL_SR));
        const sustain = p.sustain == undefined ? 1 : p.sustain;
        const releaseN = Math.max(1, Math.floor((p.release || 0.05) * FL_SR));
        const releaseStart = out.length - releaseN;
        // oscillator state
        const oscs = [];
        for (const semis of chord) {
            for (let v = 0; v < voices; v++) {
                const spread = voices == 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * (p.detune || 0.12);
                oscs.push({ freq: f * Math.pow(2, (semis + spread) / 12), phase: r(), mod: r(), line: null, idx: 0, prev: 0 });
            }
        }
        if (osc == "ks") {
            for (const o of oscs) {
                const n = Math.max(2, Math.round(FL_SR / o.freq));
                o.line = new Float32Array(n);
                const pick = flLP(p.pick || 6000);
                for (let i = 0; i < n; i++)
                    o.line[i] = pick.p(r() * 2 - 1);
            }
        }
        const partials = osc == "organ" ? (p.drawbars || [[0.5, 0.6], [1, 1], [1.5, 0.5], [2, 0.6], [3, 0.35], [4, 0.25]])
            : osc == "bell" ? (p.bellPartials || [[1, 1, 1.6], [2.76, 0.6, 1.1], [5.4, 0.35, 0.6], [8.93, 0.2, 0.35]]) : null;
        const partialPhases = partials ? oscs.map(() => partials.map(() => r())) : null;
        const partialEnv = partials && osc == "bell" ? oscs.map(() => partials.map(() => 1)) : null;
        const partialFall = partials && osc == "bell" ? partials.map(pa => Math.exp(-1 / (pa[2] * FL_SR))) : null;
        const lp = new FLBiq(6, Math.min(18000, p.cutoff || 18000), p.res || 0.71);
        const useFilter = p.cutoff || p.filterEnv || p.lfoRate;
        const filterFall = p.filterEnv ? Math.exp(-1 / (Math.max(0.003, p.filterDecay || 0.15) * FL_SR)) : 0;
        let filterEnv = 1;
        const indexFall = osc == "fm" ? Math.exp(-1 / (Math.max(0.005, p.indexDecay || 0.4) * FL_SR)) : 0;
        let indexEnv = 1;
        const glideFall = p.glide ? Math.exp(-1 / ((p.glideTime || 0.06) * FL_SR)) : 0;
        let glideEnv = 1;
        const pitchFall = p.pitchDrop ? Math.exp(-1 / ((p.pitchTime || 0.03) * FL_SR)) : 0;
        let pitchEnv = 1;
        let subPhase = 0;
        const subRatio = p.subOctave == 2 ? 0.25 : 0.5;
        const norm = 1 / Math.sqrt(oscs.length);
        let ampEnv = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            let bend = 1;
            if (p.vib)
                bend *= Math.pow(2, p.vib * Math.sin(2 * Math.PI * (p.vibRate || 5.5) * t) * Math.min(1, Math.max(0, (t - (p.vibDelay || 0.15)) / 0.3)) / 12);
            if (p.glide) {
                bend *= Math.pow(2, p.glide * glideEnv / 12);
                glideEnv *= glideFall;
            }
            if (p.pitchDrop) {
                bend *= Math.pow(2, p.pitchDrop * pitchEnv / 12);
                pitchEnv *= pitchFall;
            }
            let s = 0;
            for (let k = 0; k < oscs.length; k++) {
                const o = oscs[k];
                const dt = o.freq * bend / FL_SR;
                if (osc == "ks") {
                    const line = o.line;
                    const value = line[o.idx];
                    const filtered = (value + o.prev) * 0.5 * (p.damping || 0.996);
                    o.prev = value;
                    line[o.idx] = filtered;
                    o.idx = (o.idx + 1) % line.length;
                    s += value;
                    continue;
                }
                o.phase += dt;
                switch (osc) {
                    case "square":
                        s += flSquare(o.phase, dt, p.width ? p.width + (p.pwm ? p.pwm * Math.sin(2 * Math.PI * (p.pwmRate || 0.6) * t + k) : 0) : 0.5);
                        break;
                    case "tri": {
                        const w = o.phase - Math.floor(o.phase);
                        s += w < 0.5 ? 4 * w - 1 : 3 - 4 * w;
                        break;
                    }
                    case "sine":
                        s += Math.sin(2 * Math.PI * o.phase);
                        break;
                    case "fm": {
                        o.mod += dt * (p.ratio || 2);
                        const index = (p.index || 2) * indexEnv + (p.indexFloor || 0);
                        s += Math.sin(2 * Math.PI * o.phase + Math.sin(2 * Math.PI * o.mod) * index);
                        break;
                    }
                    case "organ":
                    case "bell": {
                        const ph = partialPhases[k];
                        let sum = 0;
                        for (let j = 0; j < partials.length; j++) {
                            ph[j] += dt * partials[j][0];
                            const e = partialEnv ? partialEnv[k][j] : 1;
                            sum += Math.sin(2 * Math.PI * ph[j]) * partials[j][1] * e;
                            if (partialEnv)
                                partialEnv[k][j] *= partialFall[j];
                        }
                        s += sum * 0.6;
                        break;
                    }
                    default:
                        s += flSaw(o.phase, dt);
                }
            }
            s *= norm;
            if (osc == "fm")
                indexEnv *= indexFall;
            if (p.sub) {
                subPhase += f * subRatio * bend / FL_SR;
                s += Math.sin(2 * Math.PI * subPhase) * p.sub;
            }
            if (p.noise)
                s += (r() * 2 - 1) * p.noise * (p.noiseDecay ? Math.exp(-t / p.noiseDecay) : 1);
            if (useFilter && (i & 15) == 0) {
                let cutoff = p.cutoff || 18000;
                if (p.filterEnv)
                    cutoff = cutoff + p.filterEnv * filterEnv;
                if (p.lfoRate)
                    cutoff *= Math.pow(2, (p.lfoDepth || 2) * (0.5 - 0.5 * Math.cos(2 * Math.PI * p.lfoRate * t)) - (p.lfoDepth || 2) * 0.5);
                lp.set(Math.max(40, Math.min(18000, cutoff)));
            }
            if (p.filterEnv)
                filterEnv *= filterFall;
            if (useFilter)
                s = lp.p(s);
            // ADSR
            if (i < attackN)
                ampEnv = i / attackN;
            else
                ampEnv = sustain + (ampEnv - sustain) * decayFall;
            let e = ampEnv;
            if (i >= releaseStart)
                e *= (out.length - i) / releaseN;
            out[i] = flDrive(s * e, p.drive || 0);
        }
        flNormalize(out);
        if (p.crush)
            flCrush(out, p.crush, p.downsample || 1);
        let result = flNormalize(out);
        if (p.chorus) {
            const copy = result.slice();
            const base = Math.floor(0.012 * FL_SR), depth = 0.004 * FL_SR;
            for (let i = 0; i < result.length; i++) {
                const d = base + depth * Math.sin(2 * Math.PI * 0.8 * i / FL_SR);
                const x = i - d;
                const i0 = Math.floor(x);
                const v = i0 >= 0 ? copy[i0] + (copy[Math.min(copy.length - 1, i0 + 1)] - copy[i0]) * (x - i0) : 0;
                result[i] = copy[i] * (1 - p.chorus * 0.5) + v * p.chorus * 0.5;
            }
        }
        if (p.echo) {
            const delay = Math.floor((p.echoTime || 0.25) * FL_SR);
            const tail = Math.floor(delay * 3);
            const extended = new Float32Array(result.length + tail);
            extended.set(result);
            for (let i = delay; i < extended.length; i++)
                extended[i] += extended[i - delay] * (p.echoFeedback || 0.35) * p.echo;
            result = extended;
        }
        if (p.verb)
            result = flReverb(result, p.verb, p.verbDecay || 1.6, p.verbTail || 1.0);
        return flFades(flTrimSilence(flNormalize(result)), p.attack ? 0.05 : 0.3, 25);
    };
    // FX: risers, downlifters, sweeps, zaps, sub drops, noise bursts and
    // evolving textures, with tone and noise layers.
    FLGen.fx2 = (p, r) => {
        const len = p.len || 2;
        const out = flBuf(len);
        const type = p.type || "riser";
        const bp = flBP(p.f0 || 300, p.q || 2.5);
        const lp = flLP(p.lp || 16000);
        const voices = p.voices || 3;
        const phases = [];
        for (let v = 0; v < voices; v++)
            phases.push(r());
        let subPhase = 0;
        for (let i = 0; i < out.length; i++) {
            const t = i / FL_SR;
            const x = t / len;
            let shape, freqX;
            switch (type) {
                case "riser":
                    shape = Math.pow(x, p.curve || 1.7);
                    freqX = Math.pow(x, p.pitchCurve || 1.2);
                    break;
                case "downlifter":
                    shape = Math.pow(1 - x, p.curve || 1.4);
                    freqX = 1 - Math.pow(x, p.pitchCurve || 0.7);
                    break;
                case "sweep":
                    shape = Math.sin(Math.PI * Math.pow(x, p.skew || 0.7));
                    freqX = shape;
                    break;
                case "zap":
                    shape = Math.exp(-t / (p.decay || 0.15));
                    freqX = 1 - Math.pow(Math.min(1, t / (p.sweepTime || 0.12)), 0.5);
                    break;
                case "subdrop":
                    shape = t < (p.hold || 0.2) * len ? 1 : Math.max(0, 1 - (x - (p.hold || 0.2)) / (1 - (p.hold || 0.2)));
                    freqX = 1 - Math.pow(x, 0.5);
                    break;
                case "burst":
                    shape = Math.exp(-t / (p.decay || 0.3)) * Math.min(1, t / 0.002);
                    freqX = Math.exp(-t / (p.decay || 0.3));
                    break;
                default: // texture
                    shape = Math.min(1, x * 6) * Math.min(1, (1 - x) * 4) * (0.7 + 0.3 * Math.sin(2 * Math.PI * (p.rate || 0.3) * t + Math.sin(t * 1.3)));
                    freqX = 0.5 + 0.5 * Math.sin(2 * Math.PI * (p.rate || 0.3) * t * 0.7);
            }
            const freq = (p.f0 || 300) * Math.pow((p.f1 || 6000) / (p.f0 || 300), freqX);
            if ((i & 31) == 0)
                bp.set(Math.max(40, Math.min(17000, freq)));
            let s = bp.p(r() * 2 - 1) * (p.noise == undefined ? 1.2 : p.noise);
            if (p.tone) {
                const toneFreq = (p.toneF0 || 110) * Math.pow((p.toneF1 || 880) / (p.toneF0 || 110), freqX);
                let toneSum = 0;
                for (let v = 0; v < voices; v++) {
                    const dt = toneFreq * (1 + (v - (voices - 1) / 2) * (p.detune || 0.01)) / FL_SR;
                    phases[v] += dt;
                    toneSum += p.wave == "sine" ? Math.sin(2 * Math.PI * phases[v]) : p.wave == "square" ? flSquare(phases[v], dt) : flSaw(phases[v], dt);
                }
                s += toneSum / voices * p.tone;
            }
            if (p.sub) {
                const subFreq = (p.subF0 || 90) * Math.pow((p.subF1 || 30) / (p.subF0 || 90), type == "riser" ? 1 - freqX : freqX == undefined ? x : 1 - freqX);
                subPhase += subFreq / FL_SR;
                s += Math.sin(2 * Math.PI * subPhase) * p.sub;
            }
            if (p.stutter) {
                const rate = p.stutter * (type == "riser" ? (1 + 3 * x) : 1);
                if (((t * rate) % 1) > 0.55)
                    s *= 0.15;
            }
            out[i] = flDrive(lp.p(s * shape), p.drive || 0);
        }
        let result = flNormalize(out);
        if (p.verb)
            result = flNormalize(flReverb(result, p.verb, p.verbDecay || 2, p.verbTail || 1.2));
        if (p.reverse)
            result.reverse();
        return flFades(result, type == "riser" || p.reverse ? 20 : 0.2, type == "riser" && !p.reverse ? 4 : 40);
    };
    // Transforms another library sound: reverse, pitch, tape stop, stutter,
    // half-time, filters, crushing and reverb.
    FLGen.xform = (p, r) => {
        const source = flSourcePcm(p.src);
        if (!source)
            return flBuf(0.1);
        let pcm = p.pitch ? flResample(source, Math.pow(2, p.pitch / 12)) : source.slice();
        if (p.maxLen && pcm.length > p.maxLen * FL_SR)
            pcm = pcm.slice(0, Math.floor(p.maxLen * FL_SR));
        if (p.tapeStop) {
            // the playback rate falls from 1 to 0 over the sound
            const out = new Float32Array(Math.floor(pcm.length * (p.tapeStop || 1.4)));
            let pos = 0;
            for (let i = 0; i < out.length; i++) {
                const x = i / out.length;
                const rate = Math.pow(1 - x, p.tapeCurve || 1.3);
                const i0 = Math.floor(pos);
                if (i0 + 1 >= pcm.length)
                    break;
                out[i] = pcm[i0] + (pcm[i0 + 1] - pcm[i0]) * (pos - i0);
                pos += rate;
            }
            pcm = out;
        }
        if (p.stutter) {
            const slice = Math.floor(p.stutter * FL_SR);
            const repeats = p.repeats || 4;
            const out = new Float32Array(slice * repeats + Math.max(0, pcm.length - slice));
            for (let k = 0; k < repeats; k++)
                for (let i = 0; i < slice && i < pcm.length; i++)
                    out[k * slice + i] = pcm[i] * (i < 64 ? i / 64 : 1) * (slice - i < 64 ? (slice - i) / 64 : 1) * (p.stutterFade ? 1 - k / repeats * 0.6 : 1);
            for (let i = slice; i < pcm.length; i++)
                out[slice * repeats + i - slice] = pcm[i];
            pcm = out;
        }
        if (p.lp)
            flLP(p.lp, p.q || 0.71).run(pcm);
        if (p.hp)
            flHP(p.hp, p.q || 0.71).run(pcm);
        if (p.drive)
            for (let i = 0; i < pcm.length; i++)
                pcm[i] = flDrive(pcm[i], p.drive);
        if (p.crush)
            flCrush(flNormalize(pcm), p.crush, p.downsample || 1);
        let result = flNormalize(pcm);
        if (p.verb)
            result = flNormalize(flReverb(result, p.verb, p.verbDecay || 1.8, p.verbTail || 1.2));
        if (p.reverse)
            result.reverse();
        return flFades(flTrimSilence(result), p.reverse ? 30 : 0.2, p.reverse ? 6 : 20);
    };
    // Layers several library sounds (with gain, offset and pitch).
    FLGen.layer = (p, r) => {
        const parts = [];
        let length = 1;
        for (const item of p.items) {
            const source = flSourcePcm(item.key);
            if (!source)
                continue;
            const pcm = item.pitch ? flResample(source, Math.pow(2, item.pitch / 12)) : source;
            const offset = Math.floor((item.offset || 0) * FL_SR);
            parts.push({ pcm, offset, gain: item.gain == undefined ? 1 : item.gain });
            length = Math.max(length, offset + pcm.length);
        }
        const out = new Float32Array(length);
        for (const part of parts)
            for (let i = 0; i < part.pcm.length; i++)
                out[part.offset + i] += part.pcm[i] * part.gain;
        for (let i = 0; i < out.length; i++)
            out[i] = Math.tanh(out[i] * (p.glue || 0.8));
        let result = flNormalize(out);
        if (p.verb)
            result = flNormalize(flReverb(result, p.verb, 1.2, 0.6));
        return flFades(flTrimSilence(result), 0.2, 15);
    };
    // ------------------------------------------------------------- catalog
    // The recipes below are shared with Sound Library 3 (fl_soundpacks3.js).
    let FLPackKit = null;
    {
        const PK = "Packs";
        const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
        const pad2 = (n) => String(n).padStart(2, "0");
        const merge = (base, mods) => {
            const out = JSON.parse(JSON.stringify(base));
            for (const key of Object.keys(mods || {})) {
                const value = mods[key];
                if (value && typeof value == "object" && !Array.isArray(value) && out[key] && typeof out[key] == "object")
                    out[key] = merge(out[key], value);
                else
                    out[key] = value;
            }
            return out;
        };
        // Small seeded jitter so the numbered variants of one character differ.
        // Pitch-defining values stay exact so melodic sounds stay in tune.
        const JITTER_FIXED = new Set(["f", "bursts", "voices", "crush", "downsample", "ratio", "pitch", "subOctave", "width", "rootKey"]);
        const jitter = (params, seed, amount) => {
            const rand = flRng(seed);
            const walk = (obj) => {
                for (const key of Object.keys(obj)) {
                    const v = obj[key];
                    if (typeof v == "number" && !JITTER_FIXED.has(key))
                        obj[key] = v * (1 + (rand() * 2 - 1) * amount);
                    else if (v && typeof v == "object" && !Array.isArray(v))
                        walk(v);
                }
            };
            const copy = JSON.parse(JSON.stringify(params));
            walk(copy);
            return copy;
        };
        // ---------------------------------------------- drum characters
        const KICK = {
            Punch: { body: { decay: 0.8 }, click: 0.55, drive: 1.6 },
            Sub: { body: { decay: 2.0, end: 0.88 }, click: 0.08, len: 1.6 },
            Knock: { body: { start: 1.4, sweep: 0.6, decay: 0.6 }, drive: 2.6 },
            Round: { click: 0.12, body: { sweep: 1.4 }, drive: 0.4 },
            Hard: { drive: 5, click: 0.7 },
            Dusty: { lp: 1600, crush: 7, dust: 0.035 },
            Tight: { body: { decay: 0.45, start: 1.3 }, len: 0.55 },
            Boom: { body: { decay: 1.6, end: 0.92 }, room: 0.12 },
            Long: { body: { decay: 2.6 }, len: 2.2 },
            Distorted: { drive: 9, lp: 6000 },
            Clicky: { click: 1.0, body: { sweep: 0.5 } },
            Thump: { body: { start: 0.8, end: 1.1 } },
        };
        const SNARE = {
            Tight: { noise: { decay: 0.7 }, body: { decay: 0.7 } },
            Fat: { body: { decay: 1.6, amp: 1.3 }, noise: { hp: 0.6 }, drive: 1.5 },
            Crack: { noise: { hp: 1.6, decay: 0.8 }, click: 0.5 },
            Snappy: { noise: { amp: 1.4, decay: 1.2 } },
            Room: { room: 0.35 },
            Dusty: { lp: 4200, crush: 8, dust: 0.03 },
            Rim: { ring: { amp: 0.9, ratio: 3.6, decay: 0.02 }, noise: { decay: 0.6 } },
            Body: { body: { amp: 1.5, decay: 1.3 } },
            Bright: { noise: { hp: 1.4, lp: 1.3 } },
            Dark: { noise: { lp: 0.45 }, lp: 5000 },
            Verb: { room: 0.55, roomDecay: 1.1 },
        };
        const CLAP = {
            Tight: { tail: 0.7, bursts: 3 },
            Wide: { bursts: 5, spacing: 1.2, tail: 1.3 },
            Room: { room: 0.4 },
            Layered: { bursts: 6, spacing: 0.8, humanize: 1 },
            Dusty: { lp: 5000, crush: 8 },
            Snappy: { freq: 1.25, tail: 0.8 },
            Long: { tail: 2.0 },
        };
        const HAT = {
            Crisp: { decay: 0.8, bp: 1.15, hp: 1.15 },
            Dark: { bp: 0.7, hp: 0.7, tune: 0.85 },
            Tight: { decay: 0.55 },
            Sizzle: { sizzle: 0.5 },
            Dusty: { crush: 7, lp: 9000 },
            Metal: { noise: 0.15, ringMod: true },
            Soft: { attack: 0.004, decay: 1.2, noise: 0.6 },
            Shuffle: { decay: 1.4, tune: 1.12 },
        };
        const OHAT = {
            Short: { decay: 0.7 },
            Long: { decay: 1.7, len: 1.6 },
            Trashy: { noise: 0.7, bp: 0.75, ringMod: true },
            Bright: { bp: 1.2, hp: 1.15, sizzle: 0.3 },
        };
        // multiply numeric modifiers (values in characters are factors unless absolute keys)
        const ABSOLUTE = new Set(["click", "drive", "lp", "crush", "dust", "room", "roomDecay", "len", "bursts", "humanize", "sizzle", "ringMod", "attack", "noise"]);
        const applyCharacter = (base, mods) => {
            const out = JSON.parse(JSON.stringify(base));
            const apply = (target, m) => {
                for (const key of Object.keys(m)) {
                    const value = m[key];
                    if (value && typeof value == "object") {
                        target[key] = target[key] || {};
                        apply(target[key], value);
                    }
                    else if (typeof value == "number" && !ABSOLUTE.has(key) && typeof target[key] == "number") {
                        target[key] *= value;
                    }
                    else if (key == "len" && typeof target.len == "number") {
                        target.len = Math.max(target.len, value);
                    }
                    else {
                        target[key] = value;
                    }
                }
            };
            apply(out, mods);
            return out;
        };
        // ---------------------------------------------- recipes
        const PERC = {
            "Conga": (k) => ["drum2", { body: { start: 380 * k, end: 300 * k, sweep: 0.012, decay: 0.16 }, noise: { amp: 0.12, hp: 900, lp: 6000, decay: 0.015 }, click: 0.2, len: 0.5 }],
            "Bongo": (k) => ["drum2", { body: { start: 560 * k, end: 470 * k, sweep: 0.01, decay: 0.09 }, noise: { amp: 0.1, hp: 1500, lp: 8000, decay: 0.01 }, click: 0.25, len: 0.3 }],
            "Shaker": (k) => ["drum2", { noise: { amp: 1, hp: 4500 * k, lp: 13000, decay: 0.05, attack: 0.018 }, len: 0.22 }],
            "Tambourine": (k) => ["hat2", { f: 1650 * k, decay: 0.12, bp: 8500, hp: 5000, noise: 0.5, len: 0.4, sizzle: 0.3 }],
            "Cowbell": (k) => ["drum2", { body: { start: 545 * k, end: 540 * k, decay: 0.2, wave: "tri" }, ring: { ratio: 1.48, amp: 0.8, decay: 0.18 }, click: 0.2, hp: 400, len: 0.5 }],
            "Rim": (k) => ["drum2", { body: { start: 520 * k, end: 470 * k, decay: 0.014 }, ring: { ratio: 3.4, amp: 0.7, decay: 0.008 }, click: 0.7, len: 0.15 }],
            "Woodblock": (k) => ["drum2", { body: { start: 1100 * k, end: 1000 * k, decay: 0.035 }, ring: { ratio: 2.5, amp: 0.5, decay: 0.02 }, click: 0.3, len: 0.15 }],
            "Low Tom": (k) => ["drum2", { body: { start: 150 * k, end: 95 * k, sweep: 0.05, decay: 0.32 }, noise: { amp: 0.15, hp: 300, lp: 4000, decay: 0.03 }, len: 0.7 }],
            "High Tom": (k) => ["drum2", { body: { start: 260 * k, end: 185 * k, sweep: 0.04, decay: 0.22 }, noise: { amp: 0.15, hp: 500, lp: 5000, decay: 0.025 }, len: 0.5 }],
            "Clave": (k) => ["drum2", { body: { start: 2500 * k, end: 2450 * k, decay: 0.028 }, len: 0.12 }],
            "Log Drum": (k) => ["logdrum", { f: 65.406 * k, decay: 0.4, drop: 0.7, drive: 2 }],
            "Timbale": (k) => ["drum2", { body: { start: 450 * k, end: 410 * k, decay: 0.24 }, ring: { ratio: 2.46, amp: 0.4, decay: 0.12 }, noise: { amp: 0.2, hp: 1200, lp: 7000, decay: 0.03 }, click: 0.5, len: 0.6 }],
            "Guiro": (k) => ["guiro", { bp: 3000 * k, scrapes: 9, span: 0.3, len: 0.45 }],
            "Tabla": (k) => ["drum2", { body: { start: 420 * k, end: 330 * k, sweep: 0.08, decay: 0.3 }, ring: { ratio: 2.01, amp: 0.5, decay: 0.2 }, click: 0.3, len: 0.6 }],
            "Snap": (k) => ["drum2", { noise: { amp: 1, bp: 2400 * k, q: 2.5, hp: 1000, lp: 9000, decay: 0.03 }, click: 0.3, len: 0.2 }],
            "Metal Hit": (k) => ["drum2", { body: { start: 315 * k, end: 312 * k, decay: 0.25 }, ring: { ratio: 2.71, amp: 0.8, decay: 0.2 }, noise: { amp: 0.3, bp: 2500, hp: 800, lp: 9000, decay: 0.05 }, click: 0.3, len: 0.7 }],
            "Blip": (k) => ["drop", { f0: 700 * k, f1: 1900 * k, glide: 0.03, decay: 0.06 }],
            "Triangle": (k) => ["tones", { partials: [[2030 * k, 0.8, 1.2], [5230 * k, 0.5, 0.8], [8800 * k, 0.3, 0.5]], len: 1.5 }],
            "Agogo": (k) => ["drum2", { body: { start: 880 * k, end: 870 * k, decay: 0.3 }, ring: { ratio: 2.57, amp: 0.4, decay: 0.15 }, click: 0.15, len: 0.6 }],
            "Cabasa": (k) => ["drum2", { noise: { amp: 1, hp: 6000 * k, lp: 14000, decay: 0.06, attack: 0.01 }, len: 0.2 }],
            "Vinyl Tick": (k) => ["drum2", { noise: { amp: 1, hp: 3000 * k, lp: 8000, decay: 0.004 }, click: 0.5, crush: 8, len: 0.06 }],
            "Knock": (k) => ["drum2", { body: { start: 190 * k, end: 150 * k, decay: 0.05 }, noise: { amp: 0.4, bp: 900, hp: 200, lp: 3000, decay: 0.02 }, click: 0.3, len: 0.2 }],
            "Glass Tink": (k) => ["tones", { partials: [[3100 * k, 1, 0.35], [7900 * k, 0.4, 0.18]], len: 0.7 }],
            "Laser Perc": (k) => ["pitchFX", { f0: 3200 * k, f1: 400 * k, len: 0.18, wave: "square", curve: 0.4, decay: 0.08 }],
            "Zap Perc": (k) => ["pitchFX", { f0: 1800 * k, f1: 120 * k, len: 0.16, wave: "saw", curve: 0.5, decay: 0.07 }],
            "Djembe": (k) => ["drum2", { body: { start: 230 * k, end: 180 * k, sweep: 0.03, decay: 0.16 }, noise: { amp: 0.3, bp: 1600, hp: 400, lp: 6000, decay: 0.03 }, len: 0.4 }],
            "Cajon": (k) => ["drum2", { body: { start: 110 * k, end: 78 * k, sweep: 0.03, decay: 0.18 }, noise: { amp: 0.25, hp: 400, lp: 5000, decay: 0.05 }, len: 0.4 }],
            "Udu": (k) => ["drop", { f0: 180 * k, f1: 420 * k, glide: 0.08, decay: 0.2 }],
            "Talking Drum": (k) => ["drop", { f0: 330 * k, f1: 190 * k, glide: 0.12, decay: 0.18 }],
            "Steel Hit": (k) => ["tones", { partials: [[620 * k, 1, 0.5], [1240 * k, 0.5, 0.35], [1910 * k, 0.3, 0.2]], click: 0.2, len: 0.8 }],
        };
        const BASS = {
            "808 Long": (p) => ["bass808", merge({ hold: 0.35, decay: 2.2, len: 4, drive: 1.2 }, p), { rootKey: 36 }],
            "808 Punch": (p) => ["bass808", merge({ hold: 0.05, decay: 0.7, drop: 3.5, sweep: 0.015, click: 0.4, drive: 2.5, len: 1.6 }, p), { rootKey: 36 }],
            "808 Distorted": (p) => ["bass808", merge({ hold: 0.25, decay: 1.6, drive: 9, clip: 0.6, lp: 4500, len: 3 }, p), { rootKey: 36 }],
            "808 Slide": (p) => ["bass808", merge({ hold: 0.6, decay: 2.6, drop: 0.7, sweep: 0.25, len: 4 }, p), { rootKey: 36 }],
            "Sub Bass": (p) => ["tone2", merge({ f: hz(36), osc: "sine", len: 2.5, attack: 0.008, release: 0.08, sub: 0 }, p), { rootKey: 36, loop: [0.2, 0.9] }],
            "Reese": (p) => ["tone2", merge({ f: hz(36), osc: "saw", voices: 3, detune: 0.32, cutoff: 650, res: 1.2, len: 2.5, sub: 0.5, drive: 1.5, release: 0.1 }, p), { rootKey: 36, loop: [0.2, 0.9] }],
            "Wobble": (p) => ["tone2", merge({ f: hz(36), osc: "saw", voices: 2, detune: 0.1, cutoff: 500, res: 5, lfoRate: 4, lfoDepth: 4, len: 2.5, sub: 0.5, drive: 2.5 }, p), { rootKey: 36, loop: [0.0, 1.0] }],
            "Pluck Bass": (p) => ["tone2", merge({ f: hz(36), osc: "saw", cutoff: 300, filterEnv: 3500, filterDecay: 0.08, res: 1.5, decay: 0.35, sustain: 0.2, len: 0.9, sub: 0.6 }, p), { rootKey: 36 }],
            "FM Bass": (p) => ["tone2", merge({ f: hz(36), osc: "fm", ratio: 1, index: 3.5, indexDecay: 0.18, indexFloor: 0.6, decay: 0.8, sustain: 0.5, len: 1.4, sub: 0.4 }, p), { rootKey: 36 }],
            "Donk": (p) => ["tone2", merge({ f: hz(36), osc: "fm", ratio: 1, index: 4, indexDecay: 0.04, decay: 0.22, sustain: 0, len: 0.6 }, p), { rootKey: 36 }],
            "Acid": (p) => ["tone2", merge({ f: hz(36), osc: "saw", cutoff: 350, filterEnv: 3800, filterDecay: 0.12, res: 9, decay: 0.5, sustain: 0.3, len: 0.8, drive: 2 }, p), { rootKey: 36 }],
            "Finger Bass": (p) => ["tone2", merge({ f: hz(36), osc: "ks", damping: 0.996, pick: 1800, len: 1.6 }, p), { rootKey: 36 }],
            "Synth Bass": (p) => ["tone2", merge({ f: hz(36), osc: "saw", voices: 2, detune: 0.06, cutoff: 900, filterEnv: 2400, filterDecay: 0.2, res: 1.4, decay: 0.6, sustain: 0.6, len: 1.4, sub: 0.5 }, p), { rootKey: 36 }],
            "Organ Bass": (p) => ["tone2", merge({ f: hz(36), osc: "organ", drawbars: [[1, 1], [2, 0.6], [3, 0.3]], decay: 0.4, sustain: 0.4, len: 0.9 }, p), { rootKey: 36 }],
            "Log Bass": (p) => ["logdrum", merge({ f: 65.406, decay: 0.55, drop: 0.5, drive: 2.5, len: 1.2 }, p), { rootKey: 36 }],
            "Hoover": (p) => ["tone2", merge({ f: hz(48), osc: "saw", voices: 7, detune: 0.5, cutoff: 2800, glide: -5, glideTime: 0.08, drive: 2, len: 2, chorus: 0.5 }, p), { rootKey: 48, loop: [0.2, 0.9] }],
        };
        const MELODIC = {
            "Bell": (p) => ["tone2", merge({ osc: "bell", len: 2.4, verb: 0.2 }, p)],
            "Pluck": (p) => ["tone2", merge({ osc: "saw", voices: 3, detune: 0.12, cutoff: 600, filterEnv: 9000, filterDecay: 0.07, decay: 0.35, sustain: 0, len: 1.0, verb: 0.15 }, p)],
            "Flute": (p) => ["tone2", merge({ osc: "sine", attack: 0.08, vib: 0.18, vibDelay: 0.2, noise: 0.05, len: 2, sub: 0, release: 0.2 }, p), { loop: [0.3, 0.9] }],
            "Dark Pad": (p) => ["tone2", merge({ osc: "saw", voices: 5, detune: 0.25, cutoff: 900, attack: 0.6, release: 0.8, len: 4, chorus: 0.5, verb: 0.3 }, p), { loop: [0.3, 0.9] }],
            "Bright Pad": (p) => ["tone2", merge({ osc: "saw", voices: 7, detune: 0.3, cutoff: 5000, attack: 0.5, release: 0.8, len: 4, chorus: 0.6, verb: 0.35 }, p), { loop: [0.3, 0.9] }],
            "Choir": (p) => ["vowel", merge({ seq: ["a", "a"], len: 3, attack: 0.3, release: 0.4, breath: 0.08, verb: 0.3 }, p), { loop: [0.3, 0.85] }],
            "Piano": (p) => ["additive", merge({ len: 2.6, inharm: 0.0005, hammer: 0.08, partials: [[1, 1, 2.0], [2, 0.55, 1.4], [3, 0.32, 1.0], [4, 0.2, 0.75], [5, 0.13, 0.55], [6, 0.08, 0.4]] }, p)],
            "Rhodes": (p) => ["tone2", merge({ osc: "fm", ratio: 1, index: 1.3, indexDecay: 0.7, indexFloor: 0.22, decay: 2, sustain: 0, len: 2.5, chorus: 0.3 }, p)],
            "Organ Stab": (p) => ["tone2", merge({ osc: "organ", chord: [0, 4, 7], decay: 0.3, sustain: 0.2, len: 0.8 }, p)],
            "Chord Stab": (p) => ["tone2", merge({ osc: "saw", voices: 2, detune: 0.1, chord: [0, 3, 7, 10], cutoff: 900, filterEnv: 6000, filterDecay: 0.1, decay: 0.35, sustain: 0.1, len: 0.9, verb: 0.2 }, p)],
            "Supersaw": (p) => ["tone2", merge({ osc: "saw", voices: 9, detune: 0.35, cutoff: 9000, len: 2, chorus: 0.4, release: 0.2 }, p), { loop: [0.2, 0.9] }],
            "Brass Stab": (p) => ["tone2", merge({ osc: "saw", voices: 4, detune: 0.1, chord: [0, 4, 7], cutoff: 1200, filterEnv: 4500, filterDecay: 0.12, attack: 0.02, decay: 0.4, sustain: 0.3, len: 0.9 }, p)],
            "Strings": (p) => ["tone2", merge({ osc: "saw", voices: 6, detune: 0.14, cutoff: 3000, attack: 0.3, vib: 0.1, release: 0.5, len: 3, chorus: 0.4 }, p), { loop: [0.3, 0.9] }],
            "Guitar Pluck": (p) => ["tone2", merge({ osc: "ks", damping: 0.997, pick: 5000, len: 2.2 }, p)],
            "Marimba": (p) => ["tone2", merge({ osc: "bell", bellPartials: [[1, 1, 0.6], [4, 0.3, 0.12], [9.2, 0.08, 0.04]], len: 1.3 }, p)],
            "Kalimba": (p) => ["tone2", merge({ osc: "bell", bellPartials: [[1, 1, 0.8], [6.2, 0.22, 0.07]], len: 1.4, verb: 0.15 }, p)],
            "Steel Pan": (p) => ["tone2", merge({ osc: "bell", bellPartials: [[1, 1, 0.9], [2, 0.6, 0.5], [3, 0.3, 0.3], [4.2, 0.25, 0.2]], len: 1.6 }, p)],
            "Saw Lead": (p) => ["tone2", merge({ osc: "saw", voices: 3, detune: 0.12, cutoff: 6000, vib: 0.15, len: 2, release: 0.15 }, p), { loop: [0.2, 0.9] }],
            "Square Lead": (p) => ["tone2", merge({ osc: "square", voices: 2, detune: 0.06, cutoff: 5000, vib: 0.12, len: 2, release: 0.15 }, p), { loop: [0.2, 0.9] }],
            "Chip Lead": (p) => ["tone2", merge({ osc: "square", width: 0.25, len: 1.4, release: 0.05 }, p), { loop: [0.1, 0.9] }],
            "Glass Keys": (p) => ["tone2", merge({ osc: "fm", ratio: 5.19, index: 1.8, indexDecay: 0.5, decay: 1.8, sustain: 0, len: 2.4, verb: 0.25 }, p)],
            "Vocal Pad": (p) => ["vowel", merge({ seq: ["o", "a"], len: 3, attack: 0.4, release: 0.5, breath: 0.1, female: true, verb: 0.35 }, p), { loop: [0.3, 0.85] }],
            "Tape Keys": (p) => ["tone2", merge({ osc: "fm", ratio: 1, index: 1.1, indexDecay: 0.6, indexFloor: 0.15, decay: 1.6, sustain: 0, len: 2, vib: 0.08, vibRate: 0.8, vibDelay: 0, crush: 10, chorus: 0.4 }, p)],
            "Arp Pluck": (p) => ["tone2", merge({ osc: "square", width: 0.3, cutoff: 800, filterEnv: 7000, filterDecay: 0.05, decay: 0.2, sustain: 0, len: 0.6, echo: 0.6, echoTime: 0.18 }, p)],
            "Hoover Lead": (p) => ["tone2", merge({ osc: "saw", voices: 7, detune: 0.45, cutoff: 3200, glide: -7, glideTime: 0.07, drive: 2, len: 2, chorus: 0.4 }, p), { loop: [0.2, 0.9] }],
            "Sitar": (p) => ["tone2", merge({ osc: "ks", damping: 0.998, pick: 11000, len: 2.4, drive: 0.8 }, p)],
            "Koto": (p) => ["tone2", merge({ osc: "ks", damping: 0.995, pick: 7000, len: 1.8 }, p)],
            "Harp": (p) => ["tone2", merge({ osc: "ks", damping: 0.998, pick: 4000, len: 2.6, verb: 0.2 }, p)],
            "Ocarina": (p) => ["tone2", merge({ osc: "sine", attack: 0.05, vib: 0.2, noise: 0.02, len: 1.8, release: 0.2 }, p), { loop: [0.25, 0.9] }],
            "Trumpet": (p) => ["tone2", merge({ osc: "saw", cutoff: 1500, filterEnv: 3500, filterDecay: 0.15, attack: 0.04, vib: 0.12, len: 1.8, release: 0.15 }, p), { loop: [0.3, 0.9] }],
        };
        const FXR = {
            "Riser": (p) => ["fx2", merge({ type: "riser", f0: 300, f1: 9000, q: 3, len: 4, tone: 0.4, toneF0: 110, toneF1: 880, voices: 3 }, p)],
            "Noise Riser": (p) => ["fx2", merge({ type: "riser", f0: 400, f1: 12000, q: 2, len: 4 }, p)],
            "Downlifter": (p) => ["fx2", merge({ type: "downlifter", f0: 9000, f1: 250, q: 2.5, len: 3, sub: 0.3 }, p)],
            "Impact": (p) => ["fx2", merge({ type: "burst", f0: 3000, f1: 200, q: 0.8, decay: 0.45, len: 3, sub: 0.9, subF0: 90, subF1: 32, verb: 0.35 }, p)],
            "Sweep": (p) => ["fx2", merge({ type: "sweep", f0: 300, f1: 7000, q: 1.5, len: 1.6 }, p)],
            "Zap": (p) => ["fx2", merge({ type: "zap", f0: 6000, f1: 300, q: 4, decay: 0.12, sweepTime: 0.1, len: 0.4, tone: 0.8, toneF0: 3000, toneF1: 200, wave: "square", noise: 0.3 }, p)],
            "Sub Drop": (p) => ["fx2", merge({ type: "subdrop", noise: 0, sub: 1, subF0: 110, subF1: 28, len: 2.5, hold: 0.15 }, p)],
            "Texture": (p) => ["fx2", merge({ type: "texture", f0: 200, f1: 3000, q: 4, len: 6, tone: 0.25, toneF0: 130, toneF1: 260, wave: "sine", rate: 0.2, verb: 0.4 }, p)],
            "Stutter Riser": (p) => ["fx2", merge({ type: "riser", f0: 500, f1: 10000, q: 2.5, len: 4, stutter: 4, tone: 0.3 }, p)],
            "Reverse Swell": (p) => ["fx2", merge({ type: "burst", f0: 5000, f1: 400, q: 0.8, decay: 0.8, len: 2.5, verb: 0.5, reverse: true, tone: 0.3, toneF0: 260, toneF1: 130 }, p)],
        };
        const VOX = {
            "Hey": (p) => ["vowel", merge({ seq: ["e", "e", "i"], len: 0.35, contour: [2, -1], breath: 0.2, verb: 0.2 }, p)],
            "Yeah": (p) => ["vowel", merge({ seq: ["i", "e", "ae", "a"], len: 0.55, contour: [0, -2], breath: 0.1 }, p)],
            "Ah": (p) => ["vowel", merge({ seq: ["a", "a"], len: 0.5, release: 0.12 }, p)],
            "Oh": (p) => ["vowel", merge({ seq: ["o", "o"], len: 0.5, release: 0.12 }, p)],
            "Ooh": (p) => ["vowel", merge({ seq: ["u", "u"], len: 0.7, release: 0.2, verb: 0.2 }, p)],
            "Woah": (p) => ["vowel", merge({ seq: ["u", "o", "a"], len: 0.7, contour: [-1, 1] }, p)],
            "Uh": (p) => ["vowel", merge({ seq: ["er", "er"], len: 0.25, breath: 0.35, contour: [1, -2] }, p)],
            "Ay": (p) => ["vowel", merge({ seq: ["a", "e", "i"], len: 0.4 }, p)],
            "Ho": (p) => ["vowel", merge({ seq: ["o", "o"], len: 0.3, breath: 0.4, contour: [2, -1], verb: 0.25 }, p)],
            "Eee": (p) => ["vowel", merge({ seq: ["i", "i"], len: 0.6, female: true, contour: [0, 2] }, p)],
        };
        // ---------------------------------------------- genre packs
        const GENRES = [
            { name: "Trap", kick: { body: { start: 230, end: 50, sweep: 0.022, decay: 0.42 }, click: 0.35, drive: 1.4, len: 1 }, kicks: ["Punch", "Boom", "Knock", "Sub", "Hard", "Tight", "Long", "Clicky"],
                snare: { body: { start: 260, end: 190, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 2200, lp: 13000, decay: 0.14 }, click: 0.2, len: 0.6 }, snares: ["Tight", "Crack", "Snappy", "Room", "Bright", "Verb"],
                clap: { freq: 1250, q: 1.9, tail: 0.15, bursts: 4 }, claps: ["Room", "Tight", "Layered", "Wide"],
                hat: { f: 220, decay: 0.035, bp: 10500, hp: 8000, noise: 0.45, len: 0.18 }, hats: ["Crisp", "Tight", "Sizzle", "Metal", "Soft", "Dark"],
                ohat: { f: 220, decay: 0.28, bp: 10000, hp: 7200, noise: 0.5, len: 0.9 }, percs: ["Rim", "Snap", "Cowbell", "Bongo", "Shaker", "Laser Perc"],
                bass: ["808 Long", "808 Punch", "808 Distorted", "808 Slide", "Sub Bass"], melodic: ["Bell", "Dark Pad", "Flute", "Pluck", "Choir", "Glass Keys", "Piano", "Strings"],
                fx: ["Riser", "Impact", "Reverse Swell", "Zap"], vox: ["Hey", "Uh", "Yeah"], key: 49 },
            { name: "Drill", kick: { body: { start: 260, end: 52, sweep: 0.016, decay: 0.3 }, click: 0.5, drive: 2, len: 0.8 }, kicks: ["Tight", "Punch", "Knock", "Hard", "Clicky", "Sub", "Boom", "Thump"],
                snare: { body: { start: 300, end: 210, sweep: 0.008, decay: 0.05 }, noise: { amp: 1, hp: 2600, lp: 14000, decay: 0.11 }, click: 0.4, len: 0.5 }, snares: ["Crack", "Tight", "Rim", "Bright", "Snappy", "Room"],
                clap: { freq: 1400, q: 2.2, tail: 0.1, bursts: 3 }, claps: ["Tight", "Snappy", "Room", "Layered"],
                hat: { f: 240, decay: 0.03, bp: 11000, hp: 8500, noise: 0.4, len: 0.15 }, hats: ["Crisp", "Tight", "Metal", "Sizzle", "Shuffle", "Dark"],
                ohat: { f: 230, decay: 0.22, bp: 10500, hp: 7500, noise: 0.45, len: 0.8 }, percs: ["Rim", "Woodblock", "Shaker", "Snap", "Metal Hit", "Glass Tink"],
                bass: ["808 Slide", "808 Punch", "808 Distorted", "808 Long", "Sub Bass"], melodic: ["Piano", "Strings", "Bell", "Dark Pad", "Choir", "Flute", "Guitar Pluck", "Glass Keys"],
                fx: ["Riser", "Sub Drop", "Impact", "Reverse Swell"], vox: ["Uh", "Ho", "Hey"], key: 50 },
            { name: "Boom Bap", kick: { body: { start: 150, end: 55, sweep: 0.03, decay: 0.22 }, click: 0.6, drive: 1.2, lp: 4500, dust: 0.015, len: 0.7 }, kicks: ["Dusty", "Punch", "Round", "Knock", "Thump", "Boom", "Tight", "Clicky"],
                snare: { body: { start: 220, end: 175, sweep: 0.01, decay: 0.08 }, noise: { amp: 0.9, hp: 900, lp: 8000, decay: 0.2 }, click: 0.3, drive: 1, len: 0.6 }, snares: ["Fat", "Dusty", "Crack", "Room", "Body", "Dark"],
                clap: { freq: 1000, q: 1.4, tail: 0.16, bursts: 5 }, claps: ["Dusty", "Wide", "Room", "Layered"],
                hat: { f: 200, decay: 0.05, bp: 8000, hp: 6000, noise: 0.5, len: 0.2 }, hats: ["Dusty", "Dark", "Soft", "Shuffle", "Crisp", "Tight"],
                ohat: { f: 200, decay: 0.3, bp: 8000, hp: 6000, noise: 0.5, len: 0.9 }, percs: ["Rim", "Tambourine", "Shaker", "Conga", "Snap", "Vinyl Tick"],
                bass: ["Finger Bass", "Sub Bass", "808 Long", "Organ Bass", "Synth Bass"], melodic: ["Piano", "Rhodes", "Strings", "Trumpet", "Guitar Pluck", "Organ Stab", "Tape Keys", "Flute"],
                fx: ["Reverse Swell", "Sweep", "Impact", "Texture"], vox: ["Ho", "Uh", "Yeah"], key: 48 },
            { name: "Lo-Fi", kick: { body: { start: 140, end: 50, sweep: 0.025, decay: 0.26 }, click: 0.15, drive: 1.2, lp: 1800, crush: 9, dust: 0.03, len: 0.7 }, kicks: ["Dusty", "Round", "Thump", "Boom", "Sub", "Punch", "Tight", "Knock"],
                snare: { body: { start: 210, end: 170, sweep: 0.01, decay: 0.07 }, noise: { amp: 0.8, hp: 700, lp: 5000, decay: 0.16 }, lp: 5000, crush: 9, dust: 0.02, len: 0.5 }, snares: ["Dusty", "Dark", "Body", "Room", "Rim", "Tight"],
                clap: { freq: 900, q: 1.6, tail: 0.12, bursts: 4, lp: 5000 }, claps: ["Dusty", "Room", "Tight", "Long"],
                hat: { f: 190, decay: 0.045, bp: 7000, hp: 5000, noise: 0.55, len: 0.2, crush: 9 }, hats: ["Dusty", "Soft", "Dark", "Shuffle", "Tight", "Crisp"],
                ohat: { f: 190, decay: 0.26, bp: 7000, hp: 5000, noise: 0.55, len: 0.8, crush: 9 }, percs: ["Shaker", "Vinyl Tick", "Knock", "Rim", "Woodblock", "Glass Tink"],
                bass: ["Finger Bass", "Sub Bass", "Synth Bass", "Organ Bass", "808 Long"], melodic: ["Tape Keys", "Rhodes", "Piano", "Guitar Pluck", "Kalimba", "Vocal Pad", "Flute", "Marimba"],
                fx: ["Texture", "Reverse Swell", "Sweep", "Downlifter"], vox: ["Ooh", "Ah", "Oh"], key: 53 },
            { name: "R&B", kick: { body: { start: 170, end: 48, sweep: 0.03, decay: 0.4 }, click: 0.2, drive: 0.8, len: 1 }, kicks: ["Round", "Sub", "Boom", "Punch", "Thump", "Long", "Tight", "Dusty"],
                snare: { body: { start: 240, end: 185, sweep: 0.01, decay: 0.06 }, noise: { amp: 0.8, hp: 1600, lp: 11000, decay: 0.15 }, len: 0.6 }, snares: ["Rim", "Snappy", "Room", "Verb", "Tight", "Body"],
                clap: { freq: 1150, q: 1.7, tail: 0.18, bursts: 4 }, claps: ["Room", "Long", "Wide", "Snappy"],
                hat: { f: 210, decay: 0.04, bp: 9500, hp: 7000, noise: 0.45, len: 0.18 }, hats: ["Soft", "Crisp", "Shuffle", "Tight", "Sizzle", "Dark"],
                ohat: { f: 210, decay: 0.3, bp: 9500, hp: 7000, noise: 0.5, len: 0.9 }, percs: ["Snap", "Rim", "Shaker", "Triangle", "Glass Tink", "Conga"],
                bass: ["Sub Bass", "808 Long", "Synth Bass", "Finger Bass", "FM Bass"], melodic: ["Rhodes", "Piano", "Vocal Pad", "Bright Pad", "Glass Keys", "Strings", "Guitar Pluck", "Bell"],
                fx: ["Reverse Swell", "Riser", "Texture", "Sweep"], vox: ["Ooh", "Yeah", "Oh"], key: 51 },
            { name: "Pop", kick: { body: { start: 200, end: 52, sweep: 0.022, decay: 0.32 }, click: 0.45, drive: 1.5, len: 0.8 }, kicks: ["Punch", "Tight", "Round", "Boom", "Knock", "Clicky", "Thump", "Hard"],
                snare: { body: { start: 250, end: 190, sweep: 0.01, decay: 0.07 }, noise: { amp: 1, hp: 1800, lp: 12000, decay: 0.17 }, click: 0.25, len: 0.6 }, snares: ["Snappy", "Room", "Bright", "Fat", "Crack", "Verb"],
                clap: { freq: 1200, q: 1.8, tail: 0.15, bursts: 4 }, claps: ["Layered", "Room", "Wide", "Tight"],
                hat: { f: 215, decay: 0.04, bp: 10000, hp: 7500, noise: 0.45, len: 0.18 }, hats: ["Crisp", "Tight", "Soft", "Sizzle", "Shuffle", "Metal"],
                ohat: { f: 215, decay: 0.3, bp: 10000, hp: 7500, noise: 0.5, len: 0.9 }, percs: ["Snap", "Shaker", "Tambourine", "Rim", "Clave", "Conga"],
                bass: ["Synth Bass", "Sub Bass", "Pluck Bass", "808 Long", "Finger Bass"], melodic: ["Piano", "Pluck", "Bright Pad", "Supersaw", "Guitar Pluck", "Bell", "Strings", "Saw Lead"],
                fx: ["Riser", "Downlifter", "Impact", "Sweep"], vox: ["Yeah", "Hey", "Ooh"], key: 55 },
            { name: "House", kick: { body: { start: 190, end: 50, sweep: 0.02, decay: 0.28 }, click: 0.4, drive: 1.6, len: 0.7 }, kicks: ["Punch", "Round", "Tight", "Thump", "Boom", "Knock", "Clicky", "Hard"],
                snare: { body: { start: 230, end: 180, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 1500, lp: 11000, decay: 0.15 }, len: 0.5 }, snares: ["Tight", "Room", "Snappy", "Body", "Rim", "Verb"],
                clap: { freq: 1100, q: 1.5, tail: 0.17, bursts: 5 }, claps: ["Wide", "Room", "Layered", "Long"],
                hat: { f: 205, decay: 0.045, bp: 9500, hp: 7000, noise: 0.5, len: 0.2 }, hats: ["Shuffle", "Crisp", "Metal", "Soft", "Tight", "Sizzle"],
                ohat: { f: 205, decay: 0.24, bp: 9500, hp: 7000, noise: 0.5, len: 0.7 }, percs: ["Conga", "Bongo", "Shaker", "Rim", "Cowbell", "Clave"],
                bass: ["Organ Bass", "Synth Bass", "Pluck Bass", "Sub Bass", "Acid"], melodic: ["Organ Stab", "Chord Stab", "Piano", "Pluck", "Rhodes", "Strings", "Vocal Pad", "Brass Stab"],
                fx: ["Sweep", "Riser", "Downlifter", "Impact"], vox: ["Hey", "Oh", "Woah"], key: 57 },
            { name: "Deep House", kick: { body: { start: 160, end: 47, sweep: 0.03, decay: 0.32 }, click: 0.2, drive: 1, lp: 5000, len: 0.8 }, kicks: ["Round", "Thump", "Sub", "Boom", "Dusty", "Punch", "Tight", "Long"],
                snare: { body: { start: 220, end: 180, sweep: 0.01, decay: 0.05 }, noise: { amp: 0.8, hp: 1300, lp: 9000, decay: 0.12 }, len: 0.5 }, snares: ["Rim", "Room", "Dark", "Tight", "Verb", "Dusty"],
                clap: { freq: 1000, q: 1.5, tail: 0.15, bursts: 4 }, claps: ["Room", "Long", "Dusty", "Wide"],
                hat: { f: 200, decay: 0.05, bp: 8500, hp: 6500, noise: 0.55, len: 0.2 }, hats: ["Soft", "Shuffle", "Dark", "Dusty", "Crisp", "Tight"],
                ohat: { f: 200, decay: 0.26, bp: 8500, hp: 6500, noise: 0.55, len: 0.8 }, percs: ["Rim", "Shaker", "Conga", "Woodblock", "Glass Tink", "Knock"],
                bass: ["Organ Bass", "Sub Bass", "Synth Bass", "FM Bass", "Finger Bass"], melodic: ["Rhodes", "Chord Stab", "Vocal Pad", "Dark Pad", "Organ Stab", "Piano", "Kalimba", "Glass Keys"],
                fx: ["Texture", "Sweep", "Reverse Swell", "Riser"], vox: ["Oh", "Ooh", "Ah"], key: 55 },
            { name: "Tech House", kick: { body: { start: 180, end: 49, sweep: 0.025, decay: 0.3 }, click: 0.35, drive: 2.5, lp: 4000, len: 0.7 }, kicks: ["Punch", "Thump", "Hard", "Round", "Knock", "Tight", "Distorted", "Boom"],
                snare: { body: { start: 240, end: 190, sweep: 0.01, decay: 0.05 }, noise: { amp: 0.9, hp: 1800, lp: 10000, decay: 0.12 }, len: 0.5 }, snares: ["Rim", "Tight", "Snappy", "Room", "Crack", "Dark"],
                clap: { freq: 1150, q: 1.8, tail: 0.13, bursts: 4 }, claps: ["Tight", "Snappy", "Room", "Layered"],
                hat: { f: 210, decay: 0.04, bp: 9800, hp: 7500, noise: 0.45, len: 0.18 }, hats: ["Metal", "Crisp", "Shuffle", "Tight", "Sizzle", "Dark"],
                ohat: { f: 210, decay: 0.22, bp: 9800, hp: 7500, noise: 0.5, len: 0.7 }, percs: ["Bongo", "Rim", "Shaker", "Woodblock", "Clave", "Metal Hit"],
                bass: ["Synth Bass", "Acid", "Pluck Bass", "FM Bass", "Sub Bass"], melodic: ["Chord Stab", "Organ Stab", "Pluck", "Brass Stab", "Arp Pluck", "Dark Pad", "Vocal Pad", "Square Lead"],
                fx: ["Sweep", "Noise Riser", "Impact", "Zap"], vox: ["Hey", "Ho", "Uh"], key: 57 },
            { name: "Techno", kick: { body: { start: 170, end: 46, sweep: 0.03, decay: 0.4 }, click: 0.3, drive: 3.5, lp: 2800, len: 0.9 }, kicks: ["Hard", "Distorted", "Thump", "Boom", "Punch", "Long", "Knock", "Round"],
                snare: { body: { start: 230, end: 180, sweep: 0.01, decay: 0.05 }, noise: { amp: 0.9, hp: 1700, lp: 9000, decay: 0.14 }, drive: 1.5, len: 0.5 }, snares: ["Room", "Tight", "Dark", "Verb", "Crack", "Rim"],
                clap: { freq: 1050, q: 1.6, tail: 0.2, bursts: 4, room: 0.2 }, claps: ["Room", "Long", "Wide", "Dusty"],
                hat: { f: 200, decay: 0.035, bp: 9000, hp: 7000, noise: 0.4, len: 0.16 }, hats: ["Metal", "Dark", "Crisp", "Tight", "Sizzle", "Shuffle"],
                ohat: { f: 200, decay: 0.25, bp: 9000, hp: 7000, noise: 0.45, len: 0.7 }, percs: ["Metal Hit", "Rim", "Clave", "Zap Perc", "Knock", "Blip"],
                bass: ["Acid", "Synth Bass", "Sub Bass", "FM Bass", "Reese"], melodic: ["Dark Pad", "Arp Pluck", "Chord Stab", "Bell", "Square Lead", "Glass Keys", "Strings", "Pluck"],
                fx: ["Noise Riser", "Sweep", "Texture", "Impact"], vox: ["Ho", "Uh", "Oh"], key: 50 },
            { name: "Drum & Bass", kick: { body: { start: 260, end: 55, sweep: 0.015, decay: 0.2 }, click: 0.6, drive: 2, len: 0.5 }, kicks: ["Tight", "Punch", "Clicky", "Knock", "Hard", "Round", "Thump", "Boom"],
                snare: { body: { start: 280, end: 200, sweep: 0.008, decay: 0.07 }, noise: { amp: 1.1, hp: 1900, lp: 13000, decay: 0.16 }, click: 0.4, drive: 1.2, len: 0.6 }, snares: ["Crack", "Snappy", "Bright", "Room", "Fat", "Tight"],
                clap: { freq: 1300, q: 2, tail: 0.12, bursts: 3 }, claps: ["Snappy", "Tight", "Room", "Layered"],
                hat: { f: 230, decay: 0.03, bp: 11000, hp: 8500, noise: 0.4, len: 0.14 }, hats: ["Crisp", "Tight", "Sizzle", "Metal", "Shuffle", "Soft"],
                ohat: { f: 230, decay: 0.2, bp: 10500, hp: 8000, noise: 0.45, len: 0.7 }, percs: ["Shaker", "Rim", "Tambourine", "Woodblock", "Snap", "Zap Perc"],
                bass: ["Reese", "Sub Bass", "Wobble", "FM Bass", "Hoover"], melodic: ["Dark Pad", "Strings", "Pluck", "Piano", "Bell", "Vocal Pad", "Supersaw", "Arp Pluck"],
                fx: ["Riser", "Impact", "Downlifter", "Reverse Swell"], vox: ["Ah", "Woah", "Hey"], key: 50 },
            { name: "Jungle", kick: { body: { start: 180, end: 54, sweep: 0.02, decay: 0.22 }, click: 0.5, drive: 1.5, lp: 5000, crush: 10, len: 0.6 }, kicks: ["Dusty", "Punch", "Round", "Knock", "Tight", "Boom", "Thump", "Clicky"],
                snare: { body: { start: 250, end: 195, sweep: 0.01, decay: 0.08 }, noise: { amp: 1, hp: 1200, lp: 9000, decay: 0.18 }, crush: 10, room: 0.15, len: 0.6 }, snares: ["Dusty", "Crack", "Room", "Fat", "Snappy", "Bright"],
                clap: { freq: 1100, q: 1.6, tail: 0.14, bursts: 4, crush: 10 }, claps: ["Dusty", "Room", "Tight", "Wide"],
                hat: { f: 215, decay: 0.04, bp: 9000, hp: 6500, noise: 0.5, len: 0.18, crush: 10 }, hats: ["Dusty", "Shuffle", "Crisp", "Tight", "Soft", "Dark"],
                ohat: { f: 215, decay: 0.25, bp: 9000, hp: 6500, noise: 0.5, len: 0.8, crush: 10 }, percs: ["Tambourine", "Conga", "Shaker", "Rim", "Timbale", "Cowbell"],
                bass: ["Sub Bass", "Reese", "Wobble", "Finger Bass", "808 Long"], melodic: ["Strings", "Piano", "Vocal Pad", "Dark Pad", "Rhodes", "Bell", "Brass Stab", "Flute"],
                fx: ["Reverse Swell", "Riser", "Impact", "Texture"], vox: ["Woah", "Hey", "Ah"], key: 52 },
            { name: "Dubstep", kick: { body: { start: 240, end: 50, sweep: 0.02, decay: 0.35 }, click: 0.5, drive: 3, len: 0.8 }, kicks: ["Hard", "Punch", "Boom", "Distorted", "Knock", "Sub", "Thump", "Clicky"],
                snare: { body: { start: 260, end: 190, sweep: 0.01, decay: 0.09 }, noise: { amp: 1.1, hp: 1500, lp: 12000, decay: 0.2 }, drive: 2, room: 0.2, len: 0.7 }, snares: ["Fat", "Room", "Crack", "Verb", "Snappy", "Body"],
                clap: { freq: 1100, q: 1.6, tail: 0.18, bursts: 5, room: 0.25 }, claps: ["Room", "Layered", "Wide", "Long"],
                hat: { f: 220, decay: 0.035, bp: 10000, hp: 7500, noise: 0.45, len: 0.16 }, hats: ["Crisp", "Metal", "Tight", "Sizzle", "Dark", "Shuffle"],
                ohat: { f: 220, decay: 0.26, bp: 10000, hp: 7500, noise: 0.5, len: 0.8 }, percs: ["Metal Hit", "Zap Perc", "Laser Perc", "Rim", "Snap", "Knock"],
                bass: ["Wobble", "Reese", "FM Bass", "Sub Bass", "Hoover"], melodic: ["Dark Pad", "Choir", "Strings", "Bell", "Supersaw", "Hoover Lead", "Saw Lead", "Piano"],
                fx: ["Riser", "Impact", "Sub Drop", "Zap"], vox: ["Woah", "Uh", "Hey"], key: 50 },
            { name: "Future Bass", kick: { body: { start: 210, end: 52, sweep: 0.02, decay: 0.3 }, click: 0.45, drive: 1.8, len: 0.8 }, kicks: ["Punch", "Tight", "Round", "Boom", "Clicky", "Knock", "Thump", "Sub"],
                snare: { body: { start: 260, end: 195, sweep: 0.01, decay: 0.07 }, noise: { amp: 1, hp: 1900, lp: 13000, decay: 0.17 }, room: 0.15, len: 0.6 }, snares: ["Snappy", "Room", "Bright", "Verb", "Crack", "Fat"],
                clap: { freq: 1250, q: 1.8, tail: 0.16, bursts: 4 }, claps: ["Layered", "Room", "Wide", "Snappy"],
                hat: { f: 225, decay: 0.035, bp: 10500, hp: 8000, noise: 0.45, len: 0.16 }, hats: ["Crisp", "Sizzle", "Tight", "Soft", "Shuffle", "Metal"],
                ohat: { f: 225, decay: 0.26, bp: 10500, hp: 8000, noise: 0.5, len: 0.8 }, percs: ["Snap", "Glass Tink", "Shaker", "Blip", "Rim", "Triangle"],
                bass: ["Synth Bass", "Sub Bass", "Reese", "808 Long", "FM Bass"], melodic: ["Supersaw", "Bright Pad", "Chord Stab", "Pluck", "Vocal Pad", "Bell", "Glass Keys", "Saw Lead"],
                fx: ["Riser", "Stutter Riser", "Downlifter", "Impact"], vox: ["Eee", "Ooh", "Yeah"], key: 54 },
            { name: "Phonk", kick: { body: { start: 200, end: 48, sweep: 0.025, decay: 0.45 }, click: 0.3, drive: 4, lp: 4500, crush: 9, len: 1 }, kicks: ["Distorted", "Hard", "Boom", "Dusty", "Punch", "Long", "Knock", "Sub"],
                snare: { body: { start: 250, end: 190, sweep: 0.01, decay: 0.06 }, noise: { amp: 0.9, hp: 1600, lp: 9000, decay: 0.13 }, crush: 9, drive: 2, len: 0.5 }, snares: ["Dusty", "Crack", "Room", "Rim", "Dark", "Tight"],
                clap: { freq: 1200, q: 2, tail: 0.12, bursts: 4, crush: 9 }, claps: ["Dusty", "Tight", "Room", "Snappy"],
                hat: { f: 210, decay: 0.035, bp: 9500, hp: 7000, noise: 0.45, len: 0.16, crush: 9 }, hats: ["Dusty", "Crisp", "Metal", "Tight", "Dark", "Shuffle"],
                ohat: { f: 210, decay: 0.24, bp: 9500, hp: 7000, noise: 0.5, len: 0.8, crush: 9 }, percs: ["Cowbell", "Snap", "Rim", "Vinyl Tick", "Metal Hit", "Shaker"],
                bass: ["808 Distorted", "808 Long", "808 Punch", "808 Slide", "Sub Bass"], melodic: ["Bell", "Choir", "Dark Pad", "Tape Keys", "Piano", "Square Lead", "Flute", "Organ Stab"],
                fx: ["Impact", "Reverse Swell", "Riser", "Texture"], vox: ["Uh", "Hey", "Ho"], key: 49 },
            { name: "Afrobeats", kick: { body: { start: 170, end: 52, sweep: 0.025, decay: 0.3 }, click: 0.35, drive: 1.2, len: 0.7 }, kicks: ["Round", "Punch", "Thump", "Tight", "Boom", "Knock", "Sub", "Clicky"],
                snare: { body: { start: 260, end: 210, sweep: 0.008, decay: 0.05 }, noise: { amp: 0.9, hp: 1800, lp: 11000, decay: 0.12 }, len: 0.5 }, snares: ["Rim", "Tight", "Snappy", "Room", "Bright", "Body"],
                clap: { freq: 1250, q: 1.9, tail: 0.13, bursts: 4 }, claps: ["Tight", "Room", "Layered", "Snappy"],
                hat: { f: 215, decay: 0.04, bp: 9800, hp: 7300, noise: 0.5, len: 0.18 }, hats: ["Shuffle", "Crisp", "Soft", "Tight", "Sizzle", "Metal"],
                ohat: { f: 215, decay: 0.24, bp: 9800, hp: 7300, noise: 0.5, len: 0.7 }, percs: ["Djembe", "Talking Drum", "Shaker", "Conga", "Agogo", "Cabasa"],
                bass: ["Sub Bass", "808 Long", "Finger Bass", "Synth Bass", "Log Bass"], melodic: ["Guitar Pluck", "Marimba", "Kalimba", "Piano", "Pluck", "Steel Pan", "Flute", "Vocal Pad"],
                fx: ["Sweep", "Riser", "Reverse Swell", "Impact"], vox: ["Hey", "Ay", "Oh"], key: 55 },
            { name: "Amapiano", kick: { body: { start: 160, end: 50, sweep: 0.03, decay: 0.32 }, click: 0.2, drive: 1, len: 0.8 }, kicks: ["Round", "Sub", "Thump", "Boom", "Punch", "Tight", "Long", "Dusty"],
                snare: { body: { start: 270, end: 220, sweep: 0.008, decay: 0.04 }, noise: { amp: 0.8, hp: 2000, lp: 10000, decay: 0.1 }, len: 0.4 }, snares: ["Rim", "Tight", "Room", "Snappy", "Dark", "Bright"],
                clap: { freq: 1200, q: 1.8, tail: 0.13, bursts: 4 }, claps: ["Room", "Tight", "Wide", "Long"],
                hat: { f: 210, decay: 0.045, bp: 9500, hp: 7000, noise: 0.5, len: 0.2 }, hats: ["Shuffle", "Soft", "Crisp", "Tight", "Dark", "Sizzle"],
                ohat: { f: 210, decay: 0.28, bp: 9500, hp: 7000, noise: 0.5, len: 0.8 }, percs: ["Log Drum", "Shaker", "Woodblock", "Cabasa", "Conga", "Rim"],
                bass: ["Log Bass", "Sub Bass", "Organ Bass", "FM Bass", "808 Long"], melodic: ["Piano", "Rhodes", "Vocal Pad", "Marimba", "Kalimba", "Glass Keys", "Flute", "Strings"],
                fx: ["Texture", "Sweep", "Reverse Swell", "Riser"], vox: ["Oh", "Ay", "Ooh"], key: 53 },
            { name: "Reggaeton", kick: { body: { start: 190, end: 50, sweep: 0.022, decay: 0.32 }, click: 0.4, drive: 1.8, len: 0.8 }, kicks: ["Punch", "Boom", "Tight", "Round", "Hard", "Thump", "Knock", "Sub"],
                snare: { body: { start: 250, end: 195, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 2000, lp: 12000, decay: 0.13 }, click: 0.3, len: 0.5 }, snares: ["Tight", "Crack", "Snappy", "Rim", "Room", "Bright"],
                clap: { freq: 1250, q: 2, tail: 0.11, bursts: 3 }, claps: ["Tight", "Snappy", "Layered", "Room"],
                hat: { f: 220, decay: 0.035, bp: 10000, hp: 7800, noise: 0.45, len: 0.16 }, hats: ["Crisp", "Tight", "Shuffle", "Metal", "Soft", "Sizzle"],
                ohat: { f: 220, decay: 0.24, bp: 10000, hp: 7800, noise: 0.5, len: 0.7 }, percs: ["Timbale", "Rim", "Shaker", "Conga", "Bongo", "Clave"],
                bass: ["808 Long", "Sub Bass", "808 Punch", "Synth Bass", "Pluck Bass"], melodic: ["Guitar Pluck", "Pluck", "Piano", "Brass Stab", "Marimba", "Bell", "Saw Lead", "Strings"],
                fx: ["Riser", "Impact", "Downlifter", "Sweep"], vox: ["Hey", "Yeah", "Ay"], key: 52 },
            { name: "Jersey Club", kick: { body: { start: 230, end: 52, sweep: 0.018, decay: 0.28 }, click: 0.5, drive: 2.5, len: 0.7 }, kicks: ["Punch", "Hard", "Tight", "Knock", "Boom", "Clicky", "Distorted", "Thump"],
                snare: { body: { start: 270, end: 200, sweep: 0.01, decay: 0.06 }, noise: { amp: 1.1, hp: 2000, lp: 13000, decay: 0.14 }, click: 0.3, len: 0.5 }, snares: ["Snappy", "Crack", "Tight", "Room", "Bright", "Fat"],
                clap: { freq: 1250, q: 1.9, tail: 0.14, bursts: 4 }, claps: ["Layered", "Snappy", "Room", "Tight"],
                hat: { f: 220, decay: 0.035, bp: 10500, hp: 8000, noise: 0.45, len: 0.16 }, hats: ["Crisp", "Tight", "Metal", "Sizzle", "Shuffle", "Soft"],
                ohat: { f: 220, decay: 0.24, bp: 10500, hp: 8000, noise: 0.5, len: 0.7 }, percs: ["Snap", "Laser Perc", "Rim", "Blip", "Zap Perc", "Shaker"],
                bass: ["808 Punch", "808 Long", "Sub Bass", "Synth Bass", "Donk"], melodic: ["Pluck", "Bell", "Chord Stab", "Supersaw", "Vocal Pad", "Square Lead", "Glass Keys", "Arp Pluck"],
                fx: ["Stutter Riser", "Impact", "Zap", "Riser"], vox: ["Hey", "Uh", "Eee"], key: 54 },
            { name: "UK Garage", kick: { body: { start: 190, end: 52, sweep: 0.022, decay: 0.26 }, click: 0.4, drive: 1.4, len: 0.6 }, kicks: ["Punch", "Tight", "Round", "Knock", "Thump", "Clicky", "Boom", "Dusty"],
                snare: { body: { start: 250, end: 195, sweep: 0.01, decay: 0.05 }, noise: { amp: 0.9, hp: 1800, lp: 11000, decay: 0.12 }, len: 0.5 }, snares: ["Rim", "Tight", "Snappy", "Room", "Crack", "Dark"],
                clap: { freq: 1200, q: 1.8, tail: 0.12, bursts: 4 }, claps: ["Tight", "Room", "Snappy", "Wide"],
                hat: { f: 215, decay: 0.035, bp: 10000, hp: 7500, noise: 0.45, len: 0.16 }, hats: ["Shuffle", "Crisp", "Tight", "Metal", "Soft", "Sizzle"],
                ohat: { f: 215, decay: 0.2, bp: 10000, hp: 7500, noise: 0.5, len: 0.6 }, percs: ["Rim", "Shaker", "Woodblock", "Snap", "Bongo", "Glass Tink"],
                bass: ["Organ Bass", "Reese", "Sub Bass", "Synth Bass", "FM Bass"], melodic: ["Organ Stab", "Chord Stab", "Vocal Pad", "Rhodes", "Pluck", "Strings", "Piano", "Glass Keys"],
                fx: ["Sweep", "Reverse Swell", "Riser", "Impact"], vox: ["Oh", "Yeah", "Ah"], key: 56 },
            { name: "Synthwave", kick: { body: { start: 200, end: 50, sweep: 0.025, decay: 0.32 }, click: 0.4, drive: 1.5, room: 0.15, len: 0.8 }, kicks: ["Boom", "Punch", "Round", "Thump", "Tight", "Knock", "Long", "Hard"],
                snare: { body: { start: 230, end: 180, sweep: 0.01, decay: 0.09 }, noise: { amp: 1, hp: 1400, lp: 11000, decay: 0.2 }, room: 0.45, roomDecay: 1.2, len: 0.9 }, snares: ["Verb", "Room", "Fat", "Snappy", "Bright", "Body"],
                clap: { freq: 1100, q: 1.6, tail: 0.18, bursts: 5, room: 0.35 }, claps: ["Room", "Long", "Wide", "Layered"],
                hat: { f: 205, decay: 0.04, bp: 9500, hp: 7200, noise: 0.4, len: 0.18 }, hats: ["Crisp", "Tight", "Soft", "Metal", "Shuffle", "Sizzle"],
                ohat: { f: 205, decay: 0.28, bp: 9500, hp: 7200, noise: 0.45, len: 0.8 }, percs: ["Low Tom", "High Tom", "Clave", "Tambourine", "Cowbell", "Zap Perc"],
                bass: ["Synth Bass", "Pluck Bass", "Sub Bass", "FM Bass", "Acid"], melodic: ["Bright Pad", "Saw Lead", "Arp Pluck", "Brass Stab", "Strings", "Glass Keys", "Square Lead", "Chord Stab"],
                fx: ["Riser", "Sweep", "Downlifter", "Texture"], vox: ["Woah", "Oh", "Ah"], key: 57 },
            { name: "Hyperpop", kick: { body: { start: 260, end: 54, sweep: 0.015, decay: 0.3 }, click: 0.7, drive: 6, len: 0.7 }, kicks: ["Distorted", "Hard", "Clicky", "Punch", "Knock", "Tight", "Boom", "Thump"],
                snare: { body: { start: 300, end: 220, sweep: 0.008, decay: 0.06 }, noise: { amp: 1.2, hp: 2500, lp: 14000, decay: 0.12 }, click: 0.5, drive: 4, len: 0.5 }, snares: ["Crack", "Bright", "Snappy", "Tight", "Fat", "Room"],
                clap: { freq: 1500, q: 2.2, tail: 0.1, bursts: 4, crush: 7 }, claps: ["Snappy", "Dusty", "Tight", "Layered"],
                hat: { f: 240, decay: 0.03, bp: 11500, hp: 9000, noise: 0.4, len: 0.14, crush: 7 }, hats: ["Crisp", "Metal", "Tight", "Dusty", "Sizzle", "Shuffle"],
                ohat: { f: 240, decay: 0.2, bp: 11000, hp: 8500, noise: 0.45, len: 0.6 }, percs: ["Blip", "Laser Perc", "Zap Perc", "Glass Tink", "Snap", "Metal Hit"],
                bass: ["808 Distorted", "Reese", "Wobble", "808 Punch", "Donk"], melodic: ["Supersaw", "Chip Lead", "Square Lead", "Bell", "Glass Keys", "Pluck", "Vocal Pad", "Hoover Lead"],
                fx: ["Stutter Riser", "Zap", "Impact", "Riser"], vox: ["Eee", "Hey", "Yeah"], key: 54 },
            { name: "Hardstyle", kick: { body: { start: 400, end: 55, sweep: 0.012, decay: 0.32, hold: 0.06 }, click: 0.4, drive: 9, lp: 7000, len: 0.9 }, kicks: ["Distorted", "Hard", "Punch", "Long", "Boom", "Knock", "Thump", "Clicky"],
                snare: { body: { start: 240, end: 190, sweep: 0.01, decay: 0.08 }, noise: { amp: 1, hp: 1600, lp: 12000, decay: 0.18 }, room: 0.3, len: 0.7 }, snares: ["Room", "Verb", "Fat", "Crack", "Snappy", "Bright"],
                clap: { freq: 1100, q: 1.5, tail: 0.2, bursts: 6, room: 0.3 }, claps: ["Wide", "Room", "Layered", "Long"],
                hat: { f: 220, decay: 0.035, bp: 10000, hp: 7800, noise: 0.45, len: 0.16 }, hats: ["Crisp", "Metal", "Tight", "Sizzle", "Dark", "Shuffle"],
                ohat: { f: 220, decay: 0.26, bp: 10000, hp: 7800, noise: 0.5, len: 0.8 }, percs: ["Metal Hit", "Zap Perc", "Rim", "Clave", "Laser Perc", "Knock"],
                bass: ["Reese", "Hoover", "Sub Bass", "Synth Bass", "Acid"], melodic: ["Supersaw", "Saw Lead", "Hoover Lead", "Choir", "Strings", "Bright Pad", "Pluck", "Brass Stab"],
                fx: ["Riser", "Impact", "Downlifter", "Noise Riser"], vox: ["Ho", "Hey", "Woah"], key: 50 },
            { name: "Disco & Funk", kick: { body: { start: 170, end: 55, sweep: 0.025, decay: 0.24 }, click: 0.5, drive: 1, lp: 5000, len: 0.6 }, kicks: ["Round", "Punch", "Tight", "Thump", "Knock", "Dusty", "Boom", "Clicky"],
                snare: { body: { start: 220, end: 180, sweep: 0.01, decay: 0.09 }, noise: { amp: 0.9, hp: 1000, lp: 9000, decay: 0.2 }, room: 0.2, len: 0.6 }, snares: ["Body", "Room", "Fat", "Snappy", "Crack", "Rim"],
                clap: { freq: 1050, q: 1.5, tail: 0.16, bursts: 5 }, claps: ["Wide", "Room", "Layered", "Long"],
                hat: { f: 200, decay: 0.05, bp: 8500, hp: 6500, noise: 0.5, len: 0.2 }, hats: ["Shuffle", "Soft", "Crisp", "Tight", "Sizzle", "Dark"],
                ohat: { f: 200, decay: 0.3, bp: 8500, hp: 6500, noise: 0.5, len: 0.9 }, percs: ["Conga", "Bongo", "Tambourine", "Cowbell", "Shaker", "Clave"],
                bass: ["Finger Bass", "Synth Bass", "Organ Bass", "Pluck Bass", "FM Bass"], melodic: ["Brass Stab", "Strings", "Rhodes", "Organ Stab", "Guitar Pluck", "Chord Stab", "Piano", "Trumpet"],
                fx: ["Sweep", "Riser", "Impact", "Downlifter"], vox: ["Woah", "Hey", "Ah"], key: 55 },
        ];
        const ohatChars = ["Short", "Long", "Bright", "Trashy"];
        for (const g of GENRES) {
            const base = PK + "/" + g.name;
            const prefix = g.name.replace(/ & /g, " ").replace(/[^A-Za-z0-9 ]/g, "");
            let index = 0;
            const seed = (kind) => g.name + "/" + kind + "/" + (index++);
            g.kicks.forEach((ch, i) => flAdd(base + "/Kicks/" + prefix + " Kick " + ch + " " + pad2(i + 1), "drum2", jitter(applyCharacter(g.kick, KICK[ch]), seed("k"), 0.06)));
            g.snares.forEach((ch, i) => flAdd(base + "/Snares/" + prefix + " Snare " + ch + " " + pad2(i + 1), "drum2", jitter(applyCharacter(g.snare, SNARE[ch]), seed("s"), 0.06)));
            g.claps.forEach((ch, i) => flAdd(base + "/Claps/" + prefix + " Clap " + ch + " " + pad2(i + 1), "clap2", jitter(applyCharacter(Object.assign({ spacing: 0.011, tail: 0.13, len: 0.6 }, g.clap), CLAP[ch]), seed("c"), 0.05)));
            g.hats.forEach((ch, i) => flAdd(base + "/Hats/" + prefix + " Hat " + ch + " " + pad2(i + 1), "hat2", jitter(applyCharacter(g.hat, HAT[ch]), seed("h"), 0.05)));
            ohatChars.slice(0, 3).forEach((ch, i) => flAdd(base + "/Open Hats/" + prefix + " Open Hat " + ch + " " + pad2(i + 1), "hat2", jitter(applyCharacter(g.ohat, OHAT[ch]), seed("o"), 0.05)));
            g.percs.forEach((name, i) => {
                const [gen, params] = PERC[name](1 + (i % 3 - 1) * 0.06);
                flAdd(base + "/Percussion/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(params, seed("p"), 0.03));
            });
            flAdd(base + "/Cymbals/" + prefix + " Crash 01", "hat2", { f: 180, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1.2, fastDecay: 0.04, bp: 6500, q: 0.5, hp: 3800, noise: 0.6, len: 2.6, sizzle: 0.2, ringMod: true });
            flAdd(base + "/Cymbals/" + prefix + " Ride 01", "tones", { partials: [[3000 + (g.key - 50) * 40, 0.6, 1.3], [4850 + (g.key - 50) * 60, 0.5, 0.9], [7100, 0.35, 0.6], [9500, 0.25, 0.4]], click: 0.2, len: 2.0 });
            g.bass.forEach((name, i) => {
                const [gen, params, extra] = BASS[name]({});
                flAdd(base + "/Bass/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(params, seed("b"), 0.04), extra || { rootKey: 36 });
            });
            g.melodic.forEach((name, i) => {
                const [gen, params, extra] = MELODIC[name]({ f: hz(60) });
                flAdd(base + "/Melodic/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(params, seed("m"), 0.03), Object.assign({ rootKey: 60 }, extra || {}));
            });
            g.fx.forEach((name, i) => {
                const [gen, params] = FXR[name]({});
                flAdd(base + "/FX/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(params, seed("f"), 0.08));
            });
            g.vox.forEach((name, i) => {
                const [gen, params] = VOX[name]({ f: hz(g.key + 7) });
                flAdd(base + "/Vocal Chops/" + prefix + " Vox " + name + " " + pad2(i + 1), gen, params, { rootKey: g.key + 7 });
            });
        }
        // ---------------------------------------------- 808s in every key
        const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const STYLES808 = [
            ["Clean", { hold: 0.3, decay: 2.2, len: 3.5 }],
            ["Punchy", { hold: 0.05, decay: 0.8, drop: 3.5, sweep: 0.015, click: 0.4, drive: 2.5, len: 1.8 }],
            ["Distorted", { hold: 0.25, decay: 1.8, drive: 9, clip: 0.6, lp: 4500, len: 3 }],
            ["Slide", { hold: 0.6, decay: 2.6, drop: 0.7, sweep: 0.25, len: 3.5 }],
            ["Warm", { hold: 0.2, decay: 1.7, drive: 1.6, lp: 900, len: 3 }],
            ["Drill", { hold: 0.15, decay: 1.3, drop: 2.6, sweep: 0.05, drive: 4, lp: 3800, len: 2.6 }],
            ["Boom", { hold: 0.2, decay: 2.0, drop: 1.8, sweep: 0.04, click: 0.15, len: 3 }],
            ["Short", { hold: 0.05, decay: 0.4, drop: 1.2, len: 1 }],
        ];
        for (const [style, params] of STYLES808) {
            for (let k = 0; k < 12; k++) {
                // Each 808 is synthesized in its key, with the root set so the sampler plays it in tune.
                flAdd(PK + "/808s In Every Key/" + style + "/808 " + style + " " + NOTE[k], "bass808", Object.assign({ f: 65.406 * Math.pow(2, k / 12) }, params),
                    { rootKey: 36 + k, key: "packs/808s-in-every-key/" + style.toLowerCase() + "/808-" + style.toLowerCase() + "-" + NOTE[k].toLowerCase().replace("#", "-sharp") });
            }
        }
        // ---------------------------------------------- synth one-shots
        const SY = PK + "/Synth One-Shots";
        const oneShots = [
            ["Leads", ["Saw Lead", "Square Lead", "Chip Lead", "Hoover Lead", "Trumpet", "Flute", "Ocarina"], 72, 6],
            ["Plucks", ["Pluck", "Arp Pluck", "Guitar Pluck", "Koto", "Harp", "Sitar", "Kalimba"], 60, 6],
            ["Pads", ["Dark Pad", "Bright Pad", "Vocal Pad", "Strings", "Choir", "Supersaw"], 60, 5],
            ["Keys", ["Piano", "Rhodes", "Tape Keys", "Glass Keys", "Organ Stab", "Marimba"], 60, 5],
            ["Bells", ["Bell", "Glass Keys", "Kalimba", "Steel Pan", "Marimba"], 72, 4],
            ["Brass", ["Brass Stab", "Trumpet"], 60, 5],
        ];
        // Each numbered variant changes something you can hear: width, filter, drive, space,
        // envelope, echo, grit. Sung and additive sounds change vowels and brightness instead.
        const TONE_VARIANTS = [
            (p) => p,
            (p) => Object.assign(p, { chorus: (p.chorus || 0) + 0.5, detune: (p.detune || 0.1) * 1.8, voices: Math.max(p.voices || 1, 3) }),
            (p) => Object.assign(p, { cutoff: p.cutoff ? p.cutoff * 0.55 : 2200, res: (p.res || 0.71) * 1.8 }),
            (p) => Object.assign(p, { drive: (p.drive || 0) + 2 }),
            (p) => Object.assign(p, { verb: (p.verb || 0) + 0.35, verbDecay: 2.4 }),
            (p) => Object.assign(p, { attack: Math.max(p.attack || 0.004, 0.08), release: Math.max(p.release || 0.05, 0.4), vib: (p.vib || 0) + 0.15 }),
            (p) => Object.assign(p, { echo: 0.6, echoTime: 0.22 }),
            (p) => Object.assign(p, { crush: 8, downsample: 2 }),
        ];
        const VOWEL_SEQS = [["a", "a"], ["o", "o"], ["u", "u"], ["e", "e"], ["a", "o"], ["i", "i"]];
        const variantOf = (gen, params, v) => {
            const p = JSON.parse(JSON.stringify(params));
            if (gen == "tone2") {
                // a filter does nothing to a sine and drive little to a square: change the wave instead
                if (v % TONE_VARIANTS.length == 2 && p.osc == "sine")
                    return Object.assign(p, { osc: "tri", vib: (p.vib || 0) + 0.1 });
                if (v % TONE_VARIANTS.length == 3 && p.osc == "square")
                    return Object.assign(p, { width: 0.12, cutoff: p.cutoff ? p.cutoff * 1.5 : 9000 });
                return TONE_VARIANTS[v % TONE_VARIANTS.length](p);
            }
            if (gen == "vowel")
                return Object.assign(p, { seq: VOWEL_SEQS[v % VOWEL_SEQS.length], female: v % 2 == 1 ? !p.female : !!p.female, breath: (p.breath || 0) + (v % 3) * 0.06 });
            if (gen == "additive") {
                const bright = [1, 1.6, 0.6, 1.3, 0.8, 2][v % 6];
                p.partials = p.partials.map((pa, i) => [pa[0], pa[1] * (i == 0 ? 1 : bright), pa[2] * (v % 2 ? 0.7 : 1.2)]);
                p.hammer = (p.hammer || 0) * (v % 3 == 2 ? 2 : 1);
                return p;
            }
            if (gen == "bass808")
                return Object.assign(p, [{}, { drive: (p.drive || 0) + 4, lp: 3500 }, { decay: (p.decay || 1.4) * 0.5, hold: (p.hold || 0.15) * 0.5, drop: (p.drop || 1.2) + 1.5 }][v % 3]);
            if (gen == "logdrum")
                return Object.assign(p, [{}, { decay: (p.decay || 0.35) * 1.8 }, { drop: (p.drop || 0.6) * 1.8, drive: (p.drive || 1.5) + 2 }][v % 3]);
            return jitter(p, gen + v, 0.12);
        };
        for (const [folder, names, rootKey, count] of oneShots) {
            for (const name of names) {
                for (let v = 0; v < count; v++) {
                    const [gen, params, extra] = MELODIC[name]({ f: hz(rootKey) });
                    flAdd(SY + "/" + folder + "/" + name + " " + pad2(v + 1), gen, variantOf(gen, params, v), Object.assign({ rootKey }, extra || {}));
                }
            }
        }
        for (const name of Object.keys(BASS)) {
            for (let v = 0; v < 3; v++) {
                const [gen, params, extra] = BASS[name]({});
                flAdd(SY + "/Bass/" + name + " " + pad2(v + 1), gen, variantOf(gen, params, v), extra || { rootKey: 36 });
            }
        }
        // ---------------------------------------------- chord stabs
        const CHORDS = [["Major", [0, 4, 7]], ["Minor", [0, 3, 7]], ["Maj7", [0, 4, 7, 11]], ["Min7", [0, 3, 7, 10]], ["Dom7", [0, 4, 7, 10]], ["Min9", [0, 3, 7, 10, 14]],
            ["Maj9", [0, 4, 7, 11, 14]], ["Sus2", [0, 2, 7]], ["Sus4", [0, 5, 7]], ["Add9", [0, 4, 7, 14]], ["Min11", [0, 3, 7, 10, 17]], ["Dim7", [0, 3, 6, 9]]];
        const STAB_TIMBRES = [
            ["Saw Stab", { osc: "saw", voices: 2, detune: 0.1, cutoff: 900, filterEnv: 6500, filterDecay: 0.1, decay: 0.35, sustain: 0.1, len: 0.9, verb: 0.2 }],
            ["Organ Stab", { osc: "organ", decay: 0.35, sustain: 0.25, len: 0.9 }],
            ["Rhodes Chord", { osc: "fm", ratio: 1, index: 1.2, indexDecay: 0.7, indexFloor: 0.2, decay: 1.8, sustain: 0, len: 2.2, chorus: 0.3 }],
            ["Pad Chord", { osc: "saw", voices: 3, detune: 0.2, cutoff: 1800, attack: 0.4, release: 0.6, len: 3, chorus: 0.4, verb: 0.3 }],
            ["Pluck Chord", { osc: "square", width: 0.35, cutoff: 700, filterEnv: 7000, filterDecay: 0.06, decay: 0.25, sustain: 0, len: 0.8, verb: 0.2 }],
            ["Brass Chord", { osc: "saw", voices: 3, detune: 0.08, cutoff: 1300, filterEnv: 4200, filterDecay: 0.12, attack: 0.02, decay: 0.45, sustain: 0.35, len: 1 }],
        ];
        for (const [timbre, params] of STAB_TIMBRES)
            for (const [chordName, chord] of CHORDS)
                flAdd(PK + "/Chord Stabs/" + timbre + "/" + timbre + " " + chordName, "tone2", Object.assign({ f: hz(60), chord }, params), { rootKey: 60 });
        // ---------------------------------------------- FX toolkit
        const FT = PK + "/FX Toolkit";
        const fxSets = [
            ["Risers", "Riser", [{ len: 2 }, { len: 4 }, { len: 8 }, { len: 4, tone: 0.7 }, { len: 4, stutter: 6 }, { len: 5, voices: 5, detune: 0.02 }, { len: 4, f1: 15000 }, { len: 3, curve: 3 }, { len: 4, sub: 0.5, subF0: 40, subF1: 90 }, { len: 6, verb: 0.4 }]],
            ["Risers", "Noise Riser", [{ len: 2 }, { len: 4 }, { len: 8 }, { len: 4, q: 6 }, { len: 4, curve: 1 }, { len: 6, verb: 0.3 }]],
            ["Risers", "Stutter Riser", [{ len: 2 }, { len: 4 }, { len: 4, stutter: 8 }, { len: 8, stutter: 3 }]],
            ["Downlifters", "Downlifter", [{ len: 1 }, { len: 2 }, { len: 4 }, { len: 3, tone: 0.5, toneF0: 880, toneF1: 110 }, { len: 2, sub: 0.8 }, { len: 4, verb: 0.4 }, { len: 2, q: 6 }, { len: 6 }]],
            ["Impacts", "Impact", [{}, { decay: 0.8 }, { decay: 0.25 }, { sub: 1.4 }, { verb: 0.6 }, { f0: 6000 }, { drive: 3 }, { len: 5, decay: 1.2, verb: 0.5 }, { subF1: 24 }, { q: 2 }]],
            ["Impacts", "Sub Drop", [{}, { len: 1.2 }, { len: 4 }, { subF0: 160 }, { hold: 0.4 }, { drive: 2 }]],
            ["Sweeps", "Sweep", [{}, { len: 0.6 }, { len: 3 }, { f0: 2000, f1: 200 }, { q: 4 }, { skew: 1.3 }, { skew: 0.4 }, { len: 2, verb: 0.3 }, { f1: 12000 }, { len: 1 }]],
            ["Zaps & Lasers", "Zap", [{}, { decay: 0.3, len: 0.6 }, { f0: 9000, f1: 800 }, { wave: "saw" }, { sweepTime: 0.3, len: 0.5 }, { f0: 2500, f1: 120 }, { noise: 0 }, { toneF0: 5000, toneF1: 600 }, { decay: 0.06, len: 0.2 }, { q: 8 }]],
            ["Textures", "Texture", [{}, { f0: 400, f1: 6000 }, { rate: 0.08 }, { rate: 0.6 }, { tone: 0.6 }, { toneF0: 65, toneF1: 130 }, { q: 8 }, { verb: 0.7 }, { len: 7 }, { wave: "saw", tone: 0.15 }]],
            ["Reverse", "Reverse Swell", [{}, { len: 1.5 }, { len: 4 }, { tone: 0.6 }, { toneF0: 520, toneF1: 260 }, { f0: 9000 }, { verb: 0.8 }, { decay: 0.4 }]],
        ];
        for (const [folder, recipe, list] of fxSets) {
            list.forEach((mods, i) => {
                const [gen, params] = FXR[recipe](mods);
                flAdd(FT + "/" + folder + "/" + recipe + " " + pad2(i + 1), gen, params);
            });
        }
        // Transformed library sounds: reversed, tape-stopped and stuttered.
        const transformSources = [
            ["Reverse", "Reversed Crash", "drums/cymbals/crash-01", { reverse: true, verb: 0.2 }],
            ["Reverse", "Reversed Crash Long", "drums/cymbals/crash-02", { reverse: true, verb: 0.5 }],
            ["Reverse", "Reversed Snare", "drums/snares/snare-reverb-01", { reverse: true }],
            ["Reverse", "Reversed Clap", "drums/claps/clap-reverb-01", { reverse: true, verb: 0.3 }],
            ["Reverse", "Reversed Piano", "instruments/keys/piano-bright", { reverse: true, verb: 0.3 }],
            ["Reverse", "Reversed Bell", "instruments/bells/fm-bell", { reverse: true }],
            ["Reverse", "Reversed Pad", "instruments/pads/pad-warm", { reverse: true }],
            ["Reverse", "Reversed Vox", "vocals/sustains/choir-aah-female", { reverse: true, verb: 0.3 }],
            ["Tape Stops", "Tape Stop Chord", "instruments/chords/stab-min7", { tapeStop: 1.6 }],
            ["Tape Stops", "Tape Stop Piano", "instruments/keys/piano-bright", { tapeStop: 1.4, maxLen: 1.5 }],
            ["Tape Stops", "Tape Stop Pad", "instruments/pads/pad-bright", { tapeStop: 1.5, maxLen: 2 }],
            ["Tape Stops", "Tape Stop Supersaw", "instruments/synth-leads/lead-supersaw", { tapeStop: 1.5, maxLen: 1.5 }],
            ["Tape Stops", "Tape Stop 808", "808s/tuned-c/808-boom", { tapeStop: 1.3, maxLen: 1.5 }],
            ["Tape Stops", "Tape Stop Vox", "vocals/sustains/choir-aah-male", { tapeStop: 1.4, maxLen: 1.5 }],
            ["Glitches", "Stutter Vox", "vocals/chops/vox-yeah", { stutter: 0.06, repeats: 6 }],
            ["Glitches", "Stutter Snare", "drums/snares/snare-tight-01", { stutter: 0.05, repeats: 8, stutterFade: true }],
            ["Glitches", "Stutter Chord", "instruments/chords/stab-maj7", { stutter: 0.08, repeats: 6, stutterFade: true }],
            ["Glitches", "Stutter Bell", "instruments/bells/trap-bell", { stutter: 0.07, repeats: 5 }],
            ["Glitches", "Crushed Piano", "instruments/keys/piano-soft", { crush: 5, downsample: 4, maxLen: 1.6 }],
            ["Glitches", "Crushed Vox", "vocals/chops/vox-ah", { crush: 4, downsample: 6 }],
            ["Glitches", "Pitched Down Clap", "drums/claps/clap-wide-01", { pitch: -12 }],
            ["Glitches", "Pitched Up Kick", "drums/kicks/kick-deep-01", { pitch: 12, maxLen: 0.4 }],
            ["Glitches", "Radio Vox", "vocals/chops/vox-hey", { hp: 900, lp: 3200, drive: 3 }],
            ["Glitches", "Telephone Piano", "instruments/keys/piano-bright", { hp: 600, lp: 2600, drive: 2, maxLen: 1.6 }],
        ];
        for (const [folder, name, src, params] of transformSources)
            flAdd(FT + "/" + folder + "/" + name, "xform", Object.assign({ src }, params));
        // ---------------------------------------------- vocal chops
        const VC = PK + "/Vocal Chops";
        const voices = [["Male", 50, false], ["Female", 64, true], ["High", 72, true]];
        const moods = [["Dry", {}], ["Breathy", { breath: 0.25 }], ["Wet", { verb: 0.4 }]];
        for (const name of Object.keys(VOX)) {
            for (const [voice, root, female] of voices) {
                for (const [mood, mods] of moods) {
                    const [gen, params] = VOX[name](Object.assign({ f: hz(root), female }, mods));
                    flAdd(VC + "/" + voice + "/" + "Vox " + name + " " + voice + " " + mood, gen, params, { rootKey: root });
                }
            }
        }
        // ---------------------------------------------- world percussion & foley
        const WP = PK + "/World Percussion";
        for (const name of Object.keys(PERC)) {
            for (let v = 0; v < 3; v++) {
                const [gen, params] = PERC[name]([0.9, 1, 1.12][v]);
                flAdd(WP + "/" + name + "/" + name + " " + ["Low", "Mid", "High"][v], gen, params);
            }
        }
        const FO = PK + "/Foley";
        const foley = [
            ["Paper Tap", "drum2", { noise: { amp: 1, bp: 2200, q: 0.8, hp: 600, lp: 9000, decay: 0.02 }, click: 0.2, len: 0.15 }],
            ["Table Knock", "drum2", { body: { start: 210, end: 170, decay: 0.05 }, noise: { amp: 0.5, bp: 800, hp: 150, lp: 2500, decay: 0.02 }, click: 0.3, len: 0.25 }],
            ["Door Knock", "drum2", { body: { start: 140, end: 120, decay: 0.07 }, noise: { amp: 0.6, bp: 600, hp: 100, lp: 2000, decay: 0.03 }, click: 0.4, len: 0.3 }],
            ["Glass Clink", "tones", { partials: [[2850, 1, 0.45], [6700, 0.5, 0.25], [10400, 0.2, 0.1]], click: 0.3, len: 0.9 }],
            ["Spoon Hit", "tones", { partials: [[1780, 1, 0.25], [4400, 0.5, 0.12]], click: 0.4, len: 0.5 }],
            ["Coin Drop", "tones", { partials: [[4100, 1, 0.2], [6900, 0.6, 0.1]], click: 0.5, len: 0.35 }],
            ["Bottle Pop", "drop", { f0: 280, f1: 1100, glide: 0.02, decay: 0.05 }],
            ["Zipper", "guiro", { bp: 4500, scrapes: 22, span: 0.35, len: 0.45 }],
            ["Keys Jingle", "hat2", { f: 1900, decay: 0.25, bp: 7000, hp: 4000, noise: 0.4, len: 0.6, sizzle: 0.4 }],
            ["Finger Click", "drum2", { noise: { amp: 1, bp: 3200, q: 3, hp: 1500, lp: 9000, decay: 0.012 }, click: 0.5, len: 0.08 }],
            ["Body Slap", "drum2", { body: { start: 180, end: 120, decay: 0.04 }, noise: { amp: 1, bp: 1400, q: 0.8, hp: 300, lp: 7000, decay: 0.03 }, len: 0.2 }],
            ["Clap Hands Single", "drum2", { noise: { amp: 1, bp: 1300, q: 1.6, hp: 500, lp: 8000, decay: 0.03 }, click: 0.2, len: 0.2 }],
            ["Wood Stick", "drum2", { body: { start: 1450, end: 1400, decay: 0.03 }, ring: { ratio: 2.7, amp: 0.4, decay: 0.015 }, click: 0.4, len: 0.12 }],
            ["Can Hit", "drum2", { body: { start: 820, end: 790, decay: 0.12 }, ring: { ratio: 2.31, amp: 0.7, decay: 0.08 }, noise: { amp: 0.3, bp: 3000, hp: 1000, lp: 9000, decay: 0.03 }, click: 0.3, len: 0.4 }],
            ["Pot Lid", "hat2", { f: 420, ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92], decay: 0.6, bp: 3500, q: 0.7, hp: 1200, noise: 0.2, len: 1.4, ringMod: true }],
            ["Water Drip", "drop", { f0: 900, f1: 2400, glide: 0.025, decay: 0.04 }],
            ["Bubble", "drop", { f0: 400, f1: 1200, glide: 0.06, decay: 0.08 }],
            ["Typewriter", "drum2", { body: { start: 1200, end: 1100, decay: 0.02 }, noise: { amp: 0.7, bp: 3500, hp: 1200, lp: 10000, decay: 0.015 }, click: 0.6, len: 0.12 }],
            ["Camera Shutter", "drum2", { noise: { amp: 1, bp: 2600, q: 1.5, hp: 800, lp: 10000, decay: 0.02 }, click: 0.6, len: 0.2 }],
            ["Light Switch", "drum2", { body: { start: 2600, end: 2500, decay: 0.01 }, noise: { amp: 0.5, hp: 2000, lp: 12000, decay: 0.006 }, click: 0.8, len: 0.08 }],
            ["Footstep", "drum2", { body: { start: 120, end: 80, decay: 0.05 }, noise: { amp: 0.8, bp: 700, q: 0.8, hp: 150, lp: 3500, decay: 0.06 }, len: 0.3 }],
            ["Book Drop", "drum2", { body: { start: 110, end: 70, decay: 0.08 }, noise: { amp: 1, bp: 900, q: 0.6, hp: 100, lp: 4000, decay: 0.08 }, click: 0.3, room: 0.15, len: 0.6 }],
            ["Snap Twig", "drum2", { noise: { amp: 1, bp: 1800, q: 1.2, hp: 400, lp: 8000, decay: 0.01 }, click: 0.9, len: 0.1 }],
            ["Swish", "whoosh", { f0: 800, f1: 6000, len: 0.35, skew: 0.8 }],
            ["Velcro", "noiseHit", { hp: 2000, lp: 10000, decay: 0.2, attack: 0.05, len: 0.45 }],
            ["Tape Rewind", "pitchFX", { f0: 400, f1: 2400, len: 0.7, wave: "saw", lfo: 18, lfoDepth: 0.2, hold: 0.8 }],
            ["Cassette Click", "drum2", { body: { start: 900, end: 850, decay: 0.015 }, noise: { amp: 0.6, hp: 1500, lp: 8000, decay: 0.01 }, click: 0.7, len: 0.1 }],
            ["Vinyl Scratch", "pitchFX", { f0: 500, f1: 1600, len: 0.25, wave: "saw", lfo: 12, lfoDepth: 1.2, hold: 0.7, drive: 1 }],
            ["Lighter", "drum2", { noise: { amp: 1, bp: 4200, q: 1.5, hp: 1500, lp: 12000, decay: 0.04 }, click: 0.5, len: 0.25 }],
            ["Match Strike", "noiseHit", { hp: 1500, lp: 9000, decay: 0.15, attack: 0.01, len: 0.4 }],
        ];
        for (const [name, gen, params] of foley) {
            flAdd(FO + "/" + name + " 01", gen, params);
            flAdd(FO + "/" + name + " 02", gen, jitter(params, "foley" + name, 0.15));
        }
        FLPackKit = { PK, hz, pad2, merge, jitter, KICK, SNARE, CLAP, HAT, OHAT, applyCharacter, PERC, BASS, MELODIC, FXR, VOX };
    }
