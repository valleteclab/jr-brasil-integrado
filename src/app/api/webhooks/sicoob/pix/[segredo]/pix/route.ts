/**
 * O padrão BACEN entrega os callbacks de Pix recebido em `{webhookUrl}/pix` — este alias aponta
 * para o mesmo handler da rota pai (/api/webhooks/sicoob/pix/[segredo]).
 */
export { POST, GET } from "../route";
