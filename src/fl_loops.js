    // ======================================================================
    // CarrotBox: the Live Loops library.
    //
    // 1,248 loops (24 genres x 11 loop types) that are composed and rendered
    // on demand at the song's tempo, key and mode, so they always fit the song
    // without time stretching. They use the genre packs from the sound library.
    //
    // A rendered loop can be used as a sample: the id "b:ll/<loop>@<bpm>@<key>@<m|M>@<beats>"
    // renders that loop, so songs that use recorded loops keep working.
    // ======================================================================
    const FL_LOOP_TYPES = [
        { name: "Drum Beat", slug: "drums", count: 8, bars: 2, color: "#ff6b6b" },
        { name: "Top Loop", slug: "tops", count: 6, bars: 2, color: "#ff9f43" },
        { name: "Percussion", slug: "perc", count: 4, bars: 2, color: "#feca57" },
        { name: "Bass", slug: "bass", count: 6, bars: 4, color: "#1dd1a1" },
        { name: "Chords", slug: "chords", count: 6, bars: 4, color: "#54a0ff" },
        { name: "Keys", slug: "keys", count: 5, bars: 4, color: "#48dbfb" },
        { name: "Melody", slug: "melody", count: 5, bars: 4, color: "#a29bfe" },
        { name: "Arp", slug: "arp", count: 4, bars: 2, color: "#f368e0" },
        { name: "Pad", slug: "pad", count: 3, bars: 4, color: "#00d2d3" },
        { name: "FX", slug: "fx", count: 2, bars: 4, color: "#c8d6e5" },
        { name: "Vocal Chop", slug: "vox", count: 3, bars: 2, color: "#ff9ff3" },
    ];
    // feel, swing (0..0.5 of a 16th), whether chords use sevenths, progressions (scale degrees, 0 = I)
    const FL_LOOP_GENRES = [
        { name: "Trap", bpm: 140, feel: "halftime", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [0, 0, 5, 6], [0, 3, 5, 4], [5, 3, 0, 4], [0, 6, 5, 6]] },
        { name: "Drill", bpm: 142, feel: "drill", swing: 0, sevenths: false, progs: [[0, 5, 6, 4], [0, 3, 5, 6], [0, 0, 3, 4], [5, 6, 0, 0]] },
        { name: "Boom Bap", bpm: 90, feel: "boombap", swing: 0.18, sevenths: true, progs: [[0, 3, 0, 4], [1, 4, 0, 0], [0, 5, 3, 4], [3, 4, 0, 5]] },
        { name: "Lo-Fi", bpm: 80, feel: "boombap", swing: 0.22, sevenths: true, progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 0], [0, 3, 1, 4]] },
        { name: "R&B", bpm: 75, feel: "rnb", swing: 0.12, sevenths: true, progs: [[0, 5, 1, 4], [3, 4, 2, 5], [0, 3, 4, 3], [1, 4, 0, 0]] },
        { name: "Pop", bpm: 110, feel: "pop", swing: 0, sevenths: false, progs: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [0, 3, 4, 3]] },
        { name: "House", bpm: 124, feel: "fourfloor", swing: 0.05, sevenths: true, progs: [[0, 3, 5, 4], [5, 3, 0, 4], [1, 4, 0, 5], [0, 5, 3, 3]] },
        { name: "Deep House", bpm: 120, feel: "fourfloor", swing: 0.1, sevenths: true, progs: [[1, 4, 0, 5], [0, 5, 1, 4], [5, 3, 4, 0], [0, 2, 3, 4]] },
        { name: "Tech House", bpm: 126, feel: "techhouse", swing: 0.06, sevenths: false, progs: [[0, 0, 5, 5], [0, 6, 5, 6], [0, 3, 0, 4], [0, 0, 0, 6]] },
        { name: "Techno", bpm: 130, feel: "techno", swing: 0, sevenths: false, progs: [[0, 0, 0, 0], [0, 0, 6, 6], [0, 5, 0, 6], [0, 2, 0, 5]] },
        { name: "Drum & Bass", bpm: 172, feel: "breakbeat", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [0, 6, 5, 4], [0, 3, 5, 6], [5, 3, 0, 4]] },
        { name: "Jungle", bpm: 165, feel: "jungle", swing: 0.05, sevenths: true, progs: [[0, 3, 0, 4], [1, 4, 0, 0], [0, 5, 3, 4], [5, 4, 3, 4]] },
        { name: "Dubstep", bpm: 140, feel: "halftime", swing: 0, sevenths: false, progs: [[0, 5, 3, 6], [0, 0, 5, 6], [0, 3, 6, 4], [5, 6, 0, 0]] },
        { name: "Future Bass", bpm: 150, feel: "futurebass", swing: 0, sevenths: true, progs: [[3, 4, 2, 5], [0, 4, 5, 3], [5, 3, 0, 4], [3, 0, 4, 5]] },
        { name: "Phonk", bpm: 130, feel: "phonk", swing: 0, sevenths: false, progs: [[0, 0, 5, 6], [0, 6, 5, 4], [0, 3, 0, 4], [0, 5, 0, 6]] },
        { name: "Afrobeats", bpm: 105, feel: "afro", swing: 0.12, sevenths: false, progs: [[0, 3, 4, 3], [0, 5, 3, 4], [3, 4, 0, 0], [0, 4, 5, 3]] },
        { name: "Amapiano", bpm: 113, feel: "amapiano", swing: 0.14, sevenths: true, progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 4, 2, 5], [0, 3, 1, 4]] },
        { name: "Reggaeton", bpm: 95, feel: "dembow", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 6, 5, 4]] },
        { name: "Jersey Club", bpm: 140, feel: "jersey", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4], [0, 4, 5, 3]] },
        { name: "UK Garage", bpm: 132, feel: "garage", swing: 0.24, sevenths: true, progs: [[1, 4, 0, 5], [0, 5, 3, 4], [5, 3, 4, 0], [0, 2, 3, 4]] },
        { name: "Synthwave", bpm: 100, feel: "synthwave", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [5, 3, 0, 4], [0, 6, 5, 6], [0, 3, 5, 4]] },
        { name: "Hyperpop", bpm: 160, feel: "futurebass", swing: 0, sevenths: false, progs: [[0, 4, 5, 3], [3, 4, 0, 5], [0, 5, 3, 4], [5, 3, 4, 4]] },
        { name: "Hardstyle", bpm: 150, feel: "hardstyle", swing: 0, sevenths: false, progs: [[0, 5, 3, 4], [0, 6, 5, 6], [0, 3, 5, 6], [5, 3, 0, 4]] },
        { name: "Disco & Funk", bpm: 118, feel: "disco", swing: 0.08, sevenths: true, progs: [[0, 3, 0, 4], [1, 4, 0, 5], [0, 5, 1, 4], [3, 4, 0, 0]] },
    ];
    const FL_LOOP_ROLE_SOUNDS = {
        chords: ["Piano", "Rhodes", "Organ Stab", "Chord Stab", "Strings", "Bright Pad", "Dark Pad", "Vocal Pad", "Brass Stab", "Tape Keys", "Glass Keys", "Guitar Pluck"],
        keys: ["Piano", "Rhodes", "Tape Keys", "Glass Keys", "Marimba", "Kalimba", "Bell", "Guitar Pluck", "Organ Stab", "Steel Pan"],
        melody: ["Bell", "Pluck", "Flute", "Saw Lead", "Square Lead", "Chip Lead", "Glass Keys", "Marimba", "Kalimba", "Steel Pan", "Trumpet", "Hoover Lead", "Supersaw", "Guitar Pluck", "Piano"],
        arp: ["Pluck", "Arp Pluck", "Bell", "Marimba", "Kalimba", "Glass Keys", "Square Lead", "Chip Lead", "Guitar Pluck", "Piano", "Steel Pan"],
        pad: ["Dark Pad", "Bright Pad", "Vocal Pad", "Strings", "Choir", "Supersaw"],
    };
    const FL_LOOP_FALLBACK = { chords: "Keys", keys: "Keys", melody: "Leads", arp: "Plucks", pad: "Pads" };
    const FL_LOOP_KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    class FLLoops {
        static _slug(text) {
            return text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        }
        static types() {
            return FL_LOOP_TYPES;
        }
        static genres() {
            return FL_LOOP_GENRES;
        }
        // Every loop: { id, genre, genreIndex, type, typeIndex, index, name, bars, bpm, color }
        static library() {
            if (FLLoops._library)
                return FLLoops._library;
            const list = [];
            FL_LOOP_GENRES.forEach((genre, genreIndex) => {
                FL_LOOP_TYPES.forEach((type, typeIndex) => {
                    for (let index = 0; index < type.count; index++) {
                        const id = FLLoops._slug(genre.name) + "/" + type.slug + "-" + String(index + 1).padStart(2, "0");
                        list.push({ id, genre: genre.name, genreIndex, type: type.name, typeSlug: type.slug, typeIndex, index, bars: type.bars, bpm: genre.bpm, color: type.color, name: null });
                    }
                });
            });
            FLLoops._library = list;
            FLLoops._byId = new Map(list.map(item => [item.id, item]));
            return list;
        }
        static get(id) {
            FLLoops.library();
            return FLLoops._byId.get(id) || null;
        }
        // A readable name, built from the sounds the loop uses ("Trap Bell Melody 02").
        static nameOf(id) {
            const item = FLLoops.get(id);
            if (!item)
                return id;
            if (item.name)
                return item.name;
            const plan = FLLoops._plan(item);
            const label = plan.label || "";
            const typeWord = item.type.split(" ").pop().toLowerCase();
            const middle = label && label.toLowerCase().split(" ").includes(typeWord) ? label : (label ? label + " " : "") + item.type;
            item.name = item.genre + " " + middle + " " + String(item.index + 1).padStart(2, "0");
            return item.name;
        }
        // Tempo / key / mode / beats per bar from a song.
        static songContext(song) {
            const flags = Config.scales[song.scale].flags;
            const minor = !!flags[3] && !flags[4];
            return { bpm: Math.round(song.tempo), key: song.key, minor, beats: song.beatsPerBar };
        }
        static sampleKey(id, context) {
            return "ll/" + id + "@" + context.bpm + "@" + context.key + "@" + (context.minor ? "m" : "M") + "@" + context.beats;
        }
        static parseKey(key) {
            const match = /^ll\/(.+)@(\d+)@(\d+)@([mM])@(\d+)$/.exec(key);
            if (!match)
                return null;
            return { id: match[1], context: { bpm: +match[2], key: +match[3], minor: match[4] == "m", beats: +match[5] } };
        }
        static infoForKey(key) {
            const parsed = FLLoops.parseKey(key);
            if (!parsed || !FLLoops.get(parsed.id))
                return null;
            const c = parsed.context;
            return { key, name: FLLoops.nameOf(parsed.id) + " (" + c.bpm + " BPM, " + FL_LOOP_KEY_NAMES[c.key] + (c.minor ? " minor" : " major") + ")", rootKey: 60 };
        }
        static renderKey(key) {
            const parsed = FLLoops.parseKey(key);
            if (!parsed || !FLLoops.get(parsed.id))
                return null;
            const loop = FLLoops.render(parsed.id, parsed.context);
            return { pcm: loop.pcm, rate: FL_SR, name: FLLoops.infoForKey(key).name, rootKey: 60, loop: null, bpm: parsed.context.bpm, bars: loop.bars };
        }
        // ------------------------------------------------------- sounds
        static _folderItems(folder) {
            if (!FLLoops._folders) {
                FLLoops._folders = new Map();
                for (const item of FLSoundFactory.getCatalog()) {
                    const dir = item.path.slice(0, item.path.lastIndexOf("/"));
                    if (!FLLoops._folders.has(dir))
                        FLLoops._folders.set(dir, []);
                    FLLoops._folders.get(dir).push(item);
                }
            }
            return FLLoops._folders.get(folder) || [];
        }
        static _pick(list, rand) {
            return list.length ? list[Math.floor(rand() * list.length) % list.length] : null;
        }
        // "Trap 808 Long 01" -> "808 Long"
        static _cleanName(name, genre) {
            const prefix = genre.name.replace(/ & /g, " ").replace(/[^A-Za-z0-9 ]/g, "") + " ";
            return name.replace(/ \d\d$/, "").replace(prefix, "").trim();
        }
        static _genreFolder(genre, sub) {
            return "Packs/" + genre.name + "/" + sub;
        }
        static _soundForRole(genre, role, rand, index) {
            const names = FL_LOOP_ROLE_SOUNDS[role];
            let pool = FLLoops._folderItems(FLLoops._genreFolder(genre, "Melodic")).filter(item => names.some(n => item.name.indexOf(n) != -1));
            if (pool.length == 0)
                pool = FLLoops._folderItems("Packs/Synth One-Shots/" + FL_LOOP_FALLBACK[role]);
            return pool.length ? pool[(index + Math.floor(rand() * pool.length)) % pool.length] : null;
        }
        // The composition plan for a loop (instruments + label), deterministic per loop id.
        static _plan(item) {
            if (item._plan)
                return item._plan;
            const genre = FL_LOOP_GENRES[item.genreIndex];
            const rand = flRng("loop/" + item.id);
            const plan = { label: "", sounds: {} };
            const folder = (sub) => FLLoops._folderItems(FLLoops._genreFolder(genre, sub));
            switch (item.typeSlug) {
                case "drums":
                case "tops":
                case "perc": {
                    plan.sounds.kick = FLLoops._pick(folder("Kicks"), rand);
                    plan.sounds.snare = FLLoops._pick(folder("Snares"), rand);
                    plan.sounds.clap = FLLoops._pick(folder("Claps"), rand);
                    plan.sounds.hat = FLLoops._pick(folder("Hats"), rand);
                    plan.sounds.ohat = FLLoops._pick(folder("Open Hats"), rand);
                    const percs = folder("Percussion");
                    plan.sounds.perc = FLLoops._pick(percs, rand);
                    plan.sounds.perc2 = FLLoops._pick(percs, rand);
                    plan.sounds.ride = FLLoops._pick(folder("Cymbals").filter(i => /Ride/.test(i.name)), rand);
                    plan.sounds.tom = FLLoops._pick(FLLoops._folderItems("Packs/World Percussion/" + (rand() < 0.5 ? "Low Tom" : "High Tom")), rand);
                    if (item.typeSlug == "perc") {
                        const world = ["Conga", "Bongo", "Shaker", "Tambourine", "Cowbell", "Woodblock", "Djembe", "Agogo", "Cabasa", "Timbale", "Clave", "Tabla"];
                        plan.sounds.perc = FLLoops._pick(FLLoops._folderItems("Packs/World Percussion/" + world[Math.floor(rand() * world.length)]), rand) || plan.sounds.perc;
                        plan.sounds.perc2 = FLLoops._pick(FLLoops._folderItems("Packs/World Percussion/" + world[Math.floor(rand() * world.length)]), rand) || plan.sounds.perc2;
                        plan.label = plan.sounds.perc ? plan.sounds.perc.path.split("/").slice(-2, -1)[0] : "";
                    }
                    else {
                        plan.label = ["Hard", "Bouncy", "Classic", "Dark", "Rolling", "Punchy", "Laid Back", "Busy"][(item.index + Math.floor(rand() * 3)) % 8];
                    }
                    break;
                }
                case "bass": {
                    const basses = folder("Bass");
                    plan.sounds.bass = basses[item.index % Math.max(1, basses.length)] || FLLoops._pick(FLLoops._folderItems("Packs/Synth One-Shots/Bass"), rand);
                    plan.label = plan.sounds.bass ? FLLoops._cleanName(plan.sounds.bass.name, genre) : "";
                    break;
                }
                case "fx": {
                    const fx = folder("FX");
                    plan.sounds.main = item.index == 0 ? (fx.find(i => /Riser/.test(i.name)) || FLLoops._pick(FLLoops._folderItems("Packs/FX Toolkit/Risers"), rand)) : (fx.find(i => /Impact|Drop/.test(i.name)) || FLLoops._pick(FLLoops._folderItems("Packs/FX Toolkit/Impacts"), rand));
                    plan.sounds.second = FLLoops._pick(FLLoops._folderItems("Packs/FX Toolkit/" + (item.index == 0 ? "Sweeps" : "Textures")), rand);
                    plan.label = item.index == 0 ? "Riser" : "Impact";
                    break;
                }
                case "vox": {
                    const vox = folder("Vocal Chops").concat(FLLoops._folderItems("Packs/Vocal Chops/" + ["Male", "Female", "High"][item.index % 3]));
                    plan.sounds.vox = vox[(item.index * 7 + Math.floor(rand() * vox.length)) % Math.max(1, vox.length)];
                    plan.label = plan.sounds.vox ? plan.sounds.vox.name.replace(/^.*Vox /, "").replace(/ (Male|Female|High).*$/, "").replace(/ \d\d$/, "") : "";
                    break;
                }
                default: {
                    plan.sounds.main = FLLoops._soundForRole(genre, item.typeSlug, rand, item.index);
                    plan.label = plan.sounds.main ? FLLoops._cleanName(plan.sounds.main.name, genre) : "";
                }
            }
            item._plan = plan;
            return plan;
        }
        // ------------------------------------------------------- rendering
        static render(id, context) {
            const key = FLLoops.sampleKey(id, context);
            const cached = FLLoops._cache.get(key);
            if (cached) {
                FLLoops._cache.delete(key);
                FLLoops._cache.set(key, cached);
                return cached;
            }
            const item = FLLoops.get(id);
            const result = FLLoops._render(item, context);
            FLLoops._cache.set(key, result);
            FLLoops._cacheSamples += result.pcm.length;
            while (FLLoops._cacheSamples > 24000000 && FLLoops._cache.size > 1) {
                const oldest = FLLoops._cache.keys().next().value;
                FLLoops._cacheSamples -= FLLoops._cache.get(oldest).pcm.length;
                FLLoops._cache.delete(oldest);
            }
            return result;
        }
        static _render(item, context) {
            const genre = FL_LOOP_GENRES[item.genreIndex];
            const rand = flRng("render/" + item.id);
            const beats = Math.max(1, context.beats || 4);
            const bars = item.bars;
            const beatSeconds = 60 / Math.max(30, Math.min(300, context.bpm));
            const totalSeconds = bars * beats * beatSeconds;
            const out = new Float32Array(Math.max(1, Math.floor(totalSeconds * FL_SR)));
            const plan = FLLoops._plan(item);
            const step = beatSeconds / 4;
            const ctx = { out, bars, beats, beatSeconds, step, swing: genre.swing, genre, item, rand, context };
            switch (item.typeSlug) {
                case "drums":
                    FLLoops._drums(ctx, plan, { kick: true, snare: true, hats: true, perc: item.index % 3 == 2, ohat: true });
                    break;
                case "tops":
                    FLLoops._drums(ctx, plan, { kick: false, snare: false, hats: true, perc: true, ohat: true, ride: item.index % 2 == 1 });
                    break;
                case "perc":
                    FLLoops._percussion(ctx, plan);
                    break;
                case "fx":
                    FLLoops._fx(ctx, plan);
                    break;
                case "vox":
                    FLLoops._vox(ctx, plan);
                    break;
                default:
                    FLLoops._melodic(ctx, plan);
            }
            // gentle glue and a consistent level
            for (let i = 0; i < out.length; i++)
                out[i] = Math.tanh(out[i] * 0.9);
            flNormalize(out, 0.8);
            // tiny fades so the loop seams don't click
            const fade = Math.min(out.length >> 1, 64);
            for (let i = 0; i < fade; i++) {
                out[i] *= i / fade;
                out[out.length - 1 - i] *= i / fade;
            }
            return { pcm: out, bars, beats };
        }
        // Mixes one sample into the loop at time t (seconds). Wraps around the loop end so tails continue at the start.
        static _place(ctx, sound, t, gain, pitchSemis = 0, maxSeconds = 0, release = 0.03) {
            if (!sound)
                return;
            const rendered = FLSoundFactory.render(sound.key);
            if (!rendered)
                return;
            const pcm = rendered.pcm;
            const out = ctx.out;
            const ratio = pitchSemis ? Math.pow(2, pitchSemis / 12) : 1;
            const start = Math.floor(t * FL_SR);
            let length = Math.floor(pcm.length / ratio);
            let releaseSamples = 0;
            if (maxSeconds > 0) {
                const maxSamples = Math.floor(maxSeconds * FL_SR);
                if (maxSamples < length) {
                    releaseSamples = Math.max(1, Math.floor(release * FL_SR));
                    length = Math.min(length, maxSamples + releaseSamples);
                }
            }
            length = Math.min(length, out.length);
            const releaseFrom = length - releaseSamples;
            for (let i = 0; i < length; i++) {
                const x = i * ratio;
                const i0 = Math.floor(x);
                if (i0 + 1 >= pcm.length)
                    break;
                let v = pcm[i0] + (pcm[i0 + 1] - pcm[i0]) * (x - i0);
                if (releaseSamples && i >= releaseFrom)
                    v *= (length - i) / releaseSamples;
                let index = start + i;
                if (index >= out.length)
                    index -= out.length;
                out[index] += v * gain;
            }
        }
        static _time(ctx, step) {
            // 16th-note steps with swing on the off 16ths
            const swing = (Math.floor(step) % 2 == 1) ? ctx.swing * ctx.step : 0;
            return step * ctx.step + swing;
        }
        static _pattern(text) {
            const hits = [];
            for (let i = 0; i < text.length; i++) {
                const c = text[i];
                if (c == "x")
                    hits.push([i, 1]);
                else if (c == "o")
                    hits.push([i, 0.65]);
                else if (c == "g")
                    hits.push([i, 0.35]);
            }
            return hits;
        }
        static _drumPatterns(feel, rand, index) {
            const pick = (list) => list[(index + Math.floor(rand() * list.length)) % list.length];
            switch (feel) {
                case "halftime":
                case "phonk":
                    return {
                        kick: pick(["x.....x...x.....", "x.......x.x.....", "x.....x..x....x.", "x..x......x.....", "x.........x..x..", "x.....x.x.......", "x..x....x.....x.", "x......x..x....."]),
                        snare: pick(["........x.......", "........x......g", "........x....g..", "........x......."]),
                        hats: feel == "phonk" ? "eighths" : pick(["eighths", "sixteenths", "rolls", "triplets"]), ohat: pick([6, 14, -1, 14]),
                        perc: feel == "phonk" ? "x.x...x.x.x...x." : pick(["......x.........", "...x.......x....", ".............x.."]),
                    };
                case "drill":
                    return {
                        kick: pick(["x.........x.....", "x.........x...x.", "x.......x.....x.", "x.........x.x..."]),
                        snare: pick(["........x.....x.", "........x.......", "........x...x..."]),
                        hats: "triplets", ohat: -1, perc: pick(["...x.....x......", "......x.......x."]),
                    };
                case "boombap":
                case "rnb":
                    return {
                        kick: pick(["x.......x.x.....", "x.....x...x..x..", "x..x......x.....", "x......x..x.....", "x.x.......x..x.."]),
                        snare: pick(["....x.......x...", "....x..g....x...", "....x.......x..g"]),
                        hats: feel == "rnb" ? pick(["eighths", "sixteenths", "rolls"]) : "eighths", ohat: pick([14, -1, 6]), perc: pick(["..........x.....", "......x.........", "...x.......x...."]),
                    };
                case "pop":
                case "synthwave":
                    return {
                        kick: pick(["x.......x.......", "x.......x.x.....", "x.....x.x.......", "x...x...x...x..."]),
                        snare: "....x.......x...", hats: pick(["eighths", "sixteenths"]), ohat: pick([14, -1]), perc: pick(["....x.......x...", "..x...x...x...x."]),
                    };
                case "fourfloor":
                case "disco":
                    return {
                        kick: pick(["x...x...x...x...", "x...x...x...x..o"]), snare: "....x.......x...", hats: "offbeat", ohat: "offbeat",
                        perc: pick(["..x..x...x..x...", "...x..x....x..x.", "x.x.x.x.x.x.x.x."]),
                    };
                case "techhouse":
                    return {
                        kick: "x...x...x...x...", snare: pick(["....x.......x...", "......x.....x..x"]), hats: "offbeat", ohat: "offbeat",
                        perc: pick(["...x.....x.x....", "..x...x.x...x...", ".x...x.....x..x."]),
                    };
                case "techno":
                case "hardstyle":
                    return {
                        kick: "x...x...x...x...", snare: pick(["....x.......x...", "................", "............x..."]), hats: pick(["offbeat", "sixteenths"]), ohat: "offbeat",
                        perc: pick(["..x...x...x...x.", "...x...x...x...x", "x..x..x..x..x..."]),
                    };
                case "breakbeat":
                    return {
                        kick: pick(["x.........x.....", "x.....x...x.....", "x.x.......x.....", "x.........x...x."]),
                        snare: pick(["....x.......x...", "....x..g....x..g", "....x.......x.g."]), hats: pick(["eighths", "sixteenths"]), ohat: pick([-1, 14]), perc: pick(["..x.......x.....", "......x.......x."]),
                    };
                case "jungle":
                    return {
                        kick: pick(["x.........x.....", "x.x.......x..x..", "x.....x.x.......", "x.........x.x..."]),
                        snare: pick(["....x..g.g..x...", "....x.g.....x.gg", "....x..g....x.g."]), hats: "sixteenths", ohat: pick([6, 14]), perc: "x.x.x.x.x.x.x.x.",
                    };
                case "futurebass":
                    return {
                        kick: pick(["x.........x.....", "x.....x...x.....", "x.......x.x....."]), snare: pick(["........x.......", "........x.....x."]),
                        hats: pick(["rolls", "eighths", "sixteenths"]), ohat: pick([14, -1]), perc: pick(["......x.......x.", "...x.......x...."]),
                    };
                case "afro":
                    return {
                        kick: pick(["x......x..x.....", "x.....x...x.....", "x..x....x.......", "x......x.x......"]),
                        snare: pick(["...x..x....x..x.", "...x...x..x...x.", "......x.......x."]), hats: "sixteenths", ohat: pick([14, 6]), perc: pick(["x..x..x...x..x..", "..x...x...x...x."]),
                    };
                case "amapiano":
                    return {
                        kick: pick(["x...x...x...x...", "x.......x.......", "x...x...x...x.x."]), snare: pick(["...x...x...x...x", "......x.......x."]),
                        hats: "sixteenths", ohat: "offbeat", perc: pick(["x..x..x...x..x..", ".x...x...x...x.."]),
                    };
                case "dembow":
                    return {
                        kick: pick(["x...x...x...x...", "x...x...x...x..x"]), snare: pick(["...x..x....x..x.", "...x..x....x..xx"]), hats: "eighths", ohat: -1,
                        perc: pick(["...x..x....x..x.", "x.x.x.x.x.x.x.x."]),
                    };
                case "jersey":
                    return {
                        kick: pick(["x..x..x...x.x...", "x..x..x.x...x...", "x..x..x...x.x.x."]), snare: pick(["....x.......x...", "....x.....x.x..."]),
                        hats: pick(["eighths", "sixteenths"]), ohat: -1, perc: pick(["......x.......x.", "...x......x....."]),
                    };
                case "garage":
                    return {
                        kick: pick(["x.........x.....", "x......x..x.....", "x.........x..x.."]), snare: "....x.......x...", hats: "sixteenths", ohat: pick([6, 14]),
                        perc: pick(["..x.....x.x.....", "...x......x....."]),
                    };
                default:
                    return { kick: "x.......x.......", snare: "....x.......x...", hats: "eighths", ohat: -1, perc: "" };
            }
        }
        // Patterns are written for 4 beats (16 steps). Longer bars repeat them, shorter bars cut them off.
        static _blocks(ctx) {
            const stepsPerBar = ctx.beats * 4;
            const blocks = [];
            for (let bar = 0; bar < ctx.bars; bar++)
                for (let off = 0; off < stepsPerBar; off += 16)
                    blocks.push({ bar, start: bar * stepsPerBar + off, size: Math.min(16, stepsPerBar - off), first: off == 0 });
            blocks.forEach((block, i) => { block.index = i; block.last = i == blocks.length - 1; });
            return blocks;
        }
        static _drums(ctx, plan, parts) {
            const genre = ctx.genre;
            const patterns = FLLoops._drumPatterns(genre.feel, ctx.rand, ctx.item.index);
            const r = ctx.rand;
            const s = plan.sounds;
            const at = (block, i) => FLLoops._time(ctx, block.start + i);
            const humanize = () => 0.88 + r() * 0.12;
            const useClap = genre.feel == "fourfloor" || genre.feel == "techhouse" || genre.feel == "disco" || genre.feel == "amapiano" || r() < 0.4;
            for (const block of FLLoops._blocks(ctx)) {
                const n = block.size;
                // kick
                if (parts.kick) {
                    let kick = patterns.kick;
                    if (block.last && r() < 0.5)
                        kick = kick.slice(0, 12) + (r() < 0.5 ? "..x." : ".x.x");
                    for (const [i, v] of FLLoops._pattern(kick))
                        if (i < n)
                            FLLoops._place(ctx, s.kick, at(block, i), v * humanize());
                }
                // snare / clap
                if (parts.snare) {
                    for (const [i, v] of FLLoops._pattern(patterns.snare)) {
                        if (i >= n)
                            continue;
                        FLLoops._place(ctx, useClap && v > 0.5 ? s.clap : s.snare, at(block, i), v * humanize() * 0.9);
                        if (useClap && v > 0.5 && r() < 0.5)
                            FLLoops._place(ctx, s.snare, at(block, i), v * 0.45);
                    }
                    if (block.last && genre.feel == "synthwave" && s.tom && n == 16)
                        for (const i of [12, 13, 14, 15])
                            FLLoops._place(ctx, s.tom, at(block, i), 0.7, (15 - i) * 2);
                }
                // hats
                if (parts.hats) {
                    const mode = patterns.hats;
                    for (let i = 0; i < n; i++) {
                        let hit = false, vel = 0.5;
                        if (mode == "sixteenths") {
                            hit = true;
                            vel = i % 4 == 0 ? 0.62 : i % 2 == 0 ? 0.5 : 0.36;
                        }
                        else if (mode == "eighths" || mode == "rolls" || mode == "triplets") {
                            hit = i % 2 == 0;
                            vel = i % 4 == 0 ? 0.6 : 0.45;
                        }
                        else if (mode == "offbeat") {
                            hit = i % 4 == 2 || (i % 2 == 1 && r() < 0.35);
                            vel = i % 4 == 2 ? 0.55 : 0.3;
                        }
                        if (hit)
                            FLLoops._place(ctx, s.hat, at(block, i), vel * humanize());
                    }
                    if (mode == "rolls" || mode == "triplets") {
                        // trap-style rolls: 32nds or triplets on a few beats
                        const rollBeats = mode == "triplets" ? [0, 1, 2, 3].filter(() => r() < 0.6) : [Math.floor(r() * 4), 3].filter((b, k, list) => list.indexOf(b) == k);
                        for (const beat of rollBeats) {
                            if (beat * 4 >= n)
                                continue;
                            const division = mode == "triplets" ? 6 : (r() < 0.5 ? 8 : 6);
                            for (let k = 0; k < division / 2; k++)
                                FLLoops._place(ctx, s.hat, at(block, beat * 4 + (mode == "triplets" ? 0 : 2)) + k * ctx.beatSeconds / division, 0.32 + 0.25 * (k % 2));
                        }
                    }
                }
                // open hats
                if (parts.ohat && s.ohat) {
                    if (patterns.ohat == "offbeat") {
                        for (let i = 2; i < n; i += 4)
                            FLLoops._place(ctx, s.ohat, at(block, i), 0.42, 0, ctx.step * 1.8);
                    }
                    else if (patterns.ohat >= 0 && patterns.ohat < n && (block.index % 2 == 1 || r() < 0.5)) {
                        FLLoops._place(ctx, s.ohat, at(block, patterns.ohat), 0.45, 0, ctx.step * 2);
                    }
                }
                // percussion
                if (parts.perc && patterns.perc) {
                    for (const [i] of FLLoops._pattern(patterns.perc))
                        if (i < n)
                            FLLoops._place(ctx, s.perc, at(block, i), 0.5 * humanize());
                }
                if (parts.ride && s.ride) {
                    for (let i = 0; i < n; i += 2)
                        FLLoops._place(ctx, s.ride, at(block, i), i % 4 == 0 ? 0.35 : 0.25, 0, ctx.step * 4);
                }
            }
        }
        static _percussion(ctx, plan) {
            const r = ctx.rand;
            const s = plan.sounds;
            const grooves = ["x..x..x...x..x..", "x.x..x.x..x.x...", "..x...x...x..xx.", "x...x.x..x..x.x.", "x..x.x..x.x..x..", ".x..x..x.x..x..x"];
            const a = grooves[(ctx.item.index * 2 + Math.floor(r() * 2)) % grooves.length];
            const b = grooves[(ctx.item.index * 2 + 3) % grooves.length];
            for (const block of FLLoops._blocks(ctx)) {
                for (let i = 0; i < block.size; i++) {
                    if (a[i] == "x")
                        FLLoops._place(ctx, s.perc, FLLoops._time(ctx, block.start + i), (i % 4 == 0 ? 0.75 : 0.55) * (0.85 + r() * 0.15), r() < 0.25 ? (r() < 0.5 ? -2 : 3) : 0);
                    if (b[(i + 2) % 16] == "x" && r() < 0.8)
                        FLLoops._place(ctx, s.perc2, FLLoops._time(ctx, block.start + i), 0.42 * (0.85 + r() * 0.15));
                }
            }
        }
        // ------------------------------------------------------- harmony
        static _scale(minor) {
            return minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
        }
        static _chord(context, degree, sevenths, extraTones = 0) {
            const scale = FLLoops._scale(context.minor);
            const tones = [];
            const count = (sevenths ? 4 : 3) + extraTones;
            for (let k = 0; k < count; k++) {
                const d = degree + k * 2;
                tones.push(scale[d % 7] + 12 * Math.floor(d / 7));
            }
            return tones;
        }
        static _root(context) {
            // C4 = 60; keep the key within C4..F#4 or G3..B3 so registers stay sensible
            const key = context.key % 12;
            return 60 + (key > 6 ? key - 12 : key);
        }
        static _progression(ctx) {
            const progs = ctx.genre.progs;
            return progs[(ctx.item.index + ctx.item.genreIndex) % progs.length];
        }
        static _voice(chord, center) {
            // simple voice leading: put every tone within an octave above center - 5
            return chord.map(t => {
                let p = t;
                while (p < center - 5)
                    p += 12;
                while (p > center + 7)
                    p -= 12;
                return p;
            }).sort((a, b) => a - b);
        }
        static _melodic(ctx, plan) {
            const sound = plan.sounds.main || plan.sounds.bass;
            if (!sound)
                return;
            const info = FLSoundFactory.getInfo(sound.key) || {};
            const soundRoot = info.rootKey == undefined ? 60 : info.rootKey;
            const r = ctx.rand;
            const genre = ctx.genre;
            const context = ctx.context;
            const prog = FLLoops._progression(ctx);
            const root = FLLoops._root(context);
            const scale = FLLoops._scale(context.minor);
            const barSeconds = ctx.beats * ctx.beatSeconds;
            const stepsPerBar = ctx.beats * 4;
            const chordsPerLoop = ctx.bars;
            const chordAt = (bar) => FLLoops._chord(context, prog[(bar * prog.length / chordsPerLoop | 0) % prog.length], genre.sevenths);
            const note = (midi, startStep, lengthSteps, gain) => {
                const t = FLLoops._time(ctx, startStep);
                FLLoops._place(ctx, sound, t, gain, midi - soundRoot, lengthSteps * ctx.step, ctx.item.typeSlug == "pad" ? 0.25 : 0.04);
            };
            const type = ctx.item.typeSlug;
            const v = ctx.item.index;
            if (type == "bass") {
                const bassRoot = root - 24;
                const is808 = /808|Log/.test(sound.name);
                const patterns = {
                    halftime: ["x.....x...x.....", "x.......x.x.....", "x..x......x....."], phonk: ["x.....x...x.....", "x.x.....x.x....."], drill: ["x.........x.....", "x.......x.....x."],
                    boombap: ["x.......x.x.....", "x.....x...x..x.."], rnb: ["x.....x.........", "x.......x...x..."], pop: ["x...x...x...x...", "x.x.x.x.x.x.x.x."],
                    fourfloor: ["..x...x...x...x.", "x.x.x.x.x.x.x.x.", "..xx..x...xx..x."], disco: ["x.x.x.x.x.x.x.x.", "x..xx..xx..xx..x"], techhouse: ["..x...x...x...x.", ".xx..xx..xx..xx."],
                    techno: ["..x...x...x...x.", "x.xxx.xxx.xxx.xx"], hardstyle: ["..x...x...x...x."], breakbeat: ["x.....x...x.....", "x.........x...x.", "x..x......x....."], jungle: ["x.........x..x..", "x.....x...x....."],
                    futurebass: ["x.........x.....", "x.....x...x....."], afro: ["x......x..x.....", "x..x....x..x...."], amapiano: ["x..x..x...x..x..", "x.....x.x...x..."],
                    dembow: ["x..x..x.x..x..x.", "x...x...x...x..."], jersey: ["x..x..x...x.x...", "x..x..x.x...x..."], garage: ["x.....x..x....x.", "x..x......x..x.."], synthwave: ["x.x.x.x.x.x.x.x.", "xxxxxxxxxxxxxxxx"],
                };
                const list = patterns[genre.feel] || ["x.......x......."];
                const pattern = list[v % list.length];
                const hits = FLLoops._pattern(pattern);
                for (const block of FLLoops._blocks(ctx)) {
                    const chord = chordAt(block.bar);
                    for (let k = 0; k < hits.length; k++) {
                        const [i, vel] = hits[k];
                        if (i >= block.size)
                            continue;
                        const next = k + 1 < hits.length ? Math.min(block.size, hits[k + 1][0]) : block.size;
                        let tone = chord[0];
                        if (!is808 && i % 8 == 6 && r() < 0.5)
                            tone = chord[2] || chord[0];
                        if (genre.feel == "disco" && i % 4 == 2)
                            tone += 12;
                        const length = is808 ? Math.max(2, next - i) : Math.max(1, Math.min(next - i, genre.feel == "fourfloor" || genre.feel == "techno" ? 2 : 4));
                        note(bassRoot + tone, block.start + i, length, vel * 0.9);
                    }
                }
                return;
            }
            if (type == "pad") {
                for (let bar = 0; bar < ctx.bars; bar++) {
                    const voiced = FLLoops._voice(chordAt(bar), root);
                    for (const p of voiced)
                        note(p, bar * stepsPerBar, stepsPerBar, 0.45);
                }
                return;
            }
            if (type == "chords") {
                const rhythms = [
                    [[0, 16]], [[0, 6], [6, 6], [12, 4]], [[2, 2], [6, 2], [10, 2], [14, 2]], [[0, 3], [3, 3], [6, 4], [10, 6]],
                    [[0, 8], [8, 8]], [[0, 2], [4, 2], [8, 2], [10, 2], [14, 2]], [[0, 4], [6, 2], [10, 4], [14, 2]],
                ];
                const feelRhythm = { fourfloor: 2, techhouse: 2, garage: 6, disco: 5, dembow: 3, afro: 3, amapiano: 6, jersey: 5, halftime: 0, drill: 4, phonk: 4 };
                const pickIndex = (feelRhythm[genre.feel] != undefined && v % 2 == 0) ? feelRhythm[genre.feel] : (v + Math.floor(r() * 3)) % rhythms.length;
                const rhythm = rhythms[pickIndex];
                for (const block of FLLoops._blocks(ctx)) {
                    const voiced = FLLoops._voice(chordAt(block.bar), root);
                    for (const [startStep, length] of rhythm) {
                        if (startStep >= block.size)
                            continue;
                        for (const p of voiced)
                            note(p, block.start + startStep, Math.min(length, block.size - startStep), 0.4);
                    }
                }
                return;
            }
            if (type == "keys") {
                // broken chords: bass note, then chord tones on a pattern
                const shapes = [[0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 3, 2, 1, 2, 3, 2], [0, 3, 2, 1, 0, 3, 2, 1], [0, 1, 0, 2, 0, 1, 0, 3]];
                const shape = shapes[v % shapes.length];
                for (const block of FLLoops._blocks(ctx)) {
                    const voiced = FLLoops._voice(chordAt(block.bar), root);
                    note(voiced[0] - 12, block.start, Math.min(8, block.size), 0.35);
                    for (let k = 0; k * 2 < block.size; k++) {
                        const tone = voiced[shape[k] % voiced.length];
                        note(tone, block.start + k * 2, 3, k % 2 == 0 ? 0.42 : 0.34);
                    }
                }
                return;
            }
            if (type == "arp") {
                const orders = ["up", "down", "updown", "random"];
                const order = orders[v % orders.length];
                const division = genre.bpm >= 140 ? 2 : 1; // steps per arp note
                for (let bar = 0; bar < ctx.bars; bar++) {
                    const voiced = FLLoops._voice(chordAt(bar), root + 7);
                    const tones = voiced.concat(voiced.map(t => t + 12));
                    const count = Math.floor(stepsPerBar / division);
                    for (let k = 0; k < count; k++) {
                        let index;
                        if (order == "up")
                            index = k % tones.length;
                        else if (order == "down")
                            index = tones.length - 1 - (k % tones.length);
                        else if (order == "updown") {
                            const cycle = tones.length * 2 - 2;
                            const pos = k % cycle;
                            index = pos < tones.length ? pos : cycle - pos;
                        }
                        else
                            index = Math.floor(r() * tones.length);
                        note(tones[index], bar * stepsPerBar + k * division, division, k % 4 == 0 ? 0.42 : 0.33);
                    }
                }
                return;
            }
            // melody: a motif on chord tones and scale steps, repeated with a variation
            const motifRhythms = [
                [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 4], [14, 2]], [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
                [[0, 2], [3, 1], [4, 2], [6, 2], [8, 2], [11, 1], [12, 4]], [[2, 2], [4, 2], [6, 4], [12, 2], [14, 2]], [[0, 6], [6, 2], [8, 6], [14, 2]],
            ];
            const center = root + (/Lead|Flute|Bell|Chip|Ocarina|Glass/.test(sound.name) ? 12 : 7);
            const scaleNotes = [];
            for (let o = -1; o <= 2; o++)
                for (const d of scale)
                    scaleNotes.push(root + d + 12 * o);
            const nearest = (target) => scaleNotes.reduce((best, n) => Math.abs(n - target) < Math.abs(best - target) ? n : best, scaleNotes[0]);
            const motifA = motifRhythms[(v * 2 + Math.floor(r() * 2)) % motifRhythms.length];
            const motifB = motifRhythms[(v * 2 + 3) % motifRhythms.length];
            let previous = center;
            const contour = [];
            for (let k = 0; k < 8; k++)
                contour.push(Math.floor(r() * 5) - 2);
            for (const block of FLLoops._blocks(ctx)) {
                const bar = block.bar;
                const chord = FLLoops._voice(chordAt(bar), center);
                const motif = block.last ? motifB : motifA;
                motif.forEach(([startStep, length], k) => {
                    if (startStep >= block.size)
                        return;
                    let pitch;
                    if (startStep % 8 == 0)
                        pitch = chord[(k + bar) % chord.length];
                    else
                        pitch = nearest(previous + contour[(k + bar) % contour.length] * 2);
                    while (pitch > center + 9)
                        pitch -= 12;
                    while (pitch < center - 7)
                        pitch += 12;
                    previous = pitch;
                    note(pitch, block.start + startStep, Math.min(length, block.size - startStep), 0.45);
                });
            }
        }
        static _fx(ctx, plan) {
            const loopSeconds = ctx.out.length / FL_SR;
            const main = plan.sounds.main ? FLSoundFactory.render(plan.sounds.main.key) : null;
            if (ctx.item.index == 0) {
                // a riser that ends at the end of the loop, with a sweep halfway
                if (main) {
                    const seconds = main.pcm.length / FL_SR;
                    FLLoops._place(ctx, plan.sounds.main, Math.max(0, loopSeconds - seconds), 0.8, 0, loopSeconds);
                }
                FLLoops._place(ctx, plan.sounds.second, loopSeconds * 0.5, 0.4, 0, loopSeconds * 0.5);
            }
            else {
                FLLoops._place(ctx, plan.sounds.main, 0, 0.85, 0, loopSeconds * 0.9);
                FLLoops._place(ctx, plan.sounds.second, loopSeconds * 0.25, 0.35, 0, loopSeconds * 0.7, 0.4);
            }
        }
        static _vox(ctx, plan) {
            const sound = plan.sounds.vox;
            if (!sound)
                return;
            const info = FLSoundFactory.getInfo(sound.key) || {};
            const soundRoot = info.rootKey == undefined ? 60 : info.rootKey;
            const prog = FLLoops._progression(ctx);
            const root = FLLoops._root(ctx.context);
            const stepsPerBar = ctx.beats * 4;
            const rhythms = [[0, 3, 6, 10, 12], [0, 2, 6, 8, 11, 14], [2, 6, 10, 13], [0, 4, 7, 10, 14]];
            const rhythm = rhythms[(ctx.item.index + ctx.item.genreIndex) % rhythms.length];
            for (const block of FLLoops._blocks(ctx)) {
                const chord = FLLoops._voice(FLLoops._chord(ctx.context, prog[block.bar % prog.length], false), soundRoot);
                rhythm.forEach((startStep, k) => {
                    if (startStep >= block.size)
                        return;
                    const pitch = chord[(k + block.index) % chord.length];
                    FLLoops._place(ctx, sound, FLLoops._time(ctx, block.start + startStep), 0.55, pitch - soundRoot, ctx.step * 2.5, 0.03);
                });
            }
        }
    }
    FLLoops._library = null;
    FLLoops._byId = null;
    FLLoops._folders = null;
    FLLoops._cache = new Map();
    FLLoops._cacheSamples = 0;
