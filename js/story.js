// Immagine da condividere in formato storia (1080×1920): logo, km, percorso, la propria bici e i numeri dell'uscita.
// Solo disegno su canvas: i dati arrivano già pronti da app.js.

(() => {
  const W = 1080;
  const H = 1920;
  const FONT = '"Roboto Condensed", "Arial Narrow", "Helvetica Neue", system-ui, sans-serif';

  /**
   * Punti del percorso [lat, lon] proiettati (Mercatore) dentro il riquadro { x, y, w, h },
   * centrati e con le proporzioni giuste. Restituisce [[x, y], …].
   */
  function fitTrack(points, box) {
    if (points.length < 2) return [];
    const proj = points.map(([lat, lon]) => {
      const r = (lat * Math.PI) / 180;
      return [lon, (-Math.log(Math.tan(Math.PI / 4 + r / 2)) * 180) / Math.PI];
    });
    const xs = proj.map((p) => p[0]);
    const ys = proj.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX || 1e-9;
    const spanY = Math.max(...ys) - minY || 1e-9;
    const scale = Math.min(box.w / spanX, box.h / spanY);
    const offX = box.x + (box.w - spanX * scale) / 2;
    const offY = box.y + (box.h - spanY * scale) / 2;
    return proj.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);
  }

  function roundRect(ctx, rx, ry, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.arcTo(rx + w, ry, rx + w, ry + h, r);
    ctx.arcTo(rx + w, ry + h, rx, ry + h, r);
    ctx.arcTo(rx, ry + h, rx, ry, r);
    ctx.arcTo(rx, ry, rx + w, ry, r);
    ctx.closePath();
  }

  /** Testo ridotto finché non entra nella larghezza. */
  function fitFont(ctx, text, weight, size, maxW) {
    let s = size;
    ctx.font = `${weight} ${s}px ${FONT}`;
    while (ctx.measureText(text).width > maxW && s > 20) {
      s -= 2;
      ctx.font = `${weight} ${s}px ${FONT}`;
    }
    return s;
  }

  /**
   * data: { accent, dateText, km, stats: [[valore, etichetta] ×4], bikeName, bikeSub,
   *         segments: [[[lat, lon], …], …], all: [[lat, lon], …], bikeImage, logo, record }
   */
  function drawStory(canvas, data) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const accent = data.accent || '#38bdf8';

    // Sfondo: blu notte con un alone del colore dell'app in alto
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#132339');
    bg.addColorStop(1, '#070d18');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, -120, 40, W / 2, -120, 1100);
    glow.addColorStop(0, `${accent}55`);
    glow.addColorStop(1, `${accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Intestazione: logo, nome, data
    if (data.logo) {
      roundRect(ctx, 72, 84, 104, 104, 26);
      ctx.fillStyle = '#0b1422';
      ctx.fill();
      ctx.drawImage(data.logo, 82, 94, 84, 84);
    }
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 56px ${FONT}`;
    ctx.fillText('ContaKM', 204, 134);
    ctx.fillStyle = '#9fb0c4';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(data.dateText, 204, 180);

    // Km in grande
    ctx.fillStyle = accent;
    const kmSize = fitFont(ctx, data.km, 900, 200, 700);
    ctx.font = `900 ${kmSize}px ${FONT}`;
    ctx.fillText(data.km, 72, 390);
    const kmW = ctx.measureText(data.km).width;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 84px ${FONT}`;
    ctx.fillText('km', 72 + kmW + 18, 390);
    if (data.record) {
      ctx.font = `800 32px ${FONT}`;
      const label = `🏆  ${data.record}`;
      const w = ctx.measureText(label).width + 48;
      roundRect(ctx, 72, 412, w, 56, 28);
      ctx.fillStyle = '#f5b400';
      ctx.fill();
      ctx.fillStyle = '#2a1d00';
      ctx.fillText(label, 96, 451);
    }

    // Riquadro del percorso
    const panel = { x: 60, y: data.record ? 494 : 450, w: W - 120, h: data.record ? 500 : 544 };
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 44);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Griglia leggera, come una carta topografica
    ctx.save();
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 44);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let x = panel.x + 40; x < panel.x + panel.w; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, panel.y);
      ctx.lineTo(x, panel.y + panel.h);
      ctx.stroke();
    }
    for (let y = panel.y + 40; y < panel.y + panel.h; y += 80) {
      ctx.beginPath();
      ctx.moveTo(panel.x, y);
      ctx.lineTo(panel.x + panel.w, y);
      ctx.stroke();
    }
    ctx.restore();

    const box = { x: panel.x + 70, y: panel.y + 60, w: panel.w - 140, h: panel.h - 120 };
    const all = data.all || [];
    if (all.length >= 2) {
      const pts = fitTrack(all, box);
      const index = new Map(all.map((p, i) => [p, i]));
      const line = (list) => {
        ctx.beginPath();
        list.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Tratti senza GPS: puntini
      ctx.setLineDash([2, 22]);
      ctx.strokeStyle = `${accent}aa`;
      ctx.lineWidth = 10;
      line(pts);
      ctx.setLineDash([]);
      // Tratti registrati: linea piena con alone
      const segs = (data.segments || []).map((s) => s.map((p) => pts[index.get(p)]).filter(Boolean));
      ctx.shadowColor = accent;
      ctx.shadowBlur = 34;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 14;
      for (const s of segs) if (s.length >= 2) line(s);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.55;
      for (const s of segs) if (s.length >= 2) line(s);
      ctx.globalAlpha = 1;
      for (const [p, color] of [[pts[0], '#22c55e'], [pts[pts.length - 1], '#ef4444']]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 20, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p[0], p[1], 13, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#6f8199';
      ctx.font = `600 36px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Percorso non registrato', W / 2, panel.y + panel.h / 2 - 60);
      ctx.textAlign = 'left';
    }

    // La bici, appoggiata sul bordo basso del riquadro
    if (data.bikeImage) {
      const bw = 860;
      const bh = (bw * data.bikeImage.height) / data.bikeImage.width;
      ctx.drawImage(data.bikeImage, (W - bw) / 2, 1000 - 40, bw, bh);
    }
    let y = data.bikeImage ? 1530 : panel.y + panel.h + 90;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, data.bikeName, 800, 46, W - 160);
    ctx.fillText(data.bikeName, W / 2, y);
    ctx.fillStyle = '#9fb0c4';
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(data.bikeSub, W / 2, y + 46);

    // Numeri dell'uscita
    y += 84;
    const cols = data.stats.length;
    const gap = 18;
    const cw = (W - 120 - gap * (cols - 1)) / cols;
    data.stats.forEach(([value, label], i) => {
      const x = 60 + i * (cw + gap);
      roundRect(ctx, x, y, cw, 170, 30);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      fitFont(ctx, value, 800, 64, cw - 24);
      ctx.fillText(value, x + cw / 2, y + 88);
      ctx.fillStyle = '#9fb0c4';
      fitFont(ctx, label, 600, 28, cw - 20);
      ctx.fillText(label, x + cw / 2, y + 136);
    });

    // Piede
    ctx.fillStyle = '#6f8199';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText('Registrato con ContaKM · rosariomarra.github.io/ContaKM', W / 2, H - 70);
    ctx.textAlign = 'left';
    return canvas;
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.story = { W, H, fitTrack, drawStory };
})();
