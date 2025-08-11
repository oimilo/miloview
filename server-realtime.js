// Carregar variáveis de ambiente apenas em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Railway precisa bindingar em 0.0.0.0

console.log('=== CONFIGURAÇÃO DO SERVIDOR ===');
console.log('PORT:', PORT);
console.log('HOST:', HOST);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Verificar se as variáveis de ambiente estão configuradas
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;
let isDemoMode = false;

if (!accountSid || !authToken) {
  console.log('=== MODO DEMONSTRAÇÃO ===');
  console.log('Twilio não configurado - rodando sem conexão com WhatsApp');
  console.log('Para conectar ao WhatsApp, configure TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN');
  isDemoMode = true;
} else {
  try {
    client = require('twilio')(accountSid, authToken);
    console.log('Twilio configurado com sucesso!');
  } catch (error) {
    console.error('Erro ao inicializar Twilio:', error.message);
    isDemoMode = true;
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cache para mensagens
let messageCache = new Map();
let conversationCache = new Map();
let lastApiCall = null;
let isUpdating = false;

// Função para gerar mensagens de demonstração
function getDemoMessages() {
  const demoMessages = [
    {
      sid: 'demo1',
      from: 'whatsapp:+5511999887766',
      to: 'whatsapp:+14155238886',
      body: 'Olá! Esta é uma mensagem de demonstração.',
      status: 'delivered',
      dateCreated: new Date(),
      dateSent: new Date(),
      direction: 'inbound'
    },
    {
      sid: 'demo2',
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+5511999887766',
      body: 'Bem-vindo ao MiloView! Sistema funcionando em modo demo.',
      status: 'sent',
      dateCreated: new Date(Date.now() - 60000),
      dateSent: new Date(Date.now() - 60000),
      direction: 'outbound-api'
    },
    {
      sid: 'demo3',
      from: 'whatsapp:+5521987654321',
      to: 'whatsapp:+14155238886',
      body: 'Configure as variáveis TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN para conectar ao WhatsApp real.',
      status: 'delivered',
      dateCreated: new Date(Date.now() - 120000),
      dateSent: new Date(Date.now() - 120000),
      direction: 'inbound'
    }
  ];
  
  return demoMessages;
}

// Função para buscar todas as mensagens da API
async function fetchAllMessages(dateRange = null) {
  if (isDemoMode) {
    console.log('Modo demonstração - retornando mensagens de exemplo');
    return getDemoMessages();
  }
  
  if (isUpdating) {
    console.log('Atualização já em andamento...');
    return;
  }
  
  isUpdating = true;
  const allMessages = [];
  
  try {
    console.log('Iniciando busca de TODAS as mensagens do Twilio...');
    
    // Configurar opções de busca
    const options = { pageSize: 1000 };
    
    // Se especificado período, adicionar filtros de data
    if (dateRange) {
      if (dateRange.after) options.dateSentAfter = new Date(dateRange.after);
      if (dateRange.before) options.dateSentBefore = new Date(dateRange.before);
      console.log(`Buscando mensagens entre ${dateRange.after || 'início'} e ${dateRange.before || 'agora'}`);
    }
    
    let hasMore = true;
    let page = null;
    let pageCount = 0;
    
    while (hasMore) {
      pageCount++;
      
      try {
        if (!page) {
          // Primeira página
          page = await client.messages.page(options);
        } else {
          // Próximas páginas
          const nextPage = await page.nextPage();
          if (!nextPage || nextPage.instances.length === 0) {
            hasMore = false;
            break;
          }
          page = nextPage;
        }
        
        // Adicionar mensagens ao array
        if (page && page.instances) {
          allMessages.push(...page.instances);
          console.log(`Página ${pageCount}: ${page.instances.length} mensagens (Total: ${allMessages.length})`);
          
          // Emitir progresso via WebSocket
          io.emit('loading-progress', {
            current: allMessages.length,
            page: pageCount,
            message: `Carregando página ${pageCount}...`
          });
          
          // Se a página tem menos que o tamanho máximo, não há mais páginas
          if (page.instances.length < 1000) {
            hasMore = false;
          }
        }
        
        // Pequena pausa para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (pageError) {
        console.error(`Erro na página ${pageCount}:`, pageError.message);
        // Continuar mesmo se uma página falhar
        hasMore = false;
      }
    }
    
    console.log(`✅ Total de mensagens carregadas do Twilio: ${allMessages.length}`);
    
    // Limpar e atualizar cache
    messageCache.clear();
    allMessages.forEach(msg => {
      messageCache.set(msg.sid, msg);
    });
    
    // Atualizar conversas
    updateConversationCache(allMessages);
    
    lastApiCall = new Date();
    
    // Salvar em arquivo para backup
    saveMessagesToFile(allMessages);
    
    // Notificar clientes conectados
    io.emit('messages-updated', {
      totalMessages: allMessages.length,
      timestamp: lastApiCall,
      source: 'twilio-api'
    });
    
    return allMessages;
    
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    throw error;
  } finally {
    isUpdating = false;
  }
}

// Função para salvar mensagens em arquivo
async function saveMessagesToFile(messages) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const exportDir = path.join(__dirname, 'exported_messages', `sync_${timestamp}`);
    
    // Criar diretório se não existir
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    // Salvar mensagens
    const messagesFile = path.join(exportDir, 'all_messages.json');
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
    
    // Salvar conversas
    const conversations = {};
    messages.forEach(msg => {
      const contact = msg.direction === 'inbound' ? msg.from : msg.to;
      if (!conversations[contact]) {
        conversations[contact] = { messages: [] };
      }
      conversations[contact].messages.push(msg);
    });
    
    const conversationsFile = path.join(exportDir, 'conversations.json');
    fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2));
    
    console.log(`💾 Backup salvo em: ${exportDir}`);
  } catch (error) {
    console.error('Erro ao salvar backup:', error);
  }
}

// Função para buscar mensagens novas (incremental)
async function fetchNewMessages() {
  if (isUpdating) return;
  
  try {
    const options = { limit: 100 };
    
    // Se temos mensagens em cache, buscar apenas as mais recentes
    if (messageCache.size > 0) {
      const latestDate = Math.max(...Array.from(messageCache.values()).map(m => 
        new Date(m.dateSent || m.dateCreated).getTime()
      ));
      options.dateSentAfter = new Date(latestDate);
    }
    
    const newMessages = await client.messages.list(options);
    
    let addedCount = 0;
    newMessages.forEach(msg => {
      if (!messageCache.has(msg.sid)) {
        messageCache.set(msg.sid, msg);
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      console.log(`${addedCount} novas mensagens adicionadas ao cache`);
      
      // Atualizar cache de conversas
      const allMessages = Array.from(messageCache.values());
      updateConversationCache(allMessages);
      
      // Notificar clientes
      io.emit('new-messages', {
        count: addedCount,
        totalMessages: messageCache.size
      });
    }
    
    return addedCount;
    
  } catch (error) {
    console.error('Erro ao buscar novas mensagens:', error);
    return 0;
  }
}

// Função para atualizar cache de conversas
function updateConversationCache(messages) {
  conversationCache.clear();
  
  messages.forEach(msg => {
    let contactNumber;
    if (msg.direction === 'inbound') {
      contactNumber = msg.from;
    } else {
      contactNumber = msg.to;
    }
    
    if (!conversationCache.has(contactNumber)) {
      conversationCache.set(contactNumber, {
        contactNumber: contactNumber,
        messages: [],
        lastMessage: null,
        lastMessageDate: null,
        totalMessages: 0
      });
    }
    
    const conv = conversationCache.get(contactNumber);
    conv.messages.push(msg);
    conv.totalMessages++;
    
    const msgDate = new Date(msg.dateSent || msg.dateCreated);
    if (!conv.lastMessageDate || msgDate > conv.lastMessageDate) {
      conv.lastMessage = msg.body;
      conv.lastMessageDate = msgDate;
    }
  });
}

// Carregar cache do arquivo se existir
async function loadFileCache() {
  try {
    const exportDir = path.join(__dirname, 'exported_messages');
    if (fs.existsSync(exportDir)) {
      const folders = fs.readdirSync(exportDir)
        .filter(f => fs.statSync(path.join(exportDir, f)).isDirectory())
        .sort().reverse();
      
      if (folders.length > 0) {
        const latestFolder = folders[0];
        const messagesFile = path.join(exportDir, latestFolder, 'all_messages.json');
        
        if (fs.existsSync(messagesFile)) {
          console.log(`Carregando cache de arquivo: ${messagesFile}`);
          const fileMessages = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
          
          fileMessages.forEach(msg => {
            messageCache.set(msg.sid, msg);
          });
          
          updateConversationCache(fileMessages);
          console.log(`Cache carregado: ${fileMessages.length} mensagens`);
          return true;
        }
      }
    }
  } catch (error) {
    console.error('Erro ao carregar cache do arquivo:', error);
  }
  return false;
}

// WebSocket handlers
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  // Enviar status inicial
  socket.emit('connection-status', {
    connected: true,
    messagesInCache: messageCache.size,
    conversationsInCache: conversationCache.size,
    lastUpdate: lastApiCall
  });
  
  // Cliente solicita atualização completa
  socket.on('request-full-update', async () => {
    try {
      await fetchAllMessages();
      socket.emit('full-update-complete');
    } catch (error) {
      socket.emit('update-error', error.message);
    }
  });
  
  // Cliente solicita verificar novas mensagens
  socket.on('check-new-messages', async () => {
    const count = await fetchNewMessages();
    socket.emit('new-messages-checked', { newCount: count });
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Health check endpoint para Railway
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    messagesInCache: messageCache.size,
    conversationsInCache: conversationCache.size,
    timestamp: new Date().toISOString()
  });
});

// Endpoints REST
app.get('/api/conversations', async (req, res) => {
  try {
    // Se o cache está vazio, carregar mensagens
    if (messageCache.size === 0) {
      const fileLoaded = await loadFileCache();
      if (!fileLoaded) {
        await fetchAllMessages();
      }
    }
    
    // Converter cache em array e ordenar
    const conversations = Array.from(conversationCache.values())
      .sort((a, b) => b.lastMessageDate - a.lastMessageDate);
    
    res.json({
      conversations: conversations,
      totalMessages: messageCache.size,
      lastUpdate: lastApiCall,
      isLive: true
    });
    
  } catch (error) {
    console.error('Erro ao buscar conversas:', error);
    res.status(500).json({ error: 'Falha ao buscar conversas' });
  }
});

app.get('/api/conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    // Buscar conversa do cache
    const conversation = conversationCache.get(phoneNumber);
    
    if (!conversation) {
      // Se não encontrou, buscar da API
      const messages = await client.messages.list({ limit: 100 });
      const filtered = messages.filter(msg => 
        msg.from === phoneNumber || msg.to === phoneNumber
      );
      
      res.json({
        messages: filtered,
        totalMessages: filtered.length,
        isLive: false
      });
    } else {
      // Ordenar mensagens por data
      const sortedMessages = conversation.messages
        .sort((a, b) => new Date(a.dateSent || a.dateCreated) - new Date(b.dateSent || b.dateCreated));
      
      res.json({
        messages: sortedMessages,
        totalMessages: sortedMessages.length,
        isLive: true
      });
    }
    
  } catch (error) {
    console.error('Erro ao buscar conversa:', error);
    res.status(500).json({ error: 'Falha ao buscar conversa' });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    messagesInCache: messageCache.size,
    conversationsInCache: conversationCache.size,
    lastUpdate: lastApiCall,
    isUpdating: isUpdating,
    serverTime: new Date()
  });
});

app.post('/api/refresh', async (req, res) => {
  try {
    const { dateRange } = req.body;
    await fetchAllMessages(dateRange);
    res.json({
      success: true,
      totalMessages: messageCache.size,
      conversations: conversationCache.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para sincronização completa com Twilio
app.post('/api/sync-twilio', async (req, res) => {
  try {
    console.log('📡 Iniciando sincronização completa com Twilio...');
    
    // Buscar TODAS as mensagens do Twilio
    await fetchAllMessages();
    
    res.json({
      success: true,
      totalMessages: messageCache.size,
      conversations: conversationCache.size,
      lastSync: lastApiCall
    });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    res.status(500).json({ error: error.message });
  }
});

// Importar funções de bloqueio
const blockManager = require('./block-number');

// Endpoint para bloquear número
app.post('/api/block-number', async (req, res) => {
  try {
    const { phoneNumber, action = 'block' } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Número de telefone é obrigatório' });
    }
    
    const result = await blockManager.localBlockList(phoneNumber, action);
    
    // Notificar clientes via WebSocket
    io.emit('number-blocked', {
      phoneNumber,
      action,
      timestamp: new Date()
    });
    
    res.json(result);
  } catch (error) {
    console.error('Erro ao bloquear número:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar números bloqueados
app.get('/api/blocked-numbers', async (req, res) => {
  try {
    const result = await blockManager.listBlockedNumbers();
    res.json(result);
  } catch (error) {
    console.error('Erro ao listar bloqueados:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para verificar se número está bloqueado
app.get('/api/check-blocked/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const isBlocked = await blockManager.isBlocked(phoneNumber);
    
    res.json({
      phoneNumber,
      isBlocked,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Erro ao verificar bloqueio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook para filtrar mensagens de números bloqueados
app.post('/api/sms-webhook', async (req, res) => {
  try {
    const { From, Body } = req.body;
    
    // Verificar se número está bloqueado
    const isBlocked = await blockManager.isBlocked(From);
    
    if (isBlocked) {
      console.log(`🚫 Mensagem bloqueada de: ${From}`);
      
      // Responder com mensagem de bloqueio
      const MessagingResponse = require('twilio').twiml.MessagingResponse;
      const twiml = new MessagingResponse();
      twiml.message('Seu número foi bloqueado e suas mensagens não serão recebidas.');
      
      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      // Processar mensagem normalmente
      res.status(200).send('OK');
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Error');
  }
});

// Endpoint para buscar mensagens de hoje
app.post('/api/sync-today', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('📅 Sincronizando mensagens de hoje...');
    
    await fetchAllMessages({
      after: today.toISOString()
    });
    
    res.json({
      success: true,
      totalMessages: messageCache.size,
      conversations: conversationCache.size,
      syncDate: today
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inicialização
async function initialize() {
  // Tentar carregar cache de arquivo primeiro
  const fileLoaded = await loadFileCache();
  
  if (!fileLoaded) {
    console.log('Nenhum cache de arquivo encontrado. Buscando mensagens da API...');
    await fetchAllMessages();
  }
  
  // Configurar atualização automática a cada 30 segundos
  setInterval(async () => {
    await fetchNewMessages();
  }, 30000);
  
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor em tempo real rodando`);
    console.log(`📡 URL: http://${HOST}:${PORT}`);
    console.log(`🔌 WebSocket disponível na porta ${PORT}`);
    console.log(`💾 Cache: ${messageCache.size} mensagens, ${conversationCache.size} conversas`);
    console.log(`✅ Pronto para produção!`);
  });
}

initialize().catch(console.error);