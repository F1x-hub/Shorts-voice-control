let recognition;
const DEFAULT_PREV = ["назад", "предыдущее", "прошлое", "back", "previous", "prev"];
const DEFAULT_NEXT = ["вперёд", "следующее", "дальше", "next", "forward"];

let prevKeywords = [...DEFAULT_PREV];
let nextKeywords = [...DEFAULT_NEXT];
let currentLang = 'ru-RU';
let currentSensitivity = 5;

chrome.storage.sync.get(['prevKeywords', 'nextKeywords', 'language', 'sensitivity'], (result) => {
    if (result.prevKeywords) prevKeywords = result.prevKeywords;
    if (result.nextKeywords) nextKeywords = result.nextKeywords;
    if (result.language) currentLang = result.language;
    if (result.sensitivity) currentSensitivity = result.sensitivity;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.prevKeywords) prevKeywords = changes.prevKeywords.newValue;
        if (changes.nextKeywords) nextKeywords = changes.nextKeywords.newValue;
        if (changes.language) {
            currentLang = changes.language.newValue;
            // Перезапускаем распознавание с новым языком
            if (recognition) {
                console.log("Язык изменён, перезапуск...");
                stopRecognition();
                setTimeout(startRecognition, 100);
            }
        }
        if (changes.sensitivity) {
            currentSensitivity = changes.sensitivity.newValue;
        }
    }
});

const checkKeyword = (text, keywords) => {
    return keywords.some(keyword => new RegExp(`(?:^|\\s)${keyword}(?:\\s|$)`, 'i').test(text));
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stop_recognition') {
        stopRecognition();
    }
});

async function startRecognition() {
    if (recognition) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.error('Web Speech API не поддерживается.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = currentLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        const rawText = finalTranscript + ' ' + interimTranscript;
        const text = rawText.replace(/[.,!?;:]/g, '').trim().toLowerCase();
        
        // Отправляем промежуточный статус на popup если он открыт (с учетом чувствительности)
        const thresholdLength = Math.max(0, Math.floor((10 - currentSensitivity) * 1.5));
        
        if (finalTranscript || text.length >= thresholdLength) {
            chrome.runtime.sendMessage({
                action: 'transcript_update',
                text: text,
                isFinal: !!finalTranscript
            }).catch(() => {});

            // Проверяем команды только если результат isFinal ИЛИ длина строки превышает thresholdLength
            if (checkKeyword(text, nextKeywords)) {
                console.log("Найдена команда: следующее видео");
                chrome.runtime.sendMessage({ action: 'voice_command', command: 'next_video' }).catch(() => {});
                
                // Если мы нашли команду, перезапустим сессию для очистки буфера слов
                stopRecognition();
                setTimeout(startRecognition, 100);
            } else if (checkKeyword(text, prevKeywords)) {
                console.log("Найдена команда: предыдущее видео");
                chrome.runtime.sendMessage({ action: 'voice_command', command: 'prev_video' }).catch(() => {});
                
                stopRecognition();
                setTimeout(startRecognition, 100);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Ошибка распознавания:', event.error);
        chrome.runtime.sendMessage({ action: 'recognition_error', error: event.error }).catch(() => {});
        if (event.error === 'not-allowed') {
            stopRecognition();
        }
    };

    recognition.onend = () => {
        console.log('Распознавание завершено. Перезапуск...');
        // Перезапускаем если не было ошибки и объект recognition существует
        if (recognition) {
            try {
                recognition.start();
            } catch(e) {
                console.error(e);
            }
        }
    };

    try {
        recognition.start();
        chrome.runtime.sendMessage({ action: 'recognition_started' }).catch(() => {});
    } catch (e) {
        console.error("Ошибка старта", e);
    }
}

let heartbeatInterval;

function startHeartbeat() {
    stopHeartbeat(); // Clear previous if exists
    heartbeatInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: 'heartbeat' }).catch(() => {});
    }, 2000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

function stopRecognition() {
    if (recognition) {
        // Убираем обработчики перед остановкой, чтобы избежать двойных срабатываний
        // от оставшихся промежуточных или финальных результатов при вызове stop(),
        // а также попыток перезапуститься через onend.
        recognition.onend = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.stop();
        recognition = null;
        chrome.runtime.sendMessage({ action: 'recognition_stopped' }).catch(() => {});
    }
    stopHeartbeat();
}

// Автоматически запускаем при загрузке iframe
startRecognition();
startHeartbeat();
