# 🚫 Sistema de Bloqueio de Números - Twilio

## 📋 Visão Geral

O Twilio oferece várias formas de bloquear números indesejados. Este sistema implementa um bloqueio local com opção de integração com webhooks do Twilio.

## 🔧 Métodos de Bloqueio Disponíveis

### 1. **Bloqueio Local (Implementado)**
- ✅ Lista de bloqueio armazenada localmente
- ✅ Resposta automática para números bloqueados
- ✅ Gerenciamento via API REST
- ✅ Notificações em tempo real via WebSocket

### 2. **Bloqueio via Webhook Twilio**
- Configurar webhook no painel Twilio
- Filtrar mensagens antes de processar
- Responder automaticamente com TwiML

### 3. **Bloqueio via Twilio Verify**
- Usar serviço Verify para lista de bloqueio
- Mais robusto para grandes volumes

## 🎯 Como Usar

### Bloquear um Número

**Via API:**
```bash
curl -X POST http://localhost:3000/api/block-number \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+5511999999999", "action": "block"}'
```

**Resposta:**
```json
{
  "success": true,
  "action": "block",
  "phoneNumber": "+5511999999999",
  "totalBlocked": 1,
  "blockedNumbers": ["+5511999999999"]
}
```

### Desbloquear um Número

```bash
curl -X POST http://localhost:3000/api/block-number \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+5511999999999", "action": "unblock"}'
```

### Listar Números Bloqueados

```bash
curl http://localhost:3000/api/blocked-numbers
```

**Resposta:**
```json
{
  "success": true,
  "count": 2,
  "numbers": [
    "+5511999999999",
    "+5511888888888"
  ]
}
```

### Verificar se Número está Bloqueado

```bash
curl http://localhost:3000/api/check-blocked/+5511999999999
```

**Resposta:**
```json
{
  "phoneNumber": "+5511999999999",
  "isBlocked": true,
  "timestamp": "2025-08-10T23:45:00.000Z"
}
```

## 🔌 Configuração do Webhook no Twilio

Para ativar o bloqueio automático de mensagens:

### 1. No Painel Twilio

1. Acesse [Twilio Console](https://www.twilio.com/console/phone-numbers)
2. Selecione seu número
3. Em **Messaging**, configure:
   - **Webhook URL**: `https://seu-servidor.com/api/sms-webhook`
   - **Method**: POST

### 2. Resposta Automática

Quando um número bloqueado enviar mensagem, receberá:
```
"Seu número foi bloqueado e suas mensagens não serão recebidas."
```

## 💾 Arquivo de Bloqueio

Os números bloqueados são salvos em:
```
blocked_numbers.json
```

**Formato:**
```json
[
  "+5511999999999",
  "+5511888888888",
  "+5511777777777"
]
```

## 🛠️ Funções Disponíveis

### `localBlockList(phoneNumber, action)`
- **action**: 'block' ou 'unblock'
- Gerencia lista local de bloqueio

### `isBlocked(phoneNumber)`
- Verifica se número está bloqueado
- Retorna: boolean

### `listBlockedNumbers()`
- Lista todos os números bloqueados
- Retorna: array de números

### `setupAutoReply(blockedNumber, message)`
- Configura resposta automática personalizada
- Retorna: TwiML response

## 🔄 Integração com Interface

O sistema notifica a interface em tempo real quando:
- Um número é bloqueado/desbloqueado
- Uma mensagem é bloqueada

**Evento WebSocket:**
```javascript
socket.on('number-blocked', (data) => {
  console.log(`Número ${data.phoneNumber} foi ${data.action}`);
});
```

## ⚠️ Limitações e Considerações

### Bloqueio Local
- ✅ Rápido e simples
- ✅ Sem custo adicional
- ⚠️ Só funciona no seu servidor
- ⚠️ Mensagens ainda contam no limite Twilio

### Bloqueio via Webhook
- ✅ Mensagem não é processada
- ✅ Resposta automática
- ⚠️ Precisa servidor público (HTTPS)
- ⚠️ Mensagem ainda é cobrada

### Para Bloqueio Total
Para bloquear ANTES da cobrança, contate o suporte Twilio para:
- Adicionar números à blacklist da conta
- Configurar filtros avançados
- Usar Twilio Verify Service

## 📊 Exemplo de Uso Completo

```javascript
// 1. Bloquear número problemático
await fetch('/api/block-number', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: '+5511999999999',
    action: 'block'
  })
});

// 2. Verificar lista de bloqueados
const response = await fetch('/api/blocked-numbers');
const blocked = await response.json();
console.log(`Total bloqueados: ${blocked.count}`);

// 3. Checar antes de processar mensagem
const checkResponse = await fetch('/api/check-blocked/+5511999999999');
const { isBlocked } = await checkResponse.json();

if (isBlocked) {
  console.log('Número bloqueado - ignorar mensagem');
} else {
  console.log('Processar mensagem normalmente');
}
```

## 🚨 Troubleshooting

**Webhook não funciona:**
- Verifique se a URL é pública (HTTPS)
- Use ngrok para testes locais
- Confirme método POST no Twilio

**Mensagens ainda aparecem:**
- Bloqueio local não impede recebimento
- Configure webhook para filtrar
- Mensagens antigas continuam visíveis

**Auto-resposta não enviada:**
- Verifique saldo Twilio
- Confirme webhook configurado
- Teste com curl direto

## 📝 Notas Importantes

1. **Cobrança**: Mensagens bloqueadas ainda são cobradas pelo Twilio
2. **GDPR**: Mantenha registro de motivos de bloqueio
3. **Backup**: Faça backup regular do arquivo `blocked_numbers.json`
4. **Escala**: Para muitos bloqueios, considere banco de dados

---

💡 **Dica**: Para bloqueio em massa ou regras complexas, considere usar Twilio Studio ou Functions.