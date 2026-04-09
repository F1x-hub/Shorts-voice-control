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
let autoPlaylistAdvanceEnabled = false;
let lastPlaylistAdvanceAt = 0;

chrome.storage.local.get(['autoSkip', 'autoSkipTime'], (result) => {
    autoSkipEnabled = result.autoSkip || false;
    autoSkipTime = result.autoSkipTime !== undefined ? result.autoSkipTime : 0.5;
});

chrome.storage.sync.get(['autoPlaylistAdvance'], (result) => {
    autoPlaylistAdvanceEnabled = result.autoPlaylistAdvance === true;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.autoSkip !== undefined) autoSkipEnabled = changes.autoSkip.newValue;
        if (changes.autoSkipTime !== undefined) autoSkipTime = changes.autoSkipTime.newValue;
    }
    if (area === 'sync') {
        if (changes.hotkeyPrev !== undefined) hotkeyPrevStr = changes.hotkeyPrev.newValue || '';
        if (changes.hotkeyNext !== undefined) hotkeyNextStr = changes.hotkeyNext.newValue || '';
        if (changes.autoPlaylistAdvance !== undefined) autoPlaylistAdvanceEnabled = changes.autoPlaylistAdvance.newValue === true;
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

function isPlaylistWatchPage() {
    if (!window.location.pathname.startsWith('/watch')) return false;

    const params = new URLSearchParams(window.location.search);
    return params.has('list') && params.has('index');
}

function getNextPlaylistButton() {
    return document.querySelector('button[aria-label="Следующее видео"]') ||
        document.querySelector('.yt-spec-button-shape-next[aria-label="Следующее видео"]') ||
        document.querySelector('a.ytp-next-button') ||
        document.querySelector('.ytp-next-button') ||
        document.querySelector('ytd-playlist-panel-renderer a[aria-label*="Следующее"]');
}

document.addEventListener('ended', (event) => {
    if (!autoPlaylistAdvanceEnabled) return;
    if (!isPlaylistWatchPage()) return;
    if (!(event.target instanceof HTMLVideoElement)) return;

    const now = Date.now();
    if (now - lastPlaylistAdvanceAt < 2000) return;

    const nextButton = getNextPlaylistButton();
    if (!nextButton) return;

    lastPlaylistAdvanceAt = now;
    console.log('Playlist video ended, moving to the next item...');
    setTimeout(() => {
        nextButton.click();
    }, 250);
}, true);

// --- Логика удержания списка воспроизведения (Playlist Retention) ---
let savedPlaylistList = null;
let savedPlaylistIndex = null;

function checkAndRestorePlaylist() {
    if (!window.location.pathname.startsWith('/watch')) {
        return;
    }

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;

    const currentList = searchParams.get('list');
    const currentIndex = searchParams.get('index');

    if (currentList) {
        // Если параметры есть, обновляем наши сохраненные значения
        savedPlaylistList = currentList;
        if (currentIndex) {
            savedPlaylistIndex = currentIndex;
        }
    } else if (savedPlaylistList) {
        // Если нас "выкинуло" (параметра list нет, но он сохранен) - восстанавливаем
        searchParams.set('list', savedPlaylistList);
        if (savedPlaylistIndex) {
            searchParams.set('index', savedPlaylistIndex);
        }

        const newUrl = currentUrl.pathname + currentUrl.search + currentUrl.hash;
        console.log(`[VoiceToText] Нас выкинуло из плейлиста. Жестко возвращаем обратно: ${newUrl}`);
        
        // ВАЖНО: history.replaceState только меняет текст в строке, но не загружает интерфейс плейлиста.
        // Чтобы появилось боковое меню и функционал плейлиста, нужно заставить браузер/YouTube перейти по этой ссылке.
        window.location.replace(newUrl);
    }
}

// Перехватываем клики по любым видео (рекомендации, автовоспроизведение в плеере)
// и заранее подшиваем наш плейлист прямиком в href ДО ТОГО, как начался переход
document.addEventListener('click', (e) => {
    // Ищем тег <a> на который кликнули
    const a = e.target.closest('a');
    if (a && a.href && a.href.includes('/watch') && savedPlaylistList) {
        try {
            const url = new URL(a.href);
            if (!url.searchParams.has('list')) { // если в ссылке нет плейлиста
                url.searchParams.set('list', savedPlaylistList);
                if (savedPlaylistIndex) {
                    url.searchParams.set('index', savedPlaylistIndex);
                }
                a.href = url.href; // подменяем ссылку в реальном времени
                
                console.log(`[VoiceToText] Перехвачен клик/переход, добавлен плейлист в ссылку: list=${savedPlaylistList}`);
            }
        } catch (err) {}
    }
}, true); // Захватываем событие как можно раньше (useCapture: true)

// Слушаем события SPA-навигации YouTube
document.addEventListener('yt-navigate-finish', checkAndRestorePlaylist);

// Резервный интервал
setInterval(checkAndRestorePlaylist, 1000);
