const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const autenticarToken = require('../middlewares/auth');
const limitarTentativas = require('../middlewares/limitarTentativas');

// A cada 15 minutos: 20 logins e 5 cadastros por IP, e 8 tentativas de login por email.
// O limite por email protege cada conta mesmo se o IP real não puder ser identificado
// (ex.: proxy mal configurado ou alguém falsificando X-Forwarded-For).
const limiteLoginPorIp = limitarTentativas({ maximo: 20 });
const limiteLoginPorEmail = limitarTentativas({
    maximo: 8,
    chave: (req) => (typeof req.body?.email === 'string' ? 'email:' + req.body.email.trim().toLowerCase() : null)
});
const limiteCadastro = limitarTentativas({ maximo: 5 });

router.post('/registrar', limiteCadastro, authController.registrar);
router.post('/login', limiteLoginPorIp, limiteLoginPorEmail, authController.login);
router.post('/logout', authController.logout);
router.get('/me', autenticarToken, authController.me);

module.exports = router;
