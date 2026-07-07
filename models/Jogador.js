const mongoose = require('mongoose');

const JogadorSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    titulo: { type: String, default: "Novato" }
});

module.exports = mongoose.model('Jogador', JogadorSchema);