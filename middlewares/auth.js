const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');

/**
 * Valida um JWT e carrega o usuário ATUAL do banco.
 * A role nunca é lida do token: ela vem sempre do MongoDB, então uma permissão
 * de admin revogada deixa de valer na próxima requisição (não só quando o token expira).
 * Retorna null se o token for inválido/expirado ou se o usuário não existir mais.
 */
async function verificarTokenEObterUsuario(token) {
    if (!token || !process.env.JWT_SECRET) return null;

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return null;
    }
    if (!decoded || !mongoose.isValidObjectId(decoded.id)) return null;

    const usuario = await Usuario.findById(decoded.id).select('nome email role').lean();
    if (!usuario) return null;

    return {
        id: String(usuario._id),
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
    };
}

// Middleware de autenticação (401 quando não autenticado)
async function autenticarToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: 'Token não fornecido' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return res.status(401).send({ error: 'Erro no token' });

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return res.status(401).send({ error: 'Token malformatado' });

    try {
        const usuario = await verificarTokenEObterUsuario(token);
        if (!usuario) return res.status(401).send({ error: 'Token inválido' });

        req.userId = usuario.id;   // mantido por compatibilidade com o código existente
        req.usuario = usuario;     // { id, nome, email, role } — usado pelo apenasAdmin
        return next();
    } catch (err) {
        return next(err);
    }
}

module.exports = autenticarToken;
module.exports.autenticarToken = autenticarToken;
module.exports.verificarTokenEObterUsuario = verificarTokenEObterUsuario;
