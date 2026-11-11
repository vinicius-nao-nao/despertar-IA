const express = require('express');
const router = express.Router();
const Mensagem = require('../models/Mensagem');
const Usuario = require('../models/Usuario');
const Jogador = require('../models/Jogador');
const autenticarToken = require('../middlewares/auth');
const apenasAdmin = require('../middlewares/apenasAdmin');

// Fuso usado para agrupar "por dia" e "por hora" (datas reais das mensagens).
const FUSO_HORARIO = process.env.ANALYTICS_TIMEZONE || 'America/Sao_Paulo';
const DIAS_NO_GRAFICO = 30;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" de uma data no fuso configurado (mesmo formato do $dateToString abaixo)
function chaveDoDia(data) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO_HORARIO, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(data);
}

// Lista das últimas N chaves de dia, da mais antiga para a mais recente (só para o eixo X)
function ultimosDias(quantidade, agora) {
    const dias = [];
    for (let i = quantidade - 1; i >= 0; i--) {
        const chave = chaveDoDia(new Date(agora.getTime() - i * UM_DIA_MS));
        if (dias[dias.length - 1] !== chave) dias.push(chave);
    }
    return dias;
}

/**
 * REQ-005: toda a contagem e soma de tokens acontece no MongoDB
 * (Mensagem.aggregate + $group + $sum). O JavaScript apenas formata a resposta
 * e preenche com zero os dias/horas que não tiveram nenhuma mensagem.
 */
async function obterAnalyticsDeTokens(req, res) {
    try {
        const agora = new Date();
        const dias = ultimosDias(DIAS_NO_GRAFICO, agora);
        const primeiroDia = dias[0];
        const inicio7Dias = new Date(agora.getTime() - 7 * UM_DIA_MS);
        const inicio30Dias = new Date(agora.getTime() - 30 * UM_DIA_MS);

        const diaDaMensagem = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: FUSO_HORARIO } };
        const ehRespostaComTokens = { $and: [{ $eq: ['$role', 'model'] }, { $gt: ['$tokensGastos', 0] }] };

        const [resultado] = await Mensagem.aggregate([
            {
                $facet: {
                    // Totais gerais
                    totais: [
                        {
                            $group: {
                                _id: null,
                                totalTokens: { $sum: '$tokensGastos' },
                                totalTokensEntrada: { $sum: '$tokensEntrada' },
                                totalTokensSaida: { $sum: '$tokensSaida' },
                                totalMensagens: { $sum: 1 },
                                respostasIA: { $sum: { $cond: [{ $eq: ['$role', 'model'] }, 1, 0] } },
                                respostasComTokens: { $sum: { $cond: [ehRespostaComTokens, 1, 0] } },
                                // Média só sobre respostas com consumo registrado
                                // (mensagens antigas, de antes deste recurso, têm tokensGastos = 0)
                                mediaTokensPorResposta: { $avg: { $cond: [ehRespostaComTokens, '$tokensGastos', null] } }
                            }
                        }
                    ],

                    // Tokens e mensagens por dia + consumo acumulado (janela no próprio MongoDB)
                    porDia: [
                        {
                            $group: {
                                _id: diaDaMensagem,
                                tokens: { $sum: '$tokensGastos' },
                                mensagens: { $sum: 1 }
                            }
                        },
                        {
                            $setWindowFields: {
                                sortBy: { _id: 1 },
                                output: {
                                    acumulado: { $sum: '$tokens', window: { documents: ['unbounded', 'current'] } }
                                }
                            }
                        },
                        { $match: { _id: { $gte: primeiroDia } } },
                        { $sort: { _id: 1 } }
                    ],

                    // Acumulado anterior ao período do gráfico (para os dias iniciais sem mensagens)
                    antesDoPeriodo: [
                        { $match: { $expr: { $lt: [diaDaMensagem, primeiroDia] } } },
                        { $group: { _id: null, tokens: { $sum: '$tokensGastos' } } }
                    ],

                    ultimos7Dias: [
                        { $match: { createdAt: { $gte: inicio7Dias } } },
                        { $group: { _id: null, tokens: { $sum: '$tokensGastos' }, mensagens: { $sum: 1 } } }
                    ],

                    ultimos30Dias: [
                        { $match: { createdAt: { $gte: inicio30Dias } } },
                        { $group: { _id: null, tokens: { $sum: '$tokensGastos' }, mensagens: { $sum: 1 } } }
                    ],

                    // Consumo por origem (chat x análise de documentos)
                    porOrigem: [
                        {
                            $group: {
                                _id: { $ifNull: ['$origem', 'chat'] }, // mensagens antigas não têm o campo
                                tokens: { $sum: '$tokensGastos' },
                                mensagens: { $sum: 1 }
                            }
                        }
                    ],

                    // Horários de maior atividade (últimos 30 dias)
                    porHora: [
                        { $match: { createdAt: { $gte: inicio30Dias } } },
                        {
                            $group: {
                                _id: { $hour: { date: '$createdAt', timezone: FUSO_HORARIO } },
                                mensagens: { $sum: 1 },
                                tokens: { $sum: '$tokensGastos' }
                            }
                        },
                        { $sort: { mensagens: -1, _id: 1 } }
                    ]
                }
            }
        ]);

        const [totalUsuarios, totalJogadores] = await Promise.all([
            Usuario.countDocuments(),
            Jogador.countDocuments()
        ]);

        const totais = resultado.totais[0] || {};
        const periodo7 = resultado.ultimos7Dias[0] || {};
        const periodo30 = resultado.ultimos30Dias[0] || {};
        const acumuladoAntes = resultado.antesDoPeriodo[0] ? resultado.antesDoPeriodo[0].tokens : 0;

        // Preenche dias sem mensagens com zero (o acumulado apenas se repete — nada é somado aqui)
        const diasComDados = new Map(resultado.porDia.map(d => [d._id, d]));
        let ultimoAcumulado = acumuladoAntes;
        const porDia = dias.map(data => {
            const d = diasComDados.get(data);
            if (d) ultimoAcumulado = d.acumulado;
            return {
                data,
                tokens: d ? d.tokens : 0,
                mensagens: d ? d.mensagens : 0,
                acumulado: ultimoAcumulado
            };
        });

        const horasComDados = new Map(resultado.porHora.map(h => [h._id, h]));
        const porHora = Array.from({ length: 24 }, (_, hora) => ({
            hora,
            mensagens: horasComDados.has(hora) ? horasComDados.get(hora).mensagens : 0,
            tokens: horasComDados.has(hora) ? horasComDados.get(hora).tokens : 0
        }));
        const pico = resultado.porHora[0]; // já ordenado por mensagens no MongoDB

        const porOrigem = { chat: { tokens: 0, mensagens: 0 }, documento: { tokens: 0, mensagens: 0 } };
        resultado.porOrigem.forEach(o => { porOrigem[o._id] = { tokens: o.tokens, mensagens: o.mensagens }; });

        return res.status(200).json({
            sucesso: true,
            geradoEm: agora.toISOString(),
            fusoHorario: FUSO_HORARIO,
            totais: {
                tokens: totais.totalTokens || 0,
                tokensEntrada: totais.totalTokensEntrada || 0,
                tokensSaida: totais.totalTokensSaida || 0,
                mensagens: totais.totalMensagens || 0,
                usuarios: totalUsuarios,
                jogadores: totalJogadores,
                respostasIA: totais.respostasIA || 0,
                respostasComTokens: totais.respostasComTokens || 0,
                mediaTokensPorResposta: totais.mediaTokensPorResposta
                    ? Math.round(totais.mediaTokensPorResposta * 10) / 10
                    : 0
            },
            periodos: {
                ultimos7Dias: { tokens: periodo7.tokens || 0, mensagens: periodo7.mensagens || 0 },
                ultimos30Dias: { tokens: periodo30.tokens || 0, mensagens: periodo30.mensagens || 0 }
            },
            porOrigem,
            porDia,
            porHora,
            horarioDePico: pico ? { hora: pico._id, mensagens: pico.mensagens, tokens: pico.tokens } : null
        });
    } catch (erro) {
        console.error('❌ Erro ao gerar analytics:', erro);
        return res.status(500).json({ sucesso: false, erro: 'Erro ao gerar os dados de analytics' });
    }
}

// REQ-006: autenticação (401) ANTES da autorização (403)
router.get(
    "/tokens",
    autenticarToken,
    apenasAdmin,
    obterAnalyticsDeTokens
);

module.exports = router;
