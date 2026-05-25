import { classificarMensagem } from '../../services/gemini-service.js';
import { obterNomeUsuario, criarUsuario } from '../../services/user-service.js';
import { 
    registrarEntrada, 
    registrarSaida, 
    registrarParcelado, 
    buscarUltimosLancamentos, 
    atualizarLancamento, 
    registrarAssinatura,
    registrarDivisao,
    obterResumoMensal,
    obterTransacoesMensais,
    buscarAssinaturaAtivaPorDescricao,
    desativarAssinatura
} from '../../services/finance-service.js';
import { parsearMesAno } from '../../utils/date-utils.js';
import { gerarCsvTransacoes } from '../../utils/csv-helper.js';
import whatsapp from 'whatsapp-web.js';
const { MessageMedia } = whatsapp;
import { 
    criarLembrete, 
    listarLembretesAtivos, 
    marcarLembretePago 
} from '../../services/reminder-service.js';
import { User } from '../../model/user.js';
import { commandsHelp } from '../commands/help.js';

// Armazena os IDs que estão aguardando informar o nome
// Formato: { 'whatsappId': { mensagemOriginal: message.body } }
const aguardandoNome = new Map();

// Armazena as assinaturas duplicadas aguardando confirmação Sim/Não
const aguardandoConfirmacaoAssinatura = new Map();

// Armazena os IDs das mensagens enviadas pelo bot para ignorá-las
const mensagensDoBot = new Set();

// Função auxiliar para enviar mensagem e rastrear o ID
async function responderBot(message, texto) {
    const msgEnviada = await message.reply(texto);
    if (msgEnviada && msgEnviada.id) {
        mensagensDoBot.add(msgEnviada.id._serialized);
    }
}

// Formatação do resumo mensal em texto
async function formatarResumoMensal(nome, mes = null, ano = null) {
    const resumo = await obterResumoMensal(nome, mes, ano);
    
    const agora = new Date();
    const a = ano !== null ? parseInt(ano, 10) : agora.getFullYear();
    const m = mes !== null ? parseInt(mes, 10) - 1 : agora.getMonth();
    const dataRef = new Date(a, m, 1);
    const nomeMes = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const nomeMesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    let texto = `💰 *Resumo Financeiro - ${nomeMesCapitalizado}*\n👤 Usuário: *${nome}*\n\n`;
    texto += `🟢 *Entradas:* R$ ${resumo.entradas.toFixed(2)}\n`;
    texto += `🔴 *Saídas/Gastos:* R$ ${resumo.saidas.toFixed(2)}\n`;
    
    const saldoEmoji = resumo.saldo >= 0 ? '🔵' : '⚠️';
    texto += `${saldoEmoji} *Saldo:* R$ ${resumo.saldo.toFixed(2)}\n\n`;

    if (resumo.limiteGastos) {
        texto += `🎯 *Limite Mensal:* R$ ${resumo.limiteGastos.toFixed(2)}\n`;
        texto += `📊 *Uso do Limite:* ${resumo.porcentagemLimite}%\n`;
        if (resumo.porcentagemLimite >= 100) {
            texto += `🚨 *Atenção! Você ultrapassou o limite em R$ ${(resumo.saidas - resumo.limiteGastos).toFixed(2)}!*\n`;
        } else if (resumo.porcentagemLimite >= 80) {
            texto += `⚠️ *Aviso: Você está próximo de atingir seu limite de gastos.*\n`;
        }
        texto += `\n`;
    }

    texto += `🗂️ *Gastos por Categoria:*\n`;
    const cats = Object.keys(resumo.categorias);
    if (cats.length === 0) {
        texto += `_Nenhum gasto registrado ainda._`;
    } else {
        cats.forEach(c => {
            texto += `- *${c.charAt(0).toUpperCase() + c.slice(1)}*: R$ ${resumo.categorias[c].toFixed(2)}\n`;
        });
    }

    return texto;
}

// Formatação do relatório completo (resumo + transações)
async function formatarRelatorioCompleto(nome, mes = null, ano = null) {
    const resumoFormatado = await formatarResumoMensal(nome, mes, ano);
    
    // Busca lançamentos de todos os usuários do período desejado
    const meusLancamentos = await obterTransacoesMensais(mes, ano);

    const agora = new Date();
    const a = ano !== null ? parseInt(ano, 10) : agora.getFullYear();
    const m = mes !== null ? parseInt(mes, 10) - 1 : agora.getMonth();
    const dataRef = new Date(a, m, 1);
    const nomeMes = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const nomeMesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

    let texto = resumoFormatado + `\n📝 *Lançamentos de ${nomeMesCapitalizado}:*\n`;
    if (meusLancamentos.length === 0) {
        texto += `_Nenhum lançamento encontrado para este período._`;
    } else {
        // Mostra os lançamentos do mês em texto, limitando a 15 itens
        const limiteVisualizacao = meusLancamentos.slice(0, 15);
        limiteVisualizacao.forEach(l => {
            const dataStr = new Date(l.date).toLocaleDateString('pt-BR');
            const valor = l.type === 'parcelado' ? l.valuePerMonth : l.value;
            const sinal = l.type === 'entrada' ? '🟢 +' : '🔴 -';
            texto += `[${dataStr}] (${l.person || 'N/A'}) ${sinal} R$ ${valor.toFixed(2)} - ${l.description} (${l.category || 'outros'})\n`;
        });
        if (meusLancamentos.length > 15) {
            texto += `\n_... e mais ${meusLancamentos.length - 15} lançamentos. Para ver tudo, peça o resumo em CSV!_\n`;
        }
    }

    return texto;
}

// Formatação de lembretes ativos
async function formatarLembretes(nome) {
    const lembretes = await listarLembretesAtivos(nome);
    let texto = `📅 *Lembretes de Contas - ${nome}*\n\n`;
    if (lembretes.length === 0) {
        texto += `_Você não tem lembretes de contas ativos._`;
    } else {
        lembretes.forEach(l => {
            texto += `📌 *Dia ${l.dueDate}*: ${l.description} - R$ ${l.value.toFixed(2)} _(ID: ${l.id})_\n`;
        });
        texto += `\n_Para pagar uma conta, envie: *!pago [ID]*_`;
    }
    return texto;
}

export default {
    name: 'message_create',
    async execute(message) {
        // Filtra apenas os chats monitorados (se configurado no .env)
        if (process.env.CHAT_MONITORIN && !process.env.CHAT_MONITORIN.split(',').includes(message.to)) {
            return;
        }

        // Verifica de imediato e ignora se a mensagem contém emojis do bot
        // Evitando loops rápidos e economizando processamento de IA
        const botEmojis = ['✅', '❌', '👋', '💰', '🛒', '💸', '💳', '📆', '🟢', '🔴', '⚠️', '🚨', '📌'];
        if (message.fromMe && botEmojis.some(emoji => message.body.startsWith(emoji))) {
            return;
        }

        // Aguarda um pequeno delay para garantir sincronia do ID em mensagens do próprio bot
        await new Promise(resolve => setTimeout(resolve, 100));

        // Ignora mensagens enviadas pelo bot (rastreadas por ID)
        if (mensagensDoBot.has(message.id._serialized)) {
            mensagensDoBot.delete(message.id._serialized);
            return;
        }

        // Pega o ID de quem enviou (em grupos usa author, em chat privado usa from)
        const remetenteId = message.author || message.from;
        if (!remetenteId) return;

        // Se o usuário está respondendo com seu nome
        if (aguardandoNome.has(remetenteId)) {
            const nomeInformado = message.body.trim();

            if (nomeInformado.length < 2 || nomeInformado.length > 50) {
                await responderBot(message, '❌ Nome inválido. Por favor, envie um nome válido (entre 2 e 50 caracteres).');
                return;
            }

            await criarUsuario(remetenteId, nomeInformado);

            const dadosPendentes = aguardandoNome.get(remetenteId);
            aguardandoNome.delete(remetenteId);

            await responderBot(message, `✅ Prazer, *${nomeInformado}*! Seu nome foi salvo.\nAgora vou processar sua mensagem anterior...`);

            // Reprocessa a mensagem original que ficou pendente
            await processarMensagem(dadosPendentes.mensagemOriginal, remetenteId, nomeInformado, message);
            return;
        }

        // Tenta obter o nome do usuário
        const nome = await obterNomeUsuario(remetenteId);

        if (!nome) {
            // Não encontrou nome em nenhum lugar, pede ao usuário
            aguardandoNome.set(remetenteId, { mensagemOriginal: message.body });
            await responderBot(message, '👋 Olá! Eu sou o *Finance Manager*.\nPara começar, me diz qual é o seu nome?');
        }

        // Se o usuário está confirmando uma assinatura duplicada
        if (aguardandoConfirmacaoAssinatura.has(remetenteId)) {
            const resposta = message.body.trim().toLowerCase();
            const dadosPendentes = aguardandoConfirmacaoAssinatura.get(remetenteId);
            
            if (resposta === 'sim' || resposta === 's') {
                aguardandoConfirmacaoAssinatura.delete(remetenteId);
                const resultado = dadosPendentes.resultado;
                const cat = resultado.categoria || 'contas';
                
                try {
                    await registrarAssinatura(nome, resultado.valor, resultado.descricao, resultado.frequencia, cat);
                    const valorStr = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                    await responderBot(message, `✅ *Assinatura registrada com sucesso!*\n👤 Pessoa: ${nome}\n📝 Descrição: ${resultado.descricao}\n🗂️ Categoria: ${cat}\n💰 Valor: ${valorStr}\n📆 Recorrência: ${resultado.frequencia || 'mensal'}\n📌 Os lançamentos serão automáticos a partir de agora!`);
                } catch (error) {
                    console.error('Erro ao registrar assinatura confirmada:', error);
                    await responderBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
                }
            } else if (resposta === 'não' || resposta === 'nao' || resposta === 'n') {
                aguardandoConfirmacaoAssinatura.delete(remetenteId);
                await responderBot(message, '❌ *Cadastro de assinatura cancelado.*');
            } else {
                await responderBot(message, '❓ Resposta inválida. Por favor, responda apenas com *Sim* ou *Não* para confirmar a nova assinatura.');
            }
            return;
        }

        // --- INTERCEPTADOR DE COMANDOS DIRETOS (SEM IA) ---
        const textoMsg = message.body.trim();
        if (textoMsg.startsWith('!')) {
            const args = textoMsg.slice(1).trim().split(/ +/);
            const comando = args.shift().toLowerCase();

            if (comando === 'commands' || comando === 'ajuda') {
                const ajuda = commandsHelp(message);
                await responderBot(message, ajuda);
                return;
            }
            
            if (comando === 'ping') {
                await responderBot(message, '✅ Pong! O bot está ativo e respondendo.');
                return;
            }

            if (comando === 'resumo' || comando === 'gastos') {
                const textoArg = args.join(' ');
                const { mes, ano } = parsearMesAno(textoArg);
                const resumo = await formatarResumoMensal(nome, mes, ano);
                await responderBot(message, resumo);
                return;
            }

            if (comando === 'relatorio') {
                const textoArg = args.join(' ');
                const { mes, ano } = parsearMesAno(textoArg);
                const relatorio = await formatarRelatorioCompleto(nome, mes, ano);
                await responderBot(message, relatorio);
                return;
            }

            if (comando === 'csv') {
                const textoArg = args.join(' ');
                const { mes, ano } = parsearMesAno(textoArg);
                
                try {
                    const transacoes = await obterTransacoesMensais(mes, ano);
                    if (transacoes.length === 0) {
                        const dataRef = new Date(ano, mes - 1, 1);
                        const nomeMes = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                        await responderBot(message, `🗂️ Não foram encontrados lançamentos para o período de *${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}*.`);
                        return;
                    }

                    const csvString = gerarCsvTransacoes(transacoes, nome, mes, ano);
                    const base64Data = Buffer.from(csvString, 'utf-8').toString('base64');
                    
                    const dataRef = new Date(ano, mes - 1, 1);
                    const nomeMes = dataRef.toLocaleDateString('pt-BR', { month: 'long' });
                    const filename = `resumo_${nomeMes.toLowerCase()}_${ano}.csv`;
                    
                    const media = new MessageMedia('text/csv', base64Data, filename);
                    await message.reply(media);
                } catch (err) {
                    console.error('Erro ao gerar CSV por comando:', err);
                    await responderBot(message, '❌ Ocorreu um erro ao gerar o arquivo CSV.');
                }
                return;
            }

            if (comando === 'limite') {
                const valorLimite = parseFloat(args[0]);
                if (isNaN(valorLimite) || valorLimite < 0) {
                    await responderBot(message, '❌ Uso correto: *!limite [valor]*\nExemplo: `!limite 1500`');
                    return;
                }
                const usuario = await User.findOne({ where: { whatsappId: remetenteId } });
                if (usuario) {
                    usuario.limiteGastos = valorLimite;
                    await usuario.save();
                    await responderBot(message, `✅ *Limite de gastos mensal configurado:* R$ ${valorLimite.toFixed(2)}`);
                } else {
                    await responderBot(message, '❌ Usuário não encontrado no sistema.');
                }
                return;
            }

            if (comando === 'lembretes') {
                const lembretes = await formatarLembretes(nome);
                await responderBot(message, lembretes);
                return;
            }

            if (comando === 'pago') {
                const idLembrete = parseInt(args[0]);
                if (isNaN(idLembrete)) {
                    await responderBot(message, '❌ Uso correto: *!pago [ID_DO_LEMBRETE]*\nUse `!lembretes` para ver os IDs.');
                    return;
                }
                try {
                    const lembrete = await marcarLembretePago(idLembrete);
                    
                    // Transforma em lançamento real de saída
                    await registrarSaida(nome, lembrete.value, `[PAGO] ${lembrete.description}`, 'contas');
                    
                    await responderBot(message, `✅ *Lembrete pago com sucesso!*\nA conta "${lembrete.description}" de R$ ${lembrete.value.toFixed(2)} foi marcada como paga e registrada em seus gastos.`);
                } catch (err) {
                    await responderBot(message, `❌ Erro ao pagar lembrete: ${err.message}`);
                }
                return;
            }
        }

        // Se não for comando direto, processa linguagem natural via Gemini
        await processarMensagem(message.body, remetenteId, nome, message);
    }
};

async function processarMensagem(textoMensagem, remetenteId, nome, message) {
    const resultado = await classificarMensagem(textoMensagem);

    console.log('Classificação do Gemini:', resultado);

    if (resultado.tipo === 'erro') {
        if (resultado.erro === 'limite_excedido') {
            await responderBot(message, '⚠️ *Limite de IA Atingido!*\n\nO limite de requisições do Gemini foi excedido temporariamente (cota diária ou por minuto). Por favor, tente novamente em alguns instantes ou use os comandos diretos (ex: `!resumo`, `!csv`, `!ajuda`).');
        } else {
            console.error('Erro desconhecido na classificação da IA:', resultado.mensagem);
        }
        return;
    }

    if (resultado.tipo === 'irrelevante') {
        return;
    }

    let confirmacao = '';

    try {
        if (resultado.tipo === 'entrada') {
            const cat = resultado.categoria || 'outros';
            await registrarEntrada(nome, resultado.valor, resultado.descricao, cat);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Entrada registrada!*\n👤 Pessoa: ${nome}\n💰 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}`;
        }
        else if (resultado.tipo === 'saida') {
            const cat = resultado.categoria || 'outros';
            await registrarSaida(nome, resultado.valor, resultado.descricao, cat);
            const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'valor não identificado';
            confirmacao = `✅ *Saída registrada!*\n👤 Pessoa: ${nome}\n💸 Valor: ${valor}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}`;
            
            // Alerta de limite
            const limiteAviso = await checarAlertaLimite(nome);
            if (limiteAviso) confirmacao += `\n\n${limiteAviso}`;
        }
        else if (resultado.tipo === 'parcelado') {
            const cat = resultado.categoria || 'outros';
            await registrarParcelado(nome, resultado.valorTotal, resultado.valorParcela, resultado.totalParcelas, resultado.descricao, resultado.parcelaAtual, cat);
            const valorTotal = resultado.valorTotal ? `R$ ${resultado.valorTotal.toFixed(2)}` : 'não informado';
            const valorParcela = resultado.valorParcela ? `R$ ${resultado.valorParcela.toFixed(2)}` : 'não informado';
            confirmacao = `✅ *Compra parcelada registrada!*\n👤 Pessoa: ${nome}\n🛒 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}\n💳 Total: ${valorTotal}\n📆 Parcelas: ${resultado.totalParcelas}x de ${valorParcela}\n📌 Começando na: ${resultado.parcelaAtual || 1}ª parcela`;
            
            // Alerta de limite
            const limiteAviso = await checarAlertaLimite(nome);
            if (limiteAviso) confirmacao += `\n\n${limiteAviso}`;
        }
        else if (resultado.tipo === 'alteracao') {
            const lancamentos = await buscarUltimosLancamentos(resultado.termoBusca, 5, true);

            if (lancamentos.length === 0) {
                confirmacao = `❌ Não encontrei nenhum lançamento recente com "${resultado.termoBusca}" para alterar.`;
            } else {
                const last = lancamentos[0];
                const novosDados = {};
                if (resultado.novoValor !== null) novosDados.value = resultado.novoValor;
                if (resultado.novaDescricao !== null) novosDados.description = resultado.novaDescricao;
                if (resultado.novaPessoa !== null) novosDados.person = resultado.novaPessoa;

                if (Object.keys(novosDados).length === 0) {
                    confirmacao = `❓ Não identifiquei o que você quer alterar no lançamento: "${last.description}".`;
                } else {
                    await atualizarLancamento(last.id, novosDados);
                    let prefixo = last.type === 'assinatura' ? '📌 *Assinatura alterada!*' : '✅ *Lançamento alterado!*';
                    confirmacao = `${prefixo}\n\n*De:* ${last.description} (R$ ${last.value.toFixed(2)})\n*Para:* ${novosDados.description || last.description} (R$ ${(novosDados.value || last.value).toFixed(2)})`;

                    if (last.type === 'assinatura') {
                        confirmacao += `\n\n_Note: Mudanças em assinaturas afetam apenas os próximos lançamentos automáticos._`;
                    }
                }
            }
        }
        else if (resultado.tipo === 'assinatura') {
            const assinaturaExistente = await buscarAssinaturaAtivaPorDescricao(nome, resultado.descricao);
            
            if (assinaturaExistente) {
                // Guarda no Map para aguardar confirmação sim/não
                aguardandoConfirmacaoAssinatura.set(remetenteId, { resultado, nome });
                
                const valorExistente = assinaturaExistente.value ? `R$ ${assinaturaExistente.value.toFixed(2)}` : 'não informado';
                const valorNovo = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                
                confirmacao = `⚠️ *Assinatura Duplicada Detectada!*\n\nVocê já possui uma assinatura ativa de *"${assinaturaExistente.description}"* no valor de *${valorExistente}*.\n\nTem certeza que deseja adicionar uma nova assinatura de *"${resultado.descricao}"* por *${valorNovo}*?\n\nResponda apenas com *Sim* ou *Não*.`;
            } else {
                const cat = resultado.categoria || 'contas';
                await registrarAssinatura(nome, resultado.valor, resultado.descricao, resultado.frequencia, cat);
                const valor = resultado.valor ? `R$ ${resultado.valor.toFixed(2)}` : 'não informado';
                confirmacao = `✅ *Assinatura registrada!*\n👤 Pessoa: ${nome}\n📝 Descrição: ${resultado.descricao || 'não informada'}\n🗂️ Categoria: ${cat}\n💰 Valor: ${valor}\n📆 Recorrência: ${resultado.frequencia || 'mensal'}\n📌 Os lançamentos serão automáticos a partir de agora!`;
            }
        }
        else if (resultado.tipo === 'cancelamento') {
            const assinaturaCancelada = await desativarAssinatura(nome, resultado.descricao);
            
            if (assinaturaCancelada) {
                confirmacao = `✅ *Assinatura cancelada com sucesso!*\n\nA recorrência de *"${assinaturaCancelada.description}"* foi desativada e não gerará novos lançamentos automáticos.`;
            } else {
                confirmacao = `❌ Não encontrei nenhuma assinatura ativa de *"${resultado.descricao}"* para cancelar.`;
            }
        }
        else if (resultado.tipo === 'divisao') {
            const cat = resultado.categoria || 'lazer';
            const pessoas = resultado.pessoas || [];
            
            await registrarDivisao(nome, resultado.valorTotal, resultado.descricao, pessoas, cat);
            const valorIndividual = (resultado.valorTotal / pessoas.length).toFixed(2);
            confirmacao = `✅ *Divisão de despesa registrada!*\n👤 Solicitante: ${nome}\n🛒 Descrição: ${resultado.descricao || 'não informada'}\n💰 Total: R$ ${resultado.valorTotal.toFixed(2)}\n👥 Divisão entre: ${pessoas.join(', ')}\n💸 Valor para cada: R$ ${valorIndividual}`;
        }
        else if (resultado.tipo === 'limite') {
            const usuario = await User.findOne({ where: { whatsappId: remetenteId } });
            if (usuario) {
                usuario.limiteGastos = resultado.valor;
                await usuario.save();
                confirmacao = `✅ *Limite de gastos mensal configurado:* R$ ${resultado.valor.toFixed(2)}`;
            } else {
                confirmacao = `❌ Usuário não encontrado no sistema.`;
            }
        }
        else if (resultado.tipo === 'lembrete') {
            await criarLembrete(nome, resultado.valor, resultado.descricao, resultado.diaVencimento);
            confirmacao = `✅ *Lembrete agendado com sucesso!*\n👤 Pessoa: ${nome}\n📝 Conta: ${resultado.descricao}\n💰 Valor: R$ ${resultado.valor.toFixed(2)}\n📆 Vencimento: Todo dia ${resultado.diaVencimento}\n📌 Eu avisarei no chat na manhã do vencimento.`;
        }
        else if (resultado.tipo === 'relatorio') {
            const mes = resultado.mes;
            const ano = resultado.ano;
            
            if (resultado.formato === 'csv') {
                // Fluxo de geração e envio de arquivo CSV
                const periodo = parsearMesAno(mes && ano ? `${mes}/${ano}` : (mes ? `${mes}` : null));
                const transacoes = await obterTransacoesMensais(periodo.mes, periodo.ano);
                
                const dataRef = new Date(periodo.ano, periodo.mes - 1, 1);
                const nomeMes = dataRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                const nomeMesCapitalizado = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
                
                if (transacoes.length === 0) {
                    confirmacao = `🗂️ Não foram encontrados lançamentos para o período de *${nomeMesCapitalizado}* para gerar o CSV.`;
                } else {
                    try {
                        const csvString = gerarCsvTransacoes(transacoes, nome, periodo.mes, periodo.ano);
                        const base64Data = Buffer.from(csvString, 'utf-8').toString('base64');
                        const filename = `resumo_${dataRef.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase()}_${periodo.ano}.csv`;
                        
                        const media = new MessageMedia('text/csv', base64Data, filename);
                        await message.reply(media);
                        confirmacao = `📊 Aqui está o seu relatório em CSV referente a *${nomeMesCapitalizado}*!`;
                    } catch (csvErr) {
                        console.error('Erro ao gerar CSV via IA:', csvErr);
                        confirmacao = '❌ Desculpe, ocorreu um erro técnico ao gerar o seu arquivo CSV.';
                    }
                }
            } else {
                // Fluxo de texto normal
                const periodo = parsearMesAno(mes && ano ? `${mes}/${ano}` : (mes ? `${mes}` : null));
                confirmacao = await formatarRelatorioCompleto(nome, periodo.mes, periodo.ano);
            }
        }

        await responderBot(message, confirmacao);
    } catch (error) {
        console.error('Erro ao registrar no banco de dados:', error);
        await responderBot(message, '❌ Ocorreu um erro ao salvar o registro no banco de dados.');
    }
}

// Verifica se o usuário excedeu metas de limite de despesas
async function checarAlertaLimite(nome) {
    const resumo = await obterResumoMensal(nome);
    if (!resumo.limiteGastos) return null;
    
    if (resumo.porcentagemLimite >= 100) {
        return `🚨 *ALERTA:* Você ultrapassou 100% do seu limite de gastos mensal! (Gasto: R$ ${resumo.saidas.toFixed(2)} de R$ ${resumo.limiteGastos.toFixed(2)})`;
    }
    if (resumo.porcentagemLimite >= 80) {
        return `⚠️ *AVISO:* Você atingiu ${resumo.porcentagemLimite}% do seu limite de gastos mensal! (Gasto: R$ ${resumo.saidas.toFixed(2)} de R$ ${resumo.limiteGastos.toFixed(2)})`;
    }
    return null;
}