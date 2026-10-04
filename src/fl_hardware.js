    // ======================================================================
    // CarrotBox: hardware over USB - the Roland SP-404MKII and other
    // USB MIDI devices (Web MIDI: Chrome, Edge, Opera, and Firefox with
    // site permission; pages must be served from https or localhost).
    //
    //  - pads play the current channel (and record with BeepBox's recorder)
    //  - Learn: hit pad 1 to set where the pads start
    //  - tempo sync: send MIDI clock + start/stop to the SP, or follow its clock
    //  - sequence the SP: a channel's notes trigger the SP's pads while the
    //    song plays (look-ahead scheduled with Web MIDI timestamps)
    //  - record the SP's USB audio with the Audio Recorder
    //  - import samples from the SP's SD card or an exported folder
    // ======================================================================
    const CARROT_HW_DEFAULTS = {
        inputId: "", outputId: "", profile: 0, baseNote: 36, midiChannel: -1, padsPlay: true, padLayout: 0,
        sync: 0, sendChannel: -1, sendMidiChannel: 0, sendBaseNote: 36, sendVelocity: 100,
    };
    const CARROT_HW_PROFILES = [
        { name: "Roland SP-404MKII", match: /sp-?404/i, baseNote: 36, hint: "Pads 1-16 usually send notes 36-51 (C1-D#2). If yours start elsewhere, press Learn and hit pad 1." },
        { name: "Generic pad controller (MPC style, notes 36+)", match: /mpc|pad|launch|maschine|akai|mpd|apc/i, baseNote: 36, hint: "Pads that send notes 36 and up." },
        { name: "MIDI keyboard", match: /key|piano|keystation|oxygen|komplete|minilab|arturia|novation/i, baseNote: 48, hint: "Keys play pitches; pads profile is not needed." },
    ];
    class CarrotHardware {
        static get() {
            if (!CarrotHardware._instance)
                CarrotHardware._instance = new CarrotHardware();
            return CarrotHardware._instance;
        }
        constructor() {
            this.access = null;
            this.input = null;
            this.output = null;
            this.editor = null;
            this.learning = false;
            this.status = "Not connected";
            this.listeners = new Set();
            this.padHits = new Array(16).fill(0);
            this._held = new Map();
            this._clock = { running: false, next: 0 };
            this._follow = { times: [], running: false };
            this._seq = { lastPos: -1, cycle: 0, sent: new Set(), offs: [] };
            this.settings = Object.assign({}, CARROT_HW_DEFAULTS);
            try {
                const saved = JSON.parse(window.localStorage.getItem("carrot:hardware") || "null");
                if (saved && typeof saved == "object")
                    for (const key of Object.keys(CARROT_HW_DEFAULTS))
                        if (saved[key] !== undefined)
                            this.settings[key] = saved[key];
            }
            catch (error) { }
            this._onMessage = (event) => this._handle(event);
        }
        save() {
            try {
                window.localStorage.setItem("carrot:hardware", JSON.stringify(this.settings));
            }
            catch (error) { }
        }
        notify() {
            for (const listener of this.listeners) {
                try {
                    listener();
                }
                catch (error) { console.error(error); }
            }
        }
        get supported() {
            return typeof navigator != "undefined" && typeof navigator.requestMIDIAccess == "function";
        }
        async connect(editor) {
            this.editor = editor;
            if (!this.supported) {
                this.status = "This browser has no Web MIDI. Use Chrome or Edge (from https or http://localhost).";
                this.notify();
                return false;
            }
            try {
                if (!this.access) {
                    this.access = await navigator.requestMIDIAccess({ sysex: false });
                    this.access.addEventListener("statechange", () => { this._autoPick(); this.notify(); });
                }
            }
            catch (error) {
                this.status = "MIDI access was blocked: " + (error.message || error.name);
                this.notify();
                return false;
            }
            this._autoPick();
            if (!this._timer)
                this._timer = setInterval(() => this._tick(), 20);
            this.notify();
            return true;
        }
        ports() {
            const list = (map) => map ? Array.from(map.values()).map(p => ({ id: p.id, name: p.name || p.id, state: p.state })) : [];
            return { inputs: this.access ? list(this.access.inputs) : [], outputs: this.access ? list(this.access.outputs) : [] };
        }
        _autoPick() {
            if (!this.access)
                return;
            const profile = CARROT_HW_PROFILES[this.settings.profile] || CARROT_HW_PROFILES[0];
            const pick = (map, savedId) => {
                const ports = Array.from(map.values());
                return ports.find(p => p.id == savedId) || ports.find(p => profile.match.test(p.name || "")) || ports.find(p => /sp-?404/i.test(p.name || "")) || ports[0] || null;
            };
            this.setInput(pick(this.access.inputs, this.settings.inputId), false);
            this.setOutput(pick(this.access.outputs, this.settings.outputId), false);
            const name = this.input ? this.input.name : "no MIDI input";
            this.status = this.input || this.output ? "Connected: " + name + (this.output && this.output.name != name ? " / " + this.output.name : "") : "Connected to MIDI, but no device is plugged in.";
        }
        setInput(port, remember = true) {
            if (typeof port == "string")
                port = this.access ? this.access.inputs.get(port) : null;
            if (this.input == port)
                return;
            if (this.input) {
                this.input.removeEventListener("midimessage", this._onMessage);
                window.carrotMidiClaimed && window.carrotMidiClaimed.delete(this.input.id);
            }
            this.input = port || null;
            if (this.input) {
                this.input.addEventListener("midimessage", this._onMessage);
                // BeepBox's own MIDI handler skips the port we handle, so notes aren't played twice
                window.carrotMidiClaimed = window.carrotMidiClaimed || new Set();
                window.carrotMidiClaimed.add(this.input.id);
                if (remember) {
                    this.settings.inputId = this.input.id;
                    this.save();
                }
            }
            this.notify();
        }
        setOutput(port, remember = true) {
            if (typeof port == "string")
                port = this.access ? this.access.outputs.get(port) : null;
            this.output = port || null;
            if (this.output && remember) {
                this.settings.outputId = this.output.id;
                this.save();
            }
            this.notify();
        }
        send(data, time) {
            if (!this.output)
                return;
            try {
                this.output.send(data, time);
            }
            catch (error) { }
        }
        learn() {
            this.learning = true;
            this.status = "Learn: hit pad 1 on your device...";
            this.notify();
        }
        // ------------------------------------------------------- input
        _handle(event) {
            const data = event.data;
            if (!data || data.length == 0)
                return;
            const status = data[0];
            if (status >= 0xF8) {
                this._realtime(status, event.timeStamp);
                return;
            }
            const type = status & 0xF0, channel = status & 0x0F;
            if (type != 0x90 && type != 0x80)
                return;
            const note = data[1], velocity = data[2] || 0;
            const on = type == 0x90 && velocity > 0;
            if (this.learning && on) {
                this.learning = false;
                this.settings.baseNote = note;
                this.settings.midiChannel = channel;
                this.save();
                this.status = "Pad 1 is note " + note + " on MIDI channel " + (channel + 1) + ". Pads 1-16 are notes " + note + "-" + (note + 15) + ".";
                flToast("Learned: pad 1 = note " + note);
                this.notify();
                return;
            }
            if (this.settings.midiChannel >= 0 && channel != this.settings.midiChannel)
                return;
            const pad = note - this.settings.baseNote;
            const isPad = pad >= 0 && pad < 16;
            if (isPad && on) {
                this.padHits[pad] = performance.now();
                this.notify();
            }
            if (!this.settings.padsPlay || !this.editor)
                return;
            const pitch = this._pitchFor(note, pad, isPad);
            if (pitch == null)
                return;
            const doc = this.editor.doc;
            if (on) {
                this._held.set(note, pitch);
                doc.performance.preferLowLatency && doc.performance.preferLowLatency();
                doc.performance.addPerformedPitch(pitch);
            }
            else if (this._held.has(note)) {
                doc.performance.removePerformedPitch(this._held.get(note));
                this._held.delete(note);
            }
        }
        _pitchFor(note, pad, isPad) {
            const doc = this.editor.doc, song = doc.song;
            const isDrum = song.getChannelIsNoise(doc.channel);
            const profile = this.settings.profile;
            if (isDrum) {
                if (!isPad)
                    return null;
                return pad % Config.drumCount;
            }
            const octave = song.channels[doc.channel].octave || 0;
            if (profile == 2 || !isPad) {
                // a keyboard (or keys outside the pad range): real pitches
                const pitch = note - Config.keys[song.key].basePitch;
                return pitch >= 0 && pitch <= Config.maxPitch ? pitch : null;
            }
            if (this.settings.padLayout == 1) {
                // pads follow the song's scale, low to high
                const flags = Config.scales[song.scale].flags;
                const degrees = [];
                for (let i = 0; i < 12; i++)
                    if (flags[i])
                        degrees.push(i);
                const octaveUp = Math.floor(pad / degrees.length);
                return Math.min(Config.maxPitch, octave * 12 + octaveUp * 12 + degrees[pad % degrees.length]);
            }
            return Math.min(Config.maxPitch, octave * 12 + pad);
        }
        _realtime(status, timeStamp) {
            if (this.settings.sync != 2 || !this.editor)
                return;
            const doc = this.editor.doc;
            const f = this._follow;
            if (status == 0xFA) {
                // Start: from the beginning of the loop
                doc.synth.goToBar(doc.song.loopStart);
                doc.synth.snapToBar();
                doc.performance.play();
                f.times = [];
            }
            else if (status == 0xFB) {
                doc.performance.play();
            }
            else if (status == 0xFC) {
                doc.performance.pause();
            }
            else if (status == 0xF8) {
                f.times.push(timeStamp);
                if (f.times.length > 49)
                    f.times.shift();
                if (f.times.length >= 25 && f.times.length % 12 == 1) {
                    const span = f.times[f.times.length - 1] - f.times[0];
                    const bpm = 60000 / (span / (f.times.length - 1) * 24);
                    if (bpm >= Config.tempoMin && bpm <= Config.tempoMax && Math.abs(bpm - doc.song.tempo) >= 0.6) {
                        doc.song.tempo = Math.round(bpm);
                        doc.notifier.changed();
                    }
                }
            }
        }
        // ------------------------------------------------------- output (every 20 ms)
        _tick() {
            if (!this.editor || !this.output)
                return;
            const doc = this.editor.doc, synth = doc.synth;
            const now = performance.now();
            const playing = !!(synth && synth.playing);
            // MIDI clock out
            if (this.settings.sync == 1) {
                const clock = this._clock;
                const tickMs = 60000 / (doc.song.tempo * 24);
                if (playing && !clock.running) {
                    // Song Position Pointer (in sixteenth notes), then Start
                    const sixteenths = Math.max(0, Math.round(synth.playhead * doc.song.beatsPerBar * 4)) & 0x3FFF;
                    this.send([0xF2, sixteenths & 0x7F, sixteenths >> 7], now);
                    this.send([sixteenths == 0 ? 0xFA : 0xFB], now + 1);
                    clock.running = true;
                    clock.next = now + 2;
                }
                else if (!playing && clock.running) {
                    this.send([0xFC], now);
                    clock.running = false;
                }
                if (clock.running) {
                    if (clock.next < now - 200)
                        clock.next = now;
                    while (clock.next < now + 80) {
                        this.send([0xF8], clock.next);
                        clock.next += tickMs;
                    }
                }
            }
            else if (this._clock.running) {
                this.send([0xFC], now);
                this._clock.running = false;
            }
            // sequence the SP from a channel
            const seq = this._seq;
            const ch = this.settings.sendChannel;
            const song = doc.song;
            if (!playing || ch < 0 || ch >= song.getChannelCount()) {
                if (seq.active) {
                    this._allNotesOff(now);
                    seq.active = false;
                }
                seq.lastPos = -1;
                return;
            }
            seq.active = true;
            const pos = synth.playhead;
            if (seq.lastPos >= 0 && pos < seq.lastPos - 0.25) {
                seq.cycle++;
                seq.sent.clear();
            }
            seq.lastPos = pos;
            const barMs = song.beatsPerBar * 60000 / song.tempo;
            const horizon = 120 / barMs;
            const barParts = song.beatsPerBar * Config.partsPerBeat;
            const loopEnd = song.loopStart + song.loopLength;
            const isDrum = song.getChannelIsNoise(ch);
            const midiCh = Math.max(0, Math.min(15, this.settings.sendMidiChannel | 0));
            for (let b = Math.floor(pos); b <= Math.floor(pos + horizon); b++) {
                let bar = b, offset = 0;
                if (bar >= loopEnd && song.loopLength > 0 && synth.loopRepeatCount != 0) {
                    bar -= song.loopLength;
                    offset = song.loopLength;
                }
                if (bar < 0 || bar >= song.barCount)
                    continue;
                const pattern = song.getPattern(ch, bar);
                if (!pattern || song.channels[ch].muted)
                    continue;
                pattern.notes.forEach((note, index) => {
                    const start = bar + offset + note.start / barParts;
                    if (start < pos - 0.001 || start >= pos + horizon)
                        return;
                    const key = seq.cycle + ":" + bar + ":" + index;
                    if (seq.sent.has(key))
                        return;
                    seq.sent.add(key);
                    const at = now + (start - pos) * barMs;
                    const offAt = at + Math.max(15, (note.end - note.start) / barParts * barMs - 5);
                    for (const pitch of note.pitches) {
                        const midi = isDrum ? this.settings.sendBaseNote + pitch : Config.keys[song.key].basePitch + pitch;
                        if (midi < 0 || midi > 127)
                            continue;
                        const velocity = Math.max(1, Math.min(127, Math.round(this.settings.sendVelocity * (note.pins[0].size / Config.noteSizeMax))));
                        this.send([0x90 | midiCh, midi, velocity], at);
                        this.send([0x80 | midiCh, midi, 0], offAt);
                    }
                });
            }
            if (seq.sent.size > 4000)
                seq.sent.clear();
        }
        _allNotesOff(time) {
            const midiCh = Math.max(0, Math.min(15, this.settings.sendMidiChannel | 0));
            this.send([0xB0 | midiCh, 123, 0], time);
        }
        // ------------------------------------------------------- audio & samples
        async recordAudio(editor) {
            const win = CarrotRecorder.open(editor);
            try {
                // labels are only visible after audio permission
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                await win._listDevices();
                const device = Array.from(win._deviceSelect.options).find(o => /sp-?404|roland/i.test(o.textContent));
                if (device) {
                    win._deviceSelect.value = device.value;
                    flToast("Recorder input: " + device.textContent);
                    win._enableMic();
                }
                else {
                    flToast("No SP-404MKII audio input found. Check the USB cable and choose the input in the recorder.");
                }
            }
            catch (error) {
                flToast("Allow microphone access so the recorder can use the SP's USB audio.");
            }
        }
        importSamples(editor) {
            const input = HTML.input({ type: "file", style: "display: none;" });
            input.setAttribute("webkitdirectory", "");
            input.setAttribute("directory", "");
            input.multiple = true;
            input.addEventListener("change", () => {
                const files = Array.from(input.files || []);
                input.remove();
                if (files.length == 0)
                    return;
                const loader = CarrotKitLoader.open(editor, 0);
                loader._import(files);
            });
            document.body.appendChild(input);
            input.click();
        }
    }
    CarrotHardware._instance = null;
    // ------------------------------------------------------------- panel
    class CarrotHardwarePanel extends CarrotFloatingWindow {
        static open(editor) {
            return CarrotWindows.openPanel("hardware", () => new CarrotHardwarePanel(editor));
        }
        constructor(editor) {
            super(editor, { key: "hardware", title: "SP-404MKII & MIDI Devices", color: "#e34234", width: 600 });
            const hw = CarrotHardware.get();
            hw.editor = editor;
            this._hw = hw;
            const st = hw.settings;
            const save = () => hw.save();
            const statusLine = HTML.div({ class: "cb-hint", style: "min-height: 16px;" });
            const connect = CarrotUI.button("Connect USB MIDI", () => hw.connect(editor), { primary: true, title: "Ask the browser for MIDI access and find your device" });
            const inputSelect = HTML.select({ class: "cb-select", title: "MIDI input (from the device)" });
            const outputSelect = HTML.select({ class: "cb-select", title: "MIDI output (to the device)" });
            for (const select of [inputSelect, outputSelect])
                select.addEventListener("keydown", (e) => e.stopPropagation());
            inputSelect.addEventListener("change", () => hw.setInput(inputSelect.value));
            outputSelect.addEventListener("change", () => hw.setOutput(outputSelect.value));
            const profile = CarrotUI.select({ label: "Device", options: CARROT_HW_PROFILES.map(p => p.name), value: st.profile, onChange: (v) => {
                    st.profile = v;
                    st.baseNote = CARROT_HW_PROFILES[v].baseNote;
                    save();
                    hw._autoPick();
                    refresh();
                } });
            const learn = CarrotUI.button("Learn pad 1", () => hw.learn(), { title: "Hit pad 1 on the device to set where the pads start" });
            const baseNote = HTML.input({ type: "number", min: "0", max: "112", value: String(st.baseNote), style: "width: 56px; height: 22px;", title: "The MIDI note of pad 1" });
            baseNote.addEventListener("keydown", (e) => e.stopPropagation());
            baseNote.addEventListener("change", () => { st.baseNote = Math.max(0, Math.min(112, +baseNote.value | 0)); save(); refresh(); });
            const channelSelect = CarrotUI.select({ label: "Listen on", options: ["Any MIDI channel"].concat(Array.from({ length: 16 }, (_, i) => "Channel " + (i + 1))), value: st.midiChannel + 1, onChange: (v) => { st.midiChannel = v - 1; save(); } });
            const padsPlay = CarrotUI.toggle({ label: "Pads play the current channel", value: st.padsPlay, title: "Also records into the pattern while BeepBox's note recording is on", onChange: (v) => { st.padsPlay = v; save(); } });
            const layout = CarrotUI.select({ label: "On pitched channels", options: ["Chromatic (pad 1 = lowest note)", "Song scale"], value: st.padLayout, onChange: (v) => { st.padLayout = v; save(); } });
            const padGrid = HTML.div({ style: "display: grid; grid-template-columns: repeat(4, 34px); gap: 4px;" });
            const padEls = [];
            for (let row = 3; row >= 0; row--) {
                for (let col = 0; col < 4; col++) {
                    const index = row * 4 + col;
                    const pad = HTML.div({ style: "height: 26px; border-radius: 4px; background: var(--ui-widget-background, #333); font-size: 10px; display: flex; align-items: center; justify-content: center;" }, String(index + 1));
                    padEls[index] = pad;
                    padGrid.appendChild(pad);
                }
            }
            const sync = CarrotUI.select({ label: "Tempo sync", options: ["Off", "Send MIDI clock to the device (CarrotBox leads)", "Follow the device's clock (device leads)"], value: st.sync, onChange: (v) => { st.sync = v; save(); refresh(); } });
            const sendChannel = HTML.select({ class: "cb-select", title: "Channel whose notes are sent to the device" });
            sendChannel.addEventListener("keydown", (e) => e.stopPropagation());
            sendChannel.addEventListener("change", () => { st.sendChannel = +sendChannel.value; save(); });
            const sendMidi = CarrotUI.select({ label: "on MIDI channel", options: Array.from({ length: 16 }, (_, i) => String(i + 1)), value: st.sendMidiChannel, onChange: (v) => { st.sendMidiChannel = v; save(); } });
            const sendBase = HTML.input({ type: "number", min: "0", max: "115", value: String(st.sendBaseNote), style: "width: 56px; height: 22px;", title: "Note sent for drum row 1 (pad 1)" });
            sendBase.addEventListener("keydown", (e) => e.stopPropagation());
            sendBase.addEventListener("change", () => { st.sendBaseNote = Math.max(0, Math.min(115, +sendBase.value | 0)); save(); });
            const profileHint = HTML.div({ class: "cb-hint" });
            const syncHint = HTML.div({ class: "cb-hint" });
            const record = CarrotUI.button("Record the device's audio...", () => hw.recordAudio(editor), { title: "Opens the Audio Recorder with the SP-404MKII's USB audio input" });
            const importButton = CarrotUI.button("Import samples (SD card or folder)...", () => hw.importSamples(editor), { title: "Choose the SP's SD card folder or a folder of exported samples; it becomes a kit in the browser" });
            const body = HTML.div(
                CarrotUI.section("Connection", CarrotUI.row(connect, profile), statusLine, CarrotUI.row(HTML.label({ class: "cb-field" }, "Input", inputSelect), HTML.label({ class: "cb-field" }, "Output", outputSelect))),
                CarrotUI.section("Pads into CarrotBox", HTML.div({ style: "display: flex; gap: 12px; align-items: flex-start;" }, padGrid,
                    HTML.div({ style: "flex: 1; display: flex; flex-direction: column; gap: 6px;" }, CarrotUI.row(padsPlay, layout), CarrotUI.row(learn, HTML.label({ class: "cb-field" }, "Pad 1 note", baseNote), channelSelect), profileHint))),
                CarrotUI.section("Tempo sync", sync, syncHint),
                CarrotUI.section("Sequence the device from a channel", CarrotUI.row(HTML.label({ class: "cb-field" }, "Send", sendChannel), sendMidi, HTML.label({ class: "cb-field" }, "Drum row 1 note", sendBase)),
                    CarrotUI.hint("While the song plays, that channel's notes go to the device: drum rows trigger pads from the note above (row 1 = pad 1), pitched notes keep their pitch. Mute the channel here if you only want to hear the device.")),
                CarrotUI.section("Audio and samples", CarrotUI.row(record, importButton),
                    CarrotUI.hint("The SP-404MKII is also a USB audio interface: record it into CarrotBox with the recorder. To use its samples, choose the SD card (or a folder of exported WAVs); they become a kit in the Sound Browser that you can put on FPC pads.")),
                CarrotUI.hint("Needs a browser with Web MIDI (Chrome or Edge) and a page opened from https or http://localhost. BeepBox's own Enable MIDI preference can stay off."));
            this.setBody(body);
            const fillPorts = () => {
                const { inputs, outputs } = hw.ports();
                const fill = (select, list, current, none) => {
                    select.innerHTML = "";
                    if (list.length == 0)
                        select.appendChild(HTML.option({ value: "" }, none));
                    for (const port of list)
                        select.appendChild(HTML.option({ value: port.id }, port.name + (port.state == "disconnected" ? " (unplugged)" : "")));
                    select.value = current ? current.id : "";
                };
                fill(inputSelect, inputs, hw.input, hw.access ? "No inputs" : "Connect first");
                fill(outputSelect, outputs, hw.output, hw.access ? "No outputs" : "Connect first");
                const song = this.doc.song;
                const current = st.sendChannel;
                sendChannel.innerHTML = "";
                sendChannel.appendChild(HTML.option({ value: "-1" }, "Nothing (off)"));
                for (let c = 0; c < song.getChannelCount(); c++)
                    sendChannel.appendChild(HTML.option({ value: String(c) }, "Channel " + (c + 1) + (song.channels[c].name ? " - " + song.channels[c].name : song.getChannelIsNoise(c) ? " (drums)" : "")));
                sendChannel.value = String(current < song.getChannelCount() ? current : -1);
            };
            const refresh = () => {
                statusLine.textContent = hw.status;
                connect.textContent = hw.access ? "Reconnect" : "Connect USB MIDI";
                baseNote.value = String(st.baseNote);
                profileHint.textContent = CARROT_HW_PROFILES[st.profile].hint;
                syncHint.textContent = st.sync == 1 ? "Set the SP's SYNC MODE to MIDI (or USB) so it follows CarrotBox's tempo, start and stop." : st.sync == 2 ? "Set the SP to send MIDI clock. Its Start plays the song from the loop start, Stop pauses, and its tempo becomes the song tempo." : "";
                fillPorts();
            };
            this._listener = () => refresh();
            hw.listeners.add(this._listener);
            this._padTimer = setInterval(() => {
                const now = performance.now();
                padEls.forEach((el, i) => { el.style.background = now - hw.padHits[i] < 160 ? "#e34234" : "var(--ui-widget-background, #333)"; });
            }, 60);
            this.watchSong(() => fillPorts());
            refresh();
            this.mount();
            if (hw.supported && !hw.access)
                hw.connect(editor);
        }
        close() {
            this._hw.listeners.delete(this._listener);
            clearInterval(this._padTimer);
            super.close();
        }
    }
