// ============================================================
// GlowPath – app.js
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ---- State ----
let shapes = [];       // {type, id, ...params}
let animations = [];   // {id, shapeId, direction, startTime, velocity, color, glowRadius, pointerSize}
let currentTool = 'line';
let shapeIdCounter = 0;
let animIdCounter = 0;

// Drawing state
let isDrawing = false;
let drawStart = null;
let curvePoints = []; // for freehand curve tool

// Playback state
let playing = false;
let playStartReal = 0;  // performance.now() when play started
let playOffset = 0;      // time offset from timeline scrub
let animFrameId = null;
let exportCancelled = false;

// ---- Helpers ----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
        x: clamp(Math.round((e.clientX - rect.left) * scaleX), 0, W),
        y: clamp(Math.round((e.clientY - rect.top) * scaleY), 0, H)
    };
}

function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

function getTotalDuration() {
    return parseFloat(document.getElementById('totalDuration').value) || 5;
}

function getFPS() {
    return parseInt(document.getElementById('fps').value) || 30;
}

function getBgColor() {
    return document.getElementById('bgColor').value;
}

function isLightColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ---- Tool Selection ----
window.setTool = function (tool) {
    currentTool = tool;
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    const textPanel = document.getElementById('textPanel');
    if (textPanel) textPanel.style.display = (tool === 'text') ? '' : 'none';
    const imagePanel = document.getElementById('imagePanel');
    if (imagePanel) imagePanel.style.display = (tool === 'image') ? '' : 'none';
    canvas.style.cursor = (tool === 'text' || tool === 'image') ? 'crosshair' : (tool === 'line' || tool === 'curve' || tool === 'circle' || tool === 'rect') ? 'crosshair' : 'default';
};

// ---- Drawing ----
canvas.addEventListener('mousedown', e => {
    if (playing) return;
    if (currentTool === 'text' || currentTool === 'image') return; // these use click, not drag
    isDrawing = true;
    drawStart = canvasCoords(e);
    if (currentTool === 'curve') {
        curvePoints = [drawStart];
    }
});

canvas.addEventListener('mousemove', e => {
    if (!isDrawing || playing) return;
    const cur = canvasCoords(e);
    if (currentTool === 'curve') {
        // Only add point if moved enough (avoid duplicates)
        const last = curvePoints[curvePoints.length - 1];
        if (Math.hypot(cur.x - last.x, cur.y - last.y) >= 3) {
            curvePoints.push(cur);
        }
        renderFrame(getCurrentTime());
        // Draw preview of curve so far
        ctx.save();
        ctx.strokeStyle = document.getElementById('strokeColor').value;
        ctx.lineWidth = parseInt(document.getElementById('strokeWidth').value);
        ctx.setLineDash([]);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(curvePoints[0].x, curvePoints[0].y);
        for (let i = 1; i < curvePoints.length; i++) {
            ctx.lineTo(curvePoints[i].x, curvePoints[i].y);
        }
        ctx.stroke();
        ctx.restore();
        return;
    }
    renderFrame(getCurrentTime());
    // Draw preview
    ctx.save();
    ctx.strokeStyle = document.getElementById('strokeColor').value;
    ctx.lineWidth = parseInt(document.getElementById('strokeWidth').value);
    ctx.setLineDash([6, 4]);
    if (currentTool === 'line') {
        ctx.beginPath();
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
    } else if (currentTool === 'circle') {
        const r = dist(drawStart, cur);
        ctx.beginPath();
        ctx.arc(drawStart.x, drawStart.y, r, 0, Math.PI * 2);
        ctx.stroke();
    } else if (currentTool === 'rect') {
        ctx.strokeRect(drawStart.x, drawStart.y, cur.x - drawStart.x, cur.y - drawStart.y);
    }
    ctx.restore();
});

canvas.addEventListener('mouseup', e => {
    if (!isDrawing || playing) return;
    isDrawing = false;
    const end = canvasCoords(e);
    const color = document.getElementById('strokeColor').value;
    const width = parseInt(document.getElementById('strokeWidth').value);
    const id = ++shapeIdCounter;

    if (currentTool === 'curve') {
        if (curvePoints.length >= 2) {
            // Simplify the curve: Douglas-Peucker with tolerance
            const controlPts = simplifyPoints(curvePoints, 2);
            if (controlPts.length >= 2) {
                // Resample the smooth bezier curve into dense points for animation
                const smoothPts = controlPts.length >= 3 ? resampleSmoothCurve(controlPts, 12) : controlPts.slice();
                // Pre-compute cumulative distances for fast lookup
                const dists = [0];
                for (let i = 1; i < smoothPts.length; i++) {
                    dists.push(dists[i - 1] + Math.hypot(smoothPts[i].x - smoothPts[i - 1].x, smoothPts[i].y - smoothPts[i - 1].y));
                }
                const arrow = document.getElementById('arrowAtEnd').checked;
                shapes.push({ type: 'curve', id, controlPts, points: smoothPts, dists, color, width, arrow });
            }
        }
        curvePoints = [];
    } else if (currentTool === 'line') {
        if (dist(drawStart, end) < 3) return;
        const arrow = document.getElementById('arrowAtEnd').checked;
        shapes.push({ type: 'line', id, x1: drawStart.x, y1: drawStart.y, x2: end.x, y2: end.y, color, width, arrow });
    } else if (currentTool === 'circle') {
        const r = dist(drawStart, end);
        if (r < 3) return;
        shapes.push({ type: 'circle', id, cx: drawStart.x, cy: drawStart.y, r, color, width });
    } else if (currentTool === 'rect') {
        const w = Math.abs(end.x - drawStart.x), h = Math.abs(end.y - drawStart.y);
        if (w < 3 && h < 3) return;
        const rx = Math.min(drawStart.x, end.x), ry = Math.min(drawStart.y, end.y);
        shapes.push({ type: 'rect', id, x: rx, y: ry, w, h, color, width });
    }

    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
});

canvas.addEventListener('mouseleave', () => {
    if (isDrawing && !playing) {
        isDrawing = false;
        curvePoints = [];
        renderFrame(getCurrentTime());
    }
});

// ---- Text Tool: click-to-place ----
canvas.addEventListener('click', e => {
    if (playing) return;

    if (currentTool === 'text') {
        const pos = canvasCoords(e);
        const rawText = (document.getElementById('textContent').value || '').trim();
        if (!rawText) return;
        const fontSize = parseInt(document.getElementById('textFontSize').value) || 32;
        const color = document.getElementById('textColor').value;
        const id = ++shapeIdCounter;

        // Check if it's LaTeX (wrapped in $$...$$)
        const latexMatch = rawText.match(/^\$\$([\s\S]+)\$\$$/);
        const isLatex = !!latexMatch;
        const content = isLatex ? latexMatch[1] : rawText;

        const textShape = { type: 'text', id, x: pos.x, y: pos.y, content, isLatex, fontSize, color };

        if (isLatex) {
            // Render KaTeX to image for canvas drawing
            renderKatexToImage(content, fontSize, color).then(img => {
                textShape.image = img;
                textShape.imgW = img.width;
                textShape.imgH = img.height;
                shapes.push(textShape);
                refreshShapeList();
                refreshAnimTargets();
                renderFrame(getCurrentTime());
            });
        } else {
            shapes.push(textShape);
            refreshShapeList();
            refreshAnimTargets();
            renderFrame(getCurrentTime());
        }
    } // end text tool

    // ---- Image Tool: click-to-place ----
    if (currentTool === 'image') {
        if (!window._pendingImage) return;
        const pos = canvasCoords(e);
        const pw = parseInt(document.getElementById('imgPlaceW').value) || 200;
        const ph = parseInt(document.getElementById('imgPlaceH').value) || 200;
        const opacity = parseFloat(document.getElementById('imgOpacity').value);
        const id = ++shapeIdCounter;

        shapes.push({
            type: 'image', id,
            x: pos.x - pw / 2, y: pos.y - ph / 2,
            w: pw, h: ph,
            image: window._pendingImage,
            src: window._pendingImageSrc,
            opacity: isNaN(opacity) ? 1 : opacity
        });
        refreshShapeList();
        refreshAnimTargets();
        renderFrame(getCurrentTime());
    }
});

// ---- Image Upload Handler ----
(function () {
    const fileInput = document.getElementById('imageFileInput');
    const previewInfo = document.getElementById('imagePreviewInfo');
    const thumb = document.getElementById('imagePreviewThumb');
    const wInput = document.getElementById('imgPlaceW');
    const hInput = document.getElementById('imgPlaceH');
    const keepAspect = document.getElementById('imgKeepAspect');

    let naturalW = 0, naturalH = 0;

    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (ev) {
            const dataUrl = ev.target.result;
            const img = new Image();
            img.onload = function () {
                window._pendingImage = img;
                window._pendingImageSrc = dataUrl;
                naturalW = img.naturalWidth;
                naturalH = img.naturalHeight;

                // Fit within 400px max for default placement
                let pw = naturalW, ph = naturalH;
                const maxDim = 400;
                if (pw > maxDim || ph > maxDim) {
                    const scale = maxDim / Math.max(pw, ph);
                    pw = Math.round(pw * scale);
                    ph = Math.round(ph * scale);
                }
                wInput.value = pw;
                hInput.value = ph;

                thumb.src = dataUrl;
                previewInfo.style.display = '';
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    });

    wInput.addEventListener('input', () => {
        if (keepAspect.checked && naturalW > 0) {
            hInput.value = Math.round((parseInt(wInput.value) || 1) * naturalH / naturalW);
        }
    });
    hInput.addEventListener('input', () => {
        if (keepAspect.checked && naturalH > 0) {
            wInput.value = Math.round((parseInt(hInput.value) || 1) * naturalW / naturalH);
        }
    });
})();

// Render KaTeX formula to an Image via html2canvas
function renderKatexToImage(latex, fontSize, color) {
    return new Promise(async (resolve) => {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.fontSize = fontSize + 'px';
        container.style.color = color;
        container.style.display = 'inline-block';
        container.style.padding = '4px';
        document.body.appendChild(container);

        try {
            katex.render(latex, container, { throwOnError: false, displayMode: true });
        } catch (e) {
            // If katex fails, fallback to plain text
            container.textContent = latex;
        }

        await document.fonts.ready;

        try {
            const cvs = await html2canvas(container, {
                backgroundColor: null,
                scale: 2,
                logging: false
            });
            document.body.removeChild(container);
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = cvs.toDataURL();
        } catch (e) {
            // Fallback: render as plain text on canvas
            const rect = container.getBoundingClientRect();
            document.body.removeChild(container);
            const tc = document.createElement('canvas');
            const tctx = tc.getContext('2d');
            tctx.font = `${fontSize}px serif`;
            const m = tctx.measureText(latex);
            tc.width = Math.ceil(m.width) + 8;
            tc.height = fontSize + 8;
            tctx.font = `${fontSize}px serif`;
            tctx.fillStyle = color;
            tctx.textBaseline = 'top';
            tctx.fillText(latex, 4, 4);
            const fallbackImg = new Image();
            fallbackImg.onload = () => resolve(fallbackImg);
            fallbackImg.src = tc.toDataURL();
        }
    });
}

// ---- Shape List ----
function refreshShapeList() {
    const el = document.getElementById('shapeList');
    el.innerHTML = '';
    shapes.forEach(s => {
        const div = document.createElement('div');
        div.className = 'shape-item';
        let desc = '';
        if (s.type === 'line') desc = `Line #${s.id} (${s.x1},${s.y1})→(${s.x2},${s.y2})`;
        else if (s.type === 'curve') desc = `Curve #${s.id} (${s.points.length} pts)`;
        else if (s.type === 'circle') desc = `Circle #${s.id} r=${Math.round(s.r)}`;
        else if (s.type === 'rect') desc = `Rect #${s.id} ${s.w}×${s.h}`;
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
        else if (s.type === 'curve') opt.textContent = `Curve #${s.id}`;
        else if (s.type === 'circle') opt.textContent = `Circle #${s.id}`;
        else if (s.type === 'rect') opt.textContent = `Rect #${s.id}`;
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
    if (shape.type === 'line' || shape.type === 'curve') {
        sel.innerHTML = '<option value="outward">Outward (start → end)</option><option value="inward">Inward (end → start)</option>';
    } else {
        sel.innerHTML = '<option value="clockwise">Clockwise</option><option value="anticlockwise">Anticlockwise</option>';
    }
};

// Also listen via JS in case inline onchange doesn't fire
document.getElementById('animTarget').addEventListener('change', () => {
    updateDirectionOptions();
});

// ---- Shape path helpers ----
function getShapePerimeter(shape) {
    if (shape.type === 'line') return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    if (shape.type === 'curve') return shape.dists[shape.dists.length - 1];
    if (shape.type === 'circle') return 2 * Math.PI * shape.r;
    if (shape.type === 'rect') return 2 * (shape.w + shape.h);
    return 0;
}

// Get position along a circle at fraction t (0–1), clockwise from top
function circlePos(shape, t) {
    const angle = t * 2 * Math.PI - Math.PI / 2; // start from top
    return { x: shape.cx + shape.r * Math.cos(angle), y: shape.cy + shape.r * Math.sin(angle) };
}

// Get position along rect perimeter at fraction t (0–1), clockwise from top-left
function rectPos(shape, t) {
    const perim = 2 * (shape.w + shape.h);
    let d = t * perim;
    if (d <= shape.w) return { x: shape.x + d, y: shape.y }; // top
    d -= shape.w;
    if (d <= shape.h) return { x: shape.x + shape.w, y: shape.y + d }; // right
    d -= shape.h;
    if (d <= shape.w) return { x: shape.x + shape.w - d, y: shape.y + shape.h }; // bottom
    d -= shape.w;
    return { x: shape.x, y: shape.y + shape.h - d }; // left
}

// Get position along a curve at fraction t (0–1)
function curvePos(shape, t) {
    const totalLen = shape.dists[shape.dists.length - 1];
    const targetDist = t * totalLen;
    // Binary search for the segment
    let lo = 0, hi = shape.dists.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (shape.dists[mid] <= targetDist) lo = mid;
        else hi = mid;
    }
    const segStart = shape.dists[lo];
    const segEnd = shape.dists[hi];
    const segLen = segEnd - segStart;
    const frac = segLen > 0 ? (targetDist - segStart) / segLen : 0;
    return {
        x: shape.points[lo].x + (shape.points[hi].x - shape.points[lo].x) * frac,
        y: shape.points[lo].y + (shape.points[hi].y - shape.points[lo].y) * frac
    };
}

// Douglas-Peucker curve simplification
function simplifyPoints(pts, tolerance) {
    if (pts.length <= 2) return pts.slice();
    // Find the point farthest from the line between first and last
    let maxDist = 0, maxIdx = 0;
    const first = pts[0], last = pts[pts.length - 1];
    const dx = last.x - first.x, dy = last.y - first.y;
    const lenSq = dx * dx + dy * dy;
    for (let i = 1; i < pts.length - 1; i++) {
        let d;
        if (lenSq === 0) {
            d = Math.hypot(pts[i].x - first.x, pts[i].y - first.y);
        } else {
            const t = clamp(((pts[i].x - first.x) * dx + (pts[i].y - first.y) * dy) / lenSq, 0, 1);
            const px = first.x + t * dx, py = first.y + t * dy;
            d = Math.hypot(pts[i].x - px, pts[i].y - py);
        }
        if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolerance) {
        const left = simplifyPoints(pts.slice(0, maxIdx + 1), tolerance);
        const right = simplifyPoints(pts.slice(maxIdx), tolerance);
        return left.slice(0, -1).concat(right);
    }
    return [first, last];
}

// Draw a smooth curve through control points using quadratic bezier midpoint technique
function drawSmoothCurve(c, pts) {
    if (pts.length < 2) return;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
        c.lineTo(pts[1].x, pts[1].y);
    } else {
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i + 1].x) / 2;
            const my = (pts[i].y + pts[i + 1].y) / 2;
            c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        // Last segment to the final point
        const last = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        c.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
    }
    c.stroke();
}

// Resample a smooth quadratic bezier curve into dense points for animation
function resampleSmoothCurve(pts, stepsPerSeg) {
    if (pts.length < 3) return pts.slice();
    const steps = stepsPerSeg || 12;
    const result = [{ x: pts[0].x, y: pts[0].y }];
    for (let i = 1; i < pts.length - 1; i++) {
        const sx = result[result.length - 1].x, sy = result[result.length - 1].y;
        const cpx = pts[i].x, cpy = pts[i].y;
        const ex = (pts[i].x + pts[i + 1].x) / 2, ey = (pts[i].y + pts[i + 1].y) / 2;
        for (let t = 1; t <= steps; t++) {
            const u = t / steps;
            const inv = 1 - u;
            result.push({
                x: inv * inv * sx + 2 * inv * u * cpx + u * u * ex,
                y: inv * inv * sy + 2 * inv * u * cpy + u * u * ey
            });
        }
    }
    // Last segment: quadratic to final point
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const sx = result[result.length - 1].x, sy = result[result.length - 1].y;
    const segSteps = Math.max(4, Math.ceil(Math.hypot(last.x - sx, last.y - sy) / 4));
    for (let t = 1; t <= segSteps; t++) {
        const u = t / segSteps;
        const inv = 1 - u;
        result.push({
            x: inv * inv * sx + 2 * inv * u * prev.x + u * u * last.x,
            y: inv * inv * sy + 2 * inv * u * prev.y + u * u * last.y
        });
    }
    return result;
}

// ---- Laser Color Preview ----
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

// ---- Add Animation ----
window.addAnimation = function () {
    const shapeId = parseInt(document.getElementById('animTarget').value);
    if (!shapeId) return alert('Select a shape first.');
    const shape = shapes.find(s => s.id === shapeId);
    if (!shape) return alert('Shape not found.');

    const direction = document.getElementById('animDirection').value;
    const startTime = parseFloat(document.getElementById('animStart').value) || 0;
    const velocity = parseFloat(document.getElementById('animVelocity').value) || 200;
    const color = document.getElementById('laserColor').value;
    const glowRadius = parseInt(document.getElementById('glowRadius').value);
    const pointerSize = parseInt(document.getElementById('pointerSize').value);
    const vanishAtEnd = document.getElementById('vanishAtEnd').checked;

    animations.push({
        id: ++animIdCounter,
        shapeId,
        direction,
        startTime,
        velocity,
        color,
        glowRadius,
        pointerSize,
        vanishAtEnd
    });
    refreshAnimList();
};

function refreshAnimList() {
    const el = document.getElementById('animList');
    el.innerHTML = '';
    animations.forEach(a => {
        const div = document.createElement('div');
        div.className = 'anim-item';
        div.innerHTML = `<span>Line#${a.shapeId} ${a.direction} v=${a.velocity} t=${a.startTime}s${a.vanishAtEnd ? ' [vanish]' : ''}</span>
            <span style="display:inline-block;width:14px;height:14px;background:${a.color};border-radius:50%;"></span>
            <button class="del-btn" onclick="deleteAnim(${a.id})">✕</button>`;
        el.appendChild(div);
    });
}

window.deleteAnim = function (id) {
    animations = animations.filter(a => a.id !== id);
    refreshAnimList();
};

// ---- Rendering ----
// Draw an arrowhead on a canvas context at (tx,ty) pointing in direction (angle)
function drawArrowhead(c, tx, ty, angle, size, color) {
    c.save();
    c.translate(tx, ty);
    c.rotate(angle);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-size, -size * 0.45);
    c.lineTo(-size * 0.7, 0);
    c.lineTo(-size, size * 0.45);
    c.closePath();
    c.fill();
    c.restore();
}

function drawShape(s) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.setLineDash([]);
    if (s.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        if (s.arrow) {
            const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
            drawArrowhead(ctx, s.x2, s.y2, angle, Math.max(12, s.width * 5), s.color);
        }
    } else if (s.type === 'curve') {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        drawSmoothCurve(ctx, s.controlPts);
        if (s.arrow && s.points.length >= 2) {
            const p1 = s.points[s.points.length - 2], p2 = s.points[s.points.length - 1];
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            drawArrowhead(ctx, p2.x, p2.y, angle, Math.max(12, s.width * 5), s.color);
        }
    } else if (s.type === 'circle') {
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();
    } else if (s.type === 'rect') {
        ctx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'text') {
        if (s.isLatex && s.image) {
            ctx.drawImage(s.image, s.x - s.imgW / 2, s.y - s.imgH / 2);
        } else if (!s.isLatex) {
            ctx.font = `${s.fontSize}px sans-serif`;
            ctx.fillStyle = s.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.content, s.x, s.y);
        }
    } else if (s.type === 'image') {
        if (s.image) {
            ctx.save();
            ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
            ctx.drawImage(s.image, s.x, s.y, s.w, s.h);
            ctx.restore();
        }
    }
}

function drawLaserPointer(x, y, color, glowRadius, pointerSize) {
    // Outer glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
    grad.addColorStop(0.3, `rgba(${r},${g},${b},0.4)`);
    grad.addColorStop(0.6, `rgba(${r},${g},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Core bright dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, pointerSize * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, pointerSize, 0, Math.PI * 2);
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1.0;
}

function renderFrame(t) {
    // Clear with bg color
    ctx.fillStyle = getBgColor();
    ctx.fillRect(0, 0, W, H);

    // Draw grid (subtle)
    const bgIsLight = isLightColor(getBgColor());
    ctx.strokeStyle = bgIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    const gridStep = 64;
    for (let x = 0; x <= W; x += gridStep) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += gridStep) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Draw shapes
    shapes.forEach(drawShape);

    // Draw laser pointers
    animations.forEach(a => {
        const shape = shapes.find(s => s.id === a.shapeId);
        if (!shape) return;

        const elapsed = t - a.startTime;
        if (elapsed < 0) return;

        const perim = getShapePerimeter(shape);
        const travelDist = elapsed * a.velocity;

        let progress, isLoop;
        if (shape.type === 'line' || shape.type === 'curve') {
            progress = clamp(travelDist / perim, 0, 1);
            isLoop = false;
        } else {
            // circle/rect: loop continuously
            progress = (travelDist / perim) % 1;
            isLoop = true;
        }

        // Vanish at end (for lines/curves: at end; for loops: after one full revolution)
        if (a.vanishAtEnd) {
            if ((shape.type === 'line' || shape.type === 'curve') && travelDist / perim >= 1) return;
            if (shape.type !== 'line' && shape.type !== 'curve' && travelDist / perim >= 1) return;
        }

        // Reverse direction
        let effProgress = progress;
        if (a.direction === 'inward' || a.direction === 'anticlockwise') {
            effProgress = shape.type === 'line' ? 1 - progress : 1 - progress;
        }

        // Get position
        let px, py;
        if (shape.type === 'line') {
            px = shape.x1 + (shape.x2 - shape.x1) * effProgress;
            py = shape.y1 + (shape.y2 - shape.y1) * effProgress;
        } else if (shape.type === 'curve') {
            const pos = curvePos(shape, effProgress);
            px = pos.x; py = pos.y;
        } else if (shape.type === 'circle') {
            const pos = circlePos(shape, effProgress);
            px = pos.x; py = pos.y;
        } else if (shape.type === 'rect') {
            const pos = rectPos(shape, effProgress);
            px = pos.x; py = pos.y;
        }

        // Draw trail
        const rc = parseInt(a.color.slice(1, 3), 16);
        const gc = parseInt(a.color.slice(3, 5), 16);
        const bc = parseInt(a.color.slice(5, 7), 16);

        if (shape.type === 'line') {
            const trailLen = 0.15;
            const trailFrac = a.direction === 'outward' ? Math.max(0, effProgress - trailLen) : Math.min(1, effProgress + trailLen);
            const tx = shape.x1 + (shape.x2 - shape.x1) * trailFrac;
            const ty = shape.y1 + (shape.y2 - shape.y1) * trailFrac;
            const trailGrad = ctx.createLinearGradient(tx, ty, px, py);
            trailGrad.addColorStop(0, `rgba(${rc},${gc},${bc},0)`);
            trailGrad.addColorStop(1, `rgba(${rc},${gc},${bc},0.6)`);
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = a.pointerSize * 1.2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(px, py);
            ctx.stroke();
        } else if (shape.type === 'curve') {
            // Particle trail along curve
            const trailFrac = 0.1;
            const steps = 20;
            for (let i = 0; i < steps; i++) {
                const frac = i / steps;
                const sign = (a.direction === 'inward') ? 1 : -1;
                const tp = clamp(effProgress + sign * trailFrac * (1 - frac), 0, 1);
                const tpos = curvePos(shape, tp);
                const alpha = 0.25 * frac;
                ctx.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                ctx.beginPath();
                ctx.arc(tpos.x, tpos.y, a.pointerSize * (0.4 + 0.6 * frac), 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // Arc/rect trail
            const trailFrac = 0.08;
            const steps = 20;
            const trailDir = (a.direction === 'anticlockwise') ? 1 : -1;
            for (let i = 0; i < steps; i++) {
                const frac = i / steps;
                const tp = effProgress + trailDir * trailFrac * (1 - frac);
                const tpWrap = ((tp % 1) + 1) % 1;
                let tpx, tpy;
                if (shape.type === 'circle') {
                    const pos = circlePos(shape, tpWrap);
                    tpx = pos.x; tpy = pos.y;
                } else {
                    const pos = rectPos(shape, tpWrap);
                    tpx = pos.x; tpy = pos.y;
                }
                const alpha = 0.25 * frac;
                ctx.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                ctx.beginPath();
                ctx.arc(tpx, tpy, a.pointerSize * (0.4 + 0.6 * frac), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        drawLaserPointer(px, py, a.color, a.glowRadius, a.pointerSize);
    });
}

// ---- Playback ----
function getCurrentTime() {
    if (playing) {
        return playOffset + (performance.now() - playStartReal) / 1000;
    }
    return parseFloat(document.getElementById('timeline').value) / 1000;
}

function playLoop() {
    const t = getCurrentTime();
    const dur = getTotalDuration();
    if (t >= dur) {
        stopAnim();
        document.getElementById('timeline').value = dur * 1000;
        document.getElementById('timeDisplay').textContent = dur.toFixed(3) + 's';
        renderFrame(dur);
        return;
    }
    document.getElementById('timeline').value = t * 1000;
    document.getElementById('timeDisplay').textContent = t.toFixed(3) + 's';
    renderFrame(t);
    animFrameId = requestAnimationFrame(playLoop);
}

window.togglePlay = function () {
    if (playing) {
        // pause
        playing = false;
        playOffset = getCurrentTime();
        cancelAnimationFrame(animFrameId);
        document.querySelector('#playbar button').textContent = '▶';
    } else {
        // play
        const cur = parseFloat(document.getElementById('timeline').value) / 1000;
        if (cur >= getTotalDuration()) {
            playOffset = 0;
        } else {
            playOffset = cur;
        }
        playing = true;
        playStartReal = performance.now();
        document.querySelector('#playbar button').textContent = '⏸';
        playLoop();
    }
};

window.stopAnim = function () {
    playing = false;
    playOffset = 0;
    cancelAnimationFrame(animFrameId);
    document.querySelector('#playbar button').textContent = '▶';
    document.getElementById('timeline').value = 0;
    document.getElementById('timeDisplay').textContent = '0.000s';
    renderFrame(0);
};

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

// ---- GIF Export ----
window.doExport = function () {
    const format = document.getElementById('exportFormat').value;
    if (format === 'webm') exportWebM();
    else exportGIF();
};

// Show/hide GIF quality row based on format
document.getElementById('exportFormat').addEventListener('change', e => {
    document.getElementById('gifQualityRow').style.display = e.target.value === 'gif' ? '' : 'none';
});
// Init visibility
document.getElementById('gifQualityRow').style.display = 'none';

function getExportScale() {
    return parseInt(document.getElementById('exportScale').value);
}

// ---- WebM Export (smooth, high quality) ----
function exportWebM() {
    if (animations.length === 0) return alert('Add at least one animation first.');
    exportCancelled = false;
    const overlay = document.getElementById('exportOverlay');
    overlay.classList.add('show');
    document.getElementById('exportTitle').textContent = 'Exporting WebM…';
    const progressEl = document.getElementById('exportProgress');
    const status = document.getElementById('exportStatus');

    const fps = getFPS();
    const duration = getTotalDuration();
    const totalFrames = Math.ceil(duration * fps);
    const scale = getExportScale();

    const offCanvas = document.createElement('canvas');
    offCanvas.width = scale;
    offCanvas.height = scale;
    const offCtx = offCanvas.getContext('2d');

    const stream = offCanvas.captureStream(0); // 0 = manual frame push
    const chunks = [];
    const frameInterval = 1000 / fps; // ms per frame

    // Try VP9 first, fall back to VP8
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8';
    }
    const recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 8_000_000
    });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'laser-animation.webm';
        a.click();
        URL.revokeObjectURL(url);
        overlay.classList.remove('show');
    };
    recorder.start();

    let frameIdx = 0;

    function nextFrame() {
        if (exportCancelled) {
            recorder.stop();
            overlay.classList.remove('show');
            return;
        }
        if (frameIdx >= totalFrames) {
            status.textContent = 'Finalizing…';
            recorder.stop();
            return;
        }

        const t = (frameIdx / totalFrames) * duration;
        if (scale !== W) {
            offCtx.save();
            offCtx.scale(scale / W, scale / H);
            renderFrameWith(offCtx, t, { noGrid: true });
            offCtx.restore();
        } else {
            renderFrameWith(offCtx, t, { noGrid: true });
        }

        // Request a frame on the captureStream
        const track = stream.getVideoTracks()[0];
        if (track.requestFrame) track.requestFrame();

        frameIdx++;
        progressEl.value = (frameIdx / totalFrames) * 100;
        status.textContent = `Rendering frame ${frameIdx}/${totalFrames}`;

        // Real-time delay so MediaRecorder encodes correct timestamps
        setTimeout(nextFrame, frameInterval);
    }

    nextFrame();
}

// ---- GIF Export ----
window.exportGIF = function () {
    if (animations.length === 0) return alert('Add at least one animation first.');
    exportCancelled = false;
    const overlay = document.getElementById('exportOverlay');
    overlay.classList.add('show');
    document.getElementById('exportTitle').textContent = 'Exporting GIF…';

    const quality = parseInt(document.getElementById('gifQuality').value);
    const fps = Math.min(getFPS(), 50); // GIF max practical fps is 50 (20ms delay)
    const duration = getTotalDuration();
    const totalFrames = Math.ceil(duration * fps);
    // GIF delays are in centiseconds (10ms units) — round to nearest 10ms, min 20ms
    const delay = Math.max(20, Math.round(1000 / fps / 10) * 10);
    const scale = getExportScale();

    // Create offscreen canvas at export resolution
    const offCanvas = document.createElement('canvas');
    offCanvas.width = scale;
    offCanvas.height = scale;
    const offCtx = offCanvas.getContext('2d');

    const gif = new GIF({
        workers: 4,
        quality: quality,
        width: scale,
        height: scale,
        workerScript: window.gifWorkerBlobURL || 'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js',
        dither: 'FloydSteinberg'
    });

    const progress = document.getElementById('exportProgress');
    const status = document.getElementById('exportStatus');

    let frameIdx = 0;

    function addNextFrame() {
        if (exportCancelled) {
            overlay.classList.remove('show');
            return;
        }
        if (frameIdx >= totalFrames) {
            status.textContent = 'Encoding GIF…';
            gif.render();
            return;
        }

        const t = (frameIdx / totalFrames) * duration;

        if (scale !== W) {
            offCtx.save();
            offCtx.scale(scale / W, scale / H);
            renderFrameWith(offCtx, t, { noGrid: true });
            offCtx.restore();
        } else {
            renderFrameWith(offCtx, t, { noGrid: true });
        }

        gif.addFrame(offCtx, { copy: true, delay: delay, dispose: 2 });

        frameIdx++;
        progress.value = (frameIdx / totalFrames) * 100;
        status.textContent = `Rendering frame ${frameIdx}/${totalFrames}`;

        // Yield to UI
        setTimeout(addNextFrame, 0);
    }

    gif.on('finished', blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'laser-animation.gif';
        a.click();
        URL.revokeObjectURL(url);
        overlay.classList.remove('show');
    });

    addNextFrame();
};

// Render frame to a specific context
function renderFrameWith(c, t, opts) {
    const bgColor = getBgColor();
    c.fillStyle = bgColor;
    c.fillRect(0, 0, W, H);

    // Grid (skip during export)
    if (!opts || !opts.noGrid) {
        const bgIsLight = isLightColor(bgColor);
        c.strokeStyle = bgIsLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)';
        c.lineWidth = 0.5;
        c.setLineDash([]);
        const gridStep = 64;
        for (let x = 0; x <= W; x += gridStep) {
            c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
        }
        for (let y = 0; y <= H; y += gridStep) {
            c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
        }
    }

    // Shapes
    shapes.forEach(s => {
        c.strokeStyle = s.color;
        c.lineWidth = s.width;
        c.setLineDash([]);
        if (s.type === 'line') {
            c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
            if (s.arrow) {
                const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
                drawArrowhead(c, s.x2, s.y2, angle, Math.max(12, s.width * 5), s.color);
            }
        } else if (s.type === 'curve') {
            c.lineJoin = 'round'; c.lineCap = 'round';
            drawSmoothCurve(c, s.controlPts);
            if (s.arrow && s.points.length >= 2) {
                const p1 = s.points[s.points.length - 2], p2 = s.points[s.points.length - 1];
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                drawArrowhead(c, p2.x, p2.y, angle, Math.max(12, s.width * 5), s.color);
            }
        } else if (s.type === 'circle') {
            c.beginPath(); c.arc(s.cx, s.cy, s.r, 0, Math.PI * 2); c.stroke();
        } else if (s.type === 'rect') {
            c.strokeRect(s.x, s.y, s.w, s.h);
        } else if (s.type === 'text') {
            if (s.isLatex && s.image) {
                c.drawImage(s.image, s.x - s.imgW / 2, s.y - s.imgH / 2);
            } else if (!s.isLatex) {
                c.font = `${s.fontSize}px sans-serif`;
                c.fillStyle = s.color;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(s.content, s.x, s.y);
            }
        } else if (s.type === 'image') {
            if (s.image) {
                c.save();
                c.globalAlpha = s.opacity != null ? s.opacity : 1;
                c.drawImage(s.image, s.x, s.y, s.w, s.h);
                c.restore();
            }
        }
    });

    // Lasers
    animations.forEach(a => {
        const shape = shapes.find(s => s.id === a.shapeId);
        if (!shape) return;

        const elapsed = t - a.startTime;
        if (elapsed < 0) return;

        const perim = getShapePerimeter(shape);
        const travelDist = elapsed * a.velocity;

        let progress;
        if (shape.type === 'line' || shape.type === 'curve') {
            progress = clamp(travelDist / perim, 0, 1);
        } else {
            progress = (travelDist / perim) % 1;
        }

        if (a.vanishAtEnd) {
            if ((shape.type === 'line' || shape.type === 'curve') && travelDist / perim >= 1) return;
            if (shape.type !== 'line' && shape.type !== 'curve' && travelDist / perim >= 1) return;
        }

        let effProgress = progress;
        if (a.direction === 'inward' || a.direction === 'anticlockwise') {
            effProgress = 1 - progress;
        }

        let px, py;
        if (shape.type === 'line') {
            px = shape.x1 + (shape.x2 - shape.x1) * effProgress;
            py = shape.y1 + (shape.y2 - shape.y1) * effProgress;
        } else if (shape.type === 'curve') {
            const pos = curvePos(shape, effProgress);
            px = pos.x; py = pos.y;
        } else if (shape.type === 'circle') {
            const pos = circlePos(shape, effProgress);
            px = pos.x; py = pos.y;
        } else if (shape.type === 'rect') {
            const pos = rectPos(shape, effProgress);
            px = pos.x; py = pos.y;
        }

        const rc = parseInt(a.color.slice(1, 3), 16);
        const gc = parseInt(a.color.slice(3, 5), 16);
        const bc = parseInt(a.color.slice(5, 7), 16);

        if (shape.type === 'line') {
            const trailLen = 0.15;
            const trailFrac = a.direction === 'outward' ? Math.max(0, effProgress - trailLen) : Math.min(1, effProgress + trailLen);
            const tx = shape.x1 + (shape.x2 - shape.x1) * trailFrac;
            const ty = shape.y1 + (shape.y2 - shape.y1) * trailFrac;
            const trailGrad = c.createLinearGradient(tx, ty, px, py);
            trailGrad.addColorStop(0, `rgba(${rc},${gc},${bc},0)`);
            trailGrad.addColorStop(1, `rgba(${rc},${gc},${bc},0.6)`);
            c.strokeStyle = trailGrad;
            c.lineWidth = a.pointerSize * 1.2;
            c.setLineDash([]);
            c.beginPath();
            c.moveTo(tx, ty);
            c.lineTo(px, py);
            c.stroke();
        } else if (shape.type === 'curve') {
            const trailFrac = 0.1;
            const steps = 20;
            for (let i = 0; i < steps; i++) {
                const frac = i / steps;
                const sign = (a.direction === 'inward') ? 1 : -1;
                const tp = clamp(effProgress + sign * trailFrac * (1 - frac), 0, 1);
                const tpos = curvePos(shape, tp);
                const alpha = 0.25 * frac;
                c.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                c.beginPath();
                c.arc(tpos.x, tpos.y, a.pointerSize * (0.4 + 0.6 * frac), 0, Math.PI * 2);
                c.fill();
            }
        } else {
            const trailFrac = 0.08;
            const steps = 20;
            const trailDir = (a.direction === 'anticlockwise') ? 1 : -1;
            for (let i = 0; i < steps; i++) {
                const frac = i / steps;
                const tp = effProgress + trailDir * trailFrac * (1 - frac);
                const tpWrap = ((tp % 1) + 1) % 1;
                let tpx, tpy;
                if (shape.type === 'circle') {
                    const pos = circlePos(shape, tpWrap);
                    tpx = pos.x; tpy = pos.y;
                } else {
                    const pos = rectPos(shape, tpWrap);
                    tpx = pos.x; tpy = pos.y;
                }
                const alpha = 0.25 * frac;
                c.fillStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                c.beginPath();
                c.arc(tpx, tpy, a.pointerSize * (0.4 + 0.6 * frac), 0, Math.PI * 2);
                c.fill();
            }
        }

        // Glow
        const grad = c.createRadialGradient(px, py, 0, px, py, a.glowRadius);
        grad.addColorStop(0, `rgba(${rc},${gc},${bc},0.9)`);
        grad.addColorStop(0.3, `rgba(${rc},${gc},${bc},0.4)`);
        grad.addColorStop(0.6, `rgba(${rc},${gc},${bc},0.12)`);
        grad.addColorStop(1, `rgba(${rc},${gc},${bc},0)`);
        c.fillStyle = grad;
        c.beginPath();
        c.arc(px, py, a.glowRadius, 0, Math.PI * 2);
        c.fill();

        // Core
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(px, py, a.pointerSize * 0.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = a.color;
        c.beginPath();
        c.arc(px, py, a.pointerSize, 0, Math.PI * 2);
        c.globalAlpha = 0.7;
        c.fill();
        c.globalAlpha = 1.0;
    });
}

window.cancelExport = function () {
    exportCancelled = true;
    document.getElementById('exportOverlay').classList.remove('show');
};

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
