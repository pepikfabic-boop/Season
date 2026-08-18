import { useState, useEffect, useCallback } from "react";

/* ─────────────────────────  УТИЛИТЫ  ───────────────────────── */

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const AUTH_KEY = "velvet:auth";
const DATA_KEY = "velvet:data";
// Хэш мастер-пароля для сброса (в коде хранится только хэш, не сам пароль)
const MASTER_HASH = "5db1fee4b5703808c48078a76768b155b421b210c0761cd6a5d223f4d99f1eaa";

async function loadKey(key) {
  try {
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function saveKey(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); return true; }
  catch { return false; }
}

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const dkey = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const todayKey = () => { const t = new Date(); return dkey(t.getFullYear(), t.getMonth(), t.getDate()); };

const emptyData = { tasks: {}, pleasure: 0 };

/* ─────────────────────────  СТИЛИ  ───────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500;600&display=swap');

:root {
  --bg: #120A10;
  --surface: #1E1119;
  --surface-2: #291722;
  --line: #3A2230;
  --crimson: #C42847;
  --crimson-hi: #E8506E;
  --gold: #C9A227;
  --gold-soft: #E3C766;
  --ivory: #F2E6DC;
  --muted: #A18693;
  --ok: #7BC47F;
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
html, body, #root { min-height: 100%; }
body { background: var(--bg); color: var(--ivory); font-family: 'Jost', sans-serif; }

.app { max-width: 560px; margin: 0 auto; padding: 16px 14px 90px; min-height: 100vh; }

.display { font-family: 'Cormorant Garamond', serif; }

/* Экран входа */
.gate {
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 28px 20px;
  background:
    radial-gradient(ellipse 90% 45% at 50% -5%, rgba(196,40,71,.22), transparent 60%),
    radial-gradient(ellipse 70% 40% at 50% 110%, rgba(201,162,39,.10), transparent 60%),
    var(--bg);
}
.gate-card { width: 100%; max-width: 380px; text-align: center; }
.seal {
  width: 74px; height: 74px; margin: 0 auto 22px; border-radius: 50%;
  border: 1px solid var(--line); display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 35% 30%, #35202B, #1A0E15);
  box-shadow: 0 0 40px rgba(196,40,71,.25), inset 0 0 18px rgba(0,0,0,.6);
  font-size: 30px;
}
.gate h1 { font-size: 34px; font-weight: 600; letter-spacing: .04em; }
.gate .sub { color: var(--muted); font-weight: 300; margin: 8px 0 26px; font-size: 15px; letter-spacing: .06em; }

.field { position: relative; margin-bottom: 14px; text-align: left; }
.field label { display: block; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 7px; }
.field input {
  width: 100%; padding: 14px 16px; font-size: 16px; color: var(--ivory);
  background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
  font-family: inherit; letter-spacing: .12em; outline: none; transition: border-color .2s;
}
.field input:focus { border-color: var(--crimson); }

.btn {
  width: 100%; padding: 15px; font-size: 15px; font-weight: 500; letter-spacing: .12em;
  text-transform: uppercase; color: var(--ivory); border: none; border-radius: 12px;
  background: linear-gradient(135deg, #A12038, var(--crimson) 55%, #8E1B32);
  cursor: pointer; transition: filter .2s, transform .1s; font-family: inherit;
}
.btn:active { transform: scale(.98); }
.btn:disabled { opacity: .4; cursor: default; }
.btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--muted); text-transform: none; letter-spacing: .03em; font-weight: 400; }
.btn.gold { background: linear-gradient(135deg, #9A7B1C, var(--gold) 55%, #8A6E18); color: #1A1206; }

.err { color: var(--crimson-hi); font-size: 14px; margin-top: 12px; min-height: 18px; }
.hint { color: var(--muted); font-size: 13px; margin-top: 18px; line-height: 1.5; font-weight: 300; }

/* Шапка */
.topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.role-badge { display: flex; align-items: center; gap: 10px; }
.role-dot {
  width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 19px; background: radial-gradient(circle at 35% 30%, #35202B, #1A0E15);
  border: 1px solid var(--line);
}
.role-name { font-size: 19px; font-weight: 600; letter-spacing: .03em; }
.role-sub { font-size: 12px; color: var(--muted); letter-spacing: .1em; text-transform: uppercase; }
.icon-btn {
  background: none; border: 1px solid var(--line); color: var(--muted); border-radius: 10px;
  padding: 8px 13px; font-size: 13px; cursor: pointer; font-family: inherit; letter-spacing: .04em;
}

/* Шкала удовольствия */
.scale-card {
  background: linear-gradient(160deg, var(--surface), var(--surface-2));
  border: 1px solid var(--line); border-radius: 18px; padding: 18px; margin-bottom: 20px;
  position: relative; overflow: hidden;
}
.scale-card::before {
  content: ""; position: absolute; inset: -40% -20% auto; height: 90%;
  background: radial-gradient(ellipse at 50% 0%, rgba(196,40,71,.16), transparent 70%);
  pointer-events: none;
}
.scale-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; position: relative; }
.scale-title { font-size: 20px; font-weight: 600; letter-spacing: .03em; }
.scale-num { font-size: 26px; font-weight: 600; color: var(--gold-soft); }
.scale-track {
  height: 18px; border-radius: 99px; background: #0D0509;
  border: 1px solid var(--line); overflow: hidden; position: relative;
}
.scale-fill {
  height: 100%; border-radius: 99px; min-width: 0;
  background: linear-gradient(90deg, #6E1226, var(--crimson) 55%, var(--crimson-hi) 85%, var(--gold-soft));
  box-shadow: 0 0 16px rgba(232,80,110,.5);
  transition: width .8s cubic-bezier(.2,.8,.2,1);
}
.scale-note { margin-top: 10px; font-size: 13px; color: var(--muted); font-weight: 300; font-style: italic; position: relative; }
.scale-reset { margin-top: 12px; position: relative; }

/* Календарь */
.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.cal-title { font-size: 26px; font-weight: 600; letter-spacing: .02em; }
.cal-nav { display: flex; gap: 8px; }
.cal-nav button {
  width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--surface); color: var(--ivory); font-size: 17px; cursor: pointer;
}
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.wd { text-align: center; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); padding: 6px 0; }
.day {
  aspect-ratio: 1; border-radius: 12px; border: 1px solid transparent;
  background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; cursor: pointer; position: relative; font-family: inherit; color: var(--ivory);
  font-size: 15px; transition: border-color .15s, background .15s;
}
.day.blank { background: transparent; cursor: default; }
.day.today { border-color: var(--gold); }
.day.selected { background: var(--surface-2); border-color: var(--crimson); }
.dots { display: flex; gap: 3px; height: 5px; }
.dot { width: 5px; height: 5px; border-radius: 50%; background: var(--crimson-hi); }
.dot.done { background: var(--ok); }
.dot.gold { background: var(--gold-soft); }

/* Панель дня */
.daypanel { margin-top: 22px; }
.daypanel-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.daypanel-title { font-size: 23px; font-weight: 600; }
.count { font-size: 13px; color: var(--muted); }

.task {
  background: var(--surface); border: 1px solid var(--line); border-radius: 15px;
  padding: 15px; margin-bottom: 11px;
}
.task-top { display: flex; align-items: flex-start; gap: 12px; }
.task-title { font-size: 17px; font-weight: 500; line-height: 1.35; flex: 1; }
.task-title.done-t { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(196,40,71,.6); }
.task-note { font-size: 14px; color: var(--muted); font-weight: 300; margin-top: 5px; line-height: 1.45; }
.tag { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; padding: 4px 9px; border-radius: 99px; white-space: nowrap; }
.tag.wait { background: rgba(196,40,71,.16); color: var(--crimson-hi); border: 1px solid rgba(196,40,71,.35); }
.tag.done { background: rgba(123,196,127,.12); color: var(--ok); border: 1px solid rgba(123,196,127,.3); }
.tag.rated { background: rgba(201,162,39,.13); color: var(--gold-soft); border: 1px solid rgba(201,162,39,.35); }

.task-actions { display: flex; gap: 9px; margin-top: 13px; flex-wrap: wrap; }
.chip {
  padding: 10px 15px; border-radius: 10px; font-size: 14px; cursor: pointer; font-family: inherit;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ivory); letter-spacing: .02em;
}
.chip.primary { background: linear-gradient(135deg, #A12038, var(--crimson)); border-color: transparent; }
.chip.danger { color: var(--crimson-hi); }

.review-box { margin-top: 13px; border-top: 1px solid var(--line); padding-top: 13px; }
.flames { display: flex; gap: 7px; margin-bottom: 11px; }
.flame { font-size: 27px; cursor: pointer; filter: grayscale(1) opacity(.35); transition: filter .15s, transform .15s; background: none; border: none; padding: 2px; }
.flame.lit { filter: none; transform: scale(1.08); }
.review-box textarea, .addform textarea, .addform input {
  width: 100%; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
  color: var(--ivory); padding: 11px 13px; font-size: 15px; font-family: inherit; resize: vertical; outline: none;
}
.review-box textarea:focus, .addform textarea:focus, .addform input:focus { border-color: var(--crimson); }

.review-show { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 12px; }
.review-show .stars { font-size: 18px; letter-spacing: 2px; }
.review-show .comment { font-style: italic; color: var(--gold-soft); font-size: 15px; margin-top: 6px; line-height: 1.5; font-family: 'Cormorant Garamond', serif; }
.review-show .sig { font-size: 12px; color: var(--muted); margin-top: 5px; letter-spacing: .08em; }

.addform { background: var(--surface); border: 1px dashed var(--line); border-radius: 15px; padding: 15px; margin-top: 6px; }
.addform input { margin-bottom: 9px; }
.addform .row { display: flex; gap: 9px; margin-top: 11px; }
.empty { text-align: center; color: var(--muted); font-weight: 300; padding: 26px 0 12px; font-style: italic; font-size: 15px; }

.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 20px; font-size: 14px; z-index: 50; box-shadow: 0 8px 30px rgba(0,0,0,.5);
}

/* Настройки */
.overlay { position: fixed; inset: 0; background: rgba(10,4,8,.75); backdrop-filter: blur(4px); z-index: 40; display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: 100%; max-width: 560px; background: var(--surface); border-radius: 22px 22px 0 0;
  border: 1px solid var(--line); border-bottom: none; padding: 22px 18px 30px; max-height: 85vh; overflow-y: auto;
}
.sheet h3 { font-size: 22px; margin-bottom: 16px; }

@media (min-width: 600px) {
  .overlay { align-items: center; }
  .sheet { border-radius: 22px; border-bottom: 1px solid var(--line); }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

/* ─────────────────────────  ШКАЛА  ───────────────────────── */

function PleasureScale({ value, role, onReset }) {
  const phrase =
    value >= 100 ? "Госпожа полностью довольна. Пока что." :
    value >= 70 ? "Госпожа почти довольна. Не останавливайся." :
    value >= 40 ? "Неплохо. Но этого мало." :
    value > 0 ? "Только начало пути." :
    "Госпожа ждёт стараний.";
  return (
    <div className="scale-card">
      <div className="scale-head">
        <div className="scale-title display">Удовольствие Госпожи</div>
        <div className="scale-num display">{value}%</div>
      </div>
      <div className="scale-track">
        <div className="scale-fill" style={{ width: `${value}%` }} />
      </div>
      <div className="scale-note">{phrase}</div>
      {role === "mistress" && value > 0 && (
        <div className="scale-reset">
          <button className="chip danger" onClick={onReset}>Обнулить шкалу</button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  ЗАДАНИЕ  ───────────────────────── */

function TaskCard({ task, role, onDone, onDelete, onReview }) {
  const [reviewing, setReviewing] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  const status = task.review ? "rated" : task.done ? "done" : "wait";
  const tagText = task.review ? "Оценено" : task.done ? "Выполнено" : "Ожидает";

  return (
    <div className="task">
      <div className="task-top">
        <div style={{ flex: 1 }}>
          <div className={`task-title ${task.done ? "done-t" : ""}`}>{task.title}</div>
          {task.note && <div className="task-note">{task.note}</div>}
        </div>
        <span className={`tag ${status}`}>{tagText}</span>
      </div>

      {task.review && (
        <div className="review-show">
          <div className="stars">{"🔥".repeat(task.review.rating)}<span style={{ filter: "grayscale(1) opacity(.3)" }}>{"🔥".repeat(5 - task.review.rating)}</span></div>
          {task.review.comment && <div className="comment">«{task.review.comment}»</div>}
          <div className="sig">— Госпожа</div>
        </div>
      )}

      <div className="task-actions">
        {role === "servant" && !task.done && (
          <button className="chip primary" onClick={() => onDone(task.id)}>Исполнено, Госпожа</button>
        )}
        {role === "mistress" && task.done && !task.review && !reviewing && (
          <button className="chip primary" onClick={() => setReviewing(true)}>Оценить</button>
        )}
        {role === "mistress" && (
          <button className="chip danger" onClick={() => onDelete(task.id)}>Удалить</button>
        )}
      </div>

      {reviewing && (
        <div className="review-box">
          <div className="flames">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`flame ${rating >= n ? "lit" : ""}`} onClick={() => setRating(n)} aria-label={`${n} из 5`}>🔥</button>
            ))}
          </div>
          <textarea rows={2} placeholder="Слово Госпожи (необязательно)…" value={comment} onChange={e => setComment(e.target.value)} />
          <div className="task-actions">
            <button className="chip primary" disabled={!rating} onClick={() => { onReview(task.id, rating, comment.trim()); setReviewing(false); }}>
              Вынести вердикт
            </button>
            <button className="chip" onClick={() => setReviewing(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  ГЛАВНЫЙ ЭКРАН  ───────────────────────── */

function Main({ role, onLogout }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(todayKey());
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [toast, setToast] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  const refresh = useCallback(async () => {
    const d = await loadKey(DATA_KEY);
    if (d) setData({ tasks: d.tasks || {}, pleasure: Math.min(100, d.pleasure || 0) });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 20000); return () => clearInterval(t); }, [refresh]);

  const commit = async next => {
    setData(next);
    const ok = await saveKey(DATA_KEY, next);
    if (!ok) showToast("Не удалось сохранить. Проверь связь.");
  };

  const dayTasks = data.tasks[selected] || [];

  const addTask = () => {
    if (!newTitle.trim()) return;
    const t = { id: Date.now().toString(36), title: newTitle.trim(), note: newNote.trim(), done: false, review: null };
    const next = { ...data, tasks: { ...data.tasks, [selected]: [...dayTasks, t] } };
    commit(next);
    setNewTitle(""); setNewNote(""); setAdding(false);
    showToast("Повеление записано");
  };

  const markDone = id => {
    const next = { ...data, tasks: { ...data.tasks, [selected]: dayTasks.map(t => t.id === id ? { ...t, done: true, doneAt: Date.now() } : t) } };
    commit(next);
    showToast("Госпожа увидит твоё усердие");
  };

  const deleteTask = id => {
    const next = { ...data, tasks: { ...data.tasks, [selected]: dayTasks.filter(t => t.id !== id) } };
    commit(next);
  };

  const review = (id, rating, comment) => {
    const pleasure = Math.min(100, data.pleasure + rating * 5);
    const next = {
      ...data, pleasure,
      tasks: { ...data.tasks, [selected]: dayTasks.map(t => t.id === id ? { ...t, review: { rating, comment, at: Date.now() } } : t) },
    };
    commit(next);
    showToast(`Шкала пополнена: +${rating * 5}%`);
  };

  const resetScale = () => commit({ ...data, pleasure: 0 });

  /* календарная сетка */
  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const tKey = todayKey();

  const prevMonth = () => setYm(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
  const nextMonth = () => setYm(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });

  const selDate = new Date(selected + "T00:00:00");
  const selLabel = `${selDate.getDate()} ${MONTHS[selDate.getMonth()].toLowerCase().replace(/ь$/, "я").replace(/й$/, "я").replace(/т$/, "та")}`;

  return (
    <div className="app">
      <div className="topbar">
        <div className="role-badge">
          <div className="role-dot">{role === "mistress" ? "👑" : "⛓️"}</div>
          <div>
            <div className="role-name display">{role === "mistress" ? "Госпожа" : "Прислужник"}</div>
            <div className="role-sub">{role === "mistress" ? "Твоё слово — закон" : "К вашим услугам"}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {role === "mistress" && <button className="icon-btn" onClick={() => setShowSettings(true)}>⚙</button>}
          <button className="icon-btn" onClick={onLogout}>Выйти</button>
        </div>
      </div>

      <PleasureScale value={data.pleasure} role={role} onReset={resetScale} />

      <div className="cal-head">
        <div className="cal-title display">{MONTHS[ym.m]} {ym.y}</div>
        <div className="cal-nav">
          <button onClick={prevMonth} aria-label="Предыдущий месяц">‹</button>
          <button onClick={nextMonth} aria-label="Следующий месяц">›</button>
        </div>
      </div>

      <div className="grid">
        {WEEKDAYS.map(w => <div key={w} className="wd">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} className="day blank" />;
          const k = dkey(ym.y, ym.m, d);
          const ts = data.tasks[k] || [];
          return (
            <button key={k} className={`day ${k === tKey ? "today" : ""} ${k === selected ? "selected" : ""}`} onClick={() => { setSelected(k); setAdding(false); }}>
              <span>{d}</span>
              <span className="dots">
                {ts.slice(0, 3).map(t => (
                  <span key={t.id} className={`dot ${t.review ? "gold" : t.done ? "done" : ""}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="daypanel">
        <div className="daypanel-head">
          <div className="daypanel-title display">{selLabel}</div>
          <div className="count">{dayTasks.length > 0 ? `повелений: ${dayTasks.length}` : ""}</div>
        </div>

        {loading && <div className="empty">Загрузка…</div>}
        {!loading && dayTasks.length === 0 && (
          <div className="empty">{role === "mistress" ? "На этот день повелений нет. Пока." : "Госпожа ещё не отдала повелений на этот день."}</div>
        )}

        {dayTasks.map(t => (
          <TaskCard key={t.id} task={t} role={role} onDone={markDone} onDelete={deleteTask} onReview={review} />
        ))}

        {role === "mistress" && !adding && (
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>Отдать повеление</button>
        )}
        {role === "mistress" && adding && (
          <div className="addform">
            <input placeholder="Повеление…" value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
            <textarea rows={2} placeholder="Подробности, условия, время… (необязательно)" value={newNote} onChange={e => setNewNote(e.target.value)} />
            <div className="row">
              <button className="btn" style={{ flex: 1 }} disabled={!newTitle.trim()} onClick={addTask}>Записать</button>
              <button className="btn ghost" style={{ flex: "0 0 auto", width: "auto", padding: "15px 18px" }} onClick={() => setAdding(false)}>Отмена</button>
            </div>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
      {showSettings && <Settings onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); showToast("Пароли обновлены"); }} />}
    </div>
  );
}

/* ─────────────────────────  СМЕНА ПАРОЛЕЙ  ───────────────────────── */

function Settings({ onClose, onSaved }) {
  const [mp, setMp] = useState("");
  const [sp, setSp] = useState("");
  const [err, setErr] = useState("");

  const save = async () => {
    if (mp.length < 4 || sp.length < 4) { setErr("Каждый пароль — минимум 4 символа."); return; }
    if (mp === sp) { setErr("Пароли должны различаться — по ним определяется роль."); return; }
    const auth = { m: await sha256(mp), s: await sha256(sp) };
    const ok = await saveKey(AUTH_KEY, auth);
    if (!ok) { setErr("Не удалось сохранить."); return; }
    onSaved();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h3 className="display">Смена паролей</h3>
        <div className="field">
          <label>Пароль Госпожи</label>
          <input type="password" value={mp} onChange={e => setMp(e.target.value)} />
        </div>
        <div className="field">
          <label>Пароль прислужника</label>
          <input type="password" value={sp} onChange={e => setSp(e.target.value)} />
        </div>
        <div className="err">{err}</div>
        <button className="btn gold" onClick={save}>Сохранить</button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>Закрыть</button>
      </div>
    </div>
  );
}

/* ─────────────────────────  ВХОД И НАСТРОЙКА  ───────────────────────── */

function SetupGate({ onDone, reset = false }) {
  const [mp, setMp] = useState("");
  const [sp, setSp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr("");
    if (mp.length < 4 || sp.length < 4) { setErr("Каждый пароль — минимум 4 символа."); return; }
    if (mp === sp) { setErr("Пароли должны различаться — по ним определяется роль."); return; }
    setBusy(true);
    const auth = { m: await sha256(mp), s: await sha256(sp) };
    const ok = await saveKey(AUTH_KEY, auth);
    setBusy(false);
    if (!ok) { setErr("Не удалось сохранить. Попробуй ещё раз."); return; }
    onDone(reset ? null : "mistress");
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="seal">{reset ? "🔄" : "👑"}</div>
        <h1 className="display">{reset ? "Сброс паролей" : "Первая печать"}</h1>
        <div className="sub">{reset ? "Мастер-пароль принят. Установи новые пароли" : "Госпожа устанавливает пароли для обоих"}</div>
        <div className="field">
          <label>Пароль Госпожи</label>
          <input type="password" value={mp} onChange={e => setMp(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field">
          <label>Пароль прислужника</label>
          <input type="password" value={sp} onChange={e => setSp(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn gold" disabled={busy} onClick={save}>{busy ? "…" : reset ? "Сохранить и войти заново" : "Запечатать"}</button>
        <div className="err">{err}</div>
        <div className="hint">Пароли хранятся только в виде хэшей (SHA-256) — в открытом виде их не увидит никто, включая этот сайт.</div>
      </div>
    </div>
  );
}

function LoginGate({ auth, onLogin, onMaster }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setBusy(true); setErr("");
    const h = await sha256(pw);
    setBusy(false);
    if (h === MASTER_HASH) onMaster();
    else if (h === auth.m) onLogin("mistress");
    else if (h === auth.s) onLogin("servant");
    else { setErr("Неверный пароль. Вход воспрещён."); setPw(""); }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="seal">🗝️</div>
        <h1 className="display">Только для двоих</h1>
        <div className="sub">Назови пароль — и я узнаю, кто ты</div>
        <div className="field">
          <label>Пароль</label>
          <input
            type="password" value={pw} autoFocus placeholder="••••••••"
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
          />
        </div>
        <button className="btn" disabled={busy || !pw} onClick={submit}>{busy ? "…" : "Войти"}</button>
        <div className="err">{err}</div>
      </div>
    </div>
  );
}

/* ─────────────────────────  КОРЕНЬ  ───────────────────────── */

export default function App() {
  const [state, setState] = useState("loading"); // loading | setup | login | in
  const [auth, setAuth] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    (async () => {
      const a = await loadKey(AUTH_KEY);
      if (a && a.m && a.s) { setAuth(a); setState("login"); }
      else setState("setup");
    })();
  }, []);

  const login = r => { setRole(r); setState("in"); };
  const logout = async () => {
    const a = await loadKey(AUTH_KEY);
    setAuth(a); setRole(null); setState("login");
  };

  return (
    <>
      <style>{CSS}</style>
      {state === "loading" && <div className="gate"><div className="sub" style={{ color: "var(--muted)" }}>…</div></div>}
      {state === "setup" && <SetupGate onDone={login} />}
      {state === "reset" && <SetupGate reset onDone={async () => { const a = await loadKey(AUTH_KEY); setAuth(a); setState("login"); }} />}
      {state === "login" && <LoginGate auth={auth} onLogin={login} onMaster={() => setState("reset")} />}
      {state === "in" && <Main role={role} onLogout={logout} />}
    </>
  );
}
