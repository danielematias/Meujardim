# 🌿 Jardinagem Descomplicada

Aplicativo web para curar de vez a síndrome do "dedo podre". Inspirado nos ensinamentos de Carol Costa no livro *Minhas Plantas: jardinagem para todos (até quem mata cactos)* (Editora Paralela).

## ✨ Funcionalidades

- **🌱 Academia do Dedo Verde (feed):** pílulas de conhecimento, com geração de novas pílulas por IA.
- **🪴 Meu jardim:** diário de cuidados guiado pelo **Dedômetro** (nada de calendário fixo de rega) e pela adubação **Brigadeiro de Bom-Dia**.
- **🚑 Pronto-Socorro Verde:** guia rápido de sintomas, receita do Detox de Pragas e chat com o **Mestre dos Verdinhos** (aceita foto da planta).
- **💘 Matchmaker:** Teste da Bula de Remédio + tempo disponível + Jardineiro Oficial, com recomendação de plantas.
- **🔐 Contas de usuário:** cada pessoa vê só o próprio jardim.

## 🧱 Tecnologias

| Parte | Tecnologia |
| --- | --- |
| Front-end | HTML, CSS e JavaScript (pasta `public/`) |
| Back-end | Node.js + Express (pasta `server/`) |
| Banco de dados | PostgreSQL (Supabase, Neon ou Render) |
| IA | Anthropic (Claude), OpenAI (GPT) ou Google Gemini — você escolhe no `.env` |

## 🗄️ Tabelas do banco

Criadas automaticamente na primeira vez que o servidor liga (`server/schema.sql`):

- `usuarios` — conta e resultado do Matchmaker
- `plantas` — as plantas de cada pessoa
- `eventos` — diário: toques do dedômetro, regas, adubos e notas
- `posts` — pílulas geradas pela IA
- `conversas` — histórico do Pronto-Socorro Verde

## 🚀 Colocando no ar (sem instalar nada no computador)

1. **GitHub:** crie um repositório (pode ser privado) e envie estes arquivos. Pelo site: *Add file → Upload files* e arraste o conteúdo da pasta.
2. **Banco (Supabase):** crie um projeto em supabase.com, clique em **Connect** e copie a *connection string* do tipo **Session pooler**. Troque `[YOUR-PASSWORD]` pela senha do banco.
3. **Chave da IA:** gere uma chave no painel do provedor escolhido (console.anthropic.com, platform.openai.com ou aistudio.google.com).
4. **Render:** em render.com, *New → Blueprint*, conecte o repositório. O arquivo `render.yaml` já configura tudo. Preencha:
   - `DATABASE_URL` = a connection string do Supabase
   - `AI_API_KEY` = sua chave da IA
   - `AI_PROVIDER` = `anthropic`, `openai` ou `gemini`
5. Pronto. O Render te dá um link `https://....onrender.com` para abrir no celular.

> No plano gratuito do Render, o app "dorme" depois de 15 minutos sem uso e demora uns 30 segundos para acordar no primeiro acesso.

## 💻 Rodando no computador (opcional)

```bash
git clone https://github.com/SEU-USUARIO/jardinagem-descomplicada.git
cd jardinagem-descomplicada
npm install
cp .env.example .env   # e preencha as variáveis
npm start              # abre em http://localhost:3000
```

## 🧠 A IA: "Mestre dos Verdinhos"

Os prompts ficam em `server/prompts.js`. A troca de provedor é feita só pela variável `AI_PROVIDER`; o código de cada provedor está em `server/ai.js`. Para proteger a conta de custos inesperados, cada pessoa pode fazer até 20 pedidos à IA a cada 10 minutos (ajustável em `server/index.js`).

## 🔒 Segurança

- Nunca suba o arquivo `.env` (ele já está no `.gitignore`).
- Senhas são guardadas com hash (bcrypt); o login usa cookie seguro `httpOnly`.
- A chave da IA fica só no servidor, nunca no navegador.

## 📚 Créditos

Conteúdo e princípios inspirados no livro *Minhas Plantas: jardinagem para todos (até quem mata cactos)*, de Carol Costa (Editora Paralela).
