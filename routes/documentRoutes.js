const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middlewares/auth'); // O seu middleware JWT

// Arquivo fica em memória: limita o tamanho para não derrubar o servidor
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function receberArquivo(req, res, next) {
    upload.single('arquivo')(req, res, (err) => {
        if (err && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ sucesso: false, erro: 'Arquivo muito grande (máximo 10 MB)' });
        }
        if (err) return next(err);
        return next();
    });
}

router.post('/documento', authMiddleware, receberArquivo, documentController.analisarDocumento);

module.exports = router;    