import { useState } from "react";
import { sampleUser, initialNotifications } from "../data/demo";
import { useCallback, useRef } from 'react';
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
import { createAccountScope } from '../services/accountScope';
import { createPaymentConnection } from '../services/paymentConnection';
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
  const accountScope = useRef(createAccountScope()), refreshing = useRef(null), pagination = useRef(null), paymentConnection = useRef(null);
  const clearSession = useCallback(() => {
    accountScope.current.change(null); refreshing.current = null; pagination.current = null;
    setCsrfToken(); setUser(null); setNotifications([]); setSummary(null); setUnreadCount(0); setDataError('');
    setNotificationPage(1); setNotificationPages(1); setNetworkStatus('disconnected');
  }, []);
  const refresh = useCallback(() => {
    if (demoMode || !accountScope.current.userId) return Promise.resolve();
    if (refreshing.current) return refreshing.current;
    pagination.current?.cancel(); pagination.current = null;
    const request = accountScope.current.capture();
    const promise = (async () => {
      try {
        const options = { signal: request.signal };
        const [me, walletSummary, noticeList] = await Promise.all([authService.me(options), walletService.summary(options), notificationService.list({ page: 1, limit: 50 }, options)]);
        if (!request.isCurrent()) return;
        if (me.user.id !== request.userId || walletSummary.wallet.userId !== request.userId || noticeList.items.some((n) => !n.id)) { clearSession(); return; }
        setCsrfToken(me.csrfToken);
        setUser(mapUser(me.user, walletSummary.wallet));
        setSummary({ ...walletSummary, recentTransactions: walletSummary.recentTransactions.map(mapTransaction) });
        setNotifications(noticeList.items.map(mapNotification)); setUnreadCount(noticeList.unreadCount);
        setNotificationPage(1); setNotificationPages(noticeList.pages);
        setDataError(''); setRevision((v) => v + 1);
      } catch (error) {
        if (!request.isCurrent()) return;
        if (error.status === 401) clearSession();
        else setDataError(error.message + ' Displayed data may be out of date.');
      } finally { request.release(); if (refreshing.current === promise) refreshing.current = null; }
    })();
    refreshing.current = promise;
    return promise;
  }, [clearSession]);
  const signIn = useCallback(async (result) => {
    accountScope.current.change(result.user.id); refreshing.current = null; pagination.current = null;
    setCsrfToken(result.csrfToken); setUser(mapUser(result.user, result.wallet)); setSummary(null); setNotifications([]);
    setDataError(''); setSessionRevision((v) => v + 1);
    setNotificationPage(1); setNotificationPages(1); setUnreadCount(0);
    await refresh();
  }, [refresh]);
  useEffect(() => {
    if (demoMode) return;
    const controller = new AbortController();
    const version = accountScope.current.generation;
    authService.me({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && accountScope.current.generation === version) return signIn(result);
    }).catch((error) => { if (!controller.signal.aborted && error.status !== 401) setDataError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setAuthLoading(false); });
    return () => controller.abort();
  }, [signIn]);
  useEffect(() => {
    if (demoMode || !user?.id) return;
    const connection = createPaymentConnection({ url: import.meta.env.VITE_SOCKET_URL || apiOrigin,
      reconcile: refresh, onState: (state) => setNetworkStatus(state.status) });
    paymentConnection.current = connection;
    return () => {
      connection.dispose(); if (paymentConnection.current === connection) paymentConnection.current = null;
    };
  }, [user?.id, sessionRevision, refresh]);
  useEffect(() => () => accountScope.current.change(null), []);
  async function logout() {
    // Start with the current CSRF header, then clear/cancel local private state immediately.
    const pending = authService.logout(); clearSession(); await pending;
  }
  async function markRead(id) {
    if (demoMode) { setNotifications((items) => items.map((n) => !id || n.id === id ? { ...n, read: true } : n)); return; }
    const request = accountScope.current.capture();
    try {
      await (id ? notificationService.markRead(id, { signal: request.signal }) : notificationService.markAll({ signal: request.signal }));
      if (request.isCurrent()) await refresh();
    } catch (error) { if (request.isCurrent()) setDataError(error.message); }
    finally { request.release(); }
  }
  async function loadMoreNotifications() {
    if (!accountScope.current.userId || refreshing.current) return;
    pagination.current?.cancel();
    const request = accountScope.current.capture(); pagination.current = request;
    try {
      const result = await notificationService.list({ page: notificationPage + 1, limit: 50 }, { signal: request.signal });
      if (!request.isCurrent()) return;
      setNotifications((items) => request.isCurrent() ? [...new Map([...items, ...result.items.map(mapNotification)].map((n) => [n.id, n])).values()] : items);
      setNotificationPage(result.page); setNotificationPages(result.pages);
    } catch (error) { if (request.isCurrent()) setDataError(error.message); }
    finally { request.release(); if (pagination.current === request) pagination.current = null; }
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
        notificationPage, notificationPages, loadMoreNotifications,
        reconnectPayments: () => paymentConnection.current?.reconnect() }}
    >
      {children}
      {notificationToast && <aside className="notification-toast" role="status" aria-label="Test notification">
        <strong>Development test · nonfinancial</strong><p>{notificationToast.message}</p>
        <button className="text-button" onClick={() => setNotificationToast(null)}>Dismiss notification</button>
      </aside>}
    </AppContext.Provider>
  );
}
