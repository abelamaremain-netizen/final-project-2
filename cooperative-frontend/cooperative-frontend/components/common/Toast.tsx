"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  removeNotification,
  Notification,
  addNotification,
} from "@/lib/store/slices/uiSlice";

const colors: Record<Notification["type"], string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  warning: "bg-yellow-600",
  info: "bg-blue-600",
};

const icons: Record<Notification["type"], React.ReactNode> = {
  success: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  ),
  error: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  ),
  warning: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  info: (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

let dispatchRef: ReturnType<typeof useAppDispatch> | null = null;

export const setToastDispatch = (
  dispatch: ReturnType<typeof useAppDispatch>,
) => {
  dispatchRef = dispatch;
};

const createToast =
  (type: Notification["type"]) => (message: string, duration?: number) => {
    if (dispatchRef) {
      dispatchRef(
        addNotification({
          id: Date.now().toString(),
          type,
          message,
          duration,
        }),
      );
    } else {
      console.error(
        "Toast dispatch not set. Ensure ToastProvider is rendered.",
      );
    }
  };

export const toastSuccess = createToast("success");
export const toastError = createToast("error");
export const toastWarning = createToast("warning");
export const toastInfo = createToast("info");

export function ToastContainer() {
  const dispatch = useAppDispatch();
  setToastDispatch(dispatch); // Set the dispatch reference
  const notifications = useAppSelector((state) => state.ui.notifications);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-md w-full sm:w-auto">
      {notifications.map((notification) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onClose={(id) => dispatch(removeNotification(id))}
        />
      ))}
    </div>
  );
}

function ToastItem({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose: (id: string) => void;
}) {
  useEffect(() => {
    const duration = notification.duration || 5000;
    const timer = setTimeout(() => {
      onClose(notification.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [notification, onClose]);

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg shadow-xl text-white pointer-events-auto transition-all duration-300 transform translate-x-0 animate-in slide-in-from-right-full ${
        colors[notification.type]
      }`}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">{icons[notification.type]}</div>
      <div className="flex-1 text-sm font-medium pr-6">
        {notification.message}
      </div>
      <button
        onClick={() => onClose(notification.id)}
        className="absolute top-2 right-2 text-white/70 hover:text-white transition-colors"
        aria-label="Close"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
