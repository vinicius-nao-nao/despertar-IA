const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const COOKIE_TOKEN = 'token';
const EXPIRACAO_TOKEN = process.env.JWT_EXPIRES_IN || '1d';
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function gerarToken(usuario) {
    // Apenas o id vai no token. A role é sempre consultada no banco (middlewares/auth.js),
    // então não há como o cliente "forjar" ou manter uma role administrativa revogada.
    return jwt.sign({ id: String(usuario._id) }, process.env.JWT_SECRET, { expiresIn: EXPIRACAO_TOKEN });
}

// Cookie HttpOnly usado SOMENTE para proteger a página /dashboard no servidor
// (navegação de página não envia o header Authorization). As APIs continuam exigindo Bearer.
function definirCookieToken(req, res, token) {
    res.cookie(COOKIE_TOKEN, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure || process.env.NODE_ENV === 'production',
        maxAge: UM_DIA_MS,
        path: '/'
    });
}

function respostaUsuario(usuario) {
    return { id: String(usuario._id || usuario.id), nome: usuario.nome, email: usuario.email, role: usuario.role };
}

exports.registrar = async (req, res) => {
    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ sucesso: false, erro: 'Servidor sem JWT_SECRET configurado' });
        }

        // Somente estes campos são aceitos. Qualquer "role" enviada pelo cliente é ignorada.
        const nome = typeof req.body.nome === 'string' ? req.body.nome.trim() : '';
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

        if (!nome || !email || !senha) {
            return res.status(400).json({ sucesso: false, erro: 'Informe nome, email e senha' });
        }
        if (!EMAIL_REGEX.test(email)) {
            return res.status(400).json({ sucesso: false, erro: 'Email inválido' });
        }
        if (senha.length < 6) {
            return res.status(400).json({ sucesso: false, erro: 'A senha deve ter pelo menos 6 caracteres' });
        }

        const existente = await Usuario.findOne({ email }).lean();
        if (existente) {
            return res.status(409).json({ sucesso: false, erro: 'Email já cadastrado' });
        }

        const usuario = await Usuario.create({ nome, email, senha }); // role = "user" (default do schema)
        const token = gerarToken(usuario);
        definirCookieToken(req, res, token);

        return res.status(201).json({ sucesso: true, token, usuario: respostaUsuario(usuario) });
    } catch (erro) {
        if (erro && erro.code === 11000) {
            return res.status(409).json({ sucesso: false, erro: 'Email já cadastrado' });
        }
        console.error('❌ Erro no cadastro:', erro);
        return res.status(500).json({ sucesso: false, erro: 'Erro ao cadastrar usuário' });
    }
};

exports.login = async (req, res) => {
    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ sucesso: false, erro: 'Servidor sem JWT_SECRET configurado' });
        }

        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
        if (!email || !senha) {
            return res.status(400).json({ sucesso: false, erro: 'Informe email e senha' });
        }

        const usuario = await Usuario.findOne({ email }).select('+senha');
        if (!usuario || !usuario.verificarSenha(senha)) {
            return res.status(401).json({ sucesso: false, erro: 'Email ou senha inválidos' });
        }

        const token = gerarToken(usuario);
        definirCookieToken(req, res, token);

        return res.json({ sucesso: true, token, usuario: respostaUsuario(usuario) });
    } catch (erro) {
        console.error('❌ Erro no login:', erro);
        return res.status(500).json({ sucesso: false, erro: 'Erro ao fazer login' });
    }
};

exports.logout = (req, res) => {
    res.clearCookie(COOKIE_TOKEN, { path: '/' });
    return res.json({ sucesso: true });
};

// Dados do usuário autenticado (role atual vinda do banco)
exports.me = (req, res) => {
    return res.json({ sucesso: true, usuario: req.usuario });
};

exports.COOKIE_TOKEN = COOKIE_TOKEN;
