# 🚀 Guia de Deploy - Twilio Messages Viewer

## ⚠️ Importante: Este app PRECISA de Backend

O backend é necessário para:
- Proteger suas credenciais Twilio (ACCOUNT_SID e AUTH_TOKEN)
- Fazer chamadas à API do Twilio (não funciona direto do navegador)
- WebSocket para atualizações em tempo real
- Cache server-side para performance

## 📦 Opções de Deploy

### 1. Railway (Recomendado) ✅
**Suporta: Backend completo + WebSocket**

1. Crie conta em [railway.app](https://railway.app)
2. Conecte seu GitHub
3. Deploy direto do repositório
4. Configure variáveis de ambiente:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`

### 2. Render ✅
**Suporta: Backend completo + WebSocket**

1. Crie conta em [render.com](https://render.com)
2. New > Web Service
3. Conecte repositório GitHub
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Adicione variáveis de ambiente

### 3. Heroku ✅
**Suporta: Backend completo + WebSocket**

```bash
# Instalar Heroku CLI
heroku create seu-app-name
heroku config:set TWILIO_ACCOUNT_SID=xxx
heroku config:set TWILIO_AUTH_TOKEN=xxx
heroku config:set TWILIO_PHONE_NUMBER=xxx
git push heroku main
```

### 4. Vercel ⚠️
**Limitado: Apenas API Routes, sem WebSocket**

1. Instale Vercel CLI: `npm i -g vercel`
2. Configure secrets:
```bash
vercel secrets add twilio-account-sid "SEU_SID"
vercel secrets add twilio-auth-token "SEU_TOKEN"
vercel secrets add twilio-phone-number "SEU_NUMERO"
```
3. Deploy: `vercel`

**Nota**: Vercel não suporta WebSocket, então perderá atualizações em tempo real.

### 5. Netlify ❌
**NÃO suporta backend Node.js tradicional**
- Apenas Functions serverless
- Precisaria reescrever todo o backend

## 🔧 Configuração Local para Deploy

### 1. Clone o repositório
```bash
git clone seu-repo
cd joker
```

### 2. Instale dependências
```bash
npm install
```

### 3. Configure variáveis de ambiente
Crie arquivo `.env`:
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number
PORT=3000
```

### 4. Teste localmente
```bash
npm start
```
Acesse: http://localhost:3000

## 🎯 Recomendação Final

**Para melhor experiência, use Railway ou Render:**
- ✅ Deploy fácil (conecta GitHub)
- ✅ Suporta WebSocket (tempo real)
- ✅ Free tier disponível
- ✅ Variáveis de ambiente seguras
- ✅ SSL automático (HTTPS)

## 📱 Após o Deploy

1. Acesse sua URL (ex: `seu-app.railway.app`)
2. Interface carregará automaticamente
3. Mensagens sincronizam em tempo real
4. Use botão 📥 para sincronizar todo histórico

## 🔒 Segurança

**NUNCA:**
- Commite credenciais no código
- Exponha AUTH_TOKEN no frontend
- Use credenciais em cliente-side

**SEMPRE:**
- Use variáveis de ambiente
- Mantenha credenciais no servidor
- Use HTTPS em produção