/* Raw/embedded preview extraction worker.
   Keeps exifr thumbnail parsing and UTIF decoding off the main thread, so a
   malformed or huge raw file cannot lock up the UI. Returns raw candidate
   bytes; the main thread turns them into blob URLs. */
let exifrReady = false;
let utifReady = false;

try {
    importScripts('vendor/exifr.full.umd.js');
    exifrReady = true;
} catch (error) {}

try {
    importScripts('vendor/utif.js');
    utifReady = true;
} catch (error) {}

const tagValue = (ifd, tag) => {
    const value = ifd[tag];
    return value && value.length ? Number(value[0]) : 0;
};

const sniffImageMime = (bytes) => {
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return 'image/jpeg';
};

// Rebuilds a browser-decodable JPEG from a single-strip JPEG-compressed TIFF IFD.
const buildJpegFromIfd = (ifd, data, off, len) => {
    const compression = tagValue(ifd, 't259');
    if (compression === 7) {
        const tables = ifd.t347;
        if (!tables) return data.slice(off, off + len);
        const tlen = tables.length;
        const buff = new Uint8Array(tlen + len);
        let boff = 0;
        for (let i = 0; i < tlen - 1; i += 1) {
            if (tables[i] === 255 && tables[i + 1] === 217) break;
            buff[boff++] = tables[i];
        }
        if (!(data[off] === 255 && data[off + 1] === 216)) {
            buff[boff++] = data[off];
            buff[boff++] = data[off + 1];
        }
        for (let i = 2; i < len; i += 1) buff[boff++] = data[off + i];
        return buff.slice(0, boff);
    }
    if (compression === 6) {
        try {
            ifd.width = tagValue(ifd, 't256');
            ifd.height = tagValue(ifd, 't257');
            const jpegData = UTIF.decode._decodeOldJPEGInit(ifd, data, off, len);
            if (jpegData.jpegOffset != null) {
                const dlen = Math.max(0, off + len - jpegData.jpegOffset);
                return data.slice(jpegData.jpegOffset, jpegData.jpegOffset + dlen);
            }
            const tables = jpegData.tables || new Uint8Array(0);
            const sos = jpegData.sosMarker || new Uint8Array(0);
            const buff = new Uint8Array(tables.length + sos.length + len + 2);
            buff.set(tables, 0);
            let boff = tables.length;
            buff[jpegData.sofPosition + 5] = (ifd.height >>> 8) & 255;
            buff[jpegData.sofPosition + 6] = ifd.height & 255;
            buff[jpegData.sofPosition + 7] = (ifd.width >>> 8) & 255;
            buff[jpegData.sofPosition + 8] = ifd.width & 255;
            if (!(data[off] === 255 && data[off + 1] === 218)) {
                buff.set(sos, boff);
                boff += sos.length;
            }
            for (let i = 0; i < len; i += 1) buff[boff++] = data[off + i];
            buff[boff++] = 255;
            buff[boff++] = 217;
            return buff.slice(0, boff);
        } catch (error) {
            return null;
        }
    }
    return null;
};

const collectUtifCandidates = (buffer, candidates) => {
    if (!utifReady || typeof UTIF === 'undefined') return;
    let ifds;
    try {
        ifds = UTIF.decode(buffer);
    } catch (error) {
        return;
    }
    if (!ifds || !ifds.length) return;

    const data = new Uint8Array(buffer);
    const ranked = ifds
        .map((ifd) => ({
            ifd,
            width: tagValue(ifd, 't256'),
            height: tagValue(ifd, 't257'),
            compression: tagValue(ifd, 't259'),
            strips: (ifd.t273 || ifd.t324 || []).length
        }))
        .filter(({ width, height }) => width > 0 && height > 0)
        .sort((a, b) => {
            const aJpeg = [6, 7].includes(a.compression) ? 1 : 0;
            const bJpeg = [6, 7].includes(b.compression) ? 1 : 0;
            if (aJpeg !== bJpeg) return bJpeg - aJpeg;
            return (b.width * b.height) - (a.width * a.height);
        });

    for (const { ifd, width, height, compression, strips } of ranked) {
        if ([6, 7].includes(compression) && strips <= 1 && width * height <= 40e6) {
            const offsets = ifd.t273 || ifd.t324;
            const counts = ifd.t279 || ifd.t325;
            if (offsets && counts && offsets.length === 1) {
                const jpeg = buildJpegFromIfd(ifd, data, offsets[0], counts[0]);
                if (jpeg && jpeg.length) {
                    candidates.push({ kind: 'bytes', buffer: jpeg.buffer, mime: 'image/jpeg' });
                }
            }
        }

        if (width * height > 1e6) continue;
        try {
            UTIF.decodeImage(buffer, ifd);
            const w = ifd.width || width;
            const h = ifd.height || height;
            if (!w || !h) continue;
            const rgba = UTIF.toRGBA8(ifd);
            if (!rgba || rgba.length !== w * h * 4) continue;
            const copy = new Uint8Array(rgba);
            candidates.push({ kind: 'rgba', buffer: copy.buffer, width: w, height: h });
        } catch (error) {}
    }
};

self.onmessage = async (event) => {
    const data = event.data || {};
    if (data.type !== 'preview' || !data.file) return;

    const candidates = [];
    let hasEmbeddedThumbnail = false;
    if (exifrReady) {
        try {
            const bytes = await self.exifr.thumbnail(data.file);
            if (bytes && bytes.length) {
                const copy = bytes.slice ? bytes.slice() : new Uint8Array(bytes);
                candidates.push({ kind: 'bytes', buffer: copy.buffer, mime: sniffImageMime(copy) });
                hasEmbeddedThumbnail = true;
            }
        } catch (error) {}
    }

    // Only fall back to UTIF when there is no embedded exifr preview. The
    // vendored UTIF parser has bounds/recursion guards so malformed raw files
    // return quickly instead of hanging.
    const ext = String(data.file.name || '').split('.').pop().toLowerCase();
    const canUseUtif = ['nef', 'cr2', 'arw', 'dng', 'raf', 'orf', 'tif', 'tiff'].includes(ext);
    if (!hasEmbeddedThumbnail && canUseUtif) {
        try {
            const buffer = await data.file.arrayBuffer();
            collectUtifCandidates(buffer, candidates);
        } catch (error) {}
    }

    const transfers = candidates.map((candidate) => candidate.buffer).filter(Boolean);
    self.postMessage({ type: 'result', id: data.id, candidates }, transfers);
};
