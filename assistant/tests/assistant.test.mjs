import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackReply, handleRequest, redactSensitive } from '../src/index.js';

const origin = 'https://vavgroup.pro';
const env = {
  ALLOWED_ORIGINS: origin,
  VAV_STATE: {
    values: new Map(),
    async get(key) { return this.values.get(key) || null; },
    async put(key, value) { this.values.set(key, value); },
  },
};

test('redacts contact details before sending chat text to an AI provider', () => {
  const cleaned = redactSensitive('Email me at user@example.com or +7 922 111-22-33 @telegram_user');
  assert.equal(cleaned.includes('user@example.com'), false);
  assert.equal(cleaned.includes('922 111'), false);
  assert.equal(cleaned.includes('@telegram_user'), false);
});

test('guided mode answers public sales questions without an API key', () => {
  const answer = fallbackReply('Нужно улучшить продажи и CRM');
  assert.match(answer, /аудит|воронк|CRM/i);
});

test('health endpoint reports guided mode and disconnected Telegram', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'guided');
  assert.equal(body.telegram_connected, false);
  assert.equal(body.telegram_connection_current, false);
});

test('Telegram start code marks the current connection generation', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const connectEnv = {
      ...env,
      VAV_STATE: {
        values: new Map(),
        async get(key) { return this.values.get(key) || null; },
        async put(key, value) { this.values.set(key, value); },
      },
      TELEGRAM_BOT_TOKEN: 'test-token\r\n',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret\r\n',
      TELEGRAM_CONNECT_CODE: 'current-connect-code\r\n',
    };
    const response = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({ message: { chat: { id: 67890 }, text: '/start current-connect-code' } }),
    }), connectEnv);

    assert.equal(response.status, 200);
    assert.equal(connectEnv.VAV_STATE.values.get('admin_chat_id'), '67890');
    assert.equal(connectEnv.VAV_STATE.values.get('admin_connection_generation'), 'current-connect-code');

    const health = await handleRequest(new Request('https://worker.example/health'), connectEnv);
    assert.equal((await health.json()).telegram_connection_current, true);
    assert.equal(telegramRequests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chat endpoint requires explicit consent', async () => {
  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Продажи', session_id: 'session_12345' }),
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'consent_required');
});

test('chat endpoint returns a guided answer for an allowed site origin', async () => {
  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Как автоматизировать ручные отчёты?',
      session_id: 'session_12345',
      consent: true,
      history: [],
    }),
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'guided');
  assert.match(body.reply, /Автоматизация|процесс/i);
});

test('site chat routes Valentin requests through the official Telegram bot', async () => {
  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Vreau să discut direct cu Valentin',
      session_id: 'session_handoff_12345',
      consent: true,
      history: [],
    }),
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.reply, /t\.me\/VAVGroupBOT/);
  assert.equal(body.reply.includes('sendmeyrlocation'), false);
  assert.equal(body.mode, 'guided');
});

test('Workers AI receives redacted text and becomes the active chat mode', async () => {
  let received;
  const aiEnv = {
    ...env,
    AI: {
      async run(model, input) {
        received = { model, input };
        return { response: 'Рекомендуем начать с диагностики процесса.' };
      },
    },
  };
  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Напишите мне на user@example.com по поводу CRM',
      session_id: 'session_ai_12345',
      consent: true,
      history: [],
    }),
  }), aiEnv);
  const body = await response.json();
  assert.equal(body.mode, 'workers-ai');
  assert.equal(received.model, '@cf/meta/llama-3.1-8b-instruct-fast');
  assert.equal(received.input.messages.at(-1).content.includes('user@example.com'), false);
});

test('chat replaces an overlong AI answer with a concise verified response', async () => {
  const aiEnv = {
    ...env,
    AI: {
      async run() {
        return {
          response: 'Поможем с продажам. VAV Sales проводит аудит. VAV Automation настраивает CRM. VAV AI квалифицирует лиды. VAV Consulting помогает с внедрением. Что вам нужно? Какая у вас CRM?',
        };
      },
    },
  };

  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Какие услуги помогают улучшить продажи?',
      session_id: 'session_concise_12345',
      consent: true,
    }),
  }), aiEnv);

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'guided');
  assert.match(body.reply, /аудит[а-я]* источников лидов/i);
  assert.equal((body.reply.match(/\?/g) || []).length, 1);
});

test('chat endpoint rejects unknown origins', async () => {
  const response = await handleRequest(new Request('https://worker.example/chat', {
    method: 'POST',
    headers: { Origin: 'https://malicious.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello', session_id: 'session_12345', consent: true }),
  }), env);
  assert.equal(response.status, 403);
});

test('lead endpoint stays closed until Telegram is connected', async () => {
  const response = await handleRequest(new Request('https://worker.example/lead', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Иван',
      contact: '@ivan',
      message: 'Нужен аудит продаж',
      consent: true,
      session_id: 'session_lead_12345',
    }),
  }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'telegram_not_connected');
});

test('Telegram webhook answers an ordinary message through the assistant', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: 'Cum automatizez vânzările?' } }),
    }), {
      ...env,
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    });

    assert.equal(response.status, 200);
    assert.equal(telegramRequests.length, 1);
    assert.equal(telegramRequests[0].body.chat_id, '12345');
    assert.match(telegramRequests[0].body.text, /vânzări|CRM|leaduri/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram public start offers an explicit contact-sharing button', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({
        message: {
          chat: { id: 12345 },
          from: { id: 12345, language_code: 'ro' },
          text: '/start',
        },
      }),
    }), {
      ...env,
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    });

    assert.equal(response.status, 200);
    assert.equal(telegramRequests.length, 1);
    assert.equal(telegramRequests[0].body.reply_markup.keyboard[0][0].request_contact, true);
    assert.match(telegramRequests[0].body.text, /VAV Group|contact/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram contact and task are forwarded to the connected Valentin chat', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const state = {
    values: new Map([['admin_chat_id', '99999']]),
    async get(key) { return this.values.get(key) || null; },
    async put(key, value) { this.values.set(key, value); },
    async delete(key) { this.values.delete(key); },
  };
  const telegramEnv = {
    ...env,
    VAV_STATE: state,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
  };

  try {
    const contactResponse = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({
        message: {
          chat: { id: 12345 },
          from: { id: 12345, username: 'visitor', language_code: 'ro' },
          contact: { user_id: 12345, first_name: 'Alex', phone_number: '+37379000000' },
        },
      }),
    }), telegramEnv);
    assert.equal(contactResponse.status, 200);
    assert.equal(JSON.parse(state.values.get('telegram_lead:12345')).stage, 'awaiting_task');

    const taskResponse = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({
        message: {
          chat: { id: 12345 },
          from: { id: 12345, username: 'visitor', language_code: 'ro' },
          text: 'Vreau un audit al procesului de vânzări.',
        },
      }),
    }), telegramEnv);

    assert.equal(taskResponse.status, 200);
    assert.equal(state.values.has('telegram_lead:12345'), false);
    assert.equal(telegramRequests.length, 4);
    assert.equal(telegramRequests[1].body.chat_id, '99999');
    assert.match(telegramRequests[1].body.text, /Alex|\+37379000000|@visitor/i);
    assert.equal(telegramRequests[2].body.chat_id, '99999');
    assert.match(telegramRequests[2].body.text, /Alex|\+37379000000|@visitor|audit/i);
    assert.equal(telegramRequests[3].body.chat_id, '12345');
    assert.match(telegramRequests[3].body.text, /Valentin/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram mirrors each visitor message and bot answer to the connected admin chat', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const state = {
    values: new Map([['admin_chat_id', '99999']]),
    async get(key) { return this.values.get(key) || null; },
    async put(key, value) { this.values.set(key, value); },
    async delete(key) { this.values.delete(key); },
  };

  try {
    const response = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({
        message: {
          chat: { id: 12345 },
          from: { id: 12345, first_name: 'Alex', username: 'visitor', language_code: 'ro' },
          date: 1787432400,
          text: 'Cum pot automatiza vânzările?',
        },
      }),
    }), {
      ...env,
      VAV_STATE: state,
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    });

    assert.equal(response.status, 200);
    assert.equal(telegramRequests.length, 2);
    assert.equal(telegramRequests[0].body.chat_id, '12345');
    assert.equal(telegramRequests[1].body.chat_id, '99999');
    assert.match(telegramRequests[1].body.text, /Alex|@visitor|12345|automatiza|VAV Assistant/i);
    assert.match(telegramRequests[1].body.text, /Telegram не передал/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram webhook sends a direct-contact button without further qualification', async () => {
  const telegramRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    telegramRequests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await handleRequest(new Request('https://worker.example/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': 'webhook-secret',
      },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: 'Vreau să discut direct cu Valentin' } }),
    }), {
      ...env,
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_WEBHOOK_SECRET: 'webhook-secret',
    });

    assert.equal(response.status, 200);
    assert.equal(telegramRequests.length, 1);
    assert.equal(telegramRequests[0].body.reply_markup.keyboard[0][0].request_contact, true);
    assert.match(telegramRequests[0].body.text, /direct|Valentin|sendmeyrlocation/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
