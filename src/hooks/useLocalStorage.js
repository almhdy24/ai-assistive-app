import { useCallback, useState } from "react";

export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);

      return stored !== null
        ? JSON.parse(stored)
        : initialValue;
    } catch {
      return initialValue;
    }
  });

  const updateValue = useCallback(
    (nextValue) => {
      setValue((currentValue) => {
        const resolved =
          typeof nextValue === "function"
            ? nextValue(currentValue)
            : nextValue;

        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage may be unavailable.
        }

        return resolved;
      });
    },
    [key]
  );

  return [value, updateValue];
}
