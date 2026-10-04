/*
 * Bouncify - makes a lead, bass, chord part (or anything) sound bouncy.
 *
 * It rewrites the notes of the current channel (the current bar, the box
 * selection, the loop or the whole channel) with any mix of:
 *  - staccato (shorter notes = more space and spring)
 *  - swing (late off-beats)
 *  - octave hops (notes jump up or down an octave in a pattern)
 *  - accents (loud on the beat, soft off it)
 *  - scoops (each note bends up into its pitch, like a "boing")
 *  - bouncing-ball echoes (repeats that get faster and quieter)
 *  - chops (long notes become rhythmic repeats)
 *  - pushes (some notes land early, on the off-beat)
 *  - a sidechain-style volume pump on the instrument (Gross Beat)
 *
 * Tool plugin: everything it writes is one undo step.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, Config, FLConfig, flToast } = A;

    A.addStyle(`
.cb-bounce-top { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; }
.cb-bounce-styles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin-bottom: 6px; }
.cb-bounce-styles button.cb-on { background: var(--cb-plugin-color, #ffd166); color: #111; }
.cb-bounce-rolls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.cb-bounce-roll { display: block; width: 100%; height: 120px; }
.cb-bounce-label { font-size: 11px; opacity: 0.75; margin: 2px 0; }
`);

    const PPB = Config.partsPerBeat;
    const STYLES = [
        ["Bouncy", { staccato: 0.55, swing: 0.25, hops: 0.25, accents: 0.6, scoop: 0.35, echoes: 0, chop: 0, push: 0.15, pump: false }],
        ["Hop", { staccato: 0.5, swing: 0, hops: 0.75, accents: 0.5, scoop: 0, echoes: 0, chop: 0.4, push: 0, pump: false }],
        ["Bouncing Ball", { staccato: 0.6, swing: 0, hops: 0, accents: 0.3, scoop: 0, echoes: 0.8, chop: 0, push: 0, pump: false }],
        ["Rubber", { staccato: 0.6, swing: 0.1, hops: 0, accents: 0.4, scoop: 0.9, echoes: 0, chop: 0, push: 0, pump: false }],
        ["Skippy", { staccato: 0.4, swing: 0.6, hops: 0.1, accents: 0.7, scoop: 0.1, echoes: 0.25, chop: 0.2, push: 0.2, pump: false }],
        ["Jersey Bounce", { staccato: 0.5, swing: 0, hops: 0.3, accents: 0.8, scoop: 0, echoes: 0, chop: 0.8, push: 0.5, pump: false }],
        ["Trampoline", { staccato: 0.5, swing: 0.15, hops: 0.6, accents: 0.6, scoop: 0.6, echoes: 0.3, chop: 0, push: 0, pump: false }],
        ["Pump", { staccato: 0.7, swing: 0, hops: 0, accents: 0.5, scoop: 0, echoes: 0, chop: 0.7, push: 0, pump: true }],
    ];
    function defaults() {
        return Object.assign({ style: 0, scope: 0, amount: 1, seed: 1 }, JSON.parse(JSON.stringify(STYLES[0][1])));
    }
    function fill(p) {
        const d = defaults();
        for (const key of Object.keys(d)) if (p[key] === undefined) p[key] = d[key];
        return p;
    }
    function rng(seed) {
        let s = (seed * 2654435761) >>> 0;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }

    // ------------------------------------------------------------ the transform
    // notes: [{ start, end, pitches, pins: [{ time, interval, size }] }] in parts; returns new notes
    function bounce(notes, p, barLength, isNoise, barIndex) {
        const amount = Math.max(0, Math.min(1.5, p.amount));
        const k = (v) => Math.max(0, Math.min(1, v * amount));
        const rand = rng(p.seed * 1000 + barIndex + 1);
        const maxPitch = isNoise ? Config.drumCount - 1 : Config.maxPitch;
        const sizeMax = Config.noteSizeMax;
        const eighth = PPB / 2, sixteenth = PPB / 4;
        let list = notes.map(n => ({ start: n.start, end: n.end, pitches: n.pitches.slice(), size: n.pins.length ? Math.max(...n.pins.map(pin => pin.size)) : sizeMax, bend: 0, scoop: 0 }));
        list.sort((a, b) => a.start - b.start);
        // chop: long notes become repeats on the eighth (or sixteenth for strong chops)
        if (k(p.chop) > 0.01) {
            const step = k(p.chop) > 0.66 ? sixteenth : eighth;
            const chopped = [];
            for (const n of list) {
                if (n.end - n.start >= step * 2) {
                    for (let t = n.start; t < n.end; t += step) chopped.push(Object.assign({}, n, { start: t, end: Math.min(n.end, t + step), pitches: n.pitches.slice() }));
                }
                else chopped.push(n);
            }
            list = chopped;
        }
        // push: some notes on the beat move to the off-beat before it
        if (k(p.push) > 0.01) {
            for (const n of list) {
                if (n.start > 0 && n.start % PPB == 0 && rand() < k(p.push) * 0.6) {
                    const target = n.start - eighth;
                    if (!list.some(o => o != n && o.start < n.start && o.end > target)) { n.end -= (n.start - target); n.start = target; n.end = Math.max(n.start + sixteenth, n.end + eighth); }
                }
            }
        }
        // swing: off-beat eighths and sixteenths come late
        if (k(p.swing) > 0.01) {
            for (const n of list) {
                let delay = 0;
                if (n.start % PPB == eighth) delay = Math.round(k(p.swing) * PPB / 6);
                else if (n.start % eighth == sixteenth) delay = Math.round(k(p.swing) * PPB / 12);
                if (delay) { n.start += delay; n.end = Math.max(n.start + 1, n.end + delay); }
            }
        }
        // staccato
        const gate = 1 - k(p.staccato) * 0.8;
        for (const n of list) {
            const length = n.end - n.start;
            n.end = n.start + Math.max(Math.min(length, 2), Math.round(length * gate));
        }
        // octave hops: every other note (with a little randomness) jumps up or down an octave
        if (!isNoise && k(p.hops) > 0.01) {
            list.forEach((n, i) => {
                if ((i % 2 == 1 && rand() < 0.5 + k(p.hops) * 0.5) || rand() < k(p.hops) * 0.15) {
                    const up = n.pitches.every(x => x + 12 <= maxPitch) && (rand() < 0.7 || n.pitches.some(x => x - 12 < 0));
                    const shift = up ? 12 : -12;
                    if (n.pitches.every(x => x + shift >= 0 && x + shift <= maxPitch)) n.pitches = n.pitches.map(x => x + shift);
                }
            });
        }
        // accents: loud on the beat, softer on off-beats
        for (const n of list) {
            const onBeat = n.start % PPB == 0;
            const onEighth = n.start % eighth == 0;
            const a = k(p.accents);
            const level = onBeat ? 1 : onEighth ? 1 - a * 0.35 : 1 - a * 0.6;
            n.size = Math.max(1, Math.min(sizeMax, Math.round(n.size * level + (onBeat && a > 0.5 ? 0.4 : 0))));
        }
        // scoops: bend up into the note from 1-3 semitones below
        if (!isNoise && k(p.scoop) > 0.01) {
            for (const n of list) {
                const depth = Math.max(1, Math.round(k(p.scoop) * 3));
                if (n.pitches.every(x => x - depth >= 0) && n.end - n.start >= 3) n.scoop = depth;
            }
        }
        // bouncing-ball echoes after short notes, if there is room before the next note
        if (k(p.echoes) > 0.01) {
            const added = [];
            list.forEach((n, i) => {
                const next = list[i + 1];
                const limit = Math.min(barLength, next ? next.start : barLength);
                const room = limit - n.end;
                if (room < 3) return;
                // repeats that come faster and quieter, like a ball settling
                let t = n.end + Math.max(1, Math.round(room * 0.22));
                let length = Math.max(1, Math.round(room * 0.24));
                let size = n.size;
                const count = Math.round(1 + k(p.echoes) * 3);
                for (let e = 0; e < count; e++) {
                    if (t + length > limit) break;
                    size = Math.max(1, size - 1);
                    added.push({ start: t, end: t + length, pitches: n.pitches.slice(), size, bend: 0, scoop: 0 });
                    t += length + Math.max(1, Math.round(length * 0.5));
                    length = Math.max(1, Math.round(length * 0.65));
                }
            });
            list = list.concat(added);
        }
        // clean up: inside the bar, no zero lengths, sorted
        const out = [];
        for (const n of list) {
            n.start = Math.max(0, Math.min(barLength - 1, Math.round(n.start)));
            n.end = Math.max(n.start + 1, Math.min(barLength, Math.round(n.end)));
            out.push(n);
        }
        out.sort((a, b) => a.start - b.start || a.pitches[0] - b.pitches[0]);
        return out;
    }
    function toNote(n, isNoise) {
        const note = new A.Note(n.pitches[0], n.start, n.end, n.size, isNoise);
        note.pitches = Array.from(new Set(n.pitches)).sort((a, b) => a - b).slice(0, Config.maxChordSize);
        const length = n.end - n.start;
        if (n.scoop) {
            const reach = Math.max(1, Math.min(length - 1, Math.round(PPB / 8)));
            note.pins = [{ interval: -n.scoop, time: 0, size: n.size }, { interval: 0, time: reach, size: n.size }, { interval: 0, time: length, size: n.size }];
            // BeepBox stores the pitch at the first pin, so shift the pitches down and bend up
            note.pitches = note.pitches.map(x => x - n.scoop);
            note.pins = note.pins.map(pin => ({ interval: pin.interval + n.scoop, time: pin.time, size: pin.size }));
        }
        else {
            note.pins = [{ interval: 0, time: 0, size: n.size }, { interval: 0, time: length, size: Math.max(1, n.size - (length > PPB ? 1 : 0)) }];
        }
        return note;
    }
    function scopeBars(host, scope) {
        const doc = host.doc, song = doc.song;
        if (scope == 1 && doc.selection.boxSelectionActive) {
            const first = doc.selection.boxSelectionBar;
            return Array.from({ length: doc.selection.boxSelectionWidth }, (_, i) => first + i).filter(b => b < song.barCount);
        }
        if (scope == 2) return Array.from({ length: song.loopLength }, (_, i) => song.loopStart + i).filter(b => b < song.barCount);
        if (scope == 3) return Array.from({ length: song.barCount }, (_, i) => i);
        return [doc.bar];
    }
    function apply(host, p) {
        const doc = host.doc, song = doc.song;
        const channel = doc.channel;
        const isNoise = song.getChannelIsNoise(channel);
        const bars = scopeBars(host, p.scope).filter(b => song.channels[channel].bars[b] != 0);
        if (bars.length == 0) { flToast("There are no notes to bouncify here. Pick a bar with notes, or another scope."); return; }
        const barLength = song.beatsPerBar * PPB;
        const group = new A.ChangeGroup();
        const done = new Map(); // pattern index -> new notes (bars sharing a pattern change together)
        let changed = 0;
        for (const bar of bars) {
            const patternIndex = song.channels[channel].bars[bar];
            const pattern = song.getPattern(channel, bar);
            if (!pattern || pattern.notes.length == 0 || done.has(patternIndex)) continue;
            const result = bounce(pattern.notes, p, barLength, isNoise, bar).map(n => toNote(n, isNoise));
            done.set(patternIndex, result);
            changed++;
        }
        group.append(new A.ChangeFL(doc, () => {
            for (const [patternIndex, notes] of done) song.channels[channel].patterns[patternIndex - 1].notes = notes;
            if (p.pump) {
                for (const instrument of song.channels[channel].instruments) {
                    instrument.fl.fx |= FLConfig.fxGross;
                    instrument.fl.gross.volume = 5;
                    instrument.fl.gross.time = 0;
                    instrument.fl.gross.length = 0;
                    instrument.fl.gross.mix = Math.round(60 + 40 * Math.min(1, p.amount));
                    instrument.preset = instrument.type;
                }
            }
        }, false));
        doc.record(group);
        flToast("Bouncified " + changed + " pattern" + (changed == 1 ? "" : "s") + (p.pump ? " and added a sidechain pump" : "") + ". Z undoes it.");
    }

    // ------------------------------------------------------------ UI
    function drawRoll(canvas, notes, barLength, isNoise, color) {
        const ctx = canvas.getContext("2d");
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, 0, w, h);
        const beats = barLength / PPB;
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        for (let b = 1; b < beats; b++) { ctx.beginPath(); ctx.moveTo(b / beats * w, 0); ctx.lineTo(b / beats * w, h); ctx.stroke(); }
        if (!notes.length) { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "11px sans-serif"; ctx.fillText("no notes in this bar", 8, 18); return; }
        let lo = Infinity, hi = -Infinity;
        for (const n of notes) for (const x of n.pitches) { lo = Math.min(lo, x); hi = Math.max(hi, x + (n.scoop || 0)); }
        lo -= 2; hi += 2;
        const y = (pitch) => h - 6 - (pitch - lo) / Math.max(1, hi - lo) * (h - 12);
        for (const n of notes) {
            const x0 = n.start / barLength * w, x1 = n.end / barLength * w;
            ctx.globalAlpha = 0.35 + 0.65 * (n.size / Config.noteSizeMax);
            ctx.fillStyle = color;
            for (const pitch of n.pitches) {
                const yy = y(pitch);
                ctx.fillRect(x0, yy - 3, Math.max(2, x1 - x0 - 1), 6);
                if (n.scoop) { ctx.fillRect(x0 - 1, yy, 2, (y(pitch - n.scoop) - yy)); }
            }
        }
        ctx.globalAlpha = 1;
    }
    function open(host) {
        const getP = () => fill(host.params());
        const root = HTML.div();
        const styleButtons = STYLES.map(([name], i) => {
            const button = CarrotUI.button(name, () => {
                const p = getP();
                Object.assign(p, JSON.parse(JSON.stringify(STYLES[i][1])), { style: i });
                host.refresh();
                refresh();
            });
            return button;
        });
        const scope = CarrotUI.select({ label: "Bouncify", options: ["Current bar", "Selected bars", "Loop region", "Whole channel"], value: getP().scope, onChange: (v) => { getP().scope = v; refresh(); } });
        const amountKnob = host.knob("amount", { label: "Amount", min: 0, max: 1.5, def: 1, format: v => Math.round(v * 100) + "%", onInput: () => refresh() });
        const pct = v => Math.round(v * 100) + "%";
        const knob = (key, label, title) => host.knob(key, { label, min: 0, max: 1, def: defaults()[key], format: pct, title, onInput: () => refresh() });
        const pumpToggle = host.toggle("pump", { label: "Sidechain pump", def: false, title: "Adds a Gross Beat volume pump to this channel's instrument", onChange: () => refresh() });
        const before = HTML.canvas({ class: "cb-bounce-roll" });
        const after = HTML.canvas({ class: "cb-bounce-roll" });
        const info = HTML.div({ class: "cb-hint" });
        const applyButton = CarrotUI.button("Bouncify!", () => { apply(host, getP()); refresh(); }, { primary: true, title: "Rewrite the notes (one undo step)" });
        const playButton = CarrotUI.button("Play from this bar", () => {
            const doc = host.doc;
            const bars = scopeBars(host, getP().scope);
            doc.synth.goToBar(bars[0] || doc.bar);
            doc.synth.snapToBar();
            doc.performance.play();
        }, { title: "Start playback at the first bar in the scope (Space stops)" });
        const shuffle = CarrotUI.button("New variation", () => { getP().seed = (getP().seed % 997) + 1; refresh(); }, { title: "Different random choices for hops and pushes" });
        root.append(
            HTML.div({ class: "cb-bounce-top" }, scope, applyButton, playButton, shuffle),
            HTML.div({ class: "cb-bounce-styles" }, ...styleButtons),
            CarrotUI.section("Bounce", CarrotUI.row(amountKnob, knob("staccato", "Staccato", "Shorter notes"), knob("swing", "Swing", "Late off-beats"),
                knob("hops", "Octave hops", "Notes jump an octave in a pattern"), knob("accents", "Accents", "Loud on the beat, soft off it"),
                knob("scoop", "Scoop", "Bend up into each note"), knob("echoes", "Echoes", "Bouncing-ball repeats after short notes"),
                knob("chop", "Chop", "Long notes become rhythmic repeats"), knob("push", "Push", "Some notes land early, on the off-beat"), pumpToggle)),
            CarrotUI.section("Preview (current bar)", HTML.div({ class: "cb-bounce-rolls" },
                HTML.div(HTML.div({ class: "cb-bounce-label" }, "Before"), before), HTML.div(HTML.div({ class: "cb-bounce-label" }, "After"), after)), info),
            CarrotUI.hint("Works on the current channel. Drums get accents, swing, chops, pushes and echoes; pitched parts also get hops and scoops. Undo (Z) puts everything back."));
        function refresh() {
            const p = getP();
            styleButtons.forEach((b, i) => b.classList.toggle("cb-on", i == p.style));
            const doc = host.doc, song = doc.song;
            const isNoise = song.getChannelIsNoise(doc.channel);
            const barLength = song.beatsPerBar * PPB;
            const pattern = song.getPattern(doc.channel, doc.bar);
            const notes = pattern ? pattern.notes : [];
            const original = notes.map(n => ({ start: n.start, end: n.end, pitches: n.pitches.slice(), size: Math.max(...n.pins.map(pin => pin.size)), scoop: 0 }));
            const color = "#ffd166";
            requestAnimationFrame(() => {
                drawRoll(before, original, barLength, isNoise, "#8fb8ff");
                drawRoll(after, bounce(notes, p, barLength, isNoise, doc.bar), barLength, isNoise, color);
            });
            const bars = scopeBars(host, p.scope).filter(b => song.channels[doc.channel].bars[b] != 0);
            info.textContent = "Channel " + (doc.channel + 1) + (song.channels[doc.channel].name ? " (" + song.channels[doc.channel].name + ")" : "") + ", " + bars.length + " bar" + (bars.length == 1 ? "" : "s") + " with notes in the scope.";
        }
        host.onRefresh(() => refresh());
        setTimeout(refresh, 30);
        return root;
    }

    B.CarrotPlugins.register({
        id: "bouncify",
        width: 640,
        defaultParams: defaults,
        open,
        bounce, // exposed for tests
    });
})();
