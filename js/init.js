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
    document.getElementById('arcBulgeVal').textContent = e.target.value;
});

// ---- Canvas Resize (fit to viewport) ----
function resizeCanvas() {
    const main = document.getElementById('main');
    const maxSize = Math.min(main.clientWidth - 32, main.clientHeight - 80);
    const size = Math.min(maxSize, 768);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
}
window.addEventListener('resize', resizeCanvas);

// ---- Init ----
resizeCanvas();
renderFrame(0);
document.getElementById('timeline').max = getTotalDuration() * 1000;
