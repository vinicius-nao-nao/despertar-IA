// Limitador simples de tentativas (em memória, sem dependências).
// Protege login/cadastro contra força bruta. Em produção com várias instâncias,
// troque por um armazenamento compartilhado (ex.: Redis).
// chave(req): o que identifica quem está tentando (padrão: IP). Retorne null para não limitar.
function limitarTentativas({ maximo = 10, janelaMs = 15 * 60 * 1000, chave: obterChave = (req) => req.ip } = {}) {
    const tentativas = new Map(); // chave -> { quantidade, expiraEm }

    // Limpa entradas vencidas periodicamente para não crescer sem limite
    setInterval(() => {
        const agora = Date.now();
        for (const [chave, registro] of tentativas) {
            if (registro.expiraEm <= agora) tentativas.delete(chave);
        }
    }, janelaMs).unref();

    return (req, res, next) => {
        const agora = Date.now();
        const chave = obterChave(req);
        if (!chave) return next();
        let registro = tentativas.get(chave);
        if (!registro || registro.expiraEm <= agora) {
            registro = { quantidade: 0, expiraEm: agora + janelaMs };
            tentativas.set(chave, registro);
        }
        registro.quantidade++;

        if (registro.quantidade > maximo) {
            const segundos = Math.ceil((registro.expiraEm - agora) / 1000);
            res.set('Retry-After', String(segundos));
            return res.status(429).json({
                sucesso: false,
                erro: `Muitas tentativas. Tente novamente em ${Math.ceil(segundos / 60)} minuto(s).`
            });
        }
        return next();
    };
}

module.exports = limitarTentativas;
