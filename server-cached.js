require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cache para mensagens locais
let cachedMessages = null;
let cachedConversations = null;
let lastCacheUpdate = null;

// Função para carregar dados do arquivo exportado
function loadCachedData() {
  try {
    // Procurar pelo arquivo mais recente na pasta exported_messages
    const exportDir = path.join(__dirname, 'exported_messages');
    if (fs.existsSync(exportDir)) {
      const folders = fs.readdirSync(exportDir)
        .filter(f => fs.statSync(path.join(exportDir, f)).isDirectory())
        .sort().reverse();
      
      if (folders.length > 0) {
        const latestFolder = folders[0];
        const messagesFile = path.join(exportDir, latestFolder, 'all_messages.json');
        const conversationsFile = path.join(exportDir, latestFolder, 'conversations.json');
        
        if (fs.existsSync(messagesFile)) {
          console.log(`Carregando cache de: ${messagesFile}`);
          cachedMessages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
          cachedConversations = JSON.parse(fs.readFileSync(conversationsFile, 'utf8'));
          lastCacheUpdate = new Date();
          console.log(`Cache carregado: ${cachedMessages.length} mensagens de ${Object.keys(cachedConversations).length} conversas`);
          return true;
        }
      }
    }
  } catch (error) {
    console.error('Erro ao carregar cache:', error);
  }
  return false;
}

// Carregar cache na inicialização
loadCachedData();

// Endpoint para forçar recarga do cache
app.get('/api/reload-cache', (req, res) => {
  const success = loadCachedData();
  res.json({ 
    success, 
    messagesCount: cachedMessages ? cachedMessages.length : 0,
    conversationsCount: cachedConversations ? Object.keys(cachedConversations).length : 0,
    lastUpdate: lastCacheUpdate 
  });
});

app.get('/api/conversations', async (req, res) => {
  try {
    const { useCache = 'true', updateOnly = 'false' } = req.query;
    
    let allMessages = [];
    
    // Usar cache se disponível
    if (useCache === 'true' && cachedMessages) {
      console.log(`Usando cache com ${cachedMessages.length} mensagens`);
      allMessages = [...cachedMessages];
    }
    
    // Buscar novas mensagens da API
    if (updateOnly === 'true' || !cachedMessages) {
      try {
        // Determinar data de corte para buscar apenas novas
        let dateSentAfter = null;
        if (cachedMessages && cachedMessages.length > 0) {
          const dates = cachedMessages.map(m => new Date(m.dateSent || m.dateCreated).getTime());
          dateSentAfter = new Date(Math.max(...dates));
          console.log(`Buscando mensagens após: ${dateSentAfter}`);
        }
        
        const options = dateSentAfter ? 
          { dateSentAfter, limit: 100 } : 
          { limit: 100 };
        
        const newMessages = await client.messages.list(options);
        
        // Filtrar mensagens duplicadas
        const existingSids = new Set(allMessages.map(m => m.sid));
        const uniqueNewMessages = newMessages.filter(m => !existingSids.has(m.sid));
        
        if (uniqueNewMessages.length > 0) {
          console.log(`${uniqueNewMessages.length} novas mensagens encontradas`);
          allMessages = allMessages.concat(uniqueNewMessages);
          
          // Atualizar cache em memória
          cachedMessages = allMessages;
        } else {
          console.log('Nenhuma nova mensagem');
        }
      } catch (apiError) {
        console.error('Erro ao buscar novas mensagens:', apiError);
        // Continuar com dados do cache mesmo se API falhar
      }
    }
    
    // Formatar mensagens
    const formattedMessages = allMessages.map(msg => ({
      sid: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      status: msg.status,
      direction: msg.direction,
      dateSent: msg.dateSent,
      dateCreated: msg.dateCreated,
      price: msg.price,
      priceUnit: msg.priceUnit,
      errorCode: msg.errorCode,
      errorMessage: msg.errorMessage
    }));
    
    // Agrupar por conversa
    const conversations = {};
    
    formattedMessages.forEach(msg => {
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
          lastMessage: null,
          lastMessageDate: null,
          unreadCount: 0,
          totalMessages: 0
        };
      }
      
      conversations[contactNumber].messages.push(msg);
      conversations[contactNumber].totalMessages++;
      
      const msgDate = new Date(msg.dateSent || msg.dateCreated);
      if (!conversations[contactNumber].lastMessageDate || msgDate > conversations[contactNumber].lastMessageDate) {
        conversations[contactNumber].lastMessage = msg.body;
        conversations[contactNumber].lastMessageDate = msgDate;
      }
    });
    
    // Converter em array e ordenar
    const conversationList = Object.values(conversations)
      .sort((a, b) => b.lastMessageDate - a.lastMessageDate);
    
    res.json({
      conversations: conversationList,
      totalMessages: allMessages.length,
      cachedMessages: cachedMessages ? cachedMessages.length : 0,
      lastCacheUpdate: lastCacheUpdate
    });
    
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { useCache = 'true' } = req.query;
    
    let messages = [];
    
    // Primeiro tentar usar o cache
    if (useCache === 'true' && cachedConversations && cachedConversations[phoneNumber]) {
      console.log(`Usando cache para conversa: ${phoneNumber}`);
      messages = cachedConversations[phoneNumber].messages || [];
    } else if (useCache === 'true' && cachedMessages) {
      // Se não temos a conversa específica, filtrar do cache geral
      messages = cachedMessages.filter(msg => 
        msg.from === phoneNumber || msg.to === phoneNumber
      );
    }
    
    // Buscar mensagens novas da API
    try {
      let dateSentAfter = null;
      if (messages.length > 0) {
        const dates = messages.map(m => new Date(m.dateSent || m.dateCreated).getTime());
        dateSentAfter = new Date(Math.max(...dates));
      }
      
      const apiMessages = await client.messages.list({ 
        limit: 50,
        ...(dateSentAfter && { dateSentAfter })
      });
      
      // Filtrar para este número e remover duplicatas
      const relevantMessages = apiMessages.filter(msg => 
        msg.from === phoneNumber || msg.to === phoneNumber
      );
      
      const existingSids = new Set(messages.map(m => m.sid));
      const newMessages = relevantMessages.filter(m => !existingSids.has(m.sid));
      
      if (newMessages.length > 0) {
        console.log(`${newMessages.length} novas mensagens para ${phoneNumber}`);
        messages = messages.concat(newMessages);
      }
    } catch (apiError) {
      console.error('Erro ao buscar novas mensagens da conversa:', apiError);
    }
    
    // Formatar e ordenar mensagens
    const formattedMessages = messages
      .map(msg => ({
        sid: msg.sid,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        status: msg.status,
        direction: msg.direction,
        dateSent: msg.dateSent,
        dateCreated: msg.dateCreated,
        price: msg.price,
        priceUnit: msg.priceUnit,
        errorCode: msg.errorCode,
        errorMessage: msg.errorMessage
      }))
      .sort((a, b) => new Date(a.dateSent || a.dateCreated) - new Date(b.dateSent || b.dateCreated));
    
    res.json({
      messages: formattedMessages,
      totalMessages: formattedMessages.length,
      fromCache: useCache === 'true' && (cachedConversations || cachedMessages) !== null
    });
    
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.get('/api/message/:sid', async (req, res) => {
  try {
    // Primeiro tentar do cache
    if (cachedMessages) {
      const cachedMessage = cachedMessages.find(m => m.sid === req.params.sid);
      if (cachedMessage) {
        res.json(cachedMessage);
        return;
      }
    }
    
    // Se não encontrou no cache, buscar da API
    const message = await client.messages(req.params.sid).fetch();
    res.json({
      sid: message.sid,
      from: message.from,
      to: message.to,
      body: message.body,
      status: message.status,
      direction: message.direction,
      dateSent: message.dateSent,
      dateCreated: message.dateCreated,
      price: message.price,
      priceUnit: message.priceUnit,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
      numSegments: message.numSegments,
      numMedia: message.numMedia
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ error: 'Failed to fetch message details' });
  }
});

// Endpoint para estatísticas
app.get('/api/stats', (req, res) => {
  res.json({
    cachedMessages: cachedMessages ? cachedMessages.length : 0,
    cachedConversations: cachedConversations ? Object.keys(cachedConversations).length : 0,
    lastCacheUpdate: lastCacheUpdate,
    cacheLoaded: cachedMessages !== null
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Cache: ${cachedMessages ? cachedMessages.length + ' mensagens' : 'Não carregado'}`);
});