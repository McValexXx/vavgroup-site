const DEFAULT_ALLOWED_ORIGINS = ['https://vavgroup.pro', 'https://www.vavgroup.pro'];
const rateBuckets = new Map();

export const PUBLIC_KNOWLEDGE = `
VAV Group строит системы роста бизнеса: диагностирует бизнес-системы, улучшает продажи,
автоматизирует процессы и внедряет практичные AI-инструменты.

Направления:
- VAV Business — диагностика бизнеса, стратегия роста, бизнес-модель, процессы и масштабирование.
- VAV Sales — B2B/B2C продажи, аудит воронки и CRM, скрипты, follow-up, аналитика и управление отделом продаж.
- VAV Automation — CRM-процессы, маршрутизация лидов, отчётность, интеграции, уведомления и сокращение ручной работы.
- VAV AI — AI-ассистенты, квалификация лидов, базы знаний, анализ звонков и документов, рабочие AI-сценарии.
- VAV Consulting — диагностика, приоритизация, проектирование, внедрение, измерение и улучшение.
- VAV Networking — профессиональные знакомства, поиск партнёров и развитие деловой экосистемы без обещаний неподтверждённого доступа.
- VAV Academy — обучение продажам, переговорам, управлению, автоматизации и AI для бизнеса.
- VAV Production — презентации, коммерческие предложения, цифровой контент, лендинги и материалы для продаж.

Подход VAV Group: сначала бизнес-задача и диагностика, затем решение, внедрение и измерение.
VAV Group не продаёт автоматизацию ради автоматизации, не обещает гарантированный рост и не
публикует названия клиентов, показатели или партнёрства без подтверждения и разрешения.

Публичные контакты: Валентин Стратила, valentin@vavgroup.pro, +7 (922) 461-55-17.
`;

const SYSTEM_INSTRUCTIONS = `
Ты — VAV Assistant на официальном сайте VAV Group. Помогай посетителю понять, какое направление
подходит его задаче, и подготовить краткий контекст для разговора с Валентином.

Правила:
1. Отвечай на языке посетителя; если язык неясен — по-русски.
2. Пиши кратко, конкретно и профессионально: 1–3 коротких предложения, максимум 70 слов.
   Задавай не более одного вопроса за ответ. Не повторяй уже известный контекст.
3. Используй только публичные факты из базы ниже. Не придумывай клиентов, цифры, цены,
   партнёрства, гарантии, сотрудников, историю компании или результаты кейсов.
4. Не называй работодателя клиента VAV Group и не утверждай, что сделка была выиграна,
   оплачена или реализована, если этого нет в публичной базе.
5. Не давай юридических, медицинских или финансовых заключений. При необходимости обозначь
   ограничение и предложи профильного специалиста.
6. Не проси паспортные, платёжные, медицинские и другие чувствительные данные. Для имени и
   контакта направляй пользователя в защищённую форму «Передать задачу Валентину».
7. Если данных недостаточно, задай один полезный уточняющий вопрос.
8. В подходящий момент предложи диагностику или разговор с Валентином, но без давления.
9. Если человек прямо просит связать его с Валентином, консультантом или живым человеком,
   не квалифицируй дальше и не проси лишние данные. Канал связи выбирает приложение;
   не придумывай и не подставляй свою ссылку.

Публичная база VAV Group:
${PUBLIC_KNOWLEDGE}
`;

function normalize(value, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function redactSensitive(value) {
  return normalize(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-zА-Яа-я]{2,}/g, '[контакт скрыт]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[контакт скрыт]')
    .replace(/(^|\s)@[A-Za-z0-9_]{4,}/g, '$1[контакт скрыт]');
}

function isRomanian(text) {
  return /[ăâîșț]|\b(bună|vreau|putem|afacere|vânzări|automatizare|consultanță|preț|contact)\b/i.test(text);
}

function wantsHumanHandoff(value) {
  return /(соед[ие]н|связ(?:аться|и)|поговор(?:ить|ю)|написать).{0,35}валентин|валентин.{0,35}(соед[ие]н|связ|поговор|напис)|жив(?:ой|ым)\s+человек|оператор|консультант|(?:vreau|doresc|pot|aș vrea).{0,30}(?:vorb|discut|scri).{0,25}(?:valentin|om|persoan|consultant|operator)|(?:vorb|discut|scri).{0,25}(?:direct|cu).{0,20}valentin|(?:connect|talk|speak|message).{0,30}(?:valentin|human|consultant|operator)|human\s+(?:agent|consultant)/i.test(normalize(value, 500));
}

function humanHandoffReply(message) {
  return isRomanian(message)
    ? 'Sigur. Îi puteți scrie direct lui Valentin în Telegram: https://t.me/sendmeyrlocation'
    : 'Конечно. Напишите Валентину напрямую в Telegram: https://t.me/sendmeyrlocation';
}

function siteBotHandoffReply(message) {
  return isRomanian(message)
    ? 'Sigur. Continuați prin botul oficial VAVGroup_AIBOT: https://t.me/VAVGroup_AIBOT. Solicitarea va fi transmisă lui Valentin.'
    : 'Конечно. Продолжите в официальном боте VAVGroup_AIBOT: https://t.me/VAVGroup_AIBOT. Обращение будет передано Валентину.';
}

export function fallbackReply(message) {
  const source = normalize(message).toLowerCase();
  const ro = isRomanian(source);

  const responses = [
    {
      match: /(продаж|воронк|crm|лид|скрипт|конверс|sales|vânz|clien|crm)/i,
      ru: 'Для задач продаж обычно начинаем с аудита источников лидов, воронки, CRM, коммуникаций менеджеров и follow-up. После диагностики можно определить приоритеты: процесс, управление, автоматизация или обучение. Что сейчас ограничивает результат сильнее — количество лидов или конверсия?',
      ro: 'Pentru vânzări începem de obicei cu sursele de leaduri, pipeline-ul, CRM-ul, conversațiile managerilor și follow-up-ul. După diagnostic stabilim dacă prioritatea este procesul, managementul, automatizarea sau instruirea. Ce limitează acum rezultatul: numărul leadurilor sau conversia?',
    },
    {
      match: /(автомат|интеграц|ручн|отч[её]т|документ|workflow|automatiz|manual|raport)/i,
      ru: 'Автоматизация должна сокращать время ответа, ошибки и ручные операции. VAV Automation сначала описывает процесс и точки потерь, затем проектирует CRM-логику, уведомления, отчётность или интеграции. Какой процесс команда повторяет вручную чаще всего?',
      ro: 'Automatizarea trebuie să reducă timpul de răspuns, erorile și operațiunile manuale. VAV Automation descrie mai întâi procesul și pierderile, apoi proiectează logica CRM, notificările, raportarea sau integrările. Ce proces este repetat manual cel mai des?',
    },
    {
      match: /(^|\s)(ai|ии|искусствен|агент|ассистент|нейро|inteligen)/i,
      ru: 'VAV AI рассматривает практичные сценарии: квалификация лидов, внутренние ассистенты, базы знаний, анализ звонков и документов. AI не стоит внедрять там, где процесс не определён или ошибка несёт высокий риск без человеческой проверки. Какую конкретную задачу вы хотите передать AI?',
      ro: 'VAV AI lucrează cu scenarii practice: calificarea leadurilor, asistenți interni, baze de cunoștințe și analiza apelurilor sau documentelor. AI nu trebuie introdus într-un proces neclar ori cu risc ridicat fără verificare umană. Ce sarcină concretă vreți să transmiteți AI-ului?',
    },
    {
      match: /(аудит|диагност|стратег|масштаб|процесс|consult|diagnost|strategie)/i,
      ru: 'Диагностика помогает отделить симптомы от системной причины. Мы фиксируем контекст, ограничения, данные и приоритеты, затем формируем понятную карту внедрения. Вы хотите разобрать продажи, операционные процессы или систему управления целиком?',
      ro: 'Diagnosticul separă simptomele de cauza sistemică. Fixăm contextul, limitările, datele și prioritățile, apoi construim o hartă clară de implementare. Doriți să analizăm vânzările, operațiunile sau întregul sistem de management?',
    },
    {
      match: /(обуч|академ|курс|тренинг|переговор|academy|curs|instru)/i,
      ru: 'VAV Academy готовит практические форматы по B2B-продажам, переговорам, CRM-дисциплине, управлению, автоматизации и AI. Программа и формат определяются после уточнения уровня команды и рабочих задач; неподтверждённые цены на сайте не публикуются.',
      ro: 'VAV Academy pregătește formate practice pentru vânzări B2B, negocieri, disciplină CRM, management, automatizare și AI. Programul și formatul se stabilesc după nivelul echipei și sarcinile reale; prețurile neconfirmate nu sunt publicate.',
    },
    {
      match: /(презентац|контент|видео|лендинг|предложен|production|prezent|conținut|landing)/i,
      ru: 'VAV Production создаёт презентации, коммерческие предложения, лендинги, цифровой контент и материалы для продаж. Работа начинается не с дизайна, а с задачи, аудитории и следующего действия, которое должен совершить клиент.',
      ro: 'VAV Production creează prezentări, oferte comerciale, landing pages, conținut digital și materiale de vânzări. Lucrul începe cu obiectivul, publicul și acțiunea următoare a clientului, nu doar cu designul.',
    },
    {
      match: /(цен|стоим|сколько|прайс|price|preț|cost)/i,
      ru: 'Стоимость зависит от масштаба задачи, состояния процессов и глубины внедрения. Чтобы не называть случайную цену, лучше коротко описать контекст через форму «Передать задачу Валентину» — после этого можно определить подходящий первый этап.',
      ro: 'Costul depinde de amploarea sarcinii, starea proceselor și profunzimea implementării. Pentru a evita un preț arbitrar, descrieți pe scurt contextul prin formularul „Transmite sarcina lui Valentin”; apoi putem stabili primul pas potrivit.',
    },
    {
      match: /(контакт|связ|телефон|почт|telegram|contact|telefon|email)/i,
      ru: 'Связаться с Валентином можно по email valentin@vavgroup.pro или по телефону +7 (922) 461-55-17. Также можно передать контекст через форму в этом чате — после подключения Telegram уведомление придёт Валентину напрямую.',
      ro: 'Îl puteți contacta pe Valentin la valentin@vavgroup.pro sau la +7 (922) 461-55-17. Puteți transmite și contextul prin formularul din chat; după conectarea Telegram, notificarea îi va veni direct.',
    },
  ];

  const found = responses.find((item) => item.match.test(source));
  if (found) return ro ? found.ro : found.ru;

  return ro
    ? 'Vă pot orienta către vânzări, automatizare, AI, consultanță, networking, academy sau production. Descrieți într-o propoziție ce doriți să îmbunătățiți și vă propun următorul pas potrivit.'
    : 'Могу сориентировать по продажам, автоматизации, AI, консалтингу, networking, academy или production. Опишите одним предложением, что хотите улучшить, и я предложу подходящий следующий шаг.';
}

export function isConciseReply(value) {
  const reply = normalize(value, 4000);
  if (!reply) return false;

  const words = reply.split(/\s+/).filter(Boolean).length;
  const questions = (reply.match(/\?/g) || []).length;
  const sentenceLikeParts = reply
    .split(/(?<=[.!?])(?:\s+|$)|\n+/u)
    .map((part) => part.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  return words <= 70 && questions <= 1 && sentenceLikeParts.length <= 3;
}

function allowedOrigins(env) {
  const configured = normalize(env.ALLOWED_ORIGINS || '', 1000)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(origin, env) {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins(env).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(origin, env),
  });
}

function isAllowedBrowserRequest(request, env) {
  const origin = request.headers.get('Origin') || '';
  return origin && allowedOrigins(env).includes(origin);
}

function rateLimit(request, sessionId) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const key = `${request.headers.get('CF-Connecting-IP') || 'unknown'}:${sessionId}`;
  const recent = (rateBuckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= 12) return false;
  recent.push(now);
  rateBuckets.set(key, recent);
  if (rateBuckets.size > 1500) rateBuckets.clear();
  return true;
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-8)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: redactSensitive(item?.content || ''),
    }))
    .filter((item) => item.content);
}

async function openAiReply(env, message, history) {
  if (!env.OPENAI_API_KEY) return null;
  const input = [
    ...history.map((item) => ({
      role: item.role,
      content: [{ type: 'input_text', text: item.content }],
    })),
    { role: 'user', content: [{ type: 'input_text', text: redactSensitive(message) }] },
  ];

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.4-mini',
      instructions: SYSTEM_INSTRUCTIONS,
      input,
      max_output_tokens: 360,
      reasoning: { effort: 'none' },
      store: false,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const data = await response.json();
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return null;
}

async function workersAiReply(env, message, history) {
  if (!env.AI || typeof env.AI.run !== 'function') return null;
  const result = await env.AI.run(
    env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct-fast',
    {
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTIONS },
        ...history,
        { role: 'user', content: redactSensitive(message) },
      ],
      max_tokens: 360,
      temperature: 0.2,
    },
  );
  return typeof result?.response === 'string' && result.response.trim()
    ? result.response.trim()
    : null;
}

function aiMode(env) {
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.AI && typeof env.AI.run === 'function') return 'workers-ai';
  return 'guided';
}

async function assistantReply(env, message, history = []) {
  let reply = null;
  let mode = 'guided';
  try {
    reply = await openAiReply(env, message, history);
    if (reply) mode = 'openai';
  } catch {
    reply = null;
  }
  if (!reply) {
    try {
      reply = await workersAiReply(env, message, history);
      if (reply) mode = 'workers-ai';
    } catch {
      reply = null;
    }
  }
  if (!reply || !isConciseReply(reply)) {
    reply = fallbackReply(message);
    mode = 'guided';
  }
  return { reply, mode };
}

function telegramUrl(env, method) {
  return `https://api.telegram.org/bot${normalize(env.TELEGRAM_BOT_TOKEN || '', 256)}/${method}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

async function telegramCall(env, method, payload) {
  if (!normalize(env.TELEGRAM_BOT_TOKEN || '', 256)) throw new Error('Telegram token is not configured');
  const response = await fetch(telegramUrl(env, method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.description || 'Telegram request failed');
  return data.result;
}

async function adminChatId(env) {
  if (env.VAV_STATE) {
    const stored = await env.VAV_STATE.get('admin_chat_id');
    if (stored) return stored;
  }
  return normalize(env.TELEGRAM_CHAT_ID || '', 64);
}

function telegramLeadKey(chatId) {
  return `telegram_lead:${chatId}`;
}

async function telegramLeadState(env, chatId) {
  if (!env.VAV_STATE) return null;
  const stored = await env.VAV_STATE.get(telegramLeadKey(chatId));
  if (!stored) return null;
  try { return JSON.parse(stored); } catch { return null; }
}

async function saveTelegramLeadState(env, chatId, value) {
  if (!env.VAV_STATE) throw new Error('KV binding missing');
  await env.VAV_STATE.put(telegramLeadKey(chatId), JSON.stringify(value), { expirationTtl: 3600 });
}

async function clearTelegramLeadState(env, chatId) {
  if (env.VAV_STATE && typeof env.VAV_STATE.delete === 'function') {
    await env.VAV_STATE.delete(telegramLeadKey(chatId));
  }
}

function telegramContactKeyboard(romanian = false) {
  return {
    keyboard: [[{
      text: romanian ? 'Trimite contactul lui Valentin' : 'Передать контакт Валентину',
      request_contact: true,
    }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function telegramVisitorIsRomanian(message, text = '') {
  return String(message?.from?.language_code || '').toLowerCase().startsWith('ro') || isRomanian(text);
}

function telegramMessageTime(message) {
  const unixTime = Number(message?.date || 0);
  const date = unixTime > 0 ? new Date(unixTime * 1000) : new Date();
  try {
    return `${new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date)} МСК`;
  } catch {
    return date.toISOString();
  }
}

async function mirrorTelegramExchange(env, message, visitorText, botReply, event = 'Диалог с VAVGroup_AIBOT') {
  const adminId = await adminChatId(env);
  const visitorChatId = message?.chat?.id ? String(message.chat.id) : '';
  if (!adminId || !visitorChatId || adminId === visitorChatId) return;

  const from = message?.from || {};
  const contact = message?.contact || {};
  const name = normalize([from.first_name, from.last_name].filter(Boolean).join(' '), 80) || 'Не указано';
  const username = normalize(from.username || '', 40);
  const phone = normalize(contact.phone_number || '', 40);
  const text = [
    `<b>${escapeHtml(event)}</b>`,
    '',
    `<b>Имя:</b> ${escapeHtml(name)}`,
    username ? `<b>Telegram:</b> @${escapeHtml(username)}` : '<b>Telegram:</b> username не указан',
    `<b>Telegram ID:</b> ${escapeHtml(String(from.id || visitorChatId))}`,
    phone ? `<b>Телефон:</b> ${escapeHtml(phone)}` : '<b>Телефон:</b> Telegram не передал',
    `<b>Время:</b> ${escapeHtml(telegramMessageTime(message))}`,
    '',
    `<b>Посетитель:</b>\n${escapeHtml(normalize(visitorText, 1500) || '[без текста]')}`,
    botReply ? `\n<b>VAV Assistant:</b>\n${escapeHtml(normalize(botReply, 1500))}` : '',
  ].filter(Boolean).join('\n').slice(0, 3900);

  await telegramCall(env, 'sendMessage', {
    chat_id: adminId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function telegramConnectionCurrent(env) {
  const chatId = await adminChatId(env);
  if (!chatId) return false;
  const currentCode = normalize(env.TELEGRAM_CONNECT_CODE || '', 256);
  if (!env.VAV_STATE || !currentCode) return Boolean(env.TELEGRAM_CHAT_ID);
  const generation = await env.VAV_STATE.get('admin_connection_generation');
  return Boolean(generation && normalize(generation, 256) === currentCode);
}

async function telegramDiagnostics(env) {
  const configuredToken = typeof env.TELEGRAM_BOT_TOKEN === 'string' ? env.TELEGRAM_BOT_TOKEN : '';
  const result = {
    token_configured: Boolean(configuredToken),
    token_format_ok: /^\d{6,14}:[A-Za-z0-9_-]{30,}$/.test(configuredToken),
    token_trimmed_format_ok: /^\d{6,14}:[A-Za-z0-9_-]{30,}$/.test(configuredToken.trim()),
    bot_api_ok: false,
    bot_api_error: '',
    webhook_configured: false,
    webhook_pending_updates: 0,
    webhook_last_error: '',
  };
  try {
    const bot = await telegramCall(env, 'getMe', {});
    result.bot_api_ok = Boolean(bot?.id && bot?.username);
    const webhook = await telegramCall(env, 'getWebhookInfo', {});
    result.webhook_configured = Boolean(webhook?.url && String(webhook.url).endsWith('/telegram/webhook'));
    result.webhook_pending_updates = Number(webhook?.pending_update_count || 0);
    result.webhook_last_error = normalize(webhook?.last_error_message || '', 180);
  } catch (error) {
    result.bot_api_ok = false;
    result.bot_api_error = normalize(error instanceof Error ? error.message : 'Telegram API check failed', 160);
  }
  return result;
}

function transcriptText(transcript) {
  if (!Array.isArray(transcript)) return '';
  return transcript
    .slice(-8)
    .map((item) => `${item?.role === 'assistant' ? 'VAV' : 'Посетитель'}: ${normalize(item?.content || '', 450)}`)
    .filter((line) => !line.endsWith(': '))
    .join('\n');
}

async function sendLead(env, lead) {
  const chatId = await adminChatId(env);
  if (!chatId) throw new Error('Telegram administrator is not connected');
  const transcript = transcriptText(lead.transcript);
  const source = normalize(lead.page, 300).startsWith('Telegram')
    ? 'Telegram-бота VAVGroup_AIBOT'
    : 'vavgroup.pro';
  const text = [
    `<b>Новый запрос из ${source}</b>`,
    '',
    `<b>Имя:</b> ${escapeHtml(lead.name)}`,
    `<b>Контакт:</b> ${escapeHtml(lead.contact)}`,
    `<b>Страница:</b> ${escapeHtml(lead.page || 'vavgroup.pro')}`,
    `<b>Время:</b> ${escapeHtml(lead.createdAt || telegramMessageTime())}`,
    '',
    `<b>Задача:</b>\n${escapeHtml(lead.message)}`,
    transcript ? `\n<b>Последние сообщения:</b>\n${escapeHtml(transcript)}` : '',
  ].filter(Boolean).join('\n').slice(0, 3900);

  await telegramCall(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function handleChat(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedBrowserRequest(request, env)) return json({ ok: false, error: 'origin_not_allowed' }, 403, origin, env);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 18000) return json({ ok: false, error: 'request_too_large' }, 413, origin, env);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400, origin, env); }
  const message = normalize(body.message);
  const sessionId = normalize(body.session_id, 64);
  if (body.consent !== true) return json({ ok: false, error: 'consent_required' }, 400, origin, env);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json({ ok: false, error: 'invalid_session' }, 400, origin, env);
  if (!message || message.length < 2) return json({ ok: false, error: 'message_required' }, 400, origin, env);
  if (normalize(body.website, 20)) return json({ ok: true, reply: fallbackReply(message), mode: 'guided' }, 200, origin, env);
  if (!rateLimit(request, sessionId)) return json({ ok: false, error: 'rate_limited' }, 429, origin, env);

  const history = cleanHistory(body.history);
  if (wantsHumanHandoff(message)) {
    return json({
      ok: true,
      reply: siteBotHandoffReply(message),
      mode: 'guided',
      can_notify: Boolean(await adminChatId(env)),
    }, 200, origin, env);
  }
  const { reply, mode } = await assistantReply(env, message, history);

  return json({
    ok: true,
    reply,
    mode,
    can_notify: Boolean(await adminChatId(env)),
  }, 200, origin, env);
}

async function handleLead(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!isAllowedBrowserRequest(request, env)) return json({ ok: false, error: 'origin_not_allowed' }, 403, origin, env);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400, origin, env); }
  if (body.consent !== true) return json({ ok: false, error: 'consent_required' }, 400, origin, env);
  if (normalize(body.website, 20)) return json({ ok: true }, 200, origin, env);
  const sessionId = normalize(body.session_id, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) return json({ ok: false, error: 'invalid_session' }, 400, origin, env);
  if (!rateLimit(request, `lead_${sessionId}`)) return json({ ok: false, error: 'rate_limited' }, 429, origin, env);

  const lead = {
    name: normalize(body.name, 80),
    contact: normalize(body.contact, 120),
    message: normalize(body.message, 1500),
    page: normalize(body.page, 300),
    transcript: body.transcript,
  };
  if (lead.name.length < 2 || lead.contact.length < 3 || lead.message.length < 5) {
    return json({ ok: false, error: 'required_fields' }, 400, origin, env);
  }

  try {
    await sendLead(env, lead);
    return json({ ok: true }, 200, origin, env);
  } catch {
    return json({ ok: false, error: 'telegram_not_connected' }, 503, origin, env);
  }
}

async function handleTelegramWebhook(request, env) {
  const expected = normalize(env.TELEGRAM_WEBHOOK_SECRET || '', 256);
  const received = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!expected || received !== expected) return new Response('Forbidden', { status: 403 });

  let update;
  try { update = await request.json(); } catch { return new Response('OK'); }
  const message = update?.message;
  const chatId = message?.chat?.id ? String(message.chat.id) : '';
  const text = normalize(message?.text || '', 500);
  const contact = message?.contact;
  if (!chatId || (!text && !contact)) return new Response('OK');
  const romanian = telegramVisitorIsRomanian(message, text);

  try {
    if (/^\/start(?:@\w+)?(?:\s+|$)/i.test(text)) {
      const code = text.replace(/^\/start(?:@\w+)?\s*/i, '').trim();
      const expectedCode = normalize(env.TELEGRAM_CONNECT_CODE || '', 256);
      if (code && expectedCode && code === expectedCode) {
        if (!env.VAV_STATE) throw new Error('KV binding missing');
        await env.VAV_STATE.put('admin_chat_id', chatId);
        await env.VAV_STATE.put('admin_connected_at', new Date().toISOString());
        await env.VAV_STATE.put('admin_connection_generation', expectedCode);
        await telegramCall(env, 'sendMessage', {
          chat_id: chatId,
          text: 'VAV Assistant подключён. Новые запросы с vavgroup.pro будут приходить в этот чат. Команда /status проверяет состояние подключения.',
        });
      } else if (code) {
        await telegramCall(env, 'sendMessage', {
          chat_id: chatId,
          text: 'Код подключения не принят. Откройте персональную ссылку, созданную мастером VAV Assistant.',
        });
      } else {
        const reply = romanian
          ? 'Bun venit la VAV Group. Profilul public Telegram, ora și mesajele trimise botului sunt transmise lui Valentin pentru prelucrarea solicitării. Telefonul este transmis numai dacă apăsați voluntar butonul de contact; continuând dialogul confirmați că ați citit această informare.'
          : 'Добро пожаловать в VAV Group. Публичный Telegram-профиль, время и сообщения боту передаются Валентину для обработки обращения. Телефон передаётся только при добровольном нажатии кнопки контакта; продолжая диалог, вы подтверждаете, что прочитали это уведомление.';
        await telegramCall(env, 'sendMessage', {
          chat_id: chatId,
          text: reply,
          reply_markup: telegramContactKeyboard(romanian),
        });
        await mirrorTelegramExchange(env, message, '/start', reply, 'Новый посетитель нажал START');
      }
      return new Response('OK');
    }

    if (/^\/cancel(?:@\w+)?$/i.test(text)) {
      await clearTelegramLeadState(env, chatId);
      const reply = romanian ? 'Transmiterea contactului a fost anulată.' : 'Передача контакта отменена.';
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
        reply_markup: { remove_keyboard: true },
      });
      await mirrorTelegramExchange(env, message, text, reply);
      return new Response('OK');
    }

    if (contact) {
      const senderId = message?.from?.id ? String(message.from.id) : '';
      const contactUserId = contact?.user_id ? String(contact.user_id) : '';
      if (!senderId || senderId !== contactUserId) {
        const reply = romanian
          ? 'Din motive de confidențialitate, trimiteți doar propriul contact folosind butonul Telegram.'
          : 'Из соображений конфиденциальности передайте только свой контакт через кнопку Telegram.';
        await telegramCall(env, 'sendMessage', {
          chat_id: chatId,
          text: reply,
        });
        await mirrorTelegramExchange(env, message, '[попытка передать чужой контакт]', reply);
        return new Response('OK');
      }

      await saveTelegramLeadState(env, chatId, {
        stage: 'awaiting_task',
        name: normalize([contact.first_name, contact.last_name].filter(Boolean).join(' '), 80),
        phone: normalize(contact.phone_number, 40),
        username: normalize(message?.from?.username || '', 40),
        telegram_user_id: senderId,
      });
      const reply = romanian
        ? 'Mulțumesc. Descrieți acum problema de business într-un singur mesaj; contactul și mesajul vor fi trimise lui Valentin.'
        : 'Спасибо. Теперь опишите бизнес-задачу одним сообщением; контакт и сообщение будут переданы Валентину.';
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
        reply_markup: { remove_keyboard: true },
      });
      await mirrorTelegramExchange(env, message, '[добровольно передан контакт]', reply, 'Посетитель передал контакт');
      return new Response('OK');
    }

    if (/^\/status(?:@\w+)?$/i.test(text)) {
      const currentAdmin = await adminChatId(env);
      const reply = currentAdmin === chatId
        ? `VAV Assistant работает. AI-режим: ${aiMode(env)}.`
        : 'Этот чат не подключён как получатель заявок VAV Group.';
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
      });
      await mirrorTelegramExchange(env, message, text, reply);
      return new Response('OK');
    }

    if (text.startsWith('/')) {
      const reply = 'Доступные команды: /status, /cancel. Также можно написать вопрос обычным сообщением.';
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
      });
      await mirrorTelegramExchange(env, message, text, reply);
      return new Response('OK');
    }

    const pendingLead = await telegramLeadState(env, chatId);
    if (pendingLead?.stage === 'awaiting_task') {
      if (text.length < 5) {
        const reply = romanian
          ? 'Descrieți sarcina puțin mai clar, într-un singur mesaj.'
          : 'Опишите задачу немного подробнее одним сообщением.';
        await telegramCall(env, 'sendMessage', {
          chat_id: chatId,
          text: reply,
        });
        await mirrorTelegramExchange(env, message, text, reply);
        return new Response('OK');
      }

      const contactParts = [
        pendingLead.username ? `@${pendingLead.username}` : '',
        pendingLead.phone || '',
        `Telegram ID: ${pendingLead.telegram_user_id}`,
      ].filter(Boolean);
      await sendLead(env, {
        name: normalize(pendingLead.name || message?.from?.first_name || 'Посетитель Telegram', 80),
        contact: contactParts.join(', '),
        message: text,
        page: 'Telegram bot @VAVGroup_AIBOT',
        createdAt: telegramMessageTime(message),
      });
      await clearTelegramLeadState(env, chatId);
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: romanian
          ? 'Datele au fost trimise lui Valentin. Dacă doriți, îi puteți scrie și direct: https://t.me/sendmeyrlocation'
          : 'Данные переданы Валентину. При желании можно также написать ему напрямую: https://t.me/sendmeyrlocation',
        disable_web_page_preview: true,
      });
      return new Response('OK');
    }

    if (wantsHumanHandoff(text)) {
      const reply = `${humanHandoffReply(text)}\n\n${romanian
        ? 'Dacă preferați să fiți contactat, trimiteți voluntar contactul prin butonul de mai jos.'
        : 'Если вам удобнее, чтобы с вами связались, добровольно передайте контакт кнопкой ниже.'}`;
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
        disable_web_page_preview: true,
        reply_markup: telegramContactKeyboard(romanian),
      });
      await mirrorTelegramExchange(env, message, text, reply, 'Запрос связи с Валентином');
      return new Response('OK');
    }

    if (!rateLimit(request, `telegram_${chatId}`)) {
      const reply = 'Слишком много сообщений за короткое время. Попробуйте снова через несколько минут.';
      await telegramCall(env, 'sendMessage', {
        chat_id: chatId,
        text: reply,
      });
      await mirrorTelegramExchange(env, message, text, reply);
      return new Response('OK');
    }

    const { reply } = await assistantReply(env, text);
    await telegramCall(env, 'sendMessage', {
      chat_id: chatId,
      text: reply.slice(0, 3900),
      disable_web_page_preview: true,
    });
    await mirrorTelegramExchange(env, message, text, reply);
  } catch {
    // Telegram retries non-2xx webhook responses. Return 200 after handling to avoid duplicate commands.
  }
  return new Response('OK');
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    if (!isAllowedBrowserRequest(request, env)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    const health = {
      ok: true,
      service: 'vav-assistant',
      mode: aiMode(env),
      telegram_connected: Boolean(await adminChatId(env)),
      telegram_connection_current: await telegramConnectionCurrent(env),
    };
    if (url.searchParams.get('deep') === '1') health.telegram_api = await telegramDiagnostics(env);
    return json(health, 200, origin, env);
  }
  if (request.method === 'POST' && url.pathname === '/chat') return handleChat(request, env);
  if (request.method === 'POST' && url.pathname === '/lead') return handleLead(request, env);
  if (request.method === 'POST' && url.pathname === '/telegram/webhook') return handleTelegramWebhook(request, env);
  return json({ ok: false, error: 'not_found' }, 404, origin, env);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
