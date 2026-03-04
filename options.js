const DEFAULT_PREV = ["назад", "предыдущее", "прошлое", "back", "previous", "prev"];
const DEFAULT_NEXT = ["вперёд", "следующее", "дальше", "next", "forward"];

let prevKeywords = [];
let nextKeywords = [];
let altPrevKeywords = [];
let altNextKeywords = [];
let currentLang = 'ru-RU';
let currentSensitivity = 5;
let showToast = true;

// Local preview variables
let localRecognition;
let isTestingMic = false;

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    document.getElementById('addPrevBtn').addEventListener('click', () => {
        addKeyword('prevInput', prevKeywords, renderPrev);
    });
    
    document.getElementById('addNextBtn').addEventListener('click', () => {
        addKeyword('nextInput', nextKeywords, renderNext);
    });

    document.getElementById('addAltPrevBtn').addEventListener('click', () => {
        addKeyword('altPrevInput', altPrevKeywords, renderAltPrev);
    });
    
    document.getElementById('addAltNextBtn').addEventListener('click', () => {
        addKeyword('altNextInput', altNextKeywords, renderAltNext);
    });

    // Enter key support
    document.getElementById('prevInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('prevInput', prevKeywords, renderPrev);
    });

    document.getElementById('nextInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('nextInput', nextKeywords, renderNext);
    });

    document.getElementById('altPrevInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('altPrevInput', altPrevKeywords, renderAltPrev);
    });

    document.getElementById('altNextInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('altNextInput', altNextKeywords, renderAltNext);
    });

    // Language select support
    document.getElementById('langSelect').addEventListener('change', (e) => {
        currentLang = e.target.value;
        saveSettings();
        if (isTestingMic) { stopTestMic(); }
    });

    // Sensitivity slider support
    const slider = document.getElementById('sensitivitySlider');
    const sliderValue = document.getElementById('sensitivityValue');
    slider.addEventListener('input', (e) => {
        currentSensitivity = parseInt(e.target.value, 10);
        sliderValue.textContent = currentSensitivity;
        saveSettings();
    });

    // Test Mic Button
    document.getElementById('testMicBtn').addEventListener('click', () => {
        if (isTestingMic) {
            stopTestMic();
        } else {
            startTestMic();
        }
    });
    // Toast toggle support
    const toastToggle = document.getElementById('showToastToggle');
    if (toastToggle) {
        toastToggle.addEventListener('change', () => {
            showToast = toastToggle.checked;
            saveSettings();
        });
    }
});

function loadSettings() {
    chrome.storage.sync.get(['prevKeywords', 'nextKeywords', 'altPrevKeywords', 'altNextKeywords', 'language', 'sensitivity', 'showToast'], (result) => {
        prevKeywords = result.prevKeywords || [...DEFAULT_PREV];
        nextKeywords = result.nextKeywords || [...DEFAULT_NEXT];
        altPrevKeywords = result.altPrevKeywords || [];
        altNextKeywords = result.altNextKeywords || [];
        currentLang = result.language || 'ru-RU';
        currentSensitivity = result.sensitivity || 5;
        
        document.getElementById('langSelect').value = currentLang;
        document.getElementById('sensitivitySlider').value = currentSensitivity;
        document.getElementById('sensitivityValue').textContent = currentSensitivity;

        showToast = result.showToast !== undefined ? result.showToast : true;
        const toastToggle = document.getElementById('showToastToggle');
        if (toastToggle) toastToggle.checked = showToast;

        renderPrev();
        renderNext();
        renderAltPrev();
        renderAltNext();
    });
}

function renderPrev() {
    renderChips('prevKeywordsContainer', prevKeywords, (index) => {
        prevKeywords.splice(index, 1);
        saveSettings();
        renderPrev();
    });
}

function renderNext() {
    renderChips('nextKeywordsContainer', nextKeywords, (index) => {
        nextKeywords.splice(index, 1);
        saveSettings();
        renderNext();
    });
}

function renderAltPrev() {
    renderChips('altPrevKeywordsContainer', altPrevKeywords, (index) => {
        altPrevKeywords.splice(index, 1);
        saveSettings();
        renderAltPrev();
    });
}

function renderAltNext() {
    renderChips('altNextKeywordsContainer', altNextKeywords, (index) => {
        altNextKeywords.splice(index, 1);
        saveSettings();
        renderAltNext();
    });
}

function renderChips(containerId, keywords, onRemove) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    keywords.forEach((keyword, index) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = keyword;
        
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '&#10060;'; // Cross mark
        removeBtn.addEventListener('click', () => onRemove(index));
        
        chip.appendChild(removeBtn);
        container.appendChild(chip);
    });
}

function addKeyword(inputId, keywordList, renderFunc) {
    const input = document.getElementById(inputId);
    const val = input.value.trim().toLowerCase();
    
    if (val && !keywordList.includes(val)) {
        keywordList.push(val);
        input.value = '';
        saveSettings();
        renderFunc();
    } else if (keywordList.includes(val)) {
        // Maybe visual feedback for duplicate
        input.value = '';
    }
}

function saveSettings() {
    chrome.storage.sync.set({
        prevKeywords: prevKeywords,
        nextKeywords: nextKeywords,
        altPrevKeywords: altPrevKeywords,
        altNextKeywords: altNextKeywords,
        language: currentLang,
        sensitivity: currentSensitivity,
        showToast: showToast
    }, () => {
        showSaveMessage();
    });
}

function showSaveMessage() {
    const msg = document.getElementById('saveMessage');
    msg.classList.add('visible');
    
    // Clear previous timeout if multiple saves happen fast
    if (window.saveMsgTimeout) {
        clearTimeout(window.saveMsgTimeout);
    }
    
    window.saveMsgTimeout = setTimeout(() => {
        msg.classList.remove('visible');
    }, 2000);
}

// ==========================================
// PREVIEW MICROPHONE LOGIC
// ==========================================

function startTestMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Web Speech API не поддерживается в этом браузере.");
        return;
    }

    localRecognition = new SpeechRecognition();
    localRecognition.lang = currentLang;
    localRecognition.continuous = true;
    localRecognition.interimResults = true;

    const testBtn = document.getElementById('testMicBtn');
    const finalDiv = document.getElementById('finalText');
    const interimDiv = document.getElementById('interimText');

    testBtn.textContent = 'Остановить тест';
    testBtn.style.backgroundColor = '#f44336';
    isTestingMic = true;
    
    finalDiv.textContent = '';
    interimDiv.textContent = 'Слушаю...';

    localRecognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            finalDiv.textContent += finalTranscript + ' ';
        }

        // Apply sensitivity logic to interim results
        const text = interimTranscript.trim();
        
        // Threshold: How many characters needed before we consider an interim result "worthy" of showing
        // 1 (strictest): 15 chars
        // 10 (most sensitive): 0 chars
        const thresholdLength = Math.max(0, Math.floor((10 - currentSensitivity) * 1.5));
        
        if (text.length >= thresholdLength) {
            interimDiv.textContent = text;
        } else if (text.length === 0) {
            interimDiv.textContent = '';
        } else {
             // Too short for current strictness
            interimDiv.textContent = '...'; 
        }
    };

    localRecognition.onerror = (event) => {
        console.error("Test Mic error:", event.error);
        interimDiv.textContent = 'Ошибка: ' + event.error;
        stopTestMic();
    };

    localRecognition.onend = () => {
        if (isTestingMic) {
            // Restart automatically if still "testing" 
            try {
                localRecognition.start();
            } catch(e) {}
        }
    };

    try {
        localRecognition.start();
    } catch(e) {
        console.error("Start test mic error", e);
    }
}

function stopTestMic() {
    isTestingMic = false;
    const testBtn = document.getElementById('testMicBtn');
    testBtn.textContent = 'Тест микрофона';
    testBtn.style.backgroundColor = '#2196F3';
    
    document.getElementById('interimText').textContent = 'Нажмите «Тест микрофона» и скажите что-нибудь...';

    if (localRecognition) {
        localRecognition.onend = null;
        localRecognition.stop();
        localRecognition = null;
    }
}
