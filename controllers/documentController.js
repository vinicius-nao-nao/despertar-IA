global.DOMMatrix = class DOMMatrix {};
const { GoogleGenerativeAI } = require("@google/generative-ai");
// pdf-parse 2.x exporta a classe PDFParse (a função pdf(buffer) era da versão 1.x)
const { PDFParse } = require('pdf-parse');
const Mensagem = require("../models/Mensagem");
const { extrairUsoDeTokens, notificarAdmins } = require("./chatController");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Mesmo modelo do chat (o "gemini-1.5-flash" foi descontinuado pelo Google)
const MODELO_DOCUMENTO = "gemini-flash-lite-latest";

function ehTextoPuro(arquivo) {
    return arquivo.mimetype === 'text/plain' || /\.txt$/i.test(arquivo.originalname || '');
}

async function extrairTexto(arquivo) {
    if (ehTextoPuro(arquivo)) {
        return arquivo.buffer.toString('utf8');
    }
    const parser = new PDFParse({ data: arquivo.buffer });
    try {
        const resultado = await parser.getText();
        return resultado.text;
    } finally {
        await parser.destroy();
    }
}

exports.analisarDocumento = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ sucesso: false, erro: "Nenhum arquivo enviado" });
        }

        const { pergunta } = req.body;
        if (!pergunta) {
            return res.status(400).json({ sucesso: false, erro: "Pergunta não fornecida" });
        }

        // Extrai o texto do PDF (ou .txt) usando o buffer do Multer
        let textoExtraido;
        try {
            textoExtraido = await extrairTexto(req.file);
        } catch (erroLeitura) {
            console.error("❌ Erro ao ler o documento:", erroLeitura.message);
            return res.status(400).json({ sucesso: false, erro: "Não foi possível ler o arquivo. Envie um PDF ou .txt válido." });
        }
        if (!textoExtraido || !textoExtraido.trim()) {
            return res.status(400).json({ sucesso: false, erro: "O documento não contém texto legível." });
        }

        // Configuração do modelo para RAG
        const model = genAI.getGenerativeModel({ model: MODELO_DOCUMENTO });

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
        const resposta = result.response.text() || "Desculpe, não encontrei essa informação no documento.";

        // Registra o consumo real de tokens (mesma regra do chat)
        const uso = extrairUsoDeTokens(result);
        await Mensagem.create({ role: 'user', text: `📄 ${req.file.originalname}: ${pergunta}`, origem: 'documento' });
        const mensagemIA = await Mensagem.create({
            role: 'model',
            text: resposta,
            tokensGastos: uso ? uso.total : 0,
            tokensEntrada: uso ? uso.entrada : 0,
            tokensSaida: uso ? uso.saida : 0,
            modelo: MODELO_DOCUMENTO,
            origem: 'documento'
        });
        if (uso && uso.total > 0) {
            notificarAdmins(req, uso.total, mensagemIA);
        }

        return res.json({ sucesso: true, resposta: resposta });

    } catch (erro) {
        console.error("❌ Erro no documentController:", erro);
        return res.status(500).json({
            sucesso: false,
            erro: erro.message
        });
    }
};
