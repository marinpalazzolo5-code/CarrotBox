/*
 * Live Loops - a 16 x 16 loop launcher for CarrotBox (in the spirit of
 * GarageBand's Live Loops).
 *
 *  - 1,248 loops in 24 genres, composed at the song's tempo, key and mode
 *  - 16 tracks (rows) x 16 scenes (columns); one cell per row plays at a time
 *  - launches are quantized to the next bar (or 2 / 4 bars) and follow the
 *    song's bar grid while the song plays
 *  - scene buttons launch a whole column, templates fill the grid per genre
 *  - Record captures what you launch and writes it into the song as
 *    channels with Slicex instruments (one slice per bar of each loop)
 *
 * Tool plugin: the grid is kept in this browser; recordings go into the song.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, Config, FLConfig, FLLoops, FLSampleBank, flToast } = A;

    const ROWS = 16, COLS = 16;
    const STORE_KEY = "carrotLiveLoops";
    const QUANTIZE = [["Next bar", 1], ["Next 2 bars", 2], ["Next 4 bars", 4]];
    const SCENE_SHAPES = [
        ["Intro", ["pad", "fx", "keys"]],
        ["Groove", ["drums", "tops", "bass", "chords"]],
        ["Verse", ["drums", "perc", "bass", "keys", "melody"]],
        ["Build", ["tops", "perc", "chords", "arp", "fx"]],
        ["Drop", ["drums", "tops", "perc", "bass", "chords", "melody", "arp", "vox"]],
        ["Break", ["pad", "keys", "vox"]],
        ["Groove 2", ["drums", "bass", "chords", "arp", "perc"]],
        ["Outro", ["drums", "pad", "fx"]],
    ];
    const TEMPLATE_ROWS = ["drums", "tops", "perc", "bass", "chords", "keys", "melody", "arp", "pad", "fx", "vox"];

    A.addStyle(`
.cb-ll { display: flex; flex-direction: column; gap: 6px; }
.cb-ll-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cb-ll-bar .cb-ll-info { font-size: 12px; opacity: 0.85; margin-left: auto; }
.cb-ll-main { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 8px; min-height: 0; }
.cb-ll-gridwrap { overflow: auto; max-height: 62vh; border-radius: 6px; background: rgba(0,0,0,0.18); padding: 4px; }
.cb-ll-grid { display: grid; grid-template-columns: 150px repeat(${COLS}, 30px); grid-auto-rows: 30px; gap: 4px; width: max-content; }
.cb-ll-scene { border: none; border-radius: 4px; font-size: 10px; cursor: pointer; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); padding: 0; }
.cb-ll-scene:hover { background: var(--ui-widget-focus, #555); }
.cb-ll-scene.cb-live { background: #2ecc71; color: #000; }
.cb-ll-corner { font-size: 10px; opacity: 0.7; display: flex; align-items: center; padding-left: 4px; }
.cb-ll-head { display: flex; align-items: center; gap: 3px; font-size: 11px; min-width: 0; background: var(--ui-widget-background, #333); border-radius: 4px; padding: 0 3px; }
.cb-ll-head .cb-ll-swatch { width: 4px; align-self: stretch; border-radius: 2px; margin: 3px 0; }
.cb-ll-head .cb-ll-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; }
.cb-ll-head button { border: none; background: transparent; color: var(--secondary-text, #aaa); font-size: 10px; padding: 0 2px; cursor: pointer; border-radius: 3px; }
.cb-ll-head button:hover { color: var(--primary-text, #fff); background: rgba(255,255,255,0.08); }
.cb-ll-head button.cb-on { color: #ff6b6b; }
.cb-ll-head input[type=range] { width: 30px; height: 12px; margin: 0; padding: 0; flex: none; }
.cb-ll-cell { border-radius: 7px; border: 1px dashed rgba(255,255,255,0.12); position: relative; cursor: pointer; overflow: hidden; font-size: 9px; line-height: 1; color: #111; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; user-select: none; }
.cb-ll-cell.cb-filled { border: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 0 rgba(0,0,0,0.25); }
.cb-ll-cell .cb-ll-glyph { position: absolute; inset: 4px 3px 12px; opacity: 0.55; pointer-events: none; }
.cb-ll-cell .cb-ll-ring { position: absolute; inset: 3px; display: none; pointer-events: none; }
.cb-ll-cell.cb-playing .cb-ll-ring, .cb-ll-cell.cb-stopping .cb-ll-ring { display: block; }
.cb-ll-cell .cb-ll-ring circle { fill: none; stroke-width: 2.4; }
.cb-ll-cell .cb-ll-ring .cb-ll-ring-bg { stroke: rgba(0,0,0,0.25); }
.cb-ll-cell .cb-ll-ring .cb-ll-ring-fg { stroke: #ffffff; stroke-linecap: round; transform: rotate(-90deg); transform-origin: 50% 50%; }
.cb-ll-scene { position: relative; }
.cb-ll-scene::before { content: ""; display: inline-block; width: 0; height: 0; border-left: 6px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; margin-right: 3px; vertical-align: -1px; opacity: 0.7; }
.cb-ll-head .cb-ll-swatch { width: 18px !important; height: 18px; align-self: center !important; border-radius: 5px !important; margin: 0 2px 0 0 !important; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #111; }
.cb-ll-cell.cb-selected { outline: 2px solid var(--primary-text, #fff); outline-offset: 0; }
.cb-ll-cell.cb-drop { outline: 2px dashed #fff; }
.cb-ll-cell .cb-ll-progress { display: none; }
.cb-ll-cell.cb-playing { box-shadow: 0 0 0 2px #2ecc71 inset; }
.cb-ll-cell.cb-queued { animation: cb-ll-blink 0.5s steps(2) infinite; }
.cb-ll-cell.cb-stopping { box-shadow: 0 0 0 2px #ff6b6b inset; }
@keyframes cb-ll-blink { 50% { filter: brightness(1.7); } }
.carrot-reduce-motion .cb-ll-cell.cb-queued { animation: none; box-shadow: 0 0 0 2px #feca57 inset; }
.cb-ll-browser { display: flex; flex-direction: column; gap: 4px; min-height: 0; max-height: 62vh; }
.cb-ll-browser input[type=text] { height: 24px; border-radius: 5px; border: none; padding: 0 8px; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); }
.cb-ll-list { overflow: auto; flex: 1; min-height: 120px; border-radius: 5px; background: rgba(0,0,0,0.18); }
.cb-ll-item { display: flex; align-items: center; gap: 5px; padding: 3px 5px; font-size: 11px; cursor: grab; border-bottom: 1px solid rgba(127,127,127,0.12); }
.cb-ll-item:hover { background: rgba(255,255,255,0.06); }
.cb-ll-item .cb-ll-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.cb-ll-item .cb-ll-iname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cb-ll-item .cb-ll-bars { opacity: 0.6; font-size: 10px; }
.cb-ll-item button { border: none; border-radius: 3px; font-size: 10px; padding: 1px 5px; cursor: pointer; background: var(--ui-widget-background, #444); color: var(--primary-text, #fff); }
.cb-ll-status { font-size: 11px; min-height: 15px; opacity: 0.85; }
.cb-ll-rec { background: #6b1f1f !important; color: #fff !important; }
.cb-ll-rec.cb-armed { background: #e74c3c !important; animation: cb-ll-blink 0.8s steps(2) infinite; }
@media (max-width: 760px) { .cb-ll-main { grid-template-columns: 1fr; } }
`);

    // ------------------------------------------------------------ state
    function blankState() {
        const rows = [];
        for (let r = 0; r < ROWS; r++) rows.push({ name: "", volume: 0.8, mute: false });
        const cells = [];
        for (let r = 0; r < ROWS; r++) cells.push(new Array(COLS).fill(null));
        return { cells, rows, quantize: 0, master: 0.85, genre: 0 };
    }
    function loadState() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) || "null");
            if (saved && Array.isArray(saved.cells) && saved.cells.length == ROWS) {
                const state = blankState();
                for (let r = 0; r < ROWS; r++)
                    for (let c = 0; c < COLS; c++) {
                        const id = saved.cells[r] && saved.cells[r][c];
                        state.cells[r][c] = id && FLLoops.get(id) ? id : null;
                    }
                if (Array.isArray(saved.rows))
                    saved.rows.forEach((row, r) => { if (r < ROWS && row) Object.assign(state.rows[r], { name: String(row.name || "").slice(0, 24), volume: +row.volume >= 0 ? Math.min(1, +row.volume) : 0.8, mute: !!row.mute }); });
                state.quantize = saved.quantize | 0;
                state.master = saved.master >= 0 ? Math.min(1, saved.master) : 0.85;
                state.genre = saved.genre | 0;
                return state;
            }
        } catch (error) { }
        return null;
    }
    function saveState(state) {
        try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (error) { }
    }
    function fillTemplate(state, genreIndex) {
        const lib = FLLoops.library();
        const genre = FLLoops.genres()[genreIndex];
        const progCount = genre.progs.length;
        const typeInfo = (slug) => FLLoops.types().find(t => t.slug == slug);
        const loopFor = (slug, index) => lib.find(l => l.genreIndex == genreIndex && l.typeSlug == slug && l.index == index);
        // pick a loop of `slug` whose chord progression matches the scene's
        const harmonic = new Set(["bass", "chords", "keys", "melody", "arp", "pad", "vox"]);
        const indexFor = (slug, column, prog) => {
            const count = typeInfo(slug).count;
            if (!harmonic.has(slug)) return column % count;
            for (let i = 0; i < count; i++) if ((i + genreIndex) % progCount == prog) return i;
            return -1;
        };
        for (let r = 0; r < ROWS; r++) {
            state.cells[r].fill(null);
            state.rows[r].name = "";
        }
        TEMPLATE_ROWS.forEach((slug, r) => {
            state.rows[r].name = typeInfo(slug).name;
            for (let c = 0; c < COLS; c++) {
                const shape = SCENE_SHAPES[c % SCENE_SHAPES.length][1];
                if (!shape.includes(slug)) continue;
                const prog = Math.floor(c / SCENE_SHAPES.length) % progCount;
                let index = indexFor(slug, c, prog);
                if (slug == "fx") index = SCENE_SHAPES[c % SCENE_SHAPES.length][0] == "Outro" ? 1 : 0;
                if (index < 0) continue;
                const loop = loopFor(slug, index);
                if (loop) state.cells[r][c] = loop.id;
            }
        });
        state.genre = genreIndex;
    }
    function rowLabel(state, r) {
        if (state.rows[r].name) return state.rows[r].name;
        const first = state.cells[r].find(id => id);
        return first ? FLLoops.get(first).type : "Track " + (r + 1);
    }
    // A small MIDI-style picture for a cell, the same for the same loop every time.
    function loopGlyph(item) {
        let h = 2166136261;
        for (const ch of String(item.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
        const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
        const svg = A.SVG.svg({ class: "cb-ll-glyph", viewBox: "0 0 24 14", preserveAspectRatio: "none" });
        const drumLike = ["drums", "tops", "perc"].indexOf(item.typeSlug) != -1;
        if (drumLike) {
            for (let i = 0; i < 8; i++) if (rand() < 0.62 || i % 4 == 0)
                svg.appendChild(A.SVG.rect({ x: String(i * 3 + 0.4), y: String(rand() < 0.5 ? 2 : 7), width: "1.4", height: "5", fill: "#111", rx: "0.5" }));
        }
        else {
            let y = 4 + Math.floor(rand() * 6);
            for (let x = 0; x < 24;) {
                const w = 2 + Math.floor(rand() * (item.typeSlug == "pad" || item.typeSlug == "chords" ? 8 : 4));
                svg.appendChild(A.SVG.rect({ x: String(x), y: String(y), width: String(Math.max(1.2, w - 0.8)), height: "2", fill: "#111", rx: "0.6" }));
                if (item.typeSlug == "chords" || item.typeSlug == "pad") svg.appendChild(A.SVG.rect({ x: String(x), y: String(Math.max(0, y - 4)), width: String(Math.max(1.2, w - 0.8)), height: "2", fill: "#111", rx: "0.6" }));
                x += w;
                y = Math.max(1, Math.min(12, y + Math.round((rand() - 0.5) * 6)));
            }
        }
        return svg;
    }
    function shortLabel(item) {
        const map = { drums: "Dr", tops: "Tp", perc: "Pc", bass: "Bs", chords: "Ch", keys: "Ky", melody: "Ml", arp: "Ar", pad: "Pd", fx: "Fx", vox: "Vx" };
        return (map[item.typeSlug] || "L") + (item.index + 1);
    }

    // ------------------------------------------------------------ audio engine
    class Engine {
        constructor(host) {
            this.host = host;
            this.ctx = null;
            this.rows = [];
            for (let r = 0; r < ROWS; r++) this.rows.push({ col: -1, source: null, gain: null, startedAt: 0, queuedCol: null, queuedAt: 0, stopAt: 0, loopSeconds: 0 });
            this.running = false;
            this.origin = 0;
            this.buffers = new Map();
            this.preview = null;
            this.events = [];
            this.recording = null;
        }
        context() {
            const song = this.host.doc.song;
            return FLLoops.songContext(song);
        }
        barSeconds() {
            const c = this.context();
            return c.beats * 60 / c.bpm;
        }
        ensure() {
            if (!this.ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AC();
                this.master = this.ctx.createGain();
                this.master.connect(this.ctx.destination);
                for (const row of this.rows) {
                    row.gain = this.ctx.createGain();
                    row.gain.connect(this.master);
                }
            }
            if (this.ctx.state == "suspended") this.ctx.resume();
            return this.ctx;
        }
        setLevels(state) {
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            this.master.gain.setTargetAtTime(state.master, now, 0.02);
            state.rows.forEach((row, r) => this.rows[r].gain.gain.setTargetAtTime(row.mute ? 0 : row.volume, now, 0.02));
        }
        buffer(id) {
            const key = FLLoops.sampleKey(id, this.context());
            let buffer = this.buffers.get(key);
            if (!buffer) {
                const loop = FLLoops.render(id, this.context());
                buffer = this.ctx.createBuffer(1, loop.pcm.length, 44100);
                buffer.copyToChannel(loop.pcm, 0);
                this.buffers.set(key, buffer);
                if (this.buffers.size > 64) this.buffers.delete(this.buffers.keys().next().value);
            }
            return buffer;
        }
        // Keeps our bar grid lined up with the song's while the song plays.
        _syncToSong() {
            const synth = this.host.doc.synth;
            if (!synth || !synth.playing) return false;
            const barSeconds = this.barSeconds();
            const phase = synth.playhead - Math.floor(synth.playhead);
            this.origin = this.ctx.currentTime - phase * barSeconds;
            return true;
        }
        nextBoundary(bars) {
            const ctx = this.ensure();
            const barSeconds = this.barSeconds();
            if (!this.running) {
                this.running = true;
                this.origin = ctx.currentTime + 0.08;
                if (!this._syncToSong()) return this.origin;
            }
            else {
                this._syncToSong();
            }
            const span = barSeconds * bars;
            const now = ctx.currentTime + 0.03;
            return this.origin + Math.ceil((now - this.origin) / span - 1e-6) * span;
        }
        launch(row, col, id, bars) {
            const ctx = this.ensure();
            // render first: composing a loop takes a few milliseconds and must not push the start past the boundary
            const buffer = this.buffer(id);
            const at = this.nextBoundary(bars);
            const state = this.rows[row];
            if (state.queuedSource) { try { state.queuedSource.stop(); } catch (e) { } state.queuedSource = null; }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.connect(state.gain);
            source.start(at);
            if (state.source) {
                try { state.source.stop(at); } catch (e) { }
            }
            state.queuedSource = source;
            state.queuedCol = col;
            state.queuedAt = at;
            state.loopSeconds = buffer.duration;
            this.events.push({ row, col, id, at });
        }
        stopRow(row, bars, immediate = false) {
            if (!this.ctx) return;
            const state = this.rows[row];
            const at = immediate ? this.ctx.currentTime : this.nextBoundary(bars);
            for (const source of [state.source, state.queuedSource]) {
                if (source) { try { source.stop(at); } catch (e) { } }
            }
            if (state.queuedSource) { state.queuedSource = null; state.queuedCol = null; }
            if (state.col >= 0 || state.source) { state.stopAt = at; }
            this.events.push({ row, col: -1, id: null, at });
        }
        stopAll(immediate = true) {
            for (let r = 0; r < ROWS; r++) this.stopRow(r, 1, immediate);
            if (immediate) {
                this.running = false;
                for (const state of this.rows) { state.source = null; state.col = -1; state.queuedSource = null; state.queuedCol = null; state.stopAt = 0; }
            }
        }
        // Moves queued launches to "playing" once their time arrives; returns true if anything changed.
        tick() {
            if (!this.ctx) return false;
            const now = this.ctx.currentTime;
            let changed = false;
            for (const state of this.rows) {
                if (state.queuedSource && now >= state.queuedAt) {
                    state.source = state.queuedSource;
                    state.col = state.queuedCol;
                    state.startedAt = state.queuedAt;
                    state.queuedSource = null;
                    state.queuedCol = null;
                    state.stopAt = 0;
                    changed = true;
                }
                if (state.stopAt && now >= state.stopAt && !state.queuedSource) {
                    state.source = null;
                    state.col = -1;
                    state.stopAt = 0;
                    changed = true;
                }
            }
            return changed;
        }
        playPreview(id, onEnd) {
            const ctx = this.ensure();
            this.stopPreview();
            const source = ctx.createBufferSource();
            source.buffer = this.buffer(id);
            source.connect(this.master);
            source.start();
            source.onended = () => { if (this.preview == source) { this.preview = null; onEnd && onEnd(); } };
            this.preview = source;
        }
        stopPreview() {
            if (this.preview) { try { this.preview.stop(); } catch (e) { } this.preview = null; }
        }
        dispose() {
            this.stopPreview();
            this.stopAll(true);
            if (this.ctx) { try { this.ctx.close(); } catch (e) { } }
            this.ctx = null;
        }
    }

    // ------------------------------------------------------------ recording into the song
    // takes: for each bar, for each row, null or { id, slice }
    function writeRecording(host, takes, startBar, rowNames) {
        const doc = host.doc, song = doc.song;
        const context = FLLoops.songContext(song);
        const usedRows = [];
        for (let r = 0; r < ROWS; r++) if (takes.some(bar => bar[r])) usedRows.push(r);
        if (usedRows.length == 0) { flToast("Nothing was playing, so nothing was recorded."); return false; }
        const freeChannels = Config.pitchChannelCountMax - song.pitchChannelCount;
        if (freeChannels <= 0) { flToast("No room for more channels (" + Config.pitchChannelCountMax + " pitch channels is the limit)."); return false; }
        const rows = usedRows.slice(0, freeChannels);
        const skipped = usedRows.length - rows.length;
        const group = new A.ChangeGroup();
        const needed = startBar + takes.length;
        if (needed > song.barCount) {
            if (startBar >= Config.barCountMax) { flToast("The song is already " + Config.barCountMax + " bars long."); return false; }
            group.append(new A.ChangeBarCount(doc, Math.min(Config.barCountMax, needed), false));
        }
        if (!song.patternInstruments)
            group.append(new A.ChangeInstrumentsFlags(doc, song.layeredInstruments, true));
        const barParts = song.beatsPerBar * Config.partsPerBeat;
        const channelIndexes = [];
        for (const r of rows) {
            const added = A.carrotNewChannel(doc, false);
            if (added == null) break;
            group.append(added.group);
            channelIndexes.push([r, added.index]);
        }
        group.append(new A.ChangeFL(doc, () => {
            for (const [r, channelIndex] of channelIndexes) {
                const channel = song.channels[channelIndex];
                channel.name = ("LL " + rowNames[r]).slice(0, 40);
                const loopIds = [];
                for (const bar of takes) if (bar[r] && !loopIds.includes(bar[r].id)) loopIds.push(bar[r].id);
                const maxInstruments = song.getMaxInstrumentsPerChannel();
                const usable = loopIds.slice(0, maxInstruments);
                while (channel.instruments.length < usable.length) channel.instruments.push(new A.Instrument(false));
                usable.forEach((id, k) => {
                    const instrument = channel.instruments[k];
                    instrument.setTypeAndReset(FLConfig.typeSlicex, false);
                    const item = FLLoops.get(id);
                    const sampler = instrument.fl.sampler;
                    sampler.sampleId = "b:" + FLLoops.sampleKey(id, context);
                    sampler.sampleName = FLLoops.nameOf(id);
                    sampler.slices = [];
                    for (let s = 1; s < item.bars; s++) sampler.slices.push(s / item.bars);
                    sampler.start = 0;
                    sampler.end = 1;
                    instrument.preset = instrument.type;
                    FLSampleBank.request(sampler.sampleId);
                });
                // one pattern per (loop, slice) pair, reused across bars
                const patternFor = new Map();
                takes.forEach((bar, b) => {
                    const take = bar[r];
                    const barIndex = startBar + b;
                    if (barIndex >= song.barCount) return;
                    if (!take || usable.indexOf(take.id) == -1) { channel.bars[barIndex] = 0; return; }
                    const key = take.id + "#" + take.slice;
                    let patternNumber = patternFor.get(key);
                    if (patternNumber == undefined) {
                        // find an empty pattern slot in this channel, growing the song's pattern count if needed
                        let index = -1;
                        for (let p = 0; p < song.patternsPerChannel; p++) {
                            const used = channel.bars.indexOf(p + 1) != -1 || Array.from(patternFor.values()).includes(p + 1);
                            if (!used && channel.patterns[p].notes.length == 0) { index = p; break; }
                        }
                        if (index == -1) {
                            if (song.patternsPerChannel >= Config.barCountMax) return;
                            for (const other of song.channels) other.patterns.push(new A.Pattern());
                            song.patternsPerChannel++;
                            index = song.patternsPerChannel - 1;
                        }
                        const pattern = channel.patterns[index];
                        pattern.notes = [new A.Note(48 + take.slice, 0, barParts, Config.noteSizeMax, false)];
                        pattern.instruments = [usable.indexOf(take.id)];
                        patternNumber = index + 1;
                        patternFor.set(key, patternNumber);
                    }
                    channel.bars[barIndex] = patternNumber;
                });
            }
        }, false));
        doc.record(group);
        flToast("Recorded " + takes.length + " bar" + (takes.length == 1 ? "" : "s") + " into " + channelIndexes.length + " channel" + (channelIndexes.length == 1 ? "" : "s") + (skipped > 0 ? " (" + skipped + " track" + (skipped == 1 ? "" : "s") + " skipped: no room)" : ""));
        return true;
    }

    // ------------------------------------------------------------ UI
    function open(host) {
        const state = loadState() || (() => { const s = blankState(); fillTemplate(s, 0); return s; })();
        const engine = new Engine(host);
        host._liveLoops = engine;
        let selected = { r: 0, c: 0 };
        const save = () => saveState(state);
        const root = HTML.div({ class: "cb-ll" });

        // ---- top bar
        const playButton = CarrotUI.button("Play", () => togglePlay(), { primary: true, title: "Start or stop the Live Loops clock (Space)" });
        const recordButton = CarrotUI.button("Record", () => toggleRecord(), { title: "Record what you launch into the song (R)" });
        recordButton.classList.add("cb-ll-rec");
        const stopAllButton = CarrotUI.button("Stop all", () => { engine.stopAll(false); refreshCells(); }, { title: "Stop every track at the next boundary" });
        const quantizeSelect = CarrotUI.select({ options: QUANTIZE.map(q => q[0]), value: state.quantize, title: "When launched loops start", onChange: (v) => { state.quantize = v; save(); } });
        const genreSelect = CarrotUI.select({ options: FLLoops.genres().map(g => g.name), value: state.genre, title: "Genre for the template" });
        const fillButton = CarrotUI.button("Fill grid", () => {
            if (state.cells.some(row => row.some(id => id)) && !window.confirm("Replace the whole grid with the " + FLLoops.genres()[genreSelect.getValue()].name + " template?")) return;
            engine.stopAll(true);
            fillTemplate(state, genreSelect.getValue());
            save();
            buildGrid();
            flToast("Filled the grid with " + FLLoops.genres()[state.genre].name + " loops");
        }, { title: "Fill the grid with matching loops of the chosen genre" });
        const clearButton = CarrotUI.button("Clear", () => {
            if (!window.confirm("Clear every cell of the grid?")) return;
            engine.stopAll(true);
            for (let r = 0; r < ROWS; r++) { state.cells[r].fill(null); state.rows[r].name = ""; }
            save();
            buildGrid();
        });
        const masterSlider = HTML.input({ type: "range", min: "0", max: "100", value: String(Math.round(state.master * 100)), title: "Live Loops volume", style: "width: 80px;" });
        masterSlider.addEventListener("input", () => { state.master = +masterSlider.value / 100; engine.setLevels(state); save(); });
        const info = HTML.span({ class: "cb-ll-info" });
        const updateInfo = () => {
            const c = engine.context();
            info.textContent = c.bpm + " BPM  ·  " + ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][c.key] + (c.minor ? " minor" : " major") + "  ·  " + c.beats + "/4";
        };
        root.appendChild(HTML.div({ class: "cb-ll-bar" }, playButton, recordButton, stopAllButton, HTML.label({ class: "cb-field" }, "Start", quantizeSelect),
            HTML.label({ class: "cb-field" }, "Template", genreSelect), fillButton, clearButton, HTML.label({ class: "cb-field" }, "Volume", masterSlider), info));

        // ---- grid
        const gridWrap = HTML.div({ class: "cb-ll-gridwrap" });
        const grid = HTML.div({ class: "cb-ll-grid" });
        gridWrap.appendChild(grid);
        let cellEls = [], sceneEls = [], headEls = [];
        function buildGrid() {
            grid.innerHTML = "";
            cellEls = [];
            sceneEls = [];
            headEls = [];
            grid.appendChild(HTML.div({ class: "cb-ll-corner" }, "Tracks / Scenes"));
            for (let c = 0; c < COLS; c++) {
                const button = HTML.button({ type: "button", class: "cb-ll-scene", title: "Launch scene " + (c + 1) + " (every loop in this column; empty cells stop their track)" }, String(c + 1));
                button.addEventListener("click", () => launchScene(c));
                sceneEls.push(button);
                grid.appendChild(button);
            }
            for (let r = 0; r < ROWS; r++) {
                const row = state.rows[r];
                const swatch = HTML.div({ class: "cb-ll-swatch" });
                const name = HTML.span({ class: "cb-ll-name", title: "Double-click to rename" }, rowLabel(state, r));
                name.addEventListener("dblclick", () => {
                    CarrotUI.ask({ title: "Track name", value: rowLabel(state, r), okLabel: "Rename", maxLength: 24 }).then((value) => {
                        if (value == null) return;
                        row.name = value.trim();
                        name.textContent = rowLabel(state, r);
                        save();
                    });
                });
                const mute = HTML.button({ type: "button", title: "Mute this track" }, "M");
                if (row.mute) mute.classList.add("cb-on");
                mute.addEventListener("click", () => { row.mute = !row.mute; mute.classList.toggle("cb-on", row.mute); engine.setLevels(state); save(); });
                const volume = HTML.input({ type: "range", min: "0", max: "100", value: String(Math.round(row.volume * 100)), title: "Track volume" });
                volume.addEventListener("input", () => { row.volume = +volume.value / 100; engine.setLevels(state); save(); });
                const stop = HTML.button({ type: "button", title: "Stop this track" }, "\u25A0");
                stop.addEventListener("click", () => { engine.stopRow(r, QUANTIZE[state.quantize][1]); refreshCells(); });
                const head = HTML.div({ class: "cb-ll-head" }, swatch, name, mute, volume, stop);
                headEls.push({ head, swatch, name });
                grid.appendChild(head);
                const rowCells = [];
                for (let c = 0; c < COLS; c++) {
                    const progress = HTML.div({ class: "cb-ll-progress" });
                    const label = HTML.span({ style: "position: relative;" });
                    const ringFg = A.SVG.circle({ class: "cb-ll-ring-fg", cx: "12", cy: "12", r: "10", "stroke-dasharray": "62.83", "stroke-dashoffset": "62.83" });
                    const ring = A.SVG.svg({ class: "cb-ll-ring", viewBox: "0 0 24 24" }, A.SVG.circle({ class: "cb-ll-ring-bg", cx: "12", cy: "12", r: "10" }), ringFg);
                    const cell = HTML.div({ class: "cb-ll-cell" }, progress, label, ring);
                    cell._progress = progress;
                    cell._label = label;
                    // GarageBand-style: a ring fills up as the loop plays
                    cell._setProgress = (v) => ringFg.setAttribute("stroke-dashoffset", (62.83 * (1 - Math.max(0, Math.min(1, v)))).toFixed(2));
                    cell.addEventListener("mousedown", (event) => {
                        if (event.button != 0) return;
                        select(r, c);
                        const id = state.cells[r][c];
                        if (id) toggleCell(r, c);
                    });
                    cell.addEventListener("contextmenu", (event) => {
                        event.preventDefault();
                        select(r, c);
                        if (state.cells[r][c]) clearCell(r, c);
                    });
                    cell.addEventListener("dragover", (event) => { if (dragId || hasLoopDrag(event)) { event.preventDefault(); cell.classList.add("cb-drop"); } });
                    cell.addEventListener("dragleave", () => cell.classList.remove("cb-drop"));
                    cell.addEventListener("drop", (event) => {
                        cell.classList.remove("cb-drop");
                        const id = dragId || readLoopDrag(event);
                        if (!id) return;
                        event.preventDefault();
                        dragId = null;
                        assign(r, c, id);
                    });
                    rowCells.push(cell);
                    grid.appendChild(cell);
                }
                cellEls.push(rowCells);
            }
            refreshCells(true);
        }
        function refreshCells(full = false) {
            for (let r = 0; r < ROWS; r++) {
                const rowState = engine.rows[r];
                const first = state.cells[r].find(id => id);
                headEls[r].swatch.style.background = first ? FLLoops.get(first).color : "rgba(127,127,127,0.25)";
                headEls[r].swatch.textContent = first ? shortLabel(FLLoops.get(first)).replace(/\d+$/, "").charAt(0) : "";
                if (full) headEls[r].name.textContent = rowLabel(state, r);
                for (let c = 0; c < COLS; c++) {
                    const cell = cellEls[r][c];
                    const id = state.cells[r][c];
                    const item = id ? FLLoops.get(id) : null;
                    if (full || cell._id !== id) {
                        cell._id = id;
                        cell.classList.toggle("cb-filled", !!item);
                        cell.style.background = item ? item.color : "transparent";
                        cell._label.textContent = item ? shortLabel(item) : "";
                        if (cell._glyph) { cell._glyph.remove(); cell._glyph = null; }
                        if (item) { cell._glyph = loopGlyph(item); cell.insertBefore(cell._glyph, cell.firstChild); }
                        cell.title = item ? FLLoops.nameOf(id) + " - " + item.bars + " bar" + (item.bars == 1 ? "" : "s") + "\nClick to launch or stop, right-click to clear, drag a loop here to replace" : "Empty - select it, then double-click a loop in the list (or drag one here)";
                    }
                    cell.classList.toggle("cb-selected", selected.r == r && selected.c == c);
                    cell.classList.toggle("cb-playing", rowState.col == c && !rowState.stopAt);
                    cell.classList.toggle("cb-stopping", rowState.col == c && !!rowState.stopAt);
                    cell.classList.toggle("cb-queued", rowState.queuedCol == c);
                    if (rowState.col != c) cell._setProgress(0);
                }
            }
            playButton.textContent = engine.running ? "Stop" : "Play";
            for (let c = 0; c < COLS; c++)
                sceneEls[c].classList.toggle("cb-live", engine.running && engine.rows.every((row, r) => (state.cells[r][c] ? (row.col == c || row.queuedCol == c) : row.col < 0)) && state.cells.some(row => row[c]));
        }
        function select(r, c) {
            selected = { r: Math.max(0, Math.min(ROWS - 1, r)), c: Math.max(0, Math.min(COLS - 1, c)) };
            refreshCells();
            const id = state.cells[selected.r][selected.c];
            status.textContent = id ? FLLoops.nameOf(id) + "  (" + FLLoops.get(id).bars + " bars)" : "Track " + (selected.r + 1) + ", scene " + (selected.c + 1) + ": empty. Double-click a loop on the right to put it here.";
        }
        function assign(r, c, id) {
            state.cells[r][c] = id;
            save();
            select(r, c);
            refreshCells(true);
        }
        function clearCell(r, c) {
            if (engine.rows[r].col == c || engine.rows[r].queuedCol == c) engine.stopRow(r, 1, true);
            state.cells[r][c] = null;
            save();
            refreshCells(true);
        }
        function toggleCell(r, c) {
            const rowState = engine.rows[r];
            const bars = QUANTIZE[state.quantize][1];
            if ((rowState.col == c && !rowState.stopAt) || rowState.queuedCol == c) {
                engine.stopRow(r, bars);
            }
            else {
                engine.setLevels(state);
                engine.launch(r, c, state.cells[r][c], bars);
            }
            refreshCells();
        }
        function launchScene(c) {
            const bars = QUANTIZE[state.quantize][1];
            engine.ensure();
            engine.setLevels(state);
            for (let r = 0; r < ROWS; r++) if (state.cells[r][c]) engine.buffer(state.cells[r][c]);
            for (let r = 0; r < ROWS; r++) {
                const id = state.cells[r][c];
                if (id) engine.launch(r, c, id, bars);
                else if (engine.rows[r].col >= 0 || engine.rows[r].queuedCol != null) engine.stopRow(r, bars);
            }
            refreshCells();
        }
        function togglePlay() {
            if (engine.running) {
                if (engine.recording) finishRecording();
                engine.stopAll(true);
            }
            else {
                // start with the selected cell, or the first scene that has loops
                const id = state.cells[selected.r][selected.c];
                if (id) { engine.setLevels(state); engine.launch(selected.r, selected.c, id, 1); }
                else {
                    const scene = Array.from({ length: COLS }, (_, c) => c).find(c => state.cells.some(row => row[c]));
                    if (scene == undefined) { flToast("The grid is empty. Fill it with a template or drag loops into it."); return; }
                    launchScene(scene);
                }
            }
            refreshCells();
        }
        // ---- recording
        function toggleRecord() {
            if (engine.recording) { finishRecording(); return; }
            const song = host.doc.song;
            engine.ensure();
            const at = engine.running ? engine.nextBoundary(1) : engine.nextBoundary(1);
            const synth = host.doc.synth;
            const startBar = synth && synth.playing ? Math.min(song.barCount, Math.ceil(synth.playhead - 0.02)) : host.doc.bar;
            engine.recording = { start: at, startBar };
            // what is already playing keeps playing into the recording
            for (let r = 0; r < ROWS; r++) {
                const row = engine.rows[r];
                if (row.col >= 0 && !row.stopAt) engine.events.push({ row: r, col: row.col, id: state.cells[r][row.col], at: row.startedAt, carried: true });
            }
            recordButton.classList.add("cb-armed");
            recordButton.textContent = "Recording...";
            if (!engine.rows.some(row => row.col >= 0 || row.queuedCol != null)) {
                const scene = Array.from({ length: COLS }, (_, c) => c).find(c => state.cells.some(row => row[c]));
                if (scene != undefined) launchScene(scene);
            }
            status.textContent = "Recording into the song from bar " + (startBar + 1) + ". Launch loops and scenes, then press Record again to finish.";
        }
        function finishRecording() {
            const rec = engine.recording;
            engine.recording = null;
            recordButton.classList.remove("cb-armed");
            recordButton.textContent = "Record";
            if (!rec || !engine.ctx) return;
            const barSeconds = engine.barSeconds();
            const end = engine.ctx.currentTime;
            const barCount = Math.max(0, Math.round((end - rec.start) / barSeconds));
            if (barCount <= 0) { flToast("Stopped before the first bar, so nothing was recorded."); return; }
            const takes = [];
            const events = engine.events.filter(e => e.at <= end + 0.001).slice().sort((a, b) => a.at - b.at);
            for (let b = 0; b < barCount; b++) {
                const barStart = rec.start + b * barSeconds + 0.005;
                const bar = [];
                for (let r = 0; r < ROWS; r++) {
                    let current = null;
                    for (const e of events) { if (e.row == r && e.at <= barStart) current = e; }
                    if (current && current.id) {
                        const item = FLLoops.get(current.id);
                        const elapsed = Math.round((barStart - current.at) / barSeconds);
                        bar.push({ id: current.id, slice: ((elapsed % item.bars) + item.bars) % item.bars });
                    }
                    else bar.push(null);
                }
                takes.push(bar);
            }
            const names = [];
            for (let r = 0; r < ROWS; r++) names.push(rowLabel(state, r));
            writeRecording(host, takes, rec.startBar, names);
            status.textContent = "Recorded. Undo (Z) removes the recording.";
        }

        // ---- loop browser
        const search = HTML.input({ type: "text", placeholder: "Search loops (e.g. trap bell)", spellcheck: "false" });
        const genreFilter = CarrotUI.select({ options: ["All genres"].concat(FLLoops.genres().map(g => g.name)), value: 0, onChange: () => renderList() });
        const typeFilter = CarrotUI.select({ options: ["All types"].concat(FLLoops.types().map(t => t.name)), value: 0, onChange: () => renderList() });
        const list = HTML.div({ class: "cb-ll-list" });
        const countLabel = HTML.div({ class: "cb-hint" });
        const browser = HTML.div({ class: "cb-ll-browser" }, search, HTML.div({ class: "cb-row" }, genreFilter, typeFilter), list, countLabel,
            CarrotUI.hint("Double-click a loop (or drag it) to put it in the selected cell. Play previews it."));
        let dragId = null;
        const hasLoopDrag = (event) => Array.from(event.dataTransfer && event.dataTransfer.types || []).includes("text/plain");
        const readLoopDrag = (event) => {
            const text = event.dataTransfer.getData("text/plain") || "";
            return text.startsWith("carrot-loop:") && FLLoops.get(text.slice(12)) ? text.slice(12) : null;
        };
        let previewButton = null;
        function renderList() {
            const query = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const gi = genreFilter.getValue() - 1;
            const ti = typeFilter.getValue() - 1;
            const lib = FLLoops.library();
            const results = [];
            for (const item of lib) {
                if (gi >= 0 && item.genreIndex != gi) continue;
                if (ti >= 0 && item.typeIndex != ti) continue;
                if (query.length) {
                    const text = (FLLoops.nameOf(item.id) + " " + item.genre + " " + item.type).toLowerCase();
                    if (!query.every(q => text.indexOf(q) != -1)) continue;
                }
                results.push(item);
            }
            list.innerHTML = "";
            const shown = results.slice(0, 250);
            for (const item of shown) {
                const play = HTML.button({ type: "button", title: "Preview at the song's tempo and key" }, "Play");
                play.addEventListener("click", (event) => {
                    event.stopPropagation();
                    if (previewButton == play) { engine.stopPreview(); play.textContent = "Play"; previewButton = null; return; }
                    if (previewButton) previewButton.textContent = "Play";
                    previewButton = play;
                    play.textContent = "Stop";
                    engine.setLevels(state);
                    engine.playPreview(item.id, () => { play.textContent = "Play"; if (previewButton == play) previewButton = null; });
                });
                const row = HTML.div({ class: "cb-ll-item", draggable: "true", title: FLLoops.nameOf(item.id) },
                    HTML.span({ class: "cb-ll-dot", style: "background: " + item.color + ";" }), play, HTML.span({ class: "cb-ll-iname" }, FLLoops.nameOf(item.id)), HTML.span({ class: "cb-ll-bars" }, item.bars + " bars"));
                row.addEventListener("dblclick", () => assign(selected.r, selected.c, item.id));
                row.addEventListener("dragstart", (event) => { dragId = item.id; event.dataTransfer.setData("text/plain", "carrot-loop:" + item.id); event.dataTransfer.effectAllowed = "copy"; });
                row.addEventListener("dragend", () => { dragId = null; });
                list.appendChild(row);
            }
            countLabel.textContent = results.length + " loop" + (results.length == 1 ? "" : "s") + (results.length > shown.length ? " (showing " + shown.length + ", search to narrow down)" : "");
        }
        search.addEventListener("input", () => renderList());
        search.addEventListener("keydown", (event) => event.stopPropagation());

        const status = HTML.div({ class: "cb-ll-status" });
        root.appendChild(HTML.div({ class: "cb-ll-main" }, gridWrap, browser));
        root.appendChild(status);
        root.appendChild(CarrotUI.hint("Click a loop to launch it at the next bar, click again to stop. Number buttons launch whole scenes. Arrows move the selection, Enter launches, Delete clears, Space plays or stops, R records."));

        // keyboard: only while focus is in this window (and not in a text field)
        root.tabIndex = 0;
        root.addEventListener("keydown", (event) => {
            if (event.target.tagName == "INPUT" || event.target.tagName == "SELECT" || event.ctrlKey || event.metaKey || event.altKey) return;
            let handled = true;
            switch (event.key) {
                case "ArrowUp": select(selected.r - 1, selected.c); break;
                case "ArrowDown": select(selected.r + 1, selected.c); break;
                case "ArrowLeft": select(selected.r, selected.c - 1); break;
                case "ArrowRight": select(selected.r, selected.c + 1); break;
                case "Enter": if (state.cells[selected.r][selected.c]) toggleCell(selected.r, selected.c); break;
                case "Delete": case "Backspace": clearCell(selected.r, selected.c); break;
                case " ": togglePlay(); break;
                case "r": case "R": toggleRecord(); break;
                default: handled = false;
            }
            if (handled) { event.preventDefault(); event.stopPropagation(); }
        });

        // animation / bookkeeping
        const timer = setInterval(() => {
            if (!root.isConnected) return;
            const changed = engine.tick();
            if (changed) refreshCells();
            if (engine.ctx && engine.running) {
                const now = engine.ctx.currentTime;
                for (let r = 0; r < ROWS; r++) {
                    const row = engine.rows[r];
                    if (row.col >= 0 && row.loopSeconds > 0) {
                        const progress = ((now - row.startedAt) % row.loopSeconds) / row.loopSeconds;
                        cellEls[r][row.col]._setProgress(progress);
                    }
                }
                if (engine.recording) {
                    const bars = Math.max(0, Math.floor((now - engine.recording.start) / engine.barSeconds()));
                    status.textContent = "Recording bar " + (engine.recording.startBar + bars + 1) + " (" + bars + " recorded). Press Record again to finish.";
                }
            }
        }, 40);
        host._liveLoopsTimer = timer;
        host._liveLoopsFinish = finishRecording;
        host.onRefresh && host.onRefresh(() => updateInfo());
        updateInfo();
        buildGrid();
        renderList();
        select(0, 0);
        setTimeout(() => root.focus({ preventScroll: true }), 50);
        return root;
    }

    B.CarrotPlugins.register({
        id: "liveloops",
        width: 1010,
        defaultParams: () => ({}),
        open,
        onClose: (host) => {
            if (host._liveLoopsTimer) clearInterval(host._liveLoopsTimer);
            const engine = host._liveLoops;
            if (engine) {
                if (engine.recording && engine.ctx) {
                    // finish a recording that was still running when the window closed
                    try { host._liveLoopsFinish && host._liveLoopsFinish(); } catch (error) { }
                }
                engine.dispose();
            }
        },
    });
})();
