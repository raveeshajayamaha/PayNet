import { useState } from "react";
import { sampleUser, initialNotifications } from "../data/demo";
import { AppContext } from "./useApp";
export function AppProvider({ children }) {
  const [user, setUser] = useState(sampleUser);
  const [notifications, setNotifications] = useState(initialNotifications);
  return (
    <AppContext.Provider
      value={{ user, setUser, notifications, setNotifications }}
    >
      {children}
    </AppContext.Provider>
  );
}
