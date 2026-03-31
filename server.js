// 1. Importações
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 2. Inicialização do Express (DEVE VIR ANTES DOS .USE)
const app = express();

// --- CONFIGURAÇÕES ESSENCIAIS ---
app.use(express.json()); 
app.use(cors());         
app.use(express.static('public')); // Serve o index.html da pasta public

// 3. Configuração da IA
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

// --- ROTA DE STATUS (GET) ---
app.get('/api/status', (req, res) => {
    return res.json({ status: "Servidor Online" });
});

// --- ROTA PRINCIPAL (POST) ---
app.post('/api/chat', async (req, res) => {
    try {
        const { pergunta } = req.body;

        if (!pergunta) {
            return res.status(400).json({ erro: "Envie uma pergunta!" });
        }

        console.log(`📩 Pergunta: "${pergunta}"`);

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Persona: Robô Sarcástico
        const promptFinal = `Você é um robô sarcástico e altamente inteligente. Responda de forma curta e ácida: ${pergunta}`;
        
        const result = await model.generateContent(promptFinal);
        const respostaDaIA = result.response.text();

        return res.status(200).json({ 
            sucesso: true,
            resposta: respostaDaIA 
        });

    } catch (erro) {
        console.error("❌ Erro:", erro);
        return res.status(500).json({ erro: "Erro na IA." });
    }
});

// 4. Ligar o motor
const PORTA = 3000;
app.listen(PORTA, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORTA}`);
});