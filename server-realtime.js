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
const crypto = require('crypto');

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

// Configuração de autenticação
const AUTH_USERNAME = 'h2ofilms';
const AUTH_PASSWORD = 'H2OFilms!';
const sessions = new Map(); // Armazenar sessões em memória

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
app.use(express.urlencoded({ extended: true }));

// Middleware para verificar sessão
function checkAuth(req, res, next) {
  // Permitir acesso ao login e recursos estáticos
  if (req.path === '/login.html' || 
      req.path === '/api/login' ||
      req.path.endsWith('.css') || 
      req.path.endsWith('.js') ||
      req.path.endsWith('.ico')) {
    return next();
  }
  
  // Verificar sessão via cookie ou header
  const sessionId = req.headers['x-session-id'] || 
                   req.query.session || 
                   req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
  
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    if (session.expires > Date.now()) {
      // Renovar sessão
      session.expires = Date.now() + (24 * 60 * 60 * 1000); // 24 horas
      req.session = session;
      return next();
    }
  }
  
  // Se for requisição de API, retornar 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  
  // Se for página HTML, redirecionar para login
  if (req.path === '/' || req.path.endsWith('.html')) {
    return res.redirect('/login.html');
  }
  
  // Bloquear acesso
  res.status(401).send('Não autorizado');
}

// Servir página de login sem autenticação
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Rota de login (não protegida)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log('Tentativa de login:', { username, passwordLength: password?.length });
  
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    // Criar sessão
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, {
      username,
      expires: Date.now() + (24 * 60 * 60 * 1000) // 24 horas
    });
    
    console.log('Login bem-sucedido para:', username);
    
    // Definir cookie também
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ 
      success: true, 
      sessionId,
      message: 'Login realizado com sucesso'
    });
  } else {
    console.log('Login falhou - credenciais inválidas');
    res.status(401).json({ 
      success: false, 
      message: 'Usuário ou senha incorretos'
    });
  }
});

// Rota de logout
app.post('/api/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.json({ success: true });
});

// Aplicar autenticação para todas as rotas
app.use(checkAuth);

// Servir arquivos estáticos após verificação
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
    
    // Configurar opções de busca - REMOVER pageSize para usar o padrão
    const options = {};
    
    // Se especificado período, adicionar filtros de data
    if (dateRange) {
      if (dateRange.after) options.dateSentAfter = new Date(dateRange.after);
      if (dateRange.before) options.dateSentBefore = new Date(dateRange.before);
      console.log(`Buscando mensagens entre ${dateRange.after || 'início'} e ${dateRange.before || 'agora'}`);
    } else {
      // Por padrão, buscar mensagens dos últimos 7 dias para evitar timeout
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      options.dateSentAfter = sevenDaysAgo;
      console.log(`Buscando mensagens dos últimos 7 dias (desde ${sevenDaysAgo.toISOString()})`);
    }
    
    // Buscar mensagens usando o método correto de paginação
    console.log('Buscando mensagens do Twilio...');
    const seenSids = new Set(); // Para evitar duplicatas
    let messageCount = 0;
    
    try {
      // Usar o método each() corretamente com callback assíncrono
      await client.messages.each(options, async (message) => {
        // Verificar se já vimos esta mensagem
        if (!seenSids.has(message.sid)) {
          seenSids.add(message.sid);
          allMessages.push(message);
          messageCount++;
          
          // Emitir progresso a cada 25 mensagens
          if (messageCount % 25 === 0) {
            console.log(`📦 ${messageCount} mensagens carregadas...`);
            io.emit('loading-progress', {
              current: messageCount,
              message: `Sincronizando: ${messageCount} mensagens...`,
              isInitialSync: messageCache.size === 0
            });
          }
          
          // Limitar a 5000 mensagens por sincronização
          if (messageCount >= 5000) {
            console.log('Limite de 5000 mensagens atingido');
            return false; // Para a iteração
          }
        }
      });
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error.message);
      
      // Fallback: usar list() se each() falhar
      console.log('Tentando método alternativo...');
      try {
        options.limit = 1000;
        const messages = await client.messages.list(options);
        
        messages.forEach(msg => {
          if (!seenSids.has(msg.sid)) {
            seenSids.add(msg.sid);
            allMessages.push(msg);
            messageCount++;
          }
        });
        
        console.log(`📦 ${messageCount} mensagens carregadas via list()`);
      } catch (listError) {
        console.error('Erro no método alternativo:', listError.message);
      }
    }
    
    console.log(`✅ Total de mensagens carregadas do Twilio: ${allMessages.length}`);
    
    // Limpar e atualizar cache de mensagens
    console.log(`🗄️ Atualizando cache com ${allMessages.length} mensagens`);
    messageCache.clear();
    allMessages.forEach(msg => {
      if (msg.sid) {
        messageCache.set(msg.sid, msg);
      }
    });
    
    // Atualizar conversas (limpar cache porque é sincronização completa)
    updateConversationCache(allMessages, true);
    
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
      console.log(`✨ ${addedCount} novas mensagens adicionadas ao cache`);
      
      // Atualizar cache de conversas SEM limpar (incremental)
      const allMessages = Array.from(messageCache.values());
      updateConversationCache(allMessages, false); // false = não limpar cache
      
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
function updateConversationCache(messages, clearCache = true) {
  console.log(`🔄 Atualizando cache de conversas (clearCache=${clearCache}, messages=${messages.length})`);
  
  // Só limpar o cache se for uma sincronização completa
  if (clearCache) {
    conversationCache.clear();
  }
  
  // Usar Map para garantir mensagens únicas por SID
  const uniqueMessages = new Map();
  messages.forEach(msg => {
    if (msg.sid && !uniqueMessages.has(msg.sid)) {
      uniqueMessages.set(msg.sid, msg);
    }
  });
  
  console.log(`📊 Processando ${uniqueMessages.size} mensagens únicas`);
  
  // Processar apenas mensagens únicas
  uniqueMessages.forEach(msg => {
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
        messagesSet: new Set(), // Para evitar duplicatas
        lastMessage: null,
        lastMessageDate: null,
        totalMessages: 0
      });
    }
    
    const conv = conversationCache.get(contactNumber);
    
    // Adicionar apenas se não for duplicata
    if (!conv.messagesSet.has(msg.sid)) {
      conv.messagesSet.add(msg.sid);
      conv.messages.push(msg);
      conv.totalMessages++;
      
      const msgDate = new Date(msg.dateSent || msg.dateCreated);
      if (!conv.lastMessageDate || msgDate > conv.lastMessageDate) {
        conv.lastMessage = msg.body;
        conv.lastMessageDate = msgDate;
      }
    }
  });
  
  console.log(`📊 Cache atualizado: ${conversationCache.size} conversas, ${uniqueMessages.size} mensagens únicas`);
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
    
    console.log(`📱 Buscando conversa: ${phoneNumber}`);
    console.log(`📊 Cache status: ${conversationCache.size} conversas, ${messageCache.size} mensagens`);
    
    // Buscar conversa do cache
    const conversation = conversationCache.get(phoneNumber);
    
    if (!conversation) {
      console.log(`⚠️ Conversa ${phoneNumber} não encontrada no cache`);
      
      // Se não tem cache, retornar vazio e forçar sincronização
      if (messageCache.size === 0) {
        console.log('🔄 Cache vazio, iniciando sincronização...');
        // Iniciar sincronização em background
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        fetchAllMessages({ after: twoDaysAgo.toISOString() }).catch(console.error);
        
        res.json({
          messages: [],
          totalMessages: 0,
          isLive: false,
          needsSync: true
        });
      } else {
        // Buscar no cache de mensagens
        const messagesFromCache = [];
        messageCache.forEach(msg => {
          if (msg.from === phoneNumber || msg.to === phoneNumber) {
            messagesFromCache.push(msg);
          }
        });
        
        console.log(`📦 ${messagesFromCache.length} mensagens encontradas no cache geral`);
        
        // Ordenar por data
        const sortedMessages = messagesFromCache
          .sort((a, b) => new Date(a.dateSent || a.dateCreated) - new Date(b.dateSent || b.dateCreated));
        
        res.json({
          messages: sortedMessages,
          totalMessages: sortedMessages.length,
          isLive: false,
          fromCache: true
        });
      }
    } else {
      console.log(`✅ Conversa encontrada: ${conversation.messages.length} mensagens`);
      
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
    console.error('❌ Erro ao buscar conversa:', error);
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
    
    const { days = 7 } = req.body; // Permitir especificar quantos dias buscar
    
    // Buscar mensagens dos últimos X dias
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    console.log(`Buscando mensagens dos últimos ${days} dias...`);
    await fetchAllMessages({ after: startDate.toISOString() });
    
    res.json({
      success: true,
      totalMessages: messageCache.size,
      conversations: conversationCache.size,
      lastSync: lastApiCall,
      period: `Últimos ${days} dias`
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

// Endpoint para verificar status do cache
app.get('/api/cache-status', (req, res) => {
  res.json({
    hasCache: messageCache.size > 0,
    messagesInCache: messageCache.size,
    conversationsInCache: conversationCache.size,
    lastSync: lastApiCall,
    isUpdating: isUpdating,
    isDemoMode: isDemoMode
  });
});

// Endpoint para limpar cache do servidor e forçar nova sincronização
app.post('/api/clear-cache', async (req, res) => {
  try {
    console.log('🗑️ Limpando cache do servidor...');
    
    // Limpar caches
    messageCache.clear();
    conversationCache.clear();
    lastApiCall = null;
    
    // Deletar arquivos de backup se existirem
    const exportDir = path.join(__dirname, 'exported_messages');
    if (fs.existsSync(exportDir)) {
      const folders = fs.readdirSync(exportDir);
      folders.forEach(folder => {
        const folderPath = path.join(exportDir, folder);
        if (fs.statSync(folderPath).isDirectory()) {
          fs.rmSync(folderPath, { recursive: true, force: true });
        }
      });
    }
    
    console.log('✅ Cache limpo com sucesso');
    
    // Notificar clientes
    io.emit('cache-cleared', {
      timestamp: new Date()
    });
    
    // Iniciar nova sincronização
    console.log('🔄 Iniciando nova sincronização...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await fetchAllMessages({ after: thirtyDaysAgo.toISOString() });
    
    res.json({
      success: true,
      message: 'Cache limpo e sincronização iniciada',
      newMessageCount: messageCache.size
    });
  } catch (error) {
    console.error('Erro ao limpar cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// Inicialização
async function initialize() {
  console.log('🚀 Iniciando MiloView...');
  
  // Tentar carregar cache de arquivo primeiro
  const fileLoaded = await loadFileCache();
  
  if (!fileLoaded || messageCache.size === 0) {
    console.log('🔄 Nenhum cache encontrado. Iniciando sincronização inicial completa...');
    
    // Notificar clientes que está fazendo sync inicial
    io.emit('initial-sync-started', {
      message: 'Sincronizando mensagens dos últimos 30 dias...',
      timestamp: new Date()
    });
    
    // Buscar mensagens dos últimos 30 dias na primeira vez
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await fetchAllMessages({ after: thirtyDaysAgo.toISOString() });
    
    io.emit('initial-sync-complete', {
      totalMessages: messageCache.size,
      timestamp: new Date()
    });
    
    console.log(`✅ Sincronização inicial completa: ${messageCache.size} mensagens`);
  } else {
    console.log(`📦 Cache carregado: ${messageCache.size} mensagens`);
    
    // Buscar apenas mensagens novas desde o último cache
    await fetchNewMessages();
  }
  
  // Configurar atualização automática a cada 10 segundos
  setInterval(async () => {
    await fetchNewMessages();
  }, 10000);
  
  // Sincronização de mensagens recentes a cada 2 minutos
  setInterval(async () => {
    console.log('🔄 Sincronização periódica...');
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
    await fetchAllMessages({ after: twoHoursAgo.toISOString() });
  }, 120000);
  
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor em tempo real rodando`);
    console.log(`📡 URL: http://${HOST}:${PORT}`);
    console.log(`🔌 WebSocket disponível na porta ${PORT}`);
    console.log(`💾 Cache: ${messageCache.size} mensagens, ${conversationCache.size} conversas`);
    console.log(`✅ Pronto para produção!`);
  });
}

initialize().catch(console.error);