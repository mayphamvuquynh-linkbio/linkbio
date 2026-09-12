// --- 1. BIẾN KẾT NỐI API GOOGLE SHEET ---
const SHEET_API_URL = 'https://api.sheetbest.com/sheets/ba7761b0-8931-4778-b978-cc21d71cf1c2';

// Biến cờ kiểm soát trạng thái cuộn tự động
let isAutoScrolling = false;

// --- 2. HÀM TẢI DỮ LIỆU TỪ GOOGLE SHEET VÀ HIỂN THỊ ---
async function renderProducts() {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;

    listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Đang tải sản phẩm...</p>`;

    try {
        const response = await fetch(SHEET_API_URL);
        const data = await response.json();

        if (!data || data.length === 0) {
            listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Chưa có sản phẩm nào trong Google Sheet.</p>`;
            return;
        }

        // Chuyển đổi dữ liệu từ Sheet sang cấu trúc chuẩn và sắp xếp mã sản phẩm từ lớn đến bé (mã mới lên đầu)
        let products = data.map(item => ({
            id: Number(item.id),
            title: item['tên sản phẩm'],
            image: item['ảnh sản phẩm'],
            link: item['linkshopee']
        }));

        products.sort((a, b) => b.id - a.id);

        let html = '';
        products.forEach((item, index) => {
            const isReverse = index % 2 !== 0;
            const cardClass = isReverse ? 'product-card reverse' : 'product-card';

            html += `
                <a href="${item.link}" target="_blank" id="card-${item.id}" class="${cardClass}" data-id="${item.id}" style="text-decoration: none; -webkit-tap-highlight-color: transparent; transition: transform 0.1s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <!-- Nửa ảnh (50%) -->
                    <div class="card-image">
                        <img src="${item.image}" alt="Mã ${item.id}">
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

    } catch (error) {
        console.error('Lỗi khi tải dữ liệu:', error);
        listContainer.innerHTML = `<p style="text-align: center; color: red; padding: 20px;">Không thể tải dữ liệu sản phẩm từ Google Sheet.</p>`;
    }
}

// --- 3. HÀM TÌM KIẾM VÀ CUỘN (KHI BẤM ENTER HOẶC NÚT TÌM) ---
function searchAndScroll() {
    const input = document.getElementById('searchCodeInput');
    if (!input) return;
    
    const keyword = input.value.trim();
    const allCards = document.querySelectorAll('.product-card');

    if (!keyword) {
        resetSearchState();
        return;
    }

    const targetCard = document.getElementById(`card-${keyword}`);

    // Xóa hiệu ứng cũ trên tất cả các ô
    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });

    if (targetCard) {
        // 1. Tự động ẩn bàn phím điện thoại
        input.blur();

        // 2. Bật cờ khóa sự kiện cuộn
        isAutoScrolling = true;

        // 3. Làm nổi bật sản phẩm tìm thấy và làm mờ các ô khác
        targetCard.classList.add('product-highlight');
        allCards.forEach(card => {
            if (card !== targetCard) {
                card.classList.add('product-dimmed');
            }
        });

        // 4. Tự động cuộn mượt mà đến ô sản phẩm đó
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Mở khóa lại cờ cuộn sau khi hoàn tất hiệu ứng cuộn
        setTimeout(() => {
            isAutoScrolling = false;
        }, 800);
    } else {
        alert(`Không tìm thấy sản phẩm có mã số: ${keyword}`);
    }
}

// --- 4. HÀM RESET TRẠNG THÁI SẢN PHẨM VÀ Ô TÌM KIẾM ---
function resetSearchState() {
    const input = document.getElementById('searchCodeInput');
    if (input) {
        input.value = ""; // Xóa trắng ô tìm kiếm
    }
    
    const allCards = document.querySelectorAll('.product-card');
    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });
}

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();

    const input = document.getElementById('searchCodeInput');
    if (input) {
        // Bắt sự kiện nhấn phím Enter trên điện thoại/máy tính
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAndScroll(); // Đã sửa lại gọi đúng hàm searchAndScroll()
            }
        });
    }

    // Lắng nghe sự kiện người dùng tự cuộn trang
    window.addEventListener('scroll', () => {
        const input = document.getElementById('searchCodeInput');
        if (!isAutoScrolling && input && input.value.trim() !== "") {
            resetSearchState();
        }
    });
});