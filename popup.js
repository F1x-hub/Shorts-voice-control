document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
    const statusDiv = document.getElementById('status');

    // Кнопка Старт включена по умолчанию, чтобы дождаться клика пользователя
    startBtn.disabled = false;

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('options.html'));
            }
        });
    }

    // Запрашиваем текущий статус при открытии попапа
    chrome.runtime.sendMessage({ action: 'get_status' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.isListening) {
            setStatus('Идет фоновая запись... Говорите "Следующее видео".', '#4CAF50');
            startBtn.disabled = true;
            stopBtn.disabled = false;
        }
    });

    // Обработчик старта записи
    startBtn.addEventListener('click', async () => {
        try {
            // Проверяем разрешение без активации микрофона, чтобы избежать блокировки (race condition) оборудования
            const perm = await navigator.permissions.query({ name: 'microphone' });
            
            if (perm.state === 'granted') {
                // Запускаем фоновый скрипт
                chrome.runtime.sendMessage({ action: 'start_listening' });
                setStatus('Запуск фонового распознавания...', '#4CAF50');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                // Если не granted (prompt или denied), перенаправляем на страницу разрешений
                chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
            }
        } catch (err) {
            console.error('Ошибка проверки разрешений:', err);
            // Если API permissions недоступно, всё равно пробуем открыть вкладку
            chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
        }
    });

    // Обработчик остановки записи
    stopBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'stop_listening' });
        setStatus('Остановка записи...', '#333');
    });

    // Слушаем сообщения из фонового скрипта/offscreen документа
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'recognition_started') {
            setStatus('Идет фоновая запись... Говорите "Следующее видео".', '#4CAF50');
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else if (message.action === 'recognition_stopped') {
            // Если статус уже красный (ошибка), не перезаписываем его на "Остановлена."
            if (statusDiv.style.color !== 'red') {
                setStatus('Запись остановлена.', '#333');
            }
            startBtn.disabled = false;
            stopBtn.disabled = true;
        } else if (message.action === 'transcript_update') {
            if (message.isFinal) {
                console.log('%cФинальный: %c' + message.text, 'color: green; font-weight: bold;', 'color: black');
            } else {
                console.log('%cПромежуточный: %c' + message.text, 'color: gray; font-style: italic;', 'color: gray');
            }
        } else if (message.action === 'recognition_error') {
            console.error("Получена ошибка из фона:", message.error);
            let errorMessage = 'Ошибка: ' + message.error;
            if (message.error === 'not-allowed') {
                errorMessage = 'Нет доступа к микрофону в фоне.';
            } else if (message.error === 'network') {
                errorMessage = 'Ошибка сети.';
            } else if (message.error === 'no-speech') {
                // Игнорируем no-speech, так как мы будем перезапускать автоматически
                return;
            }
            setStatus(errorMessage, 'red');
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });

    // Вспомогательная функция
    function setStatus(text, color) {
        statusDiv.textContent = text;
        statusDiv.style.color = color;
    }
});
