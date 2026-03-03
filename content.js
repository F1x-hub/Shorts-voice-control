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
