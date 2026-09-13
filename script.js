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
            listContainer.innerHTML = `<p style="text-align: center; color: #784212; padding: 20px;">Chưa có sản phẩm nào </p>`;
            return;
        }

        let products = data.map(item => ({
            id: String(item.ID).trim(),
            numericId: Number(item.ID) || 0,
            title: item['Tên Sản Phẩm'],
            image: item['Ảnh Sản Phẩm'],
            link: item['Link Shope']
        }));

        products.sort((a, b) => b.numericId - a.numericId);

        let html = '';
        products.forEach((item, index) => {
            const isReverse = index % 2 !== 0;
            const cardClass = isReverse ? 'product-card reverse' : 'product-card';

            // Gắn data-id chính xác tuyệt đối để dùng cho việc tìm kiếm
            html += `
                <a href="${item.link}" target="_blank" class="${cardClass}" data-id="${item.id}" style="text-decoration: none; -webkit-tap-highlight-color: transparent; transition: transform 0.1s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <!-- Nửa ảnh (50%) -->
                    <div class="card-image">
                        <img src="${item.image}" alt="">
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

// --- 3. HÀM TÌM KIẾM VÀ CUỘN (HIỂN THỊ THÔNG BÁO LÊN GIAO DIỆN, CHỐNG CHẶN BỞI MESSENGER) ---
function searchAndScroll() {
    const input = document.getElementById('searchCodeInput');
    const messageBox = document.getElementById('searchMessage'); // Thẻ hiển thị thông báo trên web
    if (!input) return;
    
    const keyword = input.value.trim();
    const allCards = document.querySelectorAll('.product-card');

    if (!keyword) {
        if (messageBox) messageBox.innerText = "";
        resetSearchState();
        return;
    }

    let targetCard = null;
    allCards.forEach(card => {
        if (card.getAttribute('data-id') === keyword) {
            targetCard = card;
        }
    });

    // Xóa hiệu ứng cũ trên tất cả các ô
    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });

    if (targetCard) {
        // Xóa thông báo lỗi trước đó nếu tìm thấy sản phẩm
        if (messageBox) messageBox.innerText = "";

        input.blur();
        isAutoScrolling = true;

        // Bật ngay lập tức hiệu ứng sáng/mờ
        targetCard.classList.add('product-highlight');
        allCards.forEach(card => {
            if (card !== targetCard) {
                card.classList.add('product-dimmed');
            }
        });

        // Nhảy thẳng đến sản phẩm lập tức (bằng 'auto' để không bị nghẽn lệnh)
        targetCard.scrollIntoView({ behavior: 'auto', block: 'center' });

        // Mở khóa cờ cuộn
        setTimeout(() => {
            isAutoScrolling = false;
        }, 800);
    } else {
        // KHÔNG TÌM THẤY: In thẳng chữ lên giao diện web (Trình duyệt Messenger không thể chặn được)
        if (messageBox) {
            messageBox.innerText = `Mã ${keyword} này chưa có nha`;
            
            // Tự động xóa thông báo sau 3 giây cho đỡ rối mắt
            setTimeout(() => {
                if (messageBox.innerText === `Mã ${keyword} này chưa có nha`) {
                    messageBox.innerText = "";
                }
            }, 3000);
        }
    }
}

// --- 4. HÀM RESET TRẠNG THÁI ---
function resetSearchState() {
    const input = document.getElementById('searchCodeInput');
    if (input) {
        input.value = "";
    }
    
    const messageBox = document.getElementById('searchMessage');
    if (messageBox) {
        messageBox.innerText = "";
    }
    
    const allCards = document.querySelectorAll('.product-card');
    allCards.forEach(card => {
        card.classList.remove('product-highlight', 'product-dimmed');
    });
}

// --- 5. HÀM CUỘN NGƯỢC LÊN Ô TÌM KIẾM (CHO NÚT NỔI) ---
function scrollToSearch() {
    const input = document.getElementById('searchCodeInput');
    if (input) {
        // Cuộn mượt lên đầu trang
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Tự động focus vào ô nhập mã để khách gõ tiếp
        setTimeout(() => {
            input.focus();
        }, 300);
    }
}

// Khởi chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    renderProducts();

    const input = document.getElementById('searchCodeInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchAndScroll();
            }
        });
    }

    // Xử lý sự kiện cuộn trang chung
    window.addEventListener('scroll', () => {
        const input = document.getElementById('searchCodeInput');
        const btn = document.getElementById('backToTopBtn');

        // Kiểm soát hiện/ẩn nút nổi (xuống quá 300px thì hiện)
        if (btn) {
            if (window.scrollY > 300) {
                btn.classList.add('show');
            } else {
                btn.classList.remove('show');
            }
        }

        // Reset trạng thái tìm kiếm nếu người dùng tự lướt tay thủ công
        if (!isAutoScrolling && input && input.value.trim() !== "") {
            resetSearchState();
        }
    });
});