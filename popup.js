document.addEventListener('DOMContentLoaded', () => {
    const stopBtn = document.getElementById('stop');
    const statusDiv = document.getElementById('status');
    const autoSkipToggle = document.getElementById('autoSkipToggle');
    const controlsDiv = document.getElementById('controls');
    const permissionContainer = document.getElementById('permission-container');
    const permissionBtn = document.getElementById('permissionBtn');
    const permissionHint = document.getElementById('permissionHint');

    function sendToBackground(message, callback, retryCount = 0) {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                if (retryCount < 3) {
                    setTimeout(() => sendToBackground(message, callback, retryCount + 1), 1000);
                } else if (callback) {
                    callback(null);
                }
                return;
            }
            if (callback) callback(response);
        });
    }

    // Предварительно загружаем состояние тогглера
    if (autoSkipToggle) {
        chrome.storage.local.get(['autoSkip'], (result) => {
            autoSkipToggle.checked = result.autoSkip || false;
        });

        // Сохраняем состояние при переключении
        autoSkipToggle.addEventListener('change', () => {
            chrome.storage.local.set({ autoSkip: autoSkipToggle.checked });
        });
    }



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

    let isRecording = false;

    function setRecordingState(state) {
        isRecording = state;
        if (state) {
            stopBtn.textContent = 'Остановить';
            stopBtn.className = 'btn-stop';
        } else {
            stopBtn.textContent = 'Запустить';
            stopBtn.className = 'btn-start';
        }
    }

    let microphonePermissionStatus = null;

    async function checkPermission(autoStart = true) {
        try {
            if (!microphonePermissionStatus) {
                microphonePermissionStatus = await navigator.permissions.query({ name: 'microphone' });
                microphonePermissionStatus.onchange = () => {
                    handlePermissionState(microphonePermissionStatus.state, autoStart);
                };
            }
            handlePermissionState(microphonePermissionStatus.state, autoStart);
        } catch (err) {
            console.error('Ошибка проверки разрешений:', err);
        }
    }

    function handlePermissionState(state, autoStart = true) {
        if (state === 'granted') {
            if (controlsDiv) controlsDiv.style.display = 'block';
            if (permissionContainer) permissionContainer.style.display = 'none';
            if (permissionHint) permissionHint.style.display = 'none';
            
            // Start listening automatically if not already
            if (!isRecording && autoStart) {
                sendToBackground({ action: 'start_listening' });
                setStatus('Запуск фонового распознавания...', '#4CAF50');
                stopBtn.disabled = false;
            }
        } else {
            if (controlsDiv) controlsDiv.style.display = 'none';
            if (permissionContainer) permissionContainer.style.display = 'block';
            if (state === 'prompt') {
                if (permissionHint) permissionHint.style.display = 'none';
            }
            setStatus('Ожидание разрешения на микрофон', '#FF9800');
            setRecordingState(false);
        }
    }

    if (permissionBtn) {
        permissionBtn.addEventListener('click', async () => {
             const state = microphonePermissionStatus ? microphonePermissionStatus.state : 'prompt';
             console.log('Permission button clicked, current state:', state);
             
             if (state === 'prompt') {
                 // Open dedicated permission page instead of calling getUserMedia in popup
                 chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
             } else if (state === 'denied') {
                 if (permissionHint) permissionHint.style.display = 'block';
                 setStatus('Требуется разрешение в настройках браузера', '#FF9800');
                 setTimeout(() => {
                     chrome.tabs.create({ url: 'chrome://settings/content/microphone' });
                 }, 400); // Increased delay slightly
             } else if (state === 'granted') {
                 // Fallback if status hasn't updated yet
                 handlePermissionState('granted', true);
             }
        });
    }

    // Запрашиваем текущий статус при открытии попапа
    sendToBackground({ action: 'get_status' }, async (response) => {
        let isActuallyListening = response && response.isListening;
        if (isActuallyListening) {
            setRecordingState(true);
            setStatus('Идет фоновая запись... Говорите "Следующее видео".', '#4CAF50');
            stopBtn.disabled = false;
        } else {
            setRecordingState(false);
            stopBtn.disabled = false;
        }
        await checkPermission(!isActuallyListening);
    });

    // Обработчик остановки/запуска записи (тоггл)
    stopBtn.addEventListener('click', async () => {
        if (isRecording) {
            sendToBackground({ action: 'stop_listening' });
            setStatus('Остановка записи...', '#333');
            setRecordingState(false);
        } else {
            stopBtn.disabled = true;
            await checkPermission(true);
        }
    });

    // Слушаем сообщения из фонового скрипта/offscreen документа
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'recognition_started') {
            setRecordingState(true);
            setStatus('Идет фоновая запись... Говорите "Следующее видео".', '#4CAF50');
            stopBtn.disabled = false;
        } else if (message.action === 'recognition_stopped') {
            setRecordingState(false);
            // Если статус уже красный (ошибка), не перезаписываем его на "Остановлена."
            if (statusDiv.style.color !== 'red') {
                setStatus('Запись остановлена (выключена).', '#333');
            }
            stopBtn.disabled = false;
        } else if (message.action === 'command_executed') {
            setStatus('▶ Команда: «' + message.commandName + '»', '#4CAF50');
        } else if (message.action === 'transcript_update') {
            if (message.isFinal) {
                console.log('%cФинальный: %c' + message.text, 'color: green; font-weight: bold;', 'color: black');
            } else {
                console.log('%cПромежуточный: %c' + message.text, 'color: gray; font-style: italic;', 'color: gray');
            }
        } else if (message.action === 'recognition_error') {
            if (message.error === 'network') {
                return; // Игнорируем сетевую ошибку, фон переподключит
            }
            console.error("Получена ошибка из фона:", message.error);
            let errorMessage = 'Ошибка: ' + message.error;
            if (message.error === 'not-allowed') {
                errorMessage = 'Нет доступа к микрофону в фоне.';
            } else if (message.error === 'no-speech') {
                // Игнорируем no-speech, так как мы будем перезапускать автоматически
                return;
            }
            setRecordingState(false);
            setStatus(errorMessage, 'red');
            stopBtn.disabled = false;
        } else if (message.action === 'reconnecting') {
            setStatus(`Переподключение (попытка ${message.attempt}/${message.max})...`, '#FF9800');
        } else if (message.action === 'recognition_error_final') {
            setRecordingState(false);
            setStatus('Ошибка сети. Проверьте подключение и попробуйте снова.', 'red');
            stopBtn.disabled = false;
        }
    });

    // Вспомогательная функция
    function setStatus(text, color) {
        statusDiv.textContent = text;
        statusDiv.style.color = color;
    }
});
