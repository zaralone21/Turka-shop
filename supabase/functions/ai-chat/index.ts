// AI-менеджер: передає розмову моделі Claude і повертає її відповідь.
// Ключ ANTHROPIC_API_KEY зберігається лише в секретах Supabase і не потрапляє в браузер.
// Інструменти (читання записів, створення завдань тощо) виконуються в браузері користувача,
// тому модель отримує лише ті дані, які запитала для конкретного питання.
import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { admin, cors, json, userFrom } from "../_shared/auth.ts";
import { SYSTEM, TOOLS } from "./prompt.ts";

const KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("AI_MODEL") || "claude-opus-5-5";
const EFFORT = (Deno.env.get("AI_EFFORT") || "medium") as "low" | "medium" | "high";
const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") || 300);
const MAX_BODY = 12_000_000;
// Пошук у мережі й читання сайтів (виконуються на серверах Anthropic). AI_WEB=off вимикає.
const WEB = (Deno.env.get("AI_WEB") || "on") !== "off";
const WEB_TOOLS = WEB ? [
  { type: "web_search_20260209", name: "web_search", max_uses: 10 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 20, max_content_tokens: 12000, citations: { enabled: true } },
] : [];

// Функція Supabase має обмеження часу (~150 с), тому один запит до моделі не довше 125 с і без повторів.
const client = KEY ? new Anthropic({ apiKey: KEY, maxRetries: 0, timeout: 125_000 }) : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await userFrom(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (req.method === "GET") return json({ configured: !!client, model: client ? MODEL : null, web: !!client && WEB });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!client) return json({ error: "not_configured" }, 503);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too_long" }, 413);
  let messages: Anthropic.Beta.BetaMessageParam[];
  let container: string | null = null;
  try {
    const body = JSON.parse(raw);
    messages = body.messages;
    // Робоче середовище, де AI фільтрує сторінки сайтів: одне на розмову, щоб проміжні файли не губилися між повідомленнями.
    if (typeof body.container === "string" && /^[\w-]{1,200}$/.test(body.container)) container = body.container;
    if (!Array.isArray(messages) || !messages.length || messages[0].role !== "user") throw new Error("bad");
    if (messages.length > 2000) throw new Error("bad");
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const db = admin();
  const { data: allowed, error: limErr } = await db.rpc("bump_ai_usage", { uid: user.id, max_calls: DAILY_LIMIT });
  if (limErr) return json({ error: "server", detail: limErr.message }, 500);
  if (!allowed) return json({ error: "daily_limit" }, 429);

  try {
    const ask = (box: string | null) => client.beta.messages.create({
      ...(box ? { container: box } : {}),
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [...TOOLS, ...WEB_TOOLS] as Anthropic.Beta.BetaToolUnion[],
      messages,
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    let res;
    try { res = await ask(container); }
    catch (e) {
      // Середовище живе обмежений час; якщо воно вже недоступне, продовжуємо з новим.
      if (container && e instanceof Anthropic.BadRequestError && /container/i.test(e.message)) res = await ask(null);
      else throw e;
    }
    await db.rpc("add_ai_tokens", { uid: user.id, inp: res.usage.input_tokens + (res.usage.cache_read_input_tokens || 0) + (res.usage.cache_creation_input_tokens || 0), outp: res.usage.output_tokens });
    return json({ content: res.content, stop_reason: res.stop_reason, stop_details: res.stop_details ?? null, model: res.model, container: res.container?.id ?? null });
  } catch (e) {
    console.error("ai-chat:", e instanceof Anthropic.APIError ? `${e.status ?? "-"} ${e.message}` : String(e));
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json({ error: "timeout" }, 504);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json({ error: "bad_key" }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (e instanceof Anthropic.BadRequestError) return json({ error: "bad_request", detail: e.message }, 400);
    if (e instanceof Anthropic.APIError) return json({ error: "upstream", status: e.status ?? null, detail: e.message }, 502);
    return json({ error: "upstream", detail: String(e).slice(0, 300) }, 502);
  }
});
