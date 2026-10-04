    // ======================================================================
    // BeepBox FL: sample bank, sound-kit library and IndexedDB persistence.
    //
    // Sample ids:
    //   "b:<key>"  built-in sound rendered by FLSoundFactory (always available)
    //   "u:<hash>" user sample; raw file bytes live in IndexedDB so songs that
    //              reference them keep working after a reload. Project files
    //              (.json) embed the bytes so they can be shared.
    // ======================================================================
    class FLStore {
        static _open() {
            if (FLStore._dbPromise)
                return FLStore._dbPromise;
            FLStore._dbPromise = new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error("IndexedDB is not available"));
                    return;
                }
                const request = indexedDB.open("beepbox-fl", 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains("samples"))
                        db.createObjectStore("samples", { keyPath: "id" });
                    if (!db.objectStoreNames.contains("kits"))
                        db.createObjectStore("kits", { keyPath: "id" });
                    if (!db.objectStoreNames.contains("kitFiles"))
                        db.createObjectStore("kitFiles");
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            FLStore._dbPromise.catch((error) => console.warn("BeepBox FL storage unavailable:", error));
            return FLStore._dbPromise;
        }
        static async _tx(storeName, mode, action) {
            const db = await FLStore._open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, mode);
                const store = tx.objectStore(storeName);
                let result;
                const request = action(store);
                if (request)
                    request.onsuccess = () => { result = request.result; };
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
        static get(storeName, key) {
            return FLStore._tx(storeName, "readonly", (store) => store.get(key));
        }
        static put(storeName, value, key) {
            return FLStore._tx(storeName, "readwrite", (store) => key === undefined ? store.put(value) : store.put(value, key));
        }
        static delete(storeName, key) {
            return FLStore._tx(storeName, "readwrite", (store) => store.delete(key));
        }
        static getAll(storeName) {
            return FLStore._tx(storeName, "readonly", (store) => store.getAll());
        }
        static clear(storeName) {
            return FLStore._tx(storeName, "readwrite", (store) => store.clear());
        }
        static deleteRange(storeName, prefix) {
            return FLStore._tx(storeName, "readwrite", (store) => store.delete(IDBKeyRange.bound(prefix, prefix + "￿")));
        }
    }
    class FLSampleBank {
        static get(id) {
            return id == null ? undefined : FLSampleBank._entries.get(id);
        }
        static isReady(id) {
            const entry = FLSampleBank.get(id);
            return entry != undefined && entry.status == "ready";
        }
        static getName(id) {
            const entry = FLSampleBank.get(id);
            if (entry && entry.name)
                return entry.name;
            if (id && id.startsWith("b:")) {
                const info = FLSoundFactory.getInfo(id.slice(2));
                if (info)
                    return info.name;
            }
            return id || "";
        }
        static onChange(listener) {
            FLSampleBank._listeners.add(listener);
        }
        static _notify() {
            if (FLSampleBank._notifyPending)
                return;
            FLSampleBank._notifyPending = true;
            setTimeout(() => {
                FLSampleBank._notifyPending = false;
                for (const listener of FLSampleBank._listeners) {
                    try {
                        listener();
                    }
                    catch (error) {
                        console.error(error);
                    }
                }
            }, 0);
        }
        // Makes sure a sample will become available. Safe to call from the
        // audio callback: heavy work is deferred.
        static request(id) {
            if (id == null)
                return undefined;
            let entry = FLSampleBank._entries.get(id);
            if (entry != undefined)
                return entry;
            entry = { id, name: "", pcm: null, rate: 44100, status: "loading", rootKey: null, loopStart: null, loopEnd: null, cues: null };
            FLSampleBank._entries.set(id, entry);
            if (id.startsWith("b:")) {
                setTimeout(() => {
                    try {
                        const rendered = FLSoundFactory.render(id.slice(2));
                        if (rendered == null) {
                            entry.status = "missing";
                        }
                        else {
                            entry.pcm = rendered.pcm;
                            entry.rate = rendered.rate;
                            entry.name = rendered.name;
                            entry.rootKey = rendered.rootKey == undefined ? null : rendered.rootKey;
                            entry.status = "ready";
                        }
                    }
                    catch (error) {
                        console.error(error);
                        entry.status = "error";
                    }
                    FLSampleBank._notify();
                }, 0);
            }
            else {
                FLSampleBank._loadFromStore(entry);
            }
            return entry;
        }
        // Renders a built-in synchronously (used by previews and kit loading).
        static requestNow(id) {
            const entry = FLSampleBank.request(id);
            if (entry.status == "loading" && id.startsWith("b:")) {
                const rendered = FLSoundFactory.render(id.slice(2));
                if (rendered != null) {
                    entry.pcm = rendered.pcm;
                    entry.rate = rendered.rate;
                    entry.name = rendered.name;
                    entry.rootKey = rendered.rootKey == undefined ? null : rendered.rootKey;
                    entry.status = "ready";
                }
            }
            return entry;
        }
        static async whenReady(id) {
            const entry = FLSampleBank.request(id);
            for (let i = 0; i < 400 && entry.status == "loading"; i++) {
                await new Promise(r => setTimeout(r, 25));
            }
            return entry;
        }
        static async _loadFromStore(entry) {
            try {
                const record = await FLStore.get("samples", entry.id);
                if (!record) {
                    entry.status = "missing";
                    FLSampleBank._notify();
                    return;
                }
                entry.name = record.name || "";
                const bytes = new Uint8Array(record.bytes instanceof Blob ? await record.bytes.arrayBuffer() : record.bytes);
                const decoded = await FLSampleBank.decode(bytes, record.name || "");
                FLSampleBank._applyDecoded(entry, decoded);
            }
            catch (error) {
                console.warn("BeepBox FL: couldn't load sample", entry.id, error);
                entry.status = "error";
            }
            FLSampleBank._notify();
        }
        static _applyDecoded(entry, decoded) {
            const channels = decoded.channels;
            const frames = channels[0].length;
            let pcm;
            if (channels.length == 1) {
                pcm = channels[0];
            }
            else {
                pcm = new Float32Array(frames);
                const scale = 1 / channels.length;
                for (const ch of channels)
                    for (let i = 0; i < frames; i++)
                        pcm[i] += ch[i] * scale;
            }
            // NaN or infinity inside a sample would poison the whole mix; clean them out.
            for (let i = 0; i < pcm.length; i++) {
                if (!(pcm[i] > -1e4 && pcm[i] < 1e4))
                    pcm[i] = 0;
            }
            entry.pcm = pcm;
            entry.rate = decoded.sampleRate > 0 ? decoded.sampleRate : 44100;
            entry.rootKey = decoded.rootKey == undefined ? null : decoded.rootKey;
            entry.loopStart = decoded.loopStart == undefined ? null : decoded.loopStart;
            entry.loopEnd = decoded.loopEnd == undefined ? null : decoded.loopEnd;
            entry.cues = decoded.cues == undefined ? null : decoded.cues;
            entry.status = "ready";
        }
        static async decode(bytes, name) {
            const ext = flFileExtension(name);
            let parsed = null;
            try {
                if (ext == "wav" || ext == "wave" || ext == "")
                    parsed = flParseWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
                if (parsed == null && (ext == "aif" || ext == "aiff" || ext == "aifc" || ext == ""))
                    parsed = flParseAiff(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            }
            catch (error) {
                parsed = null;
            }
            if (parsed != null && parsed.channels.length > 0 && parsed.channels[0].length > 0)
                return parsed;
            const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!FLSampleBank._decodeContext)
                FLSampleBank._decodeContext = new OfflineContext(1, 1, 44100);
            const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            const audioBuffer = await new Promise((resolve, reject) => {
                const promise = FLSampleBank._decodeContext.decodeAudioData(copy, resolve, reject);
                if (promise && promise.then)
                    promise.then(resolve, reject);
            });
            const channels = [];
            for (let c = 0; c < audioBuffer.numberOfChannels; c++)
                channels.push(audioBuffer.getChannelData(c).slice());
            return { channels, sampleRate: audioBuffer.sampleRate };
        }
        // Adds raw file bytes as a user sample and returns its id.
        static async addBytes(bytes, name) {
            const id = "u:" + flHashBytes(bytes);
            let entry = FLSampleBank._entries.get(id);
            if (entry && entry.status == "ready")
                return id;
            const decoded = await FLSampleBank.decode(bytes, name);
            if (!entry) {
                entry = { id, name, pcm: null, rate: 44100, status: "loading", rootKey: null, loopStart: null, loopEnd: null, cues: null };
                FLSampleBank._entries.set(id, entry);
            }
            entry.name = name;
            FLSampleBank._applyDecoded(entry, decoded);
            FLSampleBank._notify();
            try {
                await FLStore.put("samples", { id, name, bytes: new Blob([bytes]), added: Date.now() });
            }
            catch (error) {
                console.warn("BeepBox FL: couldn't save sample to browser storage", error);
            }
            return id;
        }
        static async addFile(file) {
            return FLSampleBank.addBytes(new Uint8Array(await file.arrayBuffer()), file.name);
        }
        // Raw bytes for a project file: the original file for user samples,
        // or a rendered WAV for built-ins.
        static async getFileBytes(id) {
            if (id.startsWith("u:")) {
                const record = await FLStore.get("samples", id);
                if (record)
                    return { name: record.name, bytes: new Uint8Array(record.bytes instanceof Blob ? await record.bytes.arrayBuffer() : record.bytes) };
                const entry = FLSampleBank.get(id);
                if (entry && entry.pcm)
                    return { name: entry.name || "sample.wav", bytes: new Uint8Array(flEncodeWav([entry.pcm], entry.rate)) };
            }
            return null;
        }
        static async importEmbedded(samples) {
            for (const sample of samples || []) {
                if (!sample || typeof sample["id"] != "string" || typeof sample["data"] != "string")
                    continue;
                const id = sample["id"];
                if (FLSampleBank.isReady(id))
                    continue;
                const bytes = flBase64ToBytes(sample["data"]);
                const name = sample["name"] || "sample.wav";
                try {
                    const decoded = await FLSampleBank.decode(bytes, name);
                    let entry = FLSampleBank._entries.get(id);
                    if (!entry) {
                        entry = { id, name, pcm: null, rate: 44100, status: "loading", rootKey: null, loopStart: null, loopEnd: null, cues: null };
                        FLSampleBank._entries.set(id, entry);
                    }
                    entry.name = name;
                    FLSampleBank._applyDecoded(entry, decoded);
                    FLStore.put("samples", { id, name, bytes: new Blob([bytes]), added: Date.now() }).catch(() => { });
                }
                catch (error) {
                    console.warn("BeepBox FL: couldn't decode embedded sample", name, error);
                }
            }
            FLSampleBank._notify();
        }
        // Removes every imported sample from this browser (built-in sounds stay).
        static async clearStored() {
            await FLStore.clear("samples");
            for (const id of Array.from(FLSampleBank._entries.keys()))
                if (id.startsWith("u:"))
                    FLSampleBank._entries.delete(id);
            FLSampleBank._notify();
        }
        static async listStoredSamples() {
            try {
                const records = await FLStore.getAll("samples");
                return records.map(r => ({ id: r.id, name: r.name, added: r.added || 0 })).sort((a, b) => b.added - a.added);
            }
            catch (error) {
                return [];
            }
        }
        static collectSongSampleIds(song) {
            const ids = new Set();
            for (const channel of song.channels) {
                for (const instrument of channel.instruments) {
                    instrument.fl.collectSampleIds(instrument.type, ids);
                }
            }
            return ids;
        }
        static requestSong(song) {
            for (const id of FLSampleBank.collectSongSampleIds(song))
                FLSampleBank.request(id);
        }
        // Peaks for drawing waveforms: [min, max] pairs per bucket.
        static getPeaks(id, bucketCount) {
            const entry = FLSampleBank.get(id);
            if (!entry || entry.status != "ready")
                return null;
            const key = bucketCount | 0;
            if (!entry.peakCache)
                entry.peakCache = {};
            if (entry.peakCache[key])
                return entry.peakCache[key];
            const pcm = entry.pcm;
            const peaks = new Float32Array(key * 2);
            const per = pcm.length / key;
            for (let b = 0; b < key; b++) {
                let min = 0, max = 0;
                const start = Math.floor(b * per), end = Math.min(pcm.length, Math.max(start + 1, Math.floor((b + 1) * per)));
                for (let i = start; i < end; i++) {
                    const v = pcm[i];
                    if (v < min)
                        min = v;
                    if (v > max)
                        max = v;
                }
                peaks[b * 2] = min;
                peaks[b * 2 + 1] = max;
            }
            entry.peakCache[key] = peaks;
            return peaks;
        }
        // ---- previews (independent of the song synth)
        static _previewContext() {
            if (!FLSampleBank._previewCtx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                FLSampleBank._previewCtx = new Ctx();
            }
            if (FLSampleBank._previewCtx.state == "suspended")
                FLSampleBank._previewCtx.resume();
            return FLSampleBank._previewCtx;
        }
        static stopPreview() {
            if (FLSampleBank._previewSource) {
                try {
                    FLSampleBank._previewSource.stop();
                }
                catch (error) { }
                FLSampleBank._previewSource = null;
            }
        }
        static previewPcm(pcm, rate, start = 0, end = 1, playbackRate = 1, gain = 0.8) {
            FLSampleBank.stopPreview();
            if (!pcm || pcm.length == 0)
                return;
            const ctx = FLSampleBank._previewContext();
            const s = Math.floor(Math.max(0, Math.min(1, start)) * pcm.length);
            const e = Math.max(s + 1, Math.floor(Math.max(0, Math.min(1, end)) * pcm.length));
            const length = Math.min(e - s, Math.floor(rate * 20));
            const buffer = ctx.createBuffer(1, length, rate);
            buffer.getChannelData(0).set(pcm.subarray(s, s + length));
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = playbackRate;
            const gainNode = ctx.createGain();
            gainNode.gain.value = gain;
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            source.start();
            FLSampleBank._previewSource = source;
        }
        static async preview(id, start = 0, end = 1, playbackRate = 1) {
            const entry = id.startsWith("b:") ? FLSampleBank.requestNow(id) : await FLSampleBank.whenReady(id);
            if (entry.status == "ready")
                FLSampleBank.previewPcm(entry.pcm, entry.rate, start, end, playbackRate);
        }
        // ---- transient detection for Slicex auto-slicing
        static detectTransients(pcm, rate, sensitivity = 0.5, minGapSeconds = 0.06) {
            const hop = 256;
            const frameCount = Math.floor(pcm.length / hop);
            if (frameCount < 4)
                return [];
            const energy = new Float32Array(frameCount);
            let prevLow = 0;
            for (let f = 0; f < frameCount; f++) {
                let e = 0;
                for (let i = f * hop; i < (f + 1) * hop; i++) {
                    const x = pcm[i];
                    const high = x - prevLow;
                    prevLow += (x - prevLow) * 0.2;
                    e += x * x + 2 * high * high;
                }
                energy[f] = Math.log10(1e-6 + e / hop);
            }
            const flux = new Float32Array(frameCount);
            for (let f = 1; f < frameCount; f++)
                flux[f] = Math.max(0, energy[f] - energy[f - 1]);
            const result = [];
            const meanWindow = 12;
            const threshold = 0.08 + (1 - sensitivity) * 0.9;
            const minGap = Math.max(1, Math.round(minGapSeconds * rate / hop));
            let last = -minGap;
            let peakLevel = -6;
            for (let f = 0; f < frameCount; f++)
                peakLevel = Math.max(peakLevel, energy[f]);
            for (let f = 1; f < frameCount - 1; f++) {
                let mean = 0;
                let count = 0;
                for (let k = Math.max(0, f - meanWindow); k < Math.min(frameCount, f + meanWindow); k++) {
                    mean += flux[k];
                    count++;
                }
                mean /= count;
                if (flux[f] > threshold + mean * 1.5 && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && energy[f + 1] > peakLevel - 3.5 && f - last >= minGap) {
                    result.push(f * hop / pcm.length);
                    last = f;
                }
            }
            return result.filter(x => x > 0.002 && x < 0.998);
        }
    }
    FLSampleBank._entries = new Map();
    FLSampleBank._listeners = new Set();
    FLSampleBank._notifyPending = false;
    FLSampleBank._decodeContext = null;
    FLSampleBank._previewCtx = null;
    FLSampleBank._previewSource = null;
    // ---------------------------------------------------------------- kits
    class FLKitLibrary {
        // Everyone who asks while the kits are still being read waits for the same answer
        // (before, a second caller got an empty list and "that kit is no longer in your library").
        static load() {
            if (FLKitLibrary._loadPromise)
                return FLKitLibrary._loadPromise;
            FLKitLibrary._loadPromise = (async () => {
                try {
                    const records = await FLStore.getAll("kits");
                    FLKitLibrary.kits = records.sort((a, b) => (a.added || 0) - (b.added || 0));
                }
                catch (error) {
                    FLKitLibrary.kits = [];
                }
                FLKitLibrary._loaded = true;
                FLSampleBank._notify();
                return FLKitLibrary.kits;
            })();
            return FLKitLibrary._loadPromise;
        }
        static _kitKey(kitId, path) {
            return kitId + "/" + path;
        }
        static async _saveKit(name, files) {
            const id = "kit" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
            const entries = [];
            for (const file of files) {
                const key = FLKitLibrary._kitKey(id, file.path);
                await FLStore.put("kitFiles", file.blob, key);
                entries.push({ path: file.path, key });
            }
            entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
            const kit = { id, name, files: entries, added: Date.now() };
            await FLStore.put("kits", kit);
            FLKitLibrary.kits.push(kit);
            FLSampleBank._notify();
            return kit;
        }
        // Files from <input webkitdirectory>, <input multiple> or drag & drop.
        static async importFiles(fileList, onProgress) {
            await FLKitLibrary.load();
            const files = [];
            const zips = [];
            for (const file of Array.from(fileList)) {
                const path = (file.webkitRelativePath || file.flRelativePath || file.name).replace(/\\/g, "/");
                if (flFileExtension(file.name) == "zip")
                    zips.push(file);
                else if (flIsAudioFileName(path))
                    files.push({ path, blob: file });
            }
            const kits = [];
            for (const zip of zips)
                kits.push(await FLKitLibrary.importZip(zip, onProgress));
            if (files.length > 0) {
                const firstSegments = new Set(files.map(f => f.path.split("/")[0]));
                let name;
                let stripPrefix = "";
                if (firstSegments.size == 1 && files[0].path.indexOf("/") != -1) {
                    name = files[0].path.split("/")[0];
                    stripPrefix = name + "/";
                }
                else {
                    name = files.length == 1 ? files[0].path.replace(/\.[^.]*$/, "") : "Imported Sounds " + new Date().toLocaleDateString();
                }
                for (const file of files) {
                    if (stripPrefix && file.path.startsWith(stripPrefix))
                        file.path = file.path.slice(stripPrefix.length);
                }
                if (onProgress)
                    onProgress("Saving " + files.length + " sounds…");
                kits.push(await FLKitLibrary._saveKit(name, files));
            }
            return kits;
        }
        static async importZip(file, onProgress) {
            await FLKitLibrary.load();
            if (onProgress)
                onProgress("Reading " + file.name + "…");
            const entries = await FLZipReader.read(await file.arrayBuffer());
            const files = [];
            let done = 0;
            const audioEntries = entries.filter(e => flIsAudioFileName(e.name) && e.name.indexOf("__MACOSX") == -1);
            for (const entry of audioEntries) {
                const data = await entry.getData();
                files.push({ path: entry.name, blob: new Blob([data]) });
                done++;
                if (onProgress && done % 20 == 0)
                    onProgress("Unzipping " + done + " / " + audioEntries.length + "…");
            }
            const firstSegments = new Set(files.map(f => f.path.split("/")[0]));
            if (firstSegments.size == 1 && files.length > 0 && files[0].path.indexOf("/") != -1) {
                const prefix = files[0].path.split("/")[0] + "/";
                for (const f of files)
                    f.path = f.path.slice(prefix.length);
            }
            return FLKitLibrary._saveKit(file.name.replace(/\.zip$/i, ""), files);
        }
        // Walks folders dropped onto the page (Chrome/Edge/Safari/Firefox).
        static async filesFromDataTransfer(dataTransfer) {
            const result = [];
            const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
            const entries = items.map(item => item.webkitGetAsEntry ? item.webkitGetAsEntry() : null).filter(e => e != null);
            if (entries.length == 0)
                return Array.from(dataTransfer.files || []);
            const walk = async (entry, prefix) => {
                if (entry.isFile) {
                    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
                    file.flRelativePath = prefix + file.name;
                    result.push(file);
                }
                else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    let batch;
                    do {
                        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
                        for (const child of batch)
                            await walk(child, prefix + entry.name + "/");
                    } while (batch.length > 0);
                }
            };
            for (const entry of entries)
                await walk(entry, "");
            return result;
        }
        static async getKitFileSampleId(kit, path) {
            const file = kit.files.find(f => f.path == path);
            if (!file)
                throw new Error("Missing file " + path);
            const blob = await FLStore.get("kitFiles", file.key);
            if (!blob)
                throw new Error("Missing stored file " + path);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return FLSampleBank.addBytes(bytes, path.split("/").pop());
        }
        static async previewKitFile(kit, path) {
            const file = kit.files.find(f => f.path == path);
            if (!file)
                return;
            const blob = await FLStore.get("kitFiles", file.key);
            if (!blob)
                return;
            const decoded = await FLSampleBank.decode(new Uint8Array(await blob.arrayBuffer()), path);
            const entry = {};
            FLSampleBank._applyDecoded(entry, decoded);
            FLSampleBank.previewPcm(entry.pcm, entry.rate);
        }
        static async clearAll() {
            await FLStore.clear("kits");
            await FLStore.clear("kitFiles");
            FLKitLibrary.kits = [];
            FLSampleBank._notify();
        }
        static async removeKit(kitId) {
            await FLStore.delete("kits", kitId);
            await FLStore.deleteRange("kitFiles", kitId + "/");
            FLKitLibrary.kits = FLKitLibrary.kits.filter(k => k.id != kitId);
            FLSampleBank._notify();
        }
    }
    FLKitLibrary.kits = [];
    FLKitLibrary._loaded = false;
FLKitLibrary._loadPromise = null;
