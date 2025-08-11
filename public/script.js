let allMessages = [];

document.addEventListener('DOMContentLoaded', () => {
    const loadBtn = document.getElementById('loadMessages');
    const modal = document.getElementById('messageModal');
    const closeModal = document.querySelector('.close');
    
    loadBtn.addEventListener('click', loadMessages);
    
    closeModal.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
    
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    document.getElementById('dateFrom').value = formatDateForInput(lastMonth);
    document.getElementById('dateTo').value = formatDateForInput(today);
    
    loadMessages();
});

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadMessages() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const messagesList = document.getElementById('messagesList');
    
    loading.classList.remove('hidden');
    error.classList.add('hidden');
    messagesList.innerHTML = '';
    
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const pageSize = document.getElementById('pageSize').value;
    
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateSentAfter', dateFrom);
    if (dateTo) params.append('dateSentBefore', dateTo);
    params.append('pageSize', pageSize);
    
    try {
        const response = await fetch(`/api/messages?${params}`);
        
        if (!response.ok) {
            throw new Error('Falha ao carregar mensagens');
        }
        
        allMessages = await response.json();
        
        updateStats();
        displayMessages();
        
    } catch (err) {
        error.textContent = `Erro: ${err.message}`;
        error.classList.remove('hidden');
        console.error('Error:', err);
    } finally {
        loading.classList.add('hidden');
    }
}

function updateStats() {
    const total = allMessages.length;
    const sent = allMessages.filter(m => m.direction === 'outbound-api' || m.direction === 'outbound-call').length;
    const received = allMessages.filter(m => m.direction === 'inbound').length;
    const errors = allMessages.filter(m => m.status === 'failed' || m.errorCode).length;
    
    document.getElementById('totalMessages').textContent = total;
    document.getElementById('sentMessages').textContent = sent;
    document.getElementById('receivedMessages').textContent = received;
    document.getElementById('errorMessages').textContent = errors;
}

function displayMessages() {
    const messagesList = document.getElementById('messagesList');
    
    if (allMessages.length === 0) {
        messagesList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">Nenhuma mensagem encontrada para o período selecionado.</p>';
        return;
    }
    
    allMessages.forEach(message => {
        const messageElement = createMessageElement(message);
        messagesList.appendChild(messageElement);
    });
}

function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = 'message-item';
    div.onclick = () => showMessageDetails(message);
    
    const direction = message.direction === 'inbound' ? 'Recebida' : 'Enviada';
    const directionClass = message.direction === 'inbound' ? 'direction-inbound' : 'direction-outbound';
    
    let statusClass = 'status-sent';
    let statusText = message.status;
    
    switch(message.status) {
        case 'delivered':
            statusClass = 'status-delivered';
            statusText = 'Entregue';
            break;
        case 'sent':
            statusClass = 'status-sent';
            statusText = 'Enviada';
            break;
        case 'failed':
            statusClass = 'status-failed';
            statusText = 'Falhou';
            break;
        case 'received':
            statusClass = 'status-received';
            statusText = 'Recebida';
            break;
    }
    
    const dateSent = new Date(message.dateSent || message.dateCreated);
    const formattedDate = dateSent.toLocaleString('pt-BR');
    
    const bodyPreview = message.body ? 
        (message.body.length > 100 ? message.body.substring(0, 100) + '...' : message.body) : 
        '<sem conteúdo>';
    
    div.innerHTML = `
        <div class="message-header">
            <div>
                <span class="message-direction ${directionClass}">${direction}</span>
                <span class="message-status ${statusClass}">${statusText}</span>
            </div>
            <div style="color: #999; font-size: 14px;">${formattedDate}</div>
        </div>
        <div class="message-info">
            <div class="info-item">
                <span class="info-label">De</span>
                <span class="info-value">${message.from || 'N/A'}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Para</span>
                <span class="info-value">${message.to || 'N/A'}</span>
            </div>
            ${message.price ? `
            <div class="info-item">
                <span class="info-label">Custo</span>
                <span class="info-value">${message.price} ${message.priceUnit || ''}</span>
            </div>
            ` : ''}
            ${message.errorCode ? `
            <div class="info-item">
                <span class="info-label">Erro</span>
                <span class="info-value" style="color: #f44336;">${message.errorCode}</span>
            </div>
            ` : ''}
        </div>
        <div class="message-body">
            ${bodyPreview}
        </div>
    `;
    
    return div;
}

async function showMessageDetails(message) {
    const modal = document.getElementById('messageModal');
    const details = document.getElementById('messageDetails');
    
    try {
        const response = await fetch(`/api/message/${message.sid}`);
        const fullMessage = await response.json();
        
        const dateSent = new Date(fullMessage.dateSent || fullMessage.dateCreated);
        const dateCreated = new Date(fullMessage.dateCreated);
        
        details.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">SID:</span>
                <span class="detail-value">${fullMessage.sid}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">De:</span>
                <span class="detail-value">${fullMessage.from || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Para:</span>
                <span class="detail-value">${fullMessage.to || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${fullMessage.status}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Direção:</span>
                <span class="detail-value">${fullMessage.direction}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Data Enviada:</span>
                <span class="detail-value">${dateSent.toLocaleString('pt-BR')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Data Criada:</span>
                <span class="detail-value">${dateCreated.toLocaleString('pt-BR')}</span>
            </div>
            ${fullMessage.price ? `
            <div class="detail-row">
                <span class="detail-label">Custo:</span>
                <span class="detail-value">${fullMessage.price} ${fullMessage.priceUnit || ''}</span>
            </div>
            ` : ''}
            ${fullMessage.numSegments ? `
            <div class="detail-row">
                <span class="detail-label">Segmentos:</span>
                <span class="detail-value">${fullMessage.numSegments}</span>
            </div>
            ` : ''}
            ${fullMessage.errorCode ? `
            <div class="detail-row">
                <span class="detail-label">Código de Erro:</span>
                <span class="detail-value" style="color: #f44336;">${fullMessage.errorCode}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Mensagem de Erro:</span>
                <span class="detail-value" style="color: #f44336;">${fullMessage.errorMessage || 'N/A'}</span>
            </div>
            ` : ''}
            <div class="detail-row">
                <span class="detail-label">Mensagem:</span>
                <span class="detail-value">${fullMessage.body || '<sem conteúdo>'}</span>
            </div>
        `;
        
        modal.classList.remove('hidden');
    } catch (err) {
        console.error('Error fetching message details:', err);
        alert('Erro ao carregar detalhes da mensagem');
    }
}