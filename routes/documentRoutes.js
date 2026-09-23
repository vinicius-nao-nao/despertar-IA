const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middlewares/auth'); // O seu middleware JWT

const upload = multer({ storage: multer.memoryStorage() });

router.post('/documento', authMiddleware, upload.single('arquivo'), documentController.analisarDocumento);

module.exports = router;    