/*
 * Sketchpad - sketch musical ideas fast.
 *
 *  - Melody: draw a line with the mouse and it snaps to your song's scale
 *  - Chords: build a progression, pick a rhythm and a voicing
 *  - Bass: bass lines that follow the chord progression
 *  - Arp: arpeggiate the progression
 *
 * Every tab can play a preview on the current instrument and drop the result
 * straight into the song's patterns (Ctrl+Z undoes it).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotDSP, Config, flToast, flMidiName, carrotSongScale, carrotNewChannel, carrotNameChannel } = A;

    const GRIDS = ["1/4 notes", "1/8 notes", "1/16 notes"];
    const GRID_STEPS = [1, 2, 4];
    const DEGREES = ["I", "II", "III", "IV", "V", "VI", "VII"];
    const CHORD_TYPES = ["Triad", "Seventh", "Sus 2", "Sus 4", "Add 9", "Sixth", "Power (root + 5th)"];
    const CHORD_SHAPES = [[0, 2, 4], [0, 2, 4, 6], [0, 1, 4], [0, 3, 4], [0, 2, 4, 8], [0, 2, 4, 5], [0, 4, 7]];
    const VOICINGS = ["Close", "Open (spread)", "Low root + upper triad"];
    const CHORD_RHYTHMS = ["Whole bar", "Half notes", "Quarter notes", "Off-beat stabs", "Syncopated", "Charleston", "Pumping eighths"];
    const BASS_PATTERNS = ["Root, whole bar", "Root eighths", "Root and octave", "Root and fifth", "Walking", "Off-beat", "Syncopated 808"];
    const ARP_PATTERNS = ["Up", "Down", "Up and down", "Down and up", "Random", "Converge", "Root between"];
    const ARP_RATES = ["1/8", "1/16", "1/32"];
    const PROGRESSIONS = [
        ["I - V - vi - IV (pop)", [0, 4, 5, 3]],
        ["vi - IV - I - V (emotional)", [5, 3, 0, 4]],
        ["I - vi - IV - V (50s)", [0, 5, 3, 4]],
        ["ii - V - I - I (jazzy)", [1, 4, 0, 0]],
        ["I - IV - V - IV (rock)", [0, 3, 4, 3]],
        ["i - VI - III - VII (minor epic)", [0, 5, 2, 6]],
        ["i - iv - v - i (dark)", [0, 3, 4, 0]],
        ["I - iii - IV - V (uplifting)", [0, 2, 3, 4]],
        ["I - V - vi - iii - IV - I - IV - V (canon)", [0, 4, 5, 2, 3, 0, 3, 4]],
    ];
    const SLOTS = 8;
    const MELODY_COLUMNS = 256;

    A.addStyle(`
.cb-sketch-draw { display: block; width: 100%; height: 250px; cursor: crosshair; touch-action: none; }
.cb-sketch-prog { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.cb-sketch-slot { border: 1px solid var(--ui-widget-background, #444); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 3px; }
.cb-sketch-slot.cb-off { opacity: 0.35; }
.cb-sketch-slot select { width: 100%; }
.cb-sketch-slot .cb-slot-name { font-size: 10px; color: var(--secondary-text, #aaa); }
.cb-sketch-slot .cb-slot-chord { font-weight: bold; font-size: 14px; text-align: center; padding: 2px 0; background: rgba(127,127,127,0.12); border-radius: 4px; }
.cb-sketch-bar { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: flex-end; padding: 4px 0 6px; border-bottom: 1px solid var(--ui-widget-background, #333); margin-bottom: 8px; }
.cb-sketch-preview { display: block; width: 100%; height: 90px; margin-top: 6px; }
`);

    // ----------------------------------------------------------------- music
    function scaleInfo(song) {
        const s = carrotSongScale(song);
        let classes = s.classes.slice();
        const minor = !!(s.flags[3] && !s.flags[4]);
        // Chords need seven notes: pentatonic and other small scales fall back to major / minor.
        let seven = classes.length == 7 ? classes : (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]);
        return { flags: s.flags, classes, seven, minor, name: s.name };
    }
    function snap(song, info, value, chromatic) {
        const rounded = Math.round(value);
        if (chromatic) return rounded;
        let best = rounded, bestDistance = 99;
        for (let d = 0; d <= 6; d++) {
            for (const candidate of [rounded - d, rounded + d]) {
                const pc = ((candidate % 12) + 12) % 12;
                if (info.flags[pc]) {
                    const distance = Math.abs(candidate - value);
                    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
                }
            }
            if (bestDistance < 99 && d >= 1) break;
        }
        return best;
    }
    function clampPitch(p, isNoise) {
        return Math.max(0, Math.min(Config.maxPitch, p));
    }
    function degreePitch(info, degree) {
        const octave = Math.floor(degree / 7);
        return info.seven[((degree % 7) + 7) % 7] + 12 * octave;
    }
    // Pitches of one chord. root: pitch of the tonic at the chosen octave.
    function chordPitches(info, slot, rootBase, voicing) {
        const shape = CHORD_SHAPES[slot.type | 0] || CHORD_SHAPES[0];
        let pitches = shape.map(step => rootBase + degreePitch(info, (slot.deg | 0) + step));
        const lowest = pitches[0];
        // keep chords from drifting up the keyboard
        if (pitches[0] - rootBase > 11) pitches = pitches.map(p => p - 12);
        if (voicing == 1 && pitches.length >= 3) {
            pitches = [pitches[0], pitches[2], pitches[1] + 12].concat(pitches.slice(3));
        }
        else if (voicing == 2 && pitches.length >= 3) {
            pitches = [pitches[0] - 12].concat(pitches.slice(1));
        }
        for (let i = 0; i < (slot.inv | 0) % Math.max(1, pitches.length); i++) {
            pitches.sort((a, b) => a - b);
            pitches.push(pitches.shift() + 12);
        }
        pitches.sort((a, b) => a - b);
        const unique = Array.from(new Set(pitches)).filter(p => p >= 0 && p <= Config.maxPitch);
        while (unique.length > Config.maxChordSize) unique.pop();
        return unique;
    }
    function chordName(info, slot) {
        const minorish = (() => {
            const root = degreePitch(info, slot.deg | 0), third = degreePitch(info, (slot.deg | 0) + 2);
            return ((third - root) % 12 + 12) % 12 == 3;
        })();
        const base = DEGREES[(slot.deg | 0) % 7];
        const name = minorish ? base.toLowerCase() : base;
        const suffix = [" ", "7", "sus2", "sus4", "add9", "6", "5"][slot.type | 0] || "";
        return name + suffix.trim();
    }
    // Rhythm patterns: [startBeat, lengthBeats] within a 4-beat bar (tiled for other meters).
    const CHORD_PATTERNS = [
        [[0, 4]],
        [[0, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5]],
        [[0, 1.5], [1.5, 1], [2.5, 0.5], [3, 1]],
        [[0, 1.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]],
        [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    ];
    function patternHits(pattern, beatsPerBar) {
        const hits = [];
        for (let offset = 0; offset < beatsPerBar; offset += 4) {
            for (const [start, length] of pattern) {
                const s = offset + start;
                if (s >= beatsPerBar) continue;
                hits.push([s, Math.min(length, beatsPerBar - s)]);
            }
        }
        return hits;
    }
    function notesFromHits(hits, pitchesFor) {
        const ppb = Config.partsPerBeat;
        return hits.map(([start, length], i) => ({ start: Math.round(start * ppb), end: Math.max(Math.round(start * ppb) + 1, Math.round((start + length) * ppb)), pitches: pitchesFor(i, start), size: Config.noteSizeMax }));
    }

    // ------------------------------------------------------------ generators
    function melodyBars(song, p) {
        const info = scaleInfo(song);
        const m = p.melody;
        const barCount = m.bars;
        const steps = GRID_STEPS[m.grid] * song.beatsPerBar;
        const total = steps * barCount;
        const ppb = Config.partsPerBeat;
        const stepParts = ppb / GRID_STEPS[m.grid];
        const per = MELODY_COLUMNS / total;
        const values = [];
        for (let s = 0; s < total; s++) {
            const from = Math.floor(s * per), to = Math.max(from + 1, Math.floor((s + 1) * per));
            let sum = 0, count = 0;
            for (let c = from; c < to && c < MELODY_COLUMNS; c++) if (m.curve[c] != null) { sum += m.curve[c]; count++; }
            values.push(count / (to - from) >= 0.3 ? sum / count : null);
        }
        // optional smoothing of the raw values before they are snapped
        for (let pass = 0; pass < (m.smooth | 0); pass++) {
            const copy = values.slice();
            for (let i = 1; i < total - 1; i++) if (copy[i] != null && copy[i - 1] != null && copy[i + 1] != null) values[i] = (copy[i - 1] + copy[i] * 2 + copy[i + 1]) / 4;
        }
        const pitches = values.map(v => v == null ? null : clampPitch(snap(song, info, v, !m.snap)));
        const bars = [];
        for (let b = 0; b < barCount; b++) bars.push([]);
        let i = 0;
        while (i < total) {
            if (pitches[i] == null) { i++; continue; }
            let j = i + 1;
            if (m.legato) while (j < total && pitches[j] == pitches[i] && Math.floor(j / steps) == Math.floor(i / steps)) j++;
            const bar = Math.floor(i / steps);
            const startPart = (i - bar * steps) * stepParts;
            const endPart = Math.min(song.beatsPerBar * ppb, (j - bar * steps) * stepParts);
            bars[bar].push({ start: Math.round(startPart), end: Math.round(endPart), pitches: [pitches[i]], size: Config.noteSizeMax });
            i = j;
        }
        return bars;
    }
    function progression(p) {
        return p.prog.slice(0, p.progLength);
    }
    function chordBars(song, p) {
        const info = scaleInfo(song);
        const rootBase = 12 * p.octave;
        const hits = patternHits(CHORD_PATTERNS[p.rhythm | 0] || CHORD_PATTERNS[0], song.beatsPerBar);
        return progression(p).map(slot => {
            const pitches = chordPitches(info, slot, rootBase, p.voicing | 0);
            return notesFromHits(hits, () => pitches);
        });
    }
    function bassBars(song, p) {
        const info = scaleInfo(song);
        const bassBase = 12 * p.bass.octave;
        const ppb = Config.partsPerBeat, beats = song.beatsPerBar;
        const slots = progression(p);
        return slots.map((slot, index) => {
            const root = bassBase + degreePitch(info, slot.deg | 0);
            const third = bassBase + degreePitch(info, (slot.deg | 0) + 2), fifth = bassBase + degreePitch(info, (slot.deg | 0) + 4), sixth = bassBase + degreePitch(info, (slot.deg | 0) + 5);
            const next = slots[(index + 1) % slots.length];
            const approach = bassBase + degreePitch(info, (next.deg | 0)) - (((degreePitch(info, (next.deg | 0)) - degreePitch(info, (slot.deg | 0))) % 12 + 12) % 12 > 6 ? 0 : 0) - 1;
            const eighth = [];
            for (let b = 0; b < beats * 2; b++) eighth.push([b / 2, 0.5]);
            const quarter = [];
            for (let b = 0; b < beats; b++) quarter.push([b, 1]);
            let hits, pick;
            switch (p.bass.pattern | 0) {
                case 0: hits = [[0, beats]]; pick = () => [root]; break;
                case 1: hits = eighth; pick = () => [root]; break;
                case 2: hits = eighth; pick = (i) => [(i % 2) ? root + 12 : root]; break;
                case 3: hits = quarter; pick = (i) => [(i % 4 == 1 || i % 4 == 3) ? fifth : root]; break;
                case 4: hits = quarter; pick = (i) => [[root, third, fifth, i % 8 == 3 ? approach : sixth][i % 4]]; break;
                case 5: hits = patternHits([[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5]], beats); pick = () => [root]; break;
                default: hits = patternHits([[0, 1.5], [1.5, 1], [3, 1]], beats); pick = (i) => [i % 3 == 1 ? root + 12 : root]; break;
            }
            return notesFromHits(hits, (i) => pick(i).map(x => Math.max(0, Math.min(Config.maxPitch, x))));
        });
    }
    function arpBars(song, p) {
        const info = scaleInfo(song);
        const rootBase = 12 * p.octave;
        const stepsPerBeat = [2, 4, 8][p.arp.rate | 0] || 4;
        const ppb = Config.partsPerBeat;
        const stepParts = ppb / stepsPerBeat;
        const stepCount = song.beatsPerBar * stepsPerBeat;
        const rand = CarrotDSP.rng(p.arp.seed >>> 0);
        return progression(p).map(slot => {
            let base = chordPitches(info, slot, rootBase, p.voicing | 0);
            let list = [];
            for (let o = 0; o < (p.arp.octaves | 0) + 1; o++) for (const x of base) list.push(x + 12 * o);
            list = list.filter(x => x <= Config.maxPitch).sort((a, b) => a - b);
            let order;
            const n = list.length;
            switch (p.arp.pattern | 0) {
                case 0: order = list.slice(); break;
                case 1: order = list.slice().reverse(); break;
                case 2: order = list.concat(list.slice(1, -1).reverse()); break;
                case 3: order = list.slice().reverse().concat(list.slice(1, -1)); break;
                case 4: order = null; break;
                case 5: { order = []; for (let i = 0, j = n - 1; i <= j; i++, j--) { order.push(list[i]); if (i != j) order.push(list[j]); } break; }
                default: { order = []; for (let i = 1; i < n; i++) order.push(list[0], list[i]); if (n == 1) order.push(list[0]); }
            }
            const notes = [];
            for (let s = 0; s < stepCount; s++) {
                const pitch = order ? order[s % order.length] : list[Math.floor(rand() * n)];
                const start = Math.round(s * stepParts);
                const length = Math.max(1, Math.round(stepParts * p.arp.gate));
                notes.push({ start, end: Math.min(start + length, song.beatsPerBar * ppb), pitches: [pitch], size: Config.noteSizeMax });
            }
            return notes;
        });
    }

    // ---------------------------------------------------------------- player
    class Player {
        constructor(host) {
            this.host = host;
            this.timers = [];
            this.playing = false;
            this.held = new Set();
            this.onTick = null;
        }
        play(bars, onEnd) {
            this.stop();
            const host = this.host, song = host.song, doc = host.doc;
            const synth = doc.synth;
            synth.liveInputChannel = doc.channel;
            synth.liveInputInstruments = [doc.getCurrentInstrument()];
            const partSeconds = 60 / song.tempo / Config.partsPerBeat;
            const barParts = song.beatsPerBar * Config.partsPerBeat;
            this.playing = true;
            this.startedAt = performance.now();
            this.totalMs = bars.length * barParts * partSeconds * 1000;
            bars.forEach((notes, b) => {
                for (const n of notes) {
                    const on = (b * barParts + n.start) * partSeconds * 1000;
                    const off = (b * barParts + n.end) * partSeconds * 1000;
                    this.timers.push(setTimeout(() => { for (const x of n.pitches) { this.held.add(x); host.noteOn(x); } }, on));
                    this.timers.push(setTimeout(() => { for (const x of n.pitches) { host.noteOff(x); this.held.delete(x); } }, Math.max(on + 20, off - 8)));
                }
            });
            this.timers.push(setTimeout(() => { this.stop(); if (onEnd) onEnd(); }, this.totalMs + 80));
            const tick = () => { if (this.playing && this.onTick) { this.onTick((performance.now() - this.startedAt) / this.totalMs); requestAnimationFrame(tick); } };
            requestAnimationFrame(tick);
        }
        stop() {
            for (const t of this.timers) clearTimeout(t);
            this.timers = [];
            for (const x of this.held) this.host.noteOff(x);
            this.held.clear();
            const was = this.playing;
            this.playing = false;
            if (was && this.onTick) this.onTick(-1);
        }
    }

    // -------------------------------------------------------------- writing
    function writeBars(host, p, bars, label) {
        const doc = host.doc;
        let channel = doc.channel;
        if (p.target == 1 || doc.song.getChannelIsNoise(channel)) {
            const added = carrotNewChannel(doc, false);
            if (!added) { flToast("No room for another channel."); return; }
            doc.record(added.group);
            channel = added.index;
            carrotNameChannel(doc, channel, label);
        }
        const startBar = Math.max(0, Math.min(Config.barCountMax - 1, (p.startBar | 0) > 0 ? (p.startBar | 0) - 1 : doc.bar));
        const wrote = host.writeNotes(bars, { channel, startBar, replace: true, freshPatterns: true });
        flToast(wrote ? "Wrote " + label.toLowerCase() + " into bars " + (startBar + 1) + "-" + (startBar + bars.length) + " (Ctrl+Z undoes it)" : "Nothing to write yet.");
    }

    // -------------------------------------------------------------------- UI
    function defaults() {
        return {
            melody: { bars: 2, grid: 1, low: 36, rows: 24, legato: true, snap: true, smooth: 1, curve: new Array(MELODY_COLUMNS).fill(null) },
            prog: PROGRESSIONS[0][1].concat([0, 4, 5, 3]).slice(0, SLOTS).map((deg) => ({ deg, type: 0, inv: 0 })),
            progLength: 4,
            octave: 3,
            rhythm: 2,
            voicing: 0,
            bass: { pattern: 3, octave: 2 },
            arp: { pattern: 0, rate: 1, octaves: 1, gate: 0.8, seed: 7 },
            target: 0,
            startBar: 0,
        };
    }
    function fill(p) {
        const d = defaults();
        for (const key of Object.keys(d)) {
            if (p[key] === undefined) p[key] = d[key];
            else if (d[key] && typeof d[key] == "object" && !Array.isArray(d[key])) for (const k2 of Object.keys(d[key])) if (p[key][k2] === undefined) p[key][k2] = d[key][k2];
        }
        if (!Array.isArray(p.melody.curve) || p.melody.curve.length != MELODY_COLUMNS) p.melody.curve = new Array(MELODY_COLUMNS).fill(null);
        while (p.prog.length < SLOTS) p.prog.push({ deg: 0, type: 0, inv: 0 });
        return p;
    }
    function open(host) {
        const getP = () => fill(host.params());
        const player = new Player(host);
        host._sketchPlayer = player;
        const root = HTML.div();
        const redraws = [];
        const startBarInput = HTML.input({ type: "number", min: "0", max: String(Config.barCountMax), value: "0", style: "width: 54px; height: 22px;", title: "0 = the bar you have selected" });
        startBarInput.addEventListener("keydown", (e) => e.stopPropagation());
        startBarInput.addEventListener("input", () => { getP().startBar = +startBarInput.value | 0; });
        const targetSelect = CarrotUI.select({ label: "Write into", options: ["Current channel", "A new channel"], value: getP().target, onChange: (v) => { getP().target = v; } });
        const top = HTML.div({ class: "cb-sketch-bar" }, targetSelect, HTML.label({ class: "cb-field" }, "Starting bar", startBarInput), CarrotUI.hint("Previews play on the current instrument. Drum channels get a new pitched channel automatically."));

        const playButton = (label, getBars, onDone) => {
            const button = CarrotUI.button(label, () => {
                if (player.playing) { player.stop(); button.textContent = label; return; }
                const bars = getBars();
                if (!bars.some(b => b.length > 0)) { host.toast("Nothing to play yet."); return; }
                button.textContent = "Stop";
                player.play(bars, () => { button.textContent = label; });
            });
            return button;
        };
        const insertButton = (label, getBars, name) => CarrotUI.button(label, () => writeBars(host, getP(), getBars(), name), { primary: true, title: "Write this into the song's patterns" });

        // ------------------------------------------------------- melody tab
        const draw = HTML.canvas({ class: "cb-canvas cb-sketch-draw", title: "Draw a melody. Right-drag (or Alt-drag) erases. Lift the pen for rests." });
        let playhead = -1;
        player.onTick = (t) => { playhead = t; drawMelody(); };
        const geometry = () => {
            const rect = draw.getBoundingClientRect();
            const m = getP().melody;
            const labelW = 38;
            return { rect, m, labelW, w: rect.width - labelW, h: rect.height, rowH: rect.height / m.rows };
        };
        const drawMelody = () => {
            const { ctx, w: totalW, h } = CarrotUI.ctx(draw);
            const p = getP(), m = p.melody, song = host.song, info = scaleInfo(song);
            const labelW = 38, w = totalW - labelW, rowH = h / m.rows;
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, totalW, h);
            for (let r = 0; r < m.rows; r++) {
                const pitch = m.low + m.rows - 1 - r;
                const pc = ((pitch % 12) + 12) % 12;
                const y = r * rowH;
                ctx.fillStyle = pc == 0 ? "rgba(255,155,33,0.20)" : info.flags[pc] ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.25)";
                ctx.fillRect(labelW, y, w, rowH);
                ctx.fillStyle = info.flags[pc] ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)";
                ctx.font = "9px sans-serif";
                ctx.textBaseline = "middle";
                ctx.textAlign = "right";
                if (info.flags[pc]) ctx.fillText(flMidiName(Config.keys[song.key].basePitch + pitch), labelW - 4, y + rowH / 2);
            }
            const steps = song.beatsPerBar * m.bars;
            for (let b = 0; b <= steps; b++) {
                ctx.fillStyle = b % song.beatsPerBar == 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.1)";
                ctx.fillRect(Math.round(labelW + b / steps * w), 0, 1, h);
            }
            // quantized result
            const bars = melodyBars(song, p);
            const barParts = song.beatsPerBar * Config.partsPerBeat;
            const color = getComputedStyle(draw).getPropertyValue("--cb-plugin-color").trim() || "#c792ea";
            bars.forEach((notes, bi) => {
                for (const n of notes) {
                    const x0 = labelW + (bi * barParts + n.start) / (barParts * m.bars) * w, x1 = labelW + (bi * barParts + n.end) / (barParts * m.bars) * w;
                    const row = m.low + m.rows - 1 - n.pitches[0];
                    if (row < 0 || n.pitches[0] < m.low || n.pitches[0] >= m.low + m.rows) continue;
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.85;
                    ctx.fillRect(x0 + 1, row * rowH + 1, Math.max(2, x1 - x0 - 2), Math.max(2, rowH - 2));
                    ctx.globalAlpha = 1;
                }
            });
            // raw curve
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            let pen = false;
            for (let c = 0; c < MELODY_COLUMNS; c++) {
                const v = m.curve[c];
                if (v == null) { pen = false; continue; }
                const x = labelW + (c + 0.5) / MELODY_COLUMNS * w, y = (m.rows - 1 - (v - m.low) + 0.5) * rowH;
                if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
            if (playhead >= 0) { ctx.fillStyle = "#fff"; ctx.fillRect(labelW + playhead * w, 0, 2, h); }
        };
        redraws.push(drawMelody);
        let lastColumn = -1, lastValue = null, erasing = false, drawing = false;
        const sample = (event) => {
            const g = geometry();
            const x = Math.max(0, Math.min(g.w - 1, event.clientX - g.rect.left - g.labelW));
            const y = Math.max(0, Math.min(g.h - 1, event.clientY - g.rect.top));
            return { column: Math.floor(x / g.w * MELODY_COLUMNS), value: g.m.low + g.m.rows - 1 - (y / g.rowH - 0.5) };
        };
        const paint = (event) => {
            const m = getP().melody;
            const s = sample(event);
            if (erasing) {
                const from = Math.min(lastColumn < 0 ? s.column : lastColumn, s.column), to = Math.max(lastColumn < 0 ? s.column : lastColumn, s.column);
                for (let c = from - 1; c <= to + 1; c++) if (c >= 0 && c < MELODY_COLUMNS) m.curve[c] = null;
            }
            else if (lastColumn >= 0 && Math.abs(s.column - lastColumn) > 1) {
                const step = s.column > lastColumn ? 1 : -1;
                for (let c = lastColumn; c != s.column + step; c += step) m.curve[c] = lastValue + (s.value - lastValue) * ((c - lastColumn) / (s.column - lastColumn));
            }
            else m.curve[s.column] = s.value;
            lastColumn = s.column;
            lastValue = s.value;
            drawMelody();
        };
        draw.addEventListener("contextmenu", (e) => e.preventDefault());
        draw.addEventListener("pointerdown", (event) => {
            drawing = true;
            erasing = event.button == 2 || event.altKey;
            lastColumn = -1;
            draw.setPointerCapture(event.pointerId);
            event.preventDefault();
            paint(event);
        });
        draw.addEventListener("pointermove", (event) => { if (drawing) paint(event); });
        const endDraw = () => {
            drawing = false;
            lastColumn = -1;
        };
        draw.addEventListener("pointerup", endDraw);
        draw.addEventListener("pointercancel", endDraw);
        const melodyControls = CarrotUI.row(
            CarrotUI.select({ label: "Length", options: ["1 bar", "2 bars", "4 bars"], value: [1, 2, 4].indexOf(getP().melody.bars), onChange: (i) => { getP().melody.bars = [1, 2, 4][i]; drawMelody(); } }),
            CarrotUI.select({ label: "Note grid", options: GRIDS, value: getP().melody.grid, onChange: (i) => { getP().melody.grid = i; drawMelody(); } }),
            CarrotUI.select({ label: "Smoothing", options: ["None", "Light", "Medium", "Heavy"], value: getP().melody.smooth, onChange: (i) => { getP().melody.smooth = i; drawMelody(); } }),
            CarrotUI.toggle({ label: "Snap to scale", value: getP().melody.snap, title: "Off lets any semitone through", onChange: (v) => { getP().melody.snap = v; drawMelody(); } }),
            CarrotUI.toggle({ label: "Join repeated notes", value: getP().melody.legato, onChange: (v) => { getP().melody.legato = v; drawMelody(); } }),
            CarrotUI.button("Octave up", () => { const m = getP().melody; m.low = Math.min(Config.maxPitch - m.rows, m.low + 12); drawMelody(); }),
            CarrotUI.button("Octave down", () => { const m = getP().melody; m.low = Math.max(0, m.low - 12); drawMelody(); }));
        const melodyActions = CarrotUI.row(
            playButton("Play", () => melodyBars(host.song, getP())),
            insertButton("Insert melody", () => melodyBars(host.song, getP()), "Melody"),
            CarrotUI.button("Clear", () => { getP().melody.curve.fill(null); drawMelody(); }),
            CarrotUI.button("Random doodle", () => {
                const m = getP().melody;
                const rand = Math.random;
                const mid = m.low + m.rows / 2;
                let v = mid + (rand() - 0.5) * 6, phase = rand() * 6, speed = 0.05 + rand() * 0.12;
                for (let c = 0; c < MELODY_COLUMNS; c++) {
                    v += (rand() - 0.5) * 0.9 + Math.sin(phase + c * speed) * 0.35 - (v - mid) * 0.03;
                    m.curve[c] = Math.max(m.low + 1, Math.min(m.low + m.rows - 2, v));
                    if (rand() < 0.012) { for (let k = 0; k < 6 && c + k < MELODY_COLUMNS; k++) m.curve[c + k] = null; c += 6; }
                }
                drawMelody();
            }),
            CarrotUI.button("Flip upside down", () => { const m = getP().melody; const mid = m.low + (m.rows - 1) / 2; m.curve = m.curve.map(v => v == null ? null : 2 * mid - v); drawMelody(); }),
            CarrotUI.button("Reverse", () => { const m = getP().melody; m.curve = m.curve.slice().reverse(); drawMelody(); }));
        const melodyTab = HTML.div(CarrotUI.section("Draw a melody", draw, melodyControls), melodyActions, CarrotUI.hint("White line = what you draw, colored blocks = the notes it becomes. Gaps (where you lift the pen) turn into rests."));

        // ------------------------------------------------------- chords tab
        const slotEls = [];
        const progGrid = HTML.div({ class: "cb-sketch-prog" });
        const refreshProg = () => {
            const p = getP(), info = scaleInfo(host.song);
            slotEls.forEach((el, i) => {
                el.root.classList.toggle("cb-off", i >= p.progLength);
                el.deg.menu.selectedIndex = p.prog[i].deg % 7;
                el.type.menu.selectedIndex = p.prog[i].type | 0;
                el.inv.menu.selectedIndex = p.prog[i].inv | 0;
                el.name.textContent = chordName(info, p.prog[i]);
            });
        };
        for (let i = 0; i < SLOTS; i++) {
            const deg = CarrotUI.select({ options: DEGREES, value: 0, title: "Scale degree", onChange: (v) => { getP().prog[i].deg = v; refreshProg(); } });
            const type = CarrotUI.select({ options: CHORD_TYPES, value: 0, title: "Chord type", onChange: (v) => { getP().prog[i].type = v; refreshProg(); } });
            const inv = CarrotUI.select({ options: ["Root position", "1st inversion", "2nd inversion", "3rd inversion"], value: 0, title: "Inversion", onChange: (v) => { getP().prog[i].inv = v; refreshProg(); } });
            const name = HTML.div({ class: "cb-slot-chord" }, "");
            const audition = CarrotUI.button("Hear", () => {
                const p = getP();
                const info = scaleInfo(host.song);
                const pitches = chordPitches(info, p.prog[i], 12 * p.octave, p.voicing | 0);
                player.play([[{ start: 0, end: Config.partsPerBeat * 2, pitches, size: Config.noteSizeMax }]]);
            });
            const rootEl = HTML.div({ class: "cb-sketch-slot" }, HTML.div({ class: "cb-slot-name" }, "Bar " + (i + 1)), name, deg, type, inv, audition);
            slotEls.push({ root: rootEl, deg, type, inv, name });
            progGrid.appendChild(rootEl);
        }
        const presetSelect = HTML.select({ class: "cb-select" });
        presetSelect.appendChild(HTML.option({ value: "" }, "Progression presets..."));
        PROGRESSIONS.forEach((pr, i) => presetSelect.appendChild(HTML.option({ value: i }, pr[0])));
        presetSelect.addEventListener("keydown", (e) => e.stopPropagation());
        presetSelect.addEventListener("change", () => {
            if (presetSelect.value === "") return;
            const pr = PROGRESSIONS[+presetSelect.value][1];
            const p = getP();
            pr.forEach((deg, i) => { p.prog[i] = { deg, type: 0, inv: 0 }; });
            p.progLength = pr.length;
            presetSelect.selectedIndex = 0;
            lengthSelect.menu.selectedIndex = p.progLength - 1;
            refreshProg(); drawPreview();
        });
        const lengthSelect = CarrotUI.select({ label: "Bars", options: ["1", "2", "3", "4", "5", "6", "7", "8"], value: getP().progLength - 1, onChange: (i) => { getP().progLength = i + 1; refreshProg(); drawPreview(); } });
        const rhythmSelect = CarrotUI.select({ label: "Rhythm", options: CHORD_RHYTHMS, value: getP().rhythm, onChange: (i) => { getP().rhythm = i; drawPreview(); } });
        const voicingSelect = CarrotUI.select({ label: "Voicing", options: VOICINGS, value: getP().voicing, onChange: (i) => { getP().voicing = i; drawPreview(); } });
        const octaveSelect = CarrotUI.select({ label: "Octave", options: ["1", "2", "3", "4"], value: getP().octave - 1, onChange: (i) => { getP().octave = i + 1; drawPreview(); } });
        const preview = HTML.canvas({ class: "cb-canvas cb-sketch-preview" });
        // little piano-roll style preview of whichever tab is showing its notes
        let previewSource = () => chordBars(host.song, getP());
        const drawPreview = () => {
            const { ctx, w, h } = CarrotUI.ctx(preview);
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            const bars = previewSource();
            if (!bars.length) return;
            let lo = 1e9, hi = -1e9;
            for (const bar of bars) for (const n of bar) for (const q of n.pitches) { lo = Math.min(lo, q); hi = Math.max(hi, q); }
            if (lo > hi) return;
            lo -= 1; hi += 1;
            const song = host.song;
            const barParts = song.beatsPerBar * Config.partsPerBeat;
            const rowH = Math.max(3, Math.min(10, (h - 6) / Math.max(4, hi - lo + 1)));
            ctx.strokeStyle = "rgba(255,255,255,0.12)";
            for (let b = 0; b <= bars.length; b++) { ctx.beginPath(); ctx.moveTo(b / bars.length * w + 0.5, 0); ctx.lineTo(b / bars.length * w + 0.5, h); ctx.stroke(); }
            const color = getComputedStyle(preview).getPropertyValue("--cb-plugin-color").trim() || "#c792ea";
            bars.forEach((notes, b) => {
                for (const n of notes) for (const q of n.pitches) {
                    const x = (b * barParts + n.start) / (barParts * bars.length) * w, x2 = (b * barParts + n.end) / (barParts * bars.length) * w;
                    ctx.fillStyle = color;
                    ctx.fillRect(x + 1, h - 3 - (q - lo + 1) * rowH, Math.max(2, x2 - x - 2), Math.max(2, rowH - 1));
                }
            });
        };
        redraws.push(drawPreview);
        const chordsTab = HTML.div(
            CarrotUI.section("Chord progression", CarrotUI.row(presetSelect, lengthSelect, rhythmSelect, voicingSelect, octaveSelect), progGrid),
            CarrotUI.row(playButton("Play chords", () => chordBars(host.song, getP())), insertButton("Insert chords", () => chordBars(host.song, getP()), "Chords")),
            preview);

        // --------------------------------------------------------- bass tab
        const bassTab = HTML.div(
            CarrotUI.section("Bass line (follows the chord progression on the Chords tab)", CarrotUI.row(
                CarrotUI.select({ label: "Pattern", options: BASS_PATTERNS, value: getP().bass.pattern, onChange: (i) => { getP().bass.pattern = i; drawPreview(); } }),
                CarrotUI.select({ label: "Octave", options: ["0", "1", "2", "3"], value: getP().bass.octave, onChange: (i) => { getP().bass.octave = i; drawPreview(); } }))),
            CarrotUI.row(playButton("Play bass", () => bassBars(host.song, getP())), insertButton("Insert bass line", () => bassBars(host.song, getP()), "Bass")));
        // ---------------------------------------------------------- arp tab
        const arpTab = HTML.div(
            CarrotUI.section("Arpeggio (arpeggiates the chord progression)", CarrotUI.row(
                CarrotUI.select({ label: "Pattern", options: ARP_PATTERNS, value: getP().arp.pattern, onChange: (i) => { getP().arp.pattern = i; drawPreview(); } }),
                CarrotUI.select({ label: "Speed", options: ARP_RATES, value: getP().arp.rate, onChange: (i) => { getP().arp.rate = i; drawPreview(); } }),
                CarrotUI.select({ label: "Octaves", options: ["1", "2", "3"], value: getP().arp.octaves, onChange: (i) => { getP().arp.octaves = i; drawPreview(); } }),
                CarrotUI.button("New random order", () => { getP().arp.seed = (Math.random() * 1e6) | 0; drawPreview(); }, { title: "Only matters for the Random pattern" }))),
            CarrotUI.row(playButton("Play arpeggio", () => arpBars(host.song, getP())), insertButton("Insert arpeggio", () => arpBars(host.song, getP()), "Arpeggio")));

        const tabs = CarrotUI.tabs([["Melody", melodyTab], ["Chords", chordsTab], ["Bass", bassTab], ["Arp", arpTab]], (index) => {
            player.stop();
            previewSource = [() => [], () => chordBars(host.song, getP()), () => bassBars(host.song, getP()), () => arpBars(host.song, getP())][index];
            if (index > 0) {
                // the preview strip lives on the chords tab; clone its drawing target to the active tab
                const holder = [null, chordsTab, bassTab, arpTab][index];
                if (preview.parentElement != holder) holder.appendChild(preview);
            }
            setTimeout(() => redraws.forEach(f => f()), 0);
        });
        root.append(top, tabs);
        refreshProg();
        setTimeout(() => redraws.forEach(f => f()), 30);
        host.onRefresh(() => { refreshProg(); redraws.forEach(f => f()); });
        return root;
    }

    B.CarrotPlugins.register({
        id: "sketchpad",
        width: 720,
        defaultParams: defaults,
        open,
        onClose: (host) => { if (host._sketchPlayer) host._sketchPlayer.stop(); },
    });
})();
