// ============================================================
// GlowPath – Shape List & Animation Targets
// ============================================================

// ---- Shape List ----
function refreshShapeList() {
    const el = document.getElementById('shapeList');
    el.innerHTML = '';
    shapes.forEach(s => {
        const div = document.createElement('div');
        div.className = 'shape-item';
        let desc = '';
        if (s.type === 'line') desc = `Line #${s.id} (${s.x1},${s.y1})→(${s.x2},${s.y2})`;
        else if (s.type === 'polyline') desc = `Polyline #${s.id} (${s.points.length} pts)`;
        else if (s.type === 'curve') desc = `Curve #${s.id} (${s.points.length} pts)`;
        else if (s.type === 'circle') desc = `Circle #${s.id} r=${Math.round(s.r)}`;
        else if (s.type === 'rect') desc = `Rect #${s.id} ${s.w}×${s.h}`;
        else if (s.type === 'arc') desc = `Arc #${s.id}`;
        else if (s.type === 'text') desc = `Text #${s.id} "${s.content.slice(0, 20)}${s.content.length > 20 ? '…' : ''}"`;
        else if (s.type === 'image') desc = `Image #${s.id} ${s.w}×${s.h}`;
        div.innerHTML = `<span>${desc}</span><button class="del-btn" onclick="deleteShape(${s.id})">✕</button>`;
        el.appendChild(div);
    });
}

window.deleteShape = function (id) {
    shapes = shapes.filter(s => s.id !== id);
    animations = animations.filter(a => a.shapeId !== id);
    refreshShapeList();
    refreshAnimTargets();
    refreshAnimList();
    renderFrame(getCurrentTime());
};

window.clearAllShapes = function () {
    shapes = [];
    animations = [];
    refreshShapeList();
    refreshAnimTargets();
    refreshAnimList();
    renderFrame(getCurrentTime());
};

// ---- Anim Target Dropdown ----
function refreshAnimTargets() {
    const sel = document.getElementById('animTarget');
    const prev = sel.value;
    sel.innerHTML = '';
    shapes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        if (s.type === 'line') opt.textContent = `Line #${s.id}`;
        else if (s.type === 'polyline') opt.textContent = `Polyline #${s.id}`;
        else if (s.type === 'curve') opt.textContent = `Curve #${s.id}`;
        else if (s.type === 'circle') opt.textContent = `Circle #${s.id}`;
        else if (s.type === 'rect') opt.textContent = `Rect #${s.id}`;
        else if (s.type === 'arc') opt.textContent = `Arc #${s.id}`;
        else if (s.type === 'text') return; // text shapes can't be animation targets
        else if (s.type === 'image') return; // image shapes can't be animation targets
        sel.appendChild(opt);
    });
    if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
    updateDirectionOptions();
}

// Update direction dropdown based on selected shape type
window.updateDirectionOptions = function () {
    const sel = document.getElementById('animDirection');
    const shapeId = parseInt(document.getElementById('animTarget').value);
    const shape = shapes.find(s => s.id === shapeId);
    if (!shape) return;
    const prevDir = sel.value;
    sel.innerHTML = '';
    if (shape.type === 'line' || shape.type === 'curve' || shape.type === 'polyline' || shape.type === 'arc') {
        sel.innerHTML = '<option value="outward">Outward (start → end)</option><option value="inward">Inward (end → start)</option>';
    } else {
        sel.innerHTML = '<option value="clockwise">Clockwise</option><option value="anticlockwise">Anticlockwise</option>';
    }
};

// Also listen via JS in case inline onchange doesn't fire
document.getElementById('animTarget').addEventListener('change', () => {
    updateDirectionOptions();
});
