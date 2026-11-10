
        const { useState, useEffect, useMemo, useRef } = React;
        console.info('Clustr build 2026-11-09.7 (natural sort + input fix)');

        // --- HELPERS (Mimo komponentu pro stabilitu) ---
        const geocodeCache = new Map();
        const SETTINGS_KEY = 'aiSorter.settings.v1';

        const loadSettings = () => {
            try {
                return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
            } catch (e) {
                return {};
            }
        };

        // Czech users get Czech by default; everyone else starts in English.
        const detectDefaultLang = () => {
            try {
                const languages = Array.isArray(navigator.languages) && navigator.languages.length
                    ? navigator.languages
                    : [navigator.language || ''];
                if (languages.some((code) => /^cs(\b|-)/i.test(String(code).toLowerCase()))) return 'cs';
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
                if (zone === 'Europe/Prague') return 'cs';
            } catch (e) {}
            return 'en';
        };

        const escapeXml = (value = '') => String(value).replace(/[<>&'"]/g, (ch) => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
        }[ch]));

        // Odstraní znaky zakázané ve Windows a ošetří prázdné názvy.
        const sanitizeSegment = (name = '') => {
            const clean = String(name)
                .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
                .replace(/[. ]+$/g, '')
                .trim();
            return clean || 'Nezařazeno';
        };

        const VISION_STOPWORDS = new Set([
            'a','an','the','and','or','of','in','on','at','with','without','this','that','these','those',
            'image','photo','picture','photograph','scene','view','shows','showing','shown','depicts','depicting',
            'features','feature','featuring','includes','including','contains','containing','displays','displaying',
            'appears','appear','seems','look','looks','there','are','is','it','its','main','prominent',
            'positioned','located','set','against','surrounded','creating','makes','making','include',
            'background','foreground','center','centre','middle','top','bottom','left','right','corner','side',
            'area','part','entire','whole','large','small','big','little','bright','vibrant','colorful','colourful',
            'beautiful','nice','amazing','warm','cold','dark','light','eye-catching','color','colors','colours',
            'presents','present','casting','cast','used','use','predominantly','harmonious','visually','appealing',
            'composition','balanced','sense','depth','perspective','relative','positions','constant','additional',
            'discernible','by','over','under','near','very','two','three','four','five','directly','above','below',
            'behind','front','next','striking','clear','slightly','mostly','mainly',
            'na','v','ve','s','se','z','ze','i','je','jsou','to','ten','tato','tento','fotografie','obrázek'
        ]);

        const VISION_COLOR_WORDS = new Set([
            'red','blue','green','yellow','black','white','orange','purple','pink','brown','gray','grey','golden','silver',
            'červený','červená','červené','modrý','modrá','modré','zelený','zelená','zelené','žlutý','žlutá','žluté',
            'černý','černá','černé','bílý','bílá','bílé','oranžový','oranžová','oranžové','fialový','fialová','fialové',
            'růžový','růžová','růžové','hnědý','hnědá','hnědé','šedý','šedá','šedé','zlatý','zlatá','zlaté'
        ]);

        const parseVisionTags = (response = '') => {
            const tags = [];

            String(response).split(/[,;.\n]+/).forEach((part) => {
                const words = part
                    .replace(/[^a-zA-Z0-9ěščřžýáíéúůťďňĚŠČŘŽÝÁÍÉÚŮŤĎŇ -]/g, ' ')
                    .toLowerCase()
                    .split(/\s+/)
                    .map((word) => word.trim())
                    .filter((word) => word && !/^\d+$/.test(word) && !VISION_STOPWORDS.has(word));

                for (let i = 0; i < words.length; i += 1) {
                    if (VISION_COLOR_WORDS.has(words[i]) && i + 1 < words.length) {
                        tags.push(`${words[i]} ${words[i + 1]}`);
                        i += 1;
                    } else {
                        tags.push(words[i]);
                    }
                }
            });

            return tags
                .filter((tag) => tag.length <= 40)
                .filter((tag, index, list) => list.indexOf(tag) === index)
                .slice(0, 8);
        };

        const splitExtension = (fileName = '') => {
            const dot = fileName.lastIndexOf('.');
            return dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
        };

        // Selecting a folder that already contains an exported copy loads the same photo
        // twice. Identical name + size + mtime is treated as the same file.
        const dedupeFilesBySignature = (files) => {
            const seen = new Set();
            const unique = [];
            let duplicates = 0;
            (files || []).forEach((file) => {
                const signature = `${String(file.name || '').toLowerCase()}|${file.size || 0}|${file.lastModified || 0}`;
                if (seen.has(signature)) {
                    duplicates += 1;
                    return;
                }
                seen.add(signature);
                unique.push(file);
            });
            return { files: unique, duplicates };
        };

        const GEMINI_PRESET_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];
        const isGeminiSelection = (value) => value === 'gemini-custom' || value === 'gemini-3.8-pro' || GEMINI_PRESET_MODELS.includes(value);

        const initialSettings = loadSettings();

        // Natural sort so "Trip 10" comes after "Trip 9" in the folder tree.
        const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

        const makeUniqueFileName = (fileName, usedNames) => {
            const key = fileName.toLowerCase();
            if (!usedNames.has(key)) {
                usedNames.add(key);
                return fileName;
            }
            const [base, ext] = splitExtension(fileName);
            let counter = 1;
            let candidate = `${base} (${counter})${ext}`;
            while (usedNames.has(candidate.toLowerCase())) {
                counter += 1;
                candidate = `${base} (${counter})${ext}`;
            }
            usedNames.add(candidate.toLowerCase());
            return candidate;
        };

        // Agresivnější záchrana poškozeného JSONu z AI
        const safeJsonParse = (str) => {
            if (!str) return null;
            try {
                return JSON.parse(str);
            } catch (e) {
                console.error("JSON Parse Error. Pokus o opravu a vyčištění řetězce...");
                try {
                    let cleaned = str.replace(/```json|```/g, '').trim();
                    if (cleaned.endsWith(',')) cleaned = cleaned.slice(0, -1);
                    if (!cleaned.endsWith(']')) {
                        const lastBrace = cleaned.lastIndexOf('}');
                        if (lastBrace !== -1) {
                            cleaned = cleaned.substring(0, lastBrace + 1) + ']';
                        } else {
                            cleaned += ']';
                        }
                    }
                    return JSON.parse(cleaned);
                } catch (e2) {
                    console.error("Kritické selhání zpracování JSON dat.");
                    return null; 
                }
            }
        };

        const cleanEventName = (value) => String(value == null ? '' : value)
            .replace(/^\s*\d+\s*[.)-]\s*/, '')
            .replace(/^[\s"'`*_]+|[\s"'`*_]+$/g, '')
            .replace(/\s+/g, ' ')
            .replace(/[.;,]+$/g, '')
            .trim()
            .slice(0, 80);

        // A manually typed folder name is a single folder, not an event path.
        const sanitizeFolderName = (value) => String(value == null ? '' : value)
            .replace(/[\\/]+/g, ' - ')
            .replace(/\s+/g, ' ')
            .trim();

        const buildEventNameForNaming = (currentName, aiName, level) => {
            const clean = cleanEventName(aiName);
            if (!clean) return currentName;
            const parts = String(currentName || '').split('/').filter(Boolean).map(cleanEventName);
            if (level === 'trips') return [clean, ...parts.slice(1)].join('/');
            return parts.length > 1 ? [...parts.slice(0, -1), clean].join('/') : clean;
        };

        // A manual event edit must never leave a photo in two events. Stop events keep
        // their trip folder; merging several clusters creates one standalone event.
        const buildManualEventAiData = (aiData, value, mergedId = null, clusterNumber = 0) => {
            const next = aiData ? { ...aiData } : {};
            const currentName = next.event_name || '';

            if (mergedId) {
                next.event_name = value;
                next.eventNameSource = 'manual';
                next.tripNameSource = 'manual';
                next.stopNameSource = 'manual';
                next.eventKind = 'misc';
                next.clusterId = mergedId;
                next.tripId = mergedId;
                next.clusterNumber = clusterNumber;
                next.tripNumber = 0;
                next.stopNumber = 0;
                next.tripStart = null;
                next.tripEnd = null;
                return next;
            }

            const kind = next.eventKind;
            const level = kind === 'trip-stop' ? 'stops' : 'trips';
            next.event_name = buildEventNameForNaming(currentName, value, level);
            next.eventNameSource = 'manual';
            if (kind === 'trip-stop') {
                next.stopNameSource = 'manual';
            } else if (kind === 'trip') {
                next.tripNameSource = 'manual';
            } else {
                next.tripNameSource = 'manual';
                next.stopNameSource = 'manual';
            }
            return next;
        };

        const placeholderEventIndex = (aiData) => {
            const explicit = Number(aiData?.clusterNumber) || 0;
            if (explicit > 0) return explicit - 1;
            const match = String(aiData?.event_name || '').match(/(?:^|\/)Event\s+(\d+)/i);
            return match ? Math.max(0, Number(match[1]) - 1) : 0;
        };

        // A flat trip keeps its manually assigned location in the placeholder name,
        // including after Phase 2 is re-run.
        const buildGroupPlaceholderName = (group, index, location) => {
            const base = group?.eventName || buildPlaceholderEventName(index, location);
            if (group?.eventKind === 'trip' && location && location !== 'Neznámé místo') {
                return `${base} - ${location}`;
            }
            return base;
        };

        // AI modely vrací různé tvary: mapu {"0": "název"}, pole stringů,
        // pole objektů [{id, name}] nebo obal {"slozky": [...]}. Sjednotíme je.
        const normalizeNameMap = (raw, expectedCount = 0, targetIndices = null) => {
            const byId = {};
            const loose = [];

            const pushNamed = (rawId, rawName) => {
                const name = cleanEventName(rawName);
                if (!name) return;
                const idText = rawId === null || rawId === undefined ? '' : String(rawId).trim();
                if (/^\d+$/.test(idText)) {
                    byId[parseInt(idText, 10)] = name;
                } else {
                    loose.push(name);
                }
            };

            const readName = (obj) => {
                const keys = ['name', 'nazev', 'název', 'title', 'event', 'event_name', 'label', 'slozka', 'složka'];
                for (const key of keys) {
                    if (typeof obj[key] === 'string' && obj[key].trim()) return obj[key];
                }
                return null;
            };

            const readId = (obj, fallback = null) => {
                const keys = ['id', 'index', 'idx', 'cluster', 'slozka', 'složka'];
                for (const key of keys) {
                    if (obj[key] !== undefined && /^\d+$/.test(String(obj[key]))) return obj[key];
                }
                return fallback;
            };

            const walk = (node) => {
                if (node == null) return;
                if (typeof node === 'string') {
                    const name = cleanEventName(node);
                    if (name) loose.push(name);
                    return;
                }
                if (Array.isArray(node)) {
                    node.forEach((item, index) => {
                        if (typeof item === 'string') {
                            const name = cleanEventName(item);
                            if (name) loose.push(name);
                            return;
                        }
                        if (item && typeof item === 'object') {
                            const name = readName(item);
                            if (name) {
                                pushNamed(readId(item, index), name);
                            } else {
                                const values = Object.values(item);
                                if (values.length === 1) walk(values[0]);
                            }
                        }
                    });
                    return;
                }
                if (typeof node === 'object') {
                    const keys = Object.keys(node);
                    const stringKeys = keys.filter((key) => typeof node[key] === 'string');
                    const numericKeys = stringKeys.filter((key) => /^\d+$/.test(key));

                    if (numericKeys.length > 0) {
                        numericKeys.forEach((key) => pushNamed(key, node[key]));
                        return;
                    }

                    const name = readName(node);
                    if (name) {
                        pushNamed(readId(node), name);
                        return;
                    }

                    const wrapperKeys = ['slozky', 'složky', 'clusters', 'events', 'names', 'nazvy', 'názvy', 'data', 'items', 'result', 'results', 'vysledek', 'výsledek'];
                    for (const key of wrapperKeys) {
                        if (node[key] !== undefined && typeof node[key] === 'object') {
                            walk(node[key]);
                            return;
                        }
                    }

                    for (const key of keys) {
                        if (node[key] && typeof node[key] === 'object') {
                            walk(node[key]);
                            return;
                        }
                    }

                    if (stringKeys.length === keys.length) {
                        stringKeys.forEach((key) => {
                            const value = cleanEventName(node[key]);
                            if (value) loose.push(value);
                        });
                    }
                }
            };

            walk(raw);

            const result = {};
            Object.keys(byId).forEach((id) => { result[String(id)] = byId[id]; });

            const targets = targetIndices && targetIndices.length > 0
                ? targetIndices
                : Array.from({ length: expectedCount }, (_, index) => index);

            let cursor = 0;
            targets.forEach((id) => {
                if (result[String(id)]) return;
                if (cursor < loose.length) {
                    result[String(id)] = loose[cursor];
                    cursor += 1;
                }
            });

            return result;
        };

        const extractJson = (text = '') => {
            const raw = String(text || '').trim();
            if (!raw) return null;

            if (/^[[{]/.test(raw)) {
                const direct = safeJsonParse(raw);
                if (direct !== null) return direct;
            }

            const firstObject = raw.indexOf('{');
            const firstArray = raw.indexOf('[');
            if (firstObject === -1 && firstArray === -1) return null;

            const useArray = firstArray !== -1 && (firstObject === -1 || firstArray < firstObject);
            const start = useArray ? firstArray : firstObject;
            const close = useArray ? ']' : '}';
            const end = raw.lastIndexOf(close);
            if (end <= start) return null;

            return safeJsonParse(raw.slice(start, end + 1));
        };

        const buildFallbackEventName = (cluster) => {
            const first = cluster[0] || {};
            const location = first.hardData?.location;
            const dateStr = first.hardData?.dateStr || '';
            if (location && location !== 'Neznámé místo') {
                return cleanEventName(dateStr ? `${location} (${dateStr})` : location);
            }
            return cleanEventName(dateStr ? `Událost ${dateStr}` : 'Nezařazená událost');
        };

        const prepareImageBase64 = async (url, maxDimension = 768) => {
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Náhled nelze načíst'));
                img.src = url;
            });

            const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
            if (!maxSide) throw new Error('Náhled má neplatné rozměry');

            const scale = Math.min(1, maxDimension / maxSide);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
        };

        const requestVisionTags = async (imageUrl, model, prompt) => {
            const base64 = await prepareImageBase64(imageUrl, 768);
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model, prompt, images: [base64], stream: false,
                    options: { temperature: 0.2, num_predict: 160 }
                })
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.error) throw new Error(result?.error || `Ollama HTTP ${res.status}`);
            const tags = parseVisionTags(result?.response);
            if (tags.length === 0) throw new Error('Model nevrátil žádné tagy.');
            return tags;
        };

        const getSeason = (date) => {
            const month = date.getMonth() + 1;
            if (month >= 3 && month <= 5) return 'Jaro';
            if (month >= 6 && month <= 8) return 'Léto';
            if (month >= 9 && month <= 11) return 'Podzim';
            return 'Zima';
        };

        const getTimeOfDay = (date) => {
            const hour = date.getHours();
            if (hour >= 5 && hour < 9) return 'Ráno';
            if (hour >= 9 && hour < 17) return 'Den';
            if (hour >= 17 && hour < 19) return 'Podvečer';
            if (hour >= 19 && hour < 22) return 'Večer';
            return 'Noc';
        };

        const reverseGeocode = async (latLon) => {
            if (!latLon) return null;
            if (geocodeCache.has(latLon)) return geocodeCache.get(latLon);
            try {
                const [lat, lon] = latLon.split(',');
                await new Promise(r => setTimeout(r, 1100));
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
                    headers: { 'User-Agent': 'AI-Photo-Sorter-Pro/6.0' }
                });
                if (!res.ok) return null;
                const data = await res.json();
                const addr = data.address;
                if (!addr) return null;
                const place = addr.city || addr.town || addr.village || addr.county || addr.state || addr.country || 'Neznámé místo';
                geocodeCache.set(latLon, place); 
                return place;
            } catch (e) { return null; }
        };

        const TIMELINE_TOLERANCE_MS = 2 * 3600000;
        const INTERPOLATION_WINDOW_MS = 12 * 3600000;
        // Density-based (DBSCAN) spatiotemporal clustering.
        const DEFAULT_CLUSTER_SETTINGS = {
            epsTimeHours: 1.5,
            epsSpaceKm: 4,
            minPoints: 3,
            randomMinPhotos: 3,
            splitGapHours: 6,
            splitJumpKm: 10,
            maxSpanHours: 24,
            mergeGapMs: 4 * 3600000,
            mergeDistanceKm: 2,
            noiseAttachWindowMs: 6 * 3600000,
            noiseGroupGapMs: 4 * 3600000
        };

        const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

        const percentileValue = (values, ratio) => {
            if (!values || values.length === 0) return null;
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
        };

        const buildClusterSettings = (overrides = {}) => {
            const epsTimeHours = clampNumber(Number(overrides.epsTimeHours) || DEFAULT_CLUSTER_SETTINGS.epsTimeHours, 0.5, 12);
            const epsSpaceKm = clampNumber(Number(overrides.epsSpaceKm) || DEFAULT_CLUSTER_SETTINGS.epsSpaceKm, 0.5, 50);
            const minPoints = Math.round(clampNumber(Number(overrides.minPoints) || DEFAULT_CLUSTER_SETTINGS.minPoints, 2, 20));

            return {
                epsTimeHours,
                epsSpaceKm,
                minPoints,
                randomMinPhotos: Math.round(clampNumber(Number(overrides.randomMinPhotos) || DEFAULT_CLUSTER_SETTINGS.randomMinPhotos, 1, 100)),
                splitGapHours: clampNumber(Number(overrides.splitGapHours) || Math.max(4, epsTimeHours * 4), 2, 48),
                splitJumpKm: clampNumber(Number(overrides.splitJumpKm) || Math.max(8, epsSpaceKm * 2.5), 2, 100),
                maxSpanHours: clampNumber(Number(overrides.maxSpanHours) || 24, 4, 72),
                mergeGapMs: Number(overrides.mergeGapMs) || clampNumber(epsTimeHours * 2.5, 2, 6) * 3600000,
                mergeDistanceKm: Number(overrides.mergeDistanceKm) || clampNumber(epsSpaceKm * 0.5, 1, 3),
                noiseAttachWindowMs: Number(overrides.noiseAttachWindowMs) || 6 * 3600000,
                noiseGroupGapMs: Number(overrides.noiseGroupGapMs) || 4 * 3600000
            };
        };

        // Auto mode derives sensitivity from the dataset: dense bursts tighten it,
        // sparse road-trip photos loosen it.
        const computeAutoClusterSettings = (photos) => {
            const withCoords = (photos || [])
                .filter((photo) => photo.hardData?.coords && Number.isFinite(photo.hardData.coords.lat) && Number.isFinite(photo.hardData.coords.lon))
                .sort((a, b) => a.date - b.date);

            if (withCoords.length < 4) return buildClusterSettings();

            const timeGaps = [];
            const spaceGaps = [];
            for (let i = 1; i < withCoords.length; i += 1) {
                const gap = withCoords[i].date.getTime() - withCoords[i - 1].date.getTime();
                if (gap > 0 && gap <= 12 * 3600000) timeGaps.push(gap);
                const distance = distanceKm(withCoords[i - 1].hardData.coords, withCoords[i].hardData.coords);
                if (distance !== null && distance > 0 && distance <= 100) spaceGaps.push(distance);
            }

            const percentile = (values, ratio) => {
                if (values.length === 0) return null;
                const sorted = [...values].sort((a, b) => a - b);
                return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
            };

            const timeGap = percentile(timeGaps, 0.6);
            const spaceGap = percentile(spaceGaps, 0.6);

            return buildClusterSettings({
                epsTimeHours: timeGap ? clampNumber((timeGap * 3) / 3600000, 0.75, 3) : 1.5,
                epsSpaceKm: spaceGap ? clampNumber(spaceGap * 2.5, 2, 10) : 4,
                minPoints: 3
            });
        };
        const AUTO_TAG_VALUES = new Set([
            'Jaro', 'Léto', 'Podzim', 'Zima', 'Ráno', 'Den', 'Podvečer', 'Večer', 'Noc',
            'Neznámé místo', '#Neznámé místo', 'Bez EXIFu', 'Screenshot', 'Snímky obrazovky'
        ]);

        const SCREENSHOT_CATEGORY = 'Screenshot / Clutter';
        const SCREENSHOT_FOLDER = 'Screenshot-Clutter';
        const RANDOM_CATEGORY = 'Random';
        const RANDOM_FOLDER = 'Random';
        const isScreenshotCategory = (value) => value === SCREENSHOT_CATEGORY || value === 'Snímky obrazovky / Různé';
        const isRandomCategory = (value) => value === RANDOM_CATEGORY;

        const dateKey = (value) => {
            const date = value instanceof Date ? value : new Date(value);
            if (!Number.isFinite(date.getTime())) return '';
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        };

        const isPlaceholderEventName = (name) => /^(Event|Trip|Stop|Home)\s+\d+\b/i.test(String(name || '').trim());

        const photoNeedsLocation = (photo) => {
            if (!photo) return false;
            if (isScreenshotCategory(photo.aiData?.category)) return false;
            if (photo.aiData?.category === '🗑️ K vymazání') return false;
            const location = String(photo.hardData?.location || '').trim();
            if (!location || location === 'Neznámé místo' || location === '#Neznámé místo') return true;
            return photo.hardData?.locationSource === 'unknown';
        };

        const normalizeLocationName = (name) => String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const parseCoords = (value) => {
            if (!value) return null;
            const parts = String(value).split(',').map((part) => Number(String(part).trim()));
            if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
            return { lat: parts[0], lon: parts[1] };
        };

        const roundedCoordKey = ({ lat, lon }, decimals = 1) => {
            const factor = 10 ** decimals;
            return `geo:${(Math.round(lat * factor) / factor).toFixed(decimals)},${(Math.round(lon * factor) / factor).toFixed(decimals)}`;
        };

        const distanceKm = (a, b) => {
            if (!a || !b) return null;
            const toRad = (degrees) => (degrees * Math.PI) / 180;
            const radius = 6371;
            const dLat = toRad(b.lat - a.lat);
            const dLon = toRad(b.lon - a.lon);
            const lat1 = toRad(a.lat);
            const lat2 = toRad(b.lat);
            const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
            return 2 * radius * Math.asin(Math.sqrt(h));
        };

        // Nominatim is called at city level (zoom=10); one decimal (~11 km) keeps the cache small.
        const coordsForGeocode = ({ lat, lon }) => `${(Math.round(lat * 10) / 10).toFixed(1)},${(Math.round(lon * 10) / 10).toFixed(1)}`;

        const prepareTimeline = (items) => (Array.isArray(items) ? items : [])
            .filter((item) => item && Number.isFinite(item.start) && item.start > 0)
            .sort((a, b) => a.start - b.start);

        const findTimelineMatch = (timeline, timestamp) => {
            if (!timeline || timeline.length === 0) return null;

            const limit = timestamp + TIMELINE_TOLERANCE_MS;
            let low = 0;
            let high = timeline.length - 1;
            let index = -1;
            while (low <= high) {
                const middle = (low + high) >> 1;
                if (timeline[middle].start <= limit) {
                    index = middle;
                    low = middle + 1;
                } else {
                    high = middle - 1;
                }
            }
            if (index === -1) return null;

            let best = null;
            const lookbackLimit = timestamp - 31 * 24 * 3600000;
            for (let i = index; i >= 0; i -= 1) {
                const item = timeline[i];
                if (item.start < lookbackLimit) break;
                const end = Number.isFinite(item.end) && item.end > 0 ? item.end : item.start;
                if (timestamp < item.start - TIMELINE_TOLERANCE_MS) continue;
                if (timestamp > end + TIMELINE_TOLERANCE_MS) continue;
                const distance = timestamp < item.start ? item.start - timestamp : timestamp > end ? timestamp - end : 0;
                const duration = Math.max(0, end - item.start);
                if (!best || distance < best.distance || (distance === best.distance && duration < best.duration)) {
                    best = { item, distance, duration };
                }
            }
            return best ? best.item : null;
        };

        const parseTimelineTime = (value) => {
            if (!value) return 0;
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? time : 0;
        };

        const parseTimelinePoint = (value) => {
            if (!value) return null;
            if (typeof value === 'object') {
                const lat = Number(value.lat ?? value.latitude);
                const lon = Number(value.lon ?? value.lng ?? value.longitude);
                return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
            }
            const cleaned = String(value).replace(/^geo:/i, '').replace(/[^\d,.\-]/g, '');
            return parseCoords(cleaned);
        };

        // Normalizuje visit / activity / timelinePath do jednoho pole segmentů.
        const normalizeTimelineData = (rawItems) => {
            const entries = [];

            (Array.isArray(rawItems) ? rawItems : []).forEach((item) => {
                if (!item) return;

                const visit = item.visit || item.placeVisit;
                const start = parseTimelineTime(item.startTime || visit?.duration?.startTimestamp);
                const end = parseTimelineTime(item.endTime || visit?.duration?.endTimestamp) || start;
                if (!start) return;

                if (visit) {
                    const candidate = visit.topCandidate || {};
                    const semanticType = String(candidate.semanticType || visit.location?.semanticType || '').toUpperCase();
                    const coordinates = Array.isArray(visit.location?.coordinates) ? visit.location.coordinates : null;
                    const coords = parseTimelinePoint(candidate.placeLocation)
                        || (coordinates ? parseTimelinePoint({ lat: coordinates[0], lon: coordinates[1] }) : null)
                        || (Number.isFinite(visit.location?.latitudeE7) && Number.isFinite(visit.location?.longitudeE7)
                            ? { lat: visit.location.latitudeE7 / 1e7, lon: visit.location.longitudeE7 / 1e7 }
                            : null);

                    entries.push({
                        kind: 'visit',
                        name: candidate.name || visit.location?.name || '',
                        coords,
                        start,
                        end,
                        semanticType
                    });
                    return;
                }

                if (item.activity) {
                    const activity = item.activity;
                    entries.push({
                        kind: 'activity',
                        name: '',
                        start,
                        end,
                        startCoords: parseTimelinePoint(activity.start),
                        endCoords: parseTimelinePoint(activity.end),
                        activityType: activity.topCandidate?.type || ''
                    });
                    return;
                }

                if (Array.isArray(item.timelinePath)) {
                    const points = item.timelinePath.map((point) => {
                        const offset = Number(point.durationMinutesOffsetFromStartTime);
                        return {
                            time: start + (Number.isFinite(offset) ? offset * 60000 : 0),
                            coords: parseTimelinePoint(point.point)
                        };
                    }).filter((point) => point.coords);

                    if (points.length > 0) {
                        entries.push({ kind: 'path', name: '', start, end, points });
                    }
                }
            });

            entries.sort((a, b) => a.start - b.start);
            return entries;
        };

        const resolveTimelineEntry = (entry, timestamp, homeLocation) => {
            if (!entry) return null;

            if (entry.kind === 'visit') {
                let name = entry.name || '';
                if (entry.semanticType === 'HOME') name = homeLocation || 'Doma';
                else if (entry.semanticType === 'WORK') name = 'Práce';
                return { name, coords: entry.coords || null, semanticType: entry.semanticType || '' };
            }

            if (entry.kind === 'activity') {
                const midpoint = (entry.start + entry.end) / 2;
                const coords = timestamp <= midpoint
                    ? (entry.startCoords || entry.endCoords)
                    : (entry.endCoords || entry.startCoords);
                return { name: '', coords: coords || null, activityType: entry.activityType || '' };
            }

            if (entry.kind === 'path') {
                let best = null;
                entry.points.forEach((point) => {
                    const gap = Math.abs(point.time - timestamp);
                    if (!best || gap < best.gap) best = { gap, coords: point.coords };
                });
                return { name: '', coords: best?.coords || null };
            }

            return null;
        };

        const NEAREST_NAMED_TIMELINE_KM = 8;
        const namedTimelineCache = new WeakMap();

        const getNamedTimelineLocations = (timeline) => {
            if (!Array.isArray(timeline) || timeline.length === 0) return [];
            if (namedTimelineCache.has(timeline)) return namedTimelineCache.get(timeline);

            const named = [];
            timeline.forEach((entry) => {
                if (!entry?.coords) return;
                let name = entry.name || '';
                if (!name && entry.semanticType === 'HOME') name = 'HOME';
                else if (!name && entry.semanticType === 'WORK') name = 'WORK';
                if (name) named.push({ name, coords: entry.coords, semanticType: entry.semanticType || '' });
            });

            namedTimelineCache.set(timeline, named);
            return named;
        };

        // When a Timeline segment has coordinates but no name, use the nearest named
        // Timeline location (HOME/WORK or an explicitly named visit) before calling Nominatim.
        const findNearestNamedTimelineLocation = (timeline, coords, homeLocation, maxKm = NEAREST_NAMED_TIMELINE_KM) => {
            if (!coords) return null;
            const named = getNamedTimelineLocations(timeline);
            let best = null;

            named.forEach((item) => {
                const distance = distanceKm(coords, item.coords);
                if (distance === null || distance > maxKm) return;
                if (!best || distance < best.distance) {
                    best = { name: item.name, semanticType: item.semanticType, distance };
                }
            });

            if (!best) return null;

            let name = best.name;
            if (name === 'HOME') name = homeLocation || 'Doma';
            else if (name === 'WORK') name = 'Práce';

            return { name, distance: best.distance, semanticType: best.semanticType };
        };

        const resolvePhotoMetadata = (photo, exif, timeline, homeLocation) => {
            let date = photo.date instanceof Date ? photo.date : new Date(photo.date || Date.now());
            if (!Number.isFinite(date.getTime())) {
                date = new Date(photo.file?.lastModified || Date.now());
            }
            let camera = photo.hardData?.camera || 'Neznámý fotoaparát';
            let coords = null;

            const exifDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate;
            if (exifDate) {
                const parsedDate = new Date(exifDate);
                const year = parsedDate.getFullYear();
                // Some cameras/exports contain 1899 or 0000 dates; keep the file date instead.
                if (Number.isFinite(parsedDate.getTime()) && year >= 1900 && year <= new Date().getFullYear() + 1) {
                    date = parsedDate;
                }
            }
            if (exif?.Make || exif?.Model) camera = `${exif.Make || ''} ${exif.Model || ''}`.trim();
            if (Number.isFinite(exif?.latitude) && Number.isFinite(exif?.longitude)) {
                coords = { lat: exif.latitude, lon: exif.longitude };
            }

            // Manual locations live on hardData (bulk editor, review modal, manual trip).
            const manualLocation = photo.hardData?.locationSource === 'manual'
                && photo.hardData?.location
                && photo.hardData.location !== 'Neznámé místo';
            let location = manualLocation ? photo.hardData.location : null;
            let locationSource = manualLocation ? 'manual' : null;
            let needsGeocode = false;
            // A manual place overrides EXIF/Timeline coordinates for grouping.
            if (manualLocation) coords = null;

            if (!manualLocation) {
                const match = timeline ? findTimelineMatch(timeline, date.getTime()) : null;
                const resolved = match ? resolveTimelineEntry(match, date.getTime(), homeLocation) : null;
                const matchCoords = resolved?.coords || null;
                if (matchCoords) coords = coords || matchCoords;

                if (resolved?.name && resolved.name !== 'Timeline Lokace' && resolved.name !== 'Neznámé místo') {
                    location = resolved.name;
                    locationSource = resolved.semanticType === 'HOME' ? 'home' : 'timeline';
                } else if (coords) {
                    const nearest = findNearestNamedTimelineLocation(timeline, coords, homeLocation);
                    if (nearest?.name) {
                        location = nearest.name;
                        locationSource = nearest.semanticType === 'HOME' ? 'home' : 'timeline-near';
                    } else {
                        needsGeocode = true;
                    }
                }
            }

            if (!location) {
                location = 'Neznámé místo';
                locationSource = locationSource || 'unknown';
            }

            let locationKey = '';
            if (manualLocation && photo.hardData?.locationKey) locationKey = photo.hardData.locationKey;
            else if (coords) locationKey = roundedCoordKey(coords, 1);
            else if (location !== 'Neznámé místo') locationKey = normalizeLocationName(location);

            return {
                date,
                camera,
                coords,
                location,
                locationKey,
                locationSource,
                needsGeocode,
                timeStr: date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
            };
        };

        const extractPhotoMetadata = async (photo, timeline, homeLocation, exifOverride) => {
            let exif = exifOverride;
            if (exif === undefined) {
                try {
                    exif = await exifr.parse(photo.file, true);
                } catch (e) {
                    console.warn(`EXIF se nepodařilo načíst pro ${photo.name}`, e);
                }
            }

            const meta = resolvePhotoMetadata(photo, exif, timeline, homeLocation);
            if (meta.needsGeocode) {
                const geocoded = await reverseGeocode(coordsForGeocode(meta.coords));
                if (geocoded && geocoded !== 'Neznámé místo') {
                    meta.location = geocoded;
                    meta.locationSource = 'gps';
                }
                meta.needsGeocode = false;
            }
            return meta;
        };

        const parseExifInWorkerPool = (items, onProgress) => new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined' || items.length === 0) {
                reject(new Error('Worker pool unavailable'));
                return;
            }

            const workerCount = Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1), items.length);
            const workers = [];

            try {
                for (let i = 0; i < workerCount; i += 1) workers.push(new Worker('exif-worker.js'));
            } catch (error) {
                workers.forEach((worker) => { try { worker.terminate(); } catch (e) {} });
                reject(error);
                return;
            }

            const results = new Map();
            let nextIndex = 0;
            let completed = 0;
            let settled = false;

            const cleanup = () => workers.forEach((worker) => { try { worker.terminate(); } catch (e) {} });
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(results);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };
            const assign = (worker) => {
                if (nextIndex >= items.length) return;
                const item = items[nextIndex];
                nextIndex += 1;
                worker.postMessage({ type: 'parse', id: item.id, file: item.file });
            };

            workers.forEach((worker) => {
                worker.onmessage = (event) => {
                    const data = event.data || {};
                    if (data.type === 'init-error') {
                        fail(new Error(data.message || 'EXIF worker init failed'));
                        return;
                    }
                    if (data.type !== 'result') return;

                    results.set(data.id, data.exif || null);
                    completed += 1;
                    if (onProgress) onProgress(completed, items.length);

                    if (completed >= items.length) {
                        finish();
                        return;
                    }
                    if (nextIndex < items.length) assign(worker);
                };
                worker.onerror = (event) => fail(new Error(event.message || 'EXIF worker error'));
                assign(worker);
            });
        });

        const geocodeCoordsInWorker = (requests, onProgress) => new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined' || requests.length === 0) {
                reject(new Error('Geocode worker unavailable'));
                return;
            }

            let worker;
            try {
                worker = new Worker('geo-worker.js');
            } catch (error) {
                reject(error);
                return;
            }

            const results = new Map();
            let completed = 0;
            let settled = false;

            const cleanup = () => { try { worker.terminate(); } catch (e) {} };
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(results);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };

            worker.onmessage = (event) => {
                const data = event.data || {};
                if (data.type !== 'geocode-result') return;
                results.set(data.key, data.name || null);
                completed += 1;
                if (onProgress) onProgress(completed, requests.length);
                if (completed >= requests.length) finish();
            };
            worker.onerror = (event) => fail(new Error(event.message || 'Geocode worker error'));

            requests.forEach((request) => {
                worker.postMessage({ type: 'geocode', key: request.key, coords: request.coords });
            });
        });

        const buildAutoTags = (date, hardData) => {
            const tags = [getSeason(date), getTimeOfDay(date)];
            if (hardData?.location && hardData.location !== 'Neznámé místo') tags.push(hardData.location);
            else tags.push('Neznámé místo');
            if (!hardData?.camera || hardData.camera === 'Neznámý fotoaparát') tags.push('Bez EXIFu');
            return tags;
        };

        const mergePhotoTags = (existingTags, autoTags, previousLocation) => {
            const cleaned = (existingTags || []).filter((tag) => {
                if (!tag) return false;
                if (AUTO_TAG_VALUES.has(tag)) return false;
                if (previousLocation && tag === previousLocation) return false;
                return true;
            });
            return [...new Set([...cleaned, ...autoTags])];
        };

        const isLikelyScreenshot = (photo) => {
            const name = String(photo.name || '').toLowerCase();
            const path = String(photo.path || photo.name || '').toLowerCase();

            if (isScreenshotCategory(photo.aiData?.category)) return true;
            if ((photo.aiData?.tags || []).some((tag) => /^screenshot$/i.test(tag))) return true;
            if (/(screenshot|screen[\s_-]?shot|snipaste|sn[íi]mek obrazovky|sn[íi]mky obrazovky|obrazovky|clutter|meme|downloads?|st[áa]žen)/i.test(path)) return true;

            // Screenshots/clutter exported as lossless images usually have no camera and no location.
            const extension = name.split('.').pop();
            const lossless = ['png', 'webp', 'gif', 'bmp', 'svg'].includes(extension);
            const size = Number(photo.file?.size) || 0;
            const tiny = size > 0 && size < 120 * 1024;
            const noCamera = !photo.hardData?.camera || photo.hardData.camera === 'Neznámý fotoaparát';
            const noLocation = !photo.hardData?.coords
                && (!photo.hardData?.location || photo.hardData.location === 'Neznámé místo');
            return noCamera && noLocation && (lossless || tiny);
        };

        const groupPhotosByTimeGaps = (items, gapMs = DEFAULT_CLUSTER_SETTINGS.noiseGroupGapMs) => {
            const sorted = [...items].sort((a, b) => a.date - b.date);
            if (sorted.length === 0) return [];

            const groups = [];
            let current = [sorted[0]];

            for (let i = 1; i < sorted.length; i += 1) {
                const gap = sorted[i].date.getTime() - sorted[i - 1].date.getTime();
                if (gap > gapMs) {
                    groups.push(current);
                    current = [sorted[i]];
                } else {
                    current.push(sorted[i]);
                }
            }

            groups.push(current);
            return groups;
        };

        const splitDenseCluster = (cluster, settings = DEFAULT_CLUSTER_SETTINGS) => {
            const sorted = [...cluster].sort((a, b) => a.date - b.date);
            if (sorted.length === 0) return [];

            const parts = [];
            let current = [sorted[0]];

            for (let i = 1; i < sorted.length; i += 1) {
                const previous = sorted[i - 1];
                const photo = sorted[i];
                const gapHours = (photo.date.getTime() - previous.date.getTime()) / 3600000;
                const jumpKm = previous.hardData?.coords && photo.hardData?.coords
                    ? distanceKm(previous.hardData.coords, photo.hardData.coords)
                    : 0;
                const spanHours = (photo.date.getTime() - current[0].date.getTime()) / 3600000;
                const shouldSplit = gapHours > settings.splitGapHours
                    || (jumpKm !== null && jumpKm > settings.splitJumpKm)
                    || (jumpKm !== null && jumpKm > 2 && gapHours > 2)
                    || spanHours > settings.maxSpanHours;

                if (shouldSplit) {
                    parts.push(current);
                    current = [photo];
                } else {
                    current.push(photo);
                }
            }

            parts.push(current);
            return parts;
        };

        const attachNoisePhotos = (clusters, noisePhotos, settings = DEFAULT_CLUSTER_SETTINGS) => {
            if (noisePhotos.length === 0) return clusters;
            if (clusters.length === 0) return groupPhotosByTimeGaps(noisePhotos, settings.noiseGroupGapMs);

            const ranges = clusters.map((cluster) => {
                const times = cluster.map((photo) => photo.date.getTime());
                return { cluster, start: Math.min(...times), end: Math.max(...times) };
            });
            const remaining = [];

            noisePhotos.forEach((photo) => {
                const time = photo.date.getTime();
                let best = null;

                ranges.forEach((range) => {
                    const distance = time < range.start ? range.start - time : time > range.end ? time - range.end : 0;
                    if (distance <= settings.noiseAttachWindowMs && (!best || distance < best.distance)) {
                        best = { range, distance };
                    }
                });

                if (best) {
                    best.range.cluster.push(photo);
                } else {
                    remaining.push(photo);
                }
            });

            return [...clusters, ...groupPhotosByTimeGaps(remaining, settings.noiseGroupGapMs)];
        };

        const clusterFocus = (cluster) => {
            const counts = new Map();
            cluster.forEach((photo) => {
                const location = photo.hardData?.location;
                if (!location || location === 'Neznámé místo') return;
                const key = photo.hardData?.locationKey || normalizeLocationName(location);
                const entry = counts.get(key) || { count: 0, name: normalizeLocationName(location), coords: photo.hardData?.coords || null };
                entry.count += 1;
                entry.coords = entry.coords || photo.hardData?.coords || null;
                counts.set(key, entry);
            });
            return [...counts.values()].sort((a, b) => b.count - a.count)[0] || { name: '', coords: null };
        };

        // Merge same-place bursts separated by a short break (e.g. lunch, ceremony + reception).
        const mergeNearbyClusters = (clusters, settings = DEFAULT_CLUSTER_SETTINGS) => {
            if (clusters.length <= 1) return clusters;

            const sorted = [...clusters].sort((a, b) => a[0].date - b[0].date);
            const merged = [];

            sorted.forEach((cluster) => {
                const current = [...cluster].sort((a, b) => a.date - b.date);
                const previous = merged[merged.length - 1];

                if (!previous) {
                    merged.push(current);
                    return;
                }

                const previousEnd = previous[previous.length - 1].date.getTime();
                const currentStart = current[0].date.getTime();
                const gap = currentStart - previousEnd;
                const previousFocus = clusterFocus(previous);
                const currentFocus = clusterFocus(current);
                const distance = previousFocus.coords && currentFocus.coords
                    ? distanceKm(previousFocus.coords, currentFocus.coords)
                    : null;
                const samePlace = distance !== null
                    ? distance <= settings.mergeDistanceKm
                    : (previousFocus.name && previousFocus.name === currentFocus.name);

                if (gap <= settings.mergeGapMs && samePlace) {
                    previous.push(...current);
                    previous.sort((a, b) => a.date - b.date);
                } else {
                    merged.push(current);
                }
            });

            return merged;
        };

        // DBSCAN in time + projected space. Dense photo bursts become events;
        // sparse driving photos are attached to the nearest event or grouped by time gaps.
        // Spatiotemporal density heatmap: bin time + projected coordinates, smooth the grid,
        // then treat connected hot cells as stop clusters.
        const clusterPhotosByDensity = (photos, settings = DEFAULT_CLUSTER_SETTINGS) => {
            const withCoords = [];
            const withoutCoords = [];

            photos.forEach((photo) => {
                const coords = photo.hardData?.coords;
                if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)) withCoords.push(photo);
                else withoutCoords.push(photo);
            });

            if (withCoords.length === 0) {
                return segmentDenseEpisodes(photos, {
                    ...DEFAULT_TRIP_SETTINGS,
                    maxInactiveDays: settings.maxInactiveDays ?? 1
                });
            }

            const sorted = [...withCoords].sort((a, b) => a.date - b.date);
            const count = sorted.length;
            const times = sorted.map((photo) => photo.date.getTime());
            const meanLat = sorted.reduce((sum, photo) => sum + photo.hardData.coords.lat, 0) / count;
            const cosLat = Math.cos((meanLat * Math.PI) / 180);
            const xs = new Float64Array(count);
            const ys = new Float64Array(count);

            sorted.forEach((photo, index) => {
                xs[index] = photo.hardData.coords.lon * 111.32 * cosLat;
                ys[index] = photo.hardData.coords.lat * 110.57;
            });

            const minTime = times[0];
            let minX = Infinity;
            let minY = Infinity;
            for (let i = 0; i < count; i += 1) {
                minX = Math.min(minX, xs[i]);
                minY = Math.min(minY, ys[i]);
            }

            const timeBinMs = Math.max(0.5, (settings.epsTimeHours || 1.5) / 2) * 3600000;
            const spaceCellKm = Math.max(1, (settings.epsSpaceKm || 4) / 2);
            const minDensity = Math.max(2, settings.minPoints || 3);

            const cells = new Map();
            sorted.forEach((photo, index) => {
                const t = Math.floor((times[index] - minTime) / timeBinMs);
                const x = Math.floor((xs[index] - minX) / spaceCellKm);
                const y = Math.floor((ys[index] - minY) / spaceCellKm);
                const key = `${t}|${x}|${y}`;
                let cell = cells.get(key);
                if (!cell) {
                    cell = { t, x, y, photos: [] };
                    cells.set(key, cell);
                }
                cell.photos.push(photo);
            });

            const density = new Map();
            cells.forEach((cell, key) => {
                let value = 0;
                for (let dt = -1; dt <= 1; dt += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        for (let dy = -1; dy <= 1; dy += 1) {
                            const neighbor = cells.get(`${cell.t + dt}|${cell.x + dx}|${cell.y + dy}`);
                            if (neighbor) value += neighbor.photos.length;
                        }
                    }
                }
                density.set(key, value);
            });

            const hotCells = new Set();
            density.forEach((value, key) => {
                if (value >= minDensity) hotCells.add(key);
            });

            const visited = new Set();
            const components = [];
            const collectNeighbors = (key) => {
                const [t, x, y] = key.split('|').map(Number);
                const neighbors = [];
                for (let dt = -1; dt <= 1; dt += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        for (let dy = -1; dy <= 1; dy += 1) {
                            if (dt === 0 && dx === 0 && dy === 0) continue;
                            const neighborKey = `${t + dt}|${x + dx}|${y + dy}`;
                            if (hotCells.has(neighborKey) && !visited.has(neighborKey)) neighbors.push(neighborKey);
                        }
                    }
                }
                return neighbors;
            };

            hotCells.forEach((key) => {
                if (visited.has(key)) return;
                const keys = [];
                const stack = [key];
                visited.add(key);

                while (stack.length > 0) {
                    const current = stack.pop();
                    keys.push(current);
                    collectNeighbors(current).forEach((neighborKey) => {
                        if (!visited.has(neighborKey)) {
                            visited.add(neighborKey);
                            stack.push(neighborKey);
                        }
                    });
                }
                components.push(keys);
            });

            const hotPhotoIds = new Set();
            const clusters = components.map((keys) => {
                const clusterPhotos = [];
                keys.forEach((key) => {
                    cells.get(key).photos.forEach((photo) => {
                        hotPhotoIds.add(photo.id);
                        clusterPhotos.push(photo);
                    });
                });
                return clusterPhotos.sort((a, b) => a.date - b.date);
            });

            const noise = sorted.filter((photo) => !hotPhotoIds.has(photo.id));
            const attached = attachNoisePhotos(clusters, [...noise, ...withoutCoords], settings);

            return mergeNearbyClusters(attached, settings)
                .filter((cluster) => cluster.length > 0)
                .map((cluster) => [...cluster].sort((a, b) => a.date - b.date))
                .sort((a, b) => a[0].date - b[0].date);
        };

        // --- TRIPS + HOME (hierarchical grouping) ---
        const applyDominantClusterLocation = (cluster) => {
            const counts = new Map();
            cluster.forEach((photo) => {
                const location = photo.hardData?.location;
                if (!location || location === 'Neznámé místo') return;
                const key = photo.hardData?.locationKey || normalizeLocationName(location);
                const entry = counts.get(key) || { count: 0, location, key, coords: photo.hardData?.coords || null };
                entry.count += 1;
                entry.coords = entry.coords || photo.hardData?.coords || null;
                counts.set(key, entry);
            });

            const dominant = [...counts.values()].sort((a, b) => b.count - a.count)[0];
            if (!dominant) return null;

            cluster.forEach((photo) => {
                if (!photo.hardData) photo.hardData = {};
                if (!photo.hardData.location || photo.hardData.location === 'Neznámé místo') {
                    photo.hardData.location = dominant.location;
                    photo.hardData.locationKey = dominant.key;
                    photo.hardData.coords = photo.hardData.coords || dominant.coords || null;
                    photo.hardData.locationSource = 'cluster';
                }
            });
            return dominant;
        };

        const interpolateMissingLocations = (photos, windowMs) => {
            const maxGap = Number.isFinite(windowMs) ? windowMs : INTERPOLATION_WINDOW_MS;
            const known = photos
                .filter((photo) => photo.hardData?.locationKey && photo.hardData.location !== 'Neznámé místo')
                .map((photo) => ({
                    time: photo.date.getTime(),
                    location: photo.hardData.location,
                    locationKey: photo.hardData.locationKey,
                    coords: photo.hardData.coords || null
                }));

            photos.forEach((photo) => {
                if (photo.hardData?.locationKey && photo.hardData.location !== 'Neznámé místo') return;

                const photoTime = photo.date.getTime();
                let best = null;
                known.forEach((point) => {
                    const gap = Math.abs(photoTime - point.time);
                    if (gap <= maxGap && (!best || gap < best.gap)) {
                        best = { gap, point };
                    }
                });

                if (best) {
                    photo.hardData.location = best.point.location;
                    photo.hardData.locationKey = best.point.locationKey;
                    photo.hardData.coords = photo.hardData.coords || best.point.coords || null;
                    photo.hardData.locationSource = 'interpolated';
                    const autoTags = buildAutoTags(photo.date, photo.hardData);
                    photo.aiData.tags = mergePhotoTags(photo.aiData.tags, autoTags, 'Neznámé místo');
                }
            });

            return photos;
        };

        const findLocationInheritanceTargets = (photos, anchorIds, windowMs) => {
            const maxGap = Number.isFinite(windowMs) ? windowMs : INTERPOLATION_WINDOW_MS;
            const anchors = photos.filter((photo) => anchorIds.has(photo.id));
            const targets = new Set();

            if (anchors.length === 0) return targets;

            photos.forEach((photo) => {
                if (anchorIds.has(photo.id)) return;

                const hasOwnLocation = photo.hardData?.locationKey
                    && photo.hardData.location
                    && photo.hardData.location !== 'Neznámé místo';
                if (hasOwnLocation || photo.hardData?.locationSource === 'manual') return;

                const photoTime = new Date(photo.date).getTime();
                const isNearAnchor = anchors.some((anchor) => {
                    const anchorTime = new Date(anchor.date).getTime();
                    return Math.abs(anchorTime - photoTime) <= maxGap;
                });

                if (isNearAnchor) targets.add(photo.id);
            });

            return targets;
        };

        // Photos near the anchor that still have no real location. This includes
        // "manual" placeholder locations like "Neznámé místo".
        const findNeighborsMissingLocation = (photos, anchor, windowMs) => {
            const maxGap = Number.isFinite(windowMs) ? windowMs : INTERPOLATION_WINDOW_MS;
            const anchorTime = new Date(anchor.date).getTime();
            const ids = new Set();
            photos.forEach((photo) => {
                if (photo.id === anchor.id || !photoNeedsLocation(photo)) return;
                if (Math.abs(new Date(photo.date).getTime() - anchorTime) <= maxGap) ids.add(photo.id);
            });
            return ids;
        };

        const buildPlaceholderEventName = (index, location) => {
            const suffix = location && location !== 'Neznámé místo' ? ` - ${location}` : '';
            return `Event ${index + 1}${suffix}`;
        };

        // --- LOCAL PROJECT STORAGE (IndexedDB, no photo blobs) ---
        const PROJECT_DB = 'clustr';
        const PROJECT_DB_VERSION = 1;
        const PROJECT_STORE = 'project';

        const openProjectDb = () => new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                reject(new Error('IndexedDB is unavailable'));
                return;
            }
            const request = indexedDB.open(PROJECT_DB, PROJECT_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const readProject = async () => {
            try {
                const db = await openProjectDb();
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction(PROJECT_STORE, 'readonly');
                    const request = transaction.objectStore(PROJECT_STORE).get('current');
                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = () => reject(request.error);
                });
            } catch (e) {
                return null;
            }
        };

        const writeProject = async (value) => {
            try {
                const db = await openProjectDb();
                await new Promise((resolve, reject) => {
                    const transaction = db.transaction(PROJECT_STORE, 'readwrite');
                    transaction.objectStore(PROJECT_STORE).put(value, 'current');
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                });
                return true;
            } catch (e) {
                return false;
            }
        };

        const serializePhotosForStorage = (items) => items.map((photo) => ({
            name: photo.name,
            size: photo.file?.size || 0,
            lastModified: photo.file?.lastModified || 0,
            date: photo.date instanceof Date ? photo.date.getTime() : photo.date,
            hardData: photo.hardData || null,
            aiData: photo.aiData || null
        }));

        // --- TRIPS + HOME (hierarchical grouping) ---

        const DEFAULT_TRIP_SETTINGS = {
            tripGapHours: 72,
            parentTripGapHours: 120,
            tripMinPhotos: 3,
            randomMinPhotos: 3,
            maxInactiveDays: 1,
            maxTripDays: 30,
            heatmapRadiusDays: 2,
            heatmapThresholdRatio: 0.15,
            heatmapMinPhotos: 1,
            homeRadiusKm: 15,
            homeSessionGapHours: 4,
            maxHomeSessionHours: 12,
            noiseAttachWindowMs: 12 * 3600000,
            noiseGroupGapMs: 4 * 3600000
        };

        const buildTripSettings = (overrides = {}) => ({
            tripGapHours: clampNumber(Number(overrides.tripGapHours) || DEFAULT_TRIP_SETTINGS.tripGapHours, 12, 24 * 14),
            parentTripGapHours: clampNumber(Number(overrides.parentTripGapHours) || DEFAULT_TRIP_SETTINGS.parentTripGapHours, 12, 24 * 30),
            tripMinPhotos: clampNumber(Number(overrides.tripMinPhotos) || DEFAULT_TRIP_SETTINGS.tripMinPhotos, 1, 100),
            randomMinPhotos: clampNumber(Number(overrides.randomMinPhotos) || DEFAULT_TRIP_SETTINGS.randomMinPhotos, 1, 100),
            maxInactiveDays: clampNumber(Number(overrides.maxInactiveDays) || DEFAULT_TRIP_SETTINGS.maxInactiveDays, 0, 14),
            maxTripDays: clampNumber(Number(overrides.maxTripDays) || DEFAULT_TRIP_SETTINGS.maxTripDays, 1, 365),
            heatmapRadiusDays: clampNumber(Number(overrides.heatmapRadiusDays) || DEFAULT_TRIP_SETTINGS.heatmapRadiusDays, 0, 14),
            heatmapThresholdRatio: clampNumber(Number(overrides.heatmapThresholdRatio) || DEFAULT_TRIP_SETTINGS.heatmapThresholdRatio, 0.01, 1),
            heatmapMinPhotos: clampNumber(Number(overrides.heatmapMinPhotos) || DEFAULT_TRIP_SETTINGS.heatmapMinPhotos, 1, 100),
            homeRadiusKm: clampNumber(Number(overrides.homeRadiusKm) || DEFAULT_TRIP_SETTINGS.homeRadiusKm, 1, 100),
            homeSessionGapHours: clampNumber(Number(overrides.homeSessionGapHours) || DEFAULT_TRIP_SETTINGS.homeSessionGapHours, 0.5, 24),
            maxHomeSessionHours: clampNumber(Number(overrides.maxHomeSessionHours) || DEFAULT_TRIP_SETTINGS.maxHomeSessionHours, 1, 72),
            noiseAttachWindowMs: DEFAULT_TRIP_SETTINGS.noiseAttachWindowMs,
            noiseGroupGapMs: DEFAULT_TRIP_SETTINGS.noiseGroupGapMs
        });

        const meanCoords = (coordsList) => {
            const valid = (coordsList || []).filter((coords) => coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon));
            if (valid.length === 0) return null;
            return {
                lat: valid.reduce((sum, coords) => sum + coords.lat, 0) / valid.length,
                lon: valid.reduce((sum, coords) => sum + coords.lon, 0) / valid.length
            };
        };

        // Home is taken from Timeline HOME segments, the explicit setting, or inferred
        // from the location that appears on the most distinct days (only for datasets > 30 days).
        const inferHomeReference = (photos, homeLocation) => {
            const homeSource = photos.filter((photo) => photo.hardData?.locationSource === 'home' && photo.hardData?.coords);
            if (homeSource.length > 0) {
                return {
                    coords: meanCoords(homeSource.map((photo) => photo.hardData.coords)),
                    key: 'home',
                    name: homeLocation || 'Doma',
                    source: 'timeline'
                };
            }

            const target = normalizeLocationName(homeLocation);
            if (target) {
                const matches = photos.filter((photo) =>
                    normalizeLocationName(photo.hardData?.location) === target
                    || normalizeLocationName(photo.hardData?.locationKey) === target
                );
                if (matches.length > 0) {
                    return {
                        coords: meanCoords(matches.map((photo) => photo.hardData?.coords).filter(Boolean)),
                        key: matches[0].hardData?.locationKey || target,
                        name: matches[0].hardData?.location || homeLocation,
                        source: 'setting'
                    };
                }
            }

            let minTime = Infinity;
            let maxTime = -Infinity;
            photos.forEach((photo) => {
                const time = photo.date?.getTime?.();
                if (Number.isFinite(time)) {
                    minTime = Math.min(minTime, time);
                    maxTime = Math.max(maxTime, time);
                }
            });

            if (!Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
                return target ? { coords: null, key: target, name: homeLocation, source: 'setting' } : null;
            }

            const spanDays = (maxTime - minTime) / 86400000;
            if (spanDays <= 30) {
                return target ? { coords: null, key: target, name: homeLocation, source: 'setting' } : null;
            }

            const stats = new Map();
            photos.forEach((photo) => {
                const location = photo.hardData?.location;
                if (!location || location === 'Neznámé místo') return;
                const key = photo.hardData?.locationKey || normalizeLocationName(location);
                const day = photo.date.toDateString();
                const entry = stats.get(key) || { key, name: location, days: new Set(), coords: [] };
                entry.days.add(day);
                if (photo.hardData?.coords) entry.coords.push(photo.hardData.coords);
                stats.set(key, entry);
            });

            const best = [...stats.values()].sort((a, b) => b.days.size - a.days.size)[0];
            if (!best) return target ? { coords: null, key: target, name: homeLocation, source: 'setting' } : null;

            const minDays = Math.max(4, Math.floor(spanDays * 0.1));
            if (best.days.size < minDays) {
                return target ? { coords: null, key: target, name: homeLocation, source: 'setting' } : null;
            }

            return { coords: meanCoords(best.coords), key: best.key, name: best.name, source: 'inferred' };
        };

        const isHomePhoto = (photo, homeRef, radiusKm) => {
            if (!homeRef) return false;
            if (photo.hardData?.locationSource === 'home') return true;

            if (homeRef.coords && photo.hardData?.coords) {
                const distance = distanceKm(homeRef.coords, photo.hardData.coords);
                if (distance !== null) return distance <= radiusKm;
            }

            const name = normalizeLocationName(photo.hardData?.location);
            const key = normalizeLocationName(photo.hardData?.locationKey);
            return Boolean(
                (homeRef.name && name === normalizeLocationName(homeRef.name))
                || (homeRef.key && key === normalizeLocationName(homeRef.key))
            );
        };

        const splitLongEpisode = (group, maxHours, gapMs) => {
            const sorted = [...group].sort((a, b) => a.date - b.date);
            if (sorted.length === 0) return [];

            const parts = [];
            let current = [sorted[0]];

            for (let i = 1; i < sorted.length; i += 1) {
                const previous = sorted[i - 1];
                const photo = sorted[i];
                const gap = photo.date.getTime() - previous.date.getTime();
                const spanHours = (photo.date.getTime() - current[0].date.getTime()) / 3600000;

                if (spanHours > maxHours && gap > gapMs) {
                    parts.push(current);
                    current = [photo];
                } else {
                    current.push(photo);
                }
            }

            parts.push(current);
            return parts;
        };

        // Daily density heatmap: smooth photo counts per day, find hot runs, and split at low-density valleys.
        const segmentDenseEpisodes = (photos, settings = DEFAULT_TRIP_SETTINGS) => {
            const sorted = [...photos].sort((a, b) => a.date - b.date);
            if (sorted.length === 0) return [];

            const startOfDay = (date) => Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86400000);
            const firstDay = startOfDay(sorted[0].date);
            const lastDay = startOfDay(sorted[sorted.length - 1].date);
            const dayCounts = new Map();
            sorted.forEach((photo) => {
                const day = startOfDay(photo.date);
                dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
            });

            const radius = Number.isFinite(settings.heatmapRadiusDays) ? settings.heatmapRadiusDays : 2;
            const ratio = Number.isFinite(settings.heatmapThresholdRatio) ? settings.heatmapThresholdRatio : 0.15;
            const minPhotos = Number.isFinite(settings.heatmapMinPhotos) ? settings.heatmapMinPhotos : 1;
            const maxInactiveDays = Number.isFinite(settings.maxInactiveDays) ? settings.maxInactiveDays : 1;

            const density = new Map();
            let peak = 0;
            for (let day = firstDay; day <= lastDay; day += 1) {
                let count = 0;
                for (let offset = -radius; offset <= radius; offset += 1) count += dayCounts.get(day + offset) || 0;
                density.set(day, count);
                peak = Math.max(peak, count);
            }

            const threshold = Math.max(minPhotos, peak * ratio);
            const runs = [];
            let currentRun = null;
            let inactiveDays = 0;

            for (let day = firstDay; day <= lastDay; day += 1) {
                const active = (density.get(day) || 0) >= threshold;
                if (active) {
                    if (!currentRun) currentRun = { start: day, end: day, photos: [] };
                    else currentRun.end = day;
                    inactiveDays = 0;
                } else if (currentRun) {
                    inactiveDays += 1;
                    if (inactiveDays > maxInactiveDays) {
                        runs.push(currentRun);
                        currentRun = null;
                        inactiveDays = 0;
                    }
                }
            }
            if (currentRun) runs.push(currentRun);

            if (runs.length === 0) {
                const fallback = new Map();
                sorted.forEach((photo) => {
                    const day = startOfDay(photo.date);
                    if (!fallback.has(day)) fallback.set(day, []);
                    fallback.get(day).push(photo);
                });
                return [...fallback.values()].map((group) => group.sort((a, b) => a.date - b.date));
            }

            const runForDay = (day) => {
                let best = null;
                let bestDistance = Infinity;
                for (const run of runs) {
                    if (day >= run.start && day <= run.end) return run;
                    const distance = day < run.start ? run.start - day : day > run.end ? day - run.end : 0;
                    if (distance <= maxInactiveDays + 1 && distance < bestDistance) {
                        best = run;
                        bestDistance = distance;
                    }
                }
                return best;
            };

            const leftovers = [];
            sorted.forEach((photo) => {
                const day = startOfDay(photo.date);
                const run = runForDay(day);
                if (run) run.photos.push(photo);
                else leftovers.push(photo);
            });

            const groups = runs
                .map((run) => run.photos.sort((a, b) => a.date - b.date))
                .filter((group) => group.length > 0);

            groupPhotosByTimeGaps(leftovers, Math.max(1, maxInactiveDays) * 86400000).forEach((group) => groups.push(group));
            return groups.sort((a, b) => a[0].date - b[0].date);
        };

        // Away photos become trips; home photos become home sessions. Unknown-location
        // photos are attached by time or grouped separately.
        const clusterPhotosIntoTrips = (photos, homeLocation, settings = DEFAULT_TRIP_SETTINGS) => {
            const homeRef = inferHomeReference(photos, homeLocation);
            const densityEpisodes = segmentDenseEpisodes(photos, settings);
            const homeSessionPhotos = [];
            const nonHomeEpisodes = [];

            densityEpisodes.forEach((episodePhotos) => {
                const home = [];
                const away = [];
                const unknown = [];

                episodePhotos.forEach((photo) => {
                    const hasCoords = Boolean(photo.hardData?.coords);
                    const hasNamedLocation = Boolean(photo.hardData?.locationKey && photo.hardData.location && photo.hardData.location !== 'Neznámé místo');
                    if (!hasCoords && !hasNamedLocation) {
                        unknown.push(photo);
                        return;
                    }
                    if (homeRef && isHomePhoto(photo, homeRef, settings.homeRadiusKm)) home.push(photo);
                    else away.push(photo);
                });

                if (away.length > home.length) {
                    // Away evidence wins: keep every unknown photo in this density episode inside the trip.
                    nonHomeEpisodes.push([...away, ...unknown].sort((a, b) => a.date - b.date));
                    homeSessionPhotos.push(...home);
                } else if (home.length > 0) {
                    homeSessionPhotos.push(...home, ...unknown);
                    // A few away photos inside a home-heavy episode still belong to a trip,
                    // never dropped. They can be merged by the parent-trip gap below.
                    if (away.length > 0) nonHomeEpisodes.push([...away].sort((a, b) => a.date - b.date));
                } else {
                    nonHomeEpisodes.push([...unknown].sort((a, b) => a.date - b.date));
                }
            });

            // Merge nearby density episodes into one parent trip. Long events are allowed to
            // contain multiple internal clusters/stops, but they should share one parent folder.
            nonHomeEpisodes.sort((a, b) => a[0].date - b[0].date);
            const parentTrips = [];
            let currentParent = [];

            nonHomeEpisodes.forEach((episodePhotos) => {
                if (currentParent.length === 0) {
                    currentParent = [...episodePhotos];
                    return;
                }

                const last = currentParent[currentParent.length - 1];
                const first = episodePhotos[0];
                const end = episodePhotos[episodePhotos.length - 1];
                const gapHours = (first.date.getTime() - last.date.getTime()) / 3600000;
                const durationDays = (end.date.getTime() - currentParent[0].date.getTime()) / 86400000;

                if (gapHours <= settings.parentTripGapHours && durationDays <= settings.maxTripDays) {
                    currentParent = currentParent.concat(episodePhotos);
                } else {
                    parentTrips.push(currentParent);
                    currentParent = [...episodePhotos];
                }
            });
            if (currentParent.length > 0) parentTrips.push(currentParent);

            const trips = [];
            const extras = [];

            parentTrips.forEach((parentPhotos) => {
                const sorted = [...parentPhotos].sort((a, b) => a.date - b.date);
                const hasLocation = sorted.some((photo) => {
                    const hasCoords = Boolean(photo.hardData?.coords);
                    const hasNamedLocation = Boolean(photo.hardData?.locationKey && photo.hardData.location && photo.hardData.location !== 'Neznámé místo');
                    return hasCoords || hasNamedLocation;
                });
                const spanHours = (sorted[sorted.length - 1].date.getTime() - sorted[0].date.getTime()) / 3600000;
                const smallOuting = sorted.length < (settings.randomMinPhotos || 3) && spanHours <= 24;

                if (!smallOuting && (hasLocation || spanHours > 24 || sorted.length >= settings.tripMinPhotos)) {
                    trips.push(sorted);
                } else {
                    extras.push(sorted);
                }
            });

            const homeSessions = [];
            groupPhotosByTimeGaps(homeSessionPhotos, settings.homeSessionGapHours * 3600000).forEach((group) => {
                splitLongEpisode(group, settings.maxHomeSessionHours, 3600000).forEach((part) => homeSessions.push(part));
            });

            const sortByStart = (items) => items.sort((a, b) => a[0].date - b[0].date);
            return {
                homeRef,
                trips: sortByStart(trips),
                homeSessions: sortByStart(homeSessions),
                extras: sortByStart(extras)
            };
        };

        const computeAutoTripSettings = (photos, homeLocation) => {
            const homeRef = inferHomeReference(photos, homeLocation);
            let homeRadiusKm = DEFAULT_TRIP_SETTINGS.homeRadiusKm;

            if (homeRef?.coords) {
                const distances = photos
                    .filter((photo) => photo.hardData?.locationSource === 'home'
                        || (homeRef.name && normalizeLocationName(photo.hardData?.location) === normalizeLocationName(homeRef.name)))
                    .map((photo) => (photo.hardData?.coords ? distanceKm(homeRef.coords, photo.hardData.coords) : null))
                    .filter((distance) => distance !== null);

                const p90 = percentileValue(distances, 0.9);
                if (p90 !== null) homeRadiusKm = clampNumber(p90 * 1.5, 5, 30);
            }

            return buildTripSettings({ homeRadiusKm });
        };

        const buildPlaceholderStopName = (index, location) => {
            const suffix = location && location !== 'Neznámé místo' ? ` - ${location}` : '';
            return `Stop ${index + 1}${suffix}`;
        };

        // Produces the flat list of event groups used by Phase 2:
        // one group per home session, one group per stop inside each trip.
        const buildHierarchicalEvents = (photos, homeLocation, settings = DEFAULT_TRIP_SETTINGS, stopSettingsOverride = null) => {
            const episodes = clusterPhotosIntoTrips(photos, homeLocation, settings);
            const groups = [];
            let stopCount = 0;

            episodes.trips.forEach((tripPhotos, tripIndex) => {
                const tripName = `Trip ${tripIndex + 1}`;
                const tripId = `evt-trip-${tripPhotos[0].date.getTime()}-${tripIndex}`;
                const tripStart = tripPhotos[0].date.getTime();
                const tripEnd = tripPhotos[tripPhotos.length - 1].date.getTime();
                const stopSettings = stopSettingsOverride || computeAutoClusterSettings(tripPhotos);
                const locatedCount = tripPhotos.filter((photo) => {
                    const hasCoords = Boolean(photo.hardData?.coords);
                    const hasNamedLocation = Boolean(photo.hardData?.locationKey && photo.hardData.location && photo.hardData.location !== 'Neznámé místo');
                    return hasCoords || hasNamedLocation;
                }).length;
                const minLocatedForStops = Math.max(2, stopSettings?.minPoints || 3);
                const coordsCount = tripPhotos.filter((photo) => {
                    const coords = photo.hardData?.coords;
                    return coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon);
                }).length;
                const locationKeys = new Set(tripPhotos
                    .map((photo) => photo.hardData?.locationKey)
                    .filter((key) => key));
                // A manual location alone (no coordinates) means one place, not per-day stops.
                const singleNamedLocation = coordsCount === 0 && locationKeys.size <= 1;

                // Without enough located photos, one flat trip folder is the honest result.
                if (locatedCount < minLocatedForStops || singleNamedLocation) {
                    groups.push({
                        photos: tripPhotos,
                        eventName: tripName,
                        clusterId: tripId,
                        clusterNumber: 0,
                        eventKind: 'trip',
                        tripId,
                        tripNumber: tripIndex + 1,
                        stopNumber: 0,
                        tripStart,
                        tripEnd,
                        tripName
                    });
                    return;
                }

                const stops = clusterPhotosByDensity(tripPhotos, stopSettings);

                stops.forEach((stopPhotos, stopIndex) => {
                    const dominant = applyDominantClusterLocation(stopPhotos);
                    const location = dominant?.location || stopPhotos[0]?.hardData?.location || 'Neznámé místo';
                    const stopName = buildPlaceholderStopName(stopIndex, location);
                    stopCount += 1;
                    groups.push({
                        photos: stopPhotos,
                        eventName: `${tripName}/${stopName}`,
                        clusterId: `${tripId}-stop-${stopIndex + 1}`,
                        clusterNumber: stopIndex + 1,
                        eventKind: 'trip-stop',
                        tripId,
                        tripNumber: tripIndex + 1,
                        stopNumber: stopIndex + 1,
                        tripStart,
                        tripEnd,
                        tripName
                    });
                });
            });

            episodes.homeSessions.forEach((sessionPhotos, index) => {
                const id = `evt-home-${sessionPhotos[0].date.getTime()}-${index}`;
                groups.push({
                    photos: sessionPhotos,
                    eventName: `Home ${index + 1}`,
                    clusterId: id,
                    clusterNumber: index + 1,
                    eventKind: 'home',
                    tripId: id,
                    tripNumber: 0,
                    stopNumber: 0
                });
            });

            if (episodes.extras.length > 0) {
                const randomPhotos = episodes.extras.flat().sort((a, b) => a.date - b.date);
                groups.push({
                    photos: randomPhotos,
                    eventName: RANDOM_FOLDER,
                    clusterId: 'random',
                    clusterNumber: 0,
                    eventKind: 'random',
                    tripId: 'random',
                    tripNumber: 0,
                    stopNumber: 0
                });
            }

            groups.sort((a, b) => a.photos[0].date - b.photos[0].date);
            return {
                groups,
                tripCount: episodes.trips.length,
                homeSessionCount: episodes.homeSessions.length,
                extraCount: episodes.extras.length,
                randomCount: episodes.extras.length > 0 ? 1 : 0,
                stopCount,
                homeRef: episodes.homeRef
            };
        };

        const PREVIEW_MAX_EDGE = 640;

        const loadPreviewImage = (url) => new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('preview decode failed'));
            image.src = url;
        });

        const shrinkToObjectUrl = async (source, width, height) => {
            if (!width || !height) return null;
            const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
            const targetWidth = Math.max(1, Math.round(width * scale));
            const targetHeight = Math.max(1, Math.round(height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
            return blob ? URL.createObjectURL(blob) : null;
        };

        // Typed blobs are required by Safari; exifr returns raw bytes, so we detect the type.
        const previewFromBlob = async (blob) => {
            const url = URL.createObjectURL(blob);
            try {
                const image = await loadPreviewImage(url);
                return await shrinkToObjectUrl(image, image.naturalWidth, image.naturalHeight);
            } catch (e) {
                return null;
            } finally {
                URL.revokeObjectURL(url);
            }
        };

        const previewFromHeic = async (file) => {
            if (typeof heic2any !== 'function') return null;
            try {
                const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
                const blob = Array.isArray(converted) ? converted[0] : converted;
                return blob ? previewFromBlob(blob) : null;
            } catch (e) {
                return null;
            }
        };

        // exifr/UTIF run in a worker with a hard timeout, so a bad raw file can
        // never leave a tile spinning forever or block the UI.
        const previewFromWorker = (file, options = {}) => new Promise((resolve) => {
            if (typeof Worker === 'undefined') {
                resolve({ url: null, hadCandidates: false });
                return;
            }
            let worker;
            try {
                worker = new Worker('preview-worker.js?v=5');
            } catch (e) {
                resolve({ url: null, hadCandidates: false });
                return;
            }
            let settled = false;
            let timer = null;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                try { worker.terminate(); } catch (e) {}
                resolve(value);
            };
            timer = setTimeout(() => finish({ url: null, hadCandidates: false }), 15000);
            worker.onmessage = async (event) => {
                const data = event.data || {};
                if (data.type !== 'result' || settled) return;
                let url = null;
                for (const candidate of data.candidates || []) {
                    if (!candidate || !candidate.buffer) continue;
                    if (candidate.kind === 'bytes') {
                        url = await previewFromBlob(new Blob([candidate.buffer], { type: candidate.mime || 'image/jpeg' }));
                    } else if (candidate.kind === 'rgba' && candidate.width && candidate.height) {
                        const canvas = document.createElement('canvas');
                        canvas.width = candidate.width;
                        canvas.height = candidate.height;
                        canvas.getContext('2d').putImageData(
                            new ImageData(new Uint8ClampedArray(candidate.buffer), candidate.width, candidate.height), 0, 0
                        );
                        url = await shrinkToObjectUrl(canvas, candidate.width, candidate.height);
                    }
                    if (url) break;
                }
                finish({ url, hadCandidates: Boolean(data.hadCandidates) });
            };
            worker.onerror = () => finish({ url: null, hadCandidates: false });
            worker.postMessage({ type: 'preview', id: 'preview', file, forceScan: Boolean(options.forceScan) });
        });

        const generatePreview = async (file, options = {}) => {
            const ext = file.name.split('.').pop().toLowerCase();
            const isHeic = ext === 'heic' || ext === 'heif';
            const isRaw = ['nef', 'cr2', 'dng', 'arw', 'raf', 'orf', 'tif', 'tiff'].includes(ext);
            if (!isHeic && !isRaw) return null;

            const result = await previewFromWorker(file, options);
            if (result.url) return result.url;

            // An embedded thumbnail can exist but still fail to decode. Ask the
            // worker for a fresh scan before giving up on the file.
            if (result.hadCandidates && !options.forceScan) {
                const rescan = await previewFromWorker(file, { ...options, forceScan: true });
                if (rescan.url) return rescan.url;
            }

            return isHeic ? previewFromHeic(file) : null;
        };

        const KIND_COLORS = {
            trip: '#0891b2',
            home: '#10b981',
            screenshot: '#64748b',
            misc: '#f59e0b'
        };

        const getPhotoKind = (photo) => {
            if (isScreenshotCategory(photo.aiData?.category)) return 'screenshot';
            const kind = photo.aiData?.eventKind;
            if (kind === 'trip' || kind === 'trip-stop') return 'trip';
            if (kind === 'home') return 'home';
            return 'misc';
        };

        const colorForKey = (key) => {
            let hash = 0;
            for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
            return `hsl(${hash}, 72%, 62%)`;
        };

        // Keeps a bad cluster render from taking down the whole app (black screen).
        class ErrorBoundary extends React.Component {
            constructor(props) {
                super(props);
                this.state = { error: null };
            }

            static getDerivedStateFromError(error) {
                return { error };
            }

            componentDidCatch(error, info) {
                console.error('UI error', error, info);
            }

            render() {
                if (this.state.error) {
                    return React.createElement('div', { className: 'fixed inset-0 bg-black/85 z-[130] flex items-center justify-center p-4' },
                        React.createElement('div', { className: 'bg-slate-900 border border-rose-800 rounded-xl p-6 max-w-lg text-center' },
                            React.createElement('div', { className: 'text-lg font-bold text-rose-400 mb-2' }, 'Heatmap error'),
                            React.createElement('div', { className: 'text-sm text-slate-400 break-words mb-4' }, String(this.state.error?.message || this.state.error)),
                            React.createElement('button', {
                                className: 'bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded',
                                onClick: () => {
                                    this.setState({ error: null });
                                    if (this.props.onReset) this.props.onReset();
                                }
                            }, 'Close')
                        )
                    );
                }
                return this.props.children;
            }
        }


        