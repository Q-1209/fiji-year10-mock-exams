/* ウェブ版用: 名前の登録・切り替え（パスワードなし）。make_web.py が各ページに user.js として入れる。
   名前は localStorage の y10web:user、この端末で使った名前の一覧は y10web:names。 */
(() => {
  const G = "y10web:";
  const ls = { get: k => { try { return localStorage.getItem(G + k); } catch { return null; } },
               set: (k, v) => { try { localStorage.setItem(G + k, v); } catch {} } };
  const names = () => { try { return JSON.parse(ls.get("names")) || []; } catch { return []; } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = s => s.replace(/[\\/:*?"<>|#%.\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);

  const css = `
  .y10u-pill{position:fixed;right:10px;bottom:10px;z-index:50;background:#1d5fa8;color:#fff;border:0;border-radius:999px;
    padding:7px 12px;font:13px/1.2 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;opacity:.92}
  .y10u-pill small{opacity:.8;margin-left:6px}
  .y10u-bg{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
  .y10u-box{background:#fff;color:#1f2328;border-radius:12px;max-width:380px;width:100%;padding:20px;font:15px/1.6 system-ui,sans-serif}
  .y10u-box h2{margin:0 0 6px;font-size:19px}.y10u-box p{margin:0 0 12px;color:#6a707a;font-size:13px}
  .y10u-box input{width:100%;box-sizing:border-box;font-size:17px;padding:10px;border:1px solid #dcdad3;border-radius:8px}
  .y10u-box button{font:inherit;border-radius:8px;padding:8px 14px;border:1px solid #dcdad3;background:#fff;cursor:pointer}
  .y10u-box .go{background:#1d5fa8;color:#fff;border-color:#1d5fa8;width:100%;margin-top:10px;padding:10px}
  .y10u-names{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.y10u-err{color:#b3261e;font-size:13px;min-height:1.2em;margin-top:6px}`;

  function ask(first) {
    const used = names();
    const bg = document.createElement("div");
    bg.className = "y10u-bg";
    bg.innerHTML = `<div class="y10u-box">
      <h2>${first ? "名前を登録" : "名前の切り替え"}</h2>
      <p>名前を入れるだけで使えます（パスワードはいりません）。答案はこの名前で漣さんに送られ、Claude が採点します。
      別の端末でも同じ名前を入れれば続きとして送れます。</p>
      ${used.length ? `<div class="y10u-names">${used.map(n => `<button data-n="${esc(n)}">${esc(n)}</button>`).join("")}</div>` : ""}
      <input id="y10uName" maxlength="20" placeholder="例: Ana Tuilagi" autocomplete="off">
      <div class="y10u-err" id="y10uErr"></div>
      <button class="go" id="y10uGo">${first ? "登録してはじめる" : "この名前にする"}</button>
      ${first ? "" : `<button id="y10uCancel" style="width:100%;margin-top:6px">やめる</button>`}</div>`;
    document.body.appendChild(bg);
    const input = bg.querySelector("#y10uName"), err = bg.querySelector("#y10uErr"), go = bg.querySelector("#y10uGo");
    input.focus();
    const choose = async name => {
      name = clean(name);
      if (!name) { err.textContent = "名前を入れてください（/ : * ? \" < > | # % . は使えません）"; return; }
      go.disabled = true; err.textContent = "";
      ls.set("user", name);
      ls.set("names", JSON.stringify([name, ...names().filter(n => n !== name)].slice(0, 10)));
      try { await window.Y10?.post({ action: "register", name }); } catch {} // 送れなくても、答案を送るときに登録される
      location.reload();
    };
    go.onclick = () => choose(input.value);
    input.onkeydown = e => { if (e.key === "Enter") choose(input.value); };
    bg.querySelectorAll("[data-n]").forEach(b => b.onclick = () => choose(b.dataset.n));
    bg.querySelector("#y10uCancel")?.addEventListener("click", () => bg.remove());
  }

  addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const me = ls.get("user");
    if (!me) return ask(true);
    const pill = document.createElement("button");
    pill.className = "y10u-pill";
    const show = () => {
      const n = window.Y10?.pending() || 0;
      pill.innerHTML = `👤 ${esc(me)}<small>切り替え</small>` + (n ? `<small>未送信 ${n}</small>` : "");
      pill.title = n ? `まだ送れていない答案が ${n} 件あります（次にページを開いたとき自動で送ります）` : "";
    };
    show();
    pill.onclick = () => ask(false);
    document.body.appendChild(pill);
    if (window.Y10?.pending()) window.Y10.flush().then(show);
  });
})();
