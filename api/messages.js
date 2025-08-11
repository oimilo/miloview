// Vercel API Route - /api/messages
export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    return res.status(500).json({ error: 'Credenciais Twilio não configuradas' });
  }
  
  const client = require('twilio')(accountSid, authToken);
  
  try {
    // Buscar mensagens
    const messages = await client.messages.list({ limit: 100 });
    
    // Agrupar por conversa
    const conversations = {};
    
    messages.forEach(msg => {
      const contactNumber = msg.direction === 'inbound' ? msg.from : msg.to;
      
      if (!conversations[contactNumber]) {
        conversations[contactNumber] = {
          contactNumber,
          messages: [],
          lastMessage: msg.body,
          lastMessageDate: msg.dateSent || msg.dateCreated,
          totalMessages: 0
        };
      }
      
      conversations[contactNumber].messages.push({
        sid: msg.sid,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        status: msg.status,
        direction: msg.direction,
        dateSent: msg.dateSent,
        dateCreated: msg.dateCreated
      });
      conversations[contactNumber].totalMessages++;
    });
    
    // Converter em array e ordenar
    const conversationList = Object.values(conversations)
      .sort((a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate));
    
    res.status(200).json(conversationList);
    
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
}