const { GoogleGenerativeAI } = require("@google/generative-ai");
const Mensagem = require("../models/Mensagem");
const Jogador = require("../models/Jogador");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Ferramenta de XP para a IA
const functions = {
    adicionarXP: async ({ nickname, quantidade }) => {
        console.log(`🎮 XP para ${nickname}: ${quantidade}`);
        const jogador = await Jogador.findOneAndUpdate(
            { nome: nickname },
            { $inc: { xp: quantidade } },
            { upsert: true, new: true }
        );
        return { sucesso: true, novoXP: jogador.xp };
    }
};

exports.enviarMensagem = async (req, res) => {
    try {
        const { pergunta, nickname } = req.body;
        if (!pergunta || !nickname) return res.status(400).json({ sucesso: false, erro: "Dados incompletos" });

        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-lite-latest",
            systemInstruction: `Você é o Mestre do Jogo. Proponha charadas de tecnologia para ${nickname}. 
            Se ele acertar, use 'adicionarXP' com 50. Se errar, use 'adicionarXP' com -10. 
            Seja épico e curto nas respostas.`
        }, {
            tools: [{
                functionDeclarations: [{
                    name: "adicionarXP",
                    description: "Adiciona XP ao jogador",
                    parameters: {
                        type: "OBJECT",
                        properties: {
                            nickname: { type: "string" },
                            quantidade: { type: "number" }
                        },
                        required: ["nickname", "quantidade"]
                    }
                }]
            }]
        });

        const chat = model.startChat();
        const result = await chat.sendMessage(pergunta);
        const response = result.response;
        const call = response.functionCalls()?.[0];
        
        let textoFinal = response.text();

        if (call) {
            const apiResponse = await functions[call.name](call.args);
            const result2 = await chat.sendMessage([{
                functionResponse: { name: "adicionarXP", response: apiResponse }
            }]);
            textoFinal = result2.response.text();
        }

        await Mensagem.create({ role: 'user', text: pergunta });
        await Mensagem.create({ role: 'model', text: textoFinal });

        res.json({ sucesso: true, resposta: textoFinal });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ sucesso: false, erro: erro.message });
    }
};

// ESSA FUNÇÃO NÃO PODE FALTAR:
exports.limparHistorico = async (req, res) => {
    try {
        await Mensagem.deleteMany({});
        res.json({ sucesso: true, mensagem: "Histórico limpo!" });
    } catch (erro) {
        res.status(500).json({ sucesso: false, erro: erro.message });
    }
};