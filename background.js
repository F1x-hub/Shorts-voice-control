let activeTabId = null;
let isListening = false;
let lastHeartbeatTime = 0;
let watchdogInterval = null;

function startWatchdog() {
    stopWatchdog();
    watchdogInterval = setInterval(() => {
        if (!isListening) {
            stopWatchdog();
            return;
        }
        
        const now = Date.now();
        // If we haven't received a heartbeat in 5 seconds and we are supposed to be listening
        if (now - lastHeartbeatTime > 5000) {
            console.log("Heartbeat missed. Connection likely lost. Attempting to reconnect...");
            reconnectIframe();
        }
    }, 2000);
}

function stopWatchdog() {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
}

function reconnectIframe() {
    if (!isListening) return;
    
    chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
        if (tabs.length > 0) {
            // Pick active tab or fallback
            const targetTabId = tabs.find(t => t.active)?.id || tabs[0].id;
            
            if (activeTabId && activeTabId !== targetTabId) {
                // If it was on another tab, remove it first
                chrome.tabs.sendMessage(activeTabId, { action: 'remove_iframe' }).catch(() => {});
            }
            
            activeTabId = targetTabId;
            
            chrome.tabs.sendMessage(activeTabId, { action: 'inject_iframe' })
                .then(() => {
                    lastHeartbeatTime = Date.now(); // Reset heartbeat on successful injection
                })
                .catch(() => {
                    console.log("Failed to inject iframe during reconnection.");
                });
        } else {
            // No YouTube tabs left
            activeTabId = null;
            isListening = false;
            stopWatchdog();
            chrome.runtime.sendMessage({ 
                action: 'recognition_error', 
                error: 'Связь потеряна. Пожалуйста, откройте вкладку YouTube для продолжения работы.' 
            }).catch(() => {});
            chrome.runtime.sendMessage({ action: 'recognition_stopped' }).catch(() => {});
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'get_status') {
        sendResponse({ isListening: isListening });
        return true;
    } else if (message.action === 'heartbeat') {
        lastHeartbeatTime = Date.now();
        // Send a response just to cleanly resolve the message
        sendResponse({status: 'ok'}); 
    } else if (message.action === 'start_listening') {
        // Find a YouTube tab to host our listening iframe
        chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
            if (tabs.length > 0) {
                // Ищем активную вкладку, или берем первую попавшуюся
                activeTabId = tabs.find(t => t.active)?.id || tabs[0].id;
                
                chrome.tabs.sendMessage(activeTabId, { action: 'inject_iframe' })
                    .then(() => {
                        lastHeartbeatTime = Date.now();
                        startWatchdog();
                    })
                    .catch(() => {
                        console.log("Не удалось внедрить iframe в выбранную вкладку");
                        chrome.runtime.sendMessage({ action: 'recognition_error', error: 'not-allowed' }).catch(() => {});
                    });
                isListening = true;
            } else {
                chrome.runtime.sendMessage({ 
                    action: 'recognition_error', 
                    error: 'Чтобы запустить фоновое распознавание без окон, пожалуйста, откройте хотя бы одну вкладку YouTube.' 
                }).catch(() => {});
            }
        });
        sendResponse({status: 'started'});
    } else if (message.action === 'stop_listening') {
        if (activeTabId !== null) {
            chrome.tabs.sendMessage(activeTabId, { action: 'remove_iframe' }).catch(() => {});
            activeTabId = null;
        }
        isListening = false;
        stopWatchdog();
        // Также отправляем сигнал остановки всем iframe (на всякий случай)
        chrome.runtime.sendMessage({ action: 'stop_recognition' }).catch(() => {});
        chrome.runtime.sendMessage({ action: 'recognition_stopped' }).catch(() => {});
        sendResponse({status: 'stopped'});
    } else if (message.action === 'show_toast') {
        chrome.tabs.query({url: "*://*.youtube.com/*"}, (tabs) => {
            for (let tab of tabs) {
                chrome.tabs.sendMessage(tab.id, { action: 'show_toast', message: message.message }).catch(() => {});
            }
        });
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
        if (isListening) {
             // Let the watchdog handle reconnecting to a different tab or stopping
             console.log("Active tab closed, waiting for watchdog to reconnect...");
        } else {
            activeTabId = null;
            chrome.runtime.sendMessage({ action: 'recognition_stopped' }).catch(() => {});
        }
    }
});

// Handle navigation in the active tab (e.g., user clicked a link)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // If the active tab completes loading and we are supposed to be listening
    if (tabId === activeTabId && changeInfo.status === 'complete' && isListening) {
         // The iframe was destroyed during reload, re-inject it
         console.log("Active tab updated, re-injecting iframe...");
         chrome.tabs.sendMessage(activeTabId, { action: 'inject_iframe' })
             .then(() => {
                 lastHeartbeatTime = Date.now();
             })
             .catch(() => {});
    }
});

// Switch iframe to the newly activated YouTube tab to ensure background throttling doesn't affect us
chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!isListening) return;
    
    chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) return;
        
        if (tab.url && tab.url.includes('youtube.com')) {
            // Remove from old tab if it exists
            if (activeTabId && activeTabId !== tab.id) {
                chrome.tabs.sendMessage(activeTabId, { action: 'remove_iframe' }).catch(() => {});
            }
            
            // Inject into new active youtube tab
            activeTabId = tab.id;
            chrome.tabs.sendMessage(activeTabId, { action: 'inject_iframe' })
                 .then(() => {
                     lastHeartbeatTime = Date.now();
                 })
                 .catch(() => {});
        }
    });
});

