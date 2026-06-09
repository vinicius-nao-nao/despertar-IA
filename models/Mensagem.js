const mongoose = require('mongoose');

const MensagemSchema = new mongoose.Schema({
    role: { type: String, required: true }, // 'user' ou 'model' (padrão exigido pelo Gemini)
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Mensagem', MensagemSchema);