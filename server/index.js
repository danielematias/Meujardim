require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const db = require("./db");
const { iniciarSessao, encerrarSessao, exigirLogin } = require("./auth");
const ia = require("./ai");
const { MESTRE_DOS_VERDINHOS, REDATOR_DE_POSTS } = require("./prompts");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "6mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

const LUZES = ["sol", "clara", "media", "escura"];
const LUZ_TXT = { sol: "sol direto", clara: "claro, sem sol direto", media: "meia-luz", escura: "escuro" };
const texto = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const assincrono = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Limite de uso da IA por pessoa, para proteger sua conta de custos inesperados
const limiteIA = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muita conversa de uma vez. Espera uns minutinhos e tenta de novo." },
});
const limiteLogin = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { erro: "Muitas tentativas. Tenta de novo daqui a pouco." } });

/* ---------------- Conta ---------------- */
app.post("/api/auth/cadastro", limiteLogin, assincrono(async (req, res) => {
  const nome = texto(req.body.nome, 80);
  const email = texto(req.body.email, 160).toLowerCase();
  const senha = typeof req.body.senha === "string" ? req.body.senha : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "Esse e-mail não parece válido." });
  if (senha.length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
  const existe = await db.query("SELECT 1 FROM usuarios WHERE email = $1", [email]);
  if (existe.rowCount) return res.status(409).json({ erro: "Já existe uma conta com esse e-mail. Tenta entrar." });
  const hash = await bcrypt.hash(senha, 10);
  const { rows } = await db.query("INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1,$2,$3) RETURNING id, nome, email, match", [nome || null, email, hash]);
  iniciarSessao(res, rows[0].id);
  res.status(201).json({ usuario: rows[0] });
}));

app.post("/api/auth/login", limiteLogin, assincrono(async (req, res) => {
  const email = texto(req.body.email, 160).toLowerCase();
  const senha = typeof req.body.senha === "string" ? req.body.senha : "";
  const { rows } = await db.query("SELECT * FROM usuarios WHERE email = $1", [email]);
  if (!rows[0] || !(await bcrypt.compare(senha, rows[0].senha_hash))) return res.status(401).json({ erro: "E-mail ou senha incorretos." });
  iniciarSessao(res, rows[0].id);
  const { id, nome, match } = rows[0];
  res.json({ usuario: { id, nome, email, match } });
}));

app.post("/api/auth/sair", (req, res) => { encerrarSessao(res); res.json({ ok: true }); });

app.get("/api/eu", exigirLogin, assincrono(async (req, res) => {
  const { rows } = await db.query("SELECT id, nome, email, match FROM usuarios WHERE id = $1", [req.uid]);
  if (!rows[0]) { encerrarSessao(res); return res.status(401).json({ erro: "Faça login para continuar." }); }
  res.json({ usuario: rows[0] });
}));

/* ---------------- Jardim ---------------- */
async function carregarPlantas(uid) {
  const plantas = (await db.query("SELECT id, especie, apelido, local, luz, criado_em FROM plantas WHERE usuario_id = $1 ORDER BY criado_em DESC", [uid])).rows;
  if (!plantas.length) return [];
  const eventos = (await db.query(
    "SELECT planta_id, tipo, obs, criado_em FROM eventos WHERE planta_id = ANY($1) ORDER BY criado_em DESC, id DESC",
    [plantas.map(p => p.id)])).rows;
  for (const p of plantas) p.eventos = eventos.filter(e => e.planta_id === p.id).slice(0, 60);
  return plantas;
}
async function plantaDoUsuario(uid, id) {
  const { rows } = await db.query("SELECT * FROM plantas WHERE id = $1 AND usuario_id = $2", [Number(id) || 0, uid]);
  return rows[0];
}

app.get("/api/plantas", exigirLogin, assincrono(async (req, res) => {
  res.json({ plantas: await carregarPlantas(req.uid) });
}));

app.post("/api/plantas", exigirLogin, assincrono(async (req, res) => {
  const especie = texto(req.body.especie, 80);
  if (!especie) return res.status(400).json({ erro: "Diz qual é a planta." });
  const luz = LUZES.includes(req.body.luz) ? req.body.luz : "clara";
  await db.query("INSERT INTO plantas (usuario_id, especie, apelido, local, luz) VALUES ($1,$2,$3,$4,$5)",
    [req.uid, especie, texto(req.body.apelido, 60) || null, texto(req.body.local, 80) || null, luz]);
  res.status(201).json({ plantas: await carregarPlantas(req.uid) });
}));

app.delete("/api/plantas/:id", exigirLogin, assincrono(async (req, res) => {
  await db.query("DELETE FROM plantas WHERE id = $1 AND usuario_id = $2", [Number(req.params.id) || 0, req.uid]);
  res.json({ plantas: await carregarPlantas(req.uid) });
}));

// Registra um ou mais eventos no diário: [{tipo, obs}]
app.post("/api/plantas/:id/eventos", exigirLogin, assincrono(async (req, res) => {
  const planta = await plantaDoUsuario(req.uid, req.params.id);
  if (!planta) return res.status(404).json({ erro: "Planta não encontrada." });
  const lista = Array.isArray(req.body.eventos) ? req.body.eventos.slice(0, 5) : [req.body];
  for (const ev of lista) {
    if (!["toque", "rega", "adubo", "nota"].includes(ev.tipo)) return res.status(400).json({ erro: "Tipo de registro inválido." });
  }
  for (const ev of lista) {
    await db.query("INSERT INTO eventos (planta_id, tipo, obs) VALUES ($1,$2,$3)", [planta.id, ev.tipo, texto(ev.obs, 200) || null]);
  }
  res.status(201).json({ plantas: await carregarPlantas(req.uid) });
}));

/* ---------------- Matchmaker ---------------- */
app.put("/api/match", exigirLogin, assincrono(async (req, res) => {
  const { luz, tempo, quem } = req.body || {};
  if (!LUZES.includes(luz) || !["pouco", "medio", "muito"].includes(tempo) || !["eu", "varios"].includes(quem))
    return res.status(400).json({ erro: "Responda as três perguntas." });
  await db.query("UPDATE usuarios SET match = $1 WHERE id = $2", [{ luz, tempo, quem }, req.uid]);
  res.json({ match: { luz, tempo, quem } });
}));

app.post("/api/match/conselho", exigirLogin, limiteIA, assincrono(async (req, res) => {
  const { rows } = await db.query("SELECT match FROM usuarios WHERE id = $1", [req.uid]);
  const m = rows[0]?.match;
  if (!m) return res.status(400).json({ erro: "Faça o Matchmaker primeiro." });
  const pedido = `Módulo Matchmaker. Resultado do Teste da Bula no local: ${LUZ_TXT[m.luz]}. Tempo disponível: ${{ pouco: "quase nenhum", medio: "uns minutinhos por dia", muito: "bastante, adora mexer" }[m.tempo]}. Quem cuida: ${m.quem === "eu" ? "só a pessoa" : "várias pessoas da casa"}.
Dê um conselho personalizado e animado para começar, em até 100 palavras, com 2 ou 3 sugestões de plantas e uma primeira tarefa prática para hoje.`;
  const resposta = await ia.perguntar({ sistema: MESTRE_DOS_VERDINHOS, mensagens: [{ role: "user", content: pedido }], maxTokens: 600 });
  res.json({ texto: resposta });
}));

/* ---------------- Pronto-Socorro Verde (chat) ---------------- */
app.post("/api/chat", exigirLogin, limiteIA, assincrono(async (req, res) => {
  let mensagens = Array.isArray(req.body.mensagens) ? req.body.mensagens : [];
  mensagens = mensagens
    .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (mensagens.length && mensagens[0].role !== "user") mensagens.shift();
  if (!mensagens.length || mensagens[mensagens.length - 1].role !== "user") return res.status(400).json({ erro: "Escreva sua pergunta." });

  let imagem;
  const img = req.body.imagem;
  if (img && typeof img.base64 === "string") {
    if (!["image/jpeg", "image/png", "image/webp"].includes(img.mediaType)) return res.status(400).json({ erro: "Use uma foto JPG, PNG ou WebP." });
    imagem = { mediaType: img.mediaType, base64: img.base64 };
  }

  const plantas = await carregarPlantas(req.uid);
  const contexto = plantas.length
    ? "\n\nContexto: plantas cadastradas no jardim do usuário: " + plantas.map(p => `${p.especie}${p.apelido ? ` (${p.apelido})` : ""}, em ${p.local || "local não informado"}, luz: ${LUZ_TXT[p.luz]}`).join("; ") + "."
    : "";

  const resposta = await ia.perguntar({ sistema: MESTRE_DOS_VERDINHOS + contexto, mensagens, imagem, maxTokens: 800 });
  if (!resposta) return res.status(502).json({ erro: "O Mestre ficou sem palavras. Tenta perguntar de outro jeito." });
  await db.query("INSERT INTO conversas (usuario_id, pergunta, resposta, teve_foto) VALUES ($1,$2,$3,$4)",
    [req.uid, mensagens[mensagens.length - 1].content, resposta, !!imagem]);
  res.json({ texto: resposta });
}));

/* ---------------- Feed ---------------- */
app.get("/api/posts", exigirLogin, assincrono(async (req, res) => {
  const { rows } = await db.query("SELECT id, titulo, corpo, tags, criado_em FROM posts WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 30", [req.uid]);
  res.json({ posts: rows });
}));

app.post("/api/posts/gerar", exigirLogin, limiteIA, assincrono(async (req, res) => {
  const tema = texto(req.body.tema, 100) || "uma dica essencial para iniciantes";
  const resposta = await ia.perguntar({ sistema: REDATOR_DE_POSTS, mensagens: [{ role: "user", content: `TEMA: ${tema}` }], maxTokens: 700 });
  const post = ia.extrairJSON(resposta);
  if (!post?.titulo || !post?.corpo) return res.status(502).json({ erro: "A pílula veio embolada. Toca em Gerar de novo." });
  const { rows } = await db.query(
    "INSERT INTO posts (usuario_id, tema, titulo, corpo, tags) VALUES ($1,$2,$3,$4,$5) RETURNING id, titulo, corpo, tags, criado_em",
    [req.uid, tema, String(post.titulo).slice(0, 200), String(post.corpo).slice(0, 2000), String(post.tags || "").slice(0, 300)]);
  res.status(201).json({ post: rows[0] });
}));

/* ---------------- Erros ---------------- */
app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.use((err, req, res, next) => {
  if (err instanceof ia.ErroIA) return res.status(502).json({ erro: err.message });
  if (err.type === "entity.too.large") return res.status(413).json({ erro: "Essa foto é grande demais." });
  console.error(err);
  res.status(500).json({ erro: "Algo deu errado no servidor. Tenta de novo." });
});

const PORT = process.env.PORT || 3000;
db.migrate()
  .then(() => app.listen(PORT, () => console.log(`🌿 Jardinagem Descomplicada rodando na porta ${PORT} (IA: ${ia.PROVEDOR} / ${ia.MODELO})`)))
  .catch(err => { console.error("Não consegui conectar ao banco de dados:", err.message); process.exit(1); });
