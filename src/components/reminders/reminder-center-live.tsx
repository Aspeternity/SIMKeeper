"use client";

import { useCallback, useEffect, useState } from "react";
import { ReminderCenter } from "@/components/reminders/reminder-center";
import type { ReminderActionRecord } from "@/lib/reminder-action-types";
import { REMINDER_STATE_CHANGED_EVENT, type ReminderItem } from "@/lib/reminders";

export function ReminderCenterLive({
  reminders: initialReminders,
  history: initialHistory,
}: {
  reminders: ReminderItem[];
  history: ReminderActionRecord[];
}) {
  const [reminders, setReminders] = useState(initialReminders);
  const [history, setHistory] = useState(initialHistory);

  useEffect(() => setReminders(initialReminders), [initialReminders]);
  useEffect(() => setHistory(initialHistory), [initialHistory]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/reminders?_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.reminders)) setReminders(data.reminders as ReminderItem[]);
      if (Array.isArray(data.history)) setHistory(data.history as ReminderActionRecord[]);
    } catch {
      // Keep the last known processing-center state during transient failures.
    }
  }, []);

  useEffect(() => {
    let retryTimer: number | null = null;
    const handleStateChanged = () => {
      void refresh();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void refresh(), 350);
    };
    const handleFocus = () => void refresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 15000);

    window.addEventListener(REMINDER_STATE_CHANGED_EVENT, handleStateChanged);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    void refresh();

    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.clearInterval(interval);
      window.removeEventListener(REMINDER_STATE_CHANGED_EVENT, handleStateChanged);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return <ReminderCenter reminders={reminders} history={history} />;
}
