const PRODUCTS = {
  "product-1": "«Поздравляю» — классика",
  "product-2": "«С днём рождения» — минимал",
  "product-3": "«С днём рождения» — цветы",
  "product-4": "«Ты прекрасна»",
  "product-5": "«От всей души» — нежность",
  "product-6": "«Для тебя с любовью»",
  "product-7": "«От всей души» — зелень",
  "product-8": "«С юбилеем» — пудровый",
  "product-9": "«Самой красивой»",
  "product-10": "«С юбилеем» — розовые цветы",
  "product-11": "«Love you more» — цветок",
  "product-12": "«Love you more» — розы",
};

const UNIT_PRICE = 1000;
const DEFAULT_ORIGINS = ["https://langsage.github.io", "http://127.0.0.1:8765", "http://localhost:8765"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const corsOrigin = allowedOrigins.includes(origin) ? origin : "";

    if (request.method === "OPTIONS") {
      if (!corsOrigin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, corsOrigin);
    if (!corsOrigin) return json({ ok: false, error: "Origin not allowed" }, 403, corsOrigin);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "Order service is not configured" }, 503, corsOrigin);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 20_000) return json({ ok: false, error: "Request is too large" }, 413, corsOrigin);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400, corsOrigin);
    }

    if (payload.company) return json({ ok: true }, 200, corsOrigin);

    const validation = validateOrder(payload);
    if (!validation.ok) return json({ ok: false, error: validation.error }, 400, corsOrigin);

    const { name, phone, address, items } = validation.order;
    const packageCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const total = packageCount * UNIT_PRICE;
    const orderNumber = `${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const itemLines = items.map((item, index) => `${index + 1}. ${escapeHtml(item.name)} — <b>${item.quantity} уп.</b>`).join("\n");
    const message = [
      "🛍 <b>Новый заказ с сайта</b>",
      `<b>Номер:</b> ${orderNumber}`,
      "",
      `<b>Имя:</b> ${escapeHtml(name)}`,
      `<b>Телефон:</b> <code>${escapeHtml(phone)}</code>`,
      `<b>Адрес:</b> ${escapeHtml(address)}`,
      "",
      "<b>Состав заказа:</b>",
      itemLines,
      "",
      `<b>Всего упаковок:</b> ${packageCount}`,
      `<b>Сумма:</b> ${formatPrice(total)}`,
      "<b>Оплата:</b> при получении",
    ].join("\n");

    const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!telegramResponse.ok) {
      console.error("Telegram delivery failed", telegramResponse.status, await telegramResponse.text());
      return json({ ok: false, error: "Telegram delivery failed" }, 502, corsOrigin);
    }

    return json({ ok: true, orderNumber }, 200, corsOrigin);
  },
};

function validateOrder(payload) {
  const name = String(payload?.name || "").trim();
  const phone = String(payload?.phone || "").trim();
  const address = String(payload?.address || "").trim();
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];

  if (name.length < 2 || name.length > 80) return { ok: false, error: "Invalid name" };
  if (phone.replace(/\D/g, "").length < 10 || phone.length > 24) return { ok: false, error: "Invalid phone" };
  if (address.length < 8 || address.length > 300) return { ok: false, error: "Invalid address" };
  if (!rawItems.length || rawItems.length > 12) return { ok: false, error: "Invalid cart" };

  const items = [];
  for (const rawItem of rawItems) {
    const id = String(rawItem?.id || "");
    const quantity = Number(rawItem?.quantity);
    if (!PRODUCTS[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { ok: false, error: "Invalid cart item" };
    }
    items.push({ id, name: PRODUCTS[id], quantity });
  }

  return { ok: true, order: { name, phone, address, items } };
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  const headers = { "Content-Type": "application/json; charset=UTF-8" };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(body), { status, headers });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}
