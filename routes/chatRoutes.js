const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// POST /api/chat/ - Envia mensagem
router.post('/', chatController.enviarMensagem);

// DELETE /api/chat/limpar - Reseta histórico
router.delete('/limpar', chatController.limparHistorico);

module.exports = router;