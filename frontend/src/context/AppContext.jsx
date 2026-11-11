import { useState } from "react";
import { sampleUser, initialNotifications } from "../data/demo";
import { AppContext } from "./useApp";
import { useEffect } from 'react';
import { getNetworkSocket, retainNetworkSocket } from '../services/socket';
import { subscribeNotifications } from '../services/notificationListener';
import './NotificationToast.css';
export function AppProvider({ children }) {
  const [user, setUser] = useState(sampleUser);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [testNotifications, setTestNotifications] = useState([]);
  const [notificationToast, setNotificationToast] = useState(null);
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
      value={{ user, setUser, notifications, setNotifications, testNotifications, setTestNotifications }}
    >
      {children}
      {notificationToast && <aside className="notification-toast" role="status" aria-label="Test notification">
        <strong>Development test · nonfinancial</strong><p>{notificationToast.message}</p>
        <button className="text-button" onClick={() => setNotificationToast(null)}>Dismiss notification</button>
      </aside>}
    </AppContext.Provider>
  );
}
