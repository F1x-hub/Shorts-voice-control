const DEFAULT_PREV = ["назад", "предыдущее", "прошлое", "back", "previous", "prev"];
const DEFAULT_NEXT = ["вперёд", "следующее", "дальше", "next", "forward"];

let prevKeywords = [];
let nextKeywords = [];

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();

    document.getElementById('addPrevBtn').addEventListener('click', () => {
        addKeyword('prevInput', prevKeywords, renderPrev);
    });
    
    document.getElementById('addNextBtn').addEventListener('click', () => {
        addKeyword('nextInput', nextKeywords, renderNext);
    });

    // Enter key support
    document.getElementById('prevInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('prevInput', prevKeywords, renderPrev);
    });

    document.getElementById('nextInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addKeyword('nextInput', nextKeywords, renderNext);
    });
});

function loadSettings() {
    chrome.storage.sync.get(['prevKeywords', 'nextKeywords'], (result) => {
        prevKeywords = result.prevKeywords || [...DEFAULT_PREV];
        nextKeywords = result.nextKeywords || [...DEFAULT_NEXT];
        
        renderPrev();
        renderNext();
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
        nextKeywords: nextKeywords
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
