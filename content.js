chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'click_next_video') {
        // Ищем кнопку из предоставленного HTML или по обобщенному aria-label
        const nextButton = document.querySelector('button[aria-label="Следующее видео"]') || 
                           document.querySelector('.yt-spec-button-shape-next[aria-label="Следующее видео"]');
        
        if (nextButton) {
            nextButton.click();
            console.log("Кнопка 'Следующее видео' нажата расширением");
        } else {
            console.log("Кнопка 'Следующее видео' не найдена на текущей странице");
        }
    } else if (message.action === 'click_prev_video') {
        const prevButton = document.querySelector('button[aria-label="Предыдущее видео"]') ||
                           document.querySelector('.yt-spec-button-shape-next[aria-label="Предыдущее видео"]');
                           
        if (prevButton) {
            prevButton.click();
            console.log("Кнопка 'Предыдущее видео' нажата расширением");
        } else {
            console.log("Кнопка 'Предыдущее видео' не найдена на текущей странице");
        }
    } else if (message.action === 'inject_iframe') {
        let iframe = document.getElementById('ru-voice-to-text-iframe');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'ru-voice-to-text-iframe';
            // Используем allow="microphone" чтобы iframe мог использовать микрофон
            iframe.setAttribute('allow', 'microphone');
            iframe.style.display = 'none'; // Невидимый
            iframe.style.width = '0px';
            iframe.style.height = '0px';
            iframe.src = chrome.runtime.getURL('iframe.html');
            document.body.appendChild(iframe);
            console.log('Voice-to-Text iframe внедрен и работает.');
        }
        sendResponse({status: 'injected'});
    } else if (message.action === 'remove_iframe') {
        const iframe = document.getElementById('ru-voice-to-text-iframe');
        if (iframe) {
            iframe.remove();
            console.log('Voice-to-Text iframe удален.');
        }
        sendResponse({status: 'removed'});
    } else if (message.action === 'show_toast') {
        showToast(message.message);
        sendResponse({status: 'toast_shown'});
    }
});

// Слушаем прямые сообщения от iframe для быстрого переключения
window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'voice_command') {
        const command = event.data.command;
        const startTime = event.data.startTime || performance.now();
        
        if (command === 'next_video') {
            const nextButton = document.querySelector('button[aria-label="Следующее видео"]') || 
                               document.querySelector('.yt-spec-button-shape-next[aria-label="Следующее видео"]') ||
                               document.querySelector('#navigation-button-down button');
            if (nextButton) {
                nextButton.click();
                const timeTaken = performance.now() - startTime;
                console.log(`[VoiceToText] Команда 'Следующее видео' распознана и выполнена за ${timeTaken.toFixed(1)} мс`);
            }
        } else if (command === 'prev_video') {
            const prevButton = document.querySelector('button[aria-label="Предыдущее видео"]') ||
                               document.querySelector('.yt-spec-button-shape-next[aria-label="Предыдущее видео"]') ||
                               document.querySelector('#navigation-button-up button');
            if (prevButton) {
                prevButton.click();
                const timeTaken = performance.now() - startTime;
                console.log(`[VoiceToText] Команда 'Предыдущее видео' распознана и выполнена за ${timeTaken.toFixed(1)} мс`);
            }
        }
    }
});

function showToast(text) {
    let toast = document.getElementById('vtt-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vtt-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '100px';
        toast.style.right = '40px';
        toast.style.backgroundColor = '#4CAF50';
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontSize = '16px';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '999999';
        toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.pointerEvents = 'none';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    
    if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
    toast.hideTimeout = setTimeout(() => {
        toast.style.opacity = '0';
    }, 1500);
}

// --- Логика авто-пропуска Shorts ---
let autoSkipEnabled = false;
let autoSkipTime = 0.5;

chrome.storage.local.get(['autoSkip', 'autoSkipTime'], (result) => {
    autoSkipEnabled = result.autoSkip || false;
    autoSkipTime = result.autoSkipTime !== undefined ? result.autoSkipTime : 0.5;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.autoSkip !== undefined) autoSkipEnabled = changes.autoSkip.newValue;
        if (changes.autoSkipTime !== undefined) autoSkipTime = changes.autoSkipTime.newValue;
    }
    if (area === 'sync') {
        if (changes.hotkeyPrev !== undefined) hotkeyPrevStr = changes.hotkeyPrev.newValue || '';
        if (changes.hotkeyNext !== undefined) hotkeyNextStr = changes.hotkeyNext.newValue || '';
    }
});

let hotkeyPrevStr = '';
let hotkeyNextStr = '';

chrome.storage.sync.get(['hotkeyPrev', 'hotkeyNext'], (result) => {
    hotkeyPrevStr = result.hotkeyPrev || '';
    hotkeyNextStr = result.hotkeyNext || '';
});

function matchesHotkey(e, hotkeyStr) {
    if (!hotkeyStr) return false;
    const parts = hotkeyStr.split(' + ');
    
    const needsCtrl = parts.includes('Ctrl');
    const needsAlt = parts.includes('Alt');
    const needsShift = parts.includes('Shift');
    const needsMeta = parts.includes('Meta');
    
    if (e.ctrlKey !== needsCtrl) return false;
    if (e.altKey !== needsAlt) return false;
    if (e.shiftKey !== needsShift) return false;
    if (e.metaKey !== needsMeta) return false;
    
    const keyPart = parts[parts.length - 1]; // Main key is the last part
    if (['Ctrl', 'Alt', 'Shift', 'Meta'].includes(keyPart)) return false;
    
    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';
    if (/^[a-z]$/.test(keyName)) keyName = keyName.toUpperCase();
    
    return keyName === keyPart;
}

window.addEventListener('keydown', (e) => {
    // Не перехватывать, если мы в текстовом поле
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    
    if (hotkeyNextStr && matchesHotkey(e, hotkeyNextStr)) {
        e.preventDefault();
        const nextButton = document.querySelector('button[aria-label="Следующее видео"]') || 
                           document.querySelector('.yt-spec-button-shape-next[aria-label="Следующее видео"]') ||
                           document.querySelector('#navigation-button-down button');
        if (nextButton) nextButton.click();
    } else if (hotkeyPrevStr && matchesHotkey(e, hotkeyPrevStr)) {
        e.preventDefault();
        const prevButton = document.querySelector('button[aria-label="Предыдущее видео"]') ||
                           document.querySelector('.yt-spec-button-shape-next[aria-label="Предыдущее видео"]') ||
                           document.querySelector('#navigation-button-up button');
        if (prevButton) prevButton.click();
    }
});

setInterval(() => {
    if (!autoSkipEnabled) return;
    
    // Убедимся, что мы на странице Shorts
    if (!window.location.pathname.includes('/shorts/')) return;
    
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
        // Ищем активное видео (которое сейчас проигрывается)
        if (!video.paused && video.readyState === 4 && video.duration > 0) {
            
            // Если до конца осталось меньше autoSkipTime сек
            if (video.duration - video.currentTime <= autoSkipTime) {
                if (!video.dataset.autoSkipped) {
                    video.dataset.autoSkipped = 'true';
                    console.log('Shorts video ended, auto-skipping...');
                    
                    // Ищем кнопку следующего видео
                    const nextButton = document.querySelector('button[aria-label="Следующее видео"]') || 
                                       document.querySelector('.yt-spec-button-shape-next[aria-label="Следующее видео"]') ||
                                       document.querySelector('#navigation-button-down button');
                    
                    if (nextButton) {
                        nextButton.click();
                    }
                }
            } else if (video.currentTime < 1) {
                // Сбрасываем флаг, когда видео начинается сначала
                video.dataset.autoSkipped = '';
            }
            
            // Обрабатываем только одно активное видео
            break;
        }
    }
}, 300);
