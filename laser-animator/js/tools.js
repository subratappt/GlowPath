// ============================================================
// Laser Pointer Animator – Drawing Tools & Input Handlers
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
