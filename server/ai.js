// Camada de IA: troque de provedor só mudando AI_PROVIDER no .env
// Provedores: anthropic (Claude), openai (GPT), gemini (Google)

const PROVEDOR = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
const CHAVE = process.env.AI_API_KEY;
const MODELOS_PADRAO = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};
const MODELO = process.env.AI_MODEL || MODELOS_PADRAO[PROVEDOR];

if (!MODELOS_PADRAO[PROVEDOR]) {
  console.error(`AI_PROVIDER inválido: "${PROVEDOR}". Use anthropic, openai ou gemini.`);
  process.exit(1);
}
if (!CHAVE) console.warn("Aviso: AI_API_KEY vazia. As funções de IA vão responder com erro até você configurar a chave.");

class ErroIA extends Error {}

/**
 * @param {object} p
 * @param {string} p.sistema     instruções (system prompt)
 * @param {{role:"user"|"assistant", content:string}[]} p.mensagens  conversa, terminando no usuário
 * @param {{mediaType:string, base64:string}} [p.imagem]  foto anexada à última mensagem
 * @param {number} [p.maxTokens]
 * @returns {Promise<string>}
 */
async function perguntar({ sistema, mensagens, imagem, maxTokens = 800 }) {
  if (!CHAVE) throw new ErroIA("A IA ainda não foi configurada (falta AI_API_KEY).");
  if (PROVEDOR === "anthropic") return anthropic(sistema, mensagens, imagem, maxTokens);
  if (PROVEDOR === "openai") return openai(sistema, mensagens, imagem, maxTokens);
  return gemini(sistema, mensagens, imagem, maxTokens);
}

async function chamar(url, headers, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(`[IA ${PROVEDOR}] HTTP ${r.status}:`, JSON.stringify(data).slice(0, 500));
    throw new ErroIA(r.status === 429 ? "A IA está sobrecarregada agora. Tenta de novo em instantes." : "A IA não conseguiu responder agora.");
  }
  return data;
}

async function anthropic(sistema, mensagens, imagem, maxTokens) {
  const msgs = mensagens.map((m, i) => {
    if (imagem && i === mensagens.length - 1) {
      return { role: "user", content: [
        { type: "image", source: { type: "base64", media_type: imagem.mediaType, data: imagem.base64 } },
        { type: "text", text: m.content },
      ] };
    }
    return { role: m.role, content: m.content };
  });
  const data = await chamar("https://api.anthropic.com/v1/messages",
    { "x-api-key": CHAVE, "anthropic-version": "2023-06-01" },
    { model: MODELO, max_tokens: maxTokens, system: sistema, messages: msgs });
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
}

async function openai(sistema, mensagens, imagem, maxTokens) {
  const msgs = [{ role: "system", content: sistema }, ...mensagens.map((m, i) => {
    if (imagem && i === mensagens.length - 1) {
      return { role: "user", content: [
        { type: "text", text: m.content },
        { type: "image_url", image_url: { url: `data:${imagem.mediaType};base64,${imagem.base64}` } },
      ] };
    }
    return { role: m.role, content: m.content };
  })];
  const data = await chamar("https://api.openai.com/v1/chat/completions",
    { Authorization: `Bearer ${CHAVE}` },
    { model: MODELO, max_completion_tokens: maxTokens, messages: msgs });
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function gemini(sistema, mensagens, imagem, maxTokens) {
  const contents = mensagens.map((m, i) => {
    const parts = [{ text: m.content }];
    if (imagem && i === mensagens.length - 1) parts.push({ inline_data: { mime_type: imagem.mediaType, data: imagem.base64 } });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const data = await chamar(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    { "x-goog-api-key": CHAVE },
    { system_instruction: { parts: [{ text: sistema }] }, contents, generationConfig: { maxOutputTokens: maxTokens } });
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
}

/** Extrai o primeiro objeto JSON de uma resposta de texto. */
function extrairJSON(texto) {
  const ini = texto.indexOf("{"), fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fim + 1)); } catch { return null; }
}

module.exports = { perguntar, extrairJSON, ErroIA, PROVEDOR, MODELO };
