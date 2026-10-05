import { useLocalStorage } from "./use-local-storage";

export type AppMode = "options" | "invest";

export function useMode() {
  const [mode, setMode] = useLocalStorage<AppMode>("app_mode", "options");
  const toggle = () => setMode((m) => (m === "options" ? "invest" : "options"));
  return { mode, setMode, toggle };
}
