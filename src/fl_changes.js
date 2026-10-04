    // Generic undoable-by-history change for FL settings: mutate inside the
    // callback, and the song is re-serialized into the URL history.
    class ChangeFL extends Change {
        constructor(doc, mutate, isInstrumentSetting = true) {
            super();
            const result = mutate();
            if (result !== false) {
                if (isInstrumentSetting) {
                    const instrument = doc.song.channels[doc.channel].instruments[doc.getCurrentInstrument()];
                    instrument.preset = instrument.type;
                }
                doc.notifier.changed();
                this._didSomething();
            }
        }
    }
