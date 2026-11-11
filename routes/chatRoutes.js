const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const autenticarToken = require('../middlewares/auth');
const apenasAdmin = require('../middlewares/apenasAdmin');

// Rota para enviar mensagem
router.post('/', chatController.enviarMensagem);

// Rota para limpar histórico: apaga TODAS as mensagens (e com elas os dados do dashboard),
// por isso é restrita a administradores.
router.delete('/limpar', autenticarToken, apenasAdmin, chatController.limparHistorico);

module.exports = router;