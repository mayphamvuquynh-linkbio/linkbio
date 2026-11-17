// Tự động commit + đẩy lên GitHub mỗi khi bạn lưu file (Ctrl+S).
//
// Cách dùng:
//   node scripts/auto-push.js           # chạy nền, theo dõi file, lưu là tự đẩy
//   node scripts/auto-push.js --once    # đẩy ngay 1 lần rồi thoát
//   node scripts/auto-push.js --dry     # chỉ in ra việc sẽ làm, KHÔNG commit/đẩy (dùng để thử)
//
// An toàn:
//   - Chờ DEBOUNCE_MS sau lần lưu cuối mới đẩy (lưu liên tục chỉ đẩy 1 lần).
//   - Kiểm tra cú pháp script.js, scripts/*.js và products.json trước khi đẩy;
//     file hỏng thì KHÔNG đẩy để trang thật không bị lỗi.
//   - Tự "pull --rebase" trước khi đẩy (vì GitHub Action cũng commit products.json).
//   - Nếu bị xung đột thì hủy và báo lỗi, KHÔNG ép đẩy (không dùng --force).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEBOUNCE_MS = 4000;
const IGNORED_TOP_DIRS = new Set(['.git', '.claude', '.vscode', 'node_modules', 'Dữ liệu']);
const JS_FILES_TO_CHECK = ['script.js'];

const DRY = process.argv.includes('--dry');
const ONCE = process.argv.includes('--once');

function log(message) {
    const time = new Date().toLocaleTimeString('vi-VN');
    console.log('[' + time + '] ' + message);
}

function git(args) {
    return execFileSync('git', ['-c', 'core.quotepath=false'].concat(args), {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function gitError(error) {
    return String((error.stderr || error.stdout || error.message) || error).trim();
}

// Trả về lỗi (chuỗi) nếu file có vấn đề, hoặc null nếu ổn
function validateFiles() {
    const jsFiles = JS_FILES_TO_CHECK.slice();
    const scriptsDir = path.join(ROOT, 'scripts');
    if (fs.existsSync(scriptsDir)) {
        fs.readdirSync(scriptsDir)
            .filter(name => name.endsWith('.js'))
            .forEach(name => jsFiles.push(path.join('scripts', name)));
    }

    for (const file of jsFiles) {
        if (!fs.existsSync(path.join(ROOT, file))) continue;
        try {
            execFileSync(process.execPath, ['--check', file], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
            return 'Lỗi cú pháp trong ' + file + ':\n' + gitError(error);
        }
    }

    const productsFile = path.join(ROOT, 'products.json');
    if (fs.existsSync(productsFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
            if (!data || !Array.isArray(data.products) || data.products.length === 0) {
                return 'products.json không có sản phẩm nào.';
            }
        } catch (error) {
            return 'products.json không phải JSON hợp lệ: ' + error.message;
        }
    }
    return null;
}

function buildMessage(statusLines) {
    const files = statusLines.map(line =>
        line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, '').split('/').pop());
    const shown = files.slice(0, 3).join(', ');
    const more = files.length > 3 ? ' (+' + (files.length - 3) + ' file)' : '';
    return 'cap nhat: ' + shown + more;
}

function syncAndPush() {
    const status = git(['status', '--porcelain']);
    if (!status) {
        log('Không có thay đổi nào để đẩy.');
        return;
    }
    const lines = status.split('\n');

    const problem = validateFiles();
    if (problem) {
        log('⚠️  KHÔNG đẩy lên GitHub. ' + problem);
        return;
    }

    const message = buildMessage(lines);
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    let hasUpstream = true;
    try { git(['rev-parse', '--abbrev-ref', '@{u}']); } catch (e) { hasUpstream = false; }

    if (DRY) {
        log('[DRY-RUN] Sẽ làm: git add -A');
        log('[DRY-RUN] Sẽ làm: git commit -m "' + message + '"');
        log('[DRY-RUN] Sẽ làm: git pull --rebase, rồi git push' + (hasUpstream ? '' : ' -u origin ' + branch));
        log('[DRY-RUN] ' + lines.length + ' file thay đổi:');
        lines.forEach(line => console.log('    ' + line));
        return;
    }

    try {
        git(['add', '-A']);
        git(['commit', '-m', message]);
    } catch (error) {
        log('⚠️  Commit lỗi: ' + gitError(error));
        return;
    }

    if (hasUpstream) {
        try {
            git(['pull', '--rebase']);
        } catch (error) {
            try { git(['rebase', '--abort']); } catch (e) { /* bỏ qua */ }
            log('⚠️  Xung đột khi đồng bộ với GitHub, đã hủy. Commit vẫn nằm trên máy, chưa đẩy.\n' + gitError(error));
            return;
        }
    }

    try {
        git(hasUpstream ? ['push'] : ['push', '-u', 'origin', branch]);
        log('✅ Đã đẩy lên GitHub: ' + message);
    } catch (error) {
        log('⚠️  Đẩy lên GitHub lỗi (kiểm tra mạng/đăng nhập git): ' + gitError(error));
    }
}

// --- Chạy 1 lần (--once hoặc --dry) ---
if (ONCE || DRY) {
    syncAndPush();
    process.exit(0);
}

// --- Chế độ theo dõi ---
let timer = null;
let running = false;
let dirtyAgain = false;

function schedule() {
    if (running) { dirtyAgain = true; return; }
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
}

function run() {
    running = true;
    try {
        syncAndPush();
    } catch (error) {
        log('⚠️  Lỗi không mong muốn: ' + gitError(error));
    }
    running = false;
    if (dirtyAgain) {
        dirtyAgain = false;
        schedule();
    }
}

fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const topDir = filename.split(path.sep)[0];
    if (IGNORED_TOP_DIRS.has(topDir)) return;
    schedule();
});

log('Đang theo dõi thư mục: ' + ROOT);
log('Bấm Ctrl+S, sau ' + (DEBOUNCE_MS / 1000) + ' giây file sẽ tự được đẩy lên GitHub. (Ctrl+C để dừng)');
