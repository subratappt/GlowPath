// ============================================================
// GlowPath – State & Helpers
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = canvas.width, H = canvas.height;

window.setCanvasResolution = function (size) {
    size = parseInt(size);
    canvas.width = size;
    canvas.height = size;
    W = size;
    H = size;
    resizeCanvas();
    renderFrame(getCurrentTime());
};

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
let polylinePoints = []; // for multi-segment line tool

// Selection state
let selectedShapeId = null;
let isDraggingShape = false;
let _dragSavedState = false;
let dragOffset = { x: 0, y: 0 };

// Snap-to-object state
let _snapIndicator = null; // {x, y} of current snap point or null

// Playback state
let playing = false;
let playStartReal = 0;  // performance.now() when play started
let playOffset = 0;      // time offset from timeline scrub
let animFrameId = null;
let exportCancelled = false;

// Undo/Redo history
let _undoStack = [];
let _redoStack = [];
const _maxHistory = 50;

function _cloneShapes() {
    return shapes.map(s => {
        const c = Object.assign({}, s);
        if (s.points) c.points = s.points.map(p => ({ x: p.x, y: p.y }));
        if (s.controlPts) c.controlPts = s.controlPts.map(p => ({ x: p.x, y: p.y }));
        if (s.dists) c.dists = s.dists.slice();
        // image/text image refs are kept as-is (non-serializable)
        if (s.image) c.image = s.image;
        return c;
    });
}

function saveState() {
    _undoStack.push(_cloneShapes());
    if (_undoStack.length > _maxHistory) _undoStack.shift();
    _redoStack = [];
}

function undo() {
    if (_undoStack.length === 0) return;
    _redoStack.push(_cloneShapes());
    shapes = _undoStack.pop();
    selectedShapeId = null;
    const selPanel = document.getElementById('selectPanel');
    if (selPanel) selPanel.style.display = 'none';
    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
}

function redo() {
    if (_redoStack.length === 0) return;
    _undoStack.push(_cloneShapes());
    shapes = _redoStack.pop();
    selectedShapeId = null;
    const selPanel = document.getElementById('selectPanel');
    if (selPanel) selPanel.style.display = 'none';
    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
}

// ---- Project Save / Open (.gp) ----
function _serializeShape(s) {
    const o = Object.assign({}, s);
    // Convert image element to data URL for serialization
    if (s.type === 'image' && s.image) {
        const c = document.createElement('canvas');
        c.width = s.image.naturalWidth || s.image.width;
        c.height = s.image.naturalHeight || s.image.height;
        c.getContext('2d').drawImage(s.image, 0, 0);
        o._imageDataURL = c.toDataURL('image/png');
        delete o.image;
    }
    // Convert text rendered image to data URL
    if (s.type === 'text' && s.image) {
        const c = document.createElement('canvas');
        c.width = s.image.naturalWidth || s.image.width;
        c.height = s.image.naturalHeight || s.image.height;
        c.getContext('2d').drawImage(s.image, 0, 0);
        o._textImageDataURL = c.toDataURL('image/png');
        delete o.image;
    }
    return o;
}

function _deserializeShape(o) {
    const s = Object.assign({}, o);
    if (o._imageDataURL) {
        const img = new Image();
        img.src = o._imageDataURL;
        s.image = img;
        delete s._imageDataURL;
    }
    if (o._textImageDataURL) {
        const img = new Image();
        img.src = o._textImageDataURL;
        s.image = img;
        delete s._textImageDataURL;
    }
    return s;
}

window.saveProject = function () {
    const project = {
        version: 1,
        canvas: { width: W, height: H },
        bgColor: document.getElementById('bgColor').value,
        shapes: shapes.map(_serializeShape),
        animations: animations.slice(),
        timeline: {
            duration: parseFloat(document.getElementById('totalDuration').value),
            fps: parseInt(document.getElementById('fps').value)
        },
        counters: { shapeId: shapeIdCounter, animId: animIdCounter }
    };
    const nameInput = document.getElementById('projectName');
    let name = (nameInput.value || '').trim();
    if (!name) {
        name = prompt('Enter project name:', 'glowpath');
        if (!name) return;
        nameInput.value = name;
    }
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.gp';
    a.click();
    URL.revokeObjectURL(url);
};

window.openProject = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const project = JSON.parse(e.target.result);
            if (!project.version || !project.shapes) throw new Error('Invalid .gp file');

            // Restore canvas resolution
            const size = project.canvas ? project.canvas.width : 1024;
            canvas.width = size;
            canvas.height = size;
            W = size;
            H = size;
            const resSel = document.getElementById('canvasResolution');
            // Set dropdown if matching option exists, else add one
            let found = false;
            for (const opt of resSel.options) {
                if (parseInt(opt.value) === size) { opt.selected = true; found = true; break; }
            }
            if (!found) {
                const opt = document.createElement('option');
                opt.value = size; opt.textContent = size; opt.selected = true;
                resSel.appendChild(opt);
            }

            // Restore BG color
            if (project.bgColor) {
                document.getElementById('bgColor').value = project.bgColor;
                document.getElementById('bgColorHex').textContent = project.bgColor;
            }

            // Restore shapes (images load async but render on next frame)
            shapes = project.shapes.map(_deserializeShape);
            shapeIdCounter = project.counters ? project.counters.shapeId : shapes.length;

            // Restore animations
            animations = project.animations || [];
            animIdCounter = project.counters ? project.counters.animId : animations.length;

            // Restore timeline
            if (project.timeline) {
                document.getElementById('totalDuration').value = project.timeline.duration;
                document.getElementById('fps').value = project.timeline.fps;
                document.getElementById('timeline').max = project.timeline.duration * 1000;
            }

            // Reset undo/redo
            _undoStack = [];
            _redoStack = [];
            selectedShapeId = null;
            const selPanel = document.getElementById('selectPanel');
            if (selPanel) selPanel.style.display = 'none';

            // Refresh UI
            refreshShapeList();
            refreshAnimTargets();
            refreshAnimList();
            resizeCanvas();
            // Slight delay so images can load
            setTimeout(() => renderFrame(0), 100);
        } catch (err) {
            alert('Failed to open project: ' + err.message);
        }
    };
    reader.readAsText(file);
    input.value = ''; // reset so same file can be re-opened
};

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

// Snap point to nearest 0/45/90/135/180… angle relative to origin
function snapAngle(origin, pt) {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) return { x: pt.x, y: pt.y };
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
        x: Math.round(origin.x + d * Math.cos(snapped)),
        y: Math.round(origin.y + d * Math.sin(snapped))
    };
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
