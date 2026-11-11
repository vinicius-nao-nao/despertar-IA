// REQ-002: autorização por papel (RBAC).
// Deve ser usado SEMPRE depois do autenticarToken, que preenche req.usuario
// com a role atual lida do banco de dados.
function apenasAdmin(req, res, next) {
    const role = req.usuario ? req.usuario.role : undefined;

    if (role === "admin") {
        next();
    } else {
        return res.status(403).json({
            sucesso: false,
            erro: "Acesso negado: apenas administradores podem acessar este recurso."
        });
    }
}

module.exports = apenasAdmin;
