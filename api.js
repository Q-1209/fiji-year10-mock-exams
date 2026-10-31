/* ウェブ版用: server.py の /api/* をブラウザの中（localStorage）で代わりにする。
   make_web.py が各ページの最初にこのファイル（api.js）を読み込ませる。 */
(() => {
  const P = "y10web:";
  const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { return false; } };
  const del = k => { try { localStorage.removeItem(P + k); } catch {} };
  const now = () => { const d = new Date(), z = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  const orig = window.fetch.bind(window);
  const exam = id => /^[A-Za-z0-9_-]+$/.test(id || "") ? orig(`exams/${id}.json`).then(r => r.ok ? r.json() : null) : Promise.resolve(null);

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

  async function handle(path, q, body) {
    if (!body) {
      if (path === "/api/exams") {
        const list = await (await orig("exams/index.json")).json();
        return json(list.map(e => ({ ...e, hasDraft: !!get("draft:" + e.id) })));
      }
      if (path === "/api/exam") { const e = await exam(q.get("id")); return e ? json(e) : json({ error: "not found" }, 404); }
      if (path === "/api/draft") return json(get("draft:" + q.get("id"), {}));
      if (path === "/api/history") return json(get("history", []));
      if (path === "/api/tstatus") return json(get("tstatus", {}));
      return json({ error: "not found" }, 404);
    }
    const data = JSON.parse(body || "{}");
    if (path === "/api/tstatus") {
      const st = get("tstatus", {}), old = st[data.en] || {};
      st[data.en] = { g: data.grade, n: (old.n || 0) + 1, t: now() };
      put("tstatus", st); return json({ ok: true });
    }
    if (path === "/api/practice") {
      const list = get("practice", []); list.unshift({ ...data, savedAt: now() });
      put("practice", list.slice(0, 50)); return json({ ok: true });
    }
    const e = await exam(data.examId);
    if (!e) return json({ error: "unknown exam" }, 400);
    if (path === "/api/draft") return json({ ok: put("draft:" + e.id, data) });
    if (path === "/api/discard") { del("draft:" + e.id); return json({ ok: true }); }
    if (path === "/api/submit") {
      const [auto, manual] = grade(e, data.responses || {});
      const hist = get("history", []);
      hist.unshift({ title: e.title, submittedAt: now(), auto, manualMax: manual });
      put("history", hist.slice(0, 100)); del("draft:" + e.id);
      return json({ ok: true, file: "", auto, manualMax: manual });
    }
    return json({ error: "not found" }, 404);
  }

  window.fetch = (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!u.pathname.startsWith("/api/")) return orig(input, init);
    return handle(u.pathname, u.searchParams, init.method === "POST" ? init.body : null);
  };
})();
