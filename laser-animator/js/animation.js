// ============================================================
// Laser Pointer Animator – Animation Management & Playback
// ============================================================

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
