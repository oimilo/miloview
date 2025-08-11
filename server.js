require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/conversations', async (req, res) => {
  try {
    const { dateSentAfter, dateSentBefore, pageSize = 200, loadAll = false } = req.query;
    
    let messages = [];
    
    if (loadAll === 'true') {
      // Carregar TODAS as mensagens usando paginação
      console.log('Carregando todas as mensagens...');
      let hasMore = true;
      let page = null;
      let pageCount = 0;
      
      while (hasMore) {
        pageCount++;
        
        if (!page) {
          page = await client.messages.page({ pageSize: 1000 });
        } else {
          const nextPage = await page.nextPage();
          if (!nextPage) {
            hasMore = false;
            break;
          }
          page = nextPage;
        }
        
        messages = messages.concat(page.instances);
        console.log(`Página ${pageCount}: ${page.instances.length} mensagens (Total: ${messages.length})`);
        
        if (page.instances.length < 1000) {
          hasMore = false;
        }
      }
    } else {
      // Modo padrão - carregar número limitado
      const options = {
        limit: parseInt(pageSize)
      };
      
      if (dateSentAfter) {
        options.dateSentAfter = new Date(dateSentAfter);
      }
      
      if (dateSentBefore) {
        options.dateSentBefore = new Date(dateSentBefore);
      }
      
      messages = await client.messages.list(options);
    }
    
    const formattedMessages = messages.map(msg => ({
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
    
    // Agrupar mensagens por conversa
    const conversations = {};
    const userPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    
    formattedMessages.forEach(msg => {
      // Determinar o número do contato (não o seu próprio número)
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
      
      // Atualizar última mensagem
      const msgDate = new Date(msg.dateSent || msg.dateCreated);
      if (!conversations[contactNumber].lastMessageDate || msgDate > conversations[contactNumber].lastMessageDate) {
        conversations[contactNumber].lastMessage = msg.body;
        conversations[contactNumber].lastMessageDate = msgDate;
      }
    });
    
    // Converter objeto em array e ordenar por data da última mensagem
    const conversationList = Object.values(conversations)
      .sort((a, b) => b.lastMessageDate - a.lastMessageDate);
    
    res.json(conversationList);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/api/conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { pageSize = 100, loadAll = false } = req.query;
    
    let messages = [];
    
    if (loadAll === 'true') {
      // Carregar TODAS as mensagens
      let hasMore = true;
      let page = null;
      
      while (hasMore) {
        if (!page) {
          page = await client.messages.page({ pageSize: 1000 });
        } else {
          const nextPage = await page.nextPage();
          if (!nextPage) {
            hasMore = false;
            break;
          }
          page = nextPage;
        }
        
        messages = messages.concat(page.instances);
        
        if (page.instances.length < 1000) {
          hasMore = false;
        }
      }
    } else {
      messages = await client.messages.list({ limit: parseInt(pageSize) });
    }
    
    // Filtrar mensagens para este número específico
    const conversationMessages = messages
      .filter(msg => msg.from === phoneNumber || msg.to === phoneNumber)
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
    
    res.json(conversationMessages);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.get('/api/message/:sid', async (req, res) => {
  try {
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});