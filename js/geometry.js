// ============================================================
// GlowPath – Geometry & Path Helpers
// ============================================================

// ---- Shape path helpers ----
function getShapePerimeter(shape) {
    if (shape.type === 'line') return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    if (shape.type === 'curve' || shape.type === 'polyline') return shape.dists[shape.dists.length - 1];
    if (shape.type === 'circle') return 2 * Math.PI * shape.r;
    if (shape.type === 'rect') return 2 * (shape.w + shape.h);
    if (shape.type === 'arc') {
        const a = getArcParams(shape);
        return a ? Math.abs(a.sweep) * a.r : Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    }
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

// ---- Hit-testing: find shape at point (within tolerance) ----
function pointToSegmentDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitTestShape(shape, px, py, tol) {
    tol = tol || 8;
    if (shape.type === 'line') {
        return pointToSegmentDist(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= tol;
    } else if (shape.type === 'curve' || shape.type === 'polyline') {
        for (let i = 0; i < shape.points.length - 1; i++) {
            if (pointToSegmentDist(px, py, shape.points[i].x, shape.points[i].y, shape.points[i + 1].x, shape.points[i + 1].y) <= tol) return true;
        }
        return false;
    } else if (shape.type === 'circle') {
        return Math.abs(Math.hypot(px - shape.cx, py - shape.cy) - shape.r) <= tol;
    } else if (shape.type === 'rect') {
        // Check proximity to each of the 4 edges
        const { x, y, w, h } = shape;
        if (pointToSegmentDist(px, py, x, y, x + w, y) <= tol) return true;
        if (pointToSegmentDist(px, py, x + w, y, x + w, y + h) <= tol) return true;
        if (pointToSegmentDist(px, py, x + w, y + h, x, y + h) <= tol) return true;
        if (pointToSegmentDist(px, py, x, y + h, x, y) <= tol) return true;
        return false;
    } else if (shape.type === 'text') {
        const hw = (shape.imgW || 60) / 2, hh = (shape.imgH || shape.fontSize) / 2;
        return Math.abs(px - shape.x) <= hw + tol && Math.abs(py - shape.y) <= hh + tol;
    } else if (shape.type === 'arc') {
        // Sample arc and check proximity to segments
        const steps = 32;
        for (let i = 0; i < steps; i++) {
            const p1 = arcPos(shape, i / steps), p2 = arcPos(shape, (i + 1) / steps);
            if (pointToSegmentDist(px, py, p1.x, p1.y, p2.x, p2.y) <= tol) return true;
        }
        return false;
    } else if (shape.type === 'image') {
        return px >= shape.x - tol && px <= shape.x + shape.w + tol && py >= shape.y - tol && py <= shape.y + shape.h + tol;
    }
    return false;
}

// Get bounding box of a shape { x, y, w, h }
function getShapeBBox(s) {
    if (s.type === 'line') {
        const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2);
        return { x, y, w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    } else if (s.type === 'curve' || s.type === 'polyline') {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        s.points.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (s.type === 'circle') {
        return { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 };
    } else if (s.type === 'rect') {
        return { x: s.x, y: s.y, w: s.w, h: s.h };
    } else if (s.type === 'text') {
        const hw = (s.imgW || 60) / 2, hh = (s.imgH || s.fontSize) / 2;
        return { x: s.x - hw, y: s.y - hh, w: hw * 2, h: hh * 2 };
    } else if (s.type === 'arc') {
        // Sample arc to find bounds
        let minX = Math.min(s.x1, s.x2), minY = Math.min(s.y1, s.y2);
        let maxX = Math.max(s.x1, s.x2), maxY = Math.max(s.y1, s.y2);
        for (let i = 0; i <= 20; i++) {
            const p = arcPos(s, i / 20);
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else if (s.type === 'image') {
        return { x: s.x, y: s.y, w: s.w, h: s.h };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
}

// Get center of a shape
function getShapeCenter(s) {
    if (s.type === 'line') return { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    if (s.type === 'arc') return arcPos(s, 0.5);
    if (s.type === 'curve' || s.type === 'polyline') {
        const bb = getShapeBBox(s);
        return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
    }
    if (s.type === 'circle') return { x: s.cx, y: s.cy };
    if (s.type === 'rect') return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    if (s.type === 'text') return { x: s.x, y: s.y };
    if (s.type === 'image') return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    return { x: 0, y: 0 };
}

// Move a shape by (dx, dy)
function moveShape(s, dx, dy) {
    if (s.type === 'line') {
        s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
    } else if (s.type === 'arc') {
        s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
    } else if (s.type === 'curve') {
        s.controlPts.forEach(p => { p.x += dx; p.y += dy; });
        s.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (s.type === 'polyline') {
        s.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (s.type === 'circle') {
        s.cx += dx; s.cy += dy;
    } else if (s.type === 'rect') {
        s.x += dx; s.y += dy;
    } else if (s.type === 'text') {
        s.x += dx; s.y += dy;
    } else if (s.type === 'image') {
        s.x += dx; s.y += dy;
    }
}

// Deep copy a shape with a new id
function duplicateShape(s) {
    const newId = ++shapeIdCounter;
    const clone = JSON.parse(JSON.stringify(s));
    clone.id = newId;
    // Re-create Image objects which can't be cloned via JSON
    if (s.type === 'text' && s.image) {
        const img = new Image();
        img.src = s.image.src;
        clone.image = img;
    }
    if (s.type === 'image' && s.image) {
        const img = new Image();
        img.src = s.src;
        clone.image = img;
    }
    return clone;
}

// ---- Arc helpers ----
// Given an arc shape {x1,y1,x2,y2,bulge}, compute {cx,cy,r,startAngle,endAngle,sweep,ccw}
function getArcParams(s) {
    const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const chordLen = Math.hypot(dx, dy);
    if (chordLen < 1) return null;
    const bulge = s.bulge || 0.5;
    // Perpendicular offset from midpoint
    const nx = -dy / chordLen, ny = dx / chordLen;
    const sagitta = bulge * chordLen / 2;
    // Find center of circle passing through both endpoints with given sagitta
    const halfChord = chordLen / 2;
    const r = (sagitta * sagitta + halfChord * halfChord) / (2 * Math.abs(sagitta));
    const centerDist = r - Math.abs(sagitta);
    const sign = sagitta >= 0 ? 1 : -1;
    const cx = mx + nx * centerDist * sign;
    const cy = my + ny * centerDist * sign;
    const startAngle = Math.atan2(s.y1 - cy, s.x1 - cx);
    const endAngle = Math.atan2(s.y2 - cy, s.x2 - cx);
    // Determine sweep direction: bulge > 0 = ccw from start to end
    const ccw = sagitta > 0;
    let sweep = endAngle - startAngle;
    if (ccw && sweep > 0) sweep -= 2 * Math.PI;
    if (!ccw && sweep < 0) sweep += 2 * Math.PI;
    return { cx, cy, r, startAngle, endAngle, sweep, ccw };
}

// Get position along arc at fraction t (0-1)
function arcPos(shape, t) {
    const a = getArcParams(shape);
    if (!a) return { x: shape.x1, y: shape.y1 };
    const angle = a.startAngle + a.sweep * t;
    return { x: a.cx + a.r * Math.cos(angle), y: a.cy + a.r * Math.sin(angle) };
}

// Draw arc path on a context
function drawArcPath(c, s) {
    const a = getArcParams(s);
    if (!a) {
        c.beginPath(); c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); c.stroke();
        return;
    }
    c.beginPath();
    c.arc(a.cx, a.cy, a.r, a.startAngle, a.endAngle, a.ccw);
    c.stroke();
}

// ---- Snap-to-object: collect snap points from all shapes ----
function getSnapPoints(shapeList) {
    const pts = [];
    shapeList.forEach(s => {
        if (s.type === 'line') {
            pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
        } else if (s.type === 'curve' || s.type === 'polyline') {
            if (s.points && s.points.length > 0) {
                pts.push(s.points[0], s.points[s.points.length - 1]);
            }
            if (s.type === 'polyline' && s.points) {
                s.points.forEach(p => pts.push(p));
            }
        } else if (s.type === 'circle') {
            pts.push({ x: s.cx, y: s.cy });
            // Cardinal points
            pts.push({ x: s.cx, y: s.cy - s.r }, { x: s.cx + s.r, y: s.cy },
                { x: s.cx, y: s.cy + s.r }, { x: s.cx - s.r, y: s.cy });
        } else if (s.type === 'rect') {
            pts.push({ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y },
                { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h });
            // Center
            pts.push({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
        } else if (s.type === 'text') {
            pts.push({ x: s.x, y: s.y });
        } else if (s.type === 'arc') {
            pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
        } else if (s.type === 'image') {
            pts.push({ x: s.x, y: s.y }, { x: s.x + s.w, y: s.y },
                { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h });
        }
    });
    return pts;
}

function findNearestSnap(pos, shapeList, threshold) {
    threshold = threshold || 10;
    const pts = getSnapPoints(shapeList);
    let best = null, bestD = threshold;
    pts.forEach(p => {
        const d = Math.hypot(pos.x - p.x, pos.y - p.y);
        if (d < bestD) { bestD = d; best = { x: p.x, y: p.y }; }
    });
    // Snap to nearest point on circle edge
    shapeList.forEach(s => {
        if (s.type === 'circle') {
            const dx = pos.x - s.cx, dy = pos.y - s.cy;
            const d = Math.hypot(dx, dy);
            if (d > 0) {
                const ex = s.cx + (dx / d) * s.r;
                const ey = s.cy + (dy / d) * s.r;
                const edgeDist = Math.hypot(pos.x - ex, pos.y - ey);
                if (edgeDist < bestD) { bestD = edgeDist; best = { x: Math.round(ex), y: Math.round(ey) }; }
            }
        }
        // Snap to nearest point on rect edges
        if (s.type === 'rect') {
            const edges = [
                [s.x, s.y, s.x + s.w, s.y],
                [s.x + s.w, s.y, s.x + s.w, s.y + s.h],
                [s.x + s.w, s.y + s.h, s.x, s.y + s.h],
                [s.x, s.y + s.h, s.x, s.y]
            ];
            edges.forEach(([ax, ay, bx, by]) => {
                const dx = bx - ax, dy = by - ay;
                const lenSq = dx * dx + dy * dy;
                const t = lenSq === 0 ? 0 : clamp(((pos.x - ax) * dx + (pos.y - ay) * dy) / lenSq, 0, 1);
                const px = ax + t * dx, py = ay + t * dy;
                const d = Math.hypot(pos.x - px, pos.y - py);
                if (d < bestD) { bestD = d; best = { x: Math.round(px), y: Math.round(py) }; }
            });
        }
    });
    return best;
}
