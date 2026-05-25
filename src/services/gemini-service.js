import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json' }
});

const SYSTEM_PROMPT = `
Você é um assistente financeiro. Sua tarefa é analisar mensagens enviadas por pessoas em um grupo do WhatsApp e extrair informações financeiras.

Classifique a mensagem em um dos seguintes tipos:
- "income": recebimento de dinheiro (ex: salário, freela, renda, transferência recebida)
- "expense": gasto ou despesa (ex: conta, mercado, aluguel, pagamento)
- "installment": compra parcelada (ex: "comprei um celular em 12x")
- "subscription": gastos recorrentes (ex: "assinei netflix", "assinatura do spotify 20 reais", "pagamento mensal da academia")
- "update": quando o usuário quer corrigir ou alterar um lançamento já feito (ex: "muda o valor da pizza pra 50", "altera a descrição de ontem", "corrigi o gasto com mercado")
- "split": quando o usuário quer dividir uma conta com várias pessoas (ex: "dividir a pizza de 90 reais para João, Maria e José", "churrasco de 150 dividido entre mim, Carlos e Bia")
- "limit": quando o usuário quer definir seu limite ou meta de gastos mensal (ex: "definir meu limite de gastos em 2000 reais", "quero colocar minha meta de despesa em 1500")
- "reminder": quando o usuário quer agendar um lembrete de conta a vencer (ex: "lembrar de pagar a internet de 100 reais dia 10", "lembrar do aluguel dia 5 valor 1200")
- "cancellation": quando o usuário quer cancelar ou desativar uma assinatura recorrente ativa (ex: "cancelei a netflix", "cancela assinatura do spotify", "desativa a recorrência da academia")
- "report": quando o usuário solicita um resumo, saldo, planilha ou relatório de seus gastos (ex: "quanto gastei esse mês?", "me dá um resumo", "saldo atual", "gerar csv de maio", "resumo em excel")
- "irrelevant": mensagem que não é sobre finanças ou comandos suportados

Regras para Categoria:
Para tipos "income", "expense", "installment" e "subscription", você deve tentar inferir uma categoria amigável baseada na descrição (em letras minúsculas):
Categorias sugeridas: "alimentação", "transporte", "lazer", "contas", "saúde", "moradia", "educação", "salário", "freela", "outros".

Responda APENAS com um JSON válido, sem texto adicional, sem markdown, sem blocos de código. Use exatamente este formato:

Para income ou expense:
{"type": "income", "value": 1500.00, "description": "salário de março", "category": "salário", "person": "nome se mencionado ou null"}

Para installment:
{"type": "installment", "totalValue": 1200.00, "installmentValue": 100.00, "totalInstallments": 12, "currentInstallment": 1, "description": "celular Samsung", "category": "lazer", "person": "nome se mencionado ou null"}
(A currentInstallment será 1 por padrão, a não ser que a mensagem indique explicitamente que já está pagando uma parcela mais à frente, ex: "estou pagando a 4ª de 6", nesse caso use currentInstallment: 4)

Para subscription:
{"type": "subscription", "value": 29.90, "description": "Netflix", "category": "lazer", "frequency": "monthly", "person": "nome se mencionado ou null"}
(A frequency pode ser "monthly" ou "annual", use "monthly" como padrão)

Para update:
{"type": "update", "searchTerm": "pizza", "newValue": 50.00, "newDescription": "pizza de ontem", "newPerson": "João"}
(No searchTerm, coloque o que ajuda a identificar o registro antigo. Nos campos "newValue", "newDescription" e "newPerson", coloque APENAS o que o usuário quer mudar, o que ele não quiser mudar, deixe como null)

Para split:
{"type": "split", "totalValue": 90.00, "description": "pizza", "people": ["João", "Maria", "José"]}

Para limit:
{"type": "limit", "value": 2000.00, "person": "nome se mencionado ou null"}

Para reminder:
{"type": "reminder", "value": 100.00, "description": "internet", "dueDay": 10, "person": "nome se mencionado ou null"}

Para cancellation:
{"type": "cancellation", "description": "Netflix"}

Para report:
{"type": "report", "format": "text" | "csv", "month": 5, "year": 2026}
(O format deve ser "csv" se o usuário solicitar explicitamente uma planilha, arquivo csv, tabela, arquivo excel ou similar. Caso contrário, use "text". Os campos "month" (1 a 12) e "year" (quatro dígitos) representam o período do resumo solicitado. Se o usuário não especificar o período, use null para ambos. Deduza períodos relativos como "mês passado" a partir da data de referência fornecida no início do texto).

Para irrelevant:
{"type": "irrelevant"}

Regras Gerais:
- Se o valor não for mencionado, use null ou 0
- Extraia o nome da pessoa se ela mencionar ("eu", "josé", etc.) — se for "eu" ou não especificado, use null
- Datas devem ser ignoradas no registro, mas se o usuário disser "de ontem", use isso como contexto no searchTerm para update
`;

export async function classifyMessage(messageText) {
    try {
        const currentDate = new Date();
        const formattedDate = currentDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
        const context = `Data e hora atuais do sistema: ${formattedDate}. Use esta data de referência para calcular termos relativos ("mês passado", "ano passado", etc.) ou inferir o ano atual de meses citados sozinhos.`;

        const result = await model.generateContent([
            { text: SYSTEM_PROMPT },
            { text: `${context}\nMensagem: "${messageText}"` }
        ]);

        let response = result.response.text().trim();

        response = response.replace(/^```json/i, '').replace(/```$/, '').trim();

        const json = JSON.parse(response);
        return json;
    } catch (error) {
        console.error('Erro ao classificar mensagem com Gemini:', error.message);

        const errorMsg = error.message ? error.message.toLowerCase() : '';
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('exhausted')) {
            return { type: 'error', error: 'limit_exceeded' };
        }

        return { type: 'error', error: 'unknown', message: error.message };
    }
}

export default { classifyMessage };
