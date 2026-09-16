require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const chatRoutes = require('./routes/chatRoutes');
const rankingRoutes = require('./routes/rankingRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rota de Health Check
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

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("🔌 Conectado ao MongoDB Atlas com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

app.use('/api/chat', chatRoutes);
app.use('/api/ranking', rankingRoutes);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORTA}`);
});