# 📱 Twilio Messages Viewer - Real-Time

Sistema completo para visualizar e gerenciar mensagens do Twilio em tempo real com interface moderna estilo WhatsApp.

## ✨ Funcionalidades

- 🔄 **Sincronização em tempo real** via WebSocket
- 💬 **Interface estilo WhatsApp** responsiva
- 📥 **Carregamento automático** de todas as mensagens
- 🔍 **Busca de conversas** instantânea
- 💾 **Cache inteligente** para performance
- 📊 **Indicadores visuais** de status e conexão
- 📤 **Exportação de conversas** em texto
- 🔔 **Notificações** de novas mensagens

## 🚀 Deploy Rápido no Railway

### 1. Preparação
- Crie uma conta no [Railway](https://railway.app)
- Tenha suas credenciais Twilio prontas:
  - Account SID
  - Auth Token
  - Phone Number

### 2. Deploy com 1 Click

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/deploy)

### 3. Configure as Variáveis de Ambiente

No Railway, adicione estas variáveis:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
PORT=3000
```

### 4. Deploy Manual (Alternativa)

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/joker.git
cd joker

# Instale Railway CLI
npm install -g @railway/cli

# Login no Railway
railway login

# Crie novo projeto
railway init

# Configure variáveis
railway variables set TWILIO_ACCOUNT_SID=xxx
railway variables set TWILIO_AUTH_TOKEN=xxx
railway variables set TWILIO_PHONE_NUMBER=xxx

# Deploy
railway up
```

## 💻 Instalação Local

### Requisitos
- Node.js 18+
- Conta Twilio com credenciais

### Passos

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/joker.git
cd joker
```

2. **Instale dependências**
```bash
npm install
```

3. **Configure variáveis de ambiente**
```bash
# Crie arquivo .env
cp .env.example .env

# Edite com suas credenciais
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number
```

4. **Inicie o servidor**
```bash
npm start
```

5. **Acesse no navegador**
```
http://localhost:3000
```

## 📖 Como Usar

1. **Primeira vez:**
   - Ao abrir, o sistema carrega automaticamente as mensagens do cache
   - Clique no botão 📥 para sincronizar TODAS as mensagens do Twilio

2. **Navegação:**
   - Lista de conversas na esquerda
   - Clique em uma conversa para ver mensagens
   - Use a busca para filtrar conversas

3. **Recursos:**
   - ⟳ Atualizar conversa atual
   - 📥 Sincronizar todo histórico
   - 💾 Exportar conversa em texto
   - 🟢 Indicador de conexão em tempo real

## 🔧 Estrutura do Projeto

```
joker/
├── server-realtime.js    # Servidor principal com WebSocket
├── public/
│   ├── index.html       # Interface HTML
│   ├── app-realtime.js  # Cliente JavaScript
│   └── styles.css       # Estilos
├── exported_messages/   # Cache local de mensagens
├── .env                 # Variáveis de ambiente (não commitado)
├── package.json         # Dependências
└── railway.json         # Configuração Railway
```

## 🔒 Segurança

- Credenciais Twilio ficam apenas no servidor
- Nunca exponha AUTH_TOKEN no frontend
- Use HTTPS em produção (Railway fornece automaticamente)
- Configure CORS adequadamente

## 📊 Performance

- Cache em memória para acesso instantâneo
- Sincronização incremental a cada 30 segundos
- WebSocket para atualizações em tempo real
- Paginação otimizada para grandes volumes

## 🐛 Troubleshooting

**Erro de conexão WebSocket:**
- Verifique se a porta não está bloqueada
- Railway configura WebSocket automaticamente

**Mensagens não carregam:**
- Verifique credenciais Twilio
- Confirme que tem mensagens na conta

**Cache desatualizado:**
- Use botão 📥 para forçar sincronização
- Delete pasta `exported_messages` para reset

## 📝 Licença

MIT

## 👨‍💻 Autor

Desenvolvido com ❤️ para facilitar o gerenciamento de mensagens Twilio

---

**Dúvidas?** Abra uma issue no GitHub!