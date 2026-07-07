const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Rota para enviar mensagem
router.post('/', chatController.enviarMensagem);

// Rota para limpar histórico (O erro estava aqui porque a função não existia no controller)
router.delete('/limpar', chatController.limparHistorico);

module.exports = router;