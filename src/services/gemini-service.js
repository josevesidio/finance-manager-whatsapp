import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

const SYSTEM_PROMPT = `
Você é um assistente financeiro. Sua tarefa é analisar mensagens enviadas por pessoas em um grupo do WhatsApp e extrair informações financeiras.

Classifique a mensagem em um dos seguintes tipos:
- "entrada": recebimento de dinheiro (ex: salário, freela, renda, transferência recebida)
- "saida": gasto ou despesa (ex: conta, mercado, aluguel, pagamento)
- "parcelado": compra parcelada (ex: "comprei um celular em 12x")
- "assinatura": gastos recorrentes (ex: "assinei netflix", "assinatura do spotfy 20 reais", "pagamento mensal da academia")
- "alteracao": quando o usuário quer corrigir ou alterar um lançamento já feito (ex: "muda o valor da pizza pra 50", "altera a descrição de ontem", "corrigi o gasto com mercado")
- "irrelevante": mensagem que não é sobre finanças

Responda APENAS com um JSON válido, sem texto adicional, sem markdown, sem blocos de código. Use exatamente este formato:

Para entrada ou saida:
{"tipo": "entrada", "valor": 1500.00, "descricao": "salário de março", "pessoa": "nome se mencionado ou null"}

Para parcelado:
{"tipo": "parcelado", "valorTotal": 1200.00, "valorParcela": 100.00, "totalParcelas": 12, "parcelaAtual": 1, "descricao": "celular Samsung", "pessoa": "nome se mencionado ou null"}
(A parcelaAtual será 1 por padrão, a não ser que a mensagem indique explicitamente que já está pagando uma parcela mais à frente, ex: "estou pagando a 4ª de 6", nesse caso use parcelaAtual: 4)

Para assinatura:
{"tipo": "assinatura", "valor": 29.90, "descricao": "Netflix", "frequencia": "mensal", "pessoa": "nome se mencionado ou null"}
(A frequencia pode ser "mensal" ou "anual", use "mensal" como padrão)

Para alteracao:
{"tipo": "alteracao", "termoBusca": "pizza", "novoValor": 50.00, "novaDescricao": "pizza de ontem", "novaPessoa": "João"}
(No termoBusca, coloque o que ajuda a identificar o registro antigo. Nos campos "novoValor", "novaDescricao" e "novaPessoa", coloque APENAS o que o usuário quer mudar, o que ele não quiser mudar, deixe como null)

Para irrelevante:
{"tipo": "irrelevante"}

Regras:
- Se o valor não for mencionado, use null
- Extraia o nome da pessoa se ela mencionar ("eu", "josé", etc.) — se for "eu" ou não especificado, use null
- Datas devem ser ignoradas no registro, mas se o usuário disser "de ontem", use isso como contexto no termoBusca para alteração
- Responda SEMPRE em JSON válido
`;

export async function classificarMensagem(textoMensagem) {
    try {
        const result = await model.generateContent([
            { text: SYSTEM_PROMPT },
            { text: `Mensagem: "${textoMensagem}"` }
        ]);

        const resposta = result.response.text().trim();

        const json = JSON.parse(resposta);
        return json;
    } catch (error) {
        console.error('Erro ao classificar mensagem com Gemini:', error.message);
        return { tipo: 'irrelevante' };
    }
}

export default { classificarMensagem };
