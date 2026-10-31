/* DrawPad — 模試アプリ用の作図ツール
 * mode "graph": 数学のグラフ（座標平面）
 * mode "tech" : Basic Technology の製図（A4 横 297×210 mm の製図板）
 * 図形はすべてワールド座標（graph: 数学座標 / tech: mm, y 下向き）で保存する。
 */
(function () {
  const TAU = Math.PI * 2;
  const INK = "#1d1d1f", GIVEN = "#2f6fb3", MODEL = "#1f8a4c";
  const STYLES = {
    thick: { w: 2.4, dash: [] }, thin: { w: 0.9, dash: [] }, hidden: { w: 1.3, dash: [6, 4] },
    centre: { w: 0.9, dash: [16, 3, 2, 3] }, solid: { w: 2, dash: [] }, dashed: { w: 2, dash: [9, 6] },
  };
  const TECH_STYLES = [["thick", "外形線（太）"], ["thin", "細線（作図線・寸法線）"], ["hidden", "かくれ線（破線）"], ["centre", "中心線（一点鎖線）"]];
  const GRAPH_STYLES = [["solid", "実線（≤ ≥）"], ["dashed", "破線（< >）"]];
  const TECH_TOOLS = [
    ["pencil", "✏️", "鉛筆（フリーハンド）"], ["ruler", "📏", "定規（自由な直線）"], ["tsquare", "⊢", "T定規（水平線）"],
    ["set45", "◺45", "三角定規 45°（0°/45°/90°…）"], ["set30", "◺30", "三角定規 30°/60°（0°/30°/60°/90°…）"],
    ["protractor", "◠°", "分度器（角度を指定した直線）"], ["compass", "⌒", "コンパス（円・円弧）"],
    ["measure", "↔", "ものさし（長さ・角度を測る）"], ["text", "A", "文字（ラベル）"], ["eraser", "⌫", "消しゴム（なぞった線を消す）"],
  ];
  const GRAPH_TOOLS = [
    ["point", "•", "点"], ["seg", "／", "線分（2点）"], ["xline", "⟷", "直線（2点を通る・両端まで）"],
    ["curve", "∿", "なめらかな曲線（点をクリック→ダブルクリックで完了）"], ["pencil", "✏️", "フリーハンド"],
    ["shadeSide", "▧", "直線の片側を塗る（直線→塗る側をクリック）"], ["shadePoly", "⬠", "多角形で塗る（ダブルクリックで完了）"],
    ["text", "A", "文字"], ["eraser", "⌫", "消しゴム"],
  ];

  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const clone = o => JSON.parse(JSON.stringify(o));
  const r2 = v => Math.round(v * 100) / 100;

  function catmull(pts, n = 12) {
    if (pts.length < 3) return pts.slice();
    const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function distLine(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
  }
  function inSweep(ang, a0, sw) {
    if (Math.abs(sw) >= TAU - 1e-9) return true;
    let d = (ang - a0) * Math.sign(sw); d = ((d % TAU) + TAU) % TAU;
    return d <= Math.abs(sw) + 1e-9;
  }
  function pointInPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function clipHalf(poly, a, b, side) { // keep points where cross(b-a, p-a)*side >= 0
    const f = p => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * side;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
      if (fp >= 0) out.push(P);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out;
  }
  // ---- intersections (world) ----
  function segSeg(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return [];
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [[a[0] + t * r[0], a[1] + t * r[1]]] : [];
  }
  function segCirc(a, b, c, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - c[0], fy = a[1] - c[1];
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r, disc = B * B - 4 * A * C;
    if (A === 0 || disc < 0) return [];
    const q = Math.sqrt(disc), out = [];
    for (const t of [(-B - q) / (2 * A), (-B + q) / (2 * A)]) if (t >= -1e-9 && t <= 1 + 1e-9) out.push([a[0] + t * dx, a[1] + t * dy]);
    return out;
  }
  function circCirc(c1, r1, c2, r2_) {
    const d = d2(c1, c2);
    if (d < 1e-9 || d > r1 + r2_ || d < Math.abs(r1 - r2_)) return [];
    const a = (r1 * r1 - r2_ * r2_ + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = c1[0] + a * (c2[0] - c1[0]) / d, my = c1[1] + a * (c2[1] - c1[1]) / d;
    return [[mx + h * (c2[1] - c1[1]) / d, my - h * (c2[0] - c1[0]) / d], [mx - h * (c2[1] - c1[1]) / d, my + h * (c2[0] - c1[0]) / d]];
  }
  const onArc = (p, s) => s.t !== "arc" || inSweep(Math.atan2(p[1] - s.c[1], p[0] - s.c[0]), s.a0, s.sw);

  class DrawPad {
    constructor(host, cfg, opts = {}) {
      this.host = host; this.cfg = cfg; this.mode = cfg.mode;
      this.shapes = clone((opts.value && opts.value.shapes) || []);
      this.given = cfg.given || []; this.model = opts.model || null;
      this.readOnly = !!opts.readOnly; this.onChange = opts.onChange || (() => {});
      this.tool = this.mode === "tech" ? "ruler" : "seg";
      this.style = this.mode === "tech" ? "thick" : "solid";
      this.undo = []; this.redo = []; this.tmp = null; this.cursor = null; this.snapPt = null; this.measure = null;
      this.gridSnap = this.mode === "graph"; this.objSnap = true;
      this.build(); this.resize();
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.wrap);
    }

    /* ---------- layout ---------- */
    build() {
      const h = this.host; h.innerHTML = ""; h.classList.add("dp");
      this.wrap = document.createElement("div"); this.wrap.className = "dp-wrap";
      if (!this.readOnly) {
        const tools = this.mode === "tech" ? TECH_TOOLS : GRAPH_TOOLS, styles = this.mode === "tech" ? TECH_STYLES : GRAPH_STYLES;
        const bar = document.createElement("div"); bar.className = "dp-bar";
        bar.innerHTML = `<div class="dp-tools">${tools.map(([k, ic, tip]) => `<button type="button" data-tool="${k}" title="${tip}"><span>${ic}</span><small>${tip.split("（")[0]}</small></button>`).join("")}</div>
          <div class="dp-opts">
            <label>線<select data-o="style">${styles.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
            ${this.mode === "tech" ? `<label title="定規・三角定規・分度器で引く線の長さを固定（空欄なら自由）">長さ<input data-o="len" type="number" min="0" step="0.5" placeholder="自由">mm</label>
            <label title="分度器で引く線の角度（右向き水平=0°、反時計回り）">角度<input data-o="ang" type="number" step="1" value="60">°</label>
            <label title="コンパスの半径を固定（空欄ならクリックで決める）">半径<input data-o="rad" type="number" min="0" step="0.5" placeholder="自由">mm</label>
            <label title="コンパスで完全な円を描く"><input data-o="full" type="checkbox">円にする</label>
            <label title="5mm 方眼に吸着"><input data-o="grid" type="checkbox">方眼吸着</label>`
            : `<label title="格子点に吸着"><input data-o="grid" type="checkbox" checked>格子に吸着</label>`}
            <label title="端点・交点・中心に吸着"><input data-o="obj" type="checkbox" checked>点に吸着</label>
            <span class="dp-sp"></span>
            <button type="button" data-a="undo" title="元に戻す">↶</button><button type="button" data-a="redo" title="やり直す">↷</button>
            <button type="button" data-a="clear" title="自分の描いた線をすべて消す">全消去</button>
            <button type="button" data-a="full" title="大きな画面で描く">⛶ 拡大</button>
          </div>`;
        this.wrap.appendChild(bar); this.bar = bar;
        bar.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => this.setTool(b.dataset.tool));
        const o = k => bar.querySelector(`[data-o="${k}"]`);
        o("style").onchange = e => { this.style = e.target.value; };
        o("grid").onchange = e => { this.gridSnap = e.target.checked; };
        o("obj").onchange = e => { this.objSnap = e.target.checked; };
        this.opt = k => { const el = o(k); if (!el) return null; if (el.type === "checkbox") return el.checked; const v = parseFloat(el.value); return isFinite(v) && v > 0 || (k === "ang" && isFinite(v)) ? v : null; };
        bar.querySelector('[data-a="undo"]').onclick = () => this.doUndo();
        bar.querySelector('[data-a="redo"]').onclick = () => this.doRedo();
        bar.querySelector('[data-a="clear"]').onclick = () => { if (this.shapes.length && confirm("自分の描いた線をすべて消しますか？")) { this.push(); this.shapes = []; this.changed(); } };
        bar.querySelector('[data-a="full"]').onclick = e => { this.host.classList.toggle("dp-full"); e.target.textContent = this.host.classList.contains("dp-full") ? "✕ 閉じる" : "⛶ 拡大"; setTimeout(() => this.resize(), 30); };
      }
      this.cv = document.createElement("canvas"); this.cv.className = "dp-cv";
      this.info = document.createElement("div"); this.info.className = "dp-info";
      this.wrap.appendChild(this.cv); this.wrap.appendChild(this.info); h.appendChild(this.wrap);
      this.ctx = this.cv.getContext("2d");
      if (!this.readOnly) {
        this.cv.addEventListener("pointerdown", e => this.down(e));
        this.cv.addEventListener("pointermove", e => this.move(e));
        this.cv.addEventListener("pointerup", e => this.up(e));
        this.cv.addEventListener("dblclick", e => this.dbl(e));
        this.cv.addEventListener("pointerleave", () => { this.cursor = null; this.draw(); });
        this.keyh = e => { if (!this.host.isConnected) return document.removeEventListener("keydown", this.keyh);
          if (e.key === "Escape") { this.tmp = null; this.draw(); }
          if (e.key === "Enter" && this.tmp && this.tmp.pts) this.finishPoly(); };
        document.addEventListener("keydown", this.keyh);
        this.setTool(this.tool);
      }
    }
    setTool(t) {
      this.tool = t; this.tmp = null; this.measure = null;
      this.bar && this.bar.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t));
      this.cv.style.cursor = t === "eraser" ? "cell" : "crosshair";
      this.hint(); this.draw();
    }
    hint() {
      const H = {
        pencil: "ドラッグして自由に描きます。", ruler: "始点をクリック → 終点をクリック（ドラッグでも可）。Shift で15°刻み。",
        tsquare: "水平な線を引きます。始点 → 終点。", set45: "0°・45°・90°・135°の線を引きます。",
        set30: "0°・30°・60°・90°・120°・150°の線を引きます。", protractor: "上の「角度」で指定した向きの線を引きます。始点 → 終点。",
        compass: "① 中心をクリック → ② 半径の位置をクリック → ③ 円弧の終わりをクリック（「円にする」なら②で完成）。",
        measure: "2点をクリックすると長さと角度を表示します（線は残りません）。", text: "文字を置く位置をクリックします。",
        eraser: "消したい線をクリックまたはなぞります（問題の図は消えません）。",
        point: "格子点をクリックして点を打ちます。", seg: "2点をクリックして線分を引きます。", xline: "2点をクリックすると、その2点を通る直線を端まで引きます。",
        curve: "点を順にクリック → ダブルクリック（または Enter）で曲線が完成します。",
        shadeSide: "① 境界の直線をクリック → ② 塗りたい側をクリック。", shadePoly: "頂点を順にクリック → ダブルクリックで塗ります。",
      };
      this.info.textContent = H[this.tool] || "";
    }

    resize() {
      const W = Math.max(280, this.wrap.clientWidth);
      const full = this.host.classList.contains("dp-full");
      let H;
      if (this.mode === "tech") {
        const bw = this.cfg.board?.w || 297, bh = this.cfg.board?.h || 210;
        let w = W;
        if (full) { const avail = window.innerHeight - (this.bar ? this.bar.offsetHeight : 0) - 50; if (w * bh / bw > avail) w = avail * bw / bh; }
        this.s = w / bw; H = bh * this.s; this.cw = w;
      } else {
        const g = this.cfg.graph, xr = g.xmax - g.xmin, yr = g.ymax - g.ymin, p = 34;
        let w = full ? Math.min(W, (window.innerHeight - (this.bar ? this.bar.offsetHeight : 0) - 50) * 1.25) : Math.min(W, 640);
        this.pad = p; this.sx = (w - 2 * p) / xr;
        this.sy = g.equal === false ? this.sx * (g.yscale || 1) : this.sx;
        if (g.equal === false && !g.yscale) this.sy = (w * 0.72 - 2 * p) / yr;
        H = yr * this.sy + 2 * p; this.cw = w;
      }
      const dpr = window.devicePixelRatio || 1;
      this.cv.style.width = this.cw + "px"; this.cv.style.height = H + "px";
      this.cv.width = Math.round(this.cw * dpr); this.cv.height = Math.round(H * dpr); this.ch = H; this.dpr = dpr;
      this.draw();
    }
    // world <-> screen
    W2S(p) {
      if (this.mode === "tech") return [p[0] * this.s, p[1] * this.s];
      const g = this.cfg.graph; return [this.pad + (p[0] - g.xmin) * this.sx, this.pad + (g.ymax - p[1]) * this.sy];
    }
    S2W(p) {
      if (this.mode === "tech") return [p[0] / this.s, p[1] / this.s];
      const g = this.cfg.graph; return [g.xmin + (p[0] - this.pad) / this.sx, g.ymax - (p[1] - this.pad) / this.sy];
    }
    scale() { return this.mode === "tech" ? this.s : this.sx; }

    /* ---------- snapping ---------- */
    snapCands() {
      if (this._cands) return this._cands;
      const all = this.given.concat(this.shapes), pts = [];
      for (const s of all) {
        if (s.t === "seg") pts.push(s.a, s.b, [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]);
        if (s.t === "pt") pts.push(s.p);
        if (s.t === "arc") { pts.push(s.c); if (Math.abs(s.sw) < TAU - 1e-6) pts.push([s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)], [s.c[0] + s.r * Math.cos(s.a0 + s.sw), s.c[1] + s.r * Math.sin(s.a0 + s.sw)]); }
        if (s.t === "path" && !s.smooth && s.pts.length) pts.push(s.pts[0], s.pts[s.pts.length - 1]);
      }
      const geo = all.filter(s => s.t === "seg" || s.t === "arc" || s.t === "xline");
      for (let i = 0; i < geo.length; i++) for (let j = i + 1; j < geo.length; j++) {
        const A = geo[i], B = geo[j]; let r = [];
        const segOf = s => s.t === "xline" ? this.xlineSeg(s) : [s.a, s.b];
        if (A.t !== "arc" && B.t !== "arc") r = segSeg(...segOf(A), ...segOf(B));
        else if (A.t === "arc" && B.t === "arc") r = circCirc(A.c, A.r, B.c, B.r);
        else { const [L, C] = A.t === "arc" ? [B, A] : [A, B]; r = segCirc(...segOf(L), C.c, C.r); }
        for (const p of r) if (onArc(p, A) && onArc(p, B)) pts.push(p);
      }
      return (this._cands = pts);
    }
    snap(w, opts = {}) {
      const sc = this.scale(), tol = 9 / sc;
      if (this.objSnap && !opts.noObj) {
        let best = null, bd = tol;
        for (const p of this.snapCands()) { const d = d2(p, w); if (d < bd) { bd = d; best = p; } }
        if (best) { this.snapPt = best; return best.slice(); }
      }
      this.snapPt = null;
      if (this.gridSnap) {
        const st = this.mode === "tech" ? 5 : (this.cfg.graph.snap || 1), sty = this.mode === "tech" ? st : (this.cfg.graph.snapY || st);
        const g = [Math.round(w[0] / st) * st, Math.round(w[1] / sty) * sty];
        if (this.mode === "tech" || d2(this.W2S(g), this.W2S(w)) < 14) return g;
      }
      return w;
    }
    xlineSeg(s) {
      const g = this.cfg.graph, dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy) || 1, big = (g.xmax - g.xmin + g.ymax - g.ymin) * 2;
      return [[s.a[0] - dx / L * big, s.a[1] - dy / L * big], [s.a[0] + dx / L * big, s.a[1] + dy / L * big]];
    }

    /* ---------- tech line constraint ---------- */
    constrain(a, w, e) {
      let dx = w[0] - a[0], dy = w[1] - a[1], ang = Math.atan2(-dy, dx), len = Math.hypot(dx, dy);
      const t = this.tool, step = { tsquare: Math.PI, set45: Math.PI / 4, set30: Math.PI / 6 }[t] || (e && e.shiftKey ? Math.PI / 12 : 0);
      if (t === "protractor") { const want = (this.opt("ang") || 0) * Math.PI / 180, alt = want + Math.PI;
        ang = Math.abs(Math.atan2(Math.sin(ang - want), Math.cos(ang - want))) <= Math.PI / 2 ? want : alt;
        len = Math.max(0, dx * Math.cos(ang) - dy * Math.sin(ang)); }
      else if (step) { const q = Math.round(ang / step) * step; len = dx * Math.cos(q) - dy * Math.sin(q); ang = q; if (len < 0) { len = -len; ang += Math.PI; } }
      const fixed = this.opt && this.opt("len"); if (fixed) len = fixed;
      if (!step && t !== "protractor" && !fixed) return w;
      return [a[0] + len * Math.cos(ang), a[1] - len * Math.sin(ang)];
    }

    /* ---------- pointer ---------- */
    pos(e) { const r = this.cv.getBoundingClientRect(); return this.S2W([e.clientX - r.left, e.clientY - r.top]); }
    down(e) {
      e.preventDefault(); this.cv.setPointerCapture(e.pointerId);
      const raw = this.pos(e), t = this.tool; this.downAt = [e.clientX, e.clientY]; this.dragging = true;
      if (t === "eraser") { this.push(); this.erasedAny = false; this.eraseAt(raw); return; }
      if (t === "pencil") { this.tmp = { t: "path", pts: [raw], st: this.style }; return; }
      if (t === "text") { const s = prompt("文字を入力してください（例: FRONT ELEVATION, A, B）"); if (s) this.add({ t: "text", p: this.snap(raw), s, size: this.mode === "tech" ? 5 : 14 }); this.dragging = false; return; }
      if (t === "point") { this.add({ t: "pt", p: this.snap(raw) }); this.dragging = false; return; }
      if (t === "shadeSide") {
        if (!this.tmp) { const L = this.pick(raw, s => s.t === "seg" || s.t === "xline"); if (L) { this.tmp = { t: "shadeSide", line: L }; this.info.textContent = "塗りたい側をクリックしてください。"; } else this.info.textContent = "先に境界の直線をクリックしてください。"; }
        else { this.shadeSide(this.tmp.line, raw); this.tmp = null; this.hint(); }
        this.dragging = false; this.draw(); return;
      }
      if (t === "curve" || t === "shadePoly") { const p = this.snap(raw); if (!this.tmp) this.tmp = { t, pts: [p] }; else this.tmp.pts.push(p); this.dragging = false; this.draw(); return; }
      if (t === "compass") {
        const p = this.snap(raw);
        if (!this.tmp) { this.tmp = { t: "compass", c: p, stage: 1 }; const rf = this.opt("rad"); if (rf) { this.tmp.r = rf; this.tmp.stage = 2; } }
        else if (this.tmp.stage === 1) { this.tmp.r = d2(this.tmp.c, p); if (this.tmp.r < 1e-6) return; this.tmp.a0 = Math.atan2(p[1] - this.tmp.c[1], p[0] - this.tmp.c[0]); this.tmp.sw = 0; this.tmp.last = this.tmp.a0; this.tmp.stage = 3;
          if (this.opt("full")) { this.add({ t: "arc", c: this.tmp.c, r: this.tmp.r, a0: 0, sw: TAU, st: this.style }); this.tmp = null; } }
        else if (this.tmp.stage === 2) { this.tmp.a0 = Math.atan2(p[1] - this.tmp.c[1], p[0] - this.tmp.c[0]); this.tmp.sw = 0; this.tmp.last = this.tmp.a0; this.tmp.stage = 3;
          if (this.opt("full")) { this.add({ t: "arc", c: this.tmp.c, r: this.tmp.r, a0: 0, sw: TAU, st: this.style }); this.tmp = null; } }
        else if (this.tmp.stage === 3) { if (Math.abs(this.tmp.sw) > 0.01) this.add({ t: "arc", c: this.tmp.c, r: this.tmp.r, a0: this.tmp.a0, sw: this.tmp.sw, st: this.style }); this.tmp = null; }
        this.dragging = false; this.draw(); return;
      }
      // two-point tools: ruler/tsquare/set45/set30/protractor/measure/seg/xline
      const p = this.snap(raw);
      if (!this.tmp) { this.tmp = { t, a: p, b: p }; this.measure = null; }
      else { this.finishTwo(this.tmp.b); }
      this.draw();
    }
    move(e) {
      const raw = this.pos(e); this.cursor = raw; const t = this.tool;
      if (t === "eraser") { if (this.dragging) this.eraseAt(raw); this.draw(); return; }
      if (t === "pencil" && this.tmp && this.dragging) { const L = this.tmp.pts[this.tmp.pts.length - 1]; if (d2(L, raw) * this.scale() > 1.5) this.tmp.pts.push(raw); this.draw(); return; }
      let p = this.snap(raw, { noObj: t === "pencil" });
      if (this.tmp && this.tmp.a && this.mode === "tech" && t !== "measure") { const c = this.constrain(this.tmp.a, p, e); if (c !== p) { p = c; this.snapPt = null; } }
      if (this.tmp && this.tmp.a) this.tmp.b = p;
      if (this.tmp && this.tmp.t === "compass" && this.tmp.stage === 3) {
        const a = Math.atan2(p[1] - this.tmp.c[1], p[0] - this.tmp.c[0]); let da = a - this.tmp.last;
        da = Math.atan2(Math.sin(da), Math.cos(da)); this.tmp.sw = Math.max(-TAU, Math.min(TAU, this.tmp.sw + da)); this.tmp.last = a;
      }
      this.cursorSnap = p; this.draw();
    }
    up(e) {
      this.dragging = false;
      if (this.tool === "eraser") { if (!this.erasedAny) this.undo.pop(); else this.changed(); return; }
      if (this.tool === "pencil" && this.tmp) { if (this.tmp.pts.length > 1) this.add(this.tmp); this.tmp = null; return; }
      if (this.tmp && this.tmp.a && this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 6) this.finishTwo(this.tmp.b);
    }
    dbl(e) { if (this.tmp && this.tmp.pts) { this.tmp.pts.pop(); this.finishPoly(); } }
    finishPoly() {
      const T = this.tmp; this.tmp = null;
      const pts = T.pts.filter((p, i) => i === 0 || d2(p, T.pts[i - 1]) > 1e-9);
      if (T.t === "curve" && pts.length >= 2) this.add({ t: "path", pts, smooth: true, st: this.style });
      if (T.t === "shadePoly" && pts.length >= 3) this.add({ t: "fill", pts });
      this.draw();
    }
    finishTwo(b) {
      const T = this.tmp; this.tmp = null; const a = T.a;
      if (d2(a, b) * this.scale() < 3) { this.draw(); return; }
      if (T.t === "measure") { this.measure = { a, b }; this.draw(); return; }
      if (T.t === "xline") this.add({ t: "xline", a, b, st: this.style });
      else this.add({ t: "seg", a, b, st: this.style });
    }
    shadeSide(L, p) {
      const g = this.cfg.graph, rect = [[g.xmin, g.ymin], [g.xmax, g.ymin], [g.xmax, g.ymax], [g.xmin, g.ymax]];
      const side = Math.sign((L.b[0] - L.a[0]) * (p[1] - L.a[1]) - (L.b[1] - L.a[1]) * (p[0] - L.a[0])) || 1;
      const poly = clipHalf(rect, L.a, L.b, side);
      if (poly.length >= 3) this.add({ t: "fill", pts: poly });
    }

    /* ---------- edit ---------- */
    push() { this.undo.push(clone(this.shapes)); if (this.undo.length > 200) this.undo.shift(); this.redo = []; }
    add(s) { this.push(); this.shapes.push(s); this.changed(); }
    changed() { this._cands = null; this.onChange({ shapes: this.shapes }); this.draw(); }
    doUndo() { if (!this.undo.length) return; this.redo.push(clone(this.shapes)); this.shapes = this.undo.pop(); this.changed(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(clone(this.shapes)); this.shapes = this.redo.pop(); this.changed(); }
    hitDist(s, w) {
      switch (s.t) {
        case "seg": return distSeg(w, s.a, s.b);
        case "xline": return distLine(w, s.a, s.b);
        case "arc": { const d = Math.abs(d2(w, s.c) - s.r); return onArc(w, s) ? d : Infinity; }
        case "path": { const P = s.smooth ? catmull(s.pts) : s.pts; let m = Infinity; for (let i = 1; i < P.length; i++) m = Math.min(m, distSeg(w, P[i - 1], P[i])); return P.length === 1 ? d2(w, P[0]) : m; }
        case "pt": return d2(w, s.p);
        case "text": { const sz = this.mode === "tech" ? s.size : s.size / this.sx, wd = s.s.length * sz * 0.6;
          const inX = w[0] >= s.p[0] - 1 / this.scale() && w[0] <= s.p[0] + wd, inY = this.mode === "tech" ? (w[1] <= s.p[1] && w[1] >= s.p[1] - sz) : (w[1] <= s.p[1] && w[1] >= s.p[1] - s.size / this.sy);
          return inX && inY ? 0 : Infinity; }
        case "fill": return pointInPoly(w, s.pts) ? 0.5 * 8 / this.scale() : Infinity;
      }
      return Infinity;
    }
    pick(w, filter) {
      const tol = 8 / this.scale(); let best = null, bd = tol;
      for (const s of this.shapes.concat(this.given)) { if (filter && !filter(s)) continue; const d = this.hitDist(s, w); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    eraseAt(w) {
      const tol = 7 / this.scale(); let i = -1, bd = tol;
      this.shapes.forEach((s, k) => { const d = this.hitDist(s, w); if (d < bd || (d === bd && s.t !== "fill")) { bd = d; i = k; } });
      if (i >= 0) { this.shapes.splice(i, 1); this.erasedAny = true; this._cands = null; this.draw(); }
    }

    /* ---------- render ---------- */
    draw() {
      const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.render(c, this.cw, this.ch, true);
    }
    render(c, Wd, Hd, live) {
      c.save(); c.fillStyle = "#ffffff"; c.fillRect(0, 0, Wd, Hd);
      this.mode === "tech" ? this.paper(c, Wd, Hd) : this.axes(c);
      const all = [...this.given.map(s => [s, GIVEN]), ...(this.model ? this.model.map(s => [s, MODEL]) : []), ...this.shapes.map(s => [s, INK])];
      c.save();
      if (this.mode === "graph") { const [x0, y0] = this.W2S([this.cfg.graph.xmin, this.cfg.graph.ymax]), [x1, y1] = this.W2S([this.cfg.graph.xmax, this.cfg.graph.ymin]);
        c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip(); }
      for (const [s, col] of all) if (s.t === "fill") this.shape(c, s, col);
      for (const [s, col] of all) if (s.t !== "fill") this.shape(c, s, col);
      c.restore();
      if (live) this.overlay(c);
      c.restore();
    }
    paper(c, Wd, Hd) {
      const s = this.s; c.lineWidth = 0.5;
      for (let x = 0; x <= (this.cfg.board?.w || 297); x += 5) { c.strokeStyle = x % 10 ? "#f1f4f8" : "#e1e7ef"; c.beginPath(); c.moveTo(x * s, 0); c.lineTo(x * s, Hd); c.stroke(); }
      for (let y = 0; y <= (this.cfg.board?.h || 210); y += 5) { c.strokeStyle = y % 10 ? "#f1f4f8" : "#e1e7ef"; c.beginPath(); c.moveTo(0, y * s); c.lineTo(Wd, y * s); c.stroke(); }
      c.strokeStyle = "#9aa4b2"; c.lineWidth = 1; c.strokeRect(0.5, 0.5, Wd - 1, Hd - 1);
    }
    axes(c) {
      const g = this.cfg.graph, st = g.step || 1, sty = g.stepY || st;
      c.lineWidth = 1; c.font = "12px system-ui, sans-serif"; c.fillStyle = "#555";
      for (let x = Math.ceil(g.xmin / st) * st; x <= g.xmax + 1e-9; x += st) { const [X] = this.W2S([x, 0]); c.strokeStyle = "#e3e7ed"; c.beginPath(); c.moveTo(X, this.pad); c.lineTo(X, this.ch - this.pad); c.stroke(); }
      for (let y = Math.ceil(g.ymin / sty) * sty; y <= g.ymax + 1e-9; y += sty) { const [, Y] = this.W2S([0, y]); c.strokeStyle = "#e3e7ed"; c.beginPath(); c.moveTo(this.pad, Y); c.lineTo(this.cw - this.pad, Y); c.stroke(); }
      const ox = Math.min(Math.max(0, g.xmin), g.xmax), oy = Math.min(Math.max(0, g.ymin), g.ymax);
      const [OX, OY] = this.W2S([ox, oy]); c.strokeStyle = "#333"; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(this.pad - 8, OY); c.lineTo(this.cw - this.pad + 10, OY); c.moveTo(OX, this.ch - this.pad + 8); c.lineTo(OX, this.pad - 10); c.stroke();
      c.fillStyle = "#333"; c.beginPath(); c.moveTo(this.cw - this.pad + 14, OY); c.lineTo(this.cw - this.pad + 6, OY - 4); c.lineTo(this.cw - this.pad + 6, OY + 4); c.fill();
      c.beginPath(); c.moveTo(OX, this.pad - 14); c.lineTo(OX - 4, this.pad - 6); c.lineTo(OX + 4, this.pad - 6); c.fill();
      c.fillStyle = "#444"; c.textAlign = "center"; c.textBaseline = "top";
      const lx = g.labelEvery || st, ly = g.labelEveryY || sty;
      for (let x = Math.ceil(g.xmin / lx) * lx; x <= g.xmax + 1e-9; x += lx) { if (Math.abs(x - ox) < 1e-9 && !g.xLabels) continue; const [X] = this.W2S([x, 0]); const lab = g.xLabels ? g.xLabels[String(x)] : String(r2(x)); if (lab != null) c.fillText(lab, X, OY + 4); }
      c.textAlign = "right"; c.textBaseline = "middle";
      for (let y = Math.ceil(g.ymin / ly) * ly; y <= g.ymax + 1e-9; y += ly) { if (Math.abs(y - oy) < 1e-9) continue; const [, Y] = this.W2S([0, y]); c.fillText(String(r2(y)), OX - 5, Y); }
      c.textAlign = "left"; c.textBaseline = "alphabetic"; c.font = "italic 13px system-ui, sans-serif";
      c.fillText(g.xTitle || "x", this.cw - this.pad + 2, OY - 8); c.fillText(g.yTitle || "y", OX + 8, this.pad - 4);
      if (!g.xLabels) { c.textAlign = "right"; c.fillText("0", OX - 4, OY + 14); }
    }
    stroke(c, st, col) {
      const S = STYLES[st] || STYLES.thick; c.strokeStyle = col; c.lineWidth = S.w; c.setLineDash(S.dash); c.lineCap = "round"; c.lineJoin = "round";
    }
    shape(c, s, col) {
      c.save();
      if (s.t === "seg" || s.t === "xline") {
        const [a, b] = s.t === "xline" ? this.xlineSeg(s) : [s.a, s.b];
        this.stroke(c, s.st, col); c.beginPath(); c.moveTo(...this.W2S(a)); c.lineTo(...this.W2S(b)); c.stroke();
      } else if (s.t === "arc") {
        this.stroke(c, s.st, col); const [X, Y] = this.W2S(s.c); c.beginPath(); c.arc(X, Y, s.r * this.scale(), s.a0, s.a0 + s.sw, s.sw < 0); c.stroke();
      } else if (s.t === "path") {
        this.stroke(c, s.st || "solid", col); const P = (s.smooth ? catmull(s.pts) : s.pts).map(p => this.W2S(p));
        c.beginPath(); P.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke();
      } else if (s.t === "pt") {
        const [X, Y] = this.W2S(s.p); c.fillStyle = col; c.beginPath(); c.arc(X, Y, 3.5, 0, TAU); c.fill();
        if (s.label) { c.font = "13px system-ui, sans-serif"; c.fillText(s.label, X + 6, Y - 6); }
      } else if (s.t === "fill") {
        c.fillStyle = col === INK ? "rgba(29,95,168,0.22)" : col === MODEL ? "rgba(31,138,76,0.2)" : "rgba(47,111,179,0.15)";
        c.beginPath(); s.pts.forEach((p, i) => i ? c.lineTo(...this.W2S(p)) : c.moveTo(...this.W2S(p))); c.closePath(); c.fill();
      } else if (s.t === "text") {
        const px = this.mode === "tech" ? s.size * this.s : s.size; c.fillStyle = col; c.font = `${px}px "Segoe UI", system-ui, sans-serif`;
        const [X, Y] = this.W2S(s.p); c.textBaseline = this.mode === "tech" ? "alphabetic" : "top"; c.fillText(s.s, X, Y);
      }
      c.restore();
    }
    overlay(c) {
      const T = this.tmp, t = this.tool;
      // preview
      if (T && T.a) {
        if (T.t === "measure") { c.save(); c.strokeStyle = "#d97706"; c.setLineDash([4, 3]); c.lineWidth = 1.2; c.beginPath(); c.moveTo(...this.W2S(T.a)); c.lineTo(...this.W2S(T.b)); c.stroke(); c.restore(); }
        else this.shape(c, T.t === "xline" ? { t: "xline", a: T.a, b: T.b, st: this.style } : { t: "seg", a: T.a, b: T.b, st: this.style }, "#3b82f6");
        if (this.mode === "tech") { this.tools(c, T.a, T.b); this.readout(c, T.a, T.b); }
      }
      if (this.measure) { const { a, b } = this.measure; c.save(); c.strokeStyle = "#d97706"; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(...this.W2S(a)); c.lineTo(...this.W2S(b)); c.stroke(); c.restore(); this.readout(c, a, b, true); }
      if (T && T.pts && T.t !== "path") {
        const pts = this.cursorSnap ? T.pts.concat([this.cursorSnap]) : T.pts;
        if (T.t === "curve") this.shape(c, { t: "path", pts, smooth: true, st: this.style }, "#3b82f6");
        else this.shape(c, { t: "fill", pts }, "#3b82f6");
        c.fillStyle = "#3b82f6"; T.pts.forEach(p => { const [X, Y] = this.W2S(p); c.beginPath(); c.arc(X, Y, 3, 0, TAU); c.fill(); });
      }
      if (T && T.t === "path") this.shape(c, T, "#3b82f6");
      if (T && T.t === "shadeSide") this.shape(c, Object.assign({}, T.line, { st: "solid" }), "#f59e0b");
      if (T && T.t === "compass") {
        const cur = this.cursorSnap || T.c, [CX, CY] = this.W2S(T.c);
        const r = T.stage === 1 ? d2(T.c, cur) : T.r, R = r * this.scale();
        c.save(); c.strokeStyle = "rgba(59,130,246,0.45)"; c.setLineDash([3, 4]); c.lineWidth = 1; c.beginPath(); c.arc(CX, CY, R, 0, TAU); c.stroke(); c.restore();
        if (T.stage === 3) this.shape(c, { t: "arc", c: T.c, r: T.r, a0: T.a0, sw: T.sw, st: this.style }, "#3b82f6");
        // compass legs
        const ang = T.stage === 3 ? T.a0 + T.sw : Math.atan2(cur[1] - T.c[1], cur[0] - T.c[0]);
        const tip = [CX + R * Math.cos(ang), CY + R * Math.sin(ang)], top = [(CX + tip[0]) / 2, Math.min(CY, tip[1]) - Math.max(40, R * 0.6)];
        c.save(); c.strokeStyle = "rgba(80,80,90,0.75)"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(CX, CY); c.lineTo(...top); c.lineTo(...tip); c.stroke();
        c.fillStyle = "rgba(80,80,90,0.85)"; c.beginPath(); c.arc(top[0], top[1], 5, 0, TAU); c.fill(); c.restore();
        c.save(); c.fillStyle = "#1d4ed8"; c.font = "12px system-ui"; c.fillText(`r = ${r2(r)} mm`, CX + 8, CY - 8); c.restore();
      }
      // snap marker + cursor readout
      if (this.snapPt && t !== "pencil" && t !== "eraser") { const [X, Y] = this.W2S(this.snapPt); c.save(); c.strokeStyle = "#e11d48"; c.lineWidth = 1.5; c.beginPath(); c.arc(X, Y, 6, 0, TAU); c.stroke(); c.restore(); }
      if (this.cursor) {
        const p = this.cursorSnap || this.cursor, [X, Y] = this.W2S(this.cursor);
        if (t === "eraser") { c.save(); c.strokeStyle = "#e11d48"; c.beginPath(); c.arc(X, Y, 7, 0, TAU); c.stroke(); c.restore(); }
        c.save(); c.font = "11px system-ui"; c.fillStyle = "rgba(0,0,0,0.55)";
        const txt = this.mode === "tech" ? `${r2(p[0])}, ${r2(p[1])} mm` : `(${r2(p[0])}, ${r2(p[1])})`;
        c.fillText(txt, 6, this.ch - 6); c.restore();
      }
    }
    readout(c, a, b, keep) {
      const L = d2(a, b), ang = ((Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180 / Math.PI) + 360) % 360;
      const [X, Y] = this.W2S(b); const s = this.mode === "tech" ? `${r2(L)} mm  ${r2(ang)}°` : `${r2(L)}`;
      c.save(); c.font = "12px system-ui"; const w = c.measureText(s).width + 10;
      c.fillStyle = keep ? "rgba(217,119,6,0.92)" : "rgba(29,78,216,0.9)"; c.fillRect(X + 10, Y + 8, w, 20); c.fillStyle = "#fff"; c.fillText(s, X + 15, Y + 22); c.restore();
    }
    tools(c, a, b) { // ghost T-square / set squares / protractor / ruler
      const t = this.tool, [AX, AY] = this.W2S(a), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = this.s;
      c.save(); c.translate(AX, AY); c.rotate(ang);
      c.fillStyle = "rgba(120,170,230,0.16)"; c.strokeStyle = "rgba(60,110,190,0.45)"; c.lineWidth = 1;
      const L = Math.max(d2(a, b) * s + 40, 120);
      if (t === "ruler" || t === "tsquare") { c.fillRect(-20, 0, L, 26); c.strokeRect(-20, 0, L, 26); for (let i = 0; i * 10 * s < L - 20; i++) { c.beginPath(); c.moveTo(i * 10 * s, 0); c.lineTo(i * 10 * s, i % 5 ? 6 : 11); c.stroke(); } }
      if (t === "set45") { const k = 90 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(k, 0); c.lineTo(0, k); c.closePath(); c.fill(); c.stroke(); }
      if (t === "set30") { const k = 100 * s; c.beginPath(); c.moveTo(0, 0); c.lineTo(k, 0); c.lineTo(0, k * Math.tan(Math.PI / 6)); c.closePath(); c.fill(); c.stroke(); }
      if (t === "protractor") { const R = 45 * s; c.beginPath(); c.arc(0, 0, R, 0, Math.PI, false); c.closePath(); c.fill(); c.stroke();
        for (let d = 0; d <= 180; d += 10) { const q = d * Math.PI / 180; c.beginPath(); c.moveTo(Math.cos(q) * R, Math.sin(q) * R); c.lineTo(Math.cos(q) * (R - (d % 30 ? 4 : 8)), Math.sin(q) * (R - (d % 30 ? 4 : 8))); c.stroke(); } }
      c.restore();
    }
    toPNG(width = 1600) {
      const cv = document.createElement("canvas"), k = width / this.cw; cv.width = width; cv.height = Math.round(this.ch * k);
      const c = cv.getContext("2d"); c.setTransform(k, 0, 0, k, 0, 0); this.render(c, this.cw, this.ch, false);
      return cv.toDataURL("image/png");
    }
  }
  window.DrawPad = DrawPad;
})();
