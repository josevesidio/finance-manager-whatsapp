# finance-manager-whatsapp

Bot para WhatsApp que utiliza **Inteligência Artificial (Google Gemini)** para identificar automaticamente mensagens financeiras em grupos ou chats, classificando-as como entrada, saída ou compra parcelada — sem necessidade de comandos.

## Como funciona

Você e as pessoas do grupo simplesmente mandam mensagens naturais, como:

- _"recebi meu salário de 3000 reais"_ → ✅ Entrada registrada
- _"paguei o aluguel, 1500 reais"_ → ✅ Saída registrada
- _"comprei um celular em 12x de 150"_ → ✅ Compra parcelada registrada
- _"boa tarde!"_ → (ignorado, sem resposta)

O Gemini analisa a mensagem e extrai automaticamente o tipo, valor, descrição e número de parcelas quando aplicável.

## Como usar

1. Clone o projeto
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Copie o arquivo de exemplo e preencha as variáveis:
   ```bash
   cp .env.example .env
   ```
4. Execute o projeto:
   ```bash
   npm start
   ```
5. Escaneie o QR Code que aparecer no terminal com o WhatsApp
6. Pronto! O bot já está monitorando o(s) chat(s) configurado(s)

## Configurações

Configure o projeto através do arquivo `.env`:

| Variável | Descrição |
| --- | --- |
| `CHAT_MONITORIN` | IDs dos grupos e/ou chats monitorados, separados por vírgula. Deixe em branco para monitorar todos. |
| `GEMINI_API_KEY` | Chave de API do Google Gemini. Obtenha gratuitamente em [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). |

## Como obter o ID de um grupo do WhatsApp

O ID de um grupo segue o formato `XXXXXXXXXXX@g.us`. Você pode encontrá-lo habilitando o log de mensagens temporariamente — o bot imprime `message.from` no console a cada mensagem recebida.