    // ======================================================================
    // CarrotBox: idea generator. Makes leads, counter-melodies, bass lines,
    // arps, chords and drum grooves from 4 seed notes and/or what's already
    // in the song. Pure functions: returns bars of notes for carrotWriteNotes.
    //
    // Catchiness comes from: a short motif built from the seed notes,
    // repetition with variation (AABA / ABAB...), step-wise motion with
    // gap-filling after leaps, chord tones on strong beats, an arch-shaped
    // contour and a cadence back home at the end of the phrase.
    // ======================================================================
    const CARROT_GEN_STYLES = {
        pop: { name: "Pop", legato: 0.9, weights: [1, 0.15, 0.5, 0.15, 0.7, 0.15, 0.55, 0.2], repeat: 0.12, leap: 0.12, chords: { major: [0, 4, 5, 3], minor: [0, 5, 2, 6] } },
        trap: { name: "Trap / Drill", legato: 0.75, weights: [1, 0.3, 0.45, 0.4, 0.6, 0.35, 0.5, 0.45], repeat: 0.3, leap: 0.1, chords: { major: [0, 5, 3, 4], minor: [0, 0, 5, 4] } },
        house: { name: "House / EDM", legato: 0.6, weights: [0.55, 0.15, 0.85, 0.15, 0.5, 0.15, 0.85, 0.3], repeat: 0.25, leap: 0.15, chords: { major: [5, 3, 0, 4], minor: [0, 5, 2, 6] } },
        lofi: { name: "Lo-fi / Chill", legato: 0.95, weights: [0.9, 0.05, 0.45, 0.1, 0.55, 0.05, 0.4, 0.1], repeat: 0.1, leap: 0.18, sevenths: true, chords: { major: [1, 4, 0, 5], minor: [3, 6, 0, 0] } },
        synthwave: { name: "Synthwave / 80s", legato: 0.85, weights: [1, 0.1, 0.7, 0.1, 0.8, 0.1, 0.7, 0.15], repeat: 0.15, leap: 0.12, chords: { major: [5, 3, 0, 4], minor: [0, 5, 6, 4] } },
        chiptune: { name: "Chiptune", legato: 0.5, weights: [1, 0.45, 0.6, 0.45, 0.7, 0.45, 0.6, 0.45], repeat: 0.15, leap: 0.25, chords: { major: [0, 3, 4, 0], minor: [0, 6, 5, 4] } },
        funk: { name: "Funk / Disco", legato: 0.45, weights: [1, 0.35, 0.45, 0.55, 0.65, 0.35, 0.5, 0.55], repeat: 0.18, leap: 0.2, sevenths: true, chords: { major: [0, 3, 0, 4], minor: [0, 3, 0, 4] } },
        ambient: { name: "Ambient / Cinematic", legato: 1, weights: [1, 0, 0.15, 0, 0.45, 0, 0.1, 0], repeat: 0.05, leap: 0.2, chords: { major: [0, 5, 3, 4], minor: [0, 5, 3, 6] } },
    };
    const CARROT_GEN_PARTS = [
        ["lead", "Lead melody"], ["counter", "Counter-melody"], ["bass", "Bass line"], ["arp", "Arpeggio"], ["chords", "Chords"], ["drums", "Drum groove"],
    ];
    const CARROT_GEN_FORMS = { "AABA": ["A", "A'", "B", "A'"], "ABAB": ["A", "B", "A'", "B'"], "AAAB": ["A", "A'", "A", "B"], "ABAC": ["A", "B", "A'", "C"], "Free": null };
    class CarrotIdeaGen {
        // options: song, channel, startBar, bars, part, style, density, complexity,
        //          center (pitch), form, seeds (pitches), learn (bool), seed (int)
        static generate(options) {
            const o = Object.assign({ bars: 4, part: "lead", style: "pop", density: 0.5, complexity: 0.4, form: "AABA", seeds: [], learn: false, seed: 1 }, options);
            const song = o.song;
            const ctx = {
                o, song,
                rng: CarrotDSP.rng((o.seed * 9301 + 49297) >>> 0),
                style: CARROT_GEN_STYLES[o.style] || CARROT_GEN_STYLES.pop,
                barSteps: song.beatsPerBar * 4,
                stepParts: Config.partsPerBeat / 4,
            };
            ctx.learned = o.learn ? CarrotIdeaGen.learn(song, o.channel) : null;
            ctx.scale = CarrotIdeaGen.scaleClasses(song, o.seeds.concat(ctx.learned ? ctx.learned.pitches : []));
            ctx.chords = CarrotIdeaGen.chordsFor(ctx);
            if (o.part == "drums")
                return CarrotIdeaGen.drums(ctx);
            if (o.part == "bass")
                return CarrotIdeaGen.bass(ctx);
            if (o.part == "arp")
                return CarrotIdeaGen.arp(ctx);
            if (o.part == "chords")
                return CarrotIdeaGen.chordPart(ctx);
            return CarrotIdeaGen.melody(ctx, o.part == "counter");
        }
        // ---------------------------------------------------------- analysis
        // Pitch classes (relative to the song key) of the scale in use.
        static scaleClasses(song, pitches) {
            const flags = Config.scales[song.scale].flags;
            let classes = [];
            for (let i = 0; i < 12; i++)
                if (flags[i])
                    classes.push(i);
            if (classes.length >= 12 || classes.length < 5) {
                // Chromatic ("expert") scale: guess major or minor from the notes.
                const counts = new Array(12).fill(0);
                for (const p of pitches)
                    counts[((p % 12) + 12) % 12]++;
                const major = [0, 2, 4, 5, 7, 9, 11], minor = [0, 2, 3, 5, 7, 8, 10];
                const score = (set) => set.reduce((sum, c) => sum + counts[c], 0) + (set == major ? 0.5 : 0);
                classes = score(minor) > score(major) ? minor : major;
            }
            const isMinor = classes.indexOf(3) != -1 && classes.indexOf(4) == -1;
            return { classes, isMinor };
        }
        // Statistics from the other pitched channels.
        static learn(song, skipChannel) {
            const result = { pitches: [], intervals: new Map(), onsets: new Array(16).fill(0), seeds: [], center: null, count: 0 };
            let bestChannel = -1, bestAverage = -1;
            for (let c = 0; c < song.pitchChannelCount; c++) {
                if (c == skipChannel)
                    continue;
                const channel = song.channels[c];
                const sequence = [];
                for (let bar = 0; bar < song.barCount; bar++) {
                    const pattern = song.getPattern(c, bar);
                    if (!pattern)
                        continue;
                    for (const note of pattern.notes) {
                        const top = note.pitches[note.pitches.length - 1];
                        sequence.push({ time: bar * song.beatsPerBar * Config.partsPerBeat + note.start, pitch: top, start: note.start });
                    }
                }
                if (sequence.length == 0)
                    continue;
                sequence.sort((a, b) => a.time - b.time);
                const average = sequence.reduce((s, n) => s + n.pitch, 0) / sequence.length;
                if (average > bestAverage) {
                    bestAverage = average;
                    bestChannel = c;
                    result.lead = sequence;
                }
                for (let i = 0; i < sequence.length; i++) {
                    const n = sequence[i];
                    result.pitches.push(n.pitch);
                    const step = Math.round(n.start / (Config.partsPerBeat / 4)) % 16;
                    result.onsets[step]++;
                    if (i > 0) {
                        const interval = n.pitch - sequence[i - 1].pitch;
                        if (Math.abs(interval) <= 12)
                            result.intervals.set(interval, (result.intervals.get(interval) || 0) + 1);
                    }
                }
                result.count += sequence.length;
            }
            if (result.lead) {
                const distinct = [];
                for (let i = result.lead.length - 1; i >= 0 && distinct.length < 4; i--) {
                    if (distinct.indexOf(result.lead[i].pitch) == -1)
                        distinct.unshift(result.lead[i].pitch);
                }
                result.seeds = distinct;
                result.center = Math.round(bestAverage);
                result.leadChannel = bestChannel;
            }
            return result.count > 0 ? result : null;
        }
        // One chord per bar: detected from the other channels where possible,
        // otherwise a progression that suits the style.
        static chordsFor(ctx) {
            const { o, song, scale, style } = ctx;
            const S = scale.classes;
            const n = S.length;
            const progression = (scale.isMinor ? style.chords.minor : style.chords.major).map(d => d % n);
            const chords = [];
            for (let b = 0; b < o.bars; b++) {
                const bar = o.startBar + b;
                let detected = null;
                if (bar < song.barCount) {
                    const weights = new Array(12).fill(0);
                    let total = 0;
                    for (let c = 0; c < song.pitchChannelCount; c++) {
                        if (c == o.channel)
                            continue;
                        const pattern = song.getPattern(c, bar);
                        if (!pattern)
                            continue;
                        for (const note of pattern.notes) {
                            for (const p of note.pitches) {
                                const w = (note.end - note.start) * (note.start == 0 ? 2 : 1);
                                weights[((p % 12) + 12) % 12] += w;
                                total += w;
                            }
                        }
                    }
                    if (total > Config.partsPerBeat * 2) {
                        let best = -1, bestScore = 0;
                        for (let d = 0; d < n; d++) {
                            const tones = [S[d], S[(d + 2) % n], S[(d + 4) % n]];
                            const score = weights[tones[0]] * 1.2 + weights[tones[1]] + weights[tones[2]] * 0.8;
                            if (score > bestScore) {
                                bestScore = score;
                                best = d;
                            }
                        }
                        if (best >= 0)
                            detected = best;
                    }
                }
                chords.push(detected != null ? detected : progression[b % progression.length]);
            }
            return chords;
        }
        // Chord tones (pitch classes) for scale degree d.
        static chordClasses(ctx, degree, sevenths = false) {
            const S = ctx.scale.classes;
            const n = S.length;
            const tones = [S[degree % n], S[(degree + 2) % n], S[(degree + 4) % n]];
            if (sevenths)
                tones.push(S[(degree + 6) % n]);
            return tones;
        }
        // All pitches in the scale between lo and hi.
        static scalePitches(ctx, lo, hi) {
            const list = [];
            for (let p = Math.max(0, lo); p <= Math.min(Config.maxPitch, hi); p++) {
                if (ctx.scale.classes.indexOf(p % 12) != -1)
                    list.push(p);
            }
            return list;
        }
        static nearestIndex(list, pitch) {
            let best = 0;
            for (let i = 1; i < list.length; i++)
                if (Math.abs(list[i] - pitch) < Math.abs(list[best] - pitch))
                    best = i;
            return best;
        }
        // ------------------------------------------------------------ rhythm
        // A one-bar rhythm: [{step, len}] in 16th steps.
        static rhythm(ctx, density, minNotes = 3, avoid = null) {
            const { rng, style, barSteps, learned } = ctx;
            const onsets = [];
            for (let s = 0; s < barSteps; s++) {
                let w = style.weights[s % 8];
                if (s % 16 == 0)
                    w = Math.max(w, 0.9);
                if (learned && learned.count > 8) {
                    const max = Math.max(...learned.onsets);
                    if (max > 0)
                        w = w * 0.5 + (learned.onsets[s % 16] / max) * 0.5;
                }
                if (avoid && avoid.has(s))
                    w *= 0.25;
                const p = Math.min(0.97, w * (0.25 + 1.15 * density));
                if (rng() < p)
                    onsets.push(s);
            }
            if (onsets.length == 0 || onsets[0] != 0 && rng() < 0.75)
                onsets.unshift(0);
            const unique = Array.from(new Set(onsets)).sort((a, b) => a - b);
            while (unique.length < minNotes) {
                const s = Math.floor(rng() * barSteps / 2) * 2;
                if (unique.indexOf(s) == -1)
                    unique.push(s);
                unique.sort((a, b) => a - b);
            }
            return unique.map((step, i) => {
                const next = i + 1 < unique.length ? unique[i + 1] : barSteps;
                let len = Math.max(1, Math.round((next - step) * style.legato));
                if (i + 1 == unique.length)
                    len = Math.max(1, Math.min(next - step, 4 + Math.floor(rng() * 4)));
                return { step, len: Math.max(1, Math.min(len, next - step)) };
            });
        }
        // ------------------------------------------------------------ melody
        static melody(ctx, counter) {
            const { o, rng, style, barSteps } = ctx;
            let center = o.center != null ? o.center : (ctx.learned && ctx.learned.center != null ? ctx.learned.center : 48);
            if (counter)
                center -= 7;
            const list = CarrotIdeaGen.scalePitches(ctx, center - 10, center + 12);
            if (list.length < 5)
                return { bars: [], description: "No room for a melody here." };
            // Seed notes (the user's 4 notes, or the song's last lead notes).
            let seeds = o.seeds.filter(p => p != null);
            if (seeds.length == 0 && ctx.learned)
                seeds = ctx.learned.seeds.slice();
            if (counter)
                seeds = [];
            const seedIdx = seeds.map(p => CarrotIdeaGen.nearestIndex(list, p + 12 * Math.round((center - p) / 12)));
            // Avoid the lead's rhythm for counter-melodies.
            let avoid = null;
            if (counter && ctx.learned && ctx.learned.lead) {
                avoid = new Set();
                for (const n of ctx.learned.lead)
                    avoid.add(Math.round(n.start / ctx.stepParts) % barSteps);
            }
            const density = counter ? o.density * 0.6 : o.density;
            const pStep = 0.62 - o.complexity * 0.22;
            const pSmall = 0.2 + o.complexity * 0.08;
            const pRepeat = style.repeat;
            const learnedMoves = CarrotIdeaGen._learnedMoves(ctx);
            const chordIndexAt = (bar) => ctx.chords[Math.min(ctx.chords.length - 1, bar)];
            const isChordTone = (pitch, bar) => CarrotIdeaGen.chordClasses(ctx, chordIndexAt(bar), style.sevenths).indexOf(pitch % 12) != -1;
            const snapToChord = (idx, bar) => {
                for (let d = 0; d <= 3; d++) {
                    for (const sign of [1, -1]) {
                        const j = idx + d * sign;
                        if (j >= 0 && j < list.length && isChordTone(list[j], bar))
                            return j;
                    }
                }
                return idx;
            };
            // Builds pitches for a rhythm; returns note indices into `list`.
            const makeMotif = (rhythm, bar, startIdx, useSeeds, phrasePos) => {
                const result = [];
                let idx = startIdx;
                let prevMove = 0;
                let repeats = 0;
                for (let i = 0; i < rhythm.length; i++) {
                    if (useSeeds && i < seedIdx.length) {
                        idx = seedIdx[i];
                        result.push(idx);
                        prevMove = i > 0 ? seedIdx[i] - seedIdx[i - 1] : 0;
                        continue;
                    }
                    let move;
                    const r = rng();
                    const bias = phrasePos < 0.45 ? 0.25 : phrasePos > 0.6 ? -0.25 : 0;
                    const dir = rng() < 0.5 + bias ? 1 : -1;
                    if (Math.abs(prevMove) >= 3) {
                        move = -Math.sign(prevMove) * (rng() < 0.7 ? 1 : 2);
                    }
                    else if (learnedMoves && rng() < 0.5) {
                        move = learnedMoves[Math.floor(rng() * learnedMoves.length)];
                    }
                    else if (r < pRepeat && repeats < 2) {
                        move = 0;
                    }
                    else if (r < pRepeat + pStep) {
                        move = dir;
                    }
                    else if (r < pRepeat + pStep + pSmall) {
                        move = dir * 2;
                    }
                    else {
                        move = dir * (3 + Math.floor(rng() * (2 + o.complexity * 3)));
                    }
                    repeats = move == 0 ? repeats + 1 : 0;
                    idx += move;
                    if (idx < 0)
                        idx = -idx;
                    if (idx >= list.length)
                        idx = 2 * (list.length - 1) - idx;
                    idx = Math.max(0, Math.min(list.length - 1, idx));
                    const step = rhythm[i].step;
                    const strong = step % 8 == 0;
                    if (strong && rng() < 0.8)
                        idx = snapToChord(idx, bar);
                    prevMove = move;
                    result.push(idx);
                }
                return result;
            };
            // Shift a motif diatonically to follow the chord change.
            const transposeMotif = (motif, fromBar, toBar) => {
                const shift = chordIndexAt(toBar) - chordIndexAt(fromBar);
                const n = ctx.scale.classes.length;
                let s = ((shift % n) + n) % n;
                if (s > n / 2)
                    s -= n;
                return motif.map(i => Math.max(0, Math.min(list.length - 1, i + s)));
            };
            // Form: bars labelled A, B, C; a prime (') reuses the motif with a new ending.
            const form = CARROT_GEN_FORMS[o.form] || null;
            const store = {};
            let lastMotif = null;
            const bars = [];
            const startIdx = seedIdx.length > 0 ? seedIdx[0] : snapToChord(Math.floor(list.length / 2), 0);
            for (let b = 0; b < o.bars; b++) {
                const posInPhrase = (b % 4) / 4;
                const label = form ? form[b % 4] : null;
                const letter = label ? label[0] : null;
                const vary = label != null && label.length > 1;
                const phraseIndex = Math.floor(b / 4);
                let rhythm, motif;
                const source = letter ? store[letter] : null;
                if (source && rng() > o.complexity * 0.2) {
                    // Reuse an earlier motif, transposed to fit this bar's chord.
                    rhythm = source.rhythm.map(r => Object.assign({}, r));
                    motif = transposeMotif(source.notes, source.bar, b);
                    if (vary && rhythm.length >= 3) {
                        const keep = Math.max(1, rhythm.length - 2);
                        const tail = makeMotif(rhythm.slice(keep), b, motif[keep - 1], false, posInPhrase);
                        motif = motif.slice(0, keep).concat(tail);
                    }
                }
                else {
                    const useSeeds = b == 0 && seeds.length > 0;
                    rhythm = CarrotIdeaGen.rhythm(ctx, density, useSeeds ? Math.max(3, seeds.length) : 3, avoid);
                    let from = startIdx;
                    if (lastMotif && lastMotif.length > 0)
                        from = Math.max(0, Math.min(list.length - 1, lastMotif[lastMotif.length - 1] + (letter == "B" ? 2 : letter == "C" ? -2 : 0)));
                    motif = makeMotif(rhythm, b, from, useSeeds, posInPhrase);
                    if (letter && !store[letter])
                        store[letter] = { notes: motif.slice(), bar: b, rhythm: rhythm.map(r => Object.assign({}, r)) };
                }
                lastMotif = motif;
                // Cadences at the end of every 4-bar phrase.
                const endOfPhrase = (b % 4 == 3) || b == o.bars - 1;
                if (endOfPhrase && motif.length > 0) {
                    const finalPhrase = b == o.bars - 1 || phraseIndex % 2 == 1;
                    const targetClass = finalPhrase ? 0 : ctx.scale.classes[Math.min(ctx.scale.classes.length - 1, 4)] || 7;
                    let best = motif[motif.length - 1];
                    let bestDistance = 1e9;
                    for (let j = 0; j < list.length; j++) {
                        if (list[j] % 12 == targetClass && Math.abs(j - best) < bestDistance) {
                            bestDistance = Math.abs(j - best);
                            best = j;
                        }
                    }
                    motif[motif.length - 1] = best;
                    if (motif.length >= 2 && Math.abs(motif[motif.length - 2] - best) > 2)
                        motif[motif.length - 2] = best + (motif[motif.length - 2] > best ? 1 : -1);
                    const last = rhythm[rhythm.length - 1];
                    last.len = Math.max(last.len, Math.min(barSteps - last.step, 6));
                }
                const notes = [];
                for (let i = 0; i < rhythm.length && i < motif.length; i++) {
                    const r = rhythm[i];
                    const accent = r.step % 4 == 0 ? Config.noteSizeMax : (o.style == "funk" && r.step % 2 == 1 ? 1 : 2);
                    notes.push({ start: r.step * ctx.stepParts, end: Math.min(barSteps, r.step + r.len) * ctx.stepParts, pitches: [list[Math.max(0, Math.min(list.length - 1, motif[i]))]], size: accent });
                }
                bars.push(notes);
            }
            return { bars, description: (counter ? "Counter-melody" : "Melody") + " in " + (ctx.scale.isMinor ? "minor" : "major") + ", " + style.name + (o.form ? ", form " + o.form : "") };
        }
        static _learnedMoves(ctx) {
            if (!ctx.learned || ctx.learned.intervals.size == 0)
                return null;
            // Convert semitone intervals into approximate scale steps.
            const moves = [];
            for (const [interval, count] of ctx.learned.intervals) {
                const steps = Math.round(interval / 1.75);
                for (let i = 0; i < Math.min(40, count); i++)
                    moves.push(steps);
            }
            return moves.length > 0 ? moves : null;
        }
        // -------------------------------------------------------------- bass
        static bass(ctx) {
            const { o, rng, style, barSteps } = ctx;
            const center = o.center != null ? Math.min(o.center, 40) : 28;
            const patterns = {
                pop: [[0, "R", 4], [6, "R", 2], [8, "5", 4], [12, "R", 3], [14, "O", 2]],
                trap: [[0, "R", 10], [10, "R", 3], [14, "5", 2]],
                house: [[2, "R", 2], [6, "R", 2], [10, "R", 2], [14, "O", 2]],
                lofi: [[0, "R", 6], [7, "5", 3], [10, "R", 5]],
                synthwave: [[0, "R", 2], [2, "R", 2], [4, "R", 2], [6, "O", 2], [8, "R", 2], [10, "R", 2], [12, "R", 2], [14, "O", 2]],
                chiptune: [[0, "R", 2], [2, "O", 2], [4, "R", 2], [6, "O", 2], [8, "5", 2], [10, "O", 2], [12, "R", 2], [14, "5", 2]],
                funk: [[0, "R", 2], [3, "O", 1], [4, "R", 1], [6, "R", 1], [8, "5", 2], [11, "O", 1], [12, "R", 1], [14, "7", 2]],
                ambient: [[0, "R", 16]],
            };
            const base = patterns[o.style] || patterns.pop;
            const bars = [];
            for (let b = 0; b < o.bars; b++) {
                const chord = CarrotIdeaGen.chordClasses(ctx, ctx.chords[b], true);
                const root = chord[0];
                let rootPitch = root + 12 * Math.floor((center - root) / 12);
                if (rootPitch < center - 6)
                    rootPitch += 12;
                const tone = (kind) => kind == "R" ? rootPitch : kind == "5" ? rootPitch + ((chord[2] - root + 12) % 12) : kind == "O" ? rootPitch + 12 : kind == "7" ? rootPitch + ((chord[3] - root + 12) % 12) : rootPitch;
                const notes = [];
                let pattern = base.slice();
                if (o.density > 0.65 && o.style != "ambient")
                    pattern = pattern.concat([[barSteps - 1, "O", 1]]);
                if (o.density < 0.3)
                    pattern = pattern.filter((n, i) => i % 2 == 0);
                for (let i = 0; i < pattern.length; i++) {
                    const [step, kind, len] = pattern[i];
                    if (step >= barSteps)
                        continue;
                    let pitch = tone(kind);
                    // Walk toward the next chord on the last note sometimes.
                    if (i == pattern.length - 1 && b + 1 < o.bars && rng() < o.complexity) {
                        const next = CarrotIdeaGen.chordClasses(ctx, ctx.chords[b + 1])[0];
                        const nextPitch = next + 12 * Math.round((rootPitch - next) / 12);
                        pitch = nextPitch + (nextPitch > rootPitch ? -1 : 1) * (ctx.scale.classes.indexOf((nextPitch + 11) % 12) != -1 ? 1 : 2);
                    }
                    notes.push({ start: step * ctx.stepParts, end: Math.min(barSteps, step + len) * ctx.stepParts, pitches: [Math.max(0, pitch)], size: step % 4 == 0 ? 3 : 2 });
                }
                bars.push(notes);
            }
            return { bars, description: "Bass line, " + style.name };
        }
        // --------------------------------------------------------------- arp
        static arp(ctx) {
            const { o, rng, style, barSteps } = ctx;
            const center = o.center != null ? o.center : 52;
            const rate = o.density > 0.55 ? 1 : 2;
            const modes = ["up", "down", "updown", "pinky", "random"];
            const mode = modes[Math.floor(rng() * modes.length * (0.4 + o.complexity * 0.6)) % modes.length];
            const bars = [];
            for (let b = 0; b < o.bars; b++) {
                const chord = CarrotIdeaGen.chordClasses(ctx, ctx.chords[b], style.sevenths);
                const tones = [];
                for (const c of chord) {
                    let p = c + 12 * Math.floor((center - c) / 12);
                    if (p < center - 2)
                        p += 12;
                    tones.push(p);
                }
                tones.sort((a, c) => a - c);
                tones.push(tones[0] + 12);
                let order;
                if (mode == "down")
                    order = tones.slice().reverse();
                else if (mode == "updown")
                    order = tones.concat(tones.slice(1, -1).reverse());
                else if (mode == "pinky")
                    order = [].concat(...tones.slice(0, -1).map(t => [t, tones[tones.length - 1]]));
                else
                    order = tones;
                const notes = [];
                let i = 0;
                for (let step = 0; step < barSteps; step += rate, i++) {
                    const pitch = mode == "random" ? tones[Math.floor(rng() * tones.length)] : order[i % order.length];
                    notes.push({ start: step * ctx.stepParts, end: (step + rate) * ctx.stepParts, pitches: [pitch], size: step % 4 == 0 ? 3 : 2 });
                }
                bars.push(notes);
            }
            return { bars, description: "Arpeggio (" + mode + "), " + style.name };
        }
        // ------------------------------------------------------------ chords
        static chordPart(ctx) {
            const { o, rng, style, barSteps } = ctx;
            const center = o.center != null ? o.center : 50;
            const rhythms = {
                pop: [[0, 8], [8, 8]],
                trap: [[0, 16]],
                house: [[2, 2], [6, 2], [10, 2], [14, 2]],
                lofi: [[0, 7], [7, 9]],
                synthwave: [[0, 4], [4, 4], [8, 4], [12, 4]],
                chiptune: [[0, 2], [4, 2], [8, 2], [12, 2]],
                funk: [[0, 2], [3, 1], [6, 2], [10, 1], [12, 3]],
                ambient: [[0, 16]],
            };
            const rhythm = rhythms[o.style] || rhythms.pop;
            const bars = [];
            let previous = null;
            for (let b = 0; b < o.bars; b++) {
                const chord = CarrotIdeaGen.chordClasses(ctx, ctx.chords[b], style.sevenths || o.complexity > 0.6);
                // Voice-lead: choose the inversion closest to the previous chord.
                let best = null, bestCost = 1e9;
                for (let inversion = 0; inversion < chord.length; inversion++) {
                    const voicing = [];
                    let last = -1;
                    for (let k = 0; k < chord.length; k++) {
                        const c = chord[(k + inversion) % chord.length];
                        let p = c + 12 * Math.floor((center - 6 - c) / 12);
                        while (p <= last)
                            p += 12;
                        voicing.push(p);
                        last = p;
                    }
                    const cost = previous ? voicing.reduce((s, p, k) => s + Math.abs(p - (previous[k] || p)), 0) : Math.abs(voicing[0] - (center - 6));
                    if (cost < bestCost) {
                        bestCost = cost;
                        best = voicing;
                    }
                }
                previous = best;
                const notes = [];
                for (const [step, len] of rhythm) {
                    if (step >= barSteps)
                        continue;
                    if (o.density < 0.3 && step != 0)
                        continue;
                    notes.push({ start: step * ctx.stepParts, end: Math.min(barSteps, step + len) * ctx.stepParts, pitches: best.slice(0, Config.maxChordSize), size: step == 0 ? 3 : 2 });
                }
                bars.push(notes);
            }
            void rng;
            return { bars, description: "Chords (" + ctx.chords.map(d => ["I", "II", "III", "IV", "V", "VI", "VII"][d] || "?").join("–") + "), " + style.name };
        }
        // ------------------------------------------------------------- drums
        // Rows: 0 kick, 1 snare, 2 clap, 3 closed hat, 4 open hat, 5-11 toms/perc.
        static drums(ctx) {
            const { o, rng, barSteps } = ctx;
            const grooves = {
                pop: { kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "..............x." },
                trap: { kick: "x......x..x.....", snare: "........x.......", hat: "x.x.x.x.x.x.x.x.", open: "", roll: true },
                house: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.", open: "..x...x...x...x.", clap: true },
                lofi: { kick: "x......x..x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "", swing: true },
                synthwave: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "" },
                chiptune: { kick: "x.....x.x.......", snare: "....x.......x..x", hat: "x.x.x.x.x.x.x.x.", open: "" },
                funk: { kick: "x..x..x...x..x..", snare: "....x..o.o..x..o", hat: "xxxxxxxxxxxxxxxx", open: "......x........." },
                ambient: { kick: "x.......x.......", snare: "........x.......", hat: "x...x...x...x...", open: "" },
            };
            const g = grooves[o.style] || grooves.pop;
            const bars = [];
            const fill = (b) => b == o.bars - 1 && o.bars > 1 && o.complexity > 0.35;
            for (let b = 0; b < o.bars; b++) {
                const notes = [];
                const seen = new Set();
                const add = (row, step, len, size = 3) => {
                    if (seen.has(row + ":" + step))
                        return;
                    seen.add(row + ":" + step);
                    if (step < barSteps)
                        notes.push({ start: step * ctx.stepParts, end: Math.min(barSteps, step + len) * ctx.stepParts, pitches: [row], size });
                };
                for (let s = 0; s < barSteps; s++) {
                    const i = s % 16;
                    if (g.kick[i] == "x" || (o.complexity > 0.5 && i % 2 == 1 && g.kick[i] == "." && rng() < o.complexity * 0.12))
                        add(0, s, 2);
                    if (g.snare[i] == "x")
                        add(g.clap ? 2 : 1, s, 2);
                    else if (g.snare[i] == "o" && rng() < 0.7)
                        add(1, s, 1, 1);
                    if (g.hat[i] == "x" && rng() < 0.55 + o.density * 0.5)
                        add(3, s, 1, i % 4 == 0 ? 3 : 2);
                    else if (g.roll && rng() < o.density * 0.35)
                        add(3, s, 1, 2);
                    if (g.open && g.open[i] == "x")
                        add(4, s, 2, 2);
                }
                if (g.roll && o.density > 0.4) {
                    // Trap hat roll near the end of the bar.
                    const start = barSteps - 4;
                    for (let k = 0; k < 4; k++)
                        add(3, start + k, 1, 2);
                }
                if (fill(b)) {
                    for (let s = barSteps - 4; s < barSteps; s++)
                        add(s % 2 == 0 ? 1 : 5 + Math.floor(rng() * 3), s, 1, 2);
                }
                bars.push(notes);
            }
            return { bars, description: "Drum groove, " + (CARROT_GEN_STYLES[o.style] || CARROT_GEN_STYLES.pop).name + " (rows: kick, snare, clap, closed hat, open hat, perc)" };
        }
    }
