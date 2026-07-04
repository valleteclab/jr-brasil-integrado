/**
 * Conteúdo do manual público do XERP. Estruturado como capítulos → seções → blocos, para o
 * ManualView renderizar com índice, busca e scrollspy. Linguagem de usuário (não técnica).
 */

export type Passo = { titulo?: string; texto: string };
export type Bloco =
  | { tipo: "passos"; itens: Passo[] }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "tags"; itens: string[] }
  | { tipo: "dica"; texto: string }
  | { tipo: "aviso"; texto: string }
  | { tipo: "info"; texto: string };

export type Secao = { id: string; icone: string; titulo: string; resumo: string; blocos: Bloco[] };
export type Capitulo = { id: string; titulo: string; secoes: Secao[] };

export const CAPITULOS: Capitulo[] = [
  {
    id: "comecando",
    titulo: "Começando",
    secoes: [
      {
        id: "primeiros-passos",
        icone: "🚀",
        titulo: "Primeiros passos",
        resumo: "A ordem recomendada para deixar o sistema pronto para o dia a dia.",
        blocos: [
          { tipo: "paragrafo", texto: "Antes de vender ou emitir nota, vale configurar a base uma única vez. Siga esta sequência:" },
          {
            tipo: "passos",
            itens: [
              { titulo: "Dados da empresa", texto: "Configurações → Dados da empresa. Digite o CNPJ e clique “Buscar no CNPJ” para preencher razão social, endereço e inscrições automaticamente." },
              { titulo: "Emissão fiscal", texto: "Configurações → Emissão fiscal → “Abrir onboarding fiscal”. O assistente em 4 passos define regime, ambiente e séries, e gera a base de impostos." },
              { titulo: "Certificado A1", texto: "Envie o certificado digital A1 (.pfx) da empresa e a senha. É ele que autentica a emissão junto à SEFAZ." },
              { titulo: "Contas financeiras", texto: "Configurações → Contas financeiras. Cadastre o caixa, as contas bancárias e os cartões de onde entra/sai dinheiro." },
              { titulo: "Formas de pagamento", texto: "Cadastre as formas que você aceita (dinheiro, Pix, cartão, boleto) e ligue cada uma à sua conta." },
              { titulo: "Equipe", texto: "Configurações → Colaboradores. Crie perfis de acesso e convide sua equipe (cada um recebe login e senha inicial)." },
              { titulo: "Produtos e clientes", texto: "Cadastre seus produtos (com preço e classificação fiscal) e seus clientes. Pronto para vender." },
            ],
          },
          { tipo: "dica", texto: "Use o botão “Testar conexão” na configuração fiscal para confirmar que o certificado e o provedor estão funcionando antes da primeira nota." },
        ],
      },
      {
        id: "acesso-login",
        icone: "🔐",
        titulo: "Acesso e segurança",
        resumo: "Como entrar no sistema, verificação em 2 etapas e troca de senha.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Entrar", texto: "Acesse a tela de login, informe e-mail e senha. Você é levado ao painel conforme seu perfil." },
              { titulo: "Verificação em 2 etapas (se ativada)", texto: "A empresa pode exigir um código de 6 dígitos enviado ao seu WhatsApp. Digite o código para concluir o acesso." },
              { titulo: "Trocar a senha", texto: "Minha conta → Segurança. Informe a senha atual e a nova (mínimo 8 caracteres). As outras sessões são encerradas por segurança." },
            ],
          },
          { tipo: "aviso", texto: "Após 5 tentativas de senha erradas o acesso fica bloqueado por 15 minutos. Se ativar a verificação em 2 etapas, garanta que todos os usuários tenham o WhatsApp cadastrado." },
        ],
      },
    ],
  },

  {
    id: "cadastros",
    titulo: "Cadastros",
    secoes: [
      {
        id: "produtos",
        icone: "📦",
        titulo: "Cadastrar produtos",
        resumo: "Nome, preço, classificação fiscal (NCM) e controle de estoque — com ajuda automática.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo produto", texto: "Produtos → “+ Novo”. Na aba Geral, informe nome, unidade e tipo (peça, serviço, kit ou insumo). O código (SKU) é gerado automaticamente se deixar em branco." },
              { titulo: "Código de barras", texto: "Digite o código de barras e clique “Buscar” para preencher nome, NCM e imagem a partir do catálogo online." },
              { titulo: "Fiscal", texto: "Na aba Fiscal, informe o NCM (a IA pode sugerir pelo nome), origem e a regra de tributação (CST/CSOSN). Os CFOPs são derivados automaticamente." },
              { titulo: "Preços", texto: "Na aba Preços, informe o custo e a margem; o preço à vista e a prazo são calculados — ou digite direto." },
              { titulo: "Estoque", texto: "Na aba Estoque, defina depósito, estoque inicial, mínimo (alerta) e máximo." },
              { titulo: "Compras (embalagem)", texto: "Se você compra em caixa/fardo e vende na unidade, informe a unidade de compra e o fator de conversão (ex.: 1 CX = 12 UN)." },
            ],
          },
          { tipo: "dica", texto: "Use “Sugerir fiscal com IA” para classificar o NCM e a categoria a partir do nome do produto quando estiver em dúvida." },
        ],
      },
      {
        id: "clientes",
        icone: "🧑‍💼",
        titulo: "Cadastrar clientes",
        resumo: "Dados, contatos, endereços e informações comerciais (crédito e condição de pagamento).",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo cliente", texto: "Clientes → “+ Novo”, ou crie na hora durante a venda pelo botão “+ Novo cliente”." },
              { titulo: "Documento", texto: "Escolha PF ou PJ e digite o CPF/CNPJ — o sistema busca automaticamente razão social e endereço em bases públicas." },
              { titulo: "Contatos e endereços", texto: "Adicione e-mail, telefone e WhatsApp, e um ou mais endereços (marque o padrão)." },
              { titulo: "Comercial", texto: "Defina status, limite de crédito e condição de pagamento para vendas a prazo." },
            ],
          },
        ],
      },
      {
        id: "fornecedores",
        icone: "🏭",
        titulo: "Cadastrar fornecedores",
        resumo: "Base para compras e entrada de notas.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo fornecedor", texto: "Fornecedores → “+ Novo fornecedor”. Informe o CNPJ (busca automática dos dados), contato, cidade/UF e condição de pagamento." },
              { titulo: "Editar", texto: "Clique no fornecedor para editar. Use “Inativar” em vez de excluir — o histórico é preservado." },
            ],
          },
        ],
      },
      {
        id: "tecnicos",
        icone: "👨‍🔧",
        titulo: "Cadastrar técnicos (oficina)",
        resumo: "Quem executa as ordens de serviço e usa o sistema para registrar o que foi feito.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo técnico", texto: "Técnicos → “+ Novo técnico”. Informe nome, especialidade, telefone e custo/hora (opcional)." },
              { titulo: "Vincular login", texto: "Ligue o técnico a um usuário do sistema. Assim ele acessa suas OS e, ao registrar o que fez, já aparece como responsável automaticamente." },
            ],
          },
          { tipo: "info", texto: "Para vincular um login, primeiro convide a pessoa em Configurações → Colaboradores; depois selecione esse usuário no cadastro do técnico." },
        ],
      },
    ],
  },

  {
    id: "vender",
    titulo: "Vender",
    secoes: [
      {
        id: "atendimento",
        icone: "🧾",
        titulo: "Atendimento (venda, pedido, orçamento)",
        resumo: "Um único lugar para iniciar venda de balcão, pedido faturado, orçamento ou ordem de serviço.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Escolha o tipo", texto: "Atendimento → escolha a aba: 🛒 Venda balcão, 📦 Pedido faturado, 📄 Orçamento ou 🔧 Ordem de Serviço." },
              { titulo: "Cliente", texto: "Selecione o cliente (ou “Consumidor final” na venda balcão). Pode criar um novo na hora." },
              { titulo: "Itens", texto: "Adicione os produtos buscando por código, nome ou marca; ajuste quantidade e preço. Aplique desconto por item ou global." },
              { titulo: "Pagamento", texto: "Escolha a forma de pagamento. Em boleto, defina banco, parcelas e vencimentos." },
              { titulo: "Finalizar", texto: "Venda balcão: “Enviar para caixa” (cobrar no caixa) ou “Finalizar + NFC-e/NF-e” (emite na hora). Pedido: “Confirmar pedido”. Orçamento: “Enviar”." },
            ],
          },
          { tipo: "dica", texto: "Descontos acima do limite pedem a senha de um administrador — a autorização vale para aquela venda." },
        ],
      },
      {
        id: "pdv",
        icone: "🛒",
        titulo: "PDV e Caixa",
        resumo: "Abrir o caixa, receber pagamentos (dinheiro, Pix, cartão, boleto) e fechar o turno.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Abrir o caixa", texto: "Caixa → “Abrir caixa”. Informe o operador e o fundo de troco inicial." },
              { titulo: "Buscar a venda", texto: "Selecione a pré-venda pelo número ou cliente. Os itens e o total aparecem na tela." },
              { titulo: "Receber", texto: "Adicione um ou mais pagamentos: dinheiro fica no caixa; Pix/transferência caem na conta escolhida; cartão pede a maquininha e parcelas; boleto gera as parcelas." },
              { titulo: "Finalizar", texto: "Escolha o documento (NFC-e, NF-e ou recibo) e clique “Finalizar venda”. A nota é emitida, o estoque baixa e os recebíveis são criados." },
              { titulo: "Sangria e suprimento", texto: "Use “Sangria” para retirar dinheiro e “Suprimento” para colocar — tudo entra no fechamento." },
              { titulo: "Fechar o caixa", texto: "“Fechar caixa”: o sistema mostra o esperado em dinheiro; conte o físico e informe. Diferenças acima da tolerância são registradas." },
            ],
          },
          { tipo: "aviso", texto: "Confira se a soma dos pagamentos bate com o total da venda antes de finalizar. O QR Code Pix tem validade (por padrão 60 minutos)." },
        ],
      },
      {
        id: "orcamentos",
        icone: "📄",
        titulo: "Orçamentos",
        resumo: "Criar cotação, enviar ao cliente e converter em pedido quando aprovado.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Criar", texto: "Orçamentos → “Novo orçamento”. Selecione o cliente, adicione os itens e defina a validade (em dias)." },
              { titulo: "Enviar", texto: "Use “Enviar” para mandar por e-mail/WhatsApp, ou “Imprimir/PDF”. O orçamento não baixa estoque." },
              { titulo: "Converter", texto: "Quando o cliente aprovar, abra o orçamento e clique “Converter” — vira um pedido de venda com os mesmos itens (aí sim reserva estoque)." },
            ],
          },
        ],
      },
      {
        id: "expedicao",
        icone: "📦",
        titulo: "Expedição (retirada no balcão)",
        resumo: "Conferir e entregar a mercadoria pelo código do recibo de retirada.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Buscar o recibo", texto: "Expedição → informe seu nome (conferente) e digite/escaneie o código do recibo que o cliente trouxe." },
              { titulo: "Conferir", texto: "O sistema mostra os itens e quanto falta entregar. Confira fisicamente cada um." },
              { titulo: "Entregar", texto: "Confirme a entrega completa (pedido vai para ENTREGUE) ou parcial (o restante fica pendente). Fica registrado quem entregou e quando." },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "notas",
    titulo: "Notas fiscais",
    secoes: [
      {
        id: "nfe",
        icone: "🧾",
        titulo: "Emitir nota (NF-e, NFC-e, NFS-e)",
        resumo: "Emissão avulsa e o que cada modelo significa.",
        blocos: [
          { tipo: "paragrafo", texto: "Muitas notas saem sozinhas ao finalizar uma venda ou faturar uma OS. Para emitir avulsa:" },
          {
            tipo: "passos",
            itens: [
              { titulo: "Nova nota", texto: "Documentos fiscais → “+ Emitir nota”. Escolha o modelo: NF-e (produto, modelo 55), NFC-e (cupom do consumidor, modelo 65) ou NFS-e (serviço)." },
              { titulo: "Finalidade", texto: "Normal, Complementar, Ajuste ou Devolução (a devolução referencia a nota original pela chave de acesso)." },
              { titulo: "Dados", texto: "Selecione o cliente e liste os itens (o sistema sugere CFOP e calcula os impostos pela regra tributária)." },
              { titulo: "Conferir e emitir", texto: "Abra o Espelho Fiscal para revisar os impostos e confirme. A nota fica “Processando” até a SEFAZ autorizar." },
              { titulo: "Depois de autorizada", texto: "Baixe o PDF (DANFE) e o XML, envie ao cliente, ou use Clonar / Devolução / Cancelar / Carta de correção." },
            ],
          },
          { tipo: "aviso", texto: "Se a nota ficar em ERRO, verifique a validade do certificado A1 e o CFOP/NCM do item. Corrija e reemita sem refazer tudo." },
        ],
      },
      {
        id: "entradas-fiscais",
        icone: "📥",
        titulo: "Entrada de notas (compras recebidas)",
        resumo: "Importar a NF-e do fornecedor por XML, dar entrada no estoque e no financeiro.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Nova entrada", texto: "Notas de Entrada → “+ Nova entrada”. Selecione o fornecedor e cole/anexe o XML da NF-e recebida." },
              { titulo: "Itens", texto: "O sistema casa cada item do XML com o seu produto (por código ou NCM), define a finalidade (revenda, uso, imobilizado…) e aplica o fator de conversão da embalagem." },
              { titulo: "Pagamento", texto: "Informe as parcelas (forma, vencimento e valor) — viram contas a pagar." },
              { titulo: "Processar", texto: "Revise a conferência (itens, impostos, estoque) e clique “Processar”: o estoque entra e os créditos de imposto são registrados." },
            ],
          },
          { tipo: "info", texto: "As NF-e emitidas contra o seu CNPJ chegam automaticamente pela distribuição da SEFAZ — você só confere e processa." },
        ],
      },
      {
        id: "nfse-recebidas",
        icone: "🧾",
        titulo: "NFS-e recebidas (serviços tomados)",
        resumo: "Notas de serviço que você recebeu, lançadas como despesa.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Consultar", texto: "NFS-e recebidas → veja as notas sincronizadas do Ambiente Nacional, com prestador, valor e retenções." },
              { titulo: "Lançar como despesa", texto: "Abra a nota e clique “Lançar como despesa” — vincula ao fornecedor e cria o lançamento financeiro com a finalidade/classificação." },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "estoque-compras",
    titulo: "Estoque e Compras",
    secoes: [
      {
        id: "estoque",
        icone: "📊",
        titulo: "Controle de estoque",
        resumo: "Consultar saldos, ajustar e transferir entre depósitos.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Saldos", texto: "Estoque → aba Saldos. Veja o status de cada item (em estoque, crítico, zerado) e busque por SKU/nome." },
              { titulo: "Ajustar", texto: "“Ajustar estoque”: escolha o produto e o depósito, informe a nova quantidade e o motivo. Fica registrado como ajuste." },
              { titulo: "Transferir", texto: "“Transferir”: mova quantidade de um depósito para outro (origem e destino diferentes)." },
              { titulo: "Movimentos", texto: "A aba Movimentos mostra o histórico (entradas, saídas, transferências, ajustes) com o documento vinculado." },
            ],
          },
        ],
      },
      {
        id: "inventario",
        icone: "🔢",
        titulo: "Inventário (contagem física)",
        resumo: "Contar o estoque real e ajustar as divergências de uma vez.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Criar", texto: "Estoque → “Novo inventário”. Escolha o depósito — abre a tela de contagem." },
              { titulo: "Contar", texto: "Para cada item, digite a quantidade contada. O sistema mostra a divergência em relação ao saldo do sistema." },
              { titulo: "Finalizar", texto: "“Finalizar inventário”: o sistema cria os ajustes para todas as divergências. Para desistir, use “Cancelar” (nenhum ajuste é aplicado)." },
            ],
          },
          { tipo: "aviso", texto: "Confira as divergências antes de finalizar — os ajustes de estoque são aplicados de uma vez." },
        ],
      },
      {
        id: "compras",
        icone: "🛍️",
        titulo: "Pedido de compra",
        resumo: "Comprar do fornecedor e receber a mercadoria no estoque.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo pedido", texto: "Compras → “Novo pedido”. Escolha o fornecedor e a condição de pagamento." },
              { titulo: "Itens", texto: "Adicione os produtos na unidade de compra (ex.: caixa). O sistema mostra a conversão para a unidade de venda (ex.: 1 CX = 12 UN)." },
              { titulo: "Enviar", texto: "Salve como rascunho e depois “Enviar” quando o pedido for confirmado com o fornecedor." },
              { titulo: "Receber", texto: "Quando a mercadoria chegar, use “Receber” e informe a quantidade recebida — o estoque entra convertido para a unidade de venda." },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "oficina",
    titulo: "Oficina (Ordem de Serviço)",
    secoes: [
      {
        id: "os",
        icone: "🔧",
        titulo: "Ordem de serviço",
        resumo: "Da abertura ao faturamento com NFS-e (serviço) e NF-e (peças).",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Abrir a OS", texto: "Atendimento → aba Ordem de Serviço. Informe o cliente, o equipamento/veículo (placa, série, KM) e o problema relatado. A OS abre com número automático." },
              { titulo: "Registrar o que foi feito", texto: "Na OS, no bloco “Execução”, o técnico descreve o serviço, as horas e se identifica. Fica na linha do tempo com data e hora." },
              { titulo: "Serviços e peças", texto: "Adicione a mão de obra (descrição, horas, valor/hora) e as peças. Se a peça não está em estoque, marque “Peça a comprar” — ela entra na fila de compras." },
              { titulo: "Acompanhar status", texto: "Mude a situação: Aberta → Em andamento → (Aguardando peças) → Finalizada. O painel da oficina atualiza na hora." },
              { titulo: "Faturar", texto: "Com a OS finalizada, escolha emitir NFS-e (serviços) e/ou NF-e (peças), a forma e a condição de pagamento, e clique “Faturar”. As contas a receber são criadas e o estoque das peças baixa." },
            ],
          },
          { tipo: "dica", texto: "Se uma peça “a comprar” chega numa nota de entrada, a OS é avisada automaticamente e a peça sai da fila de compras." },
        ],
      },
      {
        id: "painel-oficina",
        icone: "📺",
        titulo: "Painel da oficina (TV)",
        resumo: "Quadro em tempo real das OS para a TV da oficina.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Abrir", texto: "Na tela de OS, clique “📺 Painel da oficina” (abre em nova aba). Use o botão de tela cheia para exibir na TV." },
              { titulo: "Acompanhar", texto: "As OS aparecem em 4 colunas (aguardando início, aguardando peças, em andamento, pronto para entrega) e atualizam sozinhas. OS atrasadas ficam em vermelho." },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "financeiro",
    titulo: "Financeiro",
    secoes: [
      {
        id: "contas-receber",
        icone: "💰",
        titulo: "Contas a receber e a pagar",
        resumo: "Lançar títulos, baixar (registrar pagamento) e estornar.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Novo título", texto: "Financeiro → aba Contas a Receber (ou a Pagar) → “Nova conta”. Informe descrição, cliente/fornecedor, valor e vencimento." },
              { titulo: "Baixar (pagar/receber)", texto: "Clique “Baixar”, informe o valor, a data, a conta bancária e a forma. Juros, multa e desconto entram se houver. O status vira Pago (ou Parcial)." },
              { titulo: "Estornar", texto: "Se registrou errado, use “Estornar baixa” — o título reabre e o saldo da conta é ajustado de volta." },
            ],
          },
        ],
      },
      {
        id: "boleto-pix",
        icone: "🏦",
        titulo: "Boleto e Pix (cobrança)",
        resumo: "Cobrar um título por boleto ou QR Code Pix, com baixa automática quando o cliente paga.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Configurar o banco", texto: "Configurações → Contas financeiras → Integração bancária. Escolha o banco (Sicoob, Sicredi ou Itaú) e informe as credenciais." },
              { titulo: "Gerar boleto", texto: "No título em aberto, clique “Gerar boleto”, escolha a conta de cobrança e baixe o PDF para enviar ao cliente." },
              { titulo: "Cobrar via Pix", texto: "Clique “Cobrar via Pix” para gerar o QR Code dinâmico. Envie a imagem ao cliente." },
              { titulo: "Baixa automática", texto: "Quando o boleto/Pix é pago no banco, o título baixa sozinho e o dinheiro entra na conta — sem lançamento manual." },
            ],
          },
          { tipo: "info", texto: "O certificado A1 da empresa (o mesmo do fiscal) autentica a conexão segura com o banco. Enquanto testa, use o ambiente Sandbox." },
        ],
      },
      {
        id: "conciliacao",
        icone: "🔄",
        titulo: "Conciliação bancária (extrato)",
        resumo: "Comparar o extrato do banco com os lançamentos do sistema.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Carregar", texto: "Financeiro → Extrato do banco. Escolha a conta e o período e clique “Carregar extrato”." },
              { titulo: "Analisar", texto: "O sistema mostra o que casou (conciliado), o que está só no banco (tarifas, antecipações) e o que está só no sistema (a investigar)." },
            ],
          },
          { tipo: "info", texto: "A conciliação por API está disponível hoje para contas Sicoob. Para os demais bancos, o extrato unificado depende de Open Finance." },
        ],
      },
      {
        id: "fluxo-caixa",
        icone: "📈",
        titulo: "Fluxo de caixa e gastos",
        resumo: "Projeção de entradas/saídas e registro de despesas por foto do cupom.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Fluxo de caixa", texto: "Financeiro → Fluxo de caixa. Veja o saldo atual e a projeção de entradas e saídas em 30/60/90 dias, além do realizado." },
              { titulo: "Registrar um gasto", texto: "Gastos → “Fotografar cupom”. A IA extrai estabelecimento, data, valor e itens; revise e salve." },
              { titulo: "Lançar no financeiro", texto: "No gasto confirmado, use “Lançar no financeiro” para criar a conta a pagar já baixada na conta escolhida." },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "gestao",
    titulo: "Gestão",
    secoes: [
      {
        id: "relatorios",
        icone: "📊",
        titulo: "Relatórios gerenciais",
        resumo: "Vendas, estoque, financeiro, DRE, impostos e fechamento — em um lugar.",
        blocos: [
          { tipo: "paragrafo", texto: "Em Relatórios você acompanha o negócio em tempo real:" },
          {
            tipo: "lista",
            itens: [
              "Vendas: total, ticket médio, vendas por dia e produtos mais vendidos.",
              "Estoque: valor total, itens críticos e zerados.",
              "Financeiro: contas a receber/pagar por status e aging.",
              "DRE simplificado: receita, custo, lucro bruto e resultado.",
              "Fiscal e impostos: notas por modelo e apuração do período.",
              "Fechamento mensal: realizado × planejado, por classificação.",
            ],
          },
        ],
      },
      {
        id: "assistente",
        icone: "🤖",
        titulo: "Assistente de IA",
        resumo: "Pergunte sobre o negócio e monte rascunhos de orçamento em linguagem natural.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Escolher o papel", texto: "Assistente → escolha “Gestor” (visão do negócio) ou “Vendedor” (produtos e orçamentos)." },
              { titulo: "Perguntar", texto: "Digite ou use as sugestões (ex.: “Como foram as vendas dos últimos 30 dias?”, “O que está acabando no estoque?”)." },
              { titulo: "Rascunhos", texto: "Quando o assistente cria um orçamento, clique em “Abrir para confirmar” e finalize na tela do orçamento." },
            ],
          },
          { tipo: "info", texto: "O assistente precisa estar habilitado e com a chave de IA configurada em Configurações → IA do ERP." },
        ],
      },
      {
        id: "admin",
        icone: "🏢",
        titulo: "Administração da plataforma",
        resumo: "Para o dono do SaaS: clientes, módulos liberados, usuários e provedor fiscal.",
        blocos: [
          {
            tipo: "passos",
            itens: [
              { titulo: "Clientes (tenants)", texto: "Painel admin → Clientes. Crie um cliente (gera empresa e usuário admin com senha inicial), ative/bloqueie e libere os módulos por cliente." },
              { titulo: "Fiscal do cliente", texto: "Em cada empresa, configure a base tributária, envie o certificado A1 e valide a emissão." },
              { titulo: "Provedor fiscal global", texto: "Painel admin → Provedor de emissão fiscal: define o provedor usado por toda a plataforma e as credenciais por ambiente." },
              { titulo: "Emissões", texto: "Monitore as notas de todos os clientes, com filtros por status e modelo." },
            ],
          },
        ],
      },
    ],
  },
];
