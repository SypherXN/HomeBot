import { useTheme } from "../../theme/ThemeProvider";

export default function AppearancePanel() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-3 text-sm text-slate-300">
      <p className="text-slate-400">Choose how HomeBot looks in your browser. Preference is saved on this device.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`rounded-lg border px-4 py-2 ${
            theme === "dark"
              ? "border-blue-500 bg-blue-900/40 text-white"
              : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          Dark
        </button>
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`rounded-lg border px-4 py-2 ${
            theme === "light"
              ? "border-blue-500 bg-blue-100 text-slate-900"
              : "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          Light
        </button>
      </div>
    </div>
  );
}
