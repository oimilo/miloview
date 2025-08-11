# 🚂 Deploy no Railway - Guia Completo

## 📋 Pré-requisitos

1. **Conta no Railway**: Crie em [railway.app](https://railway.app)
2. **Conta no GitHub**: Para conectar o repositório
3. **Credenciais Twilio**:
   - Account SID (encontre em twilio.com/console)
   - Auth Token (encontre em twilio.com/console)
   - Phone Number (seu número Twilio)

## 🚀 Deploy Passo a Passo

### Opção 1: Deploy Direto do GitHub (Recomendado)

#### 1. Prepare seu repositório
```bash
# Se ainda não tem um repositório
git init
git add .
git commit -m "Initial commit - Twilio Messages Viewer"

# Crie repositório no GitHub e faça push
git remote add origin https://github.com/SEU-USUARIO/joker.git
git push -u origin main
```

#### 2. No Railway Dashboard

1. Clique em **"New Project"**
2. Escolha **"Deploy from GitHub repo"**
3. Autorize o Railway a acessar seu GitHub
4. Selecione o repositório **joker**
5. Railway detectará automaticamente que é um projeto Node.js

#### 3. Configure Variáveis de Ambiente

No Railway, vá em **Variables** e adicione:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+5511999999999
PORT=${{PORT}}  # Railway define automaticamente
```

⚠️ **IMPORTANTE**: Use suas credenciais reais do Twilio!

#### 4. Deploy Automático

Railway fará o deploy automaticamente. Acompanhe em **Deployments**.

#### 5. Acesse sua aplicação

1. Vá em **Settings** > **Domains**
2. Clique em **Generate Domain**
3. Sua app estará em: `seu-projeto.up.railway.app`

### Opção 2: Deploy via Railway CLI

#### 1. Instale Railway CLI
```bash
# Windows (PowerShell como Admin)
npm install -g @railway/cli

# Mac/Linux
curl -fsSL https://railway.app/install.sh | sh
```

#### 2. Login
```bash
railway login
```

#### 3. Crie novo projeto
```bash
# Na pasta do projeto
cd F:\Cursor\Joker

# Inicie projeto Railway
railway init
```

#### 4. Configure variáveis
```bash
railway variables set TWILIO_ACCOUNT_SID=ACxxxxx
railway variables set TWILIO_AUTH_TOKEN=xxxxx
railway variables set TWILIO_PHONE_NUMBER=+5511999999999
```

#### 5. Deploy
```bash
railway up
```

#### 6. Abra no navegador
```bash
railway open
```

## 🔧 Configurações Importantes

### Variáveis de Ambiente no Railway

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `TWILIO_ACCOUNT_SID` | ID da conta Twilio | `ACxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Token de autenticação | `xxxxxxxxxxxxxxxx` |
| `TWILIO_PHONE_NUMBER` | Seu número Twilio | `+5511999999999` |
| `PORT` | Porta (Railway define) | Use `${{PORT}}` |

### Domínio Customizado (Opcional)

1. Em **Settings** > **Domains**
2. Clique em **Add Custom Domain**
3. Configure seu domínio e CNAME

## 📊 Monitoramento

### Logs em Tempo Real
```bash
# Via CLI
railway logs

# Ou no Dashboard
# Deployments > View Logs
```

### Health Check
Acesse: `https://seu-app.railway.app/health`

Retorna:
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "messagesInCache": 7444,
  "conversationsInCache": 505
}
```

## 🚨 Troubleshooting

### Erro: "Application failed to respond"
**Solução**: Verifique se as variáveis de ambiente estão configuradas

### Erro: "Invalid credentials"
**Solução**: Confirme TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN

### WebSocket não conecta
**Solução**: Railway suporta WebSocket nativamente, verifique o console do navegador

### Build falha
**Solução**: Certifique que `package.json` tem o script `start`:
```json
"scripts": {
  "start": "node server-realtime.js"
}
```

## 🔄 Atualizações

### Deploy Automático
Cada push para `main` faz deploy automático

### Deploy Manual
```bash
railway up
```

## 💰 Custos

### Plano Starter (Grátis)
- $5 de crédito mensal
- Suficiente para projetos pequenos
- ~500 horas de execução

### Plano Developer ($5/mês)
- Projetos ilimitados
- Mais recursos
- Suporte prioritário

## 🎯 Dicas de Performance

1. **Cache Local**: Sistema já mantém cache em memória
2. **Sincronização**: Automática a cada 30 segundos
3. **WebSocket**: Atualizações em tempo real sem polling
4. **Compressão**: Railway ativa gzip automaticamente

## 🔒 Segurança

✅ **Railway fornece automaticamente:**
- HTTPS/SSL
- Proteção DDoS
- Isolamento de ambiente
- Backups automáticos

✅ **Boas práticas implementadas:**
- Credenciais em variáveis de ambiente
- CORS configurado
- Sem exposição de tokens no frontend

## 📱 Após o Deploy

1. **Primeira vez:**
   - Acesse a URL gerada
   - Sistema carrega cache automaticamente
   - Clique 📥 para sincronizar todo histórico

2. **Uso contínuo:**
   - Mensagens atualizam em tempo real
   - WebSocket reconecta automaticamente
   - Cache persiste entre deploys

## 🆘 Suporte

- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Discord Railway**: [discord.gg/railway](https://discord.gg/railway)
- **Issues do Projeto**: GitHub Issues

---

🎉 **Pronto!** Sua aplicação está no ar com atualizações em tempo real!