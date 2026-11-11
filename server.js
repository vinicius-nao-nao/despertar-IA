require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const chatRoutes = require('./routes/chatRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const documentRoutes = require('./routes/documentRoutes');
const authRoutes = require('./routes/authRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { verificarTokenEObterUsuario } = require('./middlewares/auth');
const { configurarSocket } = require('./realtime/socket');

const app = express();
const server = http.createServer(app);

// WebSockets (Socket.IO) no mesmo servidor HTTP; disponível nos controllers via req.app.get('io')
const io = configurarSocket(server);
app.set('io', io);

if (!process.env.JWT_SECRET) {
    console.warn("⚠️ JWT_SECRET não definido no .env: login, cadastro e rotas protegidas não funcionarão.");
}

// CONFIGURAÇÕES
// Atrás de proxy/hospedagem (Render, Railway, Heroku...), defina TRUST_PROXY=1 para que
// req.ip seja o IP real do cliente (usado pelo limitador de tentativas de login).
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rota de Health Check (Auditoria S5)
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? "conectado" : "desconectado";
        res.status(200).json({ 
            status: "ok", 
            bancoDeDados: dbStatus, 
            timestamp: new Date().toISOString() 
        });
    } catch (err) {
        res.status(500).json({ status: "erro", erro: err.message });
    }
});

// CONEXÃO COM O MONGODB
console.log("Iniciando conexão com MongoDB...");
const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
    console.error("❌ ERRO: Variável MONGO_URI não encontrada no arquivo .env!");
    process.exit(1);
}

mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000
})
    .then(() => console.log("🔌 Conectado ao MongoDB Atlas com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// ROTAS
app.use('/api/chat', chatRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/chat', documentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes); // GET /api/analytics/tokens

// DASHBOARD ADMINISTRATIVO (página protegida no servidor)
// O dashboard.html fica FORA da pasta public/, então o express.static não o expõe.
// Navegação de página não envia o header Authorization, por isso a página é liberada
// com o cookie HttpOnly definido no login. Os DADOS continuam protegidos pela API (Bearer + admin).
function lerCookie(req, nome) {
    const cookies = req.headers.cookie;
    if (!cookies) return null;
    for (const parte of cookies.split(';')) {
        const indice = parte.indexOf('=');
        if (indice > -1 && parte.slice(0, indice).trim() === nome) {
            try { return decodeURIComponent(parte.slice(indice + 1).trim()); } catch (e) { return null; }
        }
    }
    return null;
}

async function paginaDashboard(req, res, next) {
    try {
        res.set('Cache-Control', 'no-store');
        const usuario = await verificarTokenEObterUsuario(lerCookie(req, 'token'));
        if (!usuario) {
            return res.redirect('/login.html?proximo=/dashboard');
        }
        if (usuario.role === 'admin') {
            return res.sendFile(path.join(__dirname, 'dashboard.html'));
        } else {
            return res.status(403).send(
                '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>Acesso negado</title></head>' +
                '<body style="font-family:Segoe UI,sans-serif;background:#121212;color:#fff;display:grid;place-items:center;height:100vh;margin:0">' +
                '<div style="text-align:center"><h1 style="color:#e74c3c">403 — Acesso negado</h1>' +
                '<p>Esta área é exclusiva para administradores.</p><a style="color:#00ff88" href="/">Voltar ao chat</a></div></body></html>'
            );
        }
    } catch (err) {
        return next(err);
    }
}
app.get(['/dashboard', '/dashboard.html'], paginaDashboard);

// Configuração pública do front-end (sem segredos).
// Quando o site é servido pelo Vercel, o WebSocket precisa ir direto ao Render
// (o proxy do Vercel não mantém conexões WebSocket). No Render, RENDER_EXTERNAL_URL é automático.
app.get('/config.js', (req, res) => {
    const config = { socketUrl: process.env.SOCKET_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '' };
    res.type('application/javascript').set('Cache-Control', 'no-store')
        .send(`window.APP_CONFIG = ${JSON.stringify(config)};`);
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORTA}`);
});