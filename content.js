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
    }
});

// --- Логика авто-пропуска Shorts ---
let autoSkipEnabled = false;

chrome.storage.local.get(['autoSkip'], (result) => {
    autoSkipEnabled = result.autoSkip || false;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoSkip !== undefined) {
        autoSkipEnabled = changes.autoSkip.newValue;
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
            
            // Если до конца осталось меньше 0.5 сек
            if (video.duration - video.currentTime < 0.5) {
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
