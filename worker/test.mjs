import assert from "node:assert/strict";
import worker from "./src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://langsage.github.io,http://127.0.0.1:8765",
  TELEGRAM_BOT_TOKEN: "test-token",
  TELEGRAM_CHAT_ID: "123456",
};

const originalFetch = globalThis.fetch;
let telegramRequest;
globalThis.fetch = async (url, options) => {
  telegramRequest = { url, options };
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

try {
  const orderRequest = new Request("https://worker.example/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://langsage.github.io" },
    body: JSON.stringify({
      name: "Анна",
      phone: "8 900 123-45-67",
      address: "Орехово-Зуево, улица Ленина, дом 10",
      items: [{ id: "product-1", name: "подменённое название", quantity: 2 }],
    }),
  });

  const response = await worker.fetch(orderRequest, env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.match(telegramRequest.url, /^https:\/\/api\.telegram\.org\/bottest-token\/sendMessage$/);
  const telegramBody = JSON.parse(telegramRequest.options.body);
  assert.match(telegramBody.text, /«Поздравляю» — классика/);
  assert.match(telegramBody.text, /2\s000 ₽/);
  assert.doesNotMatch(telegramBody.text, /подменённое название/);

  const forbiddenRequest = new Request("https://worker.example/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://example.com" },
    body: "{}",
  });
  const forbiddenResponse = await worker.fetch(forbiddenRequest, env);
  assert.equal(forbiddenResponse.status, 403);

  const invalidRequest = new Request("https://worker.example/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://langsage.github.io" },
    body: JSON.stringify({ name: "А", phone: "1", address: "коротко", items: [] }),
  });
  const invalidResponse = await worker.fetch(invalidRequest, env);
  assert.equal(invalidResponse.status, 400);

  console.log("Worker tests passed");
} finally {
  globalThis.fetch = originalFetch;
}
