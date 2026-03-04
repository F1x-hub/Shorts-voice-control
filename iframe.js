let recognition;
const DEFAULT_PREV = ["назад", "предыдущее", "прошлое", "back", "previous", "prev"];
const DEFAULT_NEXT = ["вперёд", "следующее", "дальше", "next", "forward"];

let prevKeywords = [...DEFAULT_PREV];
let nextKeywords = [...DEFAULT_NEXT];
let altPrevKeywords = [];
let altNextKeywords = [];
let currentLang = 'ru-RU';
let currentSensitivity = 5;
let showToastEnabled = true;

chrome.storage.sync.get(['prevKeywords', 'nextKeywords', 'altPrevKeywords', 'altNextKeywords', 'language', 'sensitivity', 'showToast'], (result) => {
    if (result.prevKeywords) prevKeywords = result.prevKeywords;
    if (result.nextKeywords) nextKeywords = result.nextKeywords;
    if (result.altPrevKeywords) altPrevKeywords = result.altPrevKeywords;
    if (result.altNextKeywords) altNextKeywords = result.altNextKeywords;
    if (result.language) currentLang = result.language;
    if (result.sensitivity) currentSensitivity = result.sensitivity;
    if (result.showToast !== undefined) showToastEnabled = result.showToast;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.prevKeywords) prevKeywords = changes.prevKeywords.newValue;
        if (changes.nextKeywords) nextKeywords = changes.nextKeywords.newValue;
        if (changes.altPrevKeywords) altPrevKeywords = changes.altPrevKeywords.newValue;
        if (changes.altNextKeywords) altNextKeywords = changes.altNextKeywords.newValue;
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
        if (changes.showToast !== undefined) {
            showToastEnabled = changes.showToast.newValue;
        }
    }
});

function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

const checkKeyword = (text, keywords, altKeywords = []) => {
    const tokens = text.split(/\s+/);
    const allKeywords = [...keywords, ...altKeywords];
    
    for (const keyword of allKeywords) {
        // Strict boundary matching
        if (new RegExp(`(?:^|\\s)${keyword}(?:\\s|$)`, 'i').test(text)) return keyword;
        
        // Fuzzy match with 80% similarity threshold
        const matched = tokens.some(token => {
            const maxLen = Math.max(token.length, keyword.length);
            if (maxLen === 0) return false;
            const similarity = 1 - (levenshtein(token.toLowerCase(), keyword.toLowerCase()) / maxLen);
            return similarity >= 0.8;
        });
        if (matched) return keyword;
    }
    return null;
};

let isDebouncing = false;
let lastProcessedResultIndex = 0;

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
        if (isDebouncing) return;

        let interimTranscript = '';
        let finalTranscript = '';

        const startIndex = Math.max(event.resultIndex, lastProcessedResultIndex);

        for (let i = startIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
                lastProcessedResultIndex = i + 1; // Mark as fully processed so we do not re-eval inside the continuous buffer
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        const rawText = finalTranscript + ' ' + interimTranscript;
        if (!rawText.trim()) return;

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
            const nextMatch = checkKeyword(text, nextKeywords, altNextKeywords);
            const prevMatch = !nextMatch ? checkKeyword(text, prevKeywords, altPrevKeywords) : null;

            if (nextMatch) {
                const commandName = 'Следующее видео';
                console.log("Найдена команда:", commandName);
                chrome.runtime.sendMessage({ action: 'voice_command', command: 'next_video' }).catch(() => {});
                chrome.runtime.sendMessage({ action: 'command_executed', commandName: commandName }).catch(() => {});
                if (showToastEnabled) {
                    chrome.runtime.sendMessage({ action: 'show_toast', message: '▶ Команда: «' + commandName + '»' }).catch(() => {});
                }
                
                // Дебоунсинг вместо перезапуска API
                lastProcessedResultIndex = event.results.length;
                isDebouncing = true;
                setTimeout(() => { isDebouncing = false; }, 2000);
            } else if (prevMatch) {
                const commandName = 'Предыдущее видео';
                console.log("Найдена команда:", commandName);
                chrome.runtime.sendMessage({ action: 'voice_command', command: 'prev_video' }).catch(() => {});
                chrome.runtime.sendMessage({ action: 'command_executed', commandName: commandName }).catch(() => {});
                if (showToastEnabled) {
                    chrome.runtime.sendMessage({ action: 'show_toast', message: '▶ Команда: «' + commandName + '»' }).catch(() => {});
                }
                
                // Дебоунсинг вместо перезапуска API
                lastProcessedResultIndex = event.results.length;
                isDebouncing = true;
                setTimeout(() => { isDebouncing = false; }, 2000);
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
