import { HistoryItem } from "../types";

const STORAGE_KEY = 'fluentai_history_v1';

export const saveHistoryItem = (item: HistoryItem): void => {
  try {
    const existingHistory = getHistory();
    // Add new item to the beginning of the array
    const updatedHistory = [item, ...existingHistory];
    // Limit history to 50 items to prevent storage issues
    const trimmedHistory = updatedHistory.slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch (e) {
    console.error("Failed to save history to localStorage", e);
  }
};

export const getHistory = (): HistoryItem[] => {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    return JSON.parse(json) as HistoryItem[];
  } catch (e) {
    console.error("Failed to parse history from localStorage", e);
    return [];
  }
};

export const clearHistory = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};