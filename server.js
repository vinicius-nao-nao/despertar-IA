require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

// CONFIGURAÇÕES
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicialização da IA (Lendo a chave limpa do .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) return res.status(400).json({ sucesso: false, erro: "Pergunta vazia" });

        console.log(`📩 Pergunta recebida: ${pergunta}`);

        // MODELO CORRETO E ESTÁVEL
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        
        const result = await model.generateContent(pergunta);
        const response = await result.response;
        const text = response.text();

        console.log("✅ IA respondeu com sucesso!");
        return res.json({ sucesso: true, resposta: text });

    } catch (erro) {
        console.error("❌ ERRO DETALHADO:");
        console.error(erro); // Isso vai mostrar tudo no terminal se falhar de novo
        
        return res.status(500).json({ 
            sucesso: false, 
            erro: erro.message 
        });
    }
});

const PORTA = 3000;
app.listen(PORTA, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORTA}`);
});