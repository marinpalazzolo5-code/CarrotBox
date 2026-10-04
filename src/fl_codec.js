    // ======================================================================
    // BeepBox FL: codecs
    // - JSON blobs packed into BeepBox's URL alphabet (song format v10 tags)
    // - ZIP reader (for FL Studio sound/drum kits shipped as .zip)
    // - WAV / AIFF parsing (with root key, loop and cue/slice metadata) and
    //   WAV writing.
    // ======================================================================
    const flTextEncoder = new TextEncoder();
    const flTextDecoder = new TextDecoder("utf-8");
    function flWriteLength(buffer, length) {
        const digits = [];
        let remaining = length;
        do {
            digits.unshift(base64IntToCharCode[remaining & 0x3f]);
            remaining = remaining >> 6;
        } while (remaining > 0);
        buffer.push(base64IntToCharCode[digits.length]);
        Array.prototype.push.apply(buffer, digits);
    }
    function flReadLength(compressed, charIndex) {
        let digitCount = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
        let value = 0;
        while (digitCount-- > 0) {
            value = (value << 6) + base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
        }
        return { value, charIndex };
    }
    // Writes tag + byteLength + 4 chars per 3 bytes of UTF-8 JSON.
    function flWriteJsonTag(buffer, tagCharCode, object) {
        const bytes = flTextEncoder.encode(JSON.stringify(object));
        buffer.push(tagCharCode);
        flWriteLength(buffer, bytes.length);
        for (let i = 0; i < bytes.length; i += 3) {
            const b0 = bytes[i];
            const b1 = (i + 1 < bytes.length) ? bytes[i + 1] : 0;
            const b2 = (i + 2 < bytes.length) ? bytes[i + 2] : 0;
            const triple = (b0 << 16) | (b1 << 8) | b2;
            buffer.push(base64IntToCharCode[(triple >> 18) & 63], base64IntToCharCode[(triple >> 12) & 63], base64IntToCharCode[(triple >> 6) & 63], base64IntToCharCode[triple & 63]);
        }
    }
    function flReadJsonTag(compressed, charIndex) {
        const lengthResult = flReadLength(compressed, charIndex);
        const byteLength = lengthResult.value;
        charIndex = lengthResult.charIndex;
        const bytes = new Uint8Array(byteLength);
        const groups = Math.ceil(byteLength / 3);
        for (let g = 0; g < groups; g++) {
            const c0 = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
            const c1 = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
            const c2 = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
            const c3 = base64CharCodeToInt[compressed.charCodeAt(charIndex++)];
            const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
            const i = g * 3;
            bytes[i] = (triple >> 16) & 255;
            if (i + 1 < byteLength)
                bytes[i + 1] = (triple >> 8) & 255;
            if (i + 2 < byteLength)
                bytes[i + 2] = triple & 255;
        }
        let value = null;
        try {
            value = JSON.parse(flTextDecoder.decode(bytes));
        }
        catch (error) {
            console.warn("BeepBox FL: could not parse embedded settings", error);
        }
        return { value, charIndex };
    }
    // Standard base64 for project files.
    function flBytesToBase64(bytes) {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }
    function flBase64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    // 64-bit-ish FNV-1a content hash used for stable sample ids.
    function flHashBytes(bytes) {
        let h1 = 0x811c9dc5 >>> 0;
        let h2 = 0x01000193 >>> 0;
        for (let i = 0; i < bytes.length; i++) {
            h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
            h2 = Math.imul(h2 ^ bytes[(bytes.length - 1 - i)], 2246822519) >>> 0;
        }
        h2 = (h2 ^ bytes.length) >>> 0;
        return ("00000000" + h1.toString(16)).slice(-8) + ("00000000" + h2.toString(16)).slice(-8);
    }
    const flAudioExtensions = ["wav", "wave", "mp3", "ogg", "oga", "flac", "aif", "aiff", "aifc", "m4a", "aac", "opus", "webm"];
    function flFileExtension(name) {
        const dot = name.lastIndexOf(".");
        return dot == -1 ? "" : name.slice(dot + 1).toLowerCase();
    }
    function flIsAudioFileName(name) {
        const base = name.split("/").pop();
        if (base.startsWith("._") || base.startsWith("."))
            return false;
        return flAudioExtensions.indexOf(flFileExtension(base)) != -1;
    }
    // ---------------------------------------------------------------- ZIP
    class FLZipReader {
        static async read(arrayBuffer) {
            const view = new DataView(arrayBuffer);
            const bytes = new Uint8Array(arrayBuffer);
            let eocd = -1;
            for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
                if (view.getUint32(i, true) == 0x06054b50) {
                    eocd = i;
                    break;
                }
            }
            if (eocd == -1)
                throw new Error("This doesn't look like a .zip file.");
            let entryCount = view.getUint16(eocd + 10, true);
            let centralOffset = view.getUint32(eocd + 16, true);
            if (centralOffset == 0xFFFFFFFF || entryCount == 0xFFFF) {
                const locator = eocd - 20;
                if (locator >= 0 && view.getUint32(locator, true) == 0x07064b50) {
                    const zip64Eocd = Number(view.getBigUint64(locator + 8, true));
                    entryCount = Number(view.getBigUint64(zip64Eocd + 32, true));
                    centralOffset = Number(view.getBigUint64(zip64Eocd + 48, true));
                }
            }
            const entries = [];
            let p = centralOffset;
            for (let e = 0; e < entryCount; e++) {
                if (view.getUint32(p, true) != 0x02014b50)
                    break;
                const flags = view.getUint16(p + 8, true);
                const method = view.getUint16(p + 10, true);
                let compressedSize = view.getUint32(p + 20, true);
                let size = view.getUint32(p + 24, true);
                const nameLength = view.getUint16(p + 28, true);
                const extraLength = view.getUint16(p + 30, true);
                const commentLength = view.getUint16(p + 32, true);
                let localOffset = view.getUint32(p + 42, true);
                const nameBytes = bytes.subarray(p + 46, p + 46 + nameLength);
                let name;
                if (flags & 0x800) {
                    name = flTextDecoder.decode(nameBytes);
                }
                else {
                    try {
                        name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
                    }
                    catch (error) {
                        name = String.fromCharCode.apply(null, nameBytes);
                    }
                }
                let x = p + 46 + nameLength;
                const extraEnd = x + extraLength;
                while (x + 4 <= extraEnd) {
                    const id = view.getUint16(x, true);
                    const len = view.getUint16(x + 2, true);
                    if (id == 0x0001) {
                        let q = x + 4;
                        if (size == 0xFFFFFFFF) {
                            size = Number(view.getBigUint64(q, true));
                            q += 8;
                        }
                        if (compressedSize == 0xFFFFFFFF) {
                            compressedSize = Number(view.getBigUint64(q, true));
                            q += 8;
                        }
                        if (localOffset == 0xFFFFFFFF) {
                            localOffset = Number(view.getBigUint64(q, true));
                        }
                    }
                    x += 4 + len;
                }
                p = extraEnd + commentLength;
                if (name.endsWith("/"))
                    continue;
                entries.push({
                    name: name.replace(/\\/g, "/"),
                    size: size,
                    getData: async () => {
                        const localNameLength = view.getUint16(localOffset + 26, true);
                        const localExtraLength = view.getUint16(localOffset + 28, true);
                        const start = localOffset + 30 + localNameLength + localExtraLength;
                        const raw = bytes.subarray(start, start + compressedSize);
                        if (method == 0)
                            return raw.slice();
                        if (method == 8) {
                            if (typeof DecompressionStream == "undefined")
                                throw new Error("This browser can't unzip files. Please unzip the kit and import the folder instead.");
                            const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
                            return new Uint8Array(await new Response(stream).arrayBuffer());
                        }
                        throw new Error("Unsupported zip compression method " + method + " for " + name);
                    },
                });
            }
            return entries;
        }
    }
    // ---------------------------------------------------------- WAV / AIFF
    function flReadFourCC(view, offset) {
        return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    }
    function flReadExtended80(view, offset) {
        const exponent = view.getUint16(offset, false);
        const hi = view.getUint32(offset + 2, false);
        const lo = view.getUint32(offset + 6, false);
        if (exponent == 0 && hi == 0 && lo == 0)
            return 0;
        const sign = (exponent & 0x8000) ? -1 : 1;
        const e = (exponent & 0x7fff) - 16383;
        return sign * (hi * Math.pow(2, e - 31) + lo * Math.pow(2, e - 63));
    }
    // Returns { channels: Float32Array[], sampleRate, rootKey?, loopStart?, loopEnd?, cues?: number[] (frames) } or null.
    function flParseWav(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        if (arrayBuffer.byteLength < 12 || flReadFourCC(view, 0) != "RIFF" || flReadFourCC(view, 8) != "WAVE")
            return null;
        let format = 0, channelCount = 0, sampleRate = 0, bits = 0, blockAlign = 0;
        let dataOffset = -1, dataLength = 0;
        const result = { channels: [], sampleRate: 44100 };
        let p = 12;
        while (p + 8 <= view.byteLength) {
            const id = flReadFourCC(view, p);
            let size = view.getUint32(p + 4, true);
            const body = p + 8;
            if (body + size > view.byteLength)
                size = view.byteLength - body;
            if (id == "fmt ") {
                format = view.getUint16(body, true);
                channelCount = view.getUint16(body + 2, true);
                sampleRate = view.getUint32(body + 4, true);
                blockAlign = view.getUint16(body + 12, true);
                bits = view.getUint16(body + 14, true);
                if (format == 0xFFFE && size >= 26) {
                    format = view.getUint16(body + 24, true);
                }
            }
            else if (id == "data") {
                dataOffset = body;
                dataLength = size;
            }
            else if (id == "smpl" && size >= 36) {
                const unityNote = view.getUint32(body + 12, true);
                if (unityNote > 0 && unityNote < 128)
                    result.rootKey = unityNote;
                const loopCount = view.getUint32(body + 28, true);
                if (loopCount > 0 && size >= 36 + 24) {
                    result.loopStart = view.getUint32(body + 36 + 8, true);
                    result.loopEnd = view.getUint32(body + 36 + 12, true);
                }
            }
            else if (id == "cue " && size >= 4) {
                const count = view.getUint32(body, true);
                const cues = [];
                for (let i = 0; i < count && body + 4 + i * 24 + 24 <= view.byteLength; i++) {
                    cues.push(view.getUint32(body + 4 + i * 24 + 20, true));
                }
                if (cues.length > 0)
                    result.cues = cues.sort((a, b) => a - b);
            }
            p = body + size + (size & 1);
        }
        if (dataOffset == -1 || channelCount == 0 || blockAlign == 0)
            return null;
        if (!((format == 1 && (bits == 8 || bits == 16 || bits == 24 || bits == 32)) || (format == 3 && (bits == 32 || bits == 64))))
            return null;
        const frames = Math.floor(dataLength / blockAlign);
        const bytesPerSample = bits >> 3;
        for (let c = 0; c < channelCount; c++)
            result.channels.push(new Float32Array(frames));
        for (let f = 0; f < frames; f++) {
            for (let c = 0; c < channelCount; c++) {
                const o = dataOffset + f * blockAlign + c * bytesPerSample;
                let v;
                if (format == 3) {
                    v = bits == 32 ? view.getFloat32(o, true) : view.getFloat64(o, true);
                }
                else if (bits == 8) {
                    v = (view.getUint8(o) - 128) / 128;
                }
                else if (bits == 16) {
                    v = view.getInt16(o, true) / 32768;
                }
                else if (bits == 24) {
                    let s = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16);
                    if (s & 0x800000)
                        s -= 0x1000000;
                    v = s / 8388608;
                }
                else {
                    v = view.getInt32(o, true) / 2147483648;
                }
                result.channels[c][f] = v;
            }
        }
        result.sampleRate = sampleRate || 44100;
        return result;
    }
    function flParseAiff(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        if (arrayBuffer.byteLength < 12 || flReadFourCC(view, 0) != "FORM")
            return null;
        const formType = flReadFourCC(view, 8);
        if (formType != "AIFF" && formType != "AIFC")
            return null;
        let channelCount = 0, frames = 0, bits = 16, sampleRate = 44100, compression = "NONE";
        let dataOffset = -1;
        let p = 12;
        while (p + 8 <= view.byteLength) {
            const id = flReadFourCC(view, p);
            const size = view.getUint32(p + 4, false);
            const body = p + 8;
            if (id == "COMM") {
                channelCount = view.getUint16(body, false);
                frames = view.getUint32(body + 2, false);
                bits = view.getUint16(body + 6, false);
                sampleRate = flReadExtended80(view, body + 8);
                if (formType == "AIFC" && size >= 22)
                    compression = flReadFourCC(view, body + 18);
            }
            else if (id == "SSND") {
                const offset = view.getUint32(body, false);
                dataOffset = body + 8 + offset;
            }
            p = body + size + (size & 1);
        }
        if (dataOffset == -1 || channelCount == 0)
            return null;
        const littleEndian = (compression == "sowt");
        const isFloat = (compression == "fl32" || compression == "FL32");
        if (!isFloat && compression != "NONE" && compression != "none" && !littleEndian)
            return null;
        const bytesPerSample = isFloat ? 4 : Math.ceil(bits / 8);
        const channels = [];
        for (let c = 0; c < channelCount; c++)
            channels.push(new Float32Array(frames));
        for (let f = 0; f < frames; f++) {
            for (let c = 0; c < channelCount; c++) {
                const o = dataOffset + (f * channelCount + c) * bytesPerSample;
                if (o + bytesPerSample > view.byteLength)
                    break;
                let v;
                if (isFloat) {
                    v = view.getFloat32(o, false);
                }
                else if (bytesPerSample == 1) {
                    v = view.getInt8(o) / 128;
                }
                else if (bytesPerSample == 2) {
                    v = view.getInt16(o, littleEndian) / 32768;
                }
                else if (bytesPerSample == 3) {
                    let s = littleEndian
                        ? (view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16))
                        : ((view.getUint8(o) << 16) | (view.getUint8(o + 1) << 8) | view.getUint8(o + 2));
                    if (s & 0x800000)
                        s -= 0x1000000;
                    v = s / 8388608;
                }
                else {
                    v = view.getInt32(o, littleEndian) / 2147483648;
                }
                channels[c][f] = v;
            }
        }
        return { channels, sampleRate: sampleRate || 44100 };
    }
    function flEncodeWav(channels, sampleRate) {
        const channelCount = channels.length;
        const frames = channels[0].length;
        const bytesPerSample = 2;
        const dataSize = frames * channelCount * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        const writeString = (o, s) => { for (let i = 0; i < s.length; i++)
            view.setUint8(o + i, s.charCodeAt(i)); };
        writeString(0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channelCount, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
        view.setUint16(32, channelCount * bytesPerSample, true);
        view.setUint16(34, 16, true);
        writeString(36, "data");
        view.setUint32(40, dataSize, true);
        let o = 44;
        for (let f = 0; f < frames; f++) {
            for (let c = 0; c < channelCount; c++) {
                const v = Math.max(-1, Math.min(1, channels[c][f]));
                view.setInt16(o, Math.round(v * 32767), true);
                o += 2;
            }
        }
        return buffer;
    }
