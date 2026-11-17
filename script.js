// --- 1. CẤU HÌNH ---
// Nguồn dữ liệu, theo thứ tự ưu tiên:
//   1) Bản lưu trong trình duyệt (hiện tức thì)
//   2) products.json: file tĩnh nằm cùng trang, GitHub Action tự cập nhật từ Google Sheet (rất nhanh)
//   3) Google Apps Script (chậm 2-9 giây): chỉ dùng khi products.json lỗi hoặc đã quá cũ
// URL Apps Script được khai báo trong <head> của index.html (window.SHEET_API_URL).
const SHEET_API_URL = window.SHEET_API_URL;
const SNAPSHOT_URL = 'products.json';
const SNAPSHOT_STALE_AFTER = 6 * 60 * 60 * 1000; // products.json cũ hơn 6 giờ thì hỏi thêm Apps Script
const CACHE_KEY = 'bio_products_cache_v1';
const CACHE_TIME_KEY = 'bio_products_time_v1';
const PAGE_SIZE = 15;                  // Số sản phẩm hiện mỗi lần
const EAGER_IMAGES = 4;                // Số ảnh đầu tiên tải ngay (còn lại tải lười)

let allProductsData = []; // Toàn bộ danh sách sản phẩm
let displayedCount = PAGE_SIZE;
let renderedCount = 0;    // Số thẻ đã vẽ ra màn hình
let isAutoScrolling = false;

// --- 2. HÀM TIỆN ÍCH ---

// localStorage có thể bị chặn (chế độ riêng tư, trình duyệt trong app) nên luôn bọc try/catch
function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* bỏ qua */ }
}

// Chỉ chấp nhận link http/https, chặn javascript: và các kiểu nguy hiểm khác
function safeUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url : '';
}

// Chuẩn hóa mã để so sánh: bỏ khoảng trắng, không phân biệt hoa/thường, "005" = "5"
function normalizeCode(value) {
    const text = String(value == null ? '' : value).trim().toLowerCase();
    return /^\d+$/.test(text) ? String(Number(text)) : text;
}

// Chuyển dữ liệu thô từ Sheet thành danh sách sản phẩm hợp lệ
function normalizeProducts(data) {
    if (!Array.isArray(data)) return [];

    return data
        .map(item => {
            const id = String(item && item.ID != null ? item.ID : '').trim();
            return {
                id: id,
                numericId: Number(id) || 0,
                title: String((item && item['Tên Sản Phẩm']) || '').trim(),
                image: safeUrl(item && item['Ảnh Sản Phẩm']),
                // Hỗ trợ cả tên cột đúng chính tả "Shopee" lẫn tên cũ "Shope"
                link: safeUrl(item && (item['Link Shopee'] || item['Link Shope']))
            };
        })
        // Bỏ các dòng thiếu mã hoặc thiếu link để khách không bấm vào thẻ hỏng
        .filter(p => p.id && p.link)
        .sort((a, b) => b.numericId - a.numericId); // Sản phẩm mới lên đầu
}

// Gọi Google Apps Script (chậm), trả về danh sách đã chuẩn hóa (ném lỗi nếu API hỏng)
async function fetchProducts() {
    const response = await fetch(SHEET_API_URL);
    if (!response.ok) throw new Error('API trả về mã lỗi ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('API trả về dữ liệu không đúng định dạng');
    return normalizeProducts(data);
}

// Đọc products.json (nhanh). Dùng yêu cầu đã gửi sẵn từ <head> nếu có.
// cache: 'no-cache' = luôn hỏi máy chủ xem file có đổi không (nhận 304 rất nhẹ nếu chưa đổi)
async function fetchSnapshot() {
    let response = null;
    if (window.__snapshotFetch) {
        response = await window.__snapshotFetch;
        window.__snapshotFetch = null;
    }
    if (!response) response = await fetch(SNAPSHOT_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error('products.json trả về mã lỗi ' + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.products)) throw new Error('products.json sai định dạng');
    return {
        products: normalizeProducts(data.products),
        generatedAt: Date.parse(data.generatedAt) || 0
    };
}

// Lấy dữ liệu mới nhất: ưu tiên products.json, lỗi hoặc rỗng thì dùng Apps Script.
// stale = true nghĩa là products.json đã cũ, nên cần hỏi thêm Apps Script phía sau.
async function getLatest() {
    try {
        const snap = await fetchSnapshot();
        if (snap.products.length > 0) {
            const stale = Date.now() - snap.generatedAt > SNAPSHOT_STALE_AFTER;
            return { products: snap.products, stale: stale };
        }
    } catch (e) {
        console.warn('Không đọc được products.json, chuyển sang Apps Script:', e);
    }
    return { products: await fetchProducts(), stale: false };
}

// Lưu và vẽ lại nếu dữ liệu khác bản đang hiển thị
function applyIfChanged(products) {
    if (!products || products.length === 0) return;
    const changed = JSON.stringify(products) !== JSON.stringify(allProductsData);
    saveCache(products);
    if (changed) {
        allProductsData = products;
        renderProductList();
    }
}

function saveCache(products) {
    storageSet(CACHE_KEY, JSON.stringify(products));
    storageSet(CACHE_TIME_KEY, String(Date.now()));
}

// Bản lưu cũ vẫn dùng được dù đã quá lâu: hiện ngay rồi cập nhật ngầm phía sau
function loadCache() {
    try {
        const parsed = JSON.parse(storageGet(CACHE_KEY));
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
        return null; // Cache hỏng thì bỏ qua và tải mới
    }
}

function showListMessage(text, isError) {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;
    const p = document.createElement('p');
    p.className = 'list-message' + (isError ? ' list-message-error' : '');
    p.textContent = text;
    listContainer.replaceChildren(p);
    renderedCount = 0;
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
}

// --- 3. TẢI DỮ LIỆU (CACHE TRƯỚC, CẬP NHẬT NGẦM SAU) ---
async function initProducts() {
    const cached = loadCache();

    if (cached) {
        allProductsData = cached;
        renderProductList();
        refreshInBackground();
    } else {
        showListMessage('Đang tải sản phẩm...', false);
        try {
            const latest = await getLatest();
            if (latest.products.length === 0) {
                showListMessage('Chưa có sản phẩm nào', false);
                return;
            }
            allProductsData = latest.products;
            saveCache(allProductsData);
            renderProductList();
            if (latest.stale) refreshFromApiInBackground();
        } catch (error) {
            console.error('Lỗi khi tải dữ liệu:', error);
            showListMessage('Không thể tải sản phẩm. Bạn thử tải lại trang nha.', true);
        }
    }
}

// Hỏi Apps Script ngầm (chậm nhưng không chặn gì), dùng khi products.json đã cũ
async function refreshFromApiInBackground() {
    try {
        applyIfChanged(await fetchProducts());
    } catch (e) {
        // Bỏ qua lỗi ngầm, khách vẫn dùng dữ liệu đang có
    }
}

// Lấy dữ liệu mới ngầm; nếu khác bản đang hiện thì vẽ lại để khách thấy sản phẩm mới
async function refreshInBackground() {
    try {
        const latest = await getLatest();
        if (latest.stale) {
            // products.json đã cũ nên không dùng nó đè lên bản đang hiện; hỏi thẳng Apps Script
            refreshFromApiInBackground();
        } else {
            applyIfChanged(latest.products);
        }
    } catch (e) {
        // Bỏ qua lỗi ngầm nếu mất mạng, khách vẫn dùng bản cache
    }
}

// --- 4. VẼ DANH SÁCH SẢN PHẨM (PHÂN TRANG + LAZY LOADING) ---

// Tạo 1 thẻ sản phẩm bằng DOM API (textContent nên không thể chèn HTML/script)
function createProductCard(item, index) {
    const card = document.createElement('a');
    card.className = index % 2 !== 0 ? 'product-card reverse' : 'product-card';
    card.href = item.link;
    card.target = '_blank';
    card.rel = 'noopener noreferrer sponsored';
    card.dataset.id = item.id;

    const imageBox = document.createElement('div');
    imageBox.className = 'card-image';
    if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.title || ('Sản phẩm ' + item.id);
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        if (index < EAGER_IMAGES) {
            // Vài ảnh đầu nằm ngay màn hình đầu tiên: tải trước, ưu tiên cao
            img.loading = 'eager';
            img.fetchPriority = 'high';
        } else {
            img.loading = 'lazy';
        }
        imageBox.appendChild(img);
    }

    const content = document.createElement('div');
    content.className = 'card-content';

    const idSpan = document.createElement('span');
    idSpan.className = 'card-id';
    idSpan.textContent = item.id;

    const title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = item.title;

    content.append(idSpan, title);
    card.append(imageBox, content);
    return card;
}

// fromStart = true: vẽ lại từ đầu. false: chỉ vẽ nối thêm phần mới
function renderProductList(fromStart = true) {
    const listContainer = document.getElementById('product-list');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (!listContainer) return;

    if (allProductsData.length === 0) {
        showListMessage('Chưa có sản phẩm nào', false);
        return;
    }

    if (fromStart) {
        listContainer.replaceChildren();
        renderedCount = 0;
    }

    const fragment = document.createDocumentFragment();
    const end = Math.min(displayedCount, allProductsData.length);
    for (let i = renderedCount; i < end; i++) {
        fragment.appendChild(createProductCard(allProductsData[i], i));
    }
    listContainer.appendChild(fragment);
    renderedCount = end;

    if (loadMoreContainer) {
        loadMoreContainer.style.display = displayedCount < allProductsData.length ? 'block' : 'none';
    }
}

// Bấm nút "Xem thêm sản phẩm"
function loadMoreProducts() {
    displayedCount += PAGE_SIZE;
    renderProductList(false);
}

// --- 5. TÌM KIẾM MÃ SẢN PHẨM VÀ CUỘN TỚI ---
function searchAndScroll() {
    const input = document.getElementById('searchCodeInput');
    const messageBox = document.getElementById('searchMessage');
    if (!input) return;

    const keyword = input.value.trim();

    if (!keyword) {
        resetSearchState();
        return;
    }

    const wanted = normalizeCode(keyword);
    const foundIndex = allProductsData.findIndex(item => normalizeCode(item.id) === wanted);

    if (foundIndex === -1) {
        if (messageBox) {
            const message = 'Mã ' + keyword + ' này chưa có nha';
            messageBox.textContent = message;
            setTimeout(() => {
                if (messageBox.textContent === message) messageBox.textContent = '';
            }, 3000);
        }
        return;
    }

    if (messageBox) messageBox.textContent = '';

    // Sản phẩm nằm sâu chưa được vẽ thì mở rộng danh sách cho tới nó
    if (foundIndex >= renderedCount) {
        displayedCount = foundIndex + 5;
        renderProductList(false);
    }

    input.blur();
    isAutoScrolling = true;

    const allCards = document.querySelectorAll('.product-card');
    const targetId = allProductsData[foundIndex].id;
    let targetCard = null;

    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
        if (card.dataset.id === targetId) targetCard = card;
    });

    if (targetCard) {
        targetCard.classList.add('product-highlight');
        allCards.forEach(card => {
            if (card !== targetCard) card.classList.add('product-dimmed');
        });
        targetCard.scrollIntoView({ behavior: 'auto', block: 'center' });
    }

    setTimeout(() => { isAutoScrolling = false; }, 800);
}

// --- 6. RESET TRẠNG THÁI TÌM KIẾM ---
function resetSearchState() {
    const input = document.getElementById('searchCodeInput');
    if (input) input.value = '';

    const messageBox = document.getElementById('searchMessage');
    if (messageBox) messageBox.textContent = '';

    document.querySelectorAll('.product-card').forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });
}

// --- 7. CUỘN NGƯỢC LÊN Ô TÌM KIẾM ---
function scrollToSearch() {
    const input = document.getElementById('searchCodeInput');
    isAutoScrolling = true;

    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => {
        isAutoScrolling = false;
        if (input) input.focus();
    }, 500);
}

// --- 8. KHỞI CHẠY KHI TRANG TẢI XONG ---
document.addEventListener('DOMContentLoaded', () => {
    initProducts();

    const input = document.getElementById('searchCodeInput');
    if (input) {
        // Enter đã được thẻ <form> xử lý nên không cần lắng nghe phím ở đây nữa.
        // Xóa hết chữ trong ô thì bỏ hiệu ứng làm mờ
        input.addEventListener('input', (e) => {
            if (e.target.value.trim() === '') resetSearchState();
        });
    }

    const backToTopBtn = document.getElementById('backToTopBtn');

    window.addEventListener('scroll', () => {
        if (backToTopBtn) backToTopBtn.classList.toggle('show', window.scrollY > 300);

        if (!isAutoScrolling && input && input.value.trim() !== '') {
            resetSearchState();
        }
    }, { passive: true });
});
