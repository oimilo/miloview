let socket = null;
let allConversations = [];
let currentConversation = null;
let currentMessages = [];
let isConnected = false;
let autoRefreshInterval = null;
let blockedNumbers = [];
let currentTab = 'conversations';

// Gerenciar sessão
let sessionId = localStorage.getItem('sessionId');

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sessão antes de inicializar
    if (!sessionId) {
        window.location.href = '/login.html';
        return;
    }
    initializeApp();
});

// Adicionar sessionId em todas as requisições
async function fetchWithAuth(url, options = {}) {
    if (!sessionId) {
        window.location.href = '/login.html';
        return;
    }
    
    const authOptions = {
        ...options,
        headers: {
            ...options.headers,
            'X-Session-Id': sessionId
        }
    };
    
    const response = await fetch(url, authOptions);
    
    if (response.status === 401) {
        localStorage.removeItem('sessionId');
        window.location.href = '/login.html';
        throw new Error('Sessão expirada');
    }
    
    return response;
}

async function initializeApp() {
    // Conectar ao WebSocket com autenticação
    connectWebSocket();
    
    // Verificar status do cache primeiro
    const cacheStatus = await checkCacheStatus();
    
    if (!cacheStatus.hasCache) {
        // Mostrar tela de sincronização inicial
        showInitialSyncScreen();
    }
    
    // Carregar números bloqueados ANTES das conversas
    await loadBlockedNumbers();
    
    // Carregar conversas iniciais
    await loadConversations();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Auto-refresh a cada 10 segundos (backup caso WebSocket falhe)
    autoRefreshInterval = setInterval(() => {
        if (!isConnected) {
            loadConversations(false, false, true);
        }
    }, 10000);
}

function connectWebSocket() {
    // Conectar ao servidor WebSocket
    socket = io(window.location.origin);
    
    socket.on('connect', () => {
        console.log('WebSocket conectado');
        isConnected = true;
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', () => {
        console.log('WebSocket desconectado');
        isConnected = false;
        updateConnectionStatus(false);
    });
    
    socket.on('connection-status', (data) => {
        console.log('Status da conexão:', data);
        updateStatusBar(data);
    });
    
    socket.on('messages-updated', (data) => {
        console.log('Mensagens atualizadas:', data);
        showNotification(`${data.totalMessages} mensagens carregadas`);
        loadConversations(false);
    });
    
    socket.on('new-messages', (data) => {
        console.log('Novas mensagens:', data);
        showNotification(`${data.count} novas mensagens recebidas`);
        loadConversations(false);
        
        // Se estiver em uma conversa, atualizar
        if (currentConversation) {
            loadConversationMessages(currentConversation, false);
        }
    });
    
    socket.on('loading-progress', (data) => {
        updateLoadingProgress(data);
    });
    
    socket.on('initial-sync-started', (data) => {
        console.log('Sincronização inicial iniciada:', data);
        showInitialSyncScreen();
    });
    
    socket.on('initial-sync-complete', (data) => {
        console.log('Sincronização inicial completa:', data);
        hideInitialSyncScreen();
        showNotification(`✅ ${data.totalMessages} mensagens sincronizadas!`);
        loadConversations(true);
    });
    
    socket.on('full-update-complete', () => {
        showNotification('Atualização completa concluída');
        loadConversations(true);
    });
    
    socket.on('update-error', (error) => {
        showNotification(`Erro na atualização: ${error}`, 'error');
    });
}

function updateConnectionStatus(connected) {
    const header = document.querySelector('.messages-title h1');
    if (!header) return;
    
    // Remover indicador anterior
    const oldIndicator = header.querySelector('.connection-indicator');
    if (oldIndicator) oldIndicator.remove();
    
    // Adicionar novo indicador
    const indicator = document.createElement('span');
    indicator.className = 'connection-indicator';
    indicator.style.cssText = `
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-left: 10px;
        background: ${connected ? '#25d366' : '#f44336'};
        animation: ${connected ? 'pulse 2s infinite' : 'none'};
    `;
    indicator.title = connected ? 'Conectado - Atualizações em tempo real' : 'Desconectado';
    
    header.appendChild(indicator);
    
    // Adicionar animação CSS se não existir
    if (!document.querySelector('#pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'pulse-animation';
        style.innerHTML = `
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

function updateStatusBar(status) {
    const header = document.querySelector('.messages-title h1');
    if (!header) return;
    
    // Remover badge anterior
    const oldBadge = header.querySelector('.status-badge');
    if (oldBadge) oldBadge.remove();
    
    // Adicionar novo badge
    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.style.cssText = `
        font-size: 11px;
        background: #0088cc;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 10px;
    `;
    badge.textContent = `${status.messagesInCache} msgs`;
    badge.title = `${status.messagesInCache} mensagens | ${status.conversationsInCache} conversas | Última atualização: ${formatTime(status.lastUpdate)}`;
    
    header.appendChild(badge);
}

function updateLoadingProgress(progress) {
    // Se é sincronização inicial, atualizar tela especial
    if (progress.isInitialSync) {
        updateInitialSyncProgress(progress);
        return;
    }
    
    // Criar ou atualizar barra de progresso
    let progressBar = document.querySelector('.loading-progress-bar');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.className = 'loading-progress-bar';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #25d366 0%, #128c7e 100%);
            z-index: 9999;
            transition: width 0.3s;
        `;
        document.body.appendChild(progressBar);
    }
    
    // Mostrar contador de mensagens
    let progressText = document.querySelector('.loading-progress-text');
    if (!progressText) {
        progressText = document.createElement('div');
        progressText.className = 'loading-progress-text';
        progressText.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 9999;
        `;
        document.body.appendChild(progressText);
    }
    
    progressText.textContent = progress.message || `Carregando: ${progress.current} mensagens`;
    
    // Remover após 3 segundos se não houver mais atualizações
    clearTimeout(progressText.hideTimeout);
    progressText.hideTimeout = setTimeout(() => {
        if (progressBar) progressBar.remove();
        if (progressText) progressText.remove();
    }, 3000);
}

// Função para verificar status do cache
async function checkCacheStatus() {
    try {
        const response = await fetchWithAuth('/api/cache-status');
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Erro ao verificar cache:', error);
    }
    return { hasCache: false, messagesInCache: 0 };
}

// Mostrar tela de sincronização inicial
function showInitialSyncScreen() {
    let syncScreen = document.querySelector('.initial-sync-screen');
    if (!syncScreen) {
        syncScreen = document.createElement('div');
        syncScreen.className = 'initial-sync-screen';
        syncScreen.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
        `;
        syncScreen.innerHTML = `
            <div style="text-align: center;">
                <h1 style="font-size: 48px; margin-bottom: 20px;">🚀</h1>
                <h2 style="font-size: 24px; margin-bottom: 10px;">Bem-vindo ao MiloView!</h2>
                <p style="font-size: 16px; opacity: 0.9; margin-bottom: 30px;">Sincronizando suas mensagens pela primeira vez...</p>
                <div class="sync-progress" style="
                    background: rgba(255,255,255,0.2);
                    border-radius: 10px;
                    padding: 20px;
                    min-width: 300px;
                ">
                    <div class="sync-counter" style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">0</div>
                    <div class="sync-message" style="font-size: 14px; opacity: 0.9;">Preparando...</div>
                </div>
                <div style="margin-top: 30px; font-size: 12px; opacity: 0.7;">
                    Isso pode levar alguns minutos na primeira vez
                </div>
            </div>
        `;
        document.body.appendChild(syncScreen);
    }
}

// Atualizar progresso da sincronização inicial
function updateInitialSyncProgress(progress) {
    const counter = document.querySelector('.sync-counter');
    const message = document.querySelector('.sync-message');
    if (counter) counter.textContent = progress.current;
    if (message) message.textContent = progress.message;
}

// Esconder tela de sincronização inicial
function hideInitialSyncScreen() {
    const syncScreen = document.querySelector('.initial-sync-screen');
    if (syncScreen) {
        syncScreen.style.animation = 'fadeOut 0.5s';
        setTimeout(() => syncScreen.remove(), 500);
    }
}

function showNotification(message, type = 'success') {
    // Criar notificação
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'error' ? '#f44336' : '#25d366'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    // Adicionar animação
    if (!document.querySelector('#notification-animation')) {
        const style = document.createElement('style');
        style.id = 'notification-animation';
        style.innerHTML = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remover após 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function setupEventListeners() {
    // Busca de conversas
    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });
    
    // Botão voltar (mobile)
    document.getElementById('backButton').addEventListener('click', () => {
        showConversationsList();
    });
    
    // Botão refresh
    document.getElementById('refreshButton').addEventListener('click', () => {
        if (currentConversation) {
            loadConversationMessages(currentConversation, true);
            showNotification('Conversa atualizada');
        }
    });
    
    // Botão bloquear
    document.getElementById('blockButton').addEventListener('click', () => {
        if (currentConversation) {
            toggleBlockNumber(currentConversation);
        }
    });
    
    // Abas
    document.getElementById('conversationsTab').addEventListener('click', () => {
        switchTab('conversations');
    });
    
    document.getElementById('spamTab').addEventListener('click', () => {
        switchTab('spam');
    });
    
    // Botão exportar
    document.getElementById('exportButton').addEventListener('click', () => {
        exportCurrentConversation();
    });
}

async function loadConversations(showLoading = true, useCache = true, updateOnly = false) {
    const conversationsList = document.getElementById('conversationsList');
    
    if (showLoading) {
        conversationsList.innerHTML = '<div class="loading-conversations">Carregando conversas...</div>';
    }
    
    try {
        const response = await fetchWithAuth('/api/conversations');
        
        if (!response.ok) {
            throw new Error(`Erro: ${response.status}`);
        }
        
        const data = await response.json();
        allConversations = data.conversations || [];
        
        console.log(`${allConversations.length} conversas carregadas (${data.totalMessages} mensagens total)`);
        
        displayConversations(allConversations);
        
        // Atualizar indicadores
        if (data.totalMessages) {
            updateStatusBar({
                messagesInCache: data.totalMessages,
                conversationsInCache: allConversations.length,
                lastUpdate: data.lastUpdate
            });
        }
        
        // Atualizar contadores das abas
        updateTabCounts();
        
    } catch (error) {
        console.error('Erro ao carregar conversas:', error);
        
        if (showLoading) {
            conversationsList.innerHTML = `
                <div class="loading-conversations" style="padding: 20px; text-align: center;">
                    <div style="color: #f44336; margin-bottom: 10px;">Erro ao carregar conversas</div>
                    <div style="font-size: 12px; color: #8696a0;">${error.message}</div>
                    <button onclick="loadConversations()" style="margin-top: 10px; padding: 8px 16px; background: #005c4b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Tentar Novamente
                    </button>
                </div>
            `;
        }
    }
}

function displayConversations(conversations) {
    const conversationsList = document.getElementById('conversationsList');
    
    // Filtrar conversas baseado na aba atual
    let filteredConversations = conversations;
    if (currentTab === 'conversations') {
        // Mostrar apenas não bloqueadas
        filteredConversations = conversations.filter(c => !blockedNumbers.includes(c.contactNumber));
    }
    
    if (filteredConversations.length === 0) {
        conversationsList.innerHTML = '<div class="loading-conversations">Nenhuma conversa encontrada</div>';
        return;
    }
    
    conversationsList.innerHTML = '';
    
    // Contador de conversas
    const counter = document.createElement('div');
    counter.style.cssText = 'padding: 10px; background: #111b21; color: #8696a0; font-size: 13px; border-bottom: 1px solid #2a3942;';
    counter.textContent = `${filteredConversations.length} conversas`;
    conversationsList.appendChild(counter);
    
    // Lista de conversas
    filteredConversations.forEach(conv => {
        const convElement = createConversationElement(conv);
        // Adicionar classe blocked se estiver bloqueado
        if (blockedNumbers.includes(conv.contactNumber)) {
            convElement.classList.add('blocked');
        }
        conversationsList.appendChild(convElement);
    });
    
    // Atualizar contadores das abas
    updateTabCounts();
}

function createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    if (currentConversation === conversation.contactNumber) {
        div.classList.add('active');
    }
    
    div.onclick = () => selectConversation(conversation);
    
    const initial = conversation.contactNumber.slice(-2);
    const lastMessageTime = formatTime(conversation.lastMessageDate);
    const lastMessagePreview = conversation.lastMessage ? 
        (conversation.lastMessage.length > 60 ? 
            conversation.lastMessage.substring(0, 60) + '...' : 
            conversation.lastMessage) : 
        'Sem mensagens';
    
    div.innerHTML = `
        <div class="conversation-avatar">${initial}</div>
        <div class="conversation-details">
            <div class="conversation-header">
                <span class="conversation-name">${formatPhoneNumber(conversation.contactNumber)}</span>
                <span class="conversation-time">${lastMessageTime}</span>
            </div>
            <div class="conversation-last-message">
                ${escapeHtml(lastMessagePreview)}
                <span style="font-size: 10px; color: #667781; margin-left: 5px;">${conversation.totalMessages} msgs</span>
            </div>
        </div>
    `;
    
    return div;
}

function selectConversation(conversation) {
    currentConversation = conversation.contactNumber;
    
    // Atualizar UI
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Atualizar botão de bloqueio
    const blockBtn = document.getElementById('blockButton');
    if (blockedNumbers.includes(conversation.contactNumber)) {
        blockBtn.innerHTML = '✅';
        blockBtn.title = 'Desbloquear número';
    } else {
        blockBtn.innerHTML = '🚫';
        blockBtn.title = 'Bloquear número';
    }
    
    // Carregar mensagens
    loadConversationMessages(conversation.contactNumber, true);
    
    // Mostrar área de chat
    showChatArea(conversation);
}

async function loadConversationMessages(phoneNumber, showLoading = true) {
    const messagesArea = document.getElementById('messagesArea');
    
    if (showLoading) {
        messagesArea.innerHTML = '<div class="loading-conversations">Carregando mensagens...</div>';
    }
    
    try {
        const response = await fetch(`/api/conversation/${encodeURIComponent(phoneNumber)}`);
        
        if (!response.ok) {
            throw new Error('Erro ao carregar mensagens');
        }
        
        const data = await response.json();
        currentMessages = data.messages || [];
        
        console.log(`${currentMessages.length} mensagens carregadas`);
        
        displayMessages(currentMessages);
        
        // Atualizar contador
        const contactStatus = document.getElementById('contactStatus');
        if (contactStatus) {
            contactStatus.textContent = `${currentMessages.length} mensagens ${data.isLive ? '• Ao vivo' : ''}`;
        }
        
    } catch (error) {
        console.error('Erro:', error);
        messagesArea.innerHTML = '<div class="loading-conversations">Erro ao carregar mensagens</div>';
    }
}

function displayMessages(messages) {
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    if (!messages || messages.length === 0) {
        messagesArea.innerHTML = '<div class="loading-conversations">Nenhuma mensagem nesta conversa</div>';
        return;
    }
    
    let lastDate = null;
    
    messages.forEach(message => {
        const messageDate = new Date(message.dateSent || message.dateCreated);
        const dateStr = messageDate.toLocaleDateString('pt-BR');
        
        // Divisor de data
        if (lastDate !== dateStr) {
            const dateDivider = document.createElement('div');
            dateDivider.className = 'date-divider';
            dateDivider.innerHTML = `<span>${formatDateDivider(messageDate)}</span>`;
            messagesArea.appendChild(dateDivider);
            lastDate = dateStr;
        }
        
        // Elemento da mensagem
        const messageElement = createMessageElement(message);
        messagesArea.appendChild(messageElement);
    });
    
    // Scroll para última mensagem
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function createMessageElement(message) {
    const div = document.createElement('div');
    const isSent = message.direction === 'outbound-api' || message.direction === 'outbound-call';
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = formatTime(new Date(message.dateSent || message.dateCreated));
    
    let statusIcon = '';
    if (isSent) {
        switch(message.status) {
            case 'delivered': statusIcon = '✓✓'; break;
            case 'sent': statusIcon = '✓'; break;
            case 'failed': statusIcon = '⚠'; break;
            default: statusIcon = '🕐';
        }
    }
    
    const messageBody = message.body || '[Sem conteúdo]';
    
    div.innerHTML = `
        <div class="message-bubble">
            <div class="message-text">${escapeHtml(messageBody)}</div>
            <div class="message-meta">
                <span class="message-time">${time}</span>
                ${isSent ? `<span class="message-status ${message.status === 'failed' ? 'status-failed' : ''}">${statusIcon}</span>` : ''}
            </div>
        </div>
    `;
    
    return div;
}

function exportCurrentConversation() {
    if (!currentMessages || currentMessages.length === 0) {
        showNotification('Nenhuma mensagem para exportar', 'error');
        return;
    }
    
    // Criar conteúdo para exportar
    let content = `Conversa com: ${currentConversation}\n`;
    content += `Total de mensagens: ${currentMessages.length}\n`;
    content += `Exportado em: ${new Date().toLocaleString('pt-BR')}\n`;
    content += '='.repeat(50) + '\n\n';
    
    currentMessages.forEach(msg => {
        const date = new Date(msg.dateSent || msg.dateCreated);
        const direction = msg.direction === 'inbound' ? 'Recebida' : 'Enviada';
        content += `[${date.toLocaleString('pt-BR')}] ${direction}\n`;
        content += `${msg.body || '[Sem conteúdo]'}\n`;
        content += '-'.repeat(30) + '\n';
    });
    
    // Criar blob e download
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversa_${currentConversation}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Conversa exportada com sucesso');
}

function showChatArea(conversation) {
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('contactName').textContent = formatPhoneNumber(conversation.contactNumber);
    document.getElementById('contactStatus').textContent = `${conversation.totalMessages} mensagens`;
    document.getElementById('messageInputArea').style.display = 'block';
    
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.add('hidden');
    }
}

function showConversationsList() {
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('hidden');
    }
}

function filterConversations(searchTerm) {
    const filtered = allConversations.filter(conv => {
        const number = conv.contactNumber.toLowerCase();
        const lastMessage = (conv.lastMessage || '').toLowerCase();
        const term = searchTerm.toLowerCase();
        return number.includes(term) || lastMessage.includes(term);
    });
    
    displayConversations(filtered);
}

// Funções auxiliares
function formatPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('55')) {
        const number = cleaned.substring(2);
        if (number.length === 11) {
            return `+55 (${number.substring(0, 2)}) ${number.substring(2, 7)}-${number.substring(7)}`;
        } else if (number.length === 10) {
            return `+55 (${number.substring(0, 2)}) ${number.substring(2, 6)}-${number.substring(6)}`;
        }
    }
    
    if (cleaned.startsWith('1') && cleaned.length === 11) {
        return `+1 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
    }
    
    if (cleaned.length > 10) {
        return `+${cleaned}`;
    }
    
    return phone;
}

function formatTime(date) {
    if (!date) return '';
    
    const now = new Date();
    const messageDate = new Date(date);
    const diffDays = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return messageDate.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } else if (diffDays === 1) {
        return 'Ontem';
    } else if (diffDays < 7) {
        return messageDate.toLocaleDateString('pt-BR', { weekday: 'short' });
    } else {
        return messageDate.toLocaleDateString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            year: '2-digit' 
        });
    }
}

function formatDateDivider(date) {
    const now = new Date();
    const messageDate = new Date(date);
    const diffDays = Math.floor((now - messageDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Hoje';
    } else if (diffDays === 1) {
        return 'Ontem';
    } else {
        return messageDate.toLocaleDateString('pt-BR', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Funções de Bloqueio
async function toggleBlockNumber(phoneNumber) {
    const isBlocked = blockedNumbers.includes(phoneNumber);
    const action = isBlocked ? 'unblock' : 'block';
    
    try {
        const response = await fetchWithAuth('/api/block-number', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, action })
        });
        
        const result = await response.json();
        
        if (result.success) {
            if (action === 'block') {
                blockedNumbers.push(phoneNumber);
                showNotification(`${formatPhoneNumber(phoneNumber)} bloqueado e movido para SPAM`, 'success');
                
                // Atualizar botão
                const blockBtn = document.getElementById('blockButton');
                blockBtn.innerHTML = '✅';
                blockBtn.title = 'Desbloquear número';
                
                // Mover conversa para SPAM
                moveConversationToSpam(phoneNumber);
            } else {
                blockedNumbers = blockedNumbers.filter(num => num !== phoneNumber);
                showNotification(`${formatPhoneNumber(phoneNumber)} desbloqueado`, 'success');
                
                // Atualizar botão
                const blockBtn = document.getElementById('blockButton');
                blockBtn.innerHTML = '🚫';
                blockBtn.title = 'Bloquear número';
                
                // Mover conversa de volta
                moveConversationFromSpam(phoneNumber);
            }
            
            // Atualizar contadores
            updateTabCounts();
            
            // Recarregar listas
            displayConversations(allConversations);
        }
    } catch (error) {
        console.error('Erro ao bloquear/desbloquear:', error);
        showNotification('Erro ao processar bloqueio', 'error');
    }
}

async function loadBlockedNumbers() {
    try {
        const response = await fetchWithAuth('/api/blocked-numbers');
        const data = await response.json();
        
        if (data.success) {
            blockedNumbers = data.numbers || [];
            console.log('Números bloqueados carregados:', blockedNumbers);
            
            // Atualizar interface se já tiver conversas carregadas
            if (allConversations.length > 0) {
                updateTabCounts();
                displayConversations(allConversations);
            }
            
            return blockedNumbers;
        }
    } catch (error) {
        console.error('Erro ao carregar números bloqueados:', error);
    }
    return [];
}

function switchTab(tab) {
    currentTab = tab;
    
    // Atualizar abas
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'conversations') {
        document.getElementById('conversationsTab').classList.add('active');
        document.getElementById('conversationsList').classList.add('active');
        displayConversations(allConversations.filter(c => !blockedNumbers.includes(c.contactNumber)));
    } else {
        document.getElementById('spamTab').classList.add('active');
        document.getElementById('spamList').classList.add('active');
        displaySpamList();
    }
}

function displaySpamList() {
    const spamList = document.getElementById('spamList');
    const spamConversations = allConversations.filter(c => blockedNumbers.includes(c.contactNumber));
    
    if (spamConversations.length === 0) {
        spamList.innerHTML = `
            <div class="spam-empty" style="padding: 40px; text-align: center;">
                <p style="font-size: 48px; margin-bottom: 10px;">🚫</p>
                <p style="color: #8696a0;">Nenhum número bloqueado</p>
                <p style="color: #667781; font-size: 12px; margin-top: 10px;">
                    Números bloqueados aparecerão aqui
                </p>
            </div>
        `;
        return;
    }
    
    spamList.innerHTML = '';
    
    // Header do SPAM
    const header = document.createElement('div');
    header.style.cssText = 'padding: 10px 20px; background: rgba(244, 67, 54, 0.1); color: #f44336; font-size: 13px; border-bottom: 1px solid #2a3942;';
    header.innerHTML = `🚫 ${spamConversations.length} números bloqueados`;
    spamList.appendChild(header);
    
    // Lista de bloqueados
    spamConversations.forEach(conv => {
        const convElement = createConversationElement(conv);
        convElement.classList.add('blocked');
        spamList.appendChild(convElement);
    });
}

function moveConversationToSpam(phoneNumber) {
    // Visual feedback
    const convElements = document.querySelectorAll('.conversation-item');
    convElements.forEach(elem => {
        if (elem.textContent.includes(phoneNumber)) {
            elem.style.animation = 'slideOut 0.3s';
            setTimeout(() => {
                switchTab('spam');
            }, 300);
        }
    });
}

function moveConversationFromSpam(phoneNumber) {
    // Visual feedback
    switchTab('conversations');
}

function updateTabCounts() {
    const normalConvs = allConversations.filter(c => !blockedNumbers.includes(c.contactNumber));
    const spamConvs = allConversations.filter(c => blockedNumbers.includes(c.contactNumber));
    
    const conversationsCount = document.getElementById('conversationsCount');
    const spamCount = document.getElementById('spamCount');
    
    if (conversationsCount) {
        conversationsCount.textContent = normalConvs.length > 0 ? normalConvs.length : '';
    }
    if (spamCount) {
        spamCount.textContent = spamConvs.length > 0 ? spamConvs.length : '0';
    }
    
    console.log(`Conversas normais: ${normalConvs.length}, SPAM: ${spamConvs.length}`);
}