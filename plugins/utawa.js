/*
 * Utawa - a singing synthesizer for CarrotBox (in the spirit of VOCALOID).
 *
 *  - type lyrics; each note in the channel sings the next syllable, in song
 *    order (spaces or hyphens separate syllables, "-" holds the previous vowel,
 *    "." is a silent note, [l ah v] spells phonemes directly)
 *  - English (spelling rules + a dictionary of common lyric words), Japanese
 *    romaji, Spanish and Chinese pinyin; any note's lyric can be edited on its own
 *  - glides from the previous note (portamento) and legato joins between
 *    connected notes, like a vocal synth's note transitions
 *  - formant synthesis: glottal source with breath, a five-formant vocal tract,
 *    plosives, fricatives, nasals and glides, diphthongs and final consonants
 *    on note release
 *  - voice controls (gender / formant, breath, tension, growl, choir unison)
 *    and expression (vibrato, scoops, fall, drift, consonant length)
 *  - voice presets and an effect rack
 *
 * Instrument plugin: one voice per note (see createVoice / render).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, Config, carrotFxRack } = A;

    A.addStyle(`
.cb-utawa-lyrics { width: 100%; min-height: 96px; box-sizing: border-box; resize: vertical; font: 14px/1.45 inherit; font-family: inherit; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--ui-widget-focus, #555); background: var(--ui-widget-background, #2a2a2a); color: var(--primary-text, #fff); }
.cb-utawa-map { display: flex; flex-wrap: wrap; gap: 3px; max-height: 128px; overflow: auto; padding: 4px; border-radius: 6px; background: rgba(0,0,0,0.18); }
.cb-utawa-chip { font-size: 11px; padding: 2px 6px; border-radius: 9px; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); white-space: nowrap; }
.cb-utawa-chip small { opacity: 0.6; margin-left: 3px; }
.cb-utawa-chip.cb-now { background: var(--cb-plugin-color, #ff7eb6); color: #111; }
.cb-utawa-chip.cb-rest { opacity: 0.5; }
.cb-utawa-chip { cursor: pointer; border: 1px solid transparent; }
.cb-utawa-chip:hover { border-color: var(--cb-plugin-color, #ff7eb6); }
.cb-utawa-chip.cb-edited { box-shadow: inset 0 -2px 0 var(--cb-plugin-color, #ff7eb6); }
.cb-utawa-chip em { font-style: normal; opacity: 0.55; margin-right: 4px; font-size: 10px; }
.cb-utawa-bank { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; margin-bottom: 8px; background: linear-gradient(90deg, rgba(255,126,182,0.22), rgba(255,126,182,0.04)); border: 1px solid rgba(255,126,182,0.3); }
.cb-utawa-bank .cb-utawa-avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; color: #111; background: var(--cb-plugin-color, #ff7eb6); flex: none; }
.cb-utawa-bank .cb-utawa-bank-name { font-weight: 600; font-size: 13px; }
.cb-utawa-bank .cb-utawa-bank-sub { font-size: 11px; opacity: 0.7; }
.cb-utawa-bank .cb-utawa-bank-pick { margin-left: auto; }
.cb-utawa-bar { font-size: 10px; opacity: 0.65; padding: 2px 4px; align-self: center; }
.cb-utawa-ph { font-family: monospace; font-size: 11px; opacity: 0.8; min-height: 14px; margin-top: 4px; line-height: 1.5; }
`);

    // ------------------------------------------------------------ phonemes
    // t: v vowel, n nasal, l liquid / glide, p plosive, f fricative, a affricate, h aspiration
    const PH = {
        a: { t: "v", f: [730, 1090, 2440] }, ae: { t: "v", f: [660, 1720, 2410] }, ah: { t: "v", f: [640, 1190, 2390] }, aw: { t: "v", f: [570, 840, 2410] },
        e: { t: "v", f: [530, 1840, 2480] }, er: { t: "v", f: [490, 1350, 1690] }, ih: { t: "v", f: [390, 1990, 2550] }, i: { t: "v", f: [270, 2290, 3010] },
        uh: { t: "v", f: [440, 1020, 2240] }, u: { t: "v", f: [300, 870, 2240] }, o: { t: "v", f: [450, 800, 2830] }, ue: { t: "v", f: [260, 1750, 2150] },
        m: { t: "n", f: [280, 900, 2200], amp: 0.32, dur: 75 }, n: { t: "n", f: [280, 1700, 2600], amp: 0.32, dur: 70 }, ng: { t: "n", f: [280, 2300, 2750], amp: 0.28, dur: 75 },
        l: { t: "l", f: [360, 1300, 2900], amp: 0.62, dur: 60 }, r: { t: "l", f: [420, 1300, 1600], amp: 0.6, dur: 60 }, w: { t: "l", f: [290, 610, 2150], amp: 0.55, dur: 55 }, y: { t: "l", f: [260, 2070, 3020], amp: 0.55, dur: 50 },
        p: { t: "p", burst: [900, 1800], voiced: false, dur: 60 }, b: { t: "p", burst: [900, 1800], voiced: true, dur: 45 },
        t: { t: "p", burst: [4500, 3000], voiced: false, dur: 60 }, d: { t: "p", burst: [4000, 3000], voiced: true, dur: 45 },
        k: { t: "p", burst: [2300, 1600], voiced: false, dur: 65 }, g: { t: "p", burst: [2100, 1600], voiced: true, dur: 50 },
        f: { t: "f", noise: [5200, 6000, 0.22], voiced: false, dur: 90 }, v: { t: "f", noise: [4800, 6000, 0.12], voiced: true, dur: 65 },
        s: { t: "f", noise: [6800, 3000, 0.55], voiced: false, dur: 105 }, z: { t: "f", noise: [6500, 3000, 0.35], voiced: true, dur: 80 },
        sh: { t: "f", noise: [3200, 2200, 0.55], voiced: false, dur: 105 }, zh: { t: "f", noise: [3000, 2200, 0.35], voiced: true, dur: 80 },
        th: { t: "f", noise: [6200, 7000, 0.14], voiced: false, dur: 80 }, dh: { t: "f", noise: [5000, 7000, 0.09], voiced: true, dur: 45 },
        h: { t: "h", dur: 70 }, ch: { t: "a", fric: "sh", voiced: false, dur: 115 }, j: { t: "a", fric: "zh", voiced: true, dur: 95 }, ts: { t: "a", fric: "s", voiced: false, dur: 100 },
        jr: { t: "l", f: [380, 1400, 2400], amp: 0.55, dur: 28 }, // Japanese / Spanish tapped r
        rr: { t: "l", f: [400, 1400, 2400], amp: 0.55, dur: 95, trill: true }, // Spanish trilled r
    };
    const DIPHTHONGS = { ai: ["a", "i"], ei: ["e", "i"], oi: ["o", "i"], au: ["a", "u"], ou: ["o", "u"] };
    const isVowelPh = (ph) => (PH[ph] && PH[ph].t == "v") || !!DIPHTHONGS[ph];

    // ------------------------------------------------------------ English
    const DICT = {
        "i": [["ai"]], "i'm": [["ai", "m"]], "i'll": [["ai", "l"]], "me": [["m", "i"]], "my": [["m", "ai"]], "you": [["y", "u"]], "your": [["y", "aw", "r"]], "you're": [["y", "aw", "r"]],
        "we": [["w", "i"]], "the": [["dh", "ah"]], "a": [["ah"]], "love": [["l", "ah", "v"]], "baby": [["b", "ei"], ["b", "i"]], "oh": [["ou"]], "yeah": [["y", "e", "ah"]],
        "ooh": [["u"]], "ah": [["a"]], "la": [["l", "a"]], "na": [["n", "a"]], "da": [["d", "a"]], "ba": [["b", "a"]], "doo": [["d", "u"]], "hey": [["h", "ei"]], "whoa": [["w", "ou"]],
        "heart": [["h", "a", "r", "t"]], "night": [["n", "ai", "t"]], "light": [["l", "ai", "t"]], "time": [["t", "ai", "m"]], "are": [["a", "r"]], "be": [["b", "i"]],
        "so": [["s", "ou"]], "go": [["g", "ou"]], "no": [["n", "ou"]], "one": [["w", "ah", "n"]], "all": [["aw", "l"]], "to": [["t", "u"]], "do": [["d", "u"]],
        "in": [["ih", "n"]], "it": [["ih", "t"]], "and": [["ae", "n", "d"]], "is": [["ih", "z"]], "this": [["dh", "ih", "s"]], "that": [["dh", "ae", "t"]], "with": [["w", "ih", "dh"]],
        "for": [["f", "aw", "r"]], "on": [["aw", "n"]], "up": [["ah", "p"]], "down": [["d", "au", "n"]], "never": [["n", "e"], ["v", "er"]], "ever": [["e"], ["v", "er"]],
        "forever": [["f", "er"], ["e"], ["v", "er"]], "dream": [["d", "r", "i", "m"]], "sky": [["s", "k", "ai"]], "fly": [["f", "l", "ai"]], "stay": [["s", "t", "ei"]],
        "away": [["ah"], ["w", "ei"]], "day": [["d", "ei"]], "way": [["w", "ei"]], "say": [["s", "ei"]], "feel": [["f", "i", "l"]], "need": [["n", "i", "d"]], "know": [["n", "ou"]],
        "now": [["n", "au"]], "how": [["h", "au"]], "girl": [["g", "er", "l"]], "boy": [["b", "oi"]], "world": [["w", "er", "l", "d"]], "hello": [["h", "e"], ["l", "ou"]],
        "want": [["w", "aw", "n", "t"]], "tonight": [["t", "u"], ["n", "ai", "t"]], "alone": [["ah"], ["l", "ou", "n"]], "home": [["h", "ou", "m"]], "again": [["ah"], ["g", "e", "n"]],
        "believe": [["b", "ih"], ["l", "i", "v"]], "tell": [["t", "e", "l"]], "cry": [["k", "r", "ai"]], "why": [["w", "ai"]], "free": [["f", "r", "i"]], "fire": [["f", "ai"], ["er"]],
        "higher": [["h", "ai"], ["er"]], "lonely": [["l", "ou", "n"], ["l", "i"]], "music": [["m", "y", "u"], ["z", "ih", "k"]], "beautiful": [["b", "y", "u"], ["t", "ih"], ["f", "uh", "l"]],
        "together": [["t", "u"], ["g", "e"], ["dh", "er"]], "tomorrow": [["t", "u"], ["m", "aw"], ["r", "ou"]], "sun": [["s", "ah", "n"]], "rain": [["r", "ei", "n"]], "eyes": [["ai", "z"]],
        "see": [["s", "i"]], "can": [["k", "ae", "n"]], "can't": [["k", "ae", "n", "t"]], "don't": [["d", "ou", "n", "t"]], "come": [["k", "ah", "m"]], "take": [["t", "ei", "k"]],
        "make": [["m", "ei", "k"]], "hold": [["h", "ou", "l", "d"]], "star": [["s", "t", "a", "r"]], "stars": [["s", "t", "a", "r", "z"]], "moon": [["m", "u", "n"]], "soul": [["s", "ou", "l"]],
        "life": [["l", "ai", "f"]], "dance": [["d", "ae", "n", "s"]], "kiss": [["k", "ih", "s"]], "touch": [["t", "ah", "ch"]], "everything": [["e"], ["v", "r", "i"], ["th", "ih", "ng"]],
        "everybody": [["e"], ["v", "r", "i"], ["b", "aw"], ["d", "i"]], "only": [["ou", "n"], ["l", "i"]], "into": [["ih", "n"], ["t", "u"]], "through": [["th", "r", "u"]], "true": [["t", "r", "u"]],
        "blue": [["b", "l", "u"]], "you've": [["y", "u", "v"]], "goodbye": [["g", "uh", "d"], ["b", "ai"]], "sweet": [["s", "w", "i", "t"]], "summer": [["s", "ah"], ["m", "er"]],
        "remember": [["r", "ih"], ["m", "e", "m"], ["b", "er"]], "under": [["ah", "n"], ["d", "er"]], "over": [["ou"], ["v", "er"]], "here": [["h", "i", "er"]], "there": [["dh", "e", "er"]],
        "where": [["w", "e", "er"]], "they": [["dh", "ei"]], "what": [["w", "ah", "t"]], "when": [["w", "e", "n"]], "said": [["s", "e", "d"]], "would": [["w", "uh", "d"]], "could": [["k", "uh", "d"]],
        "people": [["p", "i"], ["p", "uh", "l"]], "water": [["w", "aw"], ["t", "er"]], "ocean": [["ou"], ["sh", "ah", "n"]], "angel": [["ei", "n"], ["j", "uh", "l"]], "shine": [["sh", "ai", "n"]],
    };
    const VOICED_TH = new Set(["the", "this", "that", "these", "those", "them", "then", "there", "they", "their", "though", "than", "with", "thee", "thy"]);
    const NOW_WORDS = new Set(["now", "how", "wow", "cow", "bow", "vow", "allow", "brow", "plow"]);
    const ENGLISH_DIGRAPHS = ["tch", "sh", "ch", "th", "ph", "ng", "ck", "wh", "qu", "kn", "wr", "gh", "dg"];
    function splitEnglish(word) {
        // vowel groups (y counts as a vowel unless it starts the word or comes before a vowel)
        const letters = word.replace(/[^a-z']/g, "").replace(/'/g, "");
        if (!letters) return [];
        const isV = (i) => {
            const c = letters[i];
            if ("aeiou".includes(c)) return true;
            if (c == "y") return i > 0 && !(letters[i + 1] && "aeiou".includes(letters[i + 1]));
            return false;
        };
        const groups = [];
        for (let i = 0; i < letters.length;) {
            if (isV(i)) {
                let j = i;
                while (j < letters.length && isV(j)) j++;
                groups.push([i, j]);
                i = j;
            }
            else i++;
        }
        if (groups.length == 0) return [{ text: letters, magicE: false }];
        // silent final e: "love", "time" (not "be", "me")
        let magicE = false;
        const syllabicLe = groups.length > 1 && letters.length > 3 && /[bcdfgkpstvz]le$/.test(letters);
        if (groups.length > 1 && !syllabicLe) {
            const last = groups[groups.length - 1];
            if (letters.slice(last[0], last[1]) == "e" && last[1] == letters.length && !"aeiou".includes(letters[last[0] - 1])) {
                groups.pop();
                magicE = true;
            }
            else if (letters.endsWith("es") && groups.length > 1 && last[0] == letters.length - 2 && !/(s|z|x|ch|sh|c|g)es$/.test(letters)) {
                groups.pop();
                magicE = true;
            }
        }
        if (groups.length == 1) return [{ text: letters, magicE }];
        // boundaries between groups
        const cuts = [];
        for (let g = 0; g < groups.length - 1; g++) {
            const from = groups[g][1], to = groups[g + 1][0];
            const cluster = letters.slice(from, to);
            if (cluster.length <= 1) cuts.push(from);
            else {
                const digraph = ENGLISH_DIGRAPHS.find(d => cluster.startsWith(d) && d.length == cluster.length) || (["th", "sh", "ch", "ph", "wh"].includes(cluster.slice(-2)) ? null : null);
                if (digraph) cuts.push(from);
                else if (["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr", "st", "sp", "sk", "sw", "tw", "th", "sh", "ch", "ph", "wh"].includes(cluster.slice(-2)) && cluster.length >= 2)
                    cuts.push(to - 2);
                else cuts.push(from + 1);
            }
        }
        const out = [];
        let start = 0;
        cuts.forEach((cut, k) => { out.push({ text: letters.slice(start, cut), magicE: false }); start = cut; });
        out.push({ text: letters.slice(start), magicE });
        return out.filter(s => s.text);
    }
    function englishSyllablePh(text, magicE, wordInfo) {
        // "-ble", "-kle", "-tle"...: the e is silent and the l is syllabic ("twin-kle" = k uh l)
        if (/^[^aeiouy]*[bcdfgkpstvz]le$/.test(text) && !magicE)
            return englishSyllablePh(text.slice(0, -2), false, wordInfo).concat(["uh", "l"]);
        const ph = [];
        let i = 0;
        const s = text;
        const vowelStart = s.search(/[aeiouy]/);
        const open = !/[^aeiouy]$/.test(s) || (s.endsWith("y") && s.length > 1);
        while (i < s.length) {
            const rest = s.slice(i);
            const take = (n, ...phs) => { ph.push(...phs); i += n; };
            if (rest.startsWith("tion")) { take(4, "sh", "ah", "n"); continue; }
            if (rest.startsWith("sion")) { take(4, "zh", "ah", "n"); continue; }
            if (rest.startsWith("igh")) { take(3, "ai"); continue; }
            if (rest.startsWith("tch")) { take(3, "ch"); continue; }
            if (rest.startsWith("sh")) { take(2, "sh"); continue; }
            if (rest.startsWith("ch")) { take(2, "ch"); continue; }
            if (rest.startsWith("th")) { take(2, wordInfo.voicedTh ? "dh" : "th"); continue; }
            if (rest.startsWith("ph")) { take(2, "f"); continue; }
            if (rest.startsWith("ng")) { take(2, "ng"); continue; }
            if (rest.startsWith("nk")) { take(2, "ng", "k"); continue; }
            if (rest.startsWith("ck")) { take(2, "k"); continue; }
            if (rest.startsWith("wh")) { take(2, "w"); continue; }
            if (rest.startsWith("qu")) { take(2, "k", "w"); continue; }
            if (i == 0 && rest.startsWith("kn")) { take(2, "n"); continue; }
            if (i == 0 && rest.startsWith("wr")) { take(2, "r"); continue; }
            if (rest.startsWith("gh")) { i += 2; continue; }
            if (rest.startsWith("dg")) { take(2, "j"); continue; }
            // vowel groups
            const vowelPatterns = [
                ["eer", "i"], ["ear", "er"], ["air", "e"], ["are", "e"], ["ee", "i"], ["ea", "i"], ["oo", "u"], ["ou", "au"], ["ow", wordInfo.ow], ["ai", "ei"], ["ay", "ei"],
                ["ei", "ei"], ["ey", "ei"], ["oa", "ou"], ["oe", "ou"], ["oi", "oi"], ["oy", "oi"], ["au", "aw"], ["aw", "aw"], ["ie", i + 2 >= s.length ? "ai" : "i"],
                ["ue", "u"], ["ew", "u"], ["ui", "u"], ["ar", "a"], ["or", "aw"], ["er", "er"], ["ir", "er"], ["ur", "er"],
            ];
            const vp = vowelPatterns.find(([pat]) => rest.startsWith(pat));
            if (vp) { take(vp[0].length, vp[1]); continue; }
            const c = s[i];
            if ("aeiou".includes(c) || (c == "y" && i >= Math.max(1, vowelStart))) {
                let v;
                switch (c) {
                    case "a": v = magicE ? "ei" : (open ? (wordInfo.single ? "a" : "ei") : "ae"); break;
                    case "e": v = magicE ? "i" : (open ? "i" : "e"); break;
                    case "i": v = magicE ? "ai" : (open ? "ai" : "ih"); break;
                    case "o": v = magicE ? "ou" : (open ? "ou" : "aw"); break;
                    case "u": v = magicE ? "u" : (open ? "u" : "ah"); break;
                    default: v = wordInfo.single ? "ai" : "i"; // y
                }
                take(1, v);
                continue;
            }
            const map = { b: "b", d: "d", f: "f", g: "g", h: "h", j: "j", k: "k", l: "l", m: "m", n: "n", p: "p", r: "r", s: "s", t: "t", v: "v", w: "w", y: "y", z: "z" };
            if (c == "c") { take(1, "eiy".includes(s[i + 1] || "") ? "s" : "k"); continue; }
            if (c == "x") { take(1, "k", "s"); continue; }
            if (c == "q") { take(1, "k"); continue; }
            if (map[c]) {
                if (ph.length && ph[ph.length - 1] == map[c] && !isVowelPh(map[c])) { i++; continue; } // doubled letters
                take(1, map[c]);
                continue;
            }
            i++;
        }
        // a trailing silent e inside the syllable text
        return ph;
    }
    function englishWord(word) {
        const lower = word.toLowerCase();
        if (DICT[lower]) return DICT[lower].map(ph => ({ text: null, ph: ph.slice() }));
        const parts = splitEnglish(lower);
        const info = { voicedTh: VOICED_TH.has(lower), ow: NOW_WORDS.has(lower) || /ow[nld]/.test(lower) ? "au" : "ou", single: parts.length == 1 };
        return parts.map(part => ({ text: part.text, ph: englishSyllablePh(part.text.replace(/e$/, part.magicE ? "" : "e"), part.magicE, info) }));
    }
    // ------------------------------------------------------------ Japanese romaji
    const ROMAJI_ONSETS = [
        ["kya", ["k", "y"], "a"], ["kyu", ["k", "y"], "u"], ["kyo", ["k", "y"], "o"], ["gya", ["g", "y"], "a"], ["gyu", ["g", "y"], "u"], ["gyo", ["g", "y"], "o"],
        ["sha", ["sh"], "a"], ["shu", ["sh"], "u"], ["sho", ["sh"], "o"], ["shi", ["sh"], "i"], ["she", ["sh"], "e"], ["cha", ["ch"], "a"], ["chu", ["ch"], "u"], ["cho", ["ch"], "o"],
        ["chi", ["ch"], "i"], ["che", ["ch"], "e"], ["tsu", ["ts"], "u"], ["nya", ["n", "y"], "a"], ["nyu", ["n", "y"], "u"], ["nyo", ["n", "y"], "o"], ["hya", ["h", "y"], "a"],
        ["hyu", ["h", "y"], "u"], ["hyo", ["h", "y"], "o"], ["mya", ["m", "y"], "a"], ["myu", ["m", "y"], "u"], ["myo", ["m", "y"], "o"], ["rya", ["jr", "y"], "a"], ["ryu", ["jr", "y"], "u"],
        ["ryo", ["jr", "y"], "o"], ["ja", ["j"], "a"], ["ju", ["j"], "u"], ["jo", ["j"], "o"], ["ji", ["j"], "i"], ["je", ["j"], "e"], ["bya", ["b", "y"], "a"], ["byu", ["b", "y"], "u"],
        ["byo", ["b", "y"], "o"], ["pya", ["p", "y"], "a"], ["pyu", ["p", "y"], "u"], ["pyo", ["p", "y"], "o"], ["fu", ["f"], "u"], ["fa", ["f"], "a"], ["fi", ["f"], "i"], ["fe", ["f"], "e"], ["fo", ["f"], "o"],
    ];
    const ROMAJI_C = { k: "k", g: "g", s: "s", z: "z", t: "t", d: "d", n: "n", h: "h", b: "b", p: "p", m: "m", y: "y", r: "jr", w: "w", v: "v" };
    function romajiWord(word) {
        const s = word.toLowerCase().replace(/[^a-z\-]/g, "");
        const out = [];
        let i = 0;
        while (i < s.length) {
            const rest = s.slice(i);
            if ("aiueo".includes(rest[0])) { out.push({ text: rest[0], ph: [rest[0]] }); i++; continue; }
            if (rest[0] == "n" && (rest.length == 1 || !"aiueoy".includes(rest[1]))) {
                out.push({ text: "n", ph: ["n"] });
                i += (rest[1] == "'" ? 2 : 1);
                continue;
            }
            if (rest.length > 1 && rest[0] == rest[1] && rest[0] != "n") { i++; continue; } // small tsu: skip the doubled consonant
            const onset = ROMAJI_ONSETS.find(([pat]) => rest.startsWith(pat));
            if (onset) { out.push({ text: onset[0], ph: onset[1].concat([onset[2]]) }); i += onset[0].length; continue; }
            const c = ROMAJI_C[rest[0]];
            if (c && "aiueo".includes(rest[1] || "")) {
                let phs = [c, rest[1]];
                if (rest[0] == "t" && rest[1] == "u") phs = ["ts", "u"];
                if (rest[0] == "s" && rest[1] == "i") phs = ["sh", "i"];
                if (rest[0] == "t" && rest[1] == "i") phs = ["ch", "i"];
                if (rest[0] == "z" && rest[1] == "i") phs = ["j", "i"];
                if (rest[0] == "h" && rest[1] == "u") phs = ["f", "u"];
                out.push({ text: rest.slice(0, 2), ph: phs });
                i += 2;
                continue;
            }
            i++;
        }
        return out;
    }
    // ------------------------------------------------------------ Spanish
    const ES_ONSETS = new Set(["pl", "pr", "bl", "br", "tr", "dr", "kl", "kr", "gl", "gr", "fl", "fr"]);
    function spanishWord(word, inside = false) {
        let s = word.toLowerCase().replace(/ñ/g, "ny").replace(/ü/g, "w").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
        const ph = [];
        const isV = (c) => "aeiou".includes(c || "");
        for (let i = 0; i < s.length;) {
            const c = s[i], n = s[i + 1] || "";
            if (s.startsWith("ch", i)) { ph.push("ch"); i += 2; continue; }
            if (s.startsWith("ll", i)) { ph.push("y"); i += 2; continue; }
            if (s.startsWith("rr", i)) { ph.push("rr"); i += 2; continue; }
            if (s.startsWith("qu", i)) { ph.push("k"); i += 2; continue; }
            if (s.startsWith("gu", i) && "ei".includes(s[i + 2] || "x")) { ph.push("g"); i += 2; continue; }
            if (isV(c)) {
                // i / u next to another vowel glide into it (bueno, siempre); after a vowel they end a diphthong
                if ((c == "i" || c == "u") && isV(n) && n != c) ph.push(c == "i" ? "y" : "w");
                else ph.push(c);
                i++;
                continue;
            }
            switch (c) {
                case "c": ph.push("ei".includes(n) && n ? "s" : "k"); break;
                case "g": ph.push("ei".includes(n) && n ? "h" : "g"); break;
                case "j": ph.push("h"); break;
                case "h": break;
                case "v": ph.push("b"); break;
                case "z": ph.push("s"); break;
                case "x": ph.push("k", "s"); break;
                case "y": ph.push(isV(n) ? "y" : "i"); break;
                case "r": ph.push(i == 0 && !inside ? "rr" : "jr"); break;
                default: if (PH[c]) ph.push(c);
            }
            i++;
        }
        // syllables: one per vowel group, consonants go to the next vowel when they can start a syllable
        const vowel = (p) => PH[p] && PH[p].t == "v";
        const nuclei = [];
        for (let i = 0; i < ph.length; i++) {
            if (vowel(ph[i])) {
                let j = i;
                while (j + 1 < ph.length && vowel(ph[j + 1]) && (["i", "u"].includes(ph[j + 1]) || ["i", "u"].includes(ph[j]))) j++;
                nuclei.push([i, j]);
                i = j;
            }
        }
        if (nuclei.length == 0) return ph.length ? [{ text: word, ph }] : [];
        const cuts = [0];
        for (let k = 0; k + 1 < nuclei.length; k++) {
            const from = nuclei[k][1] + 1, to = nuclei[k + 1][0];
            const cluster = ph.slice(from, to);
            let cut;
            if (cluster.length <= 1) cut = from;
            else if (cluster.length == 2) cut = ES_ONSETS.has(cluster.join("")) || (cluster[1] == "jr" && ["p", "b", "t", "d", "k", "g", "f"].includes(cluster[0])) ? from : from + 1;
            else cut = (ES_ONSETS.has(cluster.slice(-2).join("")) ? to - 2 : to - 1);
            cuts.push(cut);
        }
        const out = [];
        for (let k = 0; k < cuts.length; k++) {
            const part = ph.slice(cuts[k], k + 1 < cuts.length ? cuts[k + 1] : ph.length);
            out.push({ text: cuts.length > 1 ? word + "(" + (k + 1) + ")" : word, ph: part });
        }
        return out;
    }
    // ------------------------------------------------------------ Chinese pinyin
    const PINYIN_INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];
    const PINYIN_INITIAL_PH = { b: ["b"], p: ["p"], m: ["m"], f: ["f"], d: ["d"], t: ["t"], n: ["n"], l: ["l"], g: ["g"], k: ["k"], h: ["h"], j: ["j"], q: ["ch"], x: ["sh"], zh: ["j"], ch: ["ch"], sh: ["sh"], r: ["r"], z: ["ts"], c: ["ts"], s: ["s"], y: ["y"], w: ["w"] };
    const PINYIN_FINALS = {
        iang: ["y", "a", "ng"], iong: ["y", "u", "ng"], uang: ["w", "a", "ng"], ueng: ["w", "uh", "ng"], iao: ["y", "au"], ian: ["y", "e", "n"], uai: ["w", "ai"], uan: ["w", "a", "n"], van: ["ue", "e", "n"],
        ang: ["a", "ng"], eng: ["uh", "ng"], ing: ["i", "ng"], ong: ["u", "ng"], ai: ["ai"], ei: ["ei"], ao: ["au"], ou: ["ou"], an: ["a", "n"], en: ["uh", "n"], in: ["i", "n"], un: ["w", "uh", "n"], vn: ["ue", "n"],
        ia: ["y", "a"], ie: ["y", "e"], iu: ["y", "ou"], ua: ["w", "a"], uo: ["w", "o"], ui: ["w", "ei"], ve: ["ue", "e"], ue: ["ue", "e"], er: ["er"], a: ["a"], o: ["o"], e: ["uh"], i: ["i"], u: ["u"], v: ["ue"],
    };
    const PINYIN_FINAL_KEYS = Object.keys(PINYIN_FINALS).sort((x, y) => y.length - x.length);
    function pinyinWord(word) {
        const s = word.toLowerCase().replace(/ü/g, "v").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
        const out = [];
        for (let i = 0; i < s.length;) {
            const initial = PINYIN_INITIALS.find(x => s.startsWith(x, i)) || "";
            let j = i + initial.length;
            let final = PINYIN_FINAL_KEYS.find(f => s.startsWith(f, j));
            if (!final) {
                if (initial && !s[j]) { out.push({ text: initial, ph: PINYIN_INITIAL_PH[initial].concat(["uh"]) }); break; }
                i = Math.max(i + 1, j);
                continue;
            }
            // pinyin spelling rules
            let ph = PINYIN_FINALS[final].slice();
            if (["j", "q", "x", "y"].includes(initial) && final[0] == "u") ph = final == "u" ? ["ue"] : final == "un" ? ["ue", "n"] : final == "uan" ? ["ue", "e", "n"] : final == "ue" ? ["ue", "e"] : ph;
            if (final == "i" && ["zh", "ch", "sh", "r"].includes(initial)) ph = ["er"];
            if (final == "i" && ["z", "c", "s"].includes(initial)) ph = ["ih"];
            let onset = initial ? PINYIN_INITIAL_PH[initial].slice() : [];
            if (initial == "y" && (ph[0] == "y" || ph[0] == "i" || ph[0] == "ue")) onset = [];
            if (initial == "w" && (ph[0] == "w" || ph[0] == "u")) onset = [];
            out.push({ text: s.slice(i, j + final.length), ph: onset.concat(ph) });
            i = j + final.length;
        }
        return out;
    }
    // ------------------------------------------------------------ lyrics
    const LANGUAGES = ["English", "Japanese (romaji)", "Spanish", "Chinese (pinyin)"];
    const lyricCache = new Map();
    function parseLyrics(text, lang, autoSplit) {
        const cacheKey = lang + "|" + (autoSplit ? 1 : 0) + "|" + text;
        if (lyricCache.has(cacheKey)) return lyricCache.get(cacheKey);
        const out = [];
        const tokens = String(text || "").match(/\[[^\]]*\]|\S+/g) || [];
        for (const token of tokens) {
            if (token.startsWith("[")) {
                const ph = token.slice(1, -1).trim().split(/\s+/).filter(p => PH[p] || DIPHTHONGS[p]);
                if (ph.length) out.push({ text: token, ph });
                continue;
            }
            const pieces = token.split(/(?<=.)-(?=.)/);
            for (const raw of pieces) {
                const piece = raw.replace(/^[,.!?;:"()]+|[,!?;:"()]+$/g, "");
                if (piece == "-" || piece == "~" || piece == "_" || raw == "-") { out.push({ text: "-", melisma: true, ph: [] }); continue; }
                if (piece == "." || piece == "*" || piece == "") { if (raw.trim() == "." || raw.trim() == "*") out.push({ text: ".", rest: true, ph: [] }); continue; }
                let syllables;
                if (lang == 1) syllables = romajiWord(piece);
                else if (lang == 2) syllables = spanishWord(piece, pieces.length > 1 && raw != pieces[0]);
                else if (lang == 3) syllables = pinyinWord(piece);
                else if (autoSplit && !raw.includes("-")) syllables = englishWord(piece);
                else {
                    const info = { voicedTh: VOICED_TH.has(piece.toLowerCase()), ow: "ou", single: true };
                    syllables = DICT[piece.toLowerCase()] && DICT[piece.toLowerCase()].length == 1 ? [{ text: piece, ph: DICT[piece.toLowerCase()][0].slice() }] : [{ text: piece, ph: englishSyllablePh(piece.toLowerCase().replace(/[^a-z]/g, ""), /[^aeiou]e$/.test(piece.toLowerCase()), info) }];
                }
                const word = piece;
                syllables.forEach((syl, k) => {
                    if (!syl.ph.some(isVowelPh)) {
                        // a vowel-less piece (e.g. "hmm") hums its last nasal or gets a neutral vowel
                        const nasal = syl.ph.find(p => PH[p] && PH[p].t == "n");
                        if (nasal) syl.ph = syl.ph.slice(0, syl.ph.indexOf(nasal)).concat(["hum:" + nasal]);
                        else syl.ph.push("ah");
                    }
                    out.push({ text: syl.text || (syllables.length > 1 ? word + "(" + (k + 1) + ")" : word), ph: syl.ph });
                });
            }
        }
        // readable text for multi-syllable dictionary words
        lyricCache.set(cacheKey, out);
        if (lyricCache.size > 40) lyricCache.delete(lyricCache.keys().next().value);
        return out;
    }
    // Splits a syllable into onset consonants, vowel targets (1 or 2 for a diphthong) and coda consonants.
    function structure(syl) {
        const onset = [], nucleus = [], coda = [];
        let stage = 0;
        for (const p of syl.ph) {
            if (p.startsWith("hum:")) { nucleus.push(p); stage = 2; continue; }
            if (isVowelPh(p)) {
                if (stage == 2) { coda.push(p); continue; }
                const parts = DIPHTHONGS[p] || [p];
                nucleus.push(...parts);
                stage = 1;
            }
            else if (stage == 0) onset.push(p);
            else { stage = 2; coda.push(p); }
        }
        return { onset, nucleus: nucleus.slice(0, 3), coda: coda.filter(p => PH[p]) };
    }

    // ------------------------------------------------------------ params
    function defaults() {
        return {
            lyrics: "hel-lo world I sing for you la la la la",
            lang: 0, autoSplit: true, wrap: true,
            formant: 1.16, breath: 0.16, tension: 0.55, growl: 0, unison: 1, detune: 10, dynamics: 0.55, volume: 0.8,
            vibDepth: 0.32, vibRate: 5.6, vibDelay: 0.28, scoop: 1.1, fall: 0.6, drift: 0.5, consonant: 1, release: 0.12, robot: false,
            portamento: 0.45, clearness: 0.5, legato: true, noteLyrics: {}, voiceName: "Default voice",
            fx: [Object.assign(CarrotFX.defaults("reverb"), { mix: 0.18, size: 0.55 })],
        };
    }
    function fill(p) {
        const d = defaults();
        for (const key of Object.keys(d)) if (p[key] === undefined) p[key] = key == "fx" ? JSON.parse(JSON.stringify(d.fx)) : d[key];
        if (!Array.isArray(p.fx)) p.fx = [];
        if (!p.noteLyrics || typeof p.noteLyrics != "object" || Array.isArray(p.noteLyrics)) p.noteLyrics = {};
        return p;
    }
    const VOICES = [
        { name: "Mika - bright pop", params: { formant: 1.18, breath: 0.14, tension: 0.62, vibDepth: 0.32, vibRate: 5.7, scoop: 1.2, growl: 0, unison: 1 } },
        { name: "Ren - warm male", params: { formant: 0.92, breath: 0.12, tension: 0.45, vibDepth: 0.28, vibRate: 5.2, scoop: 0.8, growl: 0.05, unison: 1 } },
        { name: "Sora - young voice", params: { formant: 1.32, breath: 0.2, tension: 0.6, vibDepth: 0.22, vibRate: 6.2, scoop: 0.9, growl: 0, unison: 1 } },
        { name: "Yuki - whisper", params: { formant: 1.15, breath: 0.78, tension: 0.3, vibDepth: 0.12, vibRate: 5, scoop: 0.4, growl: 0, unison: 1 } },
        { name: "Diva - power vibrato", params: { formant: 1.12, breath: 0.08, tension: 0.78, vibDepth: 0.55, vibRate: 5.4, vibDelay: 0.18, scoop: 1.6, growl: 0, unison: 1 } },
        { name: "Soul - grit male", params: { formant: 0.95, breath: 0.18, tension: 0.7, vibDepth: 0.35, vibRate: 5, scoop: 1.8, growl: 0.35, unison: 1 } },
        { name: "Choir - ensemble", params: { formant: 1.05, breath: 0.2, tension: 0.5, vibDepth: 0.25, vibRate: 5.3, scoop: 0.5, growl: 0, unison: 5, detune: 14 } },
        { name: "Echo - robot", params: { formant: 1.0, breath: 0.05, tension: 0.85, vibDepth: 0, scoop: 0, fall: 0, drift: 0, growl: 0, unison: 1, robot: true } },
        { name: "Lullaby - soft", params: { formant: 1.1, breath: 0.35, tension: 0.35, vibDepth: 0.18, vibRate: 4.8, vibDelay: 0.45, scoop: 0.6, growl: 0, unison: 1, release: 0.25 } },
    ];
    const LYRIC_EXAMPLES = [
        ["English pop", 0, "I can see the light to-night we're fly-ing high a-bove the world la la la"],
        ["Japanese (romaji)", 1, "ko n ni chi wa a o i so ra u ta o u ta u yo"],
        ["Vowel ooh / ah", 0, "ooh - ah - oh - ooh -"],
        ["Phonemes", 0, "[l ah v] [m ai] [h a r t] [w ou]"],
        ["Spanish", 2, "can-ta-re-mos ba-jo la lu-na lle-na co-ra-zon"],
        ["Chinese (pinyin)", 3, "ni hao wo ai ni yue liang dai biao wo de xin"],
    ];

    // ------------------------------------------------------------ synthesis
    const liveCounters = new WeakMap();
    function syllableFor(params, info) {
        const list = parseLyrics(params.lyrics, params.lang | 0, params.autoSplit !== false);
        if (list.length == 0) return { syl: { text: "la", ph: ["l", "a"] }, prev: null };
        let index;
        if (info.noteIndex == null) {
            index = liveCounters.get(params) || 0;
            liveCounters.set(params, index + 1);
            index = index % list.length;
        }
        else if (params.wrap !== false) index = info.noteIndex % list.length;
        else index = Math.min(info.noteIndex, list.length);
        // a lyric typed on this note replaces the one from the text
        const own = info.noteIndex != null ? params.noteLyrics && params.noteLyrics[info.noteIndex] : null;
        if (own) {
            const parsed = parseLyrics(String(own), params.lang | 0, false);
            if (parsed.length > 0) {
                const syl = parsed[0];
                let prev = null;
                if (syl.melisma)
                    for (let k = 1; k <= list.length && index - k >= 0; k++) {
                        const before = list[(index - k) % list.length];
                        if (before && !before.melisma && !before.rest) { prev = before; break; }
                    }
                return { syl, prev };
            }
        }
        if (index >= list.length) return { syl: { text: "ah", ph: ["ah"] }, prev: null };
        let syl = list[index];
        let prev = null;
        if (syl.melisma) {
            // hold the last sung vowel
            for (let k = 1; k <= list.length; k++) {
                const before = list[(index - k + list.length * 4) % list.length];
                if (before && !before.melisma && !before.rest) { prev = before; break; }
            }
        }
        return { syl, prev };
    }
    // Two-pole resonator (Klatt), unity gain at DC.
    function resonator() { return { a: 1, b: 0, c: 0, y1: 0, y2: 0 }; }
    function setResonator(r, f, bw, sr) {
        const T = 1 / sr;
        const c = -Math.exp(-2 * Math.PI * bw * T);
        const b = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * f * T);
        r.a = 1 - b - c;
        r.b = b;
        r.c = c;
    }
    function bandpass(f, q, sr) {
        const w = 2 * Math.PI * Math.min(f, sr * 0.45) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
        return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
    }
    function runBandpass(bp, x) {
        const y = bp.b0 * x + bp.b2 * bp.x2 - bp.a1 * bp.y1 - bp.a2 * bp.y2;
        bp.x2 = bp.x1; bp.x1 = x; bp.y2 = bp.y1; bp.y1 = y;
        return y;
    }
    function blepSaw(phase, dt) {
        const t = phase - Math.floor(phase);
        let v = 2 * t - 1;
        if (t < dt) { const x = t / dt; v -= x + x - x * x - 1; }
        else if (t > 1 - dt) { const x = (t - 1) / dt; v -= x * x + x + x + 1; }
        return v;
    }
    function vowelFormants(name) {
        if (name && name.startsWith("hum:")) return PH[name.slice(4)].f;
        return (PH[name] && PH[name].f) || PH.ah.f;
    }
    function createVoice(params, info) {
        const p = fill(params);
        const sr = info.sampleRate;
        const { syl, prev } = syllableFor(p, info);
        if (syl.rest) return { done: true, silent: true };
        let parts;
        if (syl.melisma) {
            const held = prev ? structure(prev) : { onset: [], nucleus: ["a"], coda: [] };
            parts = { onset: [], nucleus: [held.nucleus[held.nucleus.length - 1] || "a"], coda: held.coda };
        }
        else parts = structure(syl);
        if (parts.nucleus.length == 0) parts.nucleus = ["ah"];
        const scale = Math.max(0.3, Math.min(2.5, p.consonant || 1));
        const segs = parts.onset.filter(ph => PH[ph]).map(ph => ({ ph, len: Math.max(1, Math.floor((PH[ph].dur || 60) * scale * sr / 1000)) }));
        const firstVowel = parts.nucleus[0];
        const voices = Math.max(1, Math.min(8, p.unison | 0));
        const sources = [];
        for (let v = 0; v < voices; v++) {
            const spread = voices == 1 ? 0 : (v / (voices - 1) - 0.5) * 2 * (p.detune || 10);
            sources.push({ phase: Math.random(), cents: spread, jitter: 0, jitterTarget: 0 });
        }
        const voice = {
            parts, segs, seg: 0, segPos: 0, stage: segs.length ? "onset" : "vowel", vowelSamples: 0, release: null, done: false,
            sources, lp1: 0, lp2: 0, res: [resonator(), resonator(), resonator(), resonator(), resonator()],
            F: vowelFormants(segs.length ? (PH[segs[0].ph].f ? segs[0].ph : firstVowel) : firstVowel).slice(),
            av: 0, asp: 0, fric: 0, fricBp: null, fricKey: "", amp: 0, t: 0, vibPhase: Math.random() * 6.28, drift: 0, driftTarget: 0, noise: 1, coefCountdown: 0,
            velocity: info.velocity == undefined ? 1 : info.velocity, finalFade: 0, finalFadeLen: Math.floor(0.05 * sr), growlPhase: 0, sr,
            jitter: 0, jitterTarget: 0, shimmer: 1,
        };
        // Glide from the previous note when it is close by (portamento); otherwise scoop up from below.
        const porta = Math.max(0, Math.min(1, p.portamento));
        if (info.prevDelta != null && info.prevGap != null && info.prevGap < 0.25 && porta > 0 && Math.abs(info.prevDelta) <= 12) {
            voice.glideFrom = -info.prevDelta;
            voice.glideTime = 0.03 + porta * 0.22;
            voice.connected = info.prevGap < 0.03;
        }
        // A note that runs straight into the next one does not fall or fade slowly.
        voice.legatoOut = p.legato !== false && info.nextGap != null && info.nextGap < 0.03;
        return voice;
    }
    // what the current phoneme asks for: formants, voicing, aspiration, frication
    function targets(voice, p) {
        const sr = voice.sr;
        let ph, pos = 0, len = 1, nextVowel = voice.parts.nucleus[0];
        if (voice.stage == "onset") {
            const seg = voice.segs[voice.seg];
            ph = seg.ph; pos = voice.segPos; len = seg.len;
        }
        else if (voice.stage == "vowel") {
            ph = voice.parts.nucleus[0];
        }
        else if (voice.stage == "release") {
            const seg = voice.release[voice.seg];
            if (!seg) return { F: voice.F, av: 0, asp: 0, fric: 0 };
            ph = seg.ph; pos = voice.segPos; len = seg.len;
            nextVowel = voice.parts.nucleus[voice.parts.nucleus.length - 1];
        }
        else if (voice.stage == "fade") {
            // Keep the last sound going while it fades: a vowel, nasal or liquid rings on,
            // a fricative hisses out, a plosive or h is already over.
            const tail = voice.tailPh || voice.parts.nucleus[voice.parts.nucleus.length - 1];
            const def = PH[tail] || (tail && tail.startsWith("hum:") ? PH[tail.slice(4)] : null);
            if (!def) return { F: voice.F, av: 0, asp: 0, fric: 0 };
            if (def.t == "v") return { F: def.f, av: 1, asp: p.breath, fric: 0 };
            if (def.t == "n" || def.t == "l" || tail.startsWith("hum:")) return { F: def.f, av: def.amp || 0.32, asp: p.breath * 0.3, fric: 0 };
            if (def.t == "f") return { F: voice.F, av: 0, asp: 0, fric: def.noise[2] * 0.6, fricF: def.noise[0], fricBw: def.noise[1] };
            return { F: voice.F, av: 0, asp: 0, fric: 0 };
        }
        const x = pos / Math.max(1, len);
        const def = PH[ph] || (ph && ph.startsWith("hum:") ? PH[ph.slice(4)] : null) || PH.ah;
        const vowelF = vowelFormants(nextVowel);
        const breath = p.breath;
        switch (ph && ph.startsWith("hum:") ? "n" : def.t) {
            case "v": return { F: def.f, av: 1, asp: breath, fric: 0 };
            case "n": return { F: def.f, av: def.amp || 0.32, asp: breath * 0.3, fric: 0 };
            case "l":
                if (def.trill) {
                    // a trilled r: the tongue taps about 26 times a second
                    const flap = 0.5 + 0.5 * Math.cos(2 * Math.PI * 26 * pos / sr);
                    return { F: def.f, av: (def.amp || 0.55) * (0.3 + 0.7 * flap), asp: breath * 0.5, fric: 0 };
                }
                return { F: def.f, av: def.amp || 0.6, asp: breath * 0.5, fric: 0 };
            case "h": return { F: vowelF, av: 0, asp: 0.75, fric: 0 };
            case "f": return { F: vowelF, av: def.voiced ? 0.32 : 0, asp: 0, fric: def.noise[2], fricF: def.noise[0], fricBw: def.noise[1] };
            case "a": {
                const fr = PH[def.fric];
                if (x < 0.35) return { F: vowelF, av: def.voiced ? 0.12 : 0, asp: 0, fric: x > 0.3 ? 0.6 : 0, fricF: fr.noise[0], fricBw: fr.noise[1] };
                return { F: vowelF, av: def.voiced ? 0.3 : 0, asp: 0, fric: fr.noise[2] * (1 - (x - 0.35) * 0.6), fricF: fr.noise[0], fricBw: fr.noise[1] };
            }
            case "p": {
                if (x < 0.55) return { F: vowelF, av: def.voiced ? 0.12 : 0, asp: 0, fric: 0 };
                if (x < 0.68) return { F: vowelF, av: def.voiced ? 0.25 : 0, asp: 0, fric: 0.9, fricF: def.burst[0], fricBw: def.burst[1] };
                return { F: vowelF, av: def.voiced ? 0.8 : 0.1, asp: def.voiced ? breath : 0.55, fric: 0 };
            }
        }
        return { F: vowelF, av: 1, asp: breath, fric: 0 };
    }
    function advance(voice, p, info) {
        // moves through onset -> vowel -> release segments
        if (voice.stage == "onset") {
            voice.segPos++;
            if (voice.segPos >= voice.segs[voice.seg].len) {
                voice.seg++;
                voice.segPos = 0;
                if (voice.seg >= voice.segs.length) { voice.stage = "vowel"; voice.seg = 0; }
            }
        }
        else if (voice.stage == "vowel") {
            voice.vowelSamples++;
            if (!info.gate && voice.vowelSamples > voice.sr * 0.04) startRelease(voice, p);
        }
        else if (voice.stage == "release") {
            const seg = voice.release[voice.seg];
            if (!seg) { voice.stage = "fade"; return; }
            voice.segPos++;
            if (voice.segPos >= seg.len) { voice.seg++; voice.segPos = 0; if (voice.seg >= voice.release.length) voice.stage = "fade"; }
        }
    }
    function startRelease(voice, p) {
        const sr = voice.sr;
        const scale = Math.max(0.3, Math.min(2.5, p.consonant || 1));
        const segs = [];
        const nucleus = voice.parts.nucleus;
        for (let k = 1; k < nucleus.length; k++) segs.push({ ph: nucleus[k], len: Math.floor(0.09 * sr) });
        for (const ph of voice.parts.coda) segs.push({ ph, len: Math.max(1, Math.floor((PH[ph].dur || 60) * scale * sr / 1000)) });
        voice.release = segs;
        voice.tailPh = segs.length ? segs[segs.length - 1].ph : nucleus[nucleus.length - 1];
        voice.stage = segs.length ? "release" : "fade";
        voice.seg = 0;
        voice.segPos = 0;
        const fade = voice.legatoOut ? 0.035 : Math.max(0.03, p.release || 0.12);
        voice.finalFadeLen = Math.max(1, Math.floor(fade * sr));
    }
    function render(voice, out, start, len, info) {
        if (voice.done) return;
        const p = fill(info.params);
        const sr = info.sampleRate;
        let freq = info.freq;
        const freqStep = info.freqScale;
        const res = voice.res;
        const shift = Math.max(0.7, Math.min(1.5, p.formant));
        const tilt = 0.08 + 0.55 * Math.max(0, Math.min(1, p.tension)); // glottal low-pass amount
        const level = 0.42 * p.volume * (1 - p.dynamics + p.dynamics * voice.velocity);
        const smoothF = 1 - Math.exp(-1 / (0.022 * sr));
        const smoothA = 1 - Math.exp(-1 / (0.006 * sr));
        // Clearness narrows the formants (clear, ringing) or widens them (soft, airy).
        const cle = Math.max(0, Math.min(1, p.clearness == undefined ? 0.5 : p.clearness));
        const bwScale = 1.45 - cle * 0.8;
        const bws = [70 * bwScale, 95 * bwScale, 150 * bwScale, 230 * bwScale, 300 * bwScale];
        if (!voice.presence) voice.presence = bandpass(2800 * Math.min(1.25, shift), 1.1, sr);
        const presence = 2 + 7 * Math.max(0, Math.min(1, p.tension));
        for (let i = 0; i < len; i++) {
            const tgt = targets(voice, p);
            // formants glide toward the target
            for (let k = 0; k < 3; k++) voice.F[k] += (tgt.F[k] - voice.F[k]) * smoothF;
            voice.av += (tgt.av - voice.av) * smoothA;
            voice.asp += (tgt.asp - voice.asp) * smoothA;
            voice.fric += (tgt.fric - voice.fric) * (tgt.fric > voice.fric ? 0.25 : smoothA);
            if (tgt.fric > 0 && tgt.fricF) {
                const key = tgt.fricF + "/" + tgt.fricBw;
                if (key != voice.fricKey) { voice.fricBp = bandpass(tgt.fricF, Math.max(0.5, tgt.fricF / tgt.fricBw), sr); voice.fricKey = key; }
            }
            // pitch: vibrato (fading in), scoop up into the note, slow drift, fall on release
            const t = voice.t / sr;
            let semis = 0;
            if (!p.robot) {
                const vibIn = Math.min(1, Math.max(0, (t - p.vibDelay) / 0.35));
                semis += p.vibDepth * vibIn * Math.sin(voice.vibPhase);
                voice.vibPhase += 2 * Math.PI * p.vibRate * (1 + 0.04 * Math.sin(t * 1.7)) / sr;
                if (voice.glideFrom != null) {
                    // portamento: an S-curve from the previous note's pitch
                    const x = Math.min(1, t / voice.glideTime);
                    semis += voice.glideFrom * (1 - x * x * (3 - 2 * x));
                }
                else
                    semis -= p.scoop * Math.exp(-t / 0.07);
                // tiny pitch jitter keeps long notes from sounding like an oscillator
                if ((voice.t & 255) == 0) voice.jitterTarget = (Math.random() * 2 - 1) * 0.06;
                voice.jitter += (voice.jitterTarget - voice.jitter) * 0.002;
                semis += voice.jitter;
                if ((voice.t & 2047) == 0) voice.driftTarget = (Math.random() * 2 - 1) * 0.08 * p.drift;
                voice.drift += (voice.driftTarget - voice.drift) * 0.0004;
                semis += voice.drift;
                if (!voice.legatoOut && (voice.stage == "fade" || voice.stage == "release")) semis -= p.fall * Math.min(1, voice.finalFade / Math.max(1, voice.finalFadeLen));
            }
            let f0 = freq * Math.pow(2, semis / 12);
            if (p.robot) f0 = 440 * Math.pow(2, Math.round(12 * Math.log2(f0 / 440)) / 12);
            // glottal source(s)
            let src = 0;
            for (const s of voice.sources) {
                const dt = f0 * Math.pow(2, s.cents / 1200) / sr;
                s.phase += dt;
                src += blepSaw(s.phase, Math.min(0.5, dt));
            }
            src /= Math.sqrt(voice.sources.length);
            voice.lp1 += (src - voice.lp1) * (1 - tilt);
            voice.lp2 += (voice.lp1 - voice.lp2) * (1 - tilt * 0.6);
            let source = voice.lp2;
            if (p.growl > 0) {
                voice.growlPhase += 2 * Math.PI * 38 / sr;
                source *= 1 + p.growl * 0.7 * Math.sin(voice.growlPhase) * (0.6 + 0.4 * Math.random());
            }
            const noise = Math.random() * 2 - 1;
            let x = source * voice.av * 2.2 + noise * voice.asp * 0.55;
            // vocal tract: five formants in cascade (F1 rises with high notes, as singers do)
            if (voice.coefCountdown-- <= 0) {
                voice.coefCountdown = 16;
                const f1 = Math.max(voice.F[0] * shift, Math.min(1100, f0 * 1.08));
                setResonator(res[0], f1, bws[0] + f0 * 0.06, sr);
                setResonator(res[1], voice.F[1] * shift, bws[1], sr);
                setResonator(res[2], voice.F[2] * shift, bws[2], sr);
                setResonator(res[3], 3300 * shift, bws[3], sr);
                setResonator(res[4], 3850 * shift, bws[4], sr);
            }
            for (let k = 0; k < 5; k++) {
                const r = res[k];
                const y = r.a * x + r.b * r.y1 + r.c * r.y2;
                r.y2 = r.y1;
                r.y1 = y;
                x = y;
            }
            // the "singer's formant": a broad lift around 2.8 kHz that makes vowels clear and bright
            x += runBandpass(voice.presence, x) * presence;
            if (voice.fric > 0.001 && voice.fricBp) x += runBandpass(voice.fricBp, noise) * voice.fric * 2.4;
            // amplitude: quick attack (softer when gliding in from the previous note), final fade after the release consonants
            voice.amp += ((voice.stage == "fade" ? 0 : 1) - voice.amp) * (voice.stage == "fade" ? 0 : voice.connected ? 0.004 : 0.01);
            let gain = voice.amp;
            if (voice.stage == "fade") {
                voice.finalFade++;
                gain *= Math.max(0, 1 - voice.finalFade / voice.finalFadeLen);
                if (voice.finalFade >= voice.finalFadeLen) { voice.done = true; }
            }
            out[start + i] += x * gain * level;
            advance(voice, p, info);
            if (voice.stage == "onset" && !info.gate && voice.seg >= voice.segs.length) voice.stage = "vowel";
            voice.t++;
            freq *= freqStep;
            if (voice.done) break;
        }
        for (const r of res) { if (!(Math.abs(r.y1) < 1e6)) { r.y1 = 0; r.y2 = 0; } }
        if (!(Math.abs(voice.lp1) < 1e6)) { voice.lp1 = 0; voice.lp2 = 0; }
    }

    // ------------------------------------------------------------ instrument effects
    function createInstrumentState() { return { fxStates: [] }; }
    function processInstrument(state, params, L, R, start, end, ctx) {
        const p = fill(params);
        if (p.fx.length > 0) CarrotFX.processChain(state.fxStates, p.fx, L, R, start, end, ctx);
    }

    // ------------------------------------------------------------ UI
    function noteCount(song, channelIndex, bar) {
        let count = 0;
        for (let b = 0; b < bar; b++) { const pattern = song.getPattern(channelIndex, b); if (pattern) count += pattern.notes.length; }
        return count;
    }
    function buildEditor(host) {
        const getP = () => fill(host.params());
        const root = HTML.div();
        const redraws = [];
        // ---- lyrics tab
        const lyrics = HTML.textarea({ class: "cb-utawa-lyrics", spellcheck: "false", placeholder: "Type lyrics: hel-lo world, ko n ni chi wa, [l ah v]..." });
        lyrics.value = getP().lyrics;
        for (const type of ["keydown", "keyup", "keypress"]) lyrics.addEventListener(type, (e) => e.stopPropagation());
        lyrics.addEventListener("input", () => { getP().lyrics = lyrics.value; host.changed(true); updateMap(); });
        const langSelect = CarrotUI.select({ label: "Language", options: LANGUAGES, value: getP().lang, onChange: (v) => { getP().lang = v; host.changed(true); updateMap(); updateBank(); } });
        const splitToggle = CarrotUI.toggle({ label: "Split words into syllables", value: getP().autoSplit, title: "hello becomes hel-lo automatically (English)", onChange: (v) => { getP().autoSplit = v; host.changed(true); updateMap(); } });
        const wrapToggle = CarrotUI.toggle({ label: "Repeat lyrics", value: getP().wrap, title: "When the notes outlast the lyrics, start again from the first syllable (off: sing 'ah')", onChange: (v) => { getP().wrap = v; host.changed(true); updateMap(); } });
        const examples = HTML.select({ class: "cb-select", title: "Example lyrics" }, HTML.option({ value: "" }, "Examples..."), ...LYRIC_EXAMPLES.map((ex, i) => HTML.option({ value: String(i) }, ex[0])));
        examples.addEventListener("keydown", (e) => e.stopPropagation());
        examples.addEventListener("change", () => {
            const ex = LYRIC_EXAMPLES[+examples.value];
            examples.selectedIndex = 0;
            if (!ex) return;
            const p = getP();
            p.lang = ex[1];
            p.lyrics = ex[2];
            lyrics.value = ex[2];
            langSelect.setValue(ex[1]);
            host.changed(true);
            updateMap();
        });
        const phLine = HTML.div({ class: "cb-utawa-ph" });
        const mapBox = HTML.div({ class: "cb-utawa-map" });
        // ---- score view: the channel's notes on a piano roll with their lyrics, like a vocal synth editor
        const roll = HTML.canvas({ class: "cb-canvas cb-utawa-roll", style: "height: 150px;", title: "Click a note to type its lyric" });
        let rollNotes = [], rollView = null;
        const syllableOfNote = (p, list, index) => {
            const own = p.noteLyrics[index];
            if (own) return { syl: parseLyrics(String(own), p.lang | 0, false)[0] || null, own: true };
            const k = list.length ? (p.wrap !== false ? index % list.length : index) : -1;
            return { syl: k >= 0 && k < list.length ? list[k] : null, own: false };
        };
        function drawRoll() {
            const { ctx, w, h } = CarrotUI.ctx(roll);
            ctx.fillStyle = "#14131a";
            ctx.fillRect(0, 0, w, h);
            const song = host.song, t = host.target;
            if (!t || t.channel == undefined || !song.channels[t.channel]) return;
            const ch = t.channel, p = getP();
            const list = parseLyrics(p.lyrics, p.lang | 0, p.autoSplit !== false);
            const first = Math.max(0, Math.min(song.barCount - 1, host.doc.bar));
            const bars = Math.min(2, song.barCount - first);
            const barParts = song.beatsPerBar * A.Config.partsPerBeat;
            rollNotes = [];
            let index = noteCount(song, ch, first), lo = 1e9, hi = -1e9;
            for (let b = first; b < first + bars; b++) {
                const pattern = song.getPattern(ch, b);
                if (!pattern) continue;
                for (const note of pattern.notes.slice().sort((x, y) => x.start - y.start)) {
                    const { syl, own } = syllableOfNote(p, list, index);
                    rollNotes.push({ bar: b - first, start: note.start, end: note.end, pitch: note.pitches[0], index, syl, own });
                    lo = Math.min(lo, note.pitches[0]); hi = Math.max(hi, note.pitches[0]);
                    index++;
                }
            }
            if (rollNotes.length == 0) { lo = 36; hi = 48; }
            lo -= 2; hi += 2;
            if (hi - lo < 12) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 6); hi = Math.ceil(mid + 6); }
            const keyW = 26, rowH = (h - 2) / (hi - lo + 1), total = bars * barParts;
            const xOf = (bar, part) => keyW + (bar * barParts + part) / total * (w - keyW);
            const yOf = (pitch) => h - 1 - (pitch - lo + 1) * rowH;
            const basePitch = A.Config.keys[song.key].basePitch;
            // keyboard and black-key rows
            for (let m = lo; m <= hi; m++) {
                const black = [1, 3, 6, 8, 10].indexOf((m + basePitch) % 12) != -1;
                ctx.fillStyle = black ? "#1b1a22" : "#211f2a";
                ctx.fillRect(keyW, yOf(m), w - keyW, rowH);
                ctx.fillStyle = black ? "#2a2833" : "#d9d6e2";
                ctx.fillRect(0, yOf(m), keyW - 2, Math.max(1, rowH - 0.5));
                if ((m + basePitch) % 12 == 0 && rowH > 7) {
                    ctx.fillStyle = "#555";
                    ctx.font = "8px sans-serif";
                    ctx.fillText("C" + Math.floor((m + basePitch) / 12 - 1), 2, yOf(m) + rowH - 1.5);
                }
            }
            // beat and bar lines
            for (let beat = 0; beat <= bars * song.beatsPerBar; beat++) {
                const x = Math.round(xOf(0, beat * A.Config.partsPerBeat)) + 0.5;
                ctx.strokeStyle = beat % song.beatsPerBar == 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.07)";
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            }
            // notes with their lyric and phonemes
            const color = getComputedStyle(root).getPropertyValue("--cb-plugin-color").trim() || "#ff7eb6";
            for (const n of rollNotes) {
                const x = xOf(n.bar, n.start) + 1, x2 = xOf(n.bar, n.end) - 1, y = yOf(n.pitch);
                const height = Math.max(6, rowH);
                ctx.fillStyle = n.syl && n.syl.rest ? "rgba(255,255,255,0.18)" : color;
                ctx.globalAlpha = n.syl && n.syl.melisma ? 0.55 : 0.92;
                ctx.fillRect(x, y - (height - rowH) / 2, Math.max(3, x2 - x), height);
                ctx.globalAlpha = 1;
                if (n.own) { ctx.fillStyle = "#fff"; ctx.fillRect(x, y + height - 2 - (height - rowH) / 2, Math.max(3, x2 - x), 2); }
                const text = n.syl ? (n.syl.melisma ? "-" : n.syl.rest ? "." : String(n.syl.text).replace(/\(\d+\)$/, "")) : "ah";
                ctx.fillStyle = "#16131c";
                ctx.font = "bold 10px sans-serif";
                ctx.save();
                ctx.beginPath(); ctx.rect(x, 0, Math.max(3, x2 - x), h); ctx.clip();
                ctx.fillText(text, x + 3, y + Math.min(height, 11) - 1 - (height - rowH) / 2);
                ctx.restore();
                // phonemes above the note, as in a vocal editor
                if (n.syl && n.syl.ph && n.syl.ph.length && x2 - x > 18) {
                    ctx.fillStyle = "rgba(255,255,255,0.55)";
                    ctx.font = "9px monospace";
                    ctx.fillText("[" + n.syl.ph.map(q => q.replace("hum:", "")).join(" ") + "]", x + 1, y - 3 - (height - rowH) / 2);
                }
            }
            rollView = { xOf, yOf, rowH, first, bars };
        }
        roll.addEventListener("click", (event) => {
            if (!rollView) return;
            const rect = roll.getBoundingClientRect();
            const px = event.clientX - rect.left, py = event.clientY - rect.top;
            for (const n of rollNotes) {
                const x = rollView.xOf(n.bar, n.start), x2 = rollView.xOf(n.bar, n.end), y = rollView.yOf(n.pitch);
                if (px >= x && px <= x2 && py >= y - 4 && py <= y + Math.max(6, rollView.rowH) + 4) {
                    const current = n.own ? getP().noteLyrics[n.index] : n.syl && !n.syl.melisma && !n.syl.rest ? String(n.syl.text).replace(/\(\d+\)$/, "") : "";
                    editNote(n.index, current);
                    return;
                }
            }
        });
        redraws.push(drawRoll);
        const mapInfo = HTML.div({ class: "cb-hint" });
        function updateMap() {
            setTimeout(drawRoll, 0);
            const p = getP();
            const list = parseLyrics(p.lyrics, p.lang | 0, p.autoSplit !== false);
            phLine.textContent = list.slice(0, 18).map(s => s.melisma ? "-" : s.rest ? "." : s.ph.map(x => x.replace("hum:", "")).join(" ")).join("  |  ") + (list.length > 18 ? "  ..." : "");
            mapBox.innerHTML = "";
            const t = host.target;
            const song = host.song;
            if (!t || t.channel == undefined || !song.channels[t.channel]) { mapInfo.textContent = list.length + " syllables"; return; }
            const ch = t.channel;
            const currentBar = host.doc.bar;
            let total = 0;
            for (let b = 0; b < song.barCount; b++) { const pattern = song.getPattern(ch, b); if (pattern) total += pattern.notes.length; }
            mapInfo.textContent = list.length + " syllable" + (list.length == 1 ? "" : "s") + ", " + total + " note" + (total == 1 ? "" : "s") + " in this channel" + (total > list.length && list.length ? (p.wrap !== false ? " (the lyrics repeat)" : " (extra notes sing 'ah')") : "");
            let shown = 0;
            for (let b = Math.max(0, currentBar - 1); b < song.barCount && shown < 48; b++) {
                const pattern = song.getPattern(ch, b);
                if (!pattern || pattern.notes.length == 0) continue;
                mapBox.appendChild(HTML.span({ class: "cb-utawa-bar" }, "Bar " + (b + 1)));
                let index = noteCount(song, ch, b);
                const notes = pattern.notes.slice().sort((x, y) => x.start - y.start);
                const basePitch = A.Config.keys[song.key].basePitch;
                for (const note of notes) {
                    const k = list.length ? (p.wrap !== false ? index % list.length : index) : -1;
                    const own = p.noteLyrics[index];
                    const syl = own ? (parseLyrics(String(own), p.lang | 0, false)[0] || null) : (k >= 0 && k < list.length ? list[k] : null);
                    const label = syl ? (syl.melisma ? "-" : syl.rest ? "(rest)" : syl.text) : "ah";
                    const noteIndex = index;
                    const chip = HTML.span({ class: "cb-utawa-chip" + (b == currentBar ? " cb-now" : "") + (syl && syl.rest ? " cb-rest" : "") + (own ? " cb-edited" : ""), title: "Note " + (index + 1) + (syl && syl.ph.length ? ": " + syl.ph.map(x => x.replace("hum:", "")).join(" ") : "") + ". Click to type this note's lyric." }, HTML.em(A.flMidiName(basePitch + note.pitches[0])), label, HTML.small(String(index + 1)));
                    chip.addEventListener("click", () => editNote(noteIndex, own || (syl && !syl.melisma && !syl.rest ? syl.text.replace(/\(\d+\)$/, "") : syl ? syl.text : "")));
                    mapBox.appendChild(chip);
                    index++;
                    shown++;
                }
            }
            if (!mapBox.firstChild) mapBox.appendChild(HTML.span({ class: "cb-hint" }, "Add notes to this channel and each one will sing the next syllable."));
            const edits = Object.keys(p.noteLyrics).length;
            clearEdits.style.display = edits > 0 ? "" : "none";
            clearEdits.textContent = "Clear " + edits + " note lyric" + (edits == 1 ? "" : "s");
        }
        // Types the lyric for one note (like editing a note's lyric in a vocal editor).
        async function editNote(index, current) {
            const text = await CarrotUI.ask({ title: "Lyric for note " + (index + 1), value: current, hint: "One syllable or word (in the lyric language). - holds the previous vowel, . is silent, [l ah] spells phonemes. Leave empty to use the lyrics text again." });
            if (text == null) return;
            const p = getP();
            const clean = text.trim();
            if (clean) p.noteLyrics[index] = clean.slice(0, 40);
            else delete p.noteLyrics[index];
            host.changed(true);
            updateMap();
        }
        const clearEdits = CarrotUI.button("Clear note lyrics", () => { getP().noteLyrics = {}; host.changed(true); updateMap(); }, { title: "Remove the lyrics typed on single notes" });
        const testButton = CarrotUI.button("Sing a test phrase", () => {
            const pitches = [24, 26, 28, 31, 28, 26, 24];
            pitches.forEach((pitch, k) => setTimeout(() => host.previewNote(pitch, 0.32), k * 360));
        }, { title: "Sings the next few syllables on the plugin keyboard" });
        const lyricsTab = HTML.div(
            CarrotUI.section("Lyrics", lyrics, CarrotUI.row(langSelect, examples, splitToggle, wrapToggle, testButton), phLine),
            CarrotUI.section("Score (click a note to change its lyric)", roll, HTML.div({ style: "height: 6px;" }), mapBox, CarrotUI.row(mapInfo, clearEdits)),
            CarrotUI.hint("Syllables are separated by spaces or hyphens. A lone - holds the previous vowel over another note (melisma), . makes a silent note, and [l ah v] spells phonemes: a ae ah aw e er ih i uh u o ai ei oi au ou, m n ng l r w y p b t d k g f v s z sh zh th dh h ch j ts."));
        // ---- voice tab
        const voiceSelect = HTML.select({ class: "cb-select", title: "Voice preset" }, HTML.option({ value: "" }, "Choose a voice..."), ...VOICES.map((v, i) => HTML.option({ value: String(i) }, v.name)));
        voiceSelect.addEventListener("keydown", (e) => e.stopPropagation());
        voiceSelect.addEventListener("change", () => {
            const voice = VOICES[+voiceSelect.value];
            voiceSelect.selectedIndex = 0;
            if (!voice) return;
            const p = getP();
            Object.assign(p, { robot: false, release: 0.12, detune: 10, vibDelay: 0.28, fall: 0.6, drift: 0.5, clearness: 0.5, portamento: 0.45 }, voice.params, { voiceName: voice.name });
            host.replaceParams(p);
            A.flToast("Voice: " + voice.name);
        });
        // ---- voice bank header (always visible)
        const bankAvatar = HTML.div({ class: "cb-utawa-avatar" });
        const bankName = HTML.div({ class: "cb-utawa-bank-name" });
        const bankSub = HTML.div({ class: "cb-utawa-bank-sub" });
        const bankPick = HTML.select({ class: "cb-select cb-utawa-bank-pick", title: "Change voice" }, HTML.option({ value: "" }, "Change voice..."), ...VOICES.map((v, i) => HTML.option({ value: String(i) }, v.name)));
        bankPick.addEventListener("keydown", (e) => e.stopPropagation());
        bankPick.addEventListener("change", () => { voiceSelect.value = bankPick.value; bankPick.selectedIndex = 0; voiceSelect.dispatchEvent(new Event("change")); });
        function updateBank() {
            const p = getP();
            const name = p.voiceName || "Custom voice";
            bankAvatar.textContent = name.trim()[0] || "U";
            bankName.textContent = name;
            const gender = p.formant < 0.98 ? "deep" : p.formant > 1.24 ? "young" : p.formant > 1.06 ? "female" : "male";
            bankSub.textContent = LANGUAGES[p.lang | 0] + " · " + gender + " · " + (p.unison > 1 ? Math.round(p.unison) + " singers" : "solo") + (p.robot ? " · robot" : "");
        }
        const bank = HTML.div({ class: "cb-utawa-bank" }, bankAvatar, HTML.div(bankName, bankSub), bankPick);
        const pct = (v) => Math.round(v * 100) + "%";
        const voiceTab = HTML.div(
            CarrotUI.section("Voice", CarrotUI.row(voiceSelect, host.toggle("robot", { label: "Robot (snap pitch)", def: false }))),
            CarrotUI.section("Voice parameters", CarrotUI.row(
                host.knob("formant", { label: "GEN Gender", min: 0.75, max: 1.45, def: 1.16, format: v => v < 0.98 ? "Deep" : v > 1.24 ? "Young" : v > 1.06 ? "Female" : "Male", title: "Gender factor (formant shift): lower is a larger (male) voice, higher a smaller (female / young) one" }),
                host.knob("breath", { label: "BRE Breath", min: 0, max: 1, def: 0.16, format: pct, title: "Breathiness" }),
                host.knob("tension", { label: "BRI Bright", min: 0, max: 1, def: 0.55, format: pct, title: "Brightness: soft and dark to bright and pressed" }),
                host.knob("clearness", { label: "CLE Clear", min: 0, max: 1, def: 0.5, format: pct, title: "Clearness: airy and soft to clear and ringing" }),
                host.knob("growl", { label: "Growl", min: 0, max: 1, def: 0, format: pct }),
                host.knob("dynamics", { label: "DYN Velocity", min: 0, max: 1, def: 0.55, format: pct, title: "Dynamics: how much note volume changes the voice's level" }),
                host.knob("volume", { label: "Volume", min: 0, max: 1.2, def: 0.8, format: pct }))),
            CarrotUI.section("Choir", CarrotUI.row(
                host.knob("unison", { label: "Singers", min: 1, max: 8, step: 1, def: 1, format: v => String(Math.round(v)) }),
                host.knob("detune", { label: "Spread", min: 0, max: 40, def: 10, format: v => Math.round(v) + "c" }))));
        // ---- expression tab
        const expressionTab = HTML.div(
            CarrotUI.section("Vibrato", CarrotUI.row(
                host.knob("vibDepth", { label: "Depth", min: 0, max: 1.2, def: 0.32, format: v => v.toFixed(2) + " st" }),
                host.knob("vibRate", { label: "Rate", min: 3, max: 8, def: 5.6, format: v => v.toFixed(1) + " Hz" }),
                host.knob("vibDelay", { label: "Delay", min: 0, max: 1, def: 0.28, format: v => Math.round(v * 1000) + " ms" }))),
            CarrotUI.section("Note transitions", CarrotUI.row(
                host.knob("portamento", { label: "POR Glide", min: 0, max: 1, def: 0.45, format: v => Math.round(30 + v * 220) + " ms", title: "Portamento: how long the voice slides from the previous note's pitch" }),
                host.toggle("legato", { label: "Legato joins", def: true, title: "Notes that touch the next note skip the fall and fade quickly into it" }))),
            CarrotUI.section("Pitch", CarrotUI.row(
                host.knob("scoop", { label: "Scoop", min: 0, max: 4, def: 1.1, format: v => v.toFixed(1) + " st", title: "Slides up into a note that starts a phrase" }),
                host.knob("fall", { label: "Fall", min: 0, max: 3, def: 0.6, format: v => v.toFixed(1) + " st", title: "Drops at the end of each note" }),
                host.knob("drift", { label: "Drift", min: 0, max: 1, def: 0.5, format: pct, title: "Small natural pitch wander" }))),
            CarrotUI.section("Timing", CarrotUI.row(
                host.knob("consonant", { label: "Consonants", min: 0.4, max: 2, def: 1, format: v => Math.round(v * 100) + "%", title: "Length of the consonants" }),
                host.knob("release", { label: "Release", min: 0.03, max: 0.6, def: 0.12, format: v => Math.round(v * 1000) + " ms" }))));
        const fxTab = HTML.div(CarrotUI.section("Effects", carrotFxRack(host, "fx", { max: 6 })));
        const tabs = CarrotUI.tabs([["Lyrics", lyricsTab], ["Voice", voiceTab], ["Expression", expressionTab], ["Effects", fxTab]], () => setTimeout(() => redraws.forEach(f => f()), 0));
        root.appendChild(bank);
        root.appendChild(tabs);
        host.onRefresh(() => {
            const p = getP();
            if (document.activeElement != lyrics && lyrics.value != p.lyrics) lyrics.value = p.lyrics;
            langSelect.setValue(p.lang | 0);
            splitToggle.setValue(p.autoSplit !== false);
            wrapToggle.setValue(p.wrap !== false);
            updateMap();
            updateBank();
        });
        updateMap();
        updateBank();
        return root;
    }

    B.CarrotPlugins.register({
        id: "utawa",
        width: 700,
        defaultParams: defaults,
        presets: VOICES.map(v => ({ name: v.name, params: Object.assign(defaults(), v.params, { voiceName: v.name }) })),
        randomize: (p) => {
            fill(p);
            const r = () => Math.random();
            Object.assign(p, { formant: 0.85 + r() * 0.5, breath: r() * 0.5, tension: 0.3 + r() * 0.6, clearness: 0.2 + r() * 0.7, growl: r() < 0.3 ? r() * 0.4 : 0, vibDepth: r() * 0.6, vibRate: 4.5 + r() * 2.5, scoop: r() * 2, fall: r() * 1.2, portamento: r(), voiceName: "Random voice" });
            return p;
        },
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
        // exposed for tests and other tools
        parseLyrics,
        languages: LANGUAGES,
    });
})();
