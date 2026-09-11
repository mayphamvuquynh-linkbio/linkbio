// --- 1. DỮ LIỆU SẢN PHẨM (VS Code sẽ báo đỏ ngay khi bạn gõ trùng khóa ID bên dưới) ---

/** @type {Record<number, { title: string, image: string, link: string }>} */
const productsObj = {
    108: {
        title: "Váy Babydoll Bồng Bềnh Tay Bèo Nhún Dễ Thương",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=400&auto=format&fit=crop",
        link: "https://s.shopee.vn/9AOXyT4sBI"
    },
    107: {
        title: "Set váy nữ, Đầm 2 dây kẻ caro bánh bèo, Áo khoác cardigan dáng xòe",
        image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=400&auto=format&fit=crop",
        link: "https://shope.ee/link_affiliate_cua_ban_107"
    },
    106: {
        title: "Set váy nữ, Đầm 2 dây kẻ caro bánh bèo, Áo khoác cardigan dáng xòe",
        image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=400&auto=format&fit=crop",
        link: "https://shope.ee/link_affiliate_cua_ban_107"
    },
};

// Tự động chuyển đổi thành mảng để web hoạt động mượt mà bình thường
const products = Object.keys(productsObj).map(id => ({
    id: Number(id),
    ...productsObj[id]
}));

// Biến cờ kiểm soát trạng thái cuộn tự động
let isAutoScrolling = false;

// --- 2. HÀM HIỂN THỊ VÀ SẮP XẾP SẢN PHẨM ---
function renderProducts() {
    const listContainer = document.getElementById('product-list');
    if (!listContainer) return;

    // Sắp xếp mã sản phẩm từ lớn đến bé (mã mới lên đầu)
    products.sort((a, b) => b.id - a.id);

    let html = '';
    products.forEach((item, index) => {
        const isReverse = index % 2 !== 0;
        const cardClass = isReverse ? 'product-card reverse' : 'product-card';

        // Tối ưu hóa thẻ a: Đã lược bỏ các sự kiện rườm rà, nhường trọn vẹn cho CSS xử lý mượt mà
        html += `
            <a href="${item.link}" target="_blank" id="card-${item.id}" class="${cardClass}" data-id="${item.id}" style="text-decoration: none; -webkit-tap-highlight-color: transparent;">
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
        // 1. Tự động ẩn bàn phím điện thoại (bằng cách bỏ focus khỏi ô input)
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
        // Bắt sự kiện nhấn phím Enter chuẩn hiện đại bằng keydown
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAndScroll();
            }
        });

        // Tự động khôi phục trạng thái ban đầu nếu người dùng bấm dấu X xóa sạch chữ trong ô input
        input.addEventListener('input', (e) => {
            if (e.target.value.trim() === "") {
                resetSearchState();
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