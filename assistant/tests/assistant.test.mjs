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
