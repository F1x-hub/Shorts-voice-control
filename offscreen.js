let recognition;
let mediaStream;

const DEFAULT_PREV = ["назад", "предыдущее", "прошлое", "back", "previous", "prev"];
const DEFAULT_NEXT = ["вперёд", "следующее", "дальше", "next", "forward"];

let prevKeywords = [...DEFAULT_PREV];
let nextKeywords = [...DEFAULT_NEXT];

chrome.storage.sync.get(['prevKeywords', 'nextKeywords'], (result) => {
    if (result.prevKeywords) prevKeywords = result.prevKeywords;
    if (result.nextKeywords) nextKeywords = result.nextKeywords;
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.prevKeywords) prevKeywords = changes.prevKeywords.newValue;
        if (changes.nextKeywords) nextKeywords = changes.nextKeywords.newValue;
    }
});

const checkKeyword = (text, keywords) => {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start_recognition') {
        startRecognition();
    } else if (message.action === 'stop_recognition') {
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
    recognition.lang = 'ru-RU';
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

        const text = (finalTranscript || interimTranscript).toLowerCase().trim();
        
        // Отправляем промежуточный статус на popup если он открыт
        chrome.runtime.sendMessage({
            action: 'transcript_update',
            text: text,
            isFinal: !!finalTranscript
        }).catch(() => {});

        // Проверяем команды
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

function stopRecognition() {
    if (recognition) {
        // Убираем onend перед остановкой, чтобы он не пытался перезапуститься
        recognition.onend = null;
        recognition.stop();
        recognition = null;
        chrome.runtime.sendMessage({ action: 'recognition_stopped' }).catch(() => {});
    }
    
    // Останавливаем аудио-поток, если он был
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    // Закрываем окно, если это popup окно
    window.close();
}
