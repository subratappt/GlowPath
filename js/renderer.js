// ============================================================
// GlowPath – Rendering
// ============================================================

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
    } else if (s.type === 'polyline') {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
        ctx.stroke();
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

// ---- Render frame on the main canvas ----
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
        if (shape.type === 'line' || shape.type === 'curve' || shape.type === 'polyline') {
            progress = clamp(travelDist / perim, 0, 1);
            isLoop = false;
        } else {
            // circle/rect: loop continuously
            progress = (travelDist / perim) % 1;
            isLoop = true;
        }

        // Vanish at end
        if (a.vanishAtEnd) {
            if ((shape.type === 'line' || shape.type === 'curve' || shape.type === 'polyline') && travelDist / perim >= 1) return;
            if (shape.type !== 'line' && shape.type !== 'curve' && shape.type !== 'polyline' && travelDist / perim >= 1) return;
        }

        // Reverse direction
        let effProgress = progress;
        if (a.direction === 'inward' || a.direction === 'anticlockwise') {
            effProgress = 1 - progress;
        }

        // Get position
        let px, py;
        if (shape.type === 'line') {
            px = shape.x1 + (shape.x2 - shape.x1) * effProgress;
            py = shape.y1 + (shape.y2 - shape.y1) * effProgress;
        } else if (shape.type === 'curve' || shape.type === 'polyline') {
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
        } else if (shape.type === 'curve' || shape.type === 'polyline') {
            // Continuous stroke trail along curve/polyline
            const trailFrac = 0.1;
            const steps = 50;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            for (let i = 0; i < steps - 1; i++) {
                const frac = i / steps;
                const fracNext = (i + 1) / steps;
                const sign = (a.direction === 'inward') ? 1 : -1;
                const tp = clamp(effProgress + sign * trailFrac * (1 - frac), 0, 1);
                const tpNext = clamp(effProgress + sign * trailFrac * (1 - fracNext), 0, 1);
                const tpos = curvePos(shape, tp);
                const tposNext = curvePos(shape, tpNext);
                const alpha = 0.35 * fracNext;
                const lw = a.pointerSize * (0.3 + 0.9 * fracNext);
                ctx.strokeStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                ctx.lineWidth = lw;
                ctx.beginPath();
                ctx.moveTo(tpos.x, tpos.y);
                ctx.lineTo(tposNext.x, tposNext.y);
                ctx.stroke();
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

// ---- Render frame to a specific context (for export) ----
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
        } else if (s.type === 'polyline') {
            c.lineJoin = 'round'; c.lineCap = 'round';
            c.beginPath();
            c.moveTo(s.points[0].x, s.points[0].y);
            for (let i = 1; i < s.points.length; i++) c.lineTo(s.points[i].x, s.points[i].y);
            c.stroke();
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
        if (shape.type === 'line' || shape.type === 'curve' || shape.type === 'polyline') {
            progress = clamp(travelDist / perim, 0, 1);
        } else {
            progress = (travelDist / perim) % 1;
        }

        if (a.vanishAtEnd) {
            if ((shape.type === 'line' || shape.type === 'curve' || shape.type === 'polyline') && travelDist / perim >= 1) return;
            if (shape.type !== 'line' && shape.type !== 'curve' && shape.type !== 'polyline' && travelDist / perim >= 1) return;
        }

        let effProgress = progress;
        if (a.direction === 'inward' || a.direction === 'anticlockwise') {
            effProgress = 1 - progress;
        }

        let px, py;
        if (shape.type === 'line') {
            px = shape.x1 + (shape.x2 - shape.x1) * effProgress;
            py = shape.y1 + (shape.y2 - shape.y1) * effProgress;
        } else if (shape.type === 'curve' || shape.type === 'polyline') {
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
        } else if (shape.type === 'curve' || shape.type === 'polyline') {
            const trailFrac = 0.1;
            const steps = 50;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.setLineDash([]);
            for (let i = 0; i < steps - 1; i++) {
                const frac = i / steps;
                const fracNext = (i + 1) / steps;
                const sign = (a.direction === 'inward') ? 1 : -1;
                const tp = clamp(effProgress + sign * trailFrac * (1 - frac), 0, 1);
                const tpNext = clamp(effProgress + sign * trailFrac * (1 - fracNext), 0, 1);
                const tpos = curvePos(shape, tp);
                const tposNext = curvePos(shape, tpNext);
                const alpha = 0.35 * fracNext;
                const lw = a.pointerSize * (0.3 + 0.9 * fracNext);
                c.strokeStyle = `rgba(${rc},${gc},${bc},${alpha})`;
                c.lineWidth = lw;
                c.beginPath();
                c.moveTo(tpos.x, tpos.y);
                c.lineTo(tposNext.x, tposNext.y);
                c.stroke();
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
