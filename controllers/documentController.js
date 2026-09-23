global.DOMMatrix = class DOMMatrix {}; 
const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.analisarDocumento = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ sucesso: false, erro: "Nenhum arquivo enviado" });
        }

        const { pergunta } = req.body;
        if (!pergunta) {
            return res.status(400).json({ sucesso: false, erro: "Pergunta não fornecida" });
        }

        // Extrai o texto do PDF usando o buffer do Multer
        const pdfData = await pdf(req.file.buffer);
        const textoExtraido = pdfData.text;

        // Configuração do modelo para RAG
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const promptRAG = `
        Você é um analista corporativo extremamente preciso.
        Responda à pergunta do usuário baseando-se APENAS no documento abaixo.
        Se a resposta não estiver no documento, diga exatamente: "Desculpe, não encontrei essa informação no documento."
        NÃO utilize conhecimentos externos e NÃO invente informações.

        DOCUMENTO:
        """
        ${textoExtraido}
        """

        PERGUNTA DO USUÁRIO: ${pergunta}
        `;

        const result = await model.generateContent(promptRAG);
        const resposta = result.response.text();

        return res.json({ sucesso: true, resposta: resposta });

    } catch (erro) {
        console.error("❌ Erro no documentController:", erro);
        return res.status(500).json({ 
            sucesso: false, 
            erro: erro.message 
        });
    }
};