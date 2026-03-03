document.getElementById('request-btn').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Если всё успешно, останавливаем поток, он нужен был только для разрешения
        stream.getTracks().forEach(track => track.stop());
        
        document.getElementById('status').textContent = '✅ Разрешение получено! Вы можете закрыть эту вкладку и начать запись в расширении.';
        document.getElementById('status').style.color = 'green';
        document.getElementById('request-btn').style.display = 'none';
        document.getElementById('instructions').style.display = 'none';
        
    } catch (err) {
        // Если ошибка или отказ
        document.getElementById('status').textContent = '❌ Доступ к микрофону запрещен.';
        document.getElementById('status').style.color = 'red';
        document.getElementById('instructions').style.display = 'block';
        console.error('Ошибка:', err);
    }
});
