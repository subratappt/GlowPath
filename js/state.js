// ============================================================
// GlowPath – State & Helpers
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
