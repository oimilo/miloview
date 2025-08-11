let allConversations = [];
let currentConversation = null;
let currentMessages = [];
let isUsingCache = false;
let lastUpdate = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Verificar status do cache primeiro
    checkCacheStatus();
    
    // Carregar conversas
    loadConversations();
    setupEventListeners();
    
    // Auto-refresh a cada 30 segundos para buscar novas mensagens
    setInterval(() => {
        loadConversations(false, false, true); // updateOnly
        if (currentConversation) {
            loadConversationMessages(currentConversation, false);
        }
    }, 30000);
}

async function checkCacheStatus() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        
        if (stats.cacheLoaded) {
            isUsingCache = true;
            console.log(`Cache carregado: ${stats.cachedMessages} mensagens, ${stats.cachedConversations} conversas`);
            updateStatusIndicator(stats);
        }
    } catch (error) {
        console.error('Erro ao verificar cache:', error);
    }
}

function updateStatusIndicator(stats) {
    // Adicionar indicador de status na interface
    const header = document.querySelector('.sidebar-header h1');
    if (header && stats.cacheLoaded) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size: 12px; background: #25d366; color: white; padding: 2px 6px; border-radius: 3px; margin-left: 10px;';
        badge.textContent = `${stats.cachedMessages} msgs`;
        badge.title = `Cache: ${stats.cachedMessages} mensagens de ${stats.cachedConversations} conversas`;
        
        // Remover badge anterior se existir
        const oldBadge = header.querySelector('span');
        if (oldBadge) oldBadge.remove();
        
        header.appendChild(badge);
    }
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
        }
    });
    
    // Botão carregar todas as mensagens
    document.getElementById('loadAllButton').addEventListener('click', async () => {
        const button = document.getElementById('loadAllButton');
        button.disabled = true;
        button.textContent = '⏳';
        button.title = 'Atualizando cache...';
        
        try {
            // Recarregar cache do servidor
            const response = await fetch('/api/reload-cache');
            const result = await response.json();
            
            if (result.success) {
                alert(`Cache recarregado!\n${result.messagesCount} mensagens\n${result.conversationsCount} conversas`);
                
                // Recarregar conversas com novo cache
                await loadConversations(true);
                
                // Atualizar indicador
                checkCacheStatus();
            } else {
                alert('Nenhum arquivo de cache encontrado. Execute primeiro: node extract-all-messages.js');
            }
        } catch (error) {
            console.error('Erro ao recarregar cache:', error);
            alert('Erro ao recarregar cache. Verifique o console.');
        } finally {
            button.disabled = false;
            button.textContent = '📥';
            button.title = 'Recarregar cache';
        }
    });
    
    // Botão exportar
    document.getElementById('exportButton').addEventListener('click', () => {
        if (confirm('Deseja atualizar o cache com TODAS as mensagens?\n\nIsso executará: node extract-all-messages.js')) {
            alert('Execute o comando no terminal:\n\nnode extract-all-messages.js\n\nDepois clique no botão 📥 para recarregar o cache.');
        }
    });
}

async function loadConversations(showLoading = true, useCache = true, updateOnly = false) {
    const conversationsList = document.getElementById('conversationsList');
    
    if (showLoading) {
        conversationsList.innerHTML = '<div class="loading-conversations">Carregando conversas...</div>';
    }
    
    try {
        // Construir URL com parâmetros
        const params = new URLSearchParams({
            useCache: useCache.toString(),
            updateOnly: updateOnly.toString()
        });
        
        const response = await fetch(`/api/conversations?${params}`);
        
        if (!response.ok) {
            throw new Error(`Falha ao carregar conversas: ${response.status}`);
        }
        
        const data = await response.json();
        allConversations = data.conversations || data; // Suporta ambos formatos
        
        // Atualizar indicador com info do cache
        if (data.totalMessages) {
            updateStatusIndicator({
                cacheLoaded: true,
                cachedMessages: data.totalMessages,
                cachedConversations: allConversations.length
            });
        }
        
        console.log(`Conversas carregadas: ${allConversations.length} (Total msgs: ${data.totalMessages || 'N/A'})`);
        
        if (!updateOnly || showLoading) {
            displayConversations(allConversations);
        }
        
        lastUpdate = new Date();
        
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
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = '<div class="loading-conversations">Nenhuma conversa encontrada</div>';
        return;
    }
    
    conversationsList.innerHTML = '';
    
    // Adicionar contador no topo
    const counter = document.createElement('div');
    counter.style.cssText = 'padding: 10px; background: #111b21; color: #8696a0; font-size: 13px; border-bottom: 1px solid #2a3942;';
    counter.textContent = `${conversations.length} conversas`;
    conversationsList.appendChild(counter);
    
    conversations.forEach(conv => {
        const convElement = createConversationElement(conv);
        conversationsList.appendChild(convElement);
    });
}

function createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    if (currentConversation === conversation.contactNumber) {
        div.classList.add('active');
    }
    
    div.onclick = () => selectConversation(conversation);
    
    // Avatar com inicial do número
    const initial = conversation.contactNumber.slice(-2);
    
    // Formatar hora da última mensagem
    const lastMessageTime = formatTime(conversation.lastMessageDate);
    
    // Preview da última mensagem
    const lastMessagePreview = conversation.lastMessage ? 
        (conversation.lastMessage.length > 60 ? 
            conversation.lastMessage.substring(0, 60) + '...' : 
            conversation.lastMessage) : 
        'Sem mensagens';
    
    // Indicador de cache/novo
    const indicator = conversation.fromCache ? '' : ' 🆕';
    
    div.innerHTML = `
        <div class="conversation-avatar">${initial}</div>
        <div class="conversation-details">
            <div class="conversation-header">
                <span class="conversation-name">${formatPhoneNumber(conversation.contactNumber)}${indicator}</span>
                <span class="conversation-time">${lastMessageTime}</span>
            </div>
            <div class="conversation-last-message">
                ${lastMessagePreview}
                ${conversation.unreadCount > 0 ? 
                    `<span class="conversation-badge">${conversation.unreadCount}</span>` : ''}
                <span style="font-size: 10px; color: #667781; margin-left: 5px;">${conversation.totalMessages} msgs</span>
            </div>
        </div>
    `;
    
    return div;
}

function selectConversation(conversation) {
    currentConversation = conversation.contactNumber;
    
    // Atualizar UI para mostrar conversa selecionada
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Carregar mensagens da conversa
    loadConversationMessages(conversation.contactNumber, true);
    
    // Mostrar área de chat e esconder lista em mobile
    showChatArea(conversation);
}

async function loadConversationMessages(phoneNumber, showLoading = true) {
    const messagesArea = document.getElementById('messagesArea');
    
    if (showLoading) {
        messagesArea.innerHTML = '<div class="loading-conversations">Carregando mensagens...</div>';
    }
    
    try {
        const response = await fetch(`/api/conversation/${encodeURIComponent(phoneNumber)}?useCache=true`);
        
        if (!response.ok) {
            throw new Error('Falha ao carregar mensagens');
        }
        
        const data = await response.json();
        currentMessages = data.messages || data; // Suporta ambos formatos
        
        console.log(`Mensagens carregadas para ${phoneNumber}: ${currentMessages.length} (Cache: ${data.fromCache})`);
        
        displayMessages(currentMessages);
        
        // Atualizar contador no header
        const contactStatus = document.getElementById('contactStatus');
        if (contactStatus) {
            contactStatus.textContent = `${currentMessages.length} mensagens ${data.fromCache ? '(cache)' : ''}`;
        }
        
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
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
        
        // Adicionar divisor de data se mudou o dia
        if (lastDate !== dateStr) {
            const dateDivider = document.createElement('div');
            dateDivider.className = 'date-divider';
            dateDivider.innerHTML = `<span>${formatDateDivider(messageDate)}</span>`;
            messagesArea.appendChild(dateDivider);
            lastDate = dateStr;
        }
        
        // Criar elemento da mensagem
        const messageElement = createMessageElement(message);
        messagesArea.appendChild(messageElement);
    });
    
    // Scroll para a última mensagem
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function createMessageElement(message) {
    const div = document.createElement('div');
    const isSent = message.direction === 'outbound-api' || message.direction === 'outbound-call';
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const time = formatTime(new Date(message.dateSent || message.dateCreated));
    
    // Status da mensagem
    let statusIcon = '';
    if (isSent) {
        switch(message.status) {
            case 'delivered':
                statusIcon = '✓✓';
                break;
            case 'sent':
                statusIcon = '✓';
                break;
            case 'failed':
                statusIcon = '⚠';
                break;
            default:
                statusIcon = '🕐';
        }
    }
    
    // Conteúdo da mensagem (garantir que sempre mostra algo)
    const messageBody = message.body || '[Mensagem sem conteúdo]';
    
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showChatArea(conversation) {
    // Mostrar header do chat
    document.getElementById('chatHeader').style.display = 'flex';
    document.getElementById('contactName').textContent = formatPhoneNumber(conversation.contactNumber);
    document.getElementById('contactStatus').textContent = `${conversation.totalMessages} mensagens`;
    
    // Mostrar área de input
    document.getElementById('messageInputArea').style.display = 'block';
    
    // Em mobile, esconder sidebar
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.add('hidden');
    }
}

function showConversationsList() {
    // Em mobile, mostrar sidebar
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
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, '');
    
    // Formato brasileiro
    if (cleaned.startsWith('55')) {
        const number = cleaned.substring(2);
        if (number.length === 11) {
            return `+55 (${number.substring(0, 2)}) ${number.substring(2, 7)}-${number.substring(7)}`;
        } else if (number.length === 10) {
            return `+55 (${number.substring(0, 2)}) ${number.substring(2, 6)}-${number.substring(6)}`;
        }
    }
    
    // Formato americano
    if (cleaned.startsWith('1') && cleaned.length === 11) {
        return `+1 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
    }
    
    // Outros formatos internacionais
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
        // Hoje - mostrar hora
        return messageDate.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } else if (diffDays === 1) {
        return 'Ontem';
    } else if (diffDays < 7) {
        // Semana - mostrar dia da semana
        return messageDate.toLocaleDateString('pt-BR', { weekday: 'short' });
    } else {
        // Mais de uma semana - mostrar data
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