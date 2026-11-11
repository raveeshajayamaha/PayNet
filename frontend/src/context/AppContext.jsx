import { useState } from "react";
import { sampleUser, initialNotifications } from "../data/demo";
import { useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { apiOrigin, demoMode, setCsrfToken } from '../services/api';
import { authService } from '../services/auth';
import { walletService } from '../services/wallets';
import { notificationService } from '../services/notifications';
import { mapUser, mapNotification, mapTransaction } from '../services/liveData';
import { AppContext } from "./useApp";
import { useEffect } from 'react';
import { getNetworkSocket, retainNetworkSocket } from '../services/socket';
import { subscribeNotifications } from '../services/notificationListener';
import './NotificationToast.css';
export function AppProvider({ children }) {
  const [user, setUser] = useState(demoMode ? sampleUser : null);
  const [notifications, setNotifications] = useState(demoMode ? initialNotifications : []);
  const [testNotifications, setTestNotifications] = useState([]);
  const [notificationToast, setNotificationToast] = useState(null);
  const [authLoading, setAuthLoading] = useState(!demoMode);
  const [summary, setSummary] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationPages, setNotificationPages] = useState(1);
  const [revision, setRevision] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [dataError, setDataError] = useState('');
  const [networkStatus, setNetworkStatus] = useState('connecting');
  const identity = useRef(null), epoch = useRef(0), refreshing = useRef(null);
  const clearSession = useCallback(() => {
    epoch.current++; identity.current = null; refreshing.current = null;
    setCsrfToken(); setUser(null); setNotifications([]); setSummary(null); setUnreadCount(0); setDataError('');
  }, []);
  const refresh = useCallback(() => {
    if (demoMode || !identity.current) return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    const version = epoch.current;
    const promise = (async () => {
      try {
        const [me, walletSummary, noticeList] = await Promise.all([authService.me(), walletService.summary(), notificationService.list({ page: 1, limit: 50 })]);
        if (version !== epoch.current) return;
        setCsrfToken(me.csrfToken);
        setUser(mapUser(me.user, walletSummary.wallet));
        setSummary({ ...walletSummary, recentTransactions: walletSummary.recentTransactions.map(mapTransaction) });
        setNotifications(noticeList.items.map(mapNotification)); setUnreadCount(noticeList.unreadCount);
        setNotificationPage(1); setNotificationPages(noticeList.pages);
        setDataError(''); setRevision((v) => v + 1);
      } catch (error) {
        if (version !== epoch.current) return;
        if (error.status === 401) clearSession();
        else setDataError(error.message + ' Displayed data may be out of date.');
      } finally { if (refreshing.current === promise) refreshing.current = null; }
    })();
    refreshing.current = promise;
    return promise;
  }, [clearSession]);
  const signIn = useCallback(async (result) => {
    epoch.current++; refreshing.current = null; identity.current = result.user.id;
    setCsrfToken(result.csrfToken); setUser(mapUser(result.user, result.wallet)); setSummary(null); setNotifications([]);
    setDataError(''); setSessionRevision((v) => v + 1);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    if (demoMode) return;
    const controller = new AbortController();
    const version = epoch.current;
    authService.me().then((result) => {
      if (!controller.signal.aborted && epoch.current === version) return signIn(result);
    }).catch((error) => { if (!controller.signal.aborted && error.status !== 401) setDataError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setAuthLoading(false); });
    return () => controller.abort();
  }, [signIn]);
  useEffect(() => {
    if (demoMode || !user?.id) return;
    const socket = io((import.meta.env.VITE_SOCKET_URL || apiOrigin).replace(/\/$/, '') + '/payments', {
      withCredentials: true, forceNew: true, reconnectionAttempts: 8, reconnectionDelay: 500, reconnectionDelayMax: 5000,
    });
    let refreshTimer;
    const changed = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { void refresh(); }, 80); };
    socket.on('connect', () => { setNetworkStatus('connected'); void refresh(); });
    socket.on('disconnect', () => { setNetworkStatus('disconnected'); void refresh(); });
    socket.on('connect_error', (error) => {
      setNetworkStatus('disconnected');
      if (error.data?.code === 'AUTH_REQUIRED') { socket.disconnect(); void refresh(); }
    });
    for (const event of ['payment:sent', 'payment:received', 'wallet:updated', 'transaction:updated', 'notification:new']) socket.on(event, changed);
    const timer = setInterval(() => { void refresh(); }, 20000);
    const resume = () => { if (!socket.connected) socket.connect(); void refresh(); };
    window.addEventListener('online', resume); window.addEventListener('focus', resume);
    return () => {
      clearInterval(timer); clearTimeout(refreshTimer);
      window.removeEventListener('online', resume); window.removeEventListener('focus', resume);
      socket.removeAllListeners(); socket.disconnect();
    };
  }, [user?.id, sessionRevision, refresh]);
  async function logout() { await authService.logout(); clearSession(); }
  async function markRead(id) {
    if (demoMode) { setNotifications((items) => items.map((n) => !id || n.id === id ? { ...n, read: true } : n)); return; }
    try { await (id ? notificationService.markRead(id) : notificationService.markAll()); await refresh(); }
    catch (error) { setDataError(error.message); }
  }
  async function loadMoreNotifications() {
    try {
      const result = await notificationService.list({ page: notificationPage + 1, limit: 50 });
      setNotifications((items) => [...new Map([...items, ...result.items.map(mapNotification)].map((n) => [n.id, n])).values()]);
      setNotificationPage(result.page); setNotificationPages(result.pages);
    } catch (error) { setDataError(error.message); }
  }
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const unsubscribe = subscribeNotifications(getNetworkSocket(), (item) => {
      setTestNotifications((items) => items.some((n) => n.id === item.id) ? items : [item, ...items].slice(0, 100));
      setNotificationToast(item);
    });
    const release = retainNetworkSocket();
    return () => { unsubscribe(); release(); };
  }, []);
  useEffect(() => {
    if (!notificationToast) return;
    const timer = setTimeout(() => setNotificationToast(null), 6000);
    return () => clearTimeout(timer);
  }, [notificationToast]);
  return (
    <AppContext.Provider
      value={{ user, setUser, notifications, setNotifications, testNotifications, setTestNotifications,
        authLoading, signIn, logout, refresh, summary, revision, networkStatus, dataError, markRead, unreadCount,
        notificationPage, notificationPages, loadMoreNotifications }}
    >
      {children}
      {notificationToast && <aside className="notification-toast" role="status" aria-label="Test notification">
        <strong>Development test · nonfinancial</strong><p>{notificationToast.message}</p>
        <button className="text-button" onClick={() => setNotificationToast(null)}>Dismiss notification</button>
      </aside>}
    </AppContext.Provider>
  );
}
