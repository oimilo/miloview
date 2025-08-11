let allConversations = [];
let currentConversation = null;
let currentMessages = [];

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    loadConversations();
    setupEventListeners();
    
    // Auto-refresh a cada 30 segundos
    setInterval(() => {
        if (currentConversation) {
            loadConversationMessages(currentConversation, false);
        }
        loadConversations(false);
    }, 30000);
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
        if (confirm('Isso pode demorar alguns minutos. Deseja carregar TODAS as mensagens?')) {
            const button = document.getElementById('loadAllButton');
            button.disabled = true;
            button.textContent = '⏳';
            
            try {
                // Carregar todas as conversas
                await loadConversations(true, true);
                
                // Se houver conversa selecionada, recarregar com todas as mensagens
                if (currentConversation) {
                    await loadConversationMessages(currentConversation, true, true);
                }
                
                alert('Todas as mensagens foram carregadas com sucesso!');
            } catch (error) {
                console.error('Erro ao carregar todas as mensagens:', error);
                alert('Erro ao carregar mensagens. Verifique o console.');
            } finally {
                button.disabled = false;
                button.textContent = '📥';
            }
        }
    });
    
    // Botão exportar
    document.getElementById('exportButton').addEventListener('click', () => {
        if (confirm('Deseja executar o script de exportação? Isso salvará todas as mensagens em diversos formatos.')) {
            alert('Execute o comando: node extract-all-messages.js\n\nOs arquivos serão salvos na pasta exported_messages com:\n- JSON completo\n- CSV\n- TXT por conversa\n- HTML visualizador\n- Estatísticas');
        }
    });
}

async function loadConversations(showLoading = true, loadAll = false) {
    const conversationsList = document.getElementById('conversationsList');
    
    if (showLoading) {
        conversationsList.innerHTML = '<div class="loading-conversations">Carregando conversas...</div>';
    }
    
    try {
        const url = loadAll ? '/api/conversations?loadAll=true' : '/api/conversations';
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Resposta do servidor:', response.status, errorText);
            throw new Error(`Falha ao carregar conversas: ${response.status}`);
        }
        
        allConversations = await response.json();
        console.log('Conversas carregadas:', allConversations);
        displayConversations(allConversations);
        
    } catch (error) {
        console.error('Erro detalhado ao carregar conversas:', error);
        conversationsList.innerHTML = `
            <div class="loading-conversations" style="padding: 20px; text-align: center;">
                <div style="color: #f44336; margin-bottom: 10px;">Erro ao carregar conversas</div>
                <div style="font-size: 12px; color: #8696a0;">Verifique se o servidor está rodando na porta 3000</div>
                <button onclick="loadConversations()" style="margin-top: 10px; padding: 8px 16px; background: #005c4b; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Tentar Novamente
                </button>
            </div>
        `;
    }
}

function displayConversations(conversations) {
    const conversationsList = document.getElementById('conversationsList');
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = '<div class="loading-conversations">Nenhuma conversa encontrada</div>';
        return;
    }
    
    conversationsList.innerHTML = '';
    
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
    
    div.innerHTML = `
        <div class="conversation-avatar">${initial}</div>
        <div class="conversation-details">
            <div class="conversation-header">
                <span class="conversation-name">${formatPhoneNumber(conversation.contactNumber)}</span>
                <span class="conversation-time">${lastMessageTime}</span>
            </div>
            <div class="conversation-last-message">
                ${lastMessagePreview}
                ${conversation.unreadCount > 0 ? 
                    `<span class="conversation-badge">${conversation.unreadCount}</span>` : ''}
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

async function loadConversationMessages(phoneNumber, showLoading = true, loadAll = false) {
    const messagesArea = document.getElementById('messagesArea');
    
    if (showLoading) {
        messagesArea.innerHTML = '<div class="loading-conversations">Carregando mensagens...</div>';
    }
    
    try {
        const url = loadAll ? 
            `/api/conversation/${encodeURIComponent(phoneNumber)}?loadAll=true` : 
            `/api/conversation/${encodeURIComponent(phoneNumber)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Falha ao carregar mensagens');
        }
        
        currentMessages = await response.json();
        displayMessages(currentMessages);
        
    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        messagesArea.innerHTML = '<div class="loading-conversations">Erro ao carregar mensagens</div>';
    }
}

function displayMessages(messages) {
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';
    
    if (messages.length === 0) {
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
    
    div.innerHTML = `
        <div class="message-bubble">
            <div class="message-text">${message.body || '<mensagem vazia>'}</div>
            <div class="message-meta">
                <span class="message-time">${time}</span>
                ${isSent ? `<span class="message-status ${message.status === 'failed' ? 'status-failed' : ''}">${statusIcon}</span>` : ''}
            </div>
        </div>
    `;
    
    return div;
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
        }
    }
    
    // Formato americano
    if (cleaned.startsWith('1') && cleaned.length === 11) {
        return `+1 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
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