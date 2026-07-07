const Jogador = require("../models/Jogador");

exports.getRanking = async (req, res) => {
    try {
        // Busca os 10 melhores jogadores ordenados por XP (do maior para o menor)
        const ranking = await Jogador.find()
            .sort({ xp: -1 })
            .limit(10);
            
        // Aplica os títulos baseados no XP
        const rankingComTitulos = ranking.map(j => ({
            nome: j.nome,
            xp: j.xp,
            titulo: j.xp >= 500 ? "👑 Lenda" : j.xp >= 100 ? "⚔️ Veterano" : "🌱 Novato"
        }));

        res.json({ sucesso: true, ranking: rankingComTitulos });
    } catch (erro) {
        console.error("Erro ao buscar ranking:", erro);
        res.status(500).json({ sucesso: false, erro: erro.message });
    }
};