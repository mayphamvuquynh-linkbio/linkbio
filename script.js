// --- 1. BIẾN KẾT NỐI API GOOGLE SHEET & CẤU HÌNH PHÂN TRANG ---
const SHEET_API_URL = 'https://api.sheetbest.com/sheets/ba7761b0-8931-4778-b978-cc21d71cf1c2';
const CACHE_KEY = 'bio_products_cache_v1';
const CACHE_TIME_KEY = 'bio_products_time_v1';
const CACHE_DURATION = 5 * 60 * 1000; // Thời hạn cache: 5 phút

let allProductsData = []; // Lưu toàn bộ danh sách sản phẩm lấy về
let displayedCount = 15;   // Số lượng sản phẩm hiển thị ban đầu mỗi lần
let isAutoScrolling = false;

// --- 2. HÀM TẢI DỮ LIỆU TỪ GOOGLE SHEET HOẶC LOCALSTORAGE ---
async function initProducts() {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;

    // Kiểm tra xem đã có dữ liệu lưu đệm (Cache) chưa để tăng tốc độ load tối đa
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    const now = new Date().getTime();

    if (cachedData && cachedTime && (now - cachedTime < CACHE_DURATION)) {
        // Nếu có cache và còn hạn, dùng luôn không cần gọi API chờ đợi
        allProductsData = JSON.parse(cachedData);
        renderProductList();
        
        // Vẫn ngầm gọi API cập nhật dữ liệu mới nhất phía sau (Stale-while-revalidate)
        fetchAndUpdateBackground();
    } else {
        // Lần đầu hoặc hết hạn cache thì hiện thông báo tải
        listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Đang tải sản phẩm...</p>`;
        await fetchProductsFromAPI();
    }
}

// Gọi API lấy dữ liệu thực tế từ Google Sheet
async function fetchProductsFromAPI() {
    const listContainer = document.getElementById('product-list');
    try {
        const response = await fetch(SHEET_API_URL);
        const data = await response.json();

        if (!data || data.length === 0) {
            listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Chưa có sản phẩm nào </p>`;
            return;
        }

        allProductsData = data.map(item => ({
            id: String(item.ID).trim(),
            numericId: Number(item.ID) || 0,
            title: item['Tên Sản Phẩm'],
            image: item['Ảnh Sản Phẩm'],
            link: item['Link Shope']
        }));

        // Sắp xếp sản phẩm mới lên đầu
        allProductsData.sort((a, b) => b.numericId - a.numericId);

        // Lưu vào LocalStorage để lần sau bật lên tức thì
        localStorage.setItem(CACHE_KEY, JSON.stringify(allProductsData));
        localStorage.setItem(CACHE_TIME_KEY, new Date().getTime());

        renderProductList();
    } catch (error) {
        console.error('Lỗi khi tải dữ liệu:', error);
        listContainer.innerHTML = `<p style="text-align: center; color: red; padding: 20px;">Không thể tải dữ liệu sản phẩm từ Google Sheet.</p>`;
    }
}

// Cập nhật ngầm không làm phiền người dùng
async function fetchAndUpdateBackground() {
    try {
        const response = await fetch(SHEET_API_URL);
        const data = await response.json();
        if (data && data.length > 0) {
            allProductsData = data.map(item => ({
                id: String(item.ID).trim(),
                numericId: Number(item.ID) || 0,
                title: item['Tên Sản Phẩm'],
                image: item['Ảnh Sản Phẩm'],
                link: item['Link Shope']
            }));
            allProductsData.sort((a, b) => b.numericId - a.numericId);
            localStorage.setItem(CACHE_KEY, JSON.stringify(allProductsData));
            localStorage.setItem(CACHE_TIME_KEY, new Date().getTime());
        }
    } catch (e) {
        // Bỏ qua lỗi ngầm nếu mất mạng
    }
}

// --- 3. HÀM VẼ DANH SẢN PHẨM RA MÀN HÌNH (CÓ PHÂN TRANG VÀ LAZY LOADING) ---
function renderProductList() {
    const listContainer = document.getElementById('product-list');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (!listContainer) return;

    if (allProductsData.length === 0) {
        listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Chưa có sản phẩm nào </p>`;
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        return;
    }

    // Chỉ lấy số lượng sản phẩm cần hiển thị hiện tại (VD: 15 sản phẩm đầu)
    const currentProducts = allProductsData.slice(0, displayedCount);

    let html = '';
    currentProducts.forEach((item, index) => {
        const isReverse = index % 2 !== 0;
        const cardClass = isReverse ? 'product-card reverse' : 'product-card';

        html += `
            <a href="${item.link}" target="_blank" class="${cardClass}" data-id="${item.id}" style="text-decoration: none; -webkit-tap-highlight-color: transparent; transition: transform 0.1s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                <!-- Nửa ảnh (50%) - Thêm loading="lazy" để siêu nhẹ -->
                <div class="card-image">
                    <img src="${item.image}" alt="" loading="lazy">
                </div>

                <!-- Nửa thông tin text (50%) -->
                <div class="card-content">
                    <span style="font-weight: 700; font-family: Arima Madurai; font-size: 16px; color: #784212; margin-bottom: 6px;">${item.id}</span>
                    <p style="font-size: 13px; color: #784212; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">
                        ${item.title}
                    </p>
                </div>
            </a>
        `;
    });

    listContainer.innerHTML = html;

    // Kiểm soát hiển thị nút "Xem thêm"
    if (loadMoreContainer) {
        if (displayedCount < allProductsData.length) {
            loadMoreContainer.style.display = 'block'; // Vẫn còn sản phẩm thì hiện nút
        } else {
            loadMoreContainer.style.display = 'none';  // Đã hiện hết thì ẩn nút đi
        }
    }
}

// Hàm bấm nút "Xem thêm sản phẩm"
function loadMoreProducts() {
    displayedCount += 15; // Mỗi lần bấm hiện thêm 15 sản phẩm tiếp theo
    renderProductList();
}

// --- 4. HÀM TÌM KIẾM TOÀN CỤC (TÌM CẢ SẢN PHẨM CHƯA HIỆN) VÀ CUỘN ---
function searchAndScroll() {
    const input = document.getElementById('searchCodeInput');
    const messageBox = document.getElementById('searchMessage');
    if (!input) return;
    
    const keyword = input.value.trim();

    if (!keyword) {
        if (messageBox) messageBox.innerText = "";
        resetSearchState();
        return;
    }

    // Tìm kiếm trong toàn bộ dữ liệu gốc (kể cả sản phẩm nằm sâu chưa được render)
    const foundIndex = allProductsData.findIndex(item => item.id === keyword);

    if (foundIndex !== -1) {
        // Nếu sản phẩm nằm ở vị trí vượt quá số lượng đang hiển thị, tự động tăng số lượng hiển thị lên để bao trùm nó
        if (foundIndex >= displayedCount) {
            displayedCount = foundIndex + 5; // Mở rộng danh sách đủ để chứa sản phẩm này
            renderProductList();
        }

        if (messageBox) messageBox.innerText = "";

        input.blur();
        isAutoScrolling = true;

        // Lấy card sản phẩm vừa được vẽ ra
        setTimeout(() => {
            const allCards = document.querySelectorAll('.product-card');
            let targetCard = null;
            allCards.forEach(card => {
                if (card.getAttribute('data-id') === keyword) {
                    targetCard = card;
                }
            });

            // Xóa hiệu ứng cũ
            allCards.forEach(card => {
                card.classList.remove('product-highlight', 'product-dimmed');
            });

            if (targetCard) {
                targetCard.classList.add('product-highlight');
                allCards.forEach(card => {
                    if (card !== targetCard) {
                        card.classList.add('product-dimmed');
                    }
                });

                targetCard.scrollIntoView({ behavior: 'auto', block: 'center' });
            }

            setTimeout(() => {
                isAutoScrolling = false;
            }, 800);
        }, 50);

    } else {
        // KHÔNG TÌM THẤY: In thông báo lên giao diện
        if (messageBox) {
            messageBox.innerText = `Mã ${keyword} này chưa có nha`;
            
            setTimeout(() => {
                if (messageBox.innerText === `Mã ${keyword} này chưa có nha`) {
                    messageBox.innerText = "";
                }
            }, 3000);
        }
    }
}

// --- 5. HÀM RESET TRẠNG THÁI ---
function resetSearchState() {
    const input = document.getElementById('searchCodeInput');
    if (input) input.value = "";
    
    const messageBox = document.getElementById('searchMessage');
    if (messageBox) messageBox.innerText = "";
    
    const allCards = document.querySelectorAll('.product-card');
    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });
}

// --- 6. HÀM CUỘN NGƯỢC LÊN Ô TÌM KIẾM ---
function scrollToSearch() {
    const input = document.getElementById('searchCodeInput');
    isAutoScrolling = true;

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });

    setTimeout(() => {
        isAutoScrolling = false;
        if (input) {
            input.focus();
        }
    }, 500);
}

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    initProducts();

    const input = document.getElementById('searchCodeInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAndScroll();
            }
        });

        input.addEventListener('input', (e) => {
            const keyword = e.target.value.trim();
            if (keyword === "") {
                searchAndScroll(); 
            }
        });
    }

    window.addEventListener('scroll', () => {
        const input = document.getElementById('searchCodeInput');
        const btn = document.getElementById('backToTopBtn');

        if (btn) {
            if (window.scrollY > 300) {
                btn.classList.add('show');
            } else {
                btn.classList.remove('show');
            }
        }

        if (!isAutoScrolling && input && input.value.trim() !== "") {
            resetSearchState();
        }
    });
});