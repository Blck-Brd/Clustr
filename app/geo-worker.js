/* Nominatim reverse-geocoding worker. Serializes requests to respect the public rate limit. */
const cache = new Map();
let queue = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const reverseGeocode = async ({ lat, lon }) => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
        headers: { 'User-Agent': 'AI-Photo-Sorter-Pro/6.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const address = data.address;
    if (!address) return null;
    return address.city || address.town || address.village || address.county || address.state || address.country || null;
};

const handle = async (data) => {
    if (!data || data.type !== 'geocode') return;
    const { key, coords } = data;

    if (cache.has(key)) {
        self.postMessage({ type: 'geocode-result', key, name: cache.get(key) });
        return;
    }

    let name = null;
    try {
        await sleep(1100);
        name = await reverseGeocode(coords);
    } catch (error) {
        name = null;
    }

    cache.set(key, name);
    self.postMessage({ type: 'geocode-result', key, name });
};

self.onmessage = (event) => {
    queue = queue.then(() => handle(event.data));
};
