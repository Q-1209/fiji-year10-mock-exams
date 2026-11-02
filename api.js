/* ウェブ版用: server.py の /api/* をブラウザの中（localStorage）で代わりにする。
   make_web.py が各ページの最初にこのファイル（api.js）を読み込ませ、{"k": "cDRlV2kyQXJYQUZQNEFDUDVlZGU1RndjVjBwejBKaXlZSDdMMEFPOE54WnQ4UjZCSDkxVjk5RXB4ellfNURxVzRGRmZBVndaMFFIWExXVEIxMV90YXBfYnVodGln", "h": "376fd4c1c038c33bbe1b21ea48a52d2148a0ddb82642fc5f69c303d83eb02b3c"} を
   {k: 鍵を逆順にして base64 にしたもの, h: 管理画面の合言葉の SHA-256} にする。
   保存は名前ごとに分ける。提出した答案と練習の結果は GitHub の非公開リポジトリに直接送る
   （<名前>/profile.json が登録、<名前>/<模試>_<日時>.md・.json・_<問題>.png、<名前>/practice/*.json）。
   鍵はページから読めるので、fiji-year10-answers の Contents だけに絞った鍵を使う（漣さんの了承済み）。 */
(() => {
  const CFG = {"k": "cDRlV2kyQXJYQUZQNEFDUDVlZGU1RndjVjBwejBKaXlZSDdMMEFPOE54WnQ4UjZCSDkxVjk5RXB4ellfNURxVzRGRmZBVndaMFFIWExXVEIxMV90YXBfYnVodGln", "h": "376fd4c1c038c33bbe1b21ea48a52d2148a0ddb82642fc5f69c303d83eb02b3c"};
  const REPO = "Q-1209/fiji-year10-answers";
  const NAME_RE = /^[^\\/:*?"<>|#%.\u0000-\u001f]{1,20}$/;
  const FILE_RE = /^(practice\/)?[A-Za-z0-9_.-]{1,80}$/;
  const G = "y10web:";
  const user = () => { try { return localStorage.getItem(G + "user") || ""; } catch { return ""; } };
  const P = () => G + (user() || "_") + ":";
  const get = (k, d) => { try { const v = localStorage.getItem(P() + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(P() + k, JSON.stringify(v)); return true; } catch { return false; } };
  const del = k => { try { localStorage.removeItem(P() + k); } catch {} };
  const z = n => String(n).padStart(2, "0");
  const now = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  const stamp = (d = new Date()) => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const orig = window.fetch.bind(window);
  const exam = id => /^[A-Za-z0-9_-]+$/.test(id || "") ? orig(`exams/${id}.json`, { cache: "no-cache" }).then(r => r.ok ? r.json() : null) : Promise.resolve(null);
  const b64 = s => { const b = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(bin); };

  /* ---------- GitHub への保存 ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const token = () => CFG.k ? atob(CFG.k).split("").reverse().join("") : "";
  const enc = p => p.split("/").map(encodeURIComponent).join("/");
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
  async function gh(method, path, body) {
    if (!token()) throw new Error("送信先が未設定");
    const r = await orig(`https://api.github.com/repos/${REPO}/${path}`, { method, cache: "no-store",
      headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json" }, body: body ? JSON.stringify(body) : undefined });
    return { code: r.status, data: r.status === 204 ? null : await r.json().catch(() => null) };
  }
  // 同時に何人かが保存すると 409 になることがあるので、少し待ってやり直す
  async function retry(fn) {
    for (let i = 0; ; i++) {
      const r = await fn();
      if (r.code < 300) return r;
      if (i >= 4 || ![409, 422, 502, 503].includes(r.code)) throw new Error(`GitHub ${r.code}: ${r.data?.message || ""}`);
      await sleep(800 + Math.random() * 1500);
    }
  }
  async function putFile(path, content, message) {
    await retry(async () => {
      const old = await gh("GET", "contents/" + enc(path));
      return gh("PUT", "contents/" + enc(path), { message, content, ...(old.code === 200 ? { sha: old.data.sha } : {}) });
    });
  }
  async function tree() {
    const t = await gh("GET", "git/trees/main?recursive=1");
    return t.code === 200 ? t.data.tree.filter(x => x.type === "blob") : [];
  }
  // 以前の中継（Apps Script）と同じ形で受けて返す。user.js（登録）と admin.html（管理画面）もこれを使う
  async function post(req) {
    const name = String(req.name || "").trim();
    if (req.action === "register" || req.action === "submit") {
      if (!NAME_RE.test(name)) throw new Error("名前に使えない文字があります");
      const prof = await gh("GET", "contents/" + enc(name + "/profile.json"));
      if (prof.code !== 200) await putFile(name + "/profile.json", b64(JSON.stringify({ name, since: now() })), name + ": 登録");
      if (req.action === "register") return { ok: true, isNew: prof.code !== 200 };
      const files = req.files || [];
      if (!files.length || files.some(f => !FILE_RE.test(f.path))) throw new Error("bad files");
      for (const f of files) await putFile(name + "/" + f.path, f.b64, name + ": " + f.path);
      return { ok: true };
    }
    if (req.action === "admin") {
      if (!CFG.h || await sha256(req.pass || "") !== CFG.h) { await sleep(1000); throw new Error("合言葉がちがいます"); }
      if (req.op === "list") {
        const blobs = await tree(), users = {};
        await Promise.all(blobs.filter(x => /^[^/]+\/profile\.json$/.test(x.path)).map(async x => {
          const f = await gh("GET", "contents/" + enc(x.path));
          users[x.path.split("/")[0]] = f.code === 200 ? JSON.parse(unb64(f.data.content)) : {};
        }));
        return { ok: true, users, paths: blobs.map(x => x.path).filter(p => !p.endsWith("/profile.json")) };
      }
      if (req.op === "read") {
        const f = await gh("GET", "contents/" + enc(String(req.path || "")));
        if (f.code !== 200) throw new Error("見つかりません");
        return { ok: true, text: unb64(f.data.content) };
      }
      if (req.op === "delete") {
        if (!NAME_RE.test(name)) throw new Error("名前がおかしい");
        for (const x of (await tree()).filter(x => x.path.startsWith(name + "/")))
          await retry(() => gh("DELETE", "contents/" + enc(x.path), { message: "delete " + x.path, sha: x.sha }));
        return { ok: true };
      }
    }
    throw new Error("unknown action");
  }

  /* ---------- 送信（送れなかった分は outbox に残して次に送る） ---------- */
  const OUT = G + "outbox";
  const outbox = () => { try { return JSON.parse(localStorage.getItem(OUT)) || []; } catch { return []; } };
  const setOutbox = v => { try { localStorage.setItem(OUT, JSON.stringify(v)); return true; } catch { return false; } };
  let flushing = null;
  async function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      let box = outbox(), sent = 0;
      while (box.length) {
        try { await post(box[0]); } catch { break; }
        box = outbox().slice(1); setOutbox(box); sent++;
      }
      return { sent, left: box.length };
    })();
    try { return await flushing; } finally { flushing = null; }
  }
  async function send(files) {
    const body = { action: "submit", name: user(), files };
    try { await flush(); if (!outbox().length) { await post(body); return true; } } catch {}
    const box = outbox(); box.push(body);
    if (!setOutbox(box)) { box.pop(); box.push({ ...body, files: files.filter(f => !f.path.endsWith(".png")) }); setOutbox(box); }
    return false;
  }
  /* ---------- 名前ごとの記録（途中保存・答案の一覧・英文和訳の判定・用語クイズの結果）を <名前>/state.json と同期する ----------
     別の端末で同じ名前を入れても続けられるように。項目ごとに _t（保存した時刻）を持ち、新しいほうを残す。 */
  const draft = id => { const d = get("drafts", {})[id]; return d && !d.gone ? d : null; };
  const setDraft = (id, v) => { const m = get("drafts", {}); m[id] = { ...v, _t: Date.now() }; const ok = put("drafts", m); schedule(60000); return ok; };
  const dropDraft = id => { const m = get("drafts", {}); m[id] = { gone: true, _t: Date.now() }; put("drafts", m); schedule(3000); };
  const state = () => ({ drafts: get("drafts", {}), tstatus: get("tstatus", {}), qstatus: get("qstatus", {}), history: get("history", []) });
  function merge(r) {
    const newer = (a, b) => !a ? b : !b ? a : (b._t || 0) > (a._t || 0) ? b : a;
    const md = get("drafts", {}), mt = get("tstatus", {}), mq = get("qstatus", {}), seen = new Set();
    for (const [k, v] of Object.entries(r.drafts || {})) md[k] = newer(md[k], v);
    for (const [k, v] of Object.entries(r.tstatus || {})) mt[k] = newer(mt[k], v);
    for (const [k, v] of Object.entries(r.qstatus || {})) mq[k] = newer(mq[k], v);
    const mh = [...get("history", []), ...(r.history || [])]
      .filter(h => { const k = h.submittedAt + "|" + h.title; return !seen.has(k) && seen.add(k); })
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 100);
    put("drafts", md); put("tstatus", mt); put("qstatus", mq); put("history", mh);
  }
  async function pull() {
    if (!user() || !token()) return;
    const f = await gh("GET", "contents/" + enc(user() + "/state.json"));
    if (f.code === 200) merge(JSON.parse(unb64(f.data.content)));
  }
  async function pushState() {
    const name = user();
    if (!name || !token()) return;
    await retry(async () => {
      const f = await gh("GET", "contents/" + enc(name + "/state.json"));
      if (f.code === 200) merge(JSON.parse(unb64(f.data.content)));
      return gh("PUT", "contents/" + enc(name + "/state.json"),
        { message: name + ": 記録", content: b64(JSON.stringify(state())), ...(f.code === 200 ? { sha: f.data.sha } : {}) });
    });
  }
  // 書き戻しはまとめて行う（途中保存は1分ごと、提出や判定はすぐ）
  let timer = null, due = 0, pushing = Promise.resolve();
  const save = () => { clearTimeout(timer); timer = null; return pushing = pushing.then(pushState).catch(() => {}); };
  function schedule(ms) {
    const at = Date.now() + ms;
    if (timer && due <= at) return;
    clearTimeout(timer); due = at; timer = setTimeout(save, ms);
  }
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && timer) save(); });
  const ready = Promise.race([pull().catch(() => {}), sleep(6000)]);

  window.Y10 = { user, post, flush, save, pending: () => outbox().length };
  if (outbox().length) setTimeout(flush, 1500);

  // server.py の grade() と同じ
  function grade(e, responses) {
    let score = 0, mx = 0, manual = 0;
    for (const sec of e.sections) for (const q of sec.questions) {
      if (q.type === "mcq") { mx += q.marks; if (responses[q.id] === q.answer) score += q.marks; }
      else if (q.type === "match") {
        mx += q.marks; const per = q.marks / q.items.length, got = responses[q.id] || {};
        q.answer.forEach((a, i) => { if (got[String(i)] === a) score += per; });
      } else manual += q.marks;
    }
    return [{ score: Math.round(score * 100) / 100, max: mx }, manual];
  }

  // server.py の to_markdown() と同じ（名前の行を足した）
  function toMarkdown(e, rec) {
    const r = rec.responses, L = [
      `# 答案: ${e.title}`, "",
      `- 名前: ${rec.name}`,
      `- 受験日時: ${rec.submittedAt}`,
      `- 使用時間: ${rec.timeUsedMin} 分 / 制限 ${e.minutes} 分`,
      `- 時間切れで自動提出: ${rec.autoSubmitted ? "はい" : "いいえ"}`,
      `- 自動採点（選択・マッチング）: ${rec.auto.score} / ${rec.auto.max} 点`,
      `- 要採点（記述・パラグラフ）: ${rec.manualMax} 点分 ← Claude が採点する`, ""];
    if (e.solutions) L.push(`公式の Detailed Solutions（採点基準）: static/${e.solutions[0].split("/").slice(0, -1).join("/")}/ds-*.jpg（${e.solutions.length} ページ）`, "");
    const quote = t => "> " + (t.trim().replace(/\n/g, "\n> ") || "（未回答）");
    for (const sec of e.sections) {
      L.push(`## ${sec.title}`, "");
      for (const q of sec.questions) {
        const ans = r[q.id];
        L.push(`### ${q.label || q.id} (${q.marks} marks) [${q.type}]`, "", q.text, "");
        if (q.pages) L.push("問題ページ: " + q.pages.map(p => "static/" + p).join(", "), "");
        if (q.ab) L.push("解答用紙: " + q.ab.map(p => "static/" + p).join(", "), "");
        if (q.table) {
          const t = q.table;
          L.push("| " + t[0].join(" | ") + " |", "|" + "---|".repeat(t[0].length));
          t.slice(1).forEach(row => L.push("| " + row.join(" | ") + " |")); L.push("");
        }
        if (q.type === "mcq") {
          q.options.forEach((o, i) => L.push(`- ${"ABCD"[i]}. ${o}`));
          L.push("", `**解答:** ${ans || "（未回答）"}　正解: ${q.answer}　${ans === q.answer ? "○" : "×"}`, "");
        } else if (q.type === "match") {
          q.items.forEach((item, i) => { const got = (ans || {})[String(i)] || "";
            L.push(`- ${item} → ${got || "（未回答）"}（正解 ${q.answer[i]}）${got === q.answer[i] ? "○" : "×"}`); });
          L.push("");
        } else if (q.type === "draw") {
          const img = (rec.images || {})[q.id], n = ((ans || {}).shapes || []).length;
          L.push(`**作図:** ${img ? `![${q.id}](${img})` : "（何も描いていない）"}（図形 ${n} 個）`, "");
          if (q.withText) L.push("**記述:**", "", quote((ans || {}).text || ""), "");
          L.push("**模範解答・採点基準:**", "", q.model || "", "");
        } else {
          let text;
          if (q.type === "paragraph" && q.choices) {
            const pick = (ans || {}).choice; text = (ans || {}).text || "";
            L.push("選択肢:"); q.choices.forEach((c, i) => L.push(`${i + 1}. ${c.text}`));
            L.push("", `**選んだ問題:** ${pick || "（未選択）"}`);
          } else text = typeof ans === "string" ? ans : (ans || {}).text || "";
          L.push("", `**解答（${text.split(/\s+/).filter(Boolean).length} words）:**`, "", quote(text), "");
          L.push("**模範解答・採点基準:**", "", q.model || "", "");
        }
      }
    }
    return L.join("\n");
  }

  async function handle(path, q, body) {
    if (!body) {
      await ready; // 別の端末の記録を読み込んでから答える
      if (path === "/api/exams") {
        const list = await (await orig("exams/index.json", { cache: "no-cache" })).json();
        return json(list.map(e => ({ ...e, hasDraft: !!draft(e.id) })));
      }
      if (path === "/api/exam") { const e = await exam(q.get("id")); return e ? json(e) : json({ error: "not found" }, 404); }
      if (path === "/api/draft") return json(draft(q.get("id")) || {});
      if (path === "/api/history") return json(get("history", []));
      if (path === "/api/tstatus") return json(get("tstatus", {}));
      if (path === "/api/qstatus") return json(get("qstatus", {}));
      return json({ error: "not found" }, 404);
    }
    const data = JSON.parse(body || "{}");
    if (path === "/api/tstatus") {
      const st = get("tstatus", {}), old = st[data.en] || {};
      st[data.en] = { g: data.grade, n: (old.n || 0) + 1, t: now(), _t: Date.now() };
      put("tstatus", st); schedule(10000); return json({ ok: true });
    }
    if (path === "/api/qstatus") {
      const st = get("qstatus", {}), old = st[data.id] || {};
      st[data.id] = { g: data.ok ? 1 : 0, n: (old.n || 0) + 1, t: now(), _t: Date.now() };
      put("qstatus", st); schedule(10000); return json({ ok: true });
    }
    if (path === "/api/practice") {
      const kind = /^[A-Za-z0-9_-]+$/.test(data.kind || "") ? data.kind : "practice";
      const rec = { ...data, name: user(), savedAt: now() };
      const list = get("practice", []); list.unshift(rec); put("practice", list.slice(0, 50));
      const sent = await send([{ path: `practice/${kind}_${stamp()}.json`, b64: b64(JSON.stringify(rec, null, 1)) }]);
      return json({ ok: true, sent });
    }
    const e = await exam(data.examId);
    if (!e) return json({ error: "unknown exam" }, 400);
    if (path === "/api/draft") return json({ ok: setDraft(e.id, data) });
    if (path === "/api/discard") { dropDraft(e.id); return json({ ok: true }); }
    if (path === "/api/submit") {
      const d = new Date(), [auto, manual] = grade(e, data.responses || {}), stem = `${e.id}_${stamp(d)}`;
      const files = [], images = {};
      for (const [qid, url] of Object.entries(data.images || {})) {
        if (!/^[A-Za-z0-9_-]+$/.test(qid) || !String(url).startsWith("data:image/png;base64,")) continue;
        images[qid] = `${stem}_${qid}.png`;
        files.push({ path: images[qid], b64: url.split(",")[1] });
      }
      const rec = { examId: e.id, title: e.title, name: user(), submittedAt: now(d),
        timeUsedMin: Math.round((data.elapsedSec || 0) / 6) / 10, autoSubmitted: !!data.autoSubmitted,
        auto, manualMax: manual, claudeGraded: false, responses: data.responses || {}, images };
      files.unshift({ path: stem + ".md", b64: b64(toMarkdown(e, rec)) }, { path: stem + ".json", b64: b64(JSON.stringify(rec, null, 1)) });
      const sent = await send(files);
      const hist = get("history", []);
      hist.unshift({ title: e.title, submittedAt: rec.submittedAt, auto, manualMax: manual });
      put("history", hist.slice(0, 100)); dropDraft(e.id);
      return json({ ok: true, file: stem + ".md", auto, manualMax: manual, sent });
    }
    return json({ error: "not found" }, 404);
  }

  window.fetch = (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    if (u.origin !== location.origin || !u.pathname.includes("/api/")) return orig(input, init);
    const path = u.pathname.slice(u.pathname.indexOf("/api/"));
    return handle(path, u.searchParams, init.method === "POST" ? init.body : null);
  };
})();
