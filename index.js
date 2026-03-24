// 1. Carrega o sistema de segurança (lê o arquivo .env)
require('dotenv').config();

// 2. Importa a biblioteca do Google Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 3. Verifica se a chave foi carregada corretamente
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ ERRO: Chave da API não encontrada no arquivo .env!");
    process.exit(1);
}

// 4. Conecta com a IA usando a sua chave secreta
const genAI = new GoogleGenerativeAI(apiKey);

async function executarAgente() {
    try {
        console.log("⚽ Entrando em campo e conectando aos servidores...");

        // 5. Escolhe o modelo de IA (Usando gemini-1.5-flash que é a versão estável atual)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 6. ENGENHARIA DE PROMPT (Desafio: Narrador de Futebol explicando API)
        const prompt = "Explique o que é uma API usando a personalidade de um narrador de futebol brasileiro extremamente empolgado, em uma final de Copa do Mundo, no momento de um gol. Use bordões clássicos e muita emoção!";

        // 7. Envia a pergunta e espera a resposta
        const result = await model.generateContent(prompt);
        const resposta = result.response.text();

        console.log("\n🎤 [NARRAÇÃO DO AGENTE GEMINI]:");
        console.log("--------------------------------------------------");
        console.log(resposta);
        console.log("--------------------------------------------------");
        console.log("\n🏆 Fim de jogo! Missão Concluída com sucesso.");

    } catch (erro) {
        console.error("❌ FALTA RITMO! Ocorreu um erro:", erro.message);
    }
}

// Roda o sistema
executarAgente();