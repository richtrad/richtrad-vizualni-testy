const PLANS = __STUDY_PLANS__;
const PROTOCOL_HASH = "__PROTOCOL_HASH__";
const EXPORT_DIGEST = "__EXPORT_DIGEST__";
const STUDY = "M2-human-60-v1";
const CONSENT = "dobrovolny-verejny-sber-v1";
const ALL_CHOICES = new Set(["left", "right", "tie", "unsure", "technical"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const iso = ms => new Date(ms).toISOString();
const counts = `SELECT s.*, COUNT(a.seq) AS n, COALESCE(MAX(a.recorded),s.created) AS updated
  FROM sessions s LEFT JOIN answers a ON a.session_id=s.id`;

class Problem extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function requireValue(value, code, message) {
  if (!value) throw new Problem(code, message);
}
async function sha(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
const byId = (db, id) => db.prepare(counts + " WHERE s.id=? GROUP BY s.id").bind(id).first();
function summary(s) {
  return {session_id:s.id, mode:s.mode, schedule_slot:s.slot, answered:s.n,
    protocol_id:s.study, protocol_sha256:PROTOCOL_HASH, updated_utc:iso(s.updated),
    status:s.n === PLANS[s.slot - 1].trials.length ? "complete" : "in_progress"};
}
async function credentials(p) {
  requireValue(UUID.test(p.id) && typeof p.key === "string" && /^[0-9a-f]{64}$/.test(p.key),
    400, "Neplatný klíč měření.");
  return sha(p.key);
}
async function authorize(db, p) {
  const digest = await credentials(p);
  const s = await byId(db, p.id);
  requireValue(s && s.owner_hash === digest, 403, "Toto měření nelze otevřít.");
  requireValue(s.active, 410, "Rezervace bez první odpovědi vypršela. Můžete zahájit nové měření.");
  return s;
}
async function start(db, p) {
  const digest = await credentials(p);
  requireValue(p.consent === true && ["qa","participant"].includes(p.mode), 400, "Potvrďte dobrovolnou účast.");
  const previous = await byId(db, p.id);
  if (!previous) {
    const now = Date.now();
    if (p.mode === "participant") {
      await db.batch([
        db.prepare(`UPDATE sessions SET active=0 WHERE study=? AND mode='participant' AND active=1
          AND created < ? AND NOT EXISTS (SELECT 1 FROM answers WHERE session_id=sessions.id)`).bind(STUDY, now - 86400000),
        db.prepare(`WITH RECURSIVE slots(k) AS (VALUES(1) UNION ALL SELECT k+1 FROM slots WHERE k<32)
          INSERT OR IGNORE INTO sessions(id,owner_hash,study,mode,slot,consent_version,created)
          SELECT ?,?,?,'participant',k,?,? FROM slots WHERE NOT EXISTS
          (SELECT 1 FROM sessions WHERE study=? AND mode='participant' AND active=1 AND slot=k)
          ORDER BY (k-1)%16,k LIMIT 1`).bind(p.id, digest, STUDY, CONSENT, now, STUDY)
      ]);
    } else {
      await db.prepare("INSERT OR IGNORE INTO sessions(id,owner_hash,study,mode,slot,consent_version,created) VALUES(?,?,?,?,?,?,?)")
        .bind(p.id, digest, STUDY, "qa", 1, CONSENT, now).run();
    }
  }
  const s = await byId(db, p.id);
  requireValue(s, 409, "Všech 32 plánů je obsazeno. Stále si můžete otevřít vyzkoušení.");
  requireValue(s.owner_hash === digest && s.mode === p.mode, 403, "Klíč nepatří k této relaci.");
  requireValue(s.active, 410, "Rezervace vypršela. Zahajte nové měření.");
  return summary(s);
}
function validateTelemetry(t, choice) {
  requireValue(t && typeof t === "object" && Array.isArray(t.frames) && t.frames.length <= 5000 &&
    ["visible_ms","hidden_ms","viewport_width","viewport_height","replays","skipped_frames","device_pixel_ratio"]
      .every(k => Number.isFinite(t[k]) && t[k] >= 0) && typeof t.loaded === "boolean" &&
    typeof t.frame_log_truncated === "boolean", 400, "Neplatný záznam přehrávání.");
  let previous = -1;
  let previousWall = -1;
  for (const row of t.frames) {
    requireValue(row && Number.isSafeInteger(row.visible_ms) && row.visible_ms >= previous && row.visible_ms <= t.visible_ms &&
      Number.isSafeInteger(row.wall_ms) && row.wall_ms >= previousWall && Array.isArray(row.frames) &&
      row.frames.length === 3 && row.frames.every(f => Number.isInteger(f) && f >= -1 && f < 1000), 400, "Neplatné snímky.");
    previous = row.visible_ms;
    previousWall = row.wall_ms;
  }
  if (choice !== "technical") {
    requireValue(t.loaded && t.visible_ms >= 4000 && t.viewport_width >= 900 && t.viewport_height >= 650 &&
      t.frames.length >= 10, 400, "Pro odpověď jsou potřeba čtyři sekundy viditelného přehrávání.");
  }
}
async function answer(db, p) {
  const s = await authorize(db, p);
  const { presentation_index:seq, response_id:rid, choice, telemetry } = p;
  requireValue(Number.isInteger(seq) && seq >= 0 && seq < 64 && UUID.test(rid) && ALL_CHOICES.has(choice),
    400, "Neplatná odpověď.");
  validateTelemetry(telemetry, choice);
  const encoded = JSON.stringify(telemetry);
  const digest = await sha(JSON.stringify([s.id, seq, rid, choice, telemetry]));
  const now = Date.now();
  await db.prepare(`INSERT OR IGNORE INTO answers(session_id,seq,response_id,choice,telemetry,payload_sha256,recorded)
    SELECT ?,?,?,?,?,?,? FROM sessions WHERE id=? AND active=1
    AND (SELECT COUNT(*) FROM answers WHERE session_id=?)=?
    AND (?='technical' OR ?-COALESCE((SELECT MAX(recorded) FROM answers WHERE session_id=?),created)>=4000)`)
    .bind(s.id, seq, rid, choice, encoded, digest, now, s.id, s.id, seq, choice, now, s.id).run();
  const saved = await db.prepare("SELECT response_id,payload_sha256 FROM answers WHERE session_id=? AND seq=?").bind(s.id,seq).first();
  requireValue(saved && saved.response_id === rid && saved.payload_sha256 === digest, 409,
    "Odpověď nelze přiřadit. Obnovte stránku pro načtení uloženého pořadí.");
  return summary(await byId(db,s.id));
}
async function fullRecord(db, s) {
  const { results } = await db.prepare("SELECT * FROM answers WHERE session_id=? ORDER BY seq").bind(s.id).all();
  const plan = PLANS[s.slot - 1];
  const last = results.at(-1)?.recorded ?? s.created;
  return {schema:"dt_human_session_v1",session_id:s.id,mode:s.mode,
    authenticity:s.mode === "qa" ? "software QA, not human evidence" : "declared participant; provenance requires researcher confirmation",
    schedule_slot:s.slot,participant_split:plan.participant_split,protocol_id:s.study,protocol_sha256:PROTOCOL_HASH,
    consent:true,consent_text_version:s.consent_version,collection_channel:"github-pages-d1-v1",
    created_utc:iso(s.created),updated_utc:iso(last),trial_available_since:last/1000,
    status:results.length === plan.trials.length ? "complete" : "in_progress",
    answers:results.map(a => ({...plan.trials[a.seq],choice:a.choice,response_id:a.response_id,payload_sha256:a.payload_sha256,
      recorded_utc:iso(a.recorded),telemetry:JSON.parse(a.telemetry)}))};
}
async function route(req, db) {
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && path === "/v1/status") {
    await db.prepare("SELECT 1 FROM sessions LIMIT 1").first();
    return {study:STUDY, protocol_sha256:PROTOCOL_HASH, online:true};
  }
  requireValue(req.method === "POST", 404, "Tato adresa neexistuje.");
  const admin = path.startsWith("/v1/export/");
  if (admin) {
    const auth = req.headers.get("Authorization") ?? "";
    requireValue(auth.startsWith("Bearer ") && await sha(auth.slice(7)) === EXPORT_DIGEST, 403, "Přístup odepřen.");
  }
  requireValue(Number(req.headers.get("Content-Length") || 0) <= 650000, 413, "Příliš dlouhý záznam.");
  const body = await req.text();
  requireValue(body.length <= 650000, 413, "Příliš dlouhý záznam.");
  let p;
  try { p = JSON.parse(body); } catch { throw new Problem(400, "Očekává se JSON."); }
  requireValue(p && typeof p === "object" && !Array.isArray(p),400,"Chybí parametry.");
  if (path === "/v1/start") return start(db,p);
  if (path === "/v1/answer") return answer(db,p);
  if (path === "/v1/session") return summary(await authorize(db,p));
  if (path === "/v1/own-record") return fullRecord(db,await authorize(db,p));
  if (path === "/v1/export/index") {
    const { results } = await db.prepare(counts + " WHERE s.id>? GROUP BY s.id HAVING COUNT(a.seq)>0 ORDER BY s.id LIMIT 64")
      .bind(typeof p.after === "string" ? p.after : "").all();
    return {sessions:results.map(summary)};
  }
  if (path === "/v1/export/record") {
    const s = await byId(db, p.id ?? "");
    requireValue(s,404,"Neznámé měření.");
    return fullRecord(db,s);
  }
  throw new Problem(404,"Tato adresa neexistuje.");
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const options = { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store", "Vary":"Origin",
      "X-Content-Type-Options":"nosniff" };
    if (origin && origin !== "https://richtrad.github.io") {
      return new Response(JSON.stringify({error:"Nepovolený původ."}),{status:403,headers:options});
    }
    if (origin) Object.assign(options,{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"600"});
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:options});
    try {
      return new Response(JSON.stringify(await route(request,env.DB)),{headers:options});
    } catch (err) {
      return new Response(JSON.stringify({error:err.status ? err.message : "Úložiště je dočasně nedostupné. Zkuste to znovu."}),
        {status:err.status ?? 503,headers:options});
    }
  }
};
