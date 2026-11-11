// Testes de integração: sobem o server.js REAL (Express + Socket.IO + middlewares + controllers).
// Para rodar sem MongoDB e sem chave do Gemini:
//  - o SDK do Gemini é trocado por um fake que devolve usageMetadata controlado;
//  - as coleções do Mongoose são servidas em memória, com filtros e aggregate executados pelo
//    mingo (implementação em JS da linguagem de consulta do MongoDB).
// Rodar: npm test
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const mingo = require('mingo');
const { io: ioClient } = require('socket.io-client');

const REPO = path.join(__dirname, '..');
const PORTA = 3999;
const BASE = `http://127.0.0.1:${PORTA}`;

process.env.JWT_SECRET = 'segredo-de-teste';
process.env.GEMINI_API_KEY = 'fake';
process.env.MONGO_URI = 'mongodb://127.0.0.1:9/inexistente'; // nunca é usado de fato
process.env.PORT = String(PORTA);
process.env.CORS_ORIGINS = 'https://meu-app.vercel.app/';
delete process.env.SOCKET_PUBLIC_URL;
delete process.env.RENDER_EXTERNAL_URL;
process.chdir(REPO);

// ---------- Fake do Gemini ----------
const filaGemini = [];
const configsRecebidas = [];
function proximaResposta() {
    const r = filaGemini.shift();
    if (!r) throw new Error('fila do fake do Gemini vazia');
    return {
        response: {
            text: () => r.text,
            functionCalls: () => (r.call ? [r.call] : undefined),
            usageMetadata: r.usage
        }
    };
}
class FakeGenAI {
    getGenerativeModel(config) {
        configsRecebidas.push(config);
        return {
            startChat: () => ({ sendMessage: async () => proximaResposta() }),
            generateContent: async () => proximaResposta()
        };
    }
}
const caminhoGemini = require.resolve('@google/generative-ai', { paths: [REPO] });
const modFake = new Module(caminhoGemini);
modFake.exports = { GoogleGenerativeAI: FakeGenAI };
modFake.loaded = true;
require.cache[caminhoGemini] = modFake;

// ---------- Coleções em memória ----------
const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { ObjectId } = mongoose.Types;
const Usuario = require('../models/Usuario');
const Mensagem = require('../models/Mensagem');
const Jogador = require('../models/Jogador');

const banco = { usuarios: [], mensagens: [], jogadores: [] };

// ObjectId → string (o mingo compara classes customizadas por referência); Date é preservada
function normalizar(v) {
    if (v && v._bsontype === 'ObjectId') return v.toHexString();
    if (v instanceof Date) return new Date(v);
    if (Array.isArray(v)) return v.map(normalizar);
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = normalizar(x); return o; }
    return v;
}
function buscar(arr, filtro) {
    const normalizados = arr.map((d, i) => ({ ...normalizar(d), __i: i }));
    return new mingo.Query(normalizar(filtro || {})).find(normalizados).all().map(d => arr[d.__i]);
}
function aplicarProjecao(doc, projection) {
    if (!projection || !Object.keys(projection).length) return doc;
    if (!Object.values(projection).some(v => v === 1)) {
        const d = { ...doc };
        for (const [k, v] of Object.entries(projection)) if (v === 0) delete d[k];
        return d;
    }
    const d = { _id: doc._id };
    for (const k of Object.keys(projection)) if (projection[k] === 1 && k in doc) d[k] = doc[k];
    return d;
}
function instalarColecao(Model, arr) {
    const c = Model.collection;
    c.insertOne = async (doc) => { arr.push({ ...doc }); return { acknowledged: true, insertedId: doc._id }; };
    c.findOne = async (filtro, opts = {}) => {
        const doc = buscar(arr, filtro)[0];
        return doc ? aplicarProjecao({ ...doc }, opts.projection) : null;
    };
    c.find = (filtro, opts = {}) => {
        const docs = buscar(arr, filtro).map(d => aplicarProjecao({ ...d }, opts.projection));
        return { toArray: async () => docs };
    };
    c.countDocuments = async (filtro) => buscar(arr, filtro).length;
    c.deleteMany = async (filtro) => {
        const remover = new Set(buscar(arr, filtro));
        const antes = arr.length;
        for (let i = arr.length - 1; i >= 0; i--) if (remover.has(arr[i])) arr.splice(i, 1);
        return { acknowledged: true, deletedCount: antes - arr.length };
    };
    c.aggregate = async (pipeline) => {
        const r = mingo.aggregate(arr.map(normalizar), normalizar(pipeline));
        return { toArray: async () => r, [Symbol.asyncIterator]: async function* () { yield* r; } };
    };
    c.findOneAndUpdate = async (filtro, update, opts = {}) => {
        let doc = buscar(arr, filtro)[0];
        if (!doc && opts.upsert) { doc = { _id: new ObjectId(), ...filtro }; arr.push(doc); }
        if (doc && update.$inc) for (const [k, v] of Object.entries(update.$inc)) doc[k] = (doc[k] || 0) + v;
        if (doc && update.$setOnInsert) for (const [k, v] of Object.entries(update.$setOnInsert)) if (!(k in doc)) doc[k] = v;
        return doc ? { ...doc } : null;
    };
}
instalarColecao(Usuario, banco.usuarios);
instalarColecao(Mensagem, banco.mensagens);
instalarColecao(Jogador, banco.jogadores);

// ---------- Sobe o servidor real ----------
require('../server.js');

// ---------- Helpers ----------
async function req(metodo, rota, { token, body, cookie, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(BASE + rota, {
        method: metodo, headers, redirect: 'manual',
        body: form || (body ? JSON.stringify(body) : undefined)
    });
    const texto = await res.text();
    let json = null; try { json = JSON.parse(texto); } catch (e) { /* não é JSON */ }
    return { status: res.status, json, texto, headers: res.headers };
}
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const acharUsuario = (id) => banco.usuarios.find(u => String(u._id) === id);

function conectarSocket(token) {
    return new Promise((resolve) => {
        const s = ioClient(BASE, { auth: { token }, reconnection: false, transports: ['websocket'] });
        const ctx = { s, eventos: [], sessoes: [] };
        s.on('novoGastoDeToken', (q, meta) => ctx.eventos.push({ q, meta }));
        s.on('sessao', (info) => { ctx.sessoes.push(info); if (!ctx.info) { ctx.info = info; resolve(ctx); } });
        s.on('connect_error', (err) => { ctx.erro = err.message; resolve(ctx); });
    });
}

// PDF mínimo válido contendo o texto informado
function gerarPdf(texto) {
    const conteudo = `BT /F1 14 Tf 20 100 Td (${texto}) Tj ET`;
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let out = '%PDF-1.4\n';
    const offsets = objs.map((o, i) => { const off = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return off; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

let tokenUser, tokenAdmin, idAdmin;

test('servidor sobe', async () => {
    for (let i = 0; i < 50; i++) {
        try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch (e) { /* ainda subindo */ }
        await esperar(100);
    }
    assert.fail('servidor não subiu');
});

test('REQ-001: cadastro cria role "user" e ignora role enviada pelo cliente', async () => {
    const r = await req('POST', '/api/auth/registrar', { body: { nome: 'Comum', email: 'comum@x.com', senha: '123456', role: 'admin' } });
    assert.strictEqual(r.status, 201, r.texto);
    assert.strictEqual(r.json.usuario.role, 'user');
    assert.strictEqual(banco.usuarios[0].role, 'user');
    assert.ok(!banco.usuarios[0].senha.includes('123456'), 'senha não deve ser salva em texto puro');
    assert.match(r.headers.get('set-cookie'), /token=.*HttpOnly/i);
    tokenUser = r.json.token;

    const r2 = await req('POST', '/api/auth/registrar', { body: { nome: 'Admin', email: 'admin@x.com', senha: 'abcdef' } });
    assert.strictEqual(r2.json.usuario.role, 'user');
    idAdmin = r2.json.usuario.id;
});

test('cadastro duplicado → 409; login errado → 401; login certo → 200', async () => {
    assert.strictEqual((await req('POST', '/api/auth/registrar', { body: { nome: 'X', email: 'COMUM@x.com', senha: '123456' } })).status, 409);
    assert.strictEqual((await req('POST', '/api/auth/login', { body: { email: 'comum@x.com', senha: 'errada' } })).status, 401);
    assert.strictEqual((await req('POST', '/api/auth/login', { body: { email: 'comum@x.com', senha: '123456' } })).status, 200);
});

test('promoção manual a admin (como no Atlas) e /me reflete o banco', async () => {
    acharUsuario(idAdmin).role = 'admin';
    const login = await req('POST', '/api/auth/login', { body: { email: 'admin@x.com', senha: 'abcdef' } });
    tokenAdmin = login.json.token;
    const me = await req('GET', '/api/auth/me', { token: tokenAdmin });
    assert.strictEqual(me.json.usuario.role, 'admin');
});

test('REQ-006: sem JWT → 401, token inválido → 401, user → 403, admin → 200', async () => {
    assert.strictEqual((await req('GET', '/api/analytics/tokens')).status, 401);
    assert.strictEqual((await req('GET', '/api/analytics/tokens', { token: 'lixo' })).status, 401);
    assert.strictEqual((await req('GET', '/api/analytics/tokens', { token: tokenUser })).status, 403);
    const a = await req('GET', '/api/analytics/tokens', { token: tokenAdmin });
    assert.strictEqual(a.status, 200, a.texto);
    assert.strictEqual(a.json.totais.tokens, 0);
    assert.strictEqual(a.json.totais.usuarios, 2);
    assert.strictEqual(a.json.porDia.length, 30);
    assert.strictEqual(a.json.porHora.length, 24);
});

test('JWT forjado com role admin no payload não dá acesso', async () => {
    const jwt = require('jsonwebtoken');
    const forjado = jwt.sign({ id: String(banco.usuarios[0]._id), role: 'admin' }, process.env.JWT_SECRET);
    assert.strictEqual((await req('GET', '/api/analytics/tokens', { token: forjado })).status, 403);
});

test('página /dashboard protegida no servidor', async () => {
    const semCookie = await req('GET', '/dashboard');
    assert.strictEqual(semCookie.status, 302);
    assert.match(semCookie.headers.get('location'), /login\.html/);
    assert.strictEqual((await req('GET', '/dashboard', { cookie: `token=${tokenUser}` })).status, 403);
    assert.strictEqual((await req('GET', '/dashboard.html', { cookie: `token=${tokenUser}` })).status, 403);
    const ok = await req('GET', '/dashboard', { cookie: `token=${tokenAdmin}` });
    assert.strictEqual(ok.status, 200);
    assert.ok(ok.texto.includes('<canvas id="graficoTokens"></canvas>'));
});

test('REQ-003/004 + WebSocket: tokens persistidos e evento só para admins', async () => {
    const sAdmin = await conectarSocket(tokenAdmin);
    const sUser = await conectarSocket(tokenUser);
    const sAnon = await conectarSocket(undefined);
    assert.strictEqual(sAdmin.info.salaAdmin, true);
    assert.strictEqual(sUser.info.salaAdmin, false);
    assert.strictEqual(sAnon.erro, 'nao_autenticado');

    // 1) resposta simples
    filaGemini.push({ text: 'Charada!', usage: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 } });
    let r = await req('POST', '/api/chat', { body: { pergunta: 'Oi', nickname: 'Neo' } });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.resposta, 'Charada!');
    const config = configsRecebidas[configsRecebidas.length - 1];
    assert.strictEqual(config.tools[0].functionDeclarations[0].name, 'adicionarXP', 'tools chegam na configuração do modelo');

    // 2) com function calling: as duas chamadas são cobradas → soma das duas
    filaGemini.push({ text: '', call: { name: 'adicionarXP', args: { nickname: 'Neo', quantidade: 50 } }, usage: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 60 } });
    filaGemini.push({ text: 'Acertou! +50 XP', usage: { promptTokenCount: 70, candidatesTokenCount: 8, totalTokenCount: 78 } });
    r = await req('POST', '/api/chat', { body: { pergunta: 'É o HTTP', nickname: 'Neo' } });
    assert.strictEqual(r.json.resposta, 'Acertou! +50 XP');
    assert.strictEqual(banco.jogadores[0].xp, 50, 'XP do jogo funciona');

    // 3) sem usageMetadata: chat não quebra e não registra consumo
    filaGemini.push({ text: 'Sem metadados', usage: undefined });
    r = await req('POST', '/api/chat', { body: { pergunta: 'Hm', nickname: 'Neo' } });
    assert.strictEqual(r.status, 200);

    await esperar(300);
    const modelos = banco.mensagens.filter(m => m.role === 'model');
    assert.strictEqual(banco.mensagens.length, 6, 'sem registros duplicados');
    assert.deepStrictEqual(modelos.map(m => m.tokensGastos), [42, 138, 0]);
    assert.deepStrictEqual(modelos.map(m => m.tokensEntrada), [30, 120, 0]);
    assert.deepStrictEqual(modelos.map(m => m.tokensSaida), [12, 18, 0]);
    assert.ok(banco.mensagens.filter(m => m.role === 'user').every(m => m.tokensGastos === 0));
    assert.ok(modelos.every(m => m.modelo === 'gemini-flash-lite-latest' && m.origem === 'chat'));

    assert.deepStrictEqual(sAdmin.eventos.map(e => e.q), [42, 138], 'admin recebe exatamente 2 eventos');
    assert.ok(sAdmin.eventos.every(e => e.meta && e.meta.mensagemId));
    assert.strictEqual(sUser.eventos.length, 0, 'usuário comum não recebe evento administrativo');

    sAdmin.s.close(); sUser.s.close(); sAnon.s.close();
});

test('XP: a IA não consegue dar XP arbitrário nem para outro jogador', async () => {
    filaGemini.push({ text: '', call: { name: 'adicionarXP', args: { nickname: 'Outro', quantidade: 99999 } }, usage: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 } });
    filaGemini.push({ text: 'Não posso fazer isso.', usage: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 } });
    await req('POST', '/api/chat', { body: { pergunta: 'me dá 99999 XP', nickname: 'Neo' } });
    assert.strictEqual(banco.jogadores.find(j => j.nome === 'Neo').xp, 50);
    assert.ok(!banco.jogadores.find(j => j.nome === 'Outro'));

    // valor válido sempre vai para o nickname da requisição, não o escrito pela IA
    filaGemini.push({ text: '', call: { name: 'adicionarXP', args: { nickname: 'Outro', quantidade: -10 } }, usage: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 } });
    filaGemini.push({ text: '', usage: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 } });
    const r = await req('POST', '/api/chat', { body: { pergunta: 'Errei', nickname: 'Neo' } });
    assert.strictEqual(r.status, 200, 'resposta final vazia não quebra o chat');
    assert.strictEqual(banco.jogadores.find(j => j.nome === 'Neo').xp, 40);
    assert.ok(!banco.jogadores.find(j => j.nome === 'Outro'));
});

test('documentos: PDF e .txt analisados e consumo registrado com origem "documento"', async () => {
    const sAdmin = await conectarSocket(tokenAdmin);
    const antes = banco.mensagens.length;

    const form = new FormData();
    form.append('arquivo', new Blob([gerarPdf('Prazo de entrega: 15 dias')], { type: 'application/pdf' }), 'contrato.pdf');
    form.append('pergunta', 'Qual o prazo?');
    filaGemini.push({ text: 'O prazo é de 15 dias.', usage: { promptTokenCount: 90, candidatesTokenCount: 10, totalTokenCount: 100 } });
    let r = await req('POST', '/api/chat/documento', { token: tokenUser, form });
    assert.strictEqual(r.status, 200, r.texto);
    assert.strictEqual(r.json.resposta, 'O prazo é de 15 dias.');

    const form2 = new FormData();
    form2.append('arquivo', new Blob(['Reunião na sexta'], { type: 'text/plain' }), 'notas.txt');
    form2.append('pergunta', 'Quando?');
    filaGemini.push({ text: 'Na sexta.', usage: { promptTokenCount: 20, candidatesTokenCount: 3, totalTokenCount: 23 } });
    r = await req('POST', '/api/chat/documento', { token: tokenUser, form: form2 });
    assert.strictEqual(r.status, 200, r.texto);

    const form3 = new FormData();
    form3.append('arquivo', new Blob(['isto não é um pdf'], { type: 'application/pdf' }), 'quebrado.pdf');
    form3.append('pergunta', 'E aí?');
    r = await req('POST', '/api/chat/documento', { token: tokenUser, form: form3 });
    assert.strictEqual(r.status, 400, 'PDF inválido → 400 amigável');

    await esperar(300);
    const novas = banco.mensagens.slice(antes);
    assert.strictEqual(novas.length, 4);
    assert.ok(novas.every(m => m.origem === 'documento'));
    assert.deepStrictEqual(novas.filter(m => m.role === 'model').map(m => m.tokensGastos), [100, 23]);
    assert.deepStrictEqual(sAdmin.eventos.map(e => e.q), [100, 23]);
    sAdmin.s.close();

    const a = (await req('GET', '/api/analytics/tokens', { token: tokenAdmin })).json;
    assert.strictEqual(a.porOrigem.documento.tokens, 123);
    assert.strictEqual(a.porOrigem.chat.tokens, 42 + 138 + 20 + 20);
});

test('REQ-005: totais e agrupamentos calculados pela agregação', async () => {
    const totalAntes = (await req('GET', '/api/analytics/tokens', { token: tokenAdmin })).json.totais;
    const agora = Date.now();
    banco.mensagens.push(
        { _id: new ObjectId(), role: 'model', text: 'a', createdAt: new Date(agora - 2 * 86400000), tokensGastos: 100, tokensEntrada: 60, tokensSaida: 40 },
        { _id: new ObjectId(), role: 'model', text: 'b', createdAt: new Date(agora - 40 * 86400000), tokensGastos: 1000, tokensEntrada: 0, tokensSaida: 0 }
    );

    const a = (await req('GET', '/api/analytics/tokens', { token: tokenAdmin })).json;
    const hojeTokens = totalAntes.tokens;
    assert.strictEqual(a.totais.tokens, hojeTokens + 1100);
    assert.strictEqual(a.totais.mensagens, totalAntes.mensagens + 2);
    assert.strictEqual(a.totais.usuarios, 2);
    assert.strictEqual(a.totais.respostasIA, totalAntes.respostasIA + 2);
    assert.strictEqual(a.totais.respostasComTokens, totalAntes.respostasComTokens + 2);
    assert.strictEqual(a.periodos.ultimos7Dias.tokens, hojeTokens + 100);
    assert.strictEqual(a.periodos.ultimos30Dias.tokens, hojeTokens + 100);

    const somaDias = a.porDia.reduce((s, d) => s + d.tokens, 0); // soma só para conferir no teste
    assert.strictEqual(somaDias, hojeTokens + 100, 'gráfico exclui a mensagem de 40 dias atrás');
    assert.strictEqual(a.porDia[0].acumulado, 1000, 'acumulado parte do total anterior ao período');
    assert.strictEqual(a.porDia[29].acumulado, a.totais.tokens, 'acumulado final = total geral');
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    assert.strictEqual(a.porDia[29].data, hoje);
    assert.strictEqual(a.porDia[29].tokens, hojeTokens);
    assert.strictEqual(a.porHora.reduce((s, h) => s + h.mensagens, 0), a.periodos.ultimos30Dias.mensagens);
    assert.ok(a.horarioDePico && a.horarioDePico.mensagens >= 1);
});

test('role revogada perde acesso na API e é removida da sala do socket no próximo evento', async () => {
    const sAdmin = await conectarSocket(tokenAdmin);
    assert.strictEqual(sAdmin.info.salaAdmin, true);

    acharUsuario(idAdmin).role = 'user';
    assert.strictEqual((await req('GET', '/api/analytics/tokens', { token: tokenAdmin })).status, 403);

    filaGemini.push({ text: 'ok', usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } });
    await req('POST', '/api/chat', { body: { pergunta: 'x', nickname: 'Neo' } });
    await esperar(300);
    assert.strictEqual(sAdmin.eventos.length, 0, 'admin rebaixado não recebe mais eventos');
    assert.ok(sAdmin.sessoes.some(s => s.motivo === 'permissao_revogada'));
    assert.strictEqual(sAdmin.s.connected, false);

    acharUsuario(idAdmin).role = 'admin';
});

test('limpar histórico: só admin apaga o banco', async () => {
    assert.strictEqual((await req('DELETE', '/api/chat/limpar')).status, 401);
    assert.strictEqual((await req('DELETE', '/api/chat/limpar', { token: tokenUser })).status, 403);
    assert.ok(banco.mensagens.length > 0);
    assert.strictEqual((await req('DELETE', '/api/chat/limpar', { token: tokenAdmin })).status, 200);
    assert.strictEqual(banco.mensagens.length, 0);
});

test('rotas existentes continuam respondendo', async () => {
    assert.strictEqual((await req('GET', '/api/health')).status, 200);
    assert.strictEqual((await req('POST', '/api/chat', { body: {} })).status, 400);
    assert.strictEqual((await req('GET', '/api/ranking')).status, 200);
    assert.strictEqual((await req('POST', '/api/chat/documento')).status, 401, 'upload continua exigindo JWT');
    assert.strictEqual((await req('POST', '/api/chat/documento', { token: tokenUser })).status, 400);
    const idx = await req('GET', '/');
    assert.strictEqual(idx.status, 200);
    assert.ok(idx.texto.includes('Mestre do Jogo IA'));
    assert.strictEqual((await req('GET', '/login.html')).status, 200);
});

test('deploy: /config.js e CORS do WebSocket só para a origem configurada', async () => {
    const cfg = await req('GET', '/config.js');
    assert.strictEqual(cfg.status, 200);
    assert.match(cfg.headers.get('content-type'), /javascript/);
    assert.strictEqual(cfg.texto, 'window.APP_CONFIG = {"socketUrl":""};');

    const handshake = (origem) => fetch(`${BASE}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origem } });
    const permitido = await handshake('https://meu-app.vercel.app');
    assert.strictEqual(permitido.headers.get('access-control-allow-origin'), 'https://meu-app.vercel.app');
    const negado = await handshake('https://site-malicioso.com');
    assert.notStrictEqual(negado.headers.get('access-control-allow-origin'), 'https://site-malicioso.com');
});

test('limite de tentativas de login por email → 429 (mesmo trocando de IP)', async () => {
    let ultimo;
    for (let i = 0; i < 9; i++) {
        ultimo = await req('POST', '/api/auth/login', { body: { email: 'Comum@x.com', senha: 'errada' } });
    }
    assert.strictEqual(ultimo.status, 429);
    assert.ok(Number(ultimo.headers.get('retry-after')) > 0);
    // outra conta no mesmo IP continua podendo tentar
    assert.strictEqual((await req('POST', '/api/auth/login', { body: { email: 'admin@x.com', senha: 'abcdef' } })).status, 200);
});

test.after(() => setTimeout(() => process.exit(0), 100));
