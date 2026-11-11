const mongoose = require('mongoose');

const MensagemSchema = new mongoose.Schema({
    role: { type: String, required: true }, // 'user' ou 'model' (padrão exigido pelo Gemini)
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },

    // REQ-003: total de tokens (entrada + saída) reportado pelo Gemini em usageMetadata.totalTokenCount.
    // Só é preenchido nas respostas da IA (role 'model'); mensagens do usuário ficam com 0.
    tokensGastos: {
        type: Number,
        default: 0
    },

    // Detalhamento opcional — permite calcular custo financeiro por modelo no futuro,
    // já que entrada e saída costumam ter preços diferentes.
    tokensEntrada: { type: Number, default: 0 },  // usageMetadata.promptTokenCount
    tokensSaida: { type: Number, default: 0 },    // usageMetadata.candidatesTokenCount
    modelo: { type: String },                     // ex.: "gemini-flash-lite-latest"
    origem: { type: String, enum: ['chat', 'documento'], default: 'chat' } // de onde veio o consumo
});

// Acelera os agrupamentos por data do dashboard
MensagemSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Mensagem', MensagemSchema);
