/**
 * عميل متوافق مع واجهة OpenAI Chat Completions.
 * يعمل مع: Ollama، LM Studio، llama.cpp، vLLM، OpenRouter، Groq، وأي خادم يتبع نفس الواجهة.
 * التطبيق نفسه لا يفرض أي قيود على المحتوى — ما تحصل عليه يحدّده النموذج الذي تتصل به.
 */

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const trimUrl = (u) => (u || '').trim().replace(/\/+$/, '');

/** يبني رابط نقطة النهاية بمرونة: يقبل .../v1 أو الرابط الكامل */
export function endpoint(baseUrl, path = '/chat/completions') {
  const b = trimUrl(baseUrl);
  if (!b) throw new ApiError('لم تُحدَّد نقطة النهاية (Base URL) في الإعدادات.');
  if (b.endsWith('/chat/completions')) return b;
  return b + path;
}

function headers(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim()) h.Authorization = 'Bearer ' + apiKey.trim();
  return h;
}

/** يشرح أخطاء الشبكة الشائعة بالعربية بدل رسالة "Failed to fetch" الغامضة */
function explainNetworkError(err, baseUrl) {
  const isHttp = /^http:\/\//i.test(baseUrl || '');
  const isLocal = /(localhost|127\.0\.0\.1)/i.test(baseUrl || '');
  let msg = 'تعذّر الاتصال بالخادم.';
  const tips = [];
  if (isLocal) tips.push('كتبت "localhost" — على الموبايل هذا يعني الموبايل نفسه. استخدم آيبي الكمبيوتر في الشبكة (مثل 192.168.1.x).');
  if (isHttp) tips.push('تأكد أن الجهازين على نفس شبكة الواي فاي.');
  tips.push('تأكد أن الخادم يستمع على كل الواجهات لا على 127.0.0.1 فقط (في Ollama: OLLAMA_HOST=0.0.0.0).');
  tips.push('تأكد أن جدار الحماية على الكمبيوتر يسمح بالمنفذ.');
  return new ApiError(msg + '\n\n' + tips.map((t) => '• ' + t).join('\n'), { body: String(err?.message || err) });
}

/**
 * إرسال محادثة والحصول على الرد.
 * @param {object} o
 * @param {Array} o.messages رسائل بصيغة {role, content}
 * @param {object} o.settings الإعدادات
 * @param {(delta:string, full:string)=>void} o.onToken يُستدعى مع كل جزء عند البثّ
 * @param {AbortSignal} o.signal
 * @returns {Promise<string>} النص الكامل
 */
export async function chat({ messages, settings, onToken, signal }) {
  const url = endpoint(settings.baseUrl);
  const body = {
    model: settings.model,
    messages,
    temperature: Number(settings.temperature),
    top_p: Number(settings.topP),
    max_tokens: Number(settings.maxTokens) || undefined,
    stream: !!settings.stream,
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: headers(settings.apiKey),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw explainNetworkError(err, settings.baseUrl);
  }

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch {}
    let hint = '';
    if (res.status === 401 || res.status === 403) hint = '\nمفتاح API غير صحيح أو مفقود.';
    if (res.status === 404) hint = '\nنقطة النهاية أو اسم النموذج غير موجود. تحقّق من الـ Base URL واسم النموذج.';
    if (res.status === 429) hint = '\nتجاوزت حدّ الطلبات — انتظر قليلاً أو بدّل الخدمة.';
    throw new ApiError(`الخادم رفض الطلب (${res.status}).${hint}`, { status: res.status, body: detail.slice(0, 600) });
  }

  if (!body.stream) {
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    onToken?.(text, text);
    return text;
  }

  // بثّ SSE
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { buffer = ''; break; }
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content
                   ?? json?.choices?.[0]?.message?.content
                   ?? '';
        if (delta) { full += delta; onToken?.(delta, full); }
      } catch { /* أجزاء غير مكتملة تُتجاهل */ }
    }
  }
  return full;
}

/** جلب قائمة النماذج المتاحة من الخادم (إن كان يدعم /models) */
export async function listModels(settings) {
  const url = endpoint(settings.baseUrl, '/models');
  const res = await fetch(url, { headers: headers(settings.apiKey) });
  if (!res.ok) throw new ApiError(`تعذّر جلب النماذج (${res.status}).`, { status: res.status });
  const data = await res.json();
  const arr = data?.data || data?.models || [];
  return arr.map((m) => m.id || m.name).filter(Boolean).sort();
}
