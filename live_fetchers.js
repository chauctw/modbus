// --- MOCK STATE & CONSTANTS ---
const state = {
    cleanWaterTokenCache: { token: null, expiresAt: 0 },
    cachedCleanWaterData: [],
    lastCleanWaterFetch: 0,
    cachedRawWaterData: [],
    lastRawWaterFetch: 0,
    cachedViwaterData: [],
    lastViwaterFetch: 0
};

// --- MOCK HTTP REQUEST ---
async function httpRequest(url, options = {}, bodyData = null, timeoutMs = 6000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const fetchOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            signal: controller.signal
        };

        if (bodyData && (fetchOptions.method === 'POST' || fetchOptions.method === 'PUT')) {
            fetchOptions.body = JSON.stringify(bodyData);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// --- HÀM HỖ TRỢ BÓC TÁCH GIÁ TRỊ (Lấy giá trị thực tế từ object) ---
function extractMetricValues(valueObj) {
    if (!valueObj || typeof valueObj !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(valueObj)) {
        // Thường các API trả về cấu trúc có trường 'val', 'value', hoặc chính là giá trị thô
        if (val !== null && typeof val === 'object') {
            result[key] = val.val !== undefined ? val.val : (val.value !== undefined ? val.value : val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

// --- CÁC HÀM FETCH CHÍNH ---

async function getCleanWaterToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && state.cleanWaterTokenCache.token && state.cleanWaterTokenCache.expiresAt > now) {
        return state.cleanWaterTokenCache.token;
    }
    const loginRes = await httpRequest(
        'https://mdcapi.ctn-cantho.com.vn/api/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { username: 'mdc', password: 'tw32vy8GBQAdouxs1' },
        5000
    );
    const token = loginRes.access_token || loginRes.token;
    if (!token) throw new Error('Không lấy được token mdcapi');
    state.cleanWaterTokenCache = { token, expiresAt: now + 20 * 60 * 1000 };
    return token;
}

async function fetchCleanWaterLive(fetchIntervalMs = 10000) {
    if (Date.now() - state.lastCleanWaterFetch < fetchIntervalMs) return state.cachedCleanWaterData;
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] 🌐 [API FETCH] Đang kéo dữ liệu Nước Sạch (mdcapi)...`);
    try {
        let token;
        try { token = await getCleanWaterToken(); } catch (e) { return state.cachedCleanWaterData; }
        let rawData;
        try {
            rawData = await httpRequest('https://mdcapi.ctn-cantho.com.vn/api/v1/chatluong/data', { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, null, 6000);
        } catch (e) {
            token = await getCleanWaterToken(true);
            rawData = await httpRequest('https://mdcapi.ctn-cantho.com.vn/api/v1/chatluong/data', { method: 'GET', headers: { Authorization: `Bearer ${token}` } }, null, 6000);
        }
        const dataList = Array.isArray(rawData) ? rawData : (rawData.data || []);
        const latestMap = {};
        dataList.forEach(item => {
            if (!item.tag_name) return;
            const timeMs = new Date(item.time_stamp).getTime();
            const currentTimeMs = latestMap[item.tag_name] ? new Date(latestMap[item.tag_name].time_stamp).getTime() : -1;
            if (!latestMap[item.tag_name] || timeMs > currentTimeMs) latestMap[item.tag_name] = item;
        });
        
        state.cachedCleanWaterData = Object.values(latestMap).map(item => ({
            tag_name: item.tag_name,
            time: item.time_stamp,
            metrics: (item.value && typeof item.value === 'object') ? Object.keys(item.value) : [],
            rawData: extractMetricValues(item.value) // Đã bóc tách lấy giá trị chi tiết
        }));
        state.lastCleanWaterFetch = Date.now();
        return state.cachedCleanWaterData;
    } catch (e) { return state.cachedCleanWaterData; }
}

async function fetchRawWaterLive(fetchIntervalMs = 10000) {
    if (Date.now() - state.lastRawWaterFetch < fetchIntervalMs) return state.cachedRawWaterData;
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] 🌐 [API FETCH] Đang kéo dữ liệu Nước Thô...`);
    try {
        const url = 'http://api.dulieuquantrac.com/?day=0&key=YTozOntzOjI6ImlkIjtpOjQyMTg7czozOiJ0YmwiO3M6MjY6InRibF90dmFfcXVhbnRyYWNfY3RuY2FudGhvIjtzOjM6ImtleSI7czozMjoiNGZkMTRiMmRlYzg0MWU4YWVkZjdkZTFkNzRmMzY2OGQiO30%3D';
        const parsedData = await httpRequest(url, { method: 'GET' }, null, 6000);
        if (!Array.isArray(parsedData) || parsedData.length === 0) return state.cachedRawWaterData;
        const latestMap = {};
        parsedData.forEach(item => { if (item.tag && !latestMap[item.tag]) latestMap[item.tag] = item; });
        
        state.cachedRawWaterData = Object.values(latestMap).map(item => ({
            tag_name: item.tag,
            time: item.time || '',
            metrics: (item.data && typeof item.data === 'object') ? Object.keys(item.data) : [],
            rawData: extractMetricValues(item.data) // Đã bóc tách lấy giá trị chi tiết
        }));
        state.lastRawWaterFetch = Date.now();
        return state.cachedRawWaterData;
    } catch (e) { return state.cachedRawWaterData; }
}

async function fetchViwaterLive(fetchIntervalMs = 10000) {
    if (Date.now() - state.lastViwaterFetch < fetchIntervalMs) return state.cachedViwaterData;
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] 🌐 [API FETCH] Đang kéo dữ liệu Viwater...`);
    try {
        const baseUrl = 'https://viwater.ctn-cantho.com.vn/VivaServices//Service1.svc';
        const resultList = [];
        try {
            const parsed = await httpRequest(`${baseUrl}/GetListSiteForDetailTable`, { method: 'GET' }, null, 6000);
            const siteList = parsed.GetListSiteForDetailTableResult || [];
            const ignoreKeys = new Set(['Location', 'NumberOrdered', 'TimeStamp', 'Status', 'IsLogger']);
            siteList.forEach(site => {
                const metrics = Object.keys(site).filter(k => !ignoreKeys.has(k) && site[k] !== null && site[k] !== undefined);
                if (metrics.length > 0) {
                    const rawDataObj = {}; metrics.forEach(m => rawDataObj[m] = site[m]);
                    resultList.push({ tag_name: site.Location || ('Site_' + site.NumberOrdered), time: site.TimeStamp || '', metrics, rawData: rawDataObj });
                }
            });
        } catch (err) {}
        const DIRECT_LOGGER_IDS = ['BlogX07', 'BlogX08', 'BlogX09'];
        const loggerResults = await Promise.allSettled(DIRECT_LOGGER_IDS.map(loggerId => httpRequest(`${baseUrl}/GetChannels/${loggerId}`, { method: 'GET' }, null, 6000)));
        loggerResults.forEach((r, idx) => {
            if (r.status !== 'fulfilled') return;
            const loggerId = DIRECT_LOGGER_IDS[idx];
            const channels = Array.isArray(r.value) ? r.value : (r.value.GetChannelsResult || []);
            if (channels.length > 0) {
                const metrics = []; const rawDataObj = {};
                channels.forEach(ch => { const key = ch.ChannelName || ch.ChannelId; if (key) { metrics.push(key); rawDataObj[key] = ch.Value; } });
                resultList.push({ tag_name: loggerId, time: channels[0].Timestamp || '', metrics, rawData: rawDataObj });
            }
        });
        state.cachedViwaterData = resultList;
        state.lastViwaterFetch = Date.now();
        return state.cachedViwaterData;
    } catch (e) { return state.cachedViwaterData; }
}

module.exports = { fetchCleanWaterLive, fetchRawWaterLive, fetchViwaterLive };