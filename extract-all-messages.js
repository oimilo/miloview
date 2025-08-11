require('dotenv').config();
const fs = require('fs');
const path = require('path');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

async function getAllMessages() {
  console.log('Iniciando extração completa de mensagens...');
  
  let allMessages = [];
  let hasMore = true;
  let page = null;
  let pageCount = 0;
  
  try {
    // Buscar TODAS as mensagens usando paginação
    while (hasMore) {
      pageCount++;
      console.log(`Carregando página ${pageCount}...`);
      
      if (!page) {
        // Primeira página
        page = await client.messages.page({ pageSize: 1000 });
      } else {
        // Próximas páginas
        const nextPage = await page.nextPage();
        if (!nextPage) {
          hasMore = false;
          break;
        }
        page = nextPage;
      }
      
      // Adicionar mensagens da página atual
      const messages = page.instances;
      allMessages = allMessages.concat(messages);
      
      console.log(`Página ${pageCount}: ${messages.length} mensagens (Total: ${allMessages.length})`);
      
      // Verificar se há mais páginas
      if (messages.length < 1000) {
        hasMore = false;
      }
    }
    
    console.log(`\nTotal de mensagens encontradas: ${allMessages.length}`);
    
    // Processar e organizar mensagens por conversa
    const conversations = organizeByConversation(allMessages);
    
    // Salvar dados em diferentes formatos
    saveData(allMessages, conversations);
    
    return { allMessages, conversations };
    
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    throw error;
  }
}

function organizeByConversation(messages) {
  const conversations = {};
  const userPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  
  messages.forEach(msg => {
    // Determinar o número do contato
    let contactNumber;
    if (msg.direction === 'inbound') {
      contactNumber = msg.from;
    } else {
      contactNumber = msg.to;
    }
    
    if (!conversations[contactNumber]) {
      conversations[contactNumber] = {
        contactNumber: contactNumber,
        messages: [],
        firstMessageDate: null,
        lastMessageDate: null,
        totalMessages: 0,
        messagesByStatus: {},
        messagesByDirection: {}
      };
    }
    
    // Adicionar mensagem completa
    const fullMessage = {
      sid: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body || '[Sem conteúdo]',
      status: msg.status,
      direction: msg.direction,
      dateSent: msg.dateSent,
      dateCreated: msg.dateCreated,
      dateUpdated: msg.dateUpdated,
      price: msg.price,
      priceUnit: msg.priceUnit,
      errorCode: msg.errorCode,
      errorMessage: msg.errorMessage,
      numSegments: msg.numSegments,
      numMedia: msg.numMedia,
      messagingServiceSid: msg.messagingServiceSid,
      accountSid: msg.accountSid
    };
    
    conversations[contactNumber].messages.push(fullMessage);
    conversations[contactNumber].totalMessages++;
    
    // Estatísticas
    conversations[contactNumber].messagesByStatus[msg.status] = 
      (conversations[contactNumber].messagesByStatus[msg.status] || 0) + 1;
    
    conversations[contactNumber].messagesByDirection[msg.direction] = 
      (conversations[contactNumber].messagesByDirection[msg.direction] || 0) + 1;
    
    // Atualizar datas
    const msgDate = new Date(msg.dateSent || msg.dateCreated);
    if (!conversations[contactNumber].firstMessageDate || msgDate < conversations[contactNumber].firstMessageDate) {
      conversations[contactNumber].firstMessageDate = msgDate;
    }
    if (!conversations[contactNumber].lastMessageDate || msgDate > conversations[contactNumber].lastMessageDate) {
      conversations[contactNumber].lastMessageDate = msgDate;
    }
  });
  
  // Ordenar mensagens dentro de cada conversa por data
  Object.values(conversations).forEach(conv => {
    conv.messages.sort((a, b) => 
      new Date(a.dateSent || a.dateCreated) - new Date(b.dateSent || b.dateCreated)
    );
  });
  
  return conversations;
}

function saveData(allMessages, conversations) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const outputDir = path.join(__dirname, 'exported_messages', timestamp);
  
  // Criar diretório de saída
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 1. Salvar todas as mensagens em um arquivo JSON
  const allMessagesFile = path.join(outputDir, 'all_messages.json');
  fs.writeFileSync(allMessagesFile, JSON.stringify(allMessages, null, 2));
  console.log(`\n✓ Todas as mensagens salvas em: ${allMessagesFile}`);
  
  // 2. Salvar conversas organizadas
  const conversationsFile = path.join(outputDir, 'conversations.json');
  fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
  console.log(`✓ Conversas organizadas salvas em: ${conversationsFile}`);
  
  // 3. Criar arquivo CSV com todas as mensagens
  const csvFile = path.join(outputDir, 'messages.csv');
  const csvContent = createCSV(allMessages);
  fs.writeFileSync(csvFile, csvContent);
  console.log(`✓ Arquivo CSV criado: ${csvFile}`);
  
  // 4. Criar arquivo de texto legível para cada conversa
  const conversationsDir = path.join(outputDir, 'conversations_txt');
  if (!fs.existsSync(conversationsDir)) {
    fs.mkdirSync(conversationsDir, { recursive: true });
  }
  
  Object.entries(conversations).forEach(([number, conv]) => {
    const fileName = `${number.replace(/[^0-9]/g, '')}.txt`;
    const filePath = path.join(conversationsDir, fileName);
    const content = createReadableConversation(conv);
    fs.writeFileSync(filePath, content);
  });
  console.log(`✓ Conversas em formato texto salvas em: ${conversationsDir}`);
  
  // 5. Criar resumo estatístico
  const statsFile = path.join(outputDir, 'statistics.txt');
  const stats = createStatistics(allMessages, conversations);
  fs.writeFileSync(statsFile, stats);
  console.log(`✓ Estatísticas salvas em: ${statsFile}`);
  
  // 6. Criar arquivo HTML para visualização
  const htmlFile = path.join(outputDir, 'messages_viewer.html');
  const htmlContent = createHTMLViewer(conversations);
  fs.writeFileSync(htmlFile, htmlContent);
  console.log(`✓ Visualizador HTML criado: ${htmlFile}`);
  
  console.log(`\n✅ Exportação completa! Todos os arquivos salvos em: ${outputDir}`);
}

function createCSV(messages) {
  const headers = [
    'SID',
    'Data/Hora',
    'De',
    'Para',
    'Mensagem',
    'Direção',
    'Status',
    'Preço',
    'Código de Erro',
    'Mensagem de Erro'
  ].join(',');
  
  const rows = messages.map(msg => {
    const date = new Date(msg.dateSent || msg.dateCreated).toLocaleString('pt-BR');
    return [
      msg.sid,
      date,
      msg.from,
      msg.to,
      `"${(msg.body || '').replace(/"/g, '""')}"`,
      msg.direction,
      msg.status,
      msg.price || '',
      msg.errorCode || '',
      msg.errorMessage || ''
    ].join(',');
  });
  
  return headers + '\n' + rows.join('\n');
}

function createReadableConversation(conversation) {
  let content = `Conversa com: ${conversation.contactNumber}\n`;
  content += `Total de mensagens: ${conversation.totalMessages}\n`;
  content += `Primeira mensagem: ${conversation.firstMessageDate?.toLocaleString('pt-BR')}\n`;
  content += `Última mensagem: ${conversation.lastMessageDate?.toLocaleString('pt-BR')}\n`;
  content += '='.repeat(80) + '\n\n';
  
  conversation.messages.forEach(msg => {
    const date = new Date(msg.dateSent || msg.dateCreated);
    const time = date.toLocaleString('pt-BR');
    const sender = msg.direction === 'inbound' ? msg.from : 'Você';
    
    content += `[${time}] ${sender}:\n`;
    content += `${msg.body || '[Sem conteúdo]'}\n`;
    if (msg.status === 'failed' && msg.errorMessage) {
      content += `❌ Erro: ${msg.errorMessage}\n`;
    }
    content += '\n';
  });
  
  return content;
}

function createStatistics(allMessages, conversations) {
  let stats = 'ESTATÍSTICAS GERAIS\n';
  stats += '='.repeat(50) + '\n\n';
  
  stats += `Total de mensagens: ${allMessages.length}\n`;
  stats += `Total de conversas: ${Object.keys(conversations).length}\n\n`;
  
  // Mensagens por status
  const statusCount = {};
  allMessages.forEach(msg => {
    statusCount[msg.status] = (statusCount[msg.status] || 0) + 1;
  });
  
  stats += 'Mensagens por Status:\n';
  Object.entries(statusCount).forEach(([status, count]) => {
    stats += `  ${status}: ${count}\n`;
  });
  
  // Mensagens por direção
  const directionCount = {};
  allMessages.forEach(msg => {
    directionCount[msg.direction] = (directionCount[msg.direction] || 0) + 1;
  });
  
  stats += '\nMensagens por Direção:\n';
  Object.entries(directionCount).forEach(([direction, count]) => {
    stats += `  ${direction}: ${count}\n`;
  });
  
  // Top 10 conversas com mais mensagens
  const sortedConversations = Object.entries(conversations)
    .sort((a, b) => b[1].totalMessages - a[1].totalMessages)
    .slice(0, 10);
  
  stats += '\nTop 10 Conversas (por número de mensagens):\n';
  sortedConversations.forEach(([number, conv]) => {
    stats += `  ${number}: ${conv.totalMessages} mensagens\n`;
  });
  
  // Mensagens com erro
  const errorMessages = allMessages.filter(msg => msg.errorCode);
  stats += `\nMensagens com erro: ${errorMessages.length}\n`;
  
  if (errorMessages.length > 0) {
    const errorTypes = {};
    errorMessages.forEach(msg => {
      errorTypes[msg.errorCode] = (errorTypes[msg.errorCode] || 0) + 1;
    });
    
    stats += 'Tipos de erro:\n';
    Object.entries(errorTypes).forEach(([code, count]) => {
      stats += `  ${code}: ${count}\n`;
    });
  }
  
  return stats;
}

function createHTMLViewer(conversations) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visualizador de Mensagens WhatsApp</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #111b21;
            color: #e9edef;
            display: flex;
            height: 100vh;
        }
        
        .sidebar {
            width: 30%;
            background: #202c33;
            border-right: 1px solid #2a3942;
            overflow-y: auto;
        }
        
        .chat-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: #0b141a;
        }
        
        .conversation-item {
            padding: 12px 15px;
            cursor: pointer;
            border-bottom: 1px solid #2a3942;
            transition: background 0.2s;
        }
        
        .conversation-item:hover {
            background: #2a3942;
        }
        
        .conversation-item.active {
            background: #2a3942;
        }
        
        .conversation-header {
            font-weight: 500;
            margin-bottom: 4px;
        }
        
        .conversation-meta {
            font-size: 13px;
            color: #8696a0;
        }
        
        .chat-header {
            background: #202c33;
            padding: 10px 16px;
            border-bottom: 1px solid #2a3942;
        }
        
        .messages-container {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
        }
        
        .message {
            max-width: 65%;
            margin-bottom: 10px;
            display: flex;
        }
        
        .message.sent {
            align-self: flex-end;
        }
        
        .message.received {
            align-self: flex-start;
        }
        
        .message-bubble {
            padding: 8px 12px;
            border-radius: 8px;
            word-wrap: break-word;
        }
        
        .message.sent .message-bubble {
            background: #005c4b;
        }
        
        .message.received .message-bubble {
            background: #202c33;
        }
        
        .message-time {
            font-size: 11px;
            color: #8696a0;
            margin-top: 4px;
        }
        
        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: #8696a0;
        }
    </style>
</head>
<body>
    <div class="sidebar" id="sidebar">
        <div style="padding: 10px; background: #111b21; border-bottom: 1px solid #2a3942;">
            <input type="text" id="searchInput" placeholder="Buscar conversa..." 
                   style="width: 100%; padding: 8px; background: #2a3942; border: none; 
                          border-radius: 8px; color: #e9edef; outline: none;">
        </div>
        <div id="conversationsList"></div>
    </div>
    
    <div class="chat-area">
        <div class="chat-header" id="chatHeader" style="display: none;">
            <div id="contactName" style="font-weight: 500;"></div>
            <div id="messageCount" style="font-size: 13px; color: #8696a0;"></div>
        </div>
        <div class="messages-container" id="messagesContainer">
            <div class="empty-state">Selecione uma conversa para visualizar</div>
        </div>
    </div>
    
    <script>
        const conversations = ${JSON.stringify(conversations)};
        let currentConversation = null;
        
        function init() {
            displayConversations();
            document.getElementById('searchInput').addEventListener('input', filterConversations);
        }
        
        function displayConversations() {
            const list = document.getElementById('conversationsList');
            list.innerHTML = '';
            
            Object.entries(conversations)
                .sort((a, b) => new Date(b[1].lastMessageDate) - new Date(a[1].lastMessageDate))
                .forEach(([number, conv]) => {
                    const div = document.createElement('div');
                    div.className = 'conversation-item';
                    div.onclick = () => selectConversation(number);
                    
                    const lastMsg = conv.messages[conv.messages.length - 1];
                    const preview = lastMsg ? (lastMsg.body || '[Sem conteúdo]').substring(0, 50) : '';
                    
                    div.innerHTML = \`
                        <div class="conversation-header">\${formatPhone(number)}</div>
                        <div class="conversation-meta">
                            \${conv.totalMessages} mensagens • \${preview}...
                        </div>
                    \`;
                    
                    list.appendChild(div);
                });
        }
        
        function selectConversation(number) {
            currentConversation = number;
            
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            event.currentTarget.classList.add('active');
            
            const conv = conversations[number];
            document.getElementById('chatHeader').style.display = 'block';
            document.getElementById('contactName').textContent = formatPhone(number);
            document.getElementById('messageCount').textContent = conv.totalMessages + ' mensagens';
            
            displayMessages(conv.messages);
        }
        
        function displayMessages(messages) {
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '';
            
            messages.forEach(msg => {
                const div = document.createElement('div');
                const isSent = msg.direction === 'outbound-api' || msg.direction === 'outbound-call';
                div.className = 'message ' + (isSent ? 'sent' : 'received');
                
                const time = new Date(msg.dateSent || msg.dateCreated).toLocaleString('pt-BR');
                
                div.innerHTML = \`
                    <div class="message-bubble">
                        <div>\${msg.body || '[Sem conteúdo]'}</div>
                        <div class="message-time">\${time}</div>
                    </div>
                \`;
                
                container.appendChild(div);
            });
            
            container.scrollTop = container.scrollHeight;
        }
        
        function filterConversations() {
            const search = event.target.value.toLowerCase();
            const items = document.querySelectorAll('.conversation-item');
            
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(search) ? 'block' : 'none';
            });
        }
        
        function formatPhone(phone) {
            const cleaned = phone.replace(/\\D/g, '');
            if (cleaned.startsWith('55') && cleaned.length === 13) {
                const n = cleaned.substring(2);
                return '+55 (' + n.substring(0, 2) + ') ' + n.substring(2, 7) + '-' + n.substring(7);
            }
            return phone;
        }
        
        init();
    </script>
</body>
</html>`;
  
  return html;
}

// Executar extração
console.log('='.repeat(60));
console.log('EXTRATOR COMPLETO DE MENSAGENS TWILIO/WHATSAPP');
console.log('='.repeat(60));

getAllMessages()
  .then(result => {
    console.log('\n✅ Extração concluída com sucesso!');
    console.log(`Total de mensagens: ${result.allMessages.length}`);
    console.log(`Total de conversas: ${Object.keys(result.conversations).length}`);
  })
  .catch(error => {
    console.error('\n❌ Erro na extração:', error.message);
    process.exit(1);
  });