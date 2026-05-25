import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    // model: 'gemini-2.5-flash',
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' }
});

const SYSTEM_PROMPT = `
Você é um assistente financeiro. Sua tarefa é analisar mensagens enviadas por pessoas em um grupo do WhatsApp e extrair informações financeiras.

Classifique a mensagem em um dos seguintes tipos:
- "entrada": recebimento de dinheiro (ex: salário, freela, renda, transferência recebida)
- "saida": gasto ou despesa (ex: conta, mercado, aluguel, pagamento)
- "parcelado": compra parcelada (ex: "comprei um celular em 12x")
- "assinatura": gastos recorrentes (ex: "assinei netflix", "assinatura do spotify 20 reais", "pagamento mensal da academia")
- "alteracao": quando o usuário quer corrigir ou alterar um lançamento já feito (ex: "muda o valor da pizza pra 50", "altera a descrição de ontem", "corrigi o gasto com mercado")
- "divisao": quando o usuário quer dividir uma conta com várias pessoas (ex: "dividir a pizza de 90 reais para João, Maria e José", "churrasco de 150 dividido entre mim, Carlos e Bia")
- "limite": quando o usuário quer definir seu limite ou meta de gastos mensal (ex: "definir meu limite de gastos em 2000 reais", "quero colocar minha meta de despesa em 1500")
- "lembrete": quando o usuário quer agendar um lembrete de conta a vencer (ex: "lembrar de pagar a internet de 100 reais dia 10", "lembrar do aluguel dia 5 valor 1200")
- "cancelamento": quando o usuário quer cancelar ou desativar uma assinatura recorrente ativa (ex: "cancelei a netflix", "cancela assinatura do spotify", "desativa a recorrência da academia")
- "relatorio": quando o usuário solicita um resumo, saldo, planilha ou relatório de seus gastos (ex: "quanto gastei esse mês?", "me dá um resumo", "saldo atual", "gerar csv de maio", "resumo em excel")
- "irrelevante": mensagem que não é sobre finanças ou comandos suportados

Regras para Categoria:
Para tipos "entrada", "saida", "parcelado" e "assinatura", você deve tentar inferir uma categoria amigável baseada na descrição (em letras minúsculas):
Categorias sugeridas: "alimentação", "transporte", "lazer", "contas", "saúde", "moradia", "educação", "salário", "freela", "outros".

Responda APENAS com um JSON válido, sem texto adicional, sem markdown, sem blocos de código. Use exatamente este formato:

Para entrada ou saida:
{"tipo": "entrada", "valor": 1500.00, "descricao": "salário de março", "categoria": "salário", "pessoa": "nome se mencionado ou null"}

Para parcelado:
{"tipo": "parcelado", "valorTotal": 1200.00, "valorParcela": 100.00, "totalParcelas": 12, "parcelaAtual": 1, "descricao": "celular Samsung", "categoria": "lazer", "pessoa": "nome se mencionado ou null"}
(A parcelaAtual será 1 por padrão, a não ser que a mensagem indique explicitamente que já está pagando uma parcela mais à frente, ex: "estou pagando a 4ª de 6", nesse caso use parcelaAtual: 4)

Para assinatura:
{"tipo": "assinatura", "valor": 29.90, "descricao": "Netflix", "categoria": "lazer", "frequencia": "mensal", "pessoa": "nome se mencionado ou null"}
(A frequencia pode ser "mensal" ou "anual", use "mensal" como padrão)

Para alteracao:
{"tipo": "alteracao", "termoBusca": "pizza", "novoValor": 50.00, "novaDescricao": "pizza de ontem", "novaPessoa": "João"}
(No termoBusca, coloque o que ajuda a identificar o registro antigo. Nos campos "novoValor", "novaDescricao" e "novaPessoa", coloque APENAS o que o usuário quer mudar, o que ele não quiser mudar, deixe como null)

Para divisao:
{"tipo": "divisao", "valorTotal": 90.00, "descricao": "pizza", "pessoas": ["João", "Maria", "José"]}

Para limite:
{"tipo": "limite", "valor": 2000.00, "pessoa": "nome se mencionado ou null"}

Para lembrete:
{"tipo": "lembrete", "valor": 100.00, "descricao": "internet", "diaVencimento": 10, "pessoa": "nome se mencionado ou null"}

Para cancelamento:
{"tipo": "cancelamento", "descricao": "Netflix"}

Para relatorio:
{"tipo": "relatorio", "formato": "texto" | "csv", "mes": 5, "ano": 2026}
(O formato deve ser "csv" se o usuário solicitar explicitamente uma planilha, arquivo csv, tabela, arquivo excel ou similar. Caso contrário, use "texto". Os campos "mes" (1 a 12) e "ano" (quatro dígitos) representam o período do resumo solicitado. Se o usuário não especificar o período, use null para ambos. Deduza períodos relativos como "mês passado" a partir da data de referência fornecida no início do texto).

Para irrelevante:
{"tipo": "irrelevante"}

Regras Gerais:
- Se o valor não for mencionado, use null ou 0
- Extraia o nome da pessoa se ela mencionar ("eu", "josé", etc.) — se for "eu" ou não especificado, use null
- Datas devem ser ignoradas no registro, mas se o usuário disser "de ontem", use isso como contexto no termoBusca para alteração
`;

export async function classificarMensagem(textoMensagem) {
    try {
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
        const context = `Data e hora atuais do sistema: ${dataFormatada}. Use esta data de referência para calcular termos relativos ("mês passado", "ano passado", etc.) ou inferir o ano atual de meses citados sozinhos.`;

        const result = await model.generateContent([
            { text: SYSTEM_PROMPT },
            { text: `${context}\nMensagem: "${textoMensagem}"` }
        ]);

        let resposta = result.response.text().trim();
        
        // Remove delimitadores de código markdown caso a IA os inclua
        resposta = resposta.replace(/^```json/i, '').replace(/```$/, '').trim();

        const json = JSON.parse(resposta);
        return json;
    } catch (error) {
        console.error('Erro ao classificar mensagem com Gemini:', error.message);
        
        const msgErro = error.message ? error.message.toLowerCase() : '';
        if (msgErro.includes('429') || msgErro.includes('quota') || msgErro.includes('limit') || msgErro.includes('exhausted')) {
            return { tipo: 'erro', erro: 'limite_excedido' };
        }
        
        return { tipo: 'erro', erro: 'desconhecido', mensagem: error.message };
    }
}

export default { classificarMensagem };
