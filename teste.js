require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testar() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Vamos listar os modelos que a sua chave PODE ver
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Oi");
        console.log("SUCESSO! Resposta da IA:", result.response.text());
    } catch (e) {
        console.log("ERRO REAL:", e.message);
    }
}
testar();