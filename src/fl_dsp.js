    // ======================================================================
    // BeepBox FL: synthesis for the new instrument types and the FL effects.
    // ======================================================================
    Config.samplerBaseExpression = 0.11;
    Config.threeOscBaseExpression = 0.032;
    Config.pluginBaseExpression = 0.04;
    class FLSynth {
        // Called from Synth.computeTone for sampler / Slicex / FPC / 3x Osc.
        static computeTone(synth, song, instrument, instrumentState, tone, ctx) {
            const type = instrument.type;
            const roundedSamplesPerTick = ctx.roundedSamplesPerTick;
            const freqEndRatio = Math.pow(2.0, (ctx.intervalEnd - ctx.intervalStart) / 12.0);
            const basePhaseDeltaScale = Math.pow(freqEndRatio, 1.0 / roundedSamplesPerTick);
            const chord = instrument.getChord();
            let pitch = tone.pitches[0];
            if (tone.pitchCount > 1 && chord.arpeggiates) {
                const arpeggio = Math.floor((synth.tick + synth.part * Config.ticksPerPart) / Config.rhythms[song.rhythm].ticksPerArpeggio);
                pitch = tone.pitches[getArpeggioPitchIndex(tone.pitchCount, song.rhythm, arpeggio)];
            }
            if (type == FLConfig.typeThreeOsc) {
                FLSynth._computeThreeOsc(synth, song, instrument, tone, ctx, pitch, basePhaseDeltaScale);
                return;
            }
            if (type == FLConfig.typePlugin) {
                FLSynth._computePlugin(synth, song, instrument, tone, ctx, pitch);
                return;
            }
            // ---- sample based instruments
            const settings = instrument.fl.sampler;
            const isFPC = (type == FLConfig.typeFPC);
            let sampleId;
            let gainMult = 1.0;
            let semitones = 0.0;
            let regionStart = 0.0, regionEnd = 1.0;
            let reverse = false;
            let oneShot = false;
            let loop = false;
            const firstCompute = (tone.flSampleEntry == null);
            if (isFPC) {
                if (tone.flPad == null) {
                    let padIndex = tone.pitches[0];
                    if (tone.note != null)
                        padIndex += tone.note.pickMainInterval();
                    padIndex = ctx.isNoiseChannel ? padIndex : ((padIndex % 12) + 12) % 12;
                    tone.flPad = Math.max(0, Math.min(FLConfig.fpcPadCount - 1, padIndex));
                }
                const pad = instrument.fl.fpc.pads[tone.flPad];
                sampleId = pad.sampleId;
                gainMult = Math.pow(pad.volume / 80, 1.5);
                semitones = pad.tune + ctx.intervalStart * (ctx.isNoiseChannel ? 0 : 1);
                reverse = pad.reverse;
                oneShot = true;
                if (firstCompute && pad.cut > 0)
                    FLSynth._chokeGroup(instrument, instrumentState, tone, pad.cut);
            }
            else {
                sampleId = settings.sampleId;
                gainMult = Math.pow(10, settings.gain / 20);
                reverse = settings.reverse;
                oneShot = settings.oneShot;
                if (type == FLConfig.typeSlicex) {
                    const regions = settings.getSliceRegions();
                    if (tone.flPad == null) {
                        // Slice 1 sits on C4 and the slices run upward; keys outside that range repeat the
                        // slices (like FPC does with its pads) so every key plays something.
                        const raw = ctx.isNoiseChannel ? tone.pitches[0] : (pitch - 48);
                        const count = Math.max(1, regions.length);
                        tone.flPad = ((raw % count) + count) % count;
                    }
                    if (tone.flPad < 0 || tone.flPad >= regions.length) {
                        sampleId = null;
                    }
                    else {
                        regionStart = settings.start + (settings.end - settings.start) * regions[tone.flPad][0];
                        regionEnd = settings.start + (settings.end - settings.start) * regions[tone.flPad][1];
                    }
                    semitones = ctx.intervalStart + settings.tune / 100;
                }
                else {
                    regionStart = settings.start;
                    regionEnd = settings.end;
                    loop = settings.loop && !oneShot;
                    const playedMidi = ctx.isNoiseChannel ? settings.root + (pitch - 5) : Config.keys[song.key].basePitch + pitch;
                    semitones = (settings.keytrack ? playedMidi - settings.root : 0) + ctx.intervalStart + settings.tune / 100;
                }
            }
            const entry = sampleId == null ? null : FLSampleBank.request(sampleId);
            tone.flSampleEntry = entry;
            tone.flReady = (entry != null && entry.status == "ready" && entry.pcm.length > 1);
            tone.flCrunchy = !isFPC && settings.crunchy;
            if (!tone.flReady) {
                tone.expression = 0.0;
                tone.expressionDelta = 0.0;
                tone.phaseDeltas[0] = 0.0;
                if (ctx.released)
                    tone.isOnLastTick = true;
                return;
            }
            const length = entry.pcm.length;
            const startFrame = Math.max(0, Math.min(length - 1, Math.floor(Math.min(regionStart, regionEnd) * length)));
            const endFrame = Math.max(startFrame + 1, Math.min(length, Math.floor(Math.max(regionStart, regionEnd) * length)));
            if (tone.flPosition == null) {
                tone.flPosition = reverse ? endFrame - 1 : startFrame;
                tone.flDone = false;
            }
            tone.flStartFrame = startFrame;
            tone.flEndFrame = endFrame;
            tone.flDirection = reverse ? -1 : 1;
            tone.flLoop = loop;
            if (loop) {
                const ls = Math.max(startFrame, Math.min(endFrame - 2, Math.floor(settings.loopStart * length)));
                const le = Math.max(ls + 2, Math.min(endFrame, Math.floor(settings.loopEnd * length)));
                tone.flLoopStart = ls;
                tone.flLoopEnd = le;
            }
            const rateStart = (entry.rate / synth.samplesPerSecond) * Math.pow(2.0, semitones / 12.0);
            tone.phaseDeltas[0] = rateStart;
            tone.phaseDeltaScales[0] = basePhaseDeltaScale;
            // Volume.
            let expressionStart, expressionEnd;
            const base = Config.samplerBaseExpression * gainMult * ctx.noteFilterExpression;
            if (oneShot) {
                if (tone.flVelocity == null) {
                    tone.flVelocity = (tone.note != null) ? Synth.noteSizeToVolumeMult(tone.note.pins[0].size) : 1.0;
                }
                expressionStart = expressionEnd = base * tone.flVelocity * ctx.chordExpressionStart;
                if (ctx.shouldFadeOutFast || tone.flChoked) {
                    expressionEnd = 0.0;
                    tone.isOnLastTick = true;
                }
                else if (ctx.released) {
                    tone.isOnLastTick = tone.flDone;
                }
                else {
                    tone.isOnLastTick = false;
                }
            }
            else {
                expressionStart = base * ctx.fadeExpressionStart * ctx.chordExpressionStart * ctx.envelopeStarts[0];
                expressionEnd = base * ctx.fadeExpressionEnd * ctx.chordExpressionEnd * ctx.envelopeEnds[0];
                if (tone.flChoked) {
                    expressionEnd = 0.0;
                    tone.isOnLastTick = true;
                }
            }
            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / roundedSamplesPerTick;
        }
        static _chokeGroup(instrument, instrumentState, newTone, group) {
            const pads = instrument.fl.fpc.pads;
            const choke = (list) => {
                for (let i = 0; i < list.count(); i++) {
                    const other = list.get(i);
                    if (other != newTone && other.flPad != null && other.flPad != newTone.flPad && pads[other.flPad] && pads[other.flPad].cut == group) {
                        other.flChoked = true;
                    }
                }
            };
            choke(instrumentState.activeTones);
            choke(instrumentState.releasedTones);
        }
        static _computeThreeOsc(synth, song, instrument, tone, ctx, pitch, basePhaseDeltaScale) {
            const settings = instrument.fl.osc3;
            const sampleTime = 1.0 / synth.samplesPerSecond;
            const intervalScale = ctx.isNoiseChannel ? Config.noiseInterval : 1;
            const basePitch = ctx.isNoiseChannel ? 24 : Config.keys[song.key].basePitch;
            const startPitch = basePitch + (pitch + ctx.intervalStart) * intervalScale;
            const endPitch = basePitch + (pitch + ctx.intervalEnd) * intervalScale;
            const startFreq = Instrument.frequencyFromPitch(startPitch);
            const scale = Math.pow(Math.pow(2.0, (endPitch - startPitch) / 12.0), 1.0 / ctx.roundedSamplesPerTick);
            for (let i = 0; i < 3; i++) {
                const osc = settings.oscs[i];
                const ratio = Math.pow(2.0, (osc.coarse + osc.fine / 100) / 12.0);
                tone.phaseDeltas[i] = startFreq * ratio * sampleTime;
                tone.phaseDeltaScales[i] = scale;
            }
            if (!tone.flOscInitialized) {
                tone.flOscInitialized = true;
                for (let i = 0; i < 3; i++) {
                    const osc = settings.oscs[i];
                    tone.phases[i] = osc.phaseRand ? Math.random() : osc.phase / 100;
                }
            }
            let pitchExpressionStart;
            if (tone.prevPitchExpressions[0] != null) {
                pitchExpressionStart = tone.prevPitchExpressions[0];
            }
            else {
                pitchExpressionStart = Math.pow(2.0, -(startPitch - 16) / 48);
            }
            const pitchExpressionEnd = Math.pow(2.0, -(endPitch - 16) / 48);
            tone.prevPitchExpressions[0] = pitchExpressionEnd;
            const base = Config.threeOscBaseExpression * ctx.noteFilterExpression;
            const expressionStart = base * ctx.fadeExpressionStart * ctx.chordExpressionStart * pitchExpressionStart * ctx.envelopeStarts[0];
            const expressionEnd = base * ctx.fadeExpressionEnd * ctx.chordExpressionEnd * pitchExpressionEnd * ctx.envelopeEnds[0];
            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / ctx.roundedSamplesPerTick;
            tone.flOscLevels = settings.oscs.map(o => (o.invert ? -1 : 1) * o.level / 100);
            tone.flOscShapes = settings.oscs.map(o => o.shape);
            tone.flOsc3AM = settings.osc3AM;
        }
        // ------------------------------------------------ plugin instruments
        // Each tone owns one voice made by the plugin. The plugin handles its
        // own envelopes (including release); BeepBox's note volume, chord and
        // note-filter expression are applied on top.
        static _computePlugin(synth, song, instrument, tone, ctx, pitch) {
            const settings = instrument.fl.plugin;
            const plugin = settings.id != null ? CarrotPlugins.get(settings.id) : null;
            if (plugin == null || plugin.kind != "instrument") {
                tone.flVoice = null;
                tone.expression = 0.0;
                tone.expressionDelta = 0.0;
                if (ctx.released)
                    tone.isOnLastTick = true;
                return;
            }
            const intervalScale = ctx.isNoiseChannel ? Config.noiseInterval : 1;
            const basePitch = ctx.isNoiseChannel ? 24 : Config.keys[song.key].basePitch;
            const startMidi = basePitch + (pitch + ctx.intervalStart) * intervalScale;
            const endMidi = basePitch + (pitch + ctx.intervalEnd) * intervalScale;
            const startFreq = Instrument.frequencyFromPitch(startMidi);
            const endFreq = Instrument.frequencyFromPitch(endMidi);
            let info = tone.flPluginInfo;
            if (tone.flVoice == null || tone.flVoicePlugin != plugin) {
                const notePitch = pitch + ((tone.note != null) ? tone.note.pickMainInterval() : 0);
                const velocity = (tone.note != null) ? Math.max(0.1, tone.note.pins[0].size / Config.noteSizeMax) : 1.0;
                info = tone.flPluginInfo = {
                    freq: startFreq, freqScale: 1.0, gate: true, params: settings.params, sampleRate: synth.samplesPerSecond,
                    midi: startMidi, notePitch: notePitch, velocity: velocity, isNoise: ctx.isNoiseChannel, bpm: song.tempo, key: song.key,
                    channel: ctx.channelIndex, bar: synth.bar,
                    // position of this note in the channel (song order), e.g. for lyrics; null for live / preview notes
                    noteIndex: (tone.note != null && ctx.channelIndex != undefined) ? FLSynth.noteOrderIndex(song, ctx.channelIndex, synth.bar, tone.note) : null,
                };
                try {
                    tone.flVoice = plugin.createVoice(settings.params, info);
                }
                catch (error) {
                    CarrotPlugins.reportError(plugin, error);
                    tone.flVoice = null;
                }
                tone.flVoicePlugin = plugin;
                if (tone.flVoice == null) {
                    tone.expression = 0.0;
                    tone.expressionDelta = 0.0;
                    return;
                }
            }
            info.freq = startFreq;
            info.freqScale = (endFreq == startFreq) ? 1.0 : Math.pow(endFreq / startFreq, 1.0 / ctx.roundedSamplesPerTick);
            info.midi = startMidi;
            info.gate = !ctx.released;
            info.params = settings.params;
            info.sampleRate = synth.samplesPerSecond;
            info.bpm = song.tempo;
            const base = Config.pluginBaseExpression * ctx.noteFilterExpression;
            const expressionStart = base * ctx.chordExpressionStart * ctx.envelopeStarts[0];
            let expressionEnd = base * ctx.chordExpressionEnd * ctx.envelopeEnds[0];
            if (ctx.shouldFadeOutFast) {
                expressionEnd = 0.0;
                tone.isOnLastTick = true;
            }
            else if (ctx.released) {
                tone.isOnLastTick = !!tone.flVoice.done;
            }
            tone.expression = expressionStart;
            tone.expressionDelta = (expressionEnd - expressionStart) / ctx.roundedSamplesPerTick;
        }
        // How many notes come before `note` in this channel, in song order (bars, then start time).
        static noteOrderIndex(song, channelIndex, bar, note) {
            const channel = song.channels[channelIndex];
            if (!channel)
                return null;
            let count = 0;
            for (let b = 0; b < bar && b < song.barCount; b++) {
                const pattern = song.getPattern(channelIndex, b);
                if (pattern)
                    count += pattern.notes.length;
            }
            const pattern = song.getPattern(channelIndex, bar);
            if (pattern) {
                for (const other of pattern.notes) {
                    if (other == note)
                        break;
                    if (other.start <= note.start)
                        count++;
                }
            }
            return count;
        }
        static pluginSynth(synth, bufferIndex, runLength, tone, instrumentState) {
            const voice = tone.flVoice;
            if (voice == null)
                return;
            const plugin = tone.flVoicePlugin;
            const info = tone.flPluginInfo;
            let temp = FLSynth._pluginTemp;
            if (temp == null || temp.length < runLength) {
                temp = FLSynth._pluginTemp = new Float32Array(Math.max(runLength, 4096));
            }
            temp.fill(0, 0, runLength);
            try {
                plugin.render(voice, temp, 0, runLength, info);
            }
            catch (error) {
                CarrotPlugins.reportError(plugin, error);
                tone.flVoice = null;
                return;
            }
            if (info.freqScale != 1.0)
                info.freq *= Math.pow(info.freqScale, runLength);
            if (!Number.isFinite(temp[0]) || !Number.isFinite(temp[runLength - 1])) {
                CarrotPlugins.reportError(plugin, new Error("produced invalid audio"));
                tone.flVoice = null;
                return;
            }
            const data = synth.tempMonoInstrumentSampleBuffer;
            let expression = +tone.expression;
            const expressionDelta = +tone.expressionDelta;
            const filters = tone.noteFilters;
            const filterCount = tone.noteFilterCount | 0;
            let initialFilterInput1 = +tone.initialNoteFilterInput1;
            let initialFilterInput2 = +tone.initialNoteFilterInput2;
            const applyFilters = Synth.applyFilters;
            for (let i = 0; i < runLength; i++) {
                const inputSample = temp[i];
                const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
                initialFilterInput2 = initialFilterInput1;
                initialFilterInput1 = inputSample;
                data[bufferIndex + i] += sample * expression;
                expression += expressionDelta;
            }
            tone.expression = expression;
            synth.sanitizeFilters(filters);
            tone.initialNoteFilterInput1 = initialFilterInput1;
            tone.initialNoteFilterInput2 = initialFilterInput2;
        }
        // ------------------------------------------------ sample playback
        static sampleSynth(synth, bufferIndex, runLength, tone, instrumentState) {
            if (!tone.flReady || tone.flDone)
                return;
            const data = synth.tempMonoInstrumentSampleBuffer;
            const pcm = tone.flSampleEntry.pcm;
            let position = +tone.flPosition;
            let rate = +tone.phaseDeltas[0];
            // A bad rate or position (NaN) would write garbage into the mix; stop the tone instead.
            if (!(rate > 0 && rate < 1000) || !(position >= 0 && position < pcm.length)) {
                tone.flDone = true;
                return;
            }
            const rateScale = +tone.phaseDeltaScales[0];
            const direction = tone.flDirection;
            const startFrame = tone.flStartFrame;
            const endFrame = tone.flEndFrame;
            const loop = tone.flLoop;
            const loopStart = tone.flLoopStart;
            const loopEnd = tone.flLoopEnd;
            const crunchy = tone.flCrunchy;
            let expression = +tone.expression;
            const expressionDelta = +tone.expressionDelta;
            const filters = tone.noteFilters;
            const filterCount = tone.noteFilterCount | 0;
            let initialFilterInput1 = +tone.initialNoteFilterInput1;
            let initialFilterInput2 = +tone.initialNoteFilterInput2;
            const applyFilters = Synth.applyFilters;
            const stopIndex = bufferIndex + runLength;
            let done = false;
            for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
                let inputSample;
                if (done) {
                    inputSample = 0.0;
                }
                else {
                    const index = position | 0;
                    if (crunchy) {
                        inputSample = pcm[index];
                    }
                    else {
                        const ratio = position - index;
                        const a = pcm[index];
                        const b = (index + 1 < pcm.length) ? pcm[index + 1] : a;
                        inputSample = a + (b - a) * ratio;
                    }
                    position += rate * direction;
                    rate *= rateScale;
                    if (loop) {
                        if (direction > 0 && position >= loopEnd)
                            position = loopStart + ((position - loopStart) % (loopEnd - loopStart));
                        else if (direction < 0 && position < loopStart)
                            position = loopEnd - 1;
                    }
                    else if (position >= endFrame - 1 || position < startFrame) {
                        done = true;
                    }
                }
                const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
                initialFilterInput2 = initialFilterInput1;
                initialFilterInput1 = inputSample;
                data[sampleIndex] += sample * expression;
                expression += expressionDelta;
            }
            tone.flPosition = position;
            tone.phaseDeltas[0] = rate;
            tone.flDone = done;
            tone.expression = expression;
            synth.sanitizeFilters(filters);
            tone.initialNoteFilterInput1 = initialFilterInput1;
            tone.initialNoteFilterInput2 = initialFilterInput2;
        }
        // ------------------------------------------------ 3x Osc
        static threeOscSynth(synth, bufferIndex, runLength, tone, instrumentState) {
            const data = synth.tempMonoInstrumentSampleBuffer;
            let phase0 = tone.phases[0] % 1, phase1 = tone.phases[1] % 1, phase2 = tone.phases[2] % 1;
            let dt0 = +tone.phaseDeltas[0], dt1 = +tone.phaseDeltas[1], dt2 = +tone.phaseDeltas[2];
            const scale0 = +tone.phaseDeltaScales[0], scale1 = +tone.phaseDeltaScales[1], scale2 = +tone.phaseDeltaScales[2];
            const levels = tone.flOscLevels;
            const shapes = tone.flOscShapes;
            const am = tone.flOsc3AM;
            const level0 = levels[0], level1 = levels[1], level2 = levels[2];
            const shape0 = shapes[0], shape1 = shapes[1], shape2 = shapes[2];
            let expression = +tone.expression;
            const expressionDelta = +tone.expressionDelta;
            const filters = tone.noteFilters;
            const filterCount = tone.noteFilterCount | 0;
            let initialFilterInput1 = +tone.initialNoteFilterInput1;
            let initialFilterInput2 = +tone.initialNoteFilterInput2;
            const applyFilters = Synth.applyFilters;
            let rounded0 = tone.flRounded0 || 0, rounded1 = tone.flRounded1 || 0, rounded2 = tone.flRounded2 || 0;
            const wave = FLSynth.oscillate;
            const stopIndex = bufferIndex + runLength;
            for (let sampleIndex = bufferIndex; sampleIndex < stopIndex; sampleIndex++) {
                let o0 = wave(shape0, phase0, dt0);
                let o1 = wave(shape1, phase1, dt1);
                let o2 = wave(shape2, phase2, dt2);
                if (shape0 == 4) {
                    rounded0 += (o0 - rounded0) * 0.35;
                    o0 = rounded0 * 1.3;
                }
                if (shape1 == 4) {
                    rounded1 += (o1 - rounded1) * 0.35;
                    o1 = rounded1 * 1.3;
                }
                if (shape2 == 4) {
                    rounded2 += (o2 - rounded2) * 0.35;
                    o2 = rounded2 * 1.3;
                }
                let inputSample;
                if (am) {
                    inputSample = (o0 * level0 + o1 * level1) * (0.5 + 0.5 * o2 * Math.abs(level2));
                }
                else {
                    inputSample = o0 * level0 + o1 * level1 + o2 * level2;
                }
                phase0 += dt0;
                phase1 += dt1;
                phase2 += dt2;
                if (phase0 >= 1)
                    phase0 -= 1;
                if (phase1 >= 1)
                    phase1 -= 1;
                if (phase2 >= 1)
                    phase2 -= 1;
                dt0 *= scale0;
                dt1 *= scale1;
                dt2 *= scale2;
                const sample = applyFilters(inputSample, initialFilterInput1, initialFilterInput2, filterCount, filters);
                initialFilterInput2 = initialFilterInput1;
                initialFilterInput1 = inputSample;
                data[sampleIndex] += sample * expression;
                expression += expressionDelta;
            }
            tone.phases[0] = phase0;
            tone.phases[1] = phase1;
            tone.phases[2] = phase2;
            tone.phaseDeltas[0] = dt0;
            tone.phaseDeltas[1] = dt1;
            tone.phaseDeltas[2] = dt2;
            tone.flRounded0 = rounded0;
            tone.flRounded1 = rounded1;
            tone.flRounded2 = rounded2;
            tone.expression = expression;
            synth.sanitizeFilters(filters);
            tone.initialNoteFilterInput1 = initialFilterInput1;
            tone.initialNoteFilterInput2 = initialFilterInput2;
        }
        static oscillate(shape, t, dt) {
            switch (shape) {
                case 0: return Math.sin(t * 6.283185307179586);
                case 1: return 1 - 4 * Math.abs(t - 0.5);
                case 2: {
                    let v = t < 0.5 ? 1 : -1;
                    v += flPolyBlep(t, dt);
                    v -= flPolyBlep((t + 0.5) % 1, dt);
                    return v;
                }
                case 3:
                case 4: return 2 * t - 1 - flPolyBlep(t, dt);
                case 5: return Math.random() * 2 - 1;
                case 6: {
                    let v = t < 0.25 ? 1 : -1;
                    v += flPolyBlep(t, dt);
                    v -= flPolyBlep((t + 0.75) % 1, dt);
                    return v - 0.5;
                }
            }
            return 0;
        }
    }
    // ---------------------------------------------------------- polyphony
    // BeepBox FL lets notes overlap inside a pattern (so each note of a chord
    // can have its own length). While more than one note sounds at once, each
    // tone is matched to its (note, pitch index) by identity so nothing
    // retriggers when other notes start or stop around it.
    Synth.prototype.flDeterminePolyphonicTones = function (song, channelIndex, instrumentIndex, instrumentState, activeNotes, currentPart, currentTick, samplesPerTick) {
        const instrument = song.channels[channelIndex].instruments[instrumentIndex];
        const chord = instrument.getChord();
        const toneList = instrumentState.activeTones;
        const notes = activeNotes.slice().sort((a, b) => a.start - b.start);
        const existing = [];
        while (toneList.count() > 0)
            existing.push(toneList.popFront());
        let toneCount = 0;
        if (chord.singleTone) {
            const primary = notes[0];
            let tone = null;
            for (let i = 0; i < existing.length; i++) {
                if (notes.indexOf(existing[i].note) != -1) {
                    tone = existing.splice(i, 1)[0];
                    break;
                }
            }
            if (tone == null)
                tone = this.newTone();
            const pitches = [];
            for (const n of notes)
                for (const p of n.pitches)
                    if (pitches.indexOf(p) == -1)
                        pitches.push(p);
            for (let i = 0; i < pitches.length; i++)
                tone.pitches[i] = pitches[i];
            tone.pitchCount = pitches.length;
            tone.chordSize = 1;
            tone.instrumentIndex = instrumentIndex;
            tone.note = primary;
            tone.noteStartPart = primary.start;
            tone.noteEndPart = primary.end;
            tone.prevNote = tone.nextNote = null;
            tone.prevNotePitchIndex = tone.nextNotePitchIndex = 0;
            tone.atNoteStart = (Config.ticksPerPart * primary.start == currentTick);
            tone.passedEndOfNote = false;
            tone.forceContinueAtStart = false;
            tone.forceContinueAtEnd = false;
            toneList.pushBack(tone);
            toneCount = 1;
            this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
        }
        else {
            for (const n of notes) {
                let strumOffsetParts = 0;
                for (let i = 0; i < n.pitches.length; i++) {
                    const noteStartPart = n.start + strumOffsetParts;
                    strumOffsetParts += chord.strumParts;
                    if (noteStartPart > currentPart)
                        break;
                    let tone = null;
                    for (let j = 0; j < existing.length; j++) {
                        if (existing[j].note == n && existing[j].prevNotePitchIndex == i) {
                            tone = existing.splice(j, 1)[0];
                            break;
                        }
                    }
                    if (tone == null)
                        tone = this.newTone();
                    tone.pitches[0] = n.pitches[i];
                    tone.pitchCount = 1;
                    tone.chordSize = n.pitches.length;
                    tone.instrumentIndex = instrumentIndex;
                    tone.note = n;
                    tone.noteStartPart = noteStartPart;
                    tone.noteEndPart = n.end;
                    tone.prevNote = tone.nextNote = null;
                    tone.prevNotePitchIndex = tone.nextNotePitchIndex = i;
                    tone.atNoteStart = (Config.ticksPerPart * noteStartPart == currentTick);
                    tone.passedEndOfNote = false;
                    tone.forceContinueAtStart = false;
                    tone.forceContinueAtEnd = false;
                    toneList.pushBack(tone);
                    toneCount++;
                    this.computeTone(song, channelIndex, samplesPerTick, tone, false, false);
                }
            }
        }
        for (const tone of existing) {
            if (tone.isOnLastTick)
                this.freeTone(tone);
            else
                this.releaseTone(instrumentState, tone);
        }
        return toneCount;
    };
    // When overlapping notes stop overlapping, put the remaining note's tones
    // back at the front of the list where BeepBox's normal logic expects them.
    Synth.prototype.flRestoreToneOrder = function (toneList, note) {
        const matched = [];
        const others = [];
        while (toneList.count() > 0) {
            const tone = toneList.popFront();
            (tone.note == note ? matched : others).push(tone);
        }
        matched.sort((a, b) => a.prevNotePitchIndex - b.prevNotePitchIndex);
        for (const tone of matched)
            toneList.pushBack(tone);
        for (const tone of others)
            toneList.pushBack(tone);
    };
    // ---------------------------------------------------------- FX: PEQ
    class FLPEQState {
        constructor() {
            this.hash = "";
            this.sampleRate = 0;
            this.sections = [];
            this.outGain = 1;
        }
        update(settings, sampleRate) {
            const hash = settings.hash();
            if (hash == this.hash && sampleRate == this.sampleRate)
                return;
            const oldSections = this.sections;
            this.hash = hash;
            this.sampleRate = sampleRate;
            this.sections = [];
            for (const band of settings.bands) {
                if (!band.on)
                    continue;
                if ((band.type == 1 || band.type == 2 || band.type == 5) && band.gain == 0)
                    continue;
                const count = flBandSections(band);
                for (let s = 0; s < count; s++) {
                    const c = flBiquad(band.type, band.freq, band.gain, flBandSectionQ(band, s), sampleRate, {});
                    const old = oldSections[this.sections.length];
                    c.l1 = old ? old.l1 : 0;
                    c.l2 = old ? old.l2 : 0;
                    c.r1 = old ? old.r1 : 0;
                    c.r2 = old ? old.r2 : 0;
                    this.sections.push(c);
                }
            }
            this.outGain = Math.pow(10, settings.outGain / 20);
        }
        process(left, right, start, end) {
            const sections = this.sections;
            for (let s = 0; s < sections.length; s++) {
                const c = sections[s];
                const b0 = c.b0, b1 = c.b1, b2 = c.b2, a1 = c.a1, a2 = c.a2;
                let l1 = c.l1, l2 = c.l2, r1 = c.r1, r2 = c.r2;
                for (let i = start; i < end; i++) {
                    const xl = left[i];
                    const yl = b0 * xl + l1;
                    l1 = b1 * xl - a1 * yl + l2;
                    l2 = b2 * xl - a2 * yl;
                    left[i] = yl;
                    const xr = right[i];
                    const yr = b0 * xr + r1;
                    r1 = b1 * xr - a1 * yr + r2;
                    r2 = b2 * xr - a2 * yr;
                    right[i] = yr;
                }
                if (!(Math.abs(l1) < 1e6) || !(Math.abs(r1) < 1e6)) {
                    l1 = l2 = r1 = r2 = 0;
                }
                if (Math.abs(l1) < 1e-24)
                    l1 = 0;
                if (Math.abs(l2) < 1e-24)
                    l2 = 0;
                if (Math.abs(r1) < 1e-24)
                    r1 = 0;
                if (Math.abs(r2) < 1e-24)
                    r2 = 0;
                c.l1 = l1;
                c.l2 = l2;
                c.r1 = r1;
                c.r2 = r2;
            }
            if (this.outGain != 1) {
                const g = this.outGain;
                for (let i = start; i < end; i++) {
                    left[i] *= g;
                    right[i] *= g;
                }
            }
        }
    }
    // ---------------------------------------------------------- FX: Gross Beat
    class FLGrossState {
        constructor() {
            this.bufferL = null;
            this.bufferR = null;
            this.mask = 0;
            this.writeIndex = 0;
            this.gain = 1;
            this.delay = 0;
            this.fadeDelay = 0;
            this.fadeRemaining = 0;
            this.freeBeat = 0;
        }
        _ensureBuffer(samples) {
            const size = Synth.fittingPowerOfTwo(Math.min(1 << 21, Math.max(1024, samples + 512)));
            if (this.bufferL == null || this.bufferL.length < size) {
                this.bufferL = new Float32Array(size);
                this.bufferR = new Float32Array(size);
                this.mask = size - 1;
                this.writeIndex = 0;
            }
        }
        process(settings, synth, left, right, start, end, beatPos, samplesPerBeat, beatsPerBar) {
            const volumePreset = FLConfig.grossVolumePresets[settings.volume];
            const timePreset = FLConfig.grossTimePresets[settings.time];
            const mix = settings.mix / 100;
            const lengthSetting = FLConfig.grossLengths[settings.length];
            const periodBeats = lengthSetting.beats > 0 ? lengthSetting.beats : (lengthSetting.beats == 0 ? beatsPerBar : beatsPerBar * 2);
            const usesTime = settings.time != 0;
            const usesVolume = settings.volume != 0;
            if (!usesTime && !usesVolume)
                return;
            if (usesTime)
                this._ensureBuffer(Math.ceil(Math.max(periodBeats, 2) * samplesPerBeat * 1.05));
            const steps = settings.steps;
            const volumeFn = settings.volume == FLConfig.grossCustomIndex ? ((x) => steps[Math.min(15, Math.floor(x * 16))] / 8) : volumePreset.fn;
            const timeFn = timePreset.fn;
            const smooth = 1 - Math.exp(-1 / (0.0025 * synth.samplesPerSecond));
            const fadeLength = Math.max(16, Math.floor(0.004 * synth.samplesPerSecond));
            const beatStep = 1 / samplesPerBeat;
            let gain = this.gain;
            let delay = this.delay;
            let fadeDelay = this.fadeDelay;
            let fadeRemaining = this.fadeRemaining;
            let writeIndex = this.writeIndex;
            const bufferL = this.bufferL, bufferR = this.bufferR, mask = this.mask;
            const maxDelay = usesTime ? bufferL.length - 4 : 0;
            let pos = beatPos;
            for (let i = start; i < end; i++) {
                const phaseBeats = ((pos % periodBeats) + periodBeats) % periodBeats;
                const x = phaseBeats / periodBeats;
                const dryL = left[i], dryR = right[i];
                let wetL = dryL, wetR = dryR;
                if (usesTime) {
                    bufferL[writeIndex] = dryL;
                    bufferR[writeIndex] = dryR;
                    const targetDelay = Math.max(0, Math.min(maxDelay, timeFn(phaseBeats, periodBeats) * samplesPerBeat));
                    if (Math.abs(targetDelay - delay) > 48) {
                        fadeDelay = delay + 1;
                        fadeRemaining = fadeLength;
                    }
                    delay = targetDelay;
                    let readPos = writeIndex - delay;
                    let index = Math.floor(readPos);
                    let frac = readPos - index;
                    wetL = bufferL[index & mask] + (bufferL[(index + 1) & mask] - bufferL[index & mask]) * frac;
                    wetR = bufferR[index & mask] + (bufferR[(index + 1) & mask] - bufferR[index & mask]) * frac;
                    if (fadeRemaining > 0) {
                        const t = fadeRemaining / fadeLength;
                        readPos = writeIndex - fadeDelay;
                        index = Math.floor(readPos);
                        frac = readPos - index;
                        const oldL = bufferL[index & mask] + (bufferL[(index + 1) & mask] - bufferL[index & mask]) * frac;
                        const oldR = bufferR[index & mask] + (bufferR[(index + 1) & mask] - bufferR[index & mask]) * frac;
                        wetL = wetL * (1 - t) + oldL * t;
                        wetR = wetR * (1 - t) + oldR * t;
                        fadeRemaining--;
                    }
                    writeIndex = (writeIndex + 1) & mask;
                }
                if (usesVolume) {
                    gain += (volumeFn(x, periodBeats) - gain) * smooth;
                    wetL *= gain;
                    wetR *= gain;
                }
                left[i] = dryL + (wetL - dryL) * mix;
                right[i] = dryR + (wetR - dryR) * mix;
                pos += beatStep;
            }
            this.gain = gain;
            this.delay = delay;
            this.fadeDelay = fadeDelay;
            this.fadeRemaining = fadeRemaining;
            this.writeIndex = writeIndex;
        }
    }
    // ---------------------------------------------------------- FX: Soundgoodizer
    class FLSoundgoodizerState {
        constructor() {
            this.envelope = 0;
            this.lowL = this.lowR = 0;
            this.highL = this.highR = 0;
            this.makeup = 1;
        }
        process(settings, synth, left, right, start, end) {
            const a = settings.amount / 100;
            if (a <= 0)
                return;
            const sr = synth.samplesPerSecond;
            const mode = settings.mode;
            const drive = 1 + a * [1.2, 1.4, 3.5, 1.8][mode];
            const ratio = 1 + a * [2.5, 2.5, 9, 3][mode];
            const threshold = Math.pow(10, -(4 + 14 * a) / 20);
            const attack = 1 - Math.exp(-1 / (sr * [0.004, 0.003, 0.0012, 0.006][mode]));
            const release = 1 - Math.exp(-1 / (sr * [0.09, 0.07, 0.05, 0.14][mode]));
            const lowCoef = 1 - Math.exp(-2 * Math.PI * 140 / sr);
            const highCoef = 1 - Math.exp(-2 * Math.PI * 3200 / sr);
            const bassBoost = mode == 3 ? 1.4 * a : (mode == 0 ? 0.25 * a : 0.1 * a);
            const airBoost = mode == 1 ? 1.3 * a : (mode == 2 ? 0.45 * a : 0.15 * a);
            const width = mode == 1 ? 1 + 0.35 * a : 1;
            const makeupTarget = Math.pow(threshold, 1 - 1 / ratio) * -1 + 1 + (mode == 2 ? 1.4 * a : 0.7 * a);
            let envelope = this.envelope;
            let lowL = this.lowL, lowR = this.lowR, smoothL = this.highL, smoothR = this.highR;
            for (let i = start; i < end; i++) {
                let l = left[i] * drive;
                let r = right[i] * drive;
                lowL += (l - lowL) * lowCoef;
                lowR += (r - lowR) * lowCoef;
                smoothL += (l - smoothL) * highCoef;
                smoothR += (r - smoothR) * highCoef;
                const airL = l - smoothL;
                const airR = r - smoothR;
                l += lowL * bassBoost + Math.tanh(airL * 2) * 0.5 * airBoost;
                r += lowR * bassBoost + Math.tanh(airR * 2) * 0.5 * airBoost;
                if (width != 1) {
                    const mid = (l + r) * 0.5;
                    const side = (l - r) * 0.5 * width;
                    l = mid + side;
                    r = mid - side;
                }
                const level = Math.max(Math.abs(l), Math.abs(r));
                envelope += (level - envelope) * (level > envelope ? attack : release);
                let gain = 1;
                if (envelope > threshold) {
                    gain = Math.pow(envelope / threshold, 1 / ratio - 1);
                }
                const makeup = Math.max(1, makeupTarget);
                l = Math.tanh(l * gain * makeup * 0.9) / 0.9;
                r = Math.tanh(r * gain * makeup * 0.9) / 0.9;
                left[i] = l / drive * (1 + 0.5 * a);
                right[i] = r / drive * (1 + 0.5 * a);
            }
            if (!(Math.abs(envelope) < 1e6))
                envelope = 0;
            this.envelope = envelope;
            this.lowL = lowL;
            this.lowR = lowR;
            this.highL = smoothL;
            this.highR = smoothR;
        }
    }
    class FLFX {
        static getBeatPosition(synth, samplesPerTick) {
            const song = synth.song;
            if (!synth.isPlayingSong) {
                return synth.flFreeBeat;
            }
            const tickFraction = Math.max(0, Math.min(1, 1 - synth.tickSampleCountdown / samplesPerTick));
            return synth.bar * song.beatsPerBar + synth.beat + (synth.part + (synth.tick + tickFraction) / Config.ticksPerPart) / Config.partsPerBeat;
        }
        static _context(synth, beatPos, samplesPerBeat) {
            const ctx = FLFX._ctx;
            ctx.sampleRate = synth.samplesPerSecond;
            ctx.beatPos = beatPos;
            ctx.samplesPerBeat = samplesPerBeat;
            ctx.bpm = synth.song.tempo;
            ctx.beatsPerBar = synth.song.beatsPerBar;
            ctx.playing = synth.isPlayingSong;
            return ctx;
        }
        // Runs a list of plugin effects. `states` keeps one state per slot and
        // is rebuilt for a slot when its plugin changes.
        static _processInserts(synth, inserts, states, left, right, start, end, ctx) {
            for (let i = 0; i < inserts.length; i++) {
                const insert = inserts[i];
                const plugin = CarrotPlugins.get(insert.id);
                if (plugin == null || plugin.kind != "effect") {
                    states[i] = null;
                    continue;
                }
                let slot = states[i];
                if (slot == null || slot.plugin != plugin || slot.sampleRate != ctx.sampleRate) {
                    try {
                        slot = states[i] = { plugin: plugin, sampleRate: ctx.sampleRate, state: plugin.createState(ctx.sampleRate, insert.params) };
                    }
                    catch (error) {
                        CarrotPlugins.reportError(plugin, error);
                        continue;
                    }
                }
                if (!insert.on)
                    continue;
                try {
                    plugin.process(slot.state, insert.params, left, right, start, end, ctx);
                }
                catch (error) {
                    CarrotPlugins.reportError(plugin, error);
                    insert.on = false;
                }
            }
            states.length = inserts.length;
        }
        static processInstrument(synth, instrument, instrumentState, left, right, start, end, beatPos, samplesPerBeat) {
            const fl = instrument.fl;
            if (!instrumentState.flFx)
                instrumentState.flFx = { peq: new FLPEQState(), gross: new FLGrossState(), sg: new FLSoundgoodizerState(), inserts: [], plugin: null };
            const state = instrumentState.flFx;
            if (instrument.type == FLConfig.typePlugin && fl.plugin.id != null) {
                const plugin = CarrotPlugins.get(fl.plugin.id);
                if (plugin != null && plugin.processInstrument) {
                    const ctx = FLFX._context(synth, beatPos, samplesPerBeat);
                    if (state.plugin == null || state.plugin.plugin != plugin || state.plugin.sampleRate != ctx.sampleRate) {
                        state.plugin = { plugin: plugin, sampleRate: ctx.sampleRate, state: plugin.createInstrumentState ? plugin.createInstrumentState(ctx.sampleRate) : {} };
                    }
                    try {
                        plugin.processInstrument(state.plugin.state, fl.plugin.params, left, right, start, end, ctx);
                    }
                    catch (error) {
                        CarrotPlugins.reportError(plugin, error);
                    }
                }
            }
            if (fl.fx & FLConfig.fxPEQ) {
                state.peq.update(fl.peq, synth.samplesPerSecond);
                state.peq.process(left, right, start, end);
            }
            if (fl.fx & FLConfig.fxGross) {
                state.gross.process(fl.gross, synth, left, right, start, end, beatPos, samplesPerBeat, synth.song.beatsPerBar);
            }
            if (fl.fx & FLConfig.fxSoundgoodizer) {
                state.sg.process(fl.sg, synth, left, right, start, end);
            }
            if (fl.inserts.length > 0) {
                FLFX._processInserts(synth, fl.inserts, state.inserts, left, right, start, end, FLFX._context(synth, beatPos, samplesPerBeat));
            }
            FLFX._sanitize(left, right, start, end);
        }
        static processMaster(synth, left, right, start, end, beatPos, samplesPerBeat) {
            const fl = synth.song.fl;
            if (!synth.flMasterFx)
                synth.flMasterFx = { peq: new FLPEQState(), gross: new FLGrossState(), sg: new FLSoundgoodizerState(), inserts: [] };
            const state = synth.flMasterFx;
            if (fl.masterFx & FLConfig.fxPEQ) {
                state.peq.update(fl.masterPeq, synth.samplesPerSecond);
                state.peq.process(left, right, start, end);
            }
            if (fl.masterFx & FLConfig.fxGross) {
                state.gross.process(fl.masterGross, synth, left, right, start, end, beatPos, samplesPerBeat, synth.song.beatsPerBar);
            }
            if (fl.masterFx & FLConfig.fxSoundgoodizer) {
                state.sg.process(fl.masterSg, synth, left, right, start, end);
            }
            if (fl.masterInserts.length > 0) {
                FLFX._processInserts(synth, fl.masterInserts, state.inserts, left, right, start, end, FLFX._context(synth, beatPos, samplesPerBeat));
                FLFX._sanitize(left, right, start, end);
            }
        }
        // A plugin bug must never leave NaNs in the mix (they'd silence everything).
        static _sanitize(left, right, start, end) {
            if (Number.isFinite(left[start]) && Number.isFinite(right[start]) && Number.isFinite(left[end - 1]) && Number.isFinite(right[end - 1]))
                return;
            for (let i = start; i < end; i++) {
                if (!Number.isFinite(left[i]))
                    left[i] = 0.0;
                if (!Number.isFinite(right[i]))
                    right[i] = 0.0;
            }
        }
        static tapAnalyzer(analyzer, left, right, start, end) {
            const data = analyzer.data;
            const mask = data.length - 1;
            let pos = analyzer.pos;
            for (let i = start; i < end; i++) {
                data[pos] = (left[i] + right[i]) * 0.5;
                pos = (pos + 1) & mask;
            }
            analyzer.pos = pos;
            analyzer.lastWrite = performance.now();
        }
    }
    FLFX._ctx = { sampleRate: 44100, beatPos: 0, samplesPerBeat: 22050, bpm: 120, beatsPerBar: 4, playing: false };
