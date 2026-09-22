const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  console.error("Defina JWT_SECRET com pelo menos 16 caracteres. Veja o .env.example.");
  process.exit(1);
}
const COOKIE = "jd_sessao";

function iniciarSessao(res, usuarioId) {
  const token = jwt.sign({ uid: usuarioId }, SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function encerrarSessao(res) {
  res.clearCookie(COOKIE);
}

function exigirLogin(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies[COOKIE] || "", SECRET);
    req.uid = uid;
    next();
  } catch {
    res.status(401).json({ erro: "Faça login para continuar." });
  }
}

module.exports = { iniciarSessao, encerrarSessao, exigirLogin };
