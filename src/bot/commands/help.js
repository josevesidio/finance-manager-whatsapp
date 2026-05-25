export function commandsHelp(message) {
    return '📋 *Comandos do Finance Manager*:\n\n' +
        '👉 *!commands* ou *!ajuda* - Mostra esta mensagem de ajuda\n' + 
        '👉 *!ping* - Testa a conexão do bot\n' +
        '👉 *!resumo* ou *!gastos* - Resumo financeiro rápido do mês atual\n' +
        '👉 *!relatorio* - Relatório completo com resumo e as últimas transações do mês\n' +
        '👉 *!limite [valor]* - Define o seu limite/meta de gastos mensal (Ex: `!limite 1500`)\n' +
        '👉 *!lembretes* - Lista todas as suas contas cadastradas pendentes de pagamento\n' +
        '👉 *!pago [ID]* - Marca um lembrete como pago e registra o gasto (Ex: `!pago 2`)\n\n' +
        '💡 *Dica:* Você também pode simplesmente conversar comigo por texto naturalmente! Experimente dizer:\n' +
        '- _"quanto eu gastei esse mês?"_\n' +
        '- _"lembrar de pagar boleto de 100 reais dia 15"_\n' +
        '- _"dividir churrasco de 150 reais para Carlos, Ana e eu"_\n' +
        '- _"gastei 50 reais com alimentação na pizzaria"_';
}

export default { commandsHelp };
