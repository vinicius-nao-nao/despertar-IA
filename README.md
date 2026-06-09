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
3. Inicie o servidor: `node server.js`