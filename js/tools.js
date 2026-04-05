// ============================================================
// GlowPath – Drawing Tools & Input Handlers
// ============================================================

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
    const selectPanel = document.getElementById('selectPanel');
    if (selectPanel) selectPanel.style.display = (tool === 'select' && selectedShapeId != null) ? '' : 'none';
    canvas.style.cursor = (tool === 'select') ? 'default' : 'crosshair';
    // Enable/disable arrow and multi-segment based on tool
    const arrowEl = document.getElementById('arrowAtEnd');
    const arrowLabel = arrowEl.parentElement;
    const multiEl = document.getElementById('multiSegment');
    const multiLabel = multiEl.parentElement;
    const arrowApplicable = (tool === 'line' || tool === 'curve' || tool === 'arc');
    arrowEl.disabled = !arrowApplicable;
    arrowLabel.style.opacity = arrowApplicable ? '1' : '0.4';
    arrowLabel.style.pointerEvents = arrowApplicable ? '' : 'none';
    const multiApplicable = (tool === 'line');
    multiEl.disabled = !multiApplicable;
    multiLabel.style.opacity = multiApplicable ? '1' : '0.4';
    multiLabel.style.pointerEvents = multiApplicable ? '' : 'none';
    // Show fill color for circle/rect
    const fillRow = document.getElementById('fillColor').parentElement;
    const fillApplicable = (tool === 'circle' || tool === 'rect');
    fillRow.style.opacity = fillApplicable ? '1' : '0.4';
    fillRow.style.pointerEvents = fillApplicable ? '' : 'none';
    // Show arc bulge slider
    document.getElementById('arcBulgeRow').style.display = (tool === 'arc') ? '' : 'none';
    // Cancel any in-progress polyline when switching tools
    if (polylinePoints.length > 0) {
        polylinePoints = [];
        renderFrame(getCurrentTime());
    }
    // Deselect when leaving select tool
    if (tool !== 'select') {
        selectedShapeId = null;
        _snapIndicator = null;
        renderFrame(getCurrentTime());
    }
};

// Show/hide multi-segment hint
document.getElementById('multiSegment').addEventListener('change', function () {
    document.getElementById('multiSegHint').style.display = this.checked ? '' : 'none';
    if (!this.checked && polylinePoints.length > 0) {
        polylinePoints = [];
        document.getElementById('polyDoneBtn').style.display = 'none';
        renderFrame(getCurrentTime());
    }
});

// ---- Polyline helpers ----
function isMultiSeg() {
    return currentTool === 'line' && document.getElementById('multiSegment').checked;
}

function finishPolyline() {
    if (polylinePoints.length < 2) { polylinePoints = []; return; }
    // Remove duplicate last point added by click before dblclick
    const last = polylinePoints[polylinePoints.length - 1];
    const prev = polylinePoints[polylinePoints.length - 2];
    if (last.x === prev.x && last.y === prev.y) {
        polylinePoints.pop();
    }
    if (polylinePoints.length < 2) { polylinePoints = []; return; }
    const color = document.getElementById('strokeColor').value;
    const width = parseInt(document.getElementById('strokeWidth').value);
    const arrow = document.getElementById('arrowAtEnd').checked;
    const id = ++shapeIdCounter;
    const pts = polylinePoints.slice();
    // Pre-compute cumulative distances
    const dists = [0];
    for (let i = 1; i < pts.length; i++) {
        dists.push(dists[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    shapes.push({ type: 'polyline', id, points: pts, dists, color, width, arrow });
    polylinePoints = [];
    document.getElementById('polyDoneBtn').style.display = 'none';
    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
}

// ESC to cancel polyline/deselect, Enter to finish polyline
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (polylinePoints.length > 0) {
            polylinePoints = [];
            document.getElementById('polyDoneBtn').style.display = 'none';
            renderFrame(getCurrentTime());
        } else if (currentTool === 'select' && selectedShapeId != null) {
            selectedShapeId = null;
            document.getElementById('selectPanel').style.display = 'none';
            renderFrame(getCurrentTime());
        }
    }
    if (e.key === 'Enter' && polylinePoints.length >= 2 && isMultiSeg()) {
        finishPolyline();
    }
});

// Track mouse position for polyline preview
let _polyMousePos = null;
canvas.addEventListener('mousemove', e => {
    if (isMultiSeg() && polylinePoints.length > 0) {
        _polyMousePos = canvasCoords(e);
        const anchor = polylinePoints[polylinePoints.length - 1];
        if (e.ctrlKey || e.metaKey) _polyMousePos = snapAngle(anchor, _polyMousePos);
        // Snap to existing shapes
        const polyMoveSnap = findNearestSnap(_polyMousePos, shapes);
        _snapIndicator = polyMoveSnap;
        if (polyMoveSnap) _polyMousePos = polyMoveSnap;
        renderFrame(getCurrentTime());
        // Draw polyline preview
        ctx.save();
        ctx.strokeStyle = document.getElementById('strokeColor').value;
        ctx.lineWidth = parseInt(document.getElementById('strokeWidth').value);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y);
        for (let i = 1; i < polylinePoints.length; i++) {
            ctx.lineTo(polylinePoints[i].x, polylinePoints[i].y);
        }
        ctx.stroke();
        // Dashed line to cursor
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(polylinePoints[polylinePoints.length - 1].x, polylinePoints[polylinePoints.length - 1].y);
        ctx.lineTo(_polyMousePos.x, _polyMousePos.y);
        ctx.stroke();
        // Draw vertex dots
        ctx.fillStyle = document.getElementById('strokeColor').value;
        polylinePoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
});

// ---- Selection: properties panel ----
function showSelPanel(s) {
    const panel = document.getElementById('selectPanel');
    if (!s) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    document.getElementById('selectInfo').textContent = `${s.type.charAt(0).toUpperCase() + s.type.slice(1)} #${s.id}`;
    document.getElementById('selColor').value = s.color || '#000000';
    document.getElementById('selWidth').value = s.width || 2;

    const arrowRow = document.getElementById('selArrowRow');
    const textRows = document.getElementById('selTextRows');
    const imgRows = document.getElementById('selImageRows');

    arrowRow.style.display = (s.type === 'line' || s.type === 'curve' || s.type === 'polyline' || s.type === 'arc') ? '' : 'none';
    if (s.arrow !== undefined) document.getElementById('selArrow').checked = s.arrow;

    const fillRow = document.getElementById('selFillRow');
    fillRow.style.display = (s.type === 'circle' || s.type === 'rect') ? '' : 'none';
    if (s.type === 'circle' || s.type === 'rect') {
        document.getElementById('selFillEnabled').checked = !!s.fill;
        document.getElementById('selFillColor').value = s.fill || '#ffffff';
    }

    textRows.style.display = (s.type === 'text') ? '' : 'none';
    if (s.type === 'text') document.getElementById('selFontSize').value = s.fontSize || 32;

    imgRows.style.display = (s.type === 'image') ? '' : 'none';
    if (s.type === 'image') {
        document.getElementById('selImgW').value = s.w;
        document.getElementById('selImgH').value = s.h;
        document.getElementById('selImgOpacity').value = s.opacity != null ? s.opacity : 1;
    }

    // Show/hide width for non-text/image shapes
    document.getElementById('selWidth').parentElement.style.display = (s.type === 'text' || s.type === 'image') ? 'none' : '';
}

window.applySelProps = function () {
    const s = shapes.find(sh => sh.id === selectedShapeId);
    if (!s) return;
    s.color = document.getElementById('selColor').value;
    if (s.type !== 'text' && s.type !== 'image') {
        s.width = parseInt(document.getElementById('selWidth').value) || 2;
    }
    if (s.type === 'line' || s.type === 'curve' || s.type === 'polyline' || s.type === 'arc') {
        s.arrow = document.getElementById('selArrow').checked;
    }
    if (s.type === 'circle' || s.type === 'rect') {
        s.fill = document.getElementById('selFillEnabled').checked ? document.getElementById('selFillColor').value : null;
    }
    if (s.type === 'text') {
        s.fontSize = parseInt(document.getElementById('selFontSize').value) || 32;
    }
    if (s.type === 'image') {
        s.w = parseInt(document.getElementById('selImgW').value) || s.w;
        s.h = parseInt(document.getElementById('selImgH').value) || s.h;
        s.opacity = parseFloat(document.getElementById('selImgOpacity').value);
    }
    refreshShapeList();
    renderFrame(getCurrentTime());
};

window.duplicateSelected = function () {
    const s = shapes.find(sh => sh.id === selectedShapeId);
    if (!s) return;
    const clone = duplicateShape(s);
    moveShape(clone, 20, 20);
    shapes.push(clone);
    selectedShapeId = clone.id;
    showSelPanel(clone);
    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
};

window.deleteSelected = function () {
    if (selectedShapeId == null) return;
    shapes = shapes.filter(s => s.id !== selectedShapeId);
    animations = animations.filter(a => a.shapeId !== selectedShapeId);
    selectedShapeId = null;
    document.getElementById('selectPanel').style.display = 'none';
    refreshShapeList();
    refreshAnimTargets();
    refreshAnimList();
    renderFrame(getCurrentTime());
};

// ---- Selection: mouse handlers ----
canvas.addEventListener('mousedown', e => {
    if (currentTool !== 'select' || playing) return;
    const pos = canvasCoords(e);
    // Check shapes in reverse (topmost first)
    let found = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitTestShape(shapes[i], pos.x, pos.y)) {
            found = shapes[i];
            break;
        }
    }
    if (found) {
        selectedShapeId = found.id;
        isDraggingShape = true;
        dragOffset = { x: pos.x, y: pos.y };
        canvas.style.cursor = 'move';
        showSelPanel(found);
        // Update animation target dropdown to selected shape
        const animTarget = document.getElementById('animTarget');
        if (animTarget.querySelector(`option[value="${found.id}"]`)) {
            animTarget.value = found.id;
            updateDirectionOptions();
        }
    } else {
        selectedShapeId = null;
        isDraggingShape = false;
        document.getElementById('selectPanel').style.display = 'none';
    }
    renderFrame(getCurrentTime());
});

canvas.addEventListener('mousemove', e => {
    if (currentTool !== 'select' || !isDraggingShape || playing) return;
    const pos = canvasCoords(e);
    const s = shapes.find(sh => sh.id === selectedShapeId);
    if (!s) return;
    const dx = pos.x - dragOffset.x;
    const dy = pos.y - dragOffset.y;
    moveShape(s, dx, dy);
    dragOffset = { x: pos.x, y: pos.y };
    renderFrame(getCurrentTime());
});

canvas.addEventListener('mouseup', e => {
    if (currentTool === 'select') {
        isDraggingShape = false;
        canvas.style.cursor = 'default';
    }
});

// Delete/Escape shortcuts for selection
document.addEventListener('keydown', e => {
    if (currentTool === 'select' && selectedShapeId != null) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelected();
            e.preventDefault();
        }
        // Ctrl/Cmd+D to duplicate
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            duplicateSelected();
            e.preventDefault();
        }
    }
});

// ---- Snap indicator on hover (before drawing starts) ----
canvas.addEventListener('mousemove', e => {
    if (playing || isDrawing || currentTool === 'select' || currentTool === 'text' || currentTool === 'image') return;
    if (isMultiSeg() && polylinePoints.length > 0) return; // polyline preview handles its own snap
    const pos = canvasCoords(e);
    const snap = findNearestSnap(pos, shapes);
    if (snap !== _snapIndicator) {
        _snapIndicator = snap;
        renderFrame(getCurrentTime());
    }
});

// ---- Drawing ----
canvas.addEventListener('mousedown', e => {
    if (playing) return;
    if (currentTool === 'select' || currentTool === 'text' || currentTool === 'image') return;
    if (isMultiSeg()) return; // polyline uses click, not drag
    isDrawing = true;
    drawStart = canvasCoords(e);
    // Snap start point to existing shapes
    const startSnap = findNearestSnap(drawStart, shapes);
    if (startSnap) { drawStart = startSnap; }
    if (currentTool === 'curve') {
        curvePoints = [drawStart];
    }
    if (currentTool === 'arc') {
        // arc uses same drag pattern as line
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
        let target = cur;
        if (e.ctrlKey || e.metaKey) target = snapAngle(drawStart, cur);
        const snap = findNearestSnap(target, shapes);
        _snapIndicator = snap;
        if (snap) target = snap;
        ctx.beginPath();
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
    } else if (currentTool === 'circle') {
        const snap = findNearestSnap(cur, shapes);
        _snapIndicator = snap;
        const endPt = snap || cur;
        const r = dist(drawStart, endPt);
        ctx.beginPath();
        ctx.arc(drawStart.x, drawStart.y, r, 0, Math.PI * 2);
        ctx.stroke();
    } else if (currentTool === 'rect') {
        const snap = findNearestSnap(cur, shapes);
        _snapIndicator = snap;
        let endPt = snap || cur;
        if (e.ctrlKey || e.metaKey) {
            const side = Math.max(Math.abs(endPt.x - drawStart.x), Math.abs(endPt.y - drawStart.y));
            endPt = { x: drawStart.x + side * Math.sign(endPt.x - drawStart.x), y: drawStart.y + side * Math.sign(endPt.y - drawStart.y) };
        }
        ctx.strokeRect(drawStart.x, drawStart.y, endPt.x - drawStart.x, endPt.y - drawStart.y);
    } else if (currentTool === 'arc') {
        let target = cur;
        const snap = findNearestSnap(cur, shapes);
        _snapIndicator = snap;
        if (snap) target = snap;
        const bulge = parseFloat(document.getElementById('arcBulge').value) || 0.5;
        const tempArc = { x1: drawStart.x, y1: drawStart.y, x2: target.x, y2: target.y, bulge };
        const a = getArcParams(tempArc);
        if (a) {
            ctx.beginPath();
            ctx.arc(a.cx, a.cy, a.r, a.startAngle, a.endAngle, a.ccw);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(drawStart.x, drawStart.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
        }
    }
    ctx.restore();
});

canvas.addEventListener('mouseup', e => {
    if (!isDrawing || playing) return;
    isDrawing = false;
    _snapIndicator = null;
    let end = canvasCoords(e);
    // Snap end point to existing shapes
    const endSnap = findNearestSnap(end, shapes);
    if (endSnap) end = endSnap;
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
        let endPt = end;
        if (e.ctrlKey || e.metaKey) endPt = snapAngle(drawStart, endPt);
        const lineSnap = findNearestSnap(endPt, shapes);
        if (lineSnap) endPt = lineSnap;
        if (dist(drawStart, endPt) < 3) return;
        const arrow = document.getElementById('arrowAtEnd').checked;
        shapes.push({ type: 'line', id, x1: drawStart.x, y1: drawStart.y, x2: endPt.x, y2: endPt.y, color, width, arrow });
    } else if (currentTool === 'circle') {
        const r = dist(drawStart, end);
        if (r < 3) return;
        const fill = document.getElementById('fillEnabled').checked ? document.getElementById('fillColor').value : null;
        shapes.push({ type: 'circle', id, cx: drawStart.x, cy: drawStart.y, r, color, width, fill });
    } else if (currentTool === 'rect') {
        let rEnd = end;
        if (e.ctrlKey || e.metaKey) {
            const side = Math.max(Math.abs(rEnd.x - drawStart.x), Math.abs(rEnd.y - drawStart.y));
            rEnd = { x: drawStart.x + side * Math.sign(rEnd.x - drawStart.x), y: drawStart.y + side * Math.sign(rEnd.y - drawStart.y) };
        }
        const w = Math.abs(rEnd.x - drawStart.x), h = Math.abs(rEnd.y - drawStart.y);
        if (w < 3 && h < 3) return;
        const rx = Math.min(drawStart.x, rEnd.x), ry = Math.min(drawStart.y, rEnd.y);
        const fill = document.getElementById('fillEnabled').checked ? document.getElementById('fillColor').value : null;
        shapes.push({ type: 'rect', id, x: rx, y: ry, w, h, color, width, fill });
    } else if (currentTool === 'arc') {
        let endPt = end;
        const arcSnap = findNearestSnap(endPt, shapes);
        if (arcSnap) endPt = arcSnap;
        if (dist(drawStart, endPt) < 3) return;
        const bulge = parseFloat(document.getElementById('arcBulge').value) || 0.5;
        const arrow = document.getElementById('arrowAtEnd').checked;
        shapes.push({ type: 'arc', id, x1: drawStart.x, y1: drawStart.y, x2: endPt.x, y2: endPt.y, bulge, color, width, arrow });
    }

    refreshShapeList();
    refreshAnimTargets();
    renderFrame(getCurrentTime());
});

canvas.addEventListener('mouseleave', () => {
    _snapIndicator = null;
    if (isDrawing && !playing) {
        isDrawing = false;
        curvePoints = [];
        renderFrame(getCurrentTime());
    }
});

// ---- Text Tool: click-to-place ----
canvas.addEventListener('click', e => {
    if (playing) return;
    if (currentTool === 'select') return;

    // ---- Polyline: add vertex on click ----
    if (isMultiSeg()) {
        let pos = canvasCoords(e);
        if ((e.ctrlKey || e.metaKey) && polylinePoints.length > 0) {
            pos = snapAngle(polylinePoints[polylinePoints.length - 1], pos);
        }
        // Snap to existing shapes
        const polySnap = findNearestSnap(pos, shapes);
        if (polySnap) pos = polySnap;
        _snapIndicator = null;
        polylinePoints.push(pos);
        if (polylinePoints.length >= 2) {
            document.getElementById('polyDoneBtn').style.display = '';
        }
        renderFrame(getCurrentTime());
        // Draw in-progress polyline preview so it doesn't vanish between click and next mousemove
        if (polylinePoints.length > 0) {
            ctx.save();
            ctx.strokeStyle = document.getElementById('strokeColor').value;
            ctx.lineWidth = parseInt(document.getElementById('strokeWidth').value);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y);
            for (let i = 1; i < polylinePoints.length; i++) {
                ctx.lineTo(polylinePoints[i].x, polylinePoints[i].y);
            }
            ctx.stroke();
            ctx.fillStyle = document.getElementById('strokeColor').value;
            polylinePoints.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.restore();
        }
        return;
    }

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

// ---- KaTeX Rendering ----
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
