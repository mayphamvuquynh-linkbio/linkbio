// Lấy dữ liệu từ Google Sheet (qua Apps Script), nén ảnh sản phẩm, rồi ghi products.json.
// Chạy tay:   node scripts/build-products.js
// Chạy tự động: GitHub Action .github/workflows/update-products.yml (mỗi 10 phút)
//
// Ảnh sản phẩm: tải từ link trong Sheet, thu nhỏ còn rộng tối đa 440px, đổi sang webp
// (từ ~600KB còn ~20KB) và lưu trong thư mục img/. products.json trỏ tới ảnh đã nén.
// Ảnh nào nén lỗi thì giữ nguyên link gốc trong Sheet nên trang vẫn hiện ảnh.
// Cần ffmpeg (máy bạn đã có; GitHub Action tự cài khi có ảnh mới cần nén).
//
// An toàn: nếu API lỗi, trả về dữ liệu rỗng, hoặc số sản phẩm giảm bất thường
// thì script báo lỗi và KHÔNG ghi đè products.json đang có.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const API_URL = process.env.SHEET_API_URL ||
    'https://script.google.com/macros/s/AKfycbxqYsVBHmMiiGXJDNW6JQdgBQIZi9Rl0NBmW5xOOk3yvpV-qjSdxjigxwEQpOLTIMnA/exec';
const ROOT = path.join(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'products.json');
const IMG_DIR = path.join(ROOT, 'img');
const IMG_WIDTH = 440;            // Ảnh hiển thị khoảng 205px, gấp đôi cho màn hình Retina
const IMG_QUALITY = 72;           // Chất lượng webp (0-100)
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const EXIT_NEED_FFMPEG = 42;      // Mã thoát: cần cài ffmpeg rồi chạy lại

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

async function fetchWithRetry(url, attempts) {
    let lastError;
    for (let i = 1; i <= attempts; i++) {
        try {
            const response = await fetch(url, { redirect: 'follow' });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            if (!Array.isArray(data)) {
                throw new Error('API không trả về danh sách: ' + JSON.stringify(data).slice(0, 200));
            }
            return data;
        } catch (error) {
            lastError = error;
            console.warn('Lần ' + i + '/' + attempts + ' lỗi: ' + error.message);
            if (i < attempts) await new Promise(r => setTimeout(r, 3000 * i));
        }
    }
    throw lastError;
}

function toProducts(rows) {
    return rows
        .map(row => ({
            ID: String(row && row.ID != null ? row.ID : '').trim(),
            'Tên Sản Phẩm': String((row && row['Tên Sản Phẩm']) || '').trim(),
            'Ảnh Sản Phẩm': String((row && row['Ảnh Sản Phẩm']) || '').trim(),
            'Link Shopee': String((row && (row['Link Shopee'] || row['Link Shope'])) || '').trim()
        }))
        .filter(p => p.ID && isHttpUrl(p['Link Shopee']))
        .map(p => (isHttpUrl(p['Ảnh Sản Phẩm']) ? p : Object.assign(p, { 'Ảnh Sản Phẩm': '' })))
        .sort((a, b) => (Number(b.ID) || 0) - (Number(a.ID) || 0));
}

function readExisting() {
    try {
        return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    } catch (e) {
        return null;
    }
}

// --- Xử lý ảnh ---

function hasFfmpeg() {
    const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return !result.error && result.status === 0;
}

// Tên file có kèm mã băm của link gốc: đổi ảnh trong Sheet thì tên đổi theo,
// nên trình duyệt không bị giữ ảnh cũ trong bộ nhớ đệm.
function localImageName(id, url) {
    const safeId = String(id).replace(/[^\w-]/g, '_');
    const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
    return safeId + '-' + hash + '.webp';
}

async function downloadImage(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_SOURCE_BYTES) {
        throw new Error('kích thước ảnh không hợp lệ (' + buffer.length + ' byte)');
    }
    return buffer;
}

function convertToWebp(input) {
    const result = spawnSync('ffmpeg', [
        '-v', 'error',
        '-i', 'pipe:0',
        '-frames:v', '1',
        '-vf', "scale=w='min(" + IMG_WIDTH + ",iw)':h=-2",
        '-c:v', 'libwebp',
        '-quality', String(IMG_QUALITY),
        '-f', 'webp',
        'pipe:1'
    ], { input: input, maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
        throw new Error('ffmpeg lỗi: ' + String(result.stderr || '').trim().slice(0, 200));
    }
    return result.stdout;
}

async function processImages(products) {
    fs.mkdirSync(IMG_DIR, { recursive: true });

    const jobs = products
        .filter(p => p['Ảnh Sản Phẩm'])
        .map(p => ({
            product: p,
            source: p['Ảnh Sản Phẩm'],
            name: localImageName(p.ID, p['Ảnh Sản Phẩm'])
        }));

    const pending = jobs.filter(job => !fs.existsSync(path.join(IMG_DIR, job.name)));

    if (pending.length > 0 && !hasFfmpeg()) {
        console.error('Có ' + pending.length + ' ảnh mới cần nén nhưng chưa có ffmpeg.');
        process.exit(EXIT_NEED_FFMPEG);
    }

    // Nén song song vài ảnh một lúc
    let next = 0;
    let done = 0;
    let failed = 0;
    async function worker() {
        while (next < pending.length) {
            const job = pending[next++];
            try {
                const webp = convertToWebp(await downloadImage(job.source));
                fs.writeFileSync(path.join(IMG_DIR, job.name), webp);
                done++;
            } catch (error) {
                failed++;
                console.warn('Không nén được ảnh sản phẩm ' + job.product.ID + ', giữ link gốc: ' + error.message);
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
    if (pending.length > 0) {
        console.log('Ảnh mới: nén thành công ' + done + ', lỗi ' + failed + '.');
    }

    // Trỏ products.json tới ảnh đã nén (nếu có), không thì giữ link gốc
    const used = new Set();
    jobs.forEach(job => {
        if (fs.existsSync(path.join(IMG_DIR, job.name))) {
            job.product['Ảnh Sản Phẩm'] = 'img/' + job.name;
            used.add(job.name);
        }
    });

    // Xóa ảnh cũ không còn dùng nữa
    fs.readdirSync(IMG_DIR)
        .filter(file => file.endsWith('.webp') && !used.has(file))
        .forEach(file => fs.unlinkSync(path.join(IMG_DIR, file)));
}

async function main() {
    const rows = await fetchWithRetry(API_URL, 3);
    const products = toProducts(rows);

    if (products.length === 0) {
        throw new Error('Không có sản phẩm hợp lệ nào, giữ nguyên products.json cũ.');
    }

    const existing = readExisting();
    if (existing && Array.isArray(existing.products) && existing.products.length >= 10 &&
        products.length < existing.products.length * 0.5) {
        throw new Error('Số sản phẩm giảm từ ' + existing.products.length + ' xuống ' + products.length +
            ' (hơn một nửa), nghi ngờ lỗi dữ liệu nên giữ nguyên products.json cũ.');
    }

    await processImages(products);

    // Dữ liệu không đổi thì giữ nguyên file (không đổi generatedAt) để không tạo commit thừa
    if (existing && JSON.stringify(existing.products) === JSON.stringify(products)) {
        console.log('Dữ liệu không đổi (' + products.length + ' sản phẩm), không ghi file.');
        return;
    }

    const output = { generatedAt: new Date().toISOString(), products: products };
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 1) + '\n', 'utf8');
    console.log('Đã ghi products.json: ' + products.length + ' sản phẩm.');
}

main().catch(error => {
    console.error('LỖI: ' + error.message);
    process.exit(1);
});
