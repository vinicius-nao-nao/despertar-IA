const { GoogleGenerativeAI } = require("@google/generative-ai");
const Mensagem = require("../models/Mensagem");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.enviarMensagem = async (req, res) => {
    try {
        const { pergunta } = req.body;
        if (!pergunta) {
            return res.status(400).json({ sucesso: false, erro: "Pergunta vazia" });
        }

        console.log(`📩 Pergunta recebida: ${pergunta}`);

        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

        // Recupera o histórico de conversas do MongoDB ordenado por tempo
        const historicoBanco = await Mensagem.find().sort({ createdAt: 1 });
        
        // Formata o histórico do banco no formato que o SDK do Gemini espera
        const historyFormatted = historicoBanco.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        // Inicia um chat contendo o histórico recuperado
        const chat = model.startChat({
            history: historyFormatted
        });

        // Envia a nova pergunta ao modelo do Gemini
        const result = await chat.sendMessage(pergunta);
        const response = await result.response;
        const text = response.text();

        // Salva ambas as mensagens no MongoDB Atlas para manter o histórico
        await Mensagem.create({ role: 'user', text: pergunta });
        await Mensagem.create({ role: 'model', text: text });

        console.log("✅ Resposta salva e enviada ao usuário!");
        return res.json({ sucesso: true, resposta: text });

    } catch (erro) {
        console.error("❌ Erro no chatController:", erro);
        return res.status(500).json({ 
            sucesso: false, 
            erro: erro.message 
        });
    }
};

exports.limparHistorico = async (req, res) => {
    try {
        // Remove todos os registros do banco de dados
        await Mensagem.deleteMany({});
        console.log("🗑️ Histórico apagado do MongoDB Atlas.");
        return res.json({ sucesso: true, mensagem: "Histórico limpo com sucesso!" });
    } catch (erro) {
        console.error("❌ Erro ao limpar histórico:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message });
    }
};