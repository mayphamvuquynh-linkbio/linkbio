// Lấy dữ liệu từ Google Sheet (qua Apps Script) và ghi thành products.json.
// Chạy tay:   node scripts/build-products.js
// Chạy tự động: GitHub Action .github/workflows/update-products.yml (mỗi 10 phút)
//
// An toàn: nếu API lỗi, trả về dữ liệu rỗng, hoặc số sản phẩm giảm bất thường
// thì script báo lỗi và KHÔNG ghi đè products.json đang có.

const fs = require('fs');
const path = require('path');

const API_URL = process.env.SHEET_API_URL ||
    'https://script.google.com/macros/s/AKfycbxqYsVBHmMiiGXJDNW6JQdgBQIZi9Rl0NBmW5xOOk3yvpV-qjSdxjigxwEQpOLTIMnA/exec';
const OUT_FILE = path.join(__dirname, '..', 'products.json');

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
