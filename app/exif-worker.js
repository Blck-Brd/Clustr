/* EXIF parsing worker. Keeps RAW/HEIC parsing off the main thread. */
let exifrReady = false;

try {
    importScripts('vendor/exifr.full.umd.js');
    exifrReady = typeof self.exifr !== 'undefined' || typeof exifr !== 'undefined';
} catch (error) {
    self.postMessage({ type: 'init-error', message: error?.message || 'exifr could not be loaded' });
}

self.onmessage = async (event) => {
    const data = event.data || {};
    if (data.type !== 'parse') return;

    const { id, file } = data;
    if (!exifrReady) {
        self.postMessage({ type: 'result', id, exif: null, error: 'exifr unavailable' });
        return;
    }

    const api = self.exifr || exifr;
    try {
        const exif = await Promise.race([
            api.parse(file, true),
            new Promise((resolve, reject) => {
                setTimeout(() => reject(new Error('EXIF parse timeout')), 30000);
            })
        ]);
        self.postMessage({
            type: 'result',
            id,
            exif: exif ? {
                DateTimeOriginal: exif.DateTimeOriginal || null,
                CreateDate: exif.CreateDate || null,
                ModifyDate: exif.ModifyDate || null,
                Make: exif.Make || '',
                Model: exif.Model || '',
                latitude: Number.isFinite(exif.latitude) ? exif.latitude : null,
                longitude: Number.isFinite(exif.longitude) ? exif.longitude : null
            } : null
        });
    } catch (error) {
        self.postMessage({ type: 'result', id, exif: null, error: error?.message || 'EXIF parse error' });
    }
};
