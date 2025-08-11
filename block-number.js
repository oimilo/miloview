require('dotenv').config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require('twilio')(accountSid, authToken);

// ============================================
// MÉTODOS DE BLOQUEIO NO TWILIO
// ============================================

// Método 1: Adicionar número à lista de bloqueio (Blacklist)
async function addToBlacklist(phoneNumber) {
  try {
    // Criar ou usar uma lista de bloqueio existente
    const incomingPhoneNumber = await client.incomingPhoneNumbers
      .list({ phoneNumber: process.env.TWILIO_PHONE_NUMBER, limit: 1 });
    
    if (incomingPhoneNumber.length > 0) {
      // Atualizar webhook para filtrar números bloqueados
      await client.incomingPhoneNumbers(incomingPhoneNumber[0].sid)
        .update({
          smsUrl: `https://seu-servidor.com/api/sms-webhook?blocked=${phoneNumber}`,
          voiceUrl: `https://seu-servidor.com/api/voice-webhook?blocked=${phoneNumber}`
        });
      
      console.log(`✅ Número ${phoneNumber} adicionado à blacklist`);
      return { success: true, method: 'webhook_filter' };
    }
  } catch (error) {
    console.error('Erro ao adicionar à blacklist:', error);
    return { success: false, error: error.message };
  }
}

// Método 2: Usar Twilio Verify para criar lista de bloqueio
async function createBlockList(numbers) {
  try {
    // Verificar se o serviço Verify existe
    const services = await client.verify.v2.services.list({ limit: 1 });
    let serviceId;
    
    if (services.length === 0) {
      // Criar novo serviço Verify
      const service = await client.verify.v2.services.create({
        friendlyName: 'Message Blocker Service'
      });
      serviceId = service.sid;
    } else {
      serviceId = services[0].sid;
    }
    
    // Adicionar números à lista de bloqueio
    for (const number of numbers) {
      await client.verify.v2.services(serviceId)
        .entities.create({
          identity: number
        });
      console.log(`📵 Bloqueado: ${number}`);
    }
    
    return { success: true, serviceId, blockedCount: numbers.length };
  } catch (error) {
    console.error('Erro ao criar lista de bloqueio:', error);
    return { success: false, error: error.message };
  }
}

// Método 3: Implementar bloqueio local com webhook
async function localBlockList(phoneNumber, action = 'block') {
  const fs = require('fs');
  const path = require('path');
  const blockListFile = path.join(__dirname, 'blocked_numbers.json');
  
  try {
    // Ler lista atual
    let blockedNumbers = [];
    if (fs.existsSync(blockListFile)) {
      blockedNumbers = JSON.parse(fs.readFileSync(blockListFile, 'utf8'));
    }
    
    if (action === 'block') {
      // Adicionar número se não existir
      if (!blockedNumbers.includes(phoneNumber)) {
        blockedNumbers.push(phoneNumber);
        console.log(`🚫 Bloqueado localmente: ${phoneNumber}`);
      }
    } else if (action === 'unblock') {
      // Remover número
      blockedNumbers = blockedNumbers.filter(num => num !== phoneNumber);
      console.log(`✅ Desbloqueado: ${phoneNumber}`);
    }
    
    // Salvar lista atualizada
    fs.writeFileSync(blockListFile, JSON.stringify(blockedNumbers, null, 2));
    
    return { 
      success: true, 
      action, 
      phoneNumber,
      totalBlocked: blockedNumbers.length,
      blockedNumbers 
    };
  } catch (error) {
    console.error('Erro ao gerenciar lista de bloqueio:', error);
    return { success: false, error: error.message };
  }
}

// Método 4: Configurar resposta automática para números bloqueados
async function setupAutoReply(blockedNumber, replyMessage = 'Este número foi bloqueado.') {
  try {
    // Criar TwiML para resposta automática
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${replyMessage}</Message>
</Response>`;
    
    // Configurar webhook condicional
    console.log(`📨 Auto-resposta configurada para ${blockedNumber}`);
    console.log(`Mensagem: "${replyMessage}"`);
    
    return { 
      success: true, 
      twiml,
      message: replyMessage 
    };
  } catch (error) {
    console.error('Erro ao configurar auto-resposta:', error);
    return { success: false, error: error.message };
  }
}

// Função para verificar se número está bloqueado
async function isBlocked(phoneNumber) {
  const fs = require('fs');
  const path = require('path');
  const blockListFile = path.join(__dirname, 'blocked_numbers.json');
  
  try {
    if (fs.existsSync(blockListFile)) {
      const blockedNumbers = JSON.parse(fs.readFileSync(blockListFile, 'utf8'));
      return blockedNumbers.includes(phoneNumber);
    }
    return false;
  } catch (error) {
    console.error('Erro ao verificar bloqueio:', error);
    return false;
  }
}

// Função para listar todos os números bloqueados
async function listBlockedNumbers() {
  const fs = require('fs');
  const path = require('path');
  const blockListFile = path.join(__dirname, 'blocked_numbers.json');
  
  try {
    if (fs.existsSync(blockListFile)) {
      const blockedNumbers = JSON.parse(fs.readFileSync(blockListFile, 'utf8'));
      return {
        success: true,
        count: blockedNumbers.length,
        numbers: blockedNumbers
      };
    }
    return {
      success: true,
      count: 0,
      numbers: []
    };
  } catch (error) {
    console.error('Erro ao listar números bloqueados:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// EXEMPLOS DE USO
// ============================================

async function examples() {
  // Exemplo 1: Bloquear um número localmente
  console.log('\n=== Bloqueio Local ===');
  const blockResult = await localBlockList('+5511999999999', 'block');
  console.log(blockResult);
  
  // Exemplo 2: Verificar se número está bloqueado
  console.log('\n=== Verificar Bloqueio ===');
  const blocked = await isBlocked('+5511999999999');
  console.log(`Número está bloqueado: ${blocked}`);
  
  // Exemplo 3: Listar números bloqueados
  console.log('\n=== Lista de Bloqueados ===');
  const list = await listBlockedNumbers();
  console.log(list);
  
  // Exemplo 4: Configurar auto-resposta
  console.log('\n=== Auto-Resposta ===');
  const autoReply = await setupAutoReply(
    '+5511999999999', 
    'Seu número foi bloqueado. Entre em contato com o suporte.'
  );
  console.log(autoReply);
  
  // Exemplo 5: Desbloquear número
  console.log('\n=== Desbloquear ===');
  const unblockResult = await localBlockList('+5511999999999', 'unblock');
  console.log(unblockResult);
}

// Exportar funções para uso em outros arquivos
module.exports = {
  addToBlacklist,
  createBlockList,
  localBlockList,
  setupAutoReply,
  isBlocked,
  listBlockedNumbers
};

// Se executado diretamente, rodar exemplos
if (require.main === module) {
  examples().catch(console.error);
}