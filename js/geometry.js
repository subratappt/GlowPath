// ============================================================
// GlowPath – Geometry & Path Helpers
// ============================================================

// ---- Shape path helpers ----
function getShapePerimeter(shape) {
    if (shape.type === 'line') return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    if (shape.type === 'curve' || shape.type === 'polyline') return shape.dists[shape.dists.length - 1];
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

// ---- Douglas-Peucker curve simplification ----
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

// ---- Smooth curve drawing (quadratic bezier midpoint technique) ----
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

// ---- Resample smooth curve into dense points for animation ----
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
