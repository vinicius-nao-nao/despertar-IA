const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const { verificarTokenEObterUsuario } = require('../middlewares/auth');

const SALA_ADMINS = 'admins';

// Origens que podem abrir o WebSocket direto no Render (ex.: o domínio do Vercel).
// A autenticação é feita pelo JWT do handshake (sem cookies), então o CORS aqui não libera dados.
function origensPermitidas() {
    const lista = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean);
    return lista.length ? lista : true;
}

/**
 * Servidor Socket.IO acoplado ao MESMO servidor HTTP do Express (sem segunda porta).
 * - Toda conexão precisa de um JWT válido em handshake.auth.token.
 * - Apenas quem tem role "admin" NO BANCO entra na sala "admins",
 *   que é a única que recebe o evento administrativo "novoGastoDeToken".
 */
function configurarSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: origensPermitidas(), methods: ['GET', 'POST'] }
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth && socket.handshake.auth.token;
            const usuario = await verificarTokenEObterUsuario(token);
            if (!usuario) return next(new Error('nao_autenticado'));

            const decodificado = jwt.decode(token);
            socket.data.usuario = usuario;
            socket.data.expiraEm = decodificado && decodificado.exp ? decodificado.exp * 1000 : null;
            return next();
        } catch (err) {
            return next(new Error('erro_autenticacao'));
        }
    });

    io.on('connection', (socket) => {
        const { usuario } = socket.data;
        if (usuario.role === 'admin') {
            socket.join(SALA_ADMINS);
        }
        socket.emit('sessao', { role: usuario.role, salaAdmin: usuario.role === 'admin' });
    });

    return io;
}

/**
 * Emite um evento apenas para administradores AINDA válidos.
 * Antes de enviar, remove da sala quem teve a role revogada no banco ou cujo token expirou
 * enquanto estava conectado, e desconecta esse socket.
 */
async function emitirParaAdmins(io, evento, ...args) {
    const sockets = await io.in(SALA_ADMINS).fetchSockets();
    if (sockets.length === 0) return;

    const ids = [...new Set(sockets.map(s => s.data.usuario.id))];
    const adminsAtuais = await Usuario.find({ _id: { $in: ids }, role: 'admin' }).select('_id').lean();
    const idsAdmins = new Set(adminsAtuais.map(u => String(u._id)));
    const agora = Date.now();

    for (const s of sockets) {
        const expirou = s.data.expiraEm && s.data.expiraEm <= agora;
        if (expirou || !idsAdmins.has(s.data.usuario.id)) {
            s.leave(SALA_ADMINS);
            s.emit('sessao', { role: 'user', salaAdmin: false, motivo: expirou ? 'token_expirado' : 'permissao_revogada' });
            s.disconnect(true);
        }
    }

    io.to(SALA_ADMINS).emit(evento, ...args);
}

module.exports = { configurarSocket, emitirParaAdmins, SALA_ADMINS };
