// neyzam-site Worker
//   * serves the static site (the ASSETS binding)
//   * booking API, stored in Cloudflare D1 (binding DB):
//       GET  /api/book                 -> { ready: boolean }  (the form only shows once the DB is bound)
//       POST /api/book                 -> validates, then INSERTs into the bookings table
//       GET  /api/admin/bookings       -> list bookings, needs "Authorization: Bearer <ADMIN_TOKEN>"
//
// Secret (wrangler secret put ADMIN_TOKEN); optional variable ALLOWED_ORIGINS (comma separated)

const TOPICS = [
  'Quote requests & lead follow-up',
  'CRM & data syncing',
  'AI agent for client communication',
  'Data entry & reporting',
  'Something else',
];
const WINDOWS = ['Morning', 'Afternoon', 'Evening', 'Anytime'];
const DEFAULT_ORIGINS = 'https://neyzam.online,https://www.neyzam.online';
const MAX_BODY_BYTES = 10_000;
const MIN_FILL_MS = 1200;          // faster than this is a bot, not a person
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

// Trim, drop control characters, cap the length
const clean = (value, max) =>
  String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

function validate(body) {
  const errors = {};
  const data = {
    name: clean(body.name, 100),
    email: clean(body.email, 254).toLowerCase(),
    company: clean(body.company, 120),
    topic: clean(body.topic, 80),
    process: clean(body.process, 1500),
    preferredDate: clean(body.preferredDate, 10),
    preferredWindow: clean(body.preferredWindow, 20),
    timezone: clean(body.timezone, 60),
  };

  if (data.name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Please enter a valid email address.';
  if (!TOPICS.includes(data.topic)) errors.topic = 'Please choose what you want to automate.';

  if (data.preferredDate) {
    const t = Date.parse(`${data.preferredDate}T00:00:00Z`);
    const now = Date.now();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.preferredDate) || Number.isNaN(t) || t < now - 2 * 86400000 || t > now + 366 * 86400000) {
      errors.preferredDate = 'Please pick a valid day.';
    }
  }
  if (data.preferredWindow && !WINDOWS.includes(data.preferredWindow)) errors.preferredWindow = 'Please pick a time of day.';

  return { data, errors };
}

async function handleBooking(request, env, ctx) {
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);

  // Only our own pages may post here
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim());
  const origin = request.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return json({ ok: false, error: 'forbidden' }, 403);

  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return json({ ok: false, error: 'bad_request' }, 415);
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad_request' }, 400);

  // Bot traps: a hidden field only bots fill in, and a form that was "filled" impossibly fast
  if (clean(body.website, 200)) return json({ ok: true });                  // pretend success, deliver nothing
  const filledIn = Date.now() - Number(body.openedAt);
  if (!Number.isFinite(filledIn) || filledIn < MIN_FILL_MS) return json({ ok: false, error: 'too_fast' }, 429);

  const { data, errors } = validate(body);
  if (Object.keys(errors).length) return json({ ok: false, error: 'validation', fields: errors }, 400);

  try {
    await env.DB.prepare(
      `INSERT INTO bookings (name, email, company, topic, process, preferred_date, preferred_window, timezone, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(data.name, data.email, data.company, data.topic, data.process, data.preferredDate, data.preferredWindow,
           data.timezone, clean(request.headers.get('user-agent'), 200)).run();
  } catch (err) {
    console.error('booking: db insert failed', err && err.message);   // no personal data in logs
    return json({ ok: false, error: 'delivery_failed' }, 502);
  }
  if (env.RESEND_API_KEY && env.NOTIFY_TO) ctx.waitUntil(notify(env, data));   // email alert, never blocks or fails the booking
  return json({ ok: true });
}

const esc = (v) => String(v || '-').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function notify(env, d) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.NOTIFY_FROM || 'Neyzam bookings <onboarding@resend.dev>',
        to: env.NOTIFY_TO.split(',').map((s) => s.trim()),
        reply_to: d.email,
        subject: `New call request: ${d.name} (${d.topic})`,
        html: `<p><b>${esc(d.name)}</b> &lt;${esc(d.email)}&gt;<br>Company: ${esc(d.company)}<br>Topic: ${esc(d.topic)}<br>` +
          `Preferred: ${esc(d.preferredDate)} ${esc(d.preferredWindow)} (${esc(d.timezone)})</p><p>${esc(d.process)}</p>`,
      }),
    });
    if (!res.ok) console.error('notify: resend answered', res.status);
  } catch (err) {
    console.error('notify failed', err && err.name);
  }
}

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(v))));
  const ax = new Uint8Array(x), ay = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ ay[i];
  return diff === 0;
}

async function handleAdmin(request, env) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!env.ADMIN_TOKEN || !env.DB || !(await timingSafeEqual(token, env.ADMIN_TOKEN))) return json({ ok: false, error: 'unauthorized' }, 401);
  if (request.method === 'PATCH') {
    let b;
    try { b = await request.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }
    if (!Number.isInteger(b.id) || !['new', 'contacted', 'done'].includes(b.status)) return json({ ok: false, error: 'bad_request' }, 400);
    await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(b.status, b.id).run();
    return json({ ok: true });
  }
  const { results } = await env.DB.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 200').all();
  return json({ ok: true, bookings: results });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/admin/bookings' && ['GET', 'PATCH'].includes(request.method)) return handleAdmin(request, env);
    if (pathname !== '/api/book') return env.ASSETS.fetch(request);       // everything else is the static site

    if (request.method === 'GET') return json({ ready: Boolean(env.DB) });
    if (request.method === 'POST') return handleBooking(request, env, ctx);
    return json({ ok: false, error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
  },
};
