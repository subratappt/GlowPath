// ============================================================
// GlowPath – Export (WebM & GIF)
// ============================================================

window.doExport = function () {
    const format = document.getElementById('exportFormat').value;
    if (format === 'webm') exportWebM();
    else exportGIF();
};

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
        a.download = 'glowpath-animation.webm';
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
        a.download = 'glowpath-animation.gif';
        a.click();
        URL.revokeObjectURL(url);
        overlay.classList.remove('show');
    });

    addNextFrame();
};

window.cancelExport = function () {
    exportCancelled = true;
    document.getElementById('exportOverlay').classList.remove('show');
};
