-- Estrutura do banco. Roda sozinha toda vez que o servidor inicia (não apaga nada).

CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nome        TEXT,
  email       TEXT UNIQUE NOT NULL,
  senha_hash  TEXT NOT NULL,
  match       JSONB,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plantas (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  especie     TEXT NOT NULL,
  apelido     TEXT,
  local       TEXT,
  luz         TEXT NOT NULL DEFAULT 'clara',
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plantas_usuario_idx ON plantas(usuario_id);

-- Diário de cuidados: toque (dedômetro), rega, adubo, nota
CREATE TABLE IF NOT EXISTS eventos (
  id          SERIAL PRIMARY KEY,
  planta_id   INT NOT NULL REFERENCES plantas(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('toque','rega','adubo','nota')),
  obs         TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_planta_idx ON eventos(planta_id, criado_em DESC);

-- Pílulas do feed geradas pela IA
CREATE TABLE IF NOT EXISTS posts (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT REFERENCES usuarios(id) ON DELETE CASCADE,
  tema        TEXT,
  titulo      TEXT NOT NULL,
  corpo       TEXT NOT NULL,
  tags        TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Histórico do Pronto-Socorro Verde
CREATE TABLE IF NOT EXISTS conversas (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pergunta    TEXT NOT NULL,
  resposta    TEXT NOT NULL,
  teve_foto   BOOLEAN NOT NULL DEFAULT false,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversas_usuario_idx ON conversas(usuario_id, criado_em DESC);
