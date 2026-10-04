    // ======================================================================
    // BeepBox FL: built-in sound library.
    //
    // Every built-in sound is synthesized on demand (deterministically, so a
    // "b:" sample id always renders the same audio). Nothing here is a copy of
    // Image-Line's sample content; these are original recreations of the
    // classic categories you find in FL Studio's Packs folder. If you own FL
    // Studio you can import your real Packs folder from the sound browser.
    // ======================================================================
    const FL_SR = 44100;
    function flRng(seedString) {
        let seed = 2166136261 >>> 0;
        for (let i = 0; i < seedString.length; i++)
            seed = Math.imul(seed ^ seedString.charCodeAt(i), 16777619) >>> 0;
        return () => {
            seed = (seed + 0x6D2B79F5) >>> 0;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    class FLBiq {
        constructor(type, freq, q = 0.71, gain = 0) {
            this.type = type;
            this.q = q;
            this.gain = gain;
            this.c = {};
            this.x1 = this.x2 = this.y1 = this.y2 = 0;
            this.set(freq);
        }
        set(freq) {
            flBiquad(this.type, freq, this.gain, this.q, FL_SR, this.c);
        }
        p(x) {
            const c = this.c;
            const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
            this.x2 = this.x1;
            this.x1 = x;
            this.y2 = this.y1;
            this.y1 = y;
            return y;
        }
        run(buffer) {
            for (let i = 0; i < buffer.length; i++)
                buffer[i] = this.p(buffer[i]);
            return buffer;
        }
    }
    const flLP = (f, q = 0.71) => new FLBiq(6, f, q);
    const flHP = (f, q = 0.71) => new FLBiq(0, f, q);
    const flBP = (f, q = 1) => new FLBiq(3, f, q);
    function flPolyBlep(t, dt) {
        if (t < dt) {
            t /= dt;
            return t + t - t * t - 1;
        }
        else if (t > 1 - dt) {
            t = (t - 1) / dt;
            return t * t + t + t + 1;
        }
        return 0;
    }
    function flSaw(phase, dt) {
        const t = phase - Math.floor(phase);
        return 2 * t - 1 - flPolyBlep(t, dt);
    }
    function flSquare(phase, dt, width = 0.5) {
        const t = phase - Math.floor(phase);
        let v = t < width ? 1 : -1;
        v += flPolyBlep(t, dt);
        const t2 = (t + 1 - width) % 1;
        v -= flPolyBlep(t2, dt);
        return v;
    }
    function flNormalize(buffer, peak = 0.89) {
        let max = 0;
        for (let i = 0; i < buffer.length; i++)
            max = Math.max(max, Math.abs(buffer[i]));
        if (max > 0) {
            const scale = peak / max;
            for (let i = 0; i < buffer.length; i++)
                buffer[i] *= scale;
        }
        return buffer;
    }
    function flFades(buffer, inMs = 0.5, outMs = 8) {
        const fi = Math.min(buffer.length, Math.floor(FL_SR * inMs / 1000));
        for (let i = 0; i < fi; i++)
            buffer[i] *= i / fi;
        const fo = Math.min(buffer.length, Math.floor(FL_SR * outMs / 1000));
        for (let i = 0; i < fo; i++)
            buffer[buffer.length - 1 - i] *= i / fo;
        return buffer;
    }
    function flTrimSilence(buffer, threshold = 0.0004) {
        let end = buffer.length;
        while (end > 1 && Math.abs(buffer[end - 1]) < threshold)
            end--;
        return end < buffer.length ? buffer.slice(0, Math.min(buffer.length, end + 64)) : buffer;
    }
    function flBuf(seconds) {
        return new Float32Array(Math.max(1, Math.floor(FL_SR * seconds)));
    }
    function flDrive(x, amount) {
        if (amount <= 0)
            return x;
        const k = 1 + amount;
        return Math.tanh(x * k) / Math.tanh(k);
    }
    // Tiny Schroeder reverb for "verb" variants.
    function flReverb(buffer, mix = 0.25, decaySeconds = 1.2, tailSeconds = 0.8) {
        const out = new Float32Array(buffer.length + Math.floor(FL_SR * tailSeconds));
        out.set(buffer);
        const combs = [1557, 1617, 1491, 1422].map(d => ({ d, line: new Float32Array(d), i: 0, g: Math.pow(0.001, d / (FL_SR * decaySeconds)), lp: 0 }));
        const aps = [225, 556].map(d => ({ d, line: new Float32Array(d), i: 0 }));
        for (let n = 0; n < out.length; n++) {
            const x = n < buffer.length ? buffer[n] : 0;
            let wet = 0;
            for (const c of combs) {
                const y = c.line[c.i];
                c.lp = y * 0.7 + c.lp * 0.3;
                c.line[c.i] = x + c.lp * c.g;
                c.i = (c.i + 1) % c.d;
                wet += y;
            }
            wet *= 0.25;
            for (const a of aps) {
                const y = a.line[a.i];
                const v = wet + y * 0.5;
                a.line[a.i] = v;
                a.i = (a.i + 1) % a.d;
                wet = y - v * 0.5;
            }
            out[n] = out[n] * (1 - mix * 0.5) + wet * mix;
        }
        return out;
    }
    // ------------------------------------------------------------ generators
    const FLGen = {
        kick(p, r) {
            const out = flBuf(p.len || 1.0);
            let phase = 0;
            const lp = p.lp ? flLP(p.lp) : null;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const f = p.f0 + (p.f1 - p.f0) * Math.exp(-t / p.sweep);
                phase += f / FL_SR;
                const amp = t < (p.hold || 0) ? 1 : Math.exp(-(t - (p.hold || 0)) / p.decay);
                let s = Math.sin(2 * Math.PI * phase) * amp;
                if (p.click)
                    s += (r() * 2 - 1) * p.click * Math.exp(-t / 0.0012);
                if (p.drive)
                    s = flDrive(s, p.drive);
                if (lp)
                    s = lp.p(s);
                if (p.crush) {
                    const steps = Math.pow(2, p.crush);
                    s = Math.round(s * steps) / steps;
                }
                out[i] = s;
            }
            if (p.dust) {
                for (let i = 0; i < out.length; i++)
                    out[i] += (r() * 2 - 1) * p.dust * Math.exp(-i / FL_SR / 0.4);
            }
            return flFades(flNormalize(out), 0.3, 20);
        },
        snare(p, r) {
            const out = flBuf(p.len || 0.6);
            const hp = flHP(p.noiseHP || 1800);
            const lp = flLP(p.noiseLP || 12000);
            const bp = p.bp ? flBP(p.bp, 1.2) : null;
            let ph1 = 0, ph2 = 0;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const bend = 1 + (p.bend || 0.3) * Math.exp(-t / 0.01);
                ph1 += (p.t1 || 180) * bend / FL_SR;
                ph2 += (p.t2 || 330) * bend / FL_SR;
                const tone = (Math.sin(2 * Math.PI * ph1) * Math.exp(-t / (p.toneDecay || 0.07)) + 0.6 * Math.sin(2 * Math.PI * ph2) * Math.exp(-t / ((p.toneDecay || 0.07) * 0.7))) * (p.tone || 0.6);
                let n = lp.p(hp.p(r() * 2 - 1));
                if (bp)
                    n = n * 0.5 + bp.p(n) * 1.5;
                const noise = n * Math.exp(-t / (p.noiseDecay || 0.16)) * (p.snappy || 1);
                out[i] = flDrive(tone + noise, p.drive || 0);
            }
            let result = flNormalize(out);
            if (p.verb)
                result = flNormalize(flReverb(result, p.verb, 0.9, 0.5));
            return flFades(flTrimSilence(result), 0.2, 15);
        },
        clap(p, r) {
            const out = flBuf(p.len || 0.7);
            const bp = flBP(p.freq || 1100, p.q || 2.2);
            const hp = flHP(500);
            const bursts = p.bursts || [0, 0.011, 0.023, 0.034];
            const last = bursts[bursts.length - 1];
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                let env = 0;
                for (const b of bursts) {
                    if (t >= b && t < b + 0.012)
                        env = Math.max(env, Math.exp(-(t - b) / 0.0035));
                }
                if (t >= last)
                    env = Math.max(env, 0.75 * Math.exp(-(t - last) / (p.tail || 0.13)));
                out[i] = hp.p(bp.p(r() * 2 - 1)) * env;
            }
            let result = flNormalize(out);
            if (p.verb)
                result = flNormalize(flReverb(result, p.verb, 1.0, 0.5));
            return flFades(flTrimSilence(result), 0.2, 15);
        },
        metal(p, r) {
            // 808-style six-oscillator metallic source (hats, cymbals, cowbell).
            const out = flBuf(p.len || 0.5);
            const freqs = p.freqs || [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
            const tune = p.tune || 1;
            const phases = freqs.map(() => r());
            const bp = flBP(p.bp || 10000, p.q || 1.0);
            const hp = flHP(p.hp || 7000);
            const hp2 = flHP(p.hp || 7000);
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                let s = 0;
                for (let k = 0; k < freqs.length; k++) {
                    phases[k] += freqs[k] * tune / FL_SR;
                    s += (phases[k] % 1) < 0.5 ? 1 : -1;
                }
                s = s / freqs.length;
                s += (r() * 2 - 1) * (p.noise || 0);
                let env = Math.exp(-t / p.decay);
                if (p.attack)
                    env *= Math.min(1, t / p.attack);
                if (p.fastDecay)
                    env = 0.55 * Math.exp(-t / p.fastDecay) + 0.45 * env;
                out[i] = hp2.p(hp.p(bp.p(s))) * env;
            }
            let result = flNormalize(out);
            if (p.reverse)
                result.reverse();
            return flFades(flTrimSilence(result), p.reverse ? 30 : 0.2, 10);
        },
        noiseHit(p, r) {
            const out = flBuf(p.len || 0.3);
            const hp = flHP(p.hp || 4000);
            const lp = flLP(p.lp || 16000);
            const bp = p.bp ? flBP(p.bp, p.q || 1.5) : null;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                let env = Math.exp(-t / p.decay);
                if (p.attack)
                    env *= Math.min(1, t / p.attack);
                if (p.bursts) {
                    let e = 0;
                    for (const b of p.bursts)
                        if (t >= b)
                            e = Math.max(e, Math.exp(-(t - b) / p.decay));
                    env = e;
                }
                let s = lp.p(hp.p(r() * 2 - 1));
                if (bp)
                    s = bp.p(s);
                out[i] = s * env;
            }
            return flFades(flTrimSilence(flNormalize(out)), 0.3, 10);
        },
        tom(p, r) {
            const out = flBuf(p.len || 0.6);
            let phase = 0;
            const lp = flLP(3000);
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const f = p.f * (1 + (p.bend || 0.35) * Math.exp(-t / (p.sweep || 0.04)));
                phase += f / FL_SR;
                const s = Math.sin(2 * Math.PI * phase) * Math.exp(-t / p.decay) + lp.p(r() * 2 - 1) * (p.noise || 0.08) * Math.exp(-t / 0.02);
                out[i] = flDrive(s, p.drive || 0);
            }
            return flFades(flTrimSilence(flNormalize(out)), 0.3, 10);
        },
        tones(p, r) {
            // Sum of decaying sine partials: [freq, amp, decay].
            const out = flBuf(p.len || 0.5);
            const partials = p.partials;
            const phases = partials.map(() => 0);
            const hp = p.click ? flHP(3000) : null;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                let s = 0;
                for (let k = 0; k < partials.length; k++) {
                    const pa = partials[k];
                    phases[k] += pa[0] / FL_SR;
                    s += Math.sin(2 * Math.PI * phases[k]) * pa[1] * Math.exp(-t / pa[2]);
                }
                if (hp)
                    s += hp.p(r() * 2 - 1) * p.click * Math.exp(-t / 0.003);
                if (p.attack)
                    s *= Math.min(1, t / p.attack);
                out[i] = s;
            }
            let result = flNormalize(out);
            if (p.verb)
                result = flNormalize(flReverb(result, p.verb, 1.4, 0.8));
            return flFades(flTrimSilence(result), p.attack ? 0.1 : 0.3, 12);
        },
        sweepFX(p, r) {
            const out = flBuf(p.len || 3);
            const bp = flBP(p.f0, p.q || 3);
            let phase = 0;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const x = t / (p.len || 3);
                const f = p.f0 * Math.pow(p.f1 / p.f0, x);
                if ((i & 31) == 0)
                    bp.set(f);
                let env = p.rise ? Math.pow(x, 1.6) : Math.pow(1 - x, 1.6);
                env *= Math.min(1, t / 0.01) * Math.min(1, ((p.len || 3) - t) / 0.02);
                let s = bp.p(r() * 2 - 1) * 1.5;
                if (p.tone) {
                    phase += f * (p.toneRatio || 0.25) / FL_SR;
                    s += flSaw(phase, f * (p.toneRatio || 0.25) / FL_SR) * p.tone;
                }
                out[i] = s * env;
            }
            return flNormalize(out);
        },
        pitchFX(p, r) {
            const out = flBuf(p.len);
            let phase = 0;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const x = t / p.len;
                let f = p.f0 * Math.pow(p.f1 / p.f0, p.curve ? Math.pow(x, p.curve) : x);
                if (p.lfo)
                    f *= Math.pow(2, Math.sin(2 * Math.PI * p.lfo * t) * (p.lfoDepth || 0.5));
                const dt = f / FL_SR;
                phase += dt;
                let s;
                switch (p.wave) {
                    case "saw":
                        s = flSaw(phase, dt);
                        break;
                    case "square":
                        s = flSquare(phase, dt);
                        break;
                    default: s = Math.sin(2 * Math.PI * phase);
                }
                const env = (p.hold ? (x < p.hold ? 1 : Math.max(0, 1 - (x - p.hold) / (1 - p.hold))) : Math.exp(-t / (p.decay || 1e9))) * Math.min(1, t / 0.003);
                out[i] = flDrive(s * env, p.drive || 0);
            }
            return flFades(flNormalize(out), 0.3, 20);
        },
        impact(p, r) {
            const out = flBuf(p.len || 3);
            let phase = 0;
            const lp = flLP(1800);
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const f = 38 + 90 * Math.exp(-t / 0.08);
                phase += f / FL_SR;
                out[i] = Math.sin(2 * Math.PI * phase) * Math.exp(-t / 1.1) + lp.p(r() * 2 - 1) * 0.7 * Math.exp(-t / 0.25);
            }
            return flFades(flTrimSilence(flNormalize(flReverb(flNormalize(out), 0.35, 2.4, 1.5))), 0.2, 50);
        },
        crackle(p, r) {
            const out = flBuf(p.len || 4);
            const lp = flLP(5000);
            const hp = flHP(800);
            for (let i = 0; i < out.length; i++) {
                let s = (r() * 2 - 1) * 0.02;
                if (r() < 0.0009)
                    s += (r() * 2 - 1) * (0.4 + r() * 0.6);
                out[i] = hp.p(lp.p(s));
            }
            return flFades(flNormalize(out, 0.6), 30, 30);
        },
        airhorn(p, r) {
            const out = flBuf(1.4);
            const freqs = [523.25, 659.25, 783.99];
            const phases = [0, 0.3, 0.6];
            const lp = flLP(3200, 1.5);
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const vib = 1 + 0.008 * Math.sin(2 * Math.PI * 6 * t);
                let s = 0;
                for (let k = 0; k < 3; k++) {
                    const dt = freqs[k] * vib * (1 - 0.06 * Math.exp(-t / 0.05)) / FL_SR;
                    phases[k] += dt;
                    s += flSaw(phases[k], dt);
                }
                const env = Math.min(1, t / 0.02) * (t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.3));
                out[i] = flDrive(lp.p(s * 0.5) * env, 1.5);
            }
            return flNormalize(out);
        },
        // --------------------------------------------------- pitched one-shots
        bass808(p, r) {
            const f0 = 65.406;
            const out = flBuf(p.len || 3);
            let phase = 0;
            const lp = p.lp ? flLP(p.lp) : null;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const f = f0 * (1 + (p.drop || 1.2) * Math.exp(-t / (p.sweep || 0.03)));
                phase += f / FL_SR;
                const amp = t < (p.hold || 0.15) ? 1 : Math.exp(-(t - (p.hold || 0.15)) / (p.decay || 1.4));
                let s = Math.sin(2 * Math.PI * phase) * amp;
                if (p.click)
                    s += (r() * 2 - 1) * p.click * Math.exp(-t / 0.001);
                if (p.drive)
                    s = flDrive(s, p.drive);
                if (p.clip)
                    s = Math.max(-p.clip, Math.min(p.clip, s)) / p.clip;
                if (lp)
                    s = lp.p(s);
                out[i] = s;
            }
            return flFades(flNormalize(out), 0.5, 40);
        },
        additive(p, r) {
            // Sustained/decaying additive tones. partials: [ratio, amp, decay]
            const f = p.f || 261.63;
            const out = flBuf(p.len || 2);
            const partials = p.partials;
            const phases = partials.map(() => r());
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const vib = p.vib ? 1 + p.vib * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.4) : 1;
                let s = 0;
                for (let k = 0; k < partials.length; k++) {
                    const pa = partials[k];
                    const ratio = pa[0] * (p.inharm ? Math.sqrt(1 + p.inharm * pa[0] * pa[0]) : 1);
                    phases[k] += f * ratio * vib / FL_SR;
                    s += Math.sin(2 * Math.PI * phases[k]) * pa[1] * (pa[2] > 0 ? Math.exp(-t / pa[2]) : 1);
                }
                const attack = p.attack ? Math.min(1, t / p.attack) : Math.min(1, t / 0.002);
                out[i] = s * attack;
            }
            if (p.hammer) {
                const lp = flLP(2500);
                for (let i = 0; i < Math.min(out.length, 2000); i++)
                    out[i] += lp.p(r() * 2 - 1) * p.hammer * Math.exp(-i / FL_SR / 0.006);
            }
            return flFades(flNormalize(out), 0.1, 30);
        },
        fm(p, r) {
            const f = p.f || 261.63;
            const out = flBuf(p.len || 2);
            let pc = 0, pm = 0, pm2 = 0;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                pm += f * p.ratio / FL_SR;
                const index = p.index * Math.exp(-t / p.indexDecay) + (p.indexFloor || 0);
                let mod = Math.sin(2 * Math.PI * pm) * index;
                if (p.ratio2) {
                    pm2 += f * p.ratio2 / FL_SR;
                    mod += Math.sin(2 * Math.PI * pm2) * p.index2 * Math.exp(-t / p.index2Decay);
                }
                pc += f / FL_SR;
                const env = Math.min(1, t / (p.attack || 0.002)) * (p.decay > 0 ? Math.exp(-t / p.decay) : 1);
                out[i] = Math.sin(2 * Math.PI * pc + mod) * env;
            }
            return flFades(flNormalize(out), 0.1, 30);
        },
        pluck(p, r) {
            const f = p.f || 261.63;
            const out = flBuf(p.len || 1.6);
            const period = FL_SR / f;
            const n = Math.max(2, Math.floor(period));
            const frac = period - n;
            const line = new Float32Array(n + 2);
            const lp = flLP(p.bright || 6000);
            for (let i = 0; i < line.length; i++)
                line[i] = lp.p(r() * 2 - 1);
            let idx = 0;
            let prev = 0;
            const damping = p.damping || 0.996;
            const body = p.body ? flBP(p.body, 0.8) : null;
            for (let i = 0; i < out.length; i++) {
                const a = line[idx];
                const b = line[(idx + 1) % n];
                const value = a + (b - a) * frac;
                const filtered = (value + prev) * 0.5 * damping;
                prev = value;
                line[idx] = filtered;
                idx = (idx + 1) % n;
                out[i] = body ? value * 0.6 + body.p(value) * 0.8 : value;
            }
            return flFades(flTrimSilence(flNormalize(out)), 0.1, 30);
        },
        synth(p, r) {
            // Detuned saw/square stacks with an optional filter envelope.
            const f = p.f || 261.63;
            const out = flBuf(p.len || 2);
            const voices = p.voices || 1;
            const notes = p.chord || [0];
            const oscs = [];
            for (const semis of notes) {
                for (let v = 0; v < voices; v++) {
                    const spread = voices == 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * (p.detune || 0.15);
                    oscs.push({ freq: f * Math.pow(2, (semis + spread) / 12), phase: r() });
                }
            }
            const lp = new FLBiq(6, p.cutoff || 4000, p.res || 0.71);
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const vib = p.vib ? 1 + p.vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.3) : 1;
                let s = 0;
                for (const o of oscs) {
                    const dt = o.freq * vib / FL_SR;
                    o.phase += dt;
                    s += p.wave == "square" ? flSquare(o.phase, dt, p.width || 0.5) : flSaw(o.phase, dt);
                }
                s /= Math.sqrt(oscs.length);
                if (p.filterEnv && (i & 15) == 0) {
                    const fe = p.filterEnv;
                    lp.set(Math.min(18000, fe[1] + (fe[0] - fe[1]) * Math.exp(-t / fe[2])));
                }
                else if (p.lfoCutoff && (i & 15) == 0) {
                    const l = p.lfoCutoff;
                    lp.set(l[0] * Math.pow(l[1] / l[0], 0.5 - 0.5 * Math.cos(2 * Math.PI * l[2] * t)));
                }
                s = lp.p(s);
                const attack = Math.min(1, t / (p.attack || 0.004));
                const env = p.decay ? Math.exp(-t / p.decay) : (t > (p.len || 2) - 0.08 ? Math.max(0, ((p.len || 2) - t) / 0.08) : 1);
                out[i] = flDrive(s * attack * env, p.drive || 0);
            }
            return flFades(flNormalize(out), 0.1, 30);
        },
        formant(p, r) {
            const f = p.f || 261.63;
            const out = flBuf(p.len || 2);
            const formants = p.formants.map(fr => flBP(fr[0], fr[1]));
            const gains = p.formants.map(fr => fr[2]);
            let phase = 0;
            for (let i = 0; i < out.length; i++) {
                const t = i / FL_SR;
                const vib = 1 + 0.012 * Math.sin(2 * Math.PI * 5.1 * t) * Math.min(1, t / 0.3);
                const glide = p.glide ? 1 + p.glide * Math.exp(-t / 0.06) : 1;
                const dt = f * vib * glide / FL_SR;
                phase += dt;
                const src = flSaw(phase, dt) + (r() * 2 - 1) * 0.04;
                let s = 0;
                for (let k = 0; k < formants.length; k++)
                    s += formants[k].p(src) * gains[k];
                const attack = Math.min(1, t / (p.attack || 0.12));
                const release = p.release ? Math.min(1, Math.max(0, ((p.len || 2) - t) / p.release)) : 1;
                out[i] = s * attack * release;
            }
            return flFades(flNormalize(out), 0.1, 30);
        },
    };
    // ------------------------------------------------------------ drum loops
    function flRenderLoop(spec) {
        const beatSeconds = 60 / spec.bpm;
        const steps = spec.steps || 16;
        const stepSeconds = beatSeconds * 4 / steps;
        const totalSteps = steps * (spec.bars || 1);
        const out = new Float32Array(Math.floor(FL_SR * stepSeconds * totalSteps));
        for (const lane of spec.lanes) {
            const rendered = FLSoundFactory.render(lane.sound);
            if (!rendered)
                continue;
            const pattern = lane.pattern.replace(/\s/g, "");
            for (let s = 0; s < totalSteps; s++) {
                const ch = pattern[s % pattern.length];
                if (ch == "." || ch == undefined)
                    continue;
                const vel = ch == "x" ? 1 : ch == "o" ? 0.6 : 0.35;
                const swing = (s % 2 == 1) ? (spec.swing || 0) * stepSeconds : 0;
                const start = Math.floor(FL_SR * (s * stepSeconds + swing));
                const pcm = rendered.pcm;
                const gain = vel * (lane.gain || 1);
                for (let i = 0; i < pcm.length && start + i < out.length; i++)
                    out[start + i] += pcm[i] * gain;
            }
        }
        for (let i = 0; i < out.length; i++)
            out[i] = Math.tanh(out[i] * 0.9);
        return flNormalize(out);
    }
    // ------------------------------------------------------------ catalog
    const C4 = 261.626, C2 = 65.406, C3 = 130.813;
    const flCatalog = [];
    function flAdd(path, gen, params, extra = {}) {
        const key = extra.key || path.toLowerCase().replace(/[^a-z0-9\/]+/g, "-").replace(/-+\//g, "/").replace(/\/-+/g, "/").replace(/^-|-$/g, "");
        flCatalog.push(Object.assign({ key, path, name: path.split("/").pop(), gen, params }, extra));
    }
    // TR-808
    flAdd("808/808 Kick", "kick", { f0: 52, f1: 120, sweep: 0.02, decay: 0.45, len: 1.2, click: 0.05 });
    flAdd("808/808 Kick (long)", "kick", { f0: 48, f1: 110, sweep: 0.025, decay: 1.1, len: 2.4, click: 0.04 });
    flAdd("808/808 Kick (short)", "kick", { f0: 56, f1: 140, sweep: 0.015, decay: 0.16, len: 0.5, click: 0.1 });
    flAdd("808/808 Kick (hard)", "kick", { f0: 50, f1: 160, sweep: 0.018, decay: 0.4, len: 1.0, click: 0.2, drive: 2.5 });
    flAdd("808/808 Snare", "snare", { t1: 185, t2: 330, toneDecay: 0.06, noiseDecay: 0.15, tone: 0.75, snappy: 0.9, noiseHP: 1900 });
    flAdd("808/808 Snare (snappy)", "snare", { t1: 205, t2: 345, toneDecay: 0.045, noiseDecay: 0.2, tone: 0.5, snappy: 1.3, noiseHP: 2400 });
    flAdd("808/808 Clap", "clap", { freq: 1150, tail: 0.12 });
    flAdd("808/808 Closed Hat", "metal", { decay: 0.042, bp: 10000, hp: 7500 });
    flAdd("808/808 Open Hat", "metal", { decay: 0.32, bp: 10000, hp: 7200, len: 0.9 });
    flAdd("808/808 Cymbal", "metal", { decay: 0.9, fastDecay: 0.08, bp: 8000, hp: 5600, len: 2.2, noise: 0.2 });
    flAdd("808/808 Cowbell", "metal", { freqs: [540, 800], decay: 0.22, fastDecay: 0.012, bp: 2600, q: 0.7, hp: 400, len: 0.6 });
    flAdd("808/808 Low Tom", "tom", { f: 92, decay: 0.32 });
    flAdd("808/808 Mid Tom", "tom", { f: 135, decay: 0.26 });
    flAdd("808/808 High Tom", "tom", { f: 190, decay: 0.2 });
    flAdd("808/808 Low Conga", "tom", { f: 220, decay: 0.16, bend: 0.15 });
    flAdd("808/808 High Conga", "tom", { f: 330, decay: 0.12, bend: 0.12 });
    flAdd("808/808 Rimshot", "tones", { partials: [[455, 1, 0.012], [1667, 0.7, 0.008]], click: 0.6, len: 0.15 });
    flAdd("808/808 Clave", "tones", { partials: [[2500, 1, 0.025]], len: 0.15 });
    flAdd("808/808 Maracas", "noiseHit", { hp: 5000, decay: 0.035, attack: 0.002, len: 0.15 });
    // 808 bass (melodic, tuned to C so the sampler can play it in key)
    flAdd("808 Bass/808 Bass (clean)", "bass808", { hold: 0.2, decay: 1.6, len: 3.0 }, { rootKey: 36 });
    flAdd("808 Bass/808 Bass (punchy)", "bass808", { hold: 0.08, decay: 0.7, drop: 2.2, click: 0.25, len: 1.8 }, { rootKey: 36 });
    flAdd("808 Bass/808 Bass (dirty)", "bass808", { hold: 0.2, decay: 1.5, drive: 4, lp: 2400, len: 3.0 }, { rootKey: 36 });
    flAdd("808 Bass/808 Bass (distorted)", "bass808", { hold: 0.25, decay: 1.7, drive: 9, clip: 0.7, lp: 3500, len: 3.0 }, { rootKey: 36 });
    flAdd("808 Bass/808 Bass (long glide)", "bass808", { hold: 0.6, decay: 2.8, drop: 0.8, len: 5.0 }, { rootKey: 36 });
    flAdd("808 Bass/808 Bass (zay)", "bass808", { hold: 0.12, decay: 1.0, drop: 3.5, sweep: 0.06, drive: 3, len: 2.4 }, { rootKey: 36 });
    // TR-909
    flAdd("909/909 Kick", "kick", { f0: 54, f1: 280, sweep: 0.022, decay: 0.32, len: 0.9, click: 0.45, drive: 0.8 });
    flAdd("909/909 Kick (punchy)", "kick", { f0: 58, f1: 330, sweep: 0.016, decay: 0.26, len: 0.7, click: 0.6, drive: 1.6 });
    flAdd("909/909 Snare", "snare", { t1: 165, t2: 290, toneDecay: 0.055, noiseDecay: 0.2, tone: 0.55, snappy: 1.25, noiseHP: 1000, noiseLP: 9000 });
    flAdd("909/909 Clap", "clap", { freq: 1300, q: 1.6, tail: 0.16 });
    flAdd("909/909 Rim", "tones", { partials: [[500, 1, 0.01], [1800, 0.6, 0.007]], click: 1, len: 0.12 });
    flAdd("909/909 Closed Hat", "metal", { decay: 0.05, bp: 11000, hp: 8000, noise: 0.6 });
    flAdd("909/909 Open Hat", "metal", { decay: 0.3, bp: 11000, hp: 7800, noise: 0.6, len: 0.9 });
    flAdd("909/909 Crash", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.4, fastDecay: 0.06, bp: 7000, q: 0.5, hp: 4200, noise: 0.5, len: 3.0 });
    flAdd("909/909 Ride", "tones", { partials: [[3233, 0.6, 1.4], [5120, 0.5, 1.0], [7310, 0.4, 0.8], [9870, 0.3, 0.5]], click: 0.2, len: 2.2 });
    flAdd("909/909 Low Tom", "tom", { f: 100, decay: 0.28, noise: 0.15 });
    flAdd("909/909 High Tom", "tom", { f: 170, decay: 0.2, noise: 0.15 });
    // Trap
    flAdd("Trap/Trap Kick", "kick", { f0: 50, f1: 220, sweep: 0.02, decay: 0.38, len: 1.0, click: 0.5, drive: 1.2 });
    flAdd("Trap/Trap Kick (knock)", "kick", { f0: 60, f1: 300, sweep: 0.012, decay: 0.18, len: 0.5, click: 0.8, drive: 3 });
    flAdd("Trap/Trap Snare", "snare", { t1: 200, t2: 360, toneDecay: 0.05, noiseDecay: 0.18, tone: 0.45, snappy: 1.4, noiseHP: 1500, bp: 2600, verb: 0.25 });
    flAdd("Trap/Trap Snare (crack)", "snare", { t1: 240, t2: 420, toneDecay: 0.03, noiseDecay: 0.12, tone: 0.35, snappy: 1.6, noiseHP: 2200, drive: 2 });
    flAdd("Trap/Trap Clap", "clap", { freq: 1400, q: 1.4, tail: 0.18, verb: 0.3 });
    flAdd("Trap/Trap Clap (layered)", "clap", { freq: 1000, q: 1.2, tail: 0.22, bursts: [0, 0.008, 0.017, 0.026, 0.035], verb: 0.2 });
    flAdd("Trap/Trap Hat", "metal", { decay: 0.025, bp: 12000, hp: 9000, noise: 0.5, tune: 1.4 });
    flAdd("Trap/Trap Hat (tight)", "metal", { decay: 0.014, bp: 13000, hp: 10000, noise: 0.7, tune: 1.6 });
    flAdd("Trap/Trap Open Hat", "metal", { decay: 0.22, bp: 11500, hp: 8500, noise: 0.5, tune: 1.3, len: 0.7 });
    flAdd("Trap/Trap Rim", "tones", { partials: [[620, 1, 0.012], [2100, 0.5, 0.008]], click: 0.9, len: 0.12 });
    flAdd("Trap/Trap Snap", "noiseHit", { bp: 2600, q: 3, hp: 1200, decay: 0.022, bursts: [0, 0.009], len: 0.2 });
    flAdd("Trap/Trap Perc (blip)", "pitchFX", { f0: 1400, f1: 700, len: 0.12, decay: 0.05 });
    flAdd("Trap/Trap Perc (pluck)", "pluck", { f: 880, damping: 0.985, len: 0.4 });
    flAdd("Trap/Trap Perc (wood)", "tones", { partials: [[980, 1, 0.04], [2350, 0.4, 0.02]], click: 0.4, len: 0.2 });
    // Lo-Fi
    flAdd("Lo-Fi/Dusty Kick", "kick", { f0: 50, f1: 150, sweep: 0.02, decay: 0.3, len: 0.8, click: 0.1, drive: 1.5, lp: 1400, crush: 7, dust: 0.03 });
    flAdd("Lo-Fi/Dusty Snare", "snare", { t1: 190, t2: 320, toneDecay: 0.06, noiseDecay: 0.16, tone: 0.6, snappy: 1.0, noiseHP: 900, noiseLP: 4200, drive: 1.2 });
    flAdd("Lo-Fi/Soft Rim", "tones", { partials: [[420, 1, 0.02], [1300, 0.4, 0.01]], click: 0.2, len: 0.15 });
    flAdd("Lo-Fi/Muted Hat", "noiseHit", { hp: 3500, lp: 7000, decay: 0.03, len: 0.15 });
    flAdd("Lo-Fi/Shaker", "noiseHit", { hp: 3000, lp: 8000, decay: 0.05, attack: 0.012, len: 0.2 });
    flAdd("Lo-Fi/Vinyl Crackle", "crackle", { len: 4 });
    // House
    flAdd("House/House Kick", "kick", { f0: 50, f1: 210, sweep: 0.025, decay: 0.3, len: 0.8, click: 0.3, drive: 1.0 });
    flAdd("House/House Clap", "clap", { freq: 1250, q: 1.8, tail: 0.2, verb: 0.35 });
    flAdd("House/House Hat", "metal", { decay: 0.045, bp: 9500, hp: 7000, noise: 0.8 });
    flAdd("House/House Open Hat", "metal", { decay: 0.2, bp: 9000, hp: 6800, noise: 0.8, len: 0.6 });
    flAdd("House/House Shaker", "noiseHit", { hp: 5000, decay: 0.04, attack: 0.02, len: 0.15 });
    flAdd("House/House Ride", "tones", { partials: [[2900, 0.6, 0.9], [4630, 0.5, 0.7], [6900, 0.4, 0.5]], click: 0.15, len: 1.6 });
    // Percussion
    flAdd("Percussion/Bongo High", "tom", { f: 450, decay: 0.1, bend: 0.12, sweep: 0.02 });
    flAdd("Percussion/Bongo Low", "tom", { f: 300, decay: 0.13, bend: 0.12, sweep: 0.02 });
    flAdd("Percussion/Woodblock", "tones", { partials: [[1050, 1, 0.035], [2650, 0.5, 0.018]], click: 0.3, len: 0.15 });
    flAdd("Percussion/Tambourine", "metal", { freqs: [5400, 7200, 9100, 11200], decay: 0.12, bp: 8000, q: 0.6, hp: 5000, noise: 0.7, len: 0.4 });
    flAdd("Percussion/Triangle", "tones", { partials: [[2032, 0.8, 1.6], [5230, 0.5, 1.1], [8800, 0.3, 0.7]], len: 2.0 });
    flAdd("Percussion/Cabasa", "noiseHit", { hp: 6000, decay: 0.06, attack: 0.01, len: 0.2 });
    flAdd("Percussion/Agogo High", "tones", { partials: [[870, 1, 0.3], [2240, 0.4, 0.15]], click: 0.1, len: 0.6 });
    flAdd("Percussion/Agogo Low", "tones", { partials: [[580, 1, 0.35], [1510, 0.4, 0.17]], click: 0.1, len: 0.7 });
    flAdd("Percussion/Timbale", "tones", { partials: [[410, 1, 0.25], [1010, 0.4, 0.12], [2330, 0.2, 0.05]], click: 0.6, len: 0.6 });
    flAdd("Percussion/Finger Snap", "noiseHit", { bp: 2400, q: 2.5, hp: 900, decay: 0.03, len: 0.2 });
    flAdd("Percussion/Glass Tink", "tones", { partials: [[2637, 1, 0.5], [6680, 0.4, 0.25], [11200, 0.2, 0.1]], len: 0.9 });
    flAdd("Percussion/Metal Hit", "metal", { freqs: [415, 620, 1035, 1460], decay: 0.4, fastDecay: 0.02, bp: 3000, q: 0.5, hp: 300, len: 1.0 });
    // Cymbals
    flAdd("Cymbals/Crash", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.5, fastDecay: 0.05, bp: 7000, q: 0.5, hp: 4000, noise: 0.6, len: 3.2 });
    flAdd("Cymbals/Splash", "metal", { freqs: [449, 667, 828, 1088, 1217, 1660], decay: 0.55, fastDecay: 0.03, bp: 8500, q: 0.6, hp: 5200, noise: 0.6, len: 1.4 });
    flAdd("Cymbals/China", "metal", { freqs: [299, 417, 588, 788, 1017, 1260], decay: 1.0, fastDecay: 0.05, bp: 4500, q: 0.7, hp: 2600, noise: 0.9, len: 2.5 });
    flAdd("Cymbals/Ride Bell", "tones", { partials: [[1660, 0.8, 1.2], [3233, 0.6, 0.9], [5120, 0.3, 0.5]], click: 0.1, len: 2.2 });
    flAdd("Cymbals/Reverse Crash", "metal", { freqs: [349, 517, 628, 888, 917, 1360], decay: 1.0, bp: 7000, q: 0.5, hp: 4000, noise: 0.6, len: 2.0, reverse: true });
    // FX
    flAdd("FX/Riser (noise)", "sweepFX", { f0: 300, f1: 9000, q: 3, len: 4, rise: true });
    flAdd("FX/Riser (tonal)", "sweepFX", { f0: 200, f1: 6000, q: 4, len: 4, rise: true, tone: 0.35, toneRatio: 0.5 });
    flAdd("FX/Downlifter", "sweepFX", { f0: 8000, f1: 200, q: 3, len: 3, rise: false });
    flAdd("FX/Impact", "impact", { len: 3 });
    flAdd("FX/Sub Drop", "pitchFX", { f0: 90, f1: 28, len: 2.0, hold: 0.6 });
    flAdd("FX/Laser", "pitchFX", { f0: 3200, f1: 180, len: 0.3, wave: "saw", curve: 0.5, decay: 0.15 });
    flAdd("FX/Zap", "pitchFX", { f0: 1800, f1: 70, len: 0.14, wave: "square", decay: 0.08 });
    flAdd("FX/Siren", "pitchFX", { f0: 800, f1: 800, len: 2.2, wave: "saw", lfo: 1.5, lfoDepth: 0.55, hold: 0.85 });
    flAdd("FX/Airhorn", "airhorn", {});
    flAdd("FX/Vinyl Crackle", "crackle", { len: 4 });
    flAdd("FX/Power Down", "pitchFX", { f0: 600, f1: 40, len: 1.2, wave: "saw", curve: 0.6, hold: 0.7, drive: 1 });
    // Instruments (pitched one-shots for the sampler; root key in MIDI)
    flAdd("Instruments/Grand Piano", "additive", { f: C4, len: 3, inharm: 0.0004, hammer: 0.08, partials: [[1, 1, 2.2], [2, 0.6, 1.5], [3, 0.35, 1.0], [4, 0.22, 0.8], [5, 0.15, 0.6], [6, 0.1, 0.45], [7, 0.06, 0.35], [8, 0.04, 0.28]] }, { rootKey: 60 });
    flAdd("Instruments/E-Piano", "fm", { f: C4, ratio: 1, index: 1.8, indexDecay: 0.6, indexFloor: 0.2, ratio2: 14, index2: 1.2, index2Decay: 0.05, decay: 1.8, len: 2.8 }, { rootKey: 60 });
    flAdd("Instruments/Organ", "additive", { f: C4, len: 2.5, partials: [[0.5, 0.6, 0], [1, 1, 0], [2, 0.7, 0], [3, 0.4, 0], [4, 0.35, 0], [6, 0.15, 0]] }, { rootKey: 60, loop: [0.2, 0.9] });
    flAdd("Instruments/Pluck", "pluck", { f: C4, damping: 0.995, len: 1.6 }, { rootKey: 60 });
    flAdd("Instruments/Guitar", "pluck", { f: C3, damping: 0.997, len: 2.4, body: 900, bright: 4000 }, { rootKey: 48 });
    flAdd("Instruments/Pizzicato", "pluck", { f: C4, damping: 0.982, len: 0.6, bright: 3000 }, { rootKey: 60 });
    flAdd("Instruments/Bell", "fm", { f: C4, ratio: 3.5, index: 3, indexDecay: 1.2, decay: 2.6, len: 3.5 }, { rootKey: 60 });
    flAdd("Instruments/Music Box", "additive", { f: C4 * 2, len: 2, partials: [[1, 1, 1.1], [2, 0.25, 0.5], [3.9, 0.3, 0.25], [8.1, 0.1, 0.08]] }, { rootKey: 72 });
    flAdd("Instruments/Marimba", "additive", { f: C4, len: 1.2, partials: [[1, 1, 0.45], [4, 0.45, 0.1], [9.9, 0.15, 0.03]] }, { rootKey: 60 });
    flAdd("Instruments/Kalimba", "additive", { f: C4, len: 1.6, hammer: 0.03, partials: [[1, 1, 0.9], [5.4, 0.25, 0.08], [10.3, 0.08, 0.03]] }, { rootKey: 60 });
    flAdd("Instruments/Flute", "additive", { f: C4, len: 2.4, attack: 0.08, vib: 0.006, partials: [[1, 1, 0], [2, 0.18, 0], [3, 0.06, 0]] }, { rootKey: 60, loop: [0.25, 0.9] });
    flAdd("Instruments/Saw Lead", "synth", { f: C4, len: 2, voices: 2, detune: 0.08, cutoff: 5000 }, { rootKey: 60, loop: [0.2, 0.9] });
    flAdd("Instruments/Square Lead", "synth", { f: C4, len: 2, wave: "square", voices: 1, cutoff: 4500 }, { rootKey: 60, loop: [0.2, 0.9] });
    flAdd("Instruments/Supersaw", "synth", { f: C4, len: 2.2, voices: 7, detune: 0.32, cutoff: 9000 }, { rootKey: 60, loop: [0.2, 0.9] });
    flAdd("Instruments/Warm Pad", "synth", { f: C4, len: 3.5, voices: 6, detune: 0.22, cutoff: 1800, attack: 0.6 }, { rootKey: 60, loop: [0.3, 0.9] });
    flAdd("Instruments/Strings", "synth", { f: C4, len: 3, voices: 5, detune: 0.12, cutoff: 3200, attack: 0.25, vib: 0.004 }, { rootKey: 60, loop: [0.3, 0.9] });
    flAdd("Instruments/Brass Stab", "synth", { f: C4, len: 1.2, voices: 3, detune: 0.1, filterEnv: [4500, 1600, 0.12], attack: 0.03, decay: 0.8 }, { rootKey: 60 });
    flAdd("Instruments/Synth Stab (major)", "synth", { f: C4, len: 0.9, voices: 2, detune: 0.1, chord: [0, 4, 7, 12], filterEnv: [7000, 900, 0.1], decay: 0.35 }, { rootKey: 60 });
    flAdd("Instruments/Synth Stab (minor)", "synth", { f: C4, len: 0.9, voices: 2, detune: 0.1, chord: [0, 3, 7, 12], filterEnv: [7000, 900, 0.1], decay: 0.35 }, { rootKey: 60 });
    flAdd("Instruments/Choir Aah", "formant", { f: C4, len: 2.5, formants: [[730, 6, 1], [1090, 7, 0.5], [2440, 8, 0.25]] }, { rootKey: 60, loop: [0.3, 0.9] });
    flAdd("Instruments/Choir Ooh", "formant", { f: C4, len: 2.5, formants: [[570, 6, 1], [840, 7, 0.45], [2410, 8, 0.15]] }, { rootKey: 60, loop: [0.3, 0.9] });
    flAdd("Instruments/Vox Chop Hey", "formant", { f: C4, len: 0.35, attack: 0.01, release: 0.12, glide: 0.25, formants: [[530, 5, 1], [1840, 6, 0.6], [2480, 7, 0.3]] }, { rootKey: 60 });
    flAdd("Instruments/Vox Chop Ee", "formant", { f: C4, len: 0.5, attack: 0.02, release: 0.2, formants: [[270, 6, 1], [2290, 7, 0.55], [3010, 8, 0.3]] }, { rootKey: 60 });
    // Bass
    flAdd("Bass/Sub Bass", "additive", { f: C2, len: 2.5, attack: 0.01, partials: [[1, 1, 0], [2, 0.08, 0]] }, { rootKey: 36, loop: [0.2, 0.9] });
    flAdd("Bass/Reese Bass", "synth", { f: C2, len: 2.5, voices: 2, detune: 0.18, cutoff: 900, drive: 0.8 }, { rootKey: 36, loop: [0.2, 0.9] });
    flAdd("Bass/Acid Bass", "synth", { f: C2, len: 0.8, voices: 1, cutoff: 2500, res: 7, filterEnv: [3000, 280, 0.12], decay: 0.6, drive: 1.5 }, { rootKey: 36 });
    flAdd("Bass/Wobble Bass", "synth", { f: C2, len: 2.5, voices: 2, detune: 0.1, res: 3, lfoCutoff: [220, 2200, 3], drive: 2 }, { rootKey: 36, loop: [0.0, 1.0] });
    flAdd("Bass/FM Bass", "fm", { f: C2, ratio: 1, index: 3.5, indexDecay: 0.15, indexFloor: 0.6, decay: 0.9, len: 1.4 }, { rootKey: 36 });
    flAdd("Bass/Pluck Bass", "pluck", { f: C2, damping: 0.993, len: 1.4, bright: 2000 }, { rootKey: 36 });
    flAdd("Bass/Square Bass", "synth", { f: C2, len: 1.5, wave: "square", voices: 1, cutoff: 1400, decay: 1.0 }, { rootKey: 36 });
    // Loops (great for chopping with Slicex)
    flAdd("Loops/Boom Bap 90 BPM", "loop", { bpm: 90, swing: 0.12, lanes: [
            { sound: "lo-fi/dusty-kick", pattern: "x.....x...x.....", gain: 1 },
            { sound: "lo-fi/dusty-snare", pattern: "....x.......x...", gain: 0.9 },
            { sound: "lo-fi/muted-hat", pattern: "x.o.x.o.x.o.x.oo", gain: 0.45 },
        ] }, { bpm: 90 });
    flAdd("Loops/Trap 140 BPM", "loop", { bpm: 140, steps: 32, lanes: [
            { sound: "trap/trap-kick", pattern: "x.........x.....x.x.............", gain: 1 },
            { sound: "trap/trap-clap", pattern: "........x...............x.......", gain: 0.8 },
            { sound: "trap/trap-hat", pattern: "x.x.x.x.x.x.xxxxx.x.x.x.x.xxx.x.", gain: 0.4 },
        ] }, { bpm: 140 });
    flAdd("Loops/House 124 BPM", "loop", { bpm: 124, lanes: [
            { sound: "house/house-kick", pattern: "x...x...x...x...", gain: 1 },
            { sound: "house/house-clap", pattern: "....x.......x...", gain: 0.7 },
            { sound: "house/house-open-hat", pattern: "..x...x...x...x.", gain: 0.45 },
            { sound: "house/house-shaker", pattern: "xoxoxoxoxoxoxoxo", gain: 0.3 },
        ] }, { bpm: 124 });
    flAdd("Loops/Breakbeat 170 BPM", "loop", { bpm: 170, bars: 2, steps: 16, lanes: [
            { sound: "909/909-kick", pattern: "x.x.......xx....x.x...x...x.....", gain: 1 },
            { sound: "909/909-snare", pattern: "....x..o.o..x..o....x..o.o..x..o", gain: 0.8 },
            { sound: "909/909-ride", pattern: "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.", gain: 0.35 },
        ] }, { bpm: 170 });
    FLGen.loop = (p) => flRenderLoop(p);
    // FPC drum kits: 12 pads (bottom row of the drum channel first).
    const flKits = [
        { name: "TR-808 Kit", pads: [["808/808-kick", 0], ["808/808-snare", 0], ["808/808-clap", 0], ["808/808-closed-hat", 1], ["808/808-open-hat", 1], ["808/808-low-tom", 0], ["808/808-mid-tom", 0], ["808/808-high-tom", 0], ["808/808-rimshot", 0], ["808/808-cowbell", 0], ["808/808-cymbal", 0], ["808/808-clave", 0]] },
        { name: "TR-909 Kit", pads: [["909/909-kick", 0], ["909/909-snare", 0], ["909/909-clap", 0], ["909/909-closed-hat", 1], ["909/909-open-hat", 1], ["909/909-low-tom", 0], ["909/909-high-tom", 0], ["909/909-rim", 0], ["909/909-ride", 0], ["909/909-crash", 0], ["808/808-cowbell", 0], ["percussion/tambourine", 0]] },
        { name: "Trap Kit", pads: [["trap/trap-kick", 0], ["trap/trap-snare", 0], ["trap/trap-clap", 0], ["trap/trap-hat", 1], ["trap/trap-open-hat", 1], ["trap/trap-hat-tight", 1], ["trap/trap-rim", 0], ["trap/trap-snap", 0], ["trap/trap-perc-blip", 0], ["trap/trap-perc-wood", 0], ["cymbals/crash", 0], ["808/808-kick-long", 0]] },
        { name: "Lo-Fi Kit", pads: [["lo-fi/dusty-kick", 0], ["lo-fi/dusty-snare", 0], ["lo-fi/soft-rim", 0], ["lo-fi/muted-hat", 1], ["lo-fi/shaker", 0], ["808/808-low-conga", 0], ["808/808-high-conga", 0], ["percussion/woodblock", 0], ["percussion/finger-snap", 0], ["cymbals/ride-bell", 0], ["percussion/triangle", 0], ["fx/vinyl-crackle", 0]] },
        { name: "House Kit", pads: [["house/house-kick", 0], ["909/909-snare", 0], ["house/house-clap", 0], ["house/house-hat", 1], ["house/house-open-hat", 1], ["house/house-shaker", 0], ["house/house-ride", 0], ["909/909-rim", 0], ["percussion/bongo-high", 0], ["percussion/bongo-low", 0], ["cymbals/splash", 0], ["cymbals/crash", 0]] },
        { name: "Percussion Kit", pads: [["percussion/bongo-low", 0], ["percussion/bongo-high", 0], ["808/808-low-conga", 0], ["808/808-high-conga", 0], ["percussion/timbale", 0], ["percussion/woodblock", 0], ["percussion/agogo-low", 0], ["percussion/agogo-high", 0], ["percussion/tambourine", 0], ["percussion/cabasa", 0], ["percussion/triangle", 0], ["percussion/glass-tink", 0]] },
    ];
    class FLSoundFactory {
        static getCatalog() {
            return flCatalog;
        }
        static getKits() {
            return flKits;
        }
        static getInfo(key) {
            if (!FLSoundFactory._byKey) {
                FLSoundFactory._byKey = new Map();
                for (const item of flCatalog)
                    FLSoundFactory._byKey.set(item.key, item);
            }
            return FLSoundFactory._byKey.get(key);
        }
        static render(key) {
            if (FLSoundFactory._cache.has(key))
                return FLSoundFactory._cache.get(key);
            const info = FLSoundFactory.getInfo(key);
            if (!info)
                return null;
            const pcm = FLGen[info.gen](info.params, flRng(key));
            const result = { pcm, rate: FL_SR, name: info.name, rootKey: info.rootKey == undefined ? null : info.rootKey, loop: info.loop || null, bpm: info.bpm || null };
            FLSoundFactory._cache.set(key, result);
            return result;
        }
    }
    FLSoundFactory._cache = new Map();
    FLSoundFactory._byKey = null;
