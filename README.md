# Chat Agente IA - Gemini + MongoDB (Arquitetura MVC)

Este repositório contém a refatoração e as melhorias aplicadas na Sprint 0 do projeto de integração com a API do Google Gemini, utilizando arquitetura modularizada (MVC).

## 🚀 Tecnologias Utilizadas
- Node.js & Express
- Mongoose & MongoDB Atlas (Persistência de Histórico de Conversas)
- Google Generative AI SDK
- Marked.js (Renderização de Markdown)

## 📁 Estrutura do Projeto
- `models/`: Definição de schemas do MongoDB.
- `controllers/`: Lógica centralizada do chat e controle de requisições.
- `routes/`: Endpoints de comunicação do Express.
- `public/`: Interface web contendo index.html.

## ⚙️ Como executar localmente
1. Instale as dependências: `npm install`
2. Crie um arquivo `.env` baseado no modelo de `.env.example` e preencha com as credenciais.
3. Inicie o servidor: `npm start` (ou `node server.js`)
4. Rode os testes: `npm test` (não precisam de MongoDB nem de chave do Gemini)
## 📊 Sprint — Dashboard Administrativo, RBAC e Analytics de IA

### Variáveis de ambiente (`.env`)
Veja `.env.example`. Obrigatórias: `MONGO_URI`, `GEMINI_API_KEY`, `JWT_SECRET`.
Opcionais: `JWT_EXPIRES_IN` (padrão `1d`) e `ANALYTICS_TIMEZONE` (padrão `America/Sao_Paulo`).

### Novas rotas
| Método | Rota | Proteção |
|---|---|---|
| POST | `/api/auth/registrar` | pública (sempre cria `role: "user"`; 5 por IP a cada 15 min) |
| POST | `/api/auth/login` | pública (10 tentativas por IP a cada 15 min) |
| POST | `/api/auth/logout` | pública |
| GET | `/api/auth/me` | JWT |
| GET | `/api/analytics/tokens` | JWT + `apenasAdmin` |
| GET | `/dashboard` | cookie de sessão + role `admin` (verificado no servidor) |
| DELETE | `/api/chat/limpar` | JWT + `apenasAdmin` (apaga todo o histórico) |

### Tornar um usuário administrador (MongoDB Atlas)
1. Cadastre-se em `/login.html` → aba **Criar conta**.
2. No Atlas: **Browse Collections** → banco do projeto → coleção `usuarios`.
3. Filtre **apenas o seu documento**: `{ "email": "seu-email@exemplo.com" }`.
4. Edite o campo `role` de `"user"` para `"admin"` e clique em **Update**.

Ou, no `mongosh`:
```js
db.usuarios.updateOne({ email: "seu-email@exemplo.com" }, { $set: { role: "admin" } })
```
Confira que o resultado mostra `matchedCount: 1`. A role é lida do banco a cada requisição,
então a mudança vale imediatamente (e a revogação também).

### Tempo real
O dashboard se conecta ao Socket.IO do próprio servidor com o JWT. Apenas administradores
entram na sala `admins`, que recebe o evento `novoGastoDeToken` após cada resposta do Gemini.

### Correções incluídas nesta sprint
- **Function calling do XP**: as `tools` estavam no 2º argumento de `getGenerativeModel` (opções da requisição)
  e nunca chegavam ao Gemini. Agora o XP funciona, e o servidor só aceita `+50` ou `-10` para o
  nickname da própria requisição (a IA não pode ser induzida a dar XP arbitrário).
- **Análise de documentos**: o `pdf-parse` 2.x não exporta mais uma função (`pdf(buffer)` lançava
  `pdf is not a function`). Migrado para `PDFParse`, com suporte a `.txt`, limite de 10 MB e modelo
  atualizado. O consumo de tokens dos documentos também aparece no dashboard (`origem: "documento"`).
- **XSS**: a resposta da IA é sanitizada com DOMPurify, e o texto do usuário e os apelidos do ranking
  são escapados.
- **Credenciais**: o arquivo `salvar` (com usuário/senha do MongoDB) foi removido. Ele continua no
  histórico do Git, então **troque a senha do usuário do banco no Atlas**.

### Deploy: Render (backend) + Vercel (front-end)

```
Navegador ──► Vercel (public/: index.html, login.html)
                 │  rewrites /api, /dashboard, /config.js, /socket.io
                 ▼
              Render (server.js: API, dashboard protegido, Socket.IO) ──► MongoDB Atlas / Gemini
Navegador ══ WebSocket direto ══► Render   (o Vercel não mantém WebSockets)
```

O Vercel publica só os arquivos estáticos (`.vercelignore` deixa o backend e o `dashboard.html` de fora).
Como `/api` e `/dashboard` passam pelo proxy do Vercel, o navegador vê tudo no mesmo domínio:
o cookie de login e as chamadas `fetch('/api/...')` funcionam sem mudanças.

**1. MongoDB Atlas**: em *Network Access*, libere `0.0.0.0/0` (o Render não tem IP fixo no plano free).

**2. Render** (primeiro, para ter a URL):
1. *New + → Blueprint* → selecione este repositório (usa o `render.yaml`).
2. Preencha `MONGO_URI` e `GEMINI_API_KEY`. O `JWT_SECRET` é gerado automaticamente.
3. Após o deploy, anote a URL (ex.: `https://bot-vinivius.onrender.com`) e teste `/api/health`.

**3. Vercel**:
1. Se a URL do Render for diferente de `https://bot-vinivius.onrender.com`, troque-a nas 5 linhas do `vercel.json`.
2. *Add New → Project* → importe o repositório. Framework Preset: **Other**. Não precisa de variáveis.
3. Após o deploy, anote o domínio (ex.: `https://bot-vinivius.vercel.app`).

**4. Volte ao Render** e defina `CORS_ORIGINS` com o domínio do Vercel (sem barra no final).

`TRUST_PROXY=2` (já no `render.yaml`) faz o limitador de login enxergar o IP real atrás de Vercel + Render.
Se usar só o Render, troque para `1`.

> No plano free o Render "dorme" após ~15 min sem uso: a primeira requisição pode levar até ~1 minuto.
