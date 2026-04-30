import { useEffect, useId, useRef, useState } from "react";
import { Paperclip } from "lucide-react";

type FilePickerProps = {
  accept?: string;
  onFileChange: (file: File | null) => void;
  /**
   * Modo controlado: el estado del `File` en el padre.
   * No pasar esta prop para modo no controlado (solo `onFileChange`).
   */
  value?: File | null;
  disabled?: boolean;
  /** Texto del botón (sustituye al control nativo de archivos) */
  buttonLabel?: string;
  /** Tipo de archivo, ej. "PDF" o "Excel" */
  kindHint?: string;
  className?: string;
  name?: string;
};

export function FilePicker({
  accept,
  onFileChange,
  value,
  disabled = false,
  buttonLabel = "Seleccionar archivo",
  kindHint,
  className = "",
  name = "archivo",
}: FilePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedLabel, setSelectedLabel] = useState("");

  useEffect(() => {
    if (value === undefined) return;
    if (value === null) {
      setSelectedLabel("");
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setSelectedLabel(value.name);
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    onFileChange(f);
    setSelectedLabel(f ? f.name : "");
  }

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-stretch gap-2 min-w-0 ${className}`.trim()}
    >
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        tabIndex={-1}
        aria-label={buttonLabel}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="f-btn f-btn-ghost w-full sm:w-auto shrink-0 border border-zinc-200 bg-zinc-50/80 text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300 py-2.5 text-sm"
      >
        <Paperclip className="h-4 w-4 text-finecta-accent" aria-hidden />
        {buttonLabel}
        {kindHint ? (
          <span className="text-zinc-500 font-normal">· {kindHint}</span>
        ) : null}
      </button>
      <div
        className="flex-1 min-w-0 flex items-center rounded-xl border border-dashed border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-600"
        aria-live="polite"
      >
        <span className="truncate" title={selectedLabel || undefined}>
          {selectedLabel
            ? selectedLabel
            : "Ningún archivo seleccionado"}
        </span>
      </div>
    </div>
  );
}
