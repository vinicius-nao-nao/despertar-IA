require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const chatRoutes = require('./routes/chatRoutes');
const rankingRoutes = require('./routes/rankingRoutes');
const documentRoutes = require('./routes/documentRoutes');

const app = express();

// CONFIGURAÇÕES
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

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORTA}`);
});