let activeTabId = null;

let isListening = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'get_status') {
        sendResponse({ isListening: isListening });
        return true;
    } else if (message.action === 'start_listening') {
        // Find a YouTube tab to host our listening iframe
        chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
            if (tabs.length > 0) {
                // Ищем активную вкладку, или берем первую попавшуюся
                activeTabId = tabs.find(t => t.active)?.id || tabs[0].id;
                
                chrome.tabs.sendMessage(activeTabId, { action: 'inject_iframe' })
                    .catch(() => {
                        console.log("Не удалось внедрить iframe в выбранную вкладку");
                        chrome.runtime.sendMessage({ action: 'recognition_error', error: 'not-allowed' });
                    });
                isListening = true;
            } else {
                chrome.runtime.sendMessage({ 
                    action: 'recognition_error', 
                    error: 'Чтобы запустить фоновое распознавание без окон, пожалуйста, откройте хотя бы одну вкладку YouTube.' 
                });
            }
        });
        sendResponse({status: 'started'});
    } else if (message.action === 'stop_listening') {
        if (activeTabId !== null) {
            chrome.tabs.sendMessage(activeTabId, { action: 'remove_iframe' }).catch(() => {});
            activeTabId = null;
        }
        isListening = false;
        // Также отправляем сигнал остановки всем iframe (на всякий случай)
        chrome.runtime.sendMessage({ action: 'stop_recognition' }).catch(() => {});
        chrome.runtime.sendMessage({ action: 'recognition_stopped' });
        sendResponse({status: 'stopped'});
    } else if (message.action === 'voice_command') {
        if (message.command === 'next_video') {
            // Find YouTube tabs and send message to click next
            chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
                for (let tab of tabs) {
                    // Используем catch, чтобы проигнорировать старые вкладки, где content script еще не загрузился
                    chrome.tabs.sendMessage(tab.id, { action: 'click_next_video' }).catch(() => {});
                }
            });
        } else if (message.command === 'prev_video') {
            // Find YouTube tabs and send message to click prev
            chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
                for (let tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, { action: 'click_prev_video' }).catch(() => {});
                }
            });
        }
    }
});

// Если вкладка с внедренным микрофоном закрылась, оповещаем попап, чтобы статус сбросился
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) {
        activeTabId = null;
        chrome.runtime.sendMessage({ action: 'recognition_stopped' });
    }
});
