// ============================================================
// GlowPath – Initialization & UI Bindings
// ============================================================

// ---- Theme Toggle ----
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    document.getElementById('themeToggle').textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('glowpath-theme', isDark ? 'dark' : 'light');
}

// Restore saved theme
(function () {
    const saved = localStorage.getItem('glowpath-theme');
    if (saved === 'dark') {
        document.body.classList.add('dark');
        document.getElementById('themeToggle').textContent = '☀️';
    }
})();

// ---- UI Event Bindings ----
document.getElementById('laserColor').addEventListener('input', e => {
    document.getElementById('laserColorHex').textContent = e.target.value;
});

document.getElementById('bgColor').addEventListener('input', e => {
    document.getElementById('bgColorHex').textContent = e.target.value;
    if (!playing) renderFrame(getCurrentTime());
});

document.getElementById('showScale').addEventListener('change', () => {
    drawRulers();
    if (!playing) renderFrame(getCurrentTime());
});

document.getElementById('gifQuality').addEventListener('input', e => {
    document.getElementById('gifQualityVal').textContent = e.target.value;
});

// Timeline scrub
document.getElementById('timeline').addEventListener('input', e => {
    if (playing) return;
    const t = parseFloat(e.target.value) / 1000;
    document.getElementById('timeDisplay').textContent = t.toFixed(3) + 's';
    renderFrame(t);
});

// Update timeline max when duration changes
document.getElementById('totalDuration').addEventListener('change', () => {
    document.getElementById('timeline').max = getTotalDuration() * 1000;
});

// Show/hide GIF quality row based on format
document.getElementById('exportFormat').addEventListener('change', e => {
    document.getElementById('gifQualityRow').style.display = e.target.value === 'gif' ? '' : 'none';
});
// Init visibility
document.getElementById('gifQualityRow').style.display = 'none';

// Arc bulge slider display
document.getElementById('arcBulge').addEventListener('input', e => {
    document.getElementById('arcBulgeVal').textContent = parseFloat(e.target.value).toFixed(2);
});

// ---- Canvas Resize (fit to viewport) ----
function resizeCanvas() {
    const main = document.getElementById('main');
    const rulerSize = 28;
    const rulerPad = 20; // extra padding for edge labels
    const maxSize = Math.min(main.clientWidth - 32, main.clientHeight - 80);
    const canvasDisplaySize = Math.min(maxSize - rulerSize * 2 - rulerPad * 2, 768);
    const totalSize = canvasDisplaySize + rulerSize * 2 + rulerPad * 2;
    canvas.style.width = canvasDisplaySize + 'px';
    canvas.style.height = canvasDisplaySize + 'px';
    canvas.style.position = 'absolute';
    canvas.style.left = (rulerSize + rulerPad) + 'px';
    canvas.style.top = (rulerSize + rulerPad) + 'px';
    const rc = document.getElementById('rulerCanvas');
    rc.width = totalSize * (window.devicePixelRatio || 1);
    rc.height = totalSize * (window.devicePixelRatio || 1);
    rc.style.width = totalSize + 'px';
    rc.style.height = totalSize + 'px';
    const wrap = document.getElementById('canvasWrap');
    wrap.style.width = totalSize + 'px';
    wrap.style.height = totalSize + 'px';
    drawRulers();
}
window.addEventListener('resize', resizeCanvas);

// ---- Init ----
resizeCanvas();
renderFrame(0);
document.getElementById('timeline').max = getTotalDuration() * 1000;
