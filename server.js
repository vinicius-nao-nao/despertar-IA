require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// CONFIGURAÇÕES
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// CONEXÃO COM O MONGODB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error("❌ ERRO: Variável MONGO_URI não encontrada no arquivo .env!");
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => console.log("🔌 Conectado ao MongoDB Atlas com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar ao MongoDB:", err));

// ROTAS
app.use('/api/chat', chatRoutes);

const PORTA = process.env.PORT || 3000;
app.listen(PORTA, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORTA}`);
});