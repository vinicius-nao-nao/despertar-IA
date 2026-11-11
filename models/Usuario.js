const mongoose = require('mongoose');
const crypto = require('crypto');

// Hash de senha com scrypt (módulo nativo do Node — nenhuma dependência extra).
const SCRYPT_KEYLEN = 64;

function gerarHashSenha(senha) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, salt, SCRYPT_KEYLEN).toString('hex');
    return `${salt}:${hash}`;
}

const UsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    senha: { type: String, required: true, select: false }, // armazenada como "salt:hash"

    // RBAC (REQ-001): todo usuário novo nasce como "user".
    // A role NUNCA é aceita do corpo da requisição (ver authController.registrar).
    // Para promover alguém a administrador, altere o documento diretamente no MongoDB.
    role: {
        type: String,
        default: "user"
    },

    createdAt: { type: Date, default: Date.now }
});

// Gera o hash antes de salvar sempre que a senha for definida/alterada
UsuarioSchema.pre('save', function () {
    if (this.isModified('senha')) {
        this.senha = gerarHashSenha(this.senha);
    }
});

UsuarioSchema.methods.verificarSenha = function (senhaInformada) {
    if (!this.senha || typeof senhaInformada !== 'string') return false;
    const [salt, hashSalvo] = this.senha.split(':');
    if (!salt || !hashSalvo) return false;
    const hashInformado = crypto.scryptSync(senhaInformada, salt, SCRYPT_KEYLEN);
    const bufferSalvo = Buffer.from(hashSalvo, 'hex');
    return bufferSalvo.length === hashInformado.length && crypto.timingSafeEqual(bufferSalvo, hashInformado);
};

module.exports = mongoose.model('Usuario', UsuarioSchema);
