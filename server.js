const express = require("express");
const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
let db = { vapid: null, subs: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))); } catch (e) {}
function persist() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch (e) { console.error("save failed", e.message); } }

// VAPID keys: from env if set, otherwise generated once and stored in the data file.
if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
  db.vapid = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
} else if (!db.vapid) {
  db.vapid = webpush.generateVAPIDKeys();
  persist();
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", db.vapid.publicKey, db.vapid.privateKey);

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/key", (req, res) => res.json({ key: db.vapid.publicKey }));

function validTz(tz) { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; } }

app.post("/api/sync", (req, res) => {
  const b = req.body || {};
  const sub = b.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys) return res.status(400).json({ error: "bad subscription" });
  if (!/^\d\d:\d\d$/.test(b.time || "") || !validTz(b.tz)) return res.status(400).json({ error: "bad time or timezone" });
  const prev = db.subs[sub.endpoint];
  db.subs[sub.endpoint] = {
    subscription: sub,
    time: b.time,
    tz: b.tz,
    habits: Array.isArray(b.habits) ? b.habits.slice(0, 200).map(h => ({ name: String(h.name || "").slice(0, 80), done: h.done && typeof h.done === "object" ? h.done : {} })) : [],
    tasks: Array.isArray(b.tasks) ? b.tasks.slice(0, 500).map(t => ({ done: !!t.done, due: String(t.due || "") })) : [],
    last: prev ? prev.last : ""
  };
  persist();
  res.json({ ok: true });
});

app.post("/api/unsubscribe", (req, res) => {
  const ep = req.body && req.body.endpoint;
  if (ep && db.subs[ep]) { delete db.subs[ep]; persist(); }
  res.json({ ok: true });
});

function localNow(tz) {
  const p = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
}

async function tick() {
  let dirty = false;
  for (const ep of Object.keys(db.subs)) {
    const s = db.subs[ep];
    const now = localNow(s.tz);
    if (now.hm < s.time || s.last === now.day) continue;
    s.last = now.day; dirty = true;
    const pending = s.habits.filter(h => !h.done[now.day]).length;
    const late = s.tasks.filter(t => !t.done && t.due && t.due < now.day).length;
    if (!pending && !late) continue;
    const parts = [];
    if (pending) parts.push(`${pending} habit${pending === 1 ? "" : "s"} left today`);
    if (late) parts.push(`${late} overdue task${late === 1 ? "" : "s"}`);
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title: "Daily Ledger", body: parts.join(", ") }));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) delete db.subs[ep];
      else console.error("push failed", e.statusCode || e.message);
    }
  }
  if (dirty) persist();
}
setInterval(tick, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Daily Ledger running on port " + PORT));
