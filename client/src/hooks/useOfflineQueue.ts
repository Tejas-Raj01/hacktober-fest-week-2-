import { useEffect, useCallback } from 'react';

export function useOfflineQueue(ws: WebSocket | null, wsReady: boolean) {
  
  const flushQueue = useCallback(() => {
    if (!ws || !wsReady) return;
    
    const queueStr = localStorage.getItem('offlineActionQueue');
    if (queueStr) {
      try {
        const queue: any[] = JSON.parse(queueStr);
        if (queue.length > 0) {
          console.log(`Flushing ${queue.length} offline actions to server...`);
          // Send all queued actions as a SyncQueue message
          ws.send(JSON.stringify({
            type: 'SyncQueue',
            payload: { actions: queue }
          }));
          localStorage.removeItem('offlineActionQueue');
        }
      } catch (e) {
        console.error("Failed to parse offline queue", e);
        localStorage.removeItem('offlineActionQueue');
      }
    }
  }, [ws, wsReady]);

  // Flush queue when coming online or when websocket reconnects
  useEffect(() => {
    const handleOnline = () => {
      console.log("Browser went online");
      flushQueue();
    };

    window.addEventListener('online', handleOnline);
    if (wsReady) {
      flushQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [wsReady, flushQueue]);

  const queueAction = useCallback((actionType: string, payload: any) => {
    const action = { type: actionType, payload, timestamp: Date.now() };
    
    if (wsReady && ws && navigator.onLine) {
      ws.send(JSON.stringify(action));
    } else {
      console.log("Offline: queueing action", action);
      const queueStr = localStorage.getItem('offlineActionQueue');
      let queue = [];
      if (queueStr) {
        try {
          queue = JSON.parse(queueStr);
        } catch (e) {}
      }
      queue.push(action);
      localStorage.setItem('offlineActionQueue', JSON.stringify(queue));
    }
  }, [ws, wsReady]);

  return { queueAction };
}
