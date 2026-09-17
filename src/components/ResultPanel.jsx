export default function ResultPanel({
  title,
  text,
  loading,
  error,
  onRepeat,
  onDismiss,
  repeatLabel,
  closeLabel,
}) {
  if (!loading && !error && !text) return null;

  return (
    <section
      className="result-panel"
      aria-live="polite"
      aria-busy={loading}
    >
      <div className="result-header">
        <h2>{title}</h2>

        {onDismiss && (
          <button
            type="button"
            className="result-close"
            onClick={onDismiss}
            aria-label={closeLabel}
          >
            ×
          </button>
        )}
      </div>

      {loading && (
        <div className="result-loading" aria-hidden="true">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      )}

      {error && <p className="result-error">{error}</p>}

      {text && (
        <>
          <p className="result-text">{text}</p>

          {onRepeat && (
            <button
              type="button"
              className="result-repeat"
              onClick={onRepeat}
            >
              {repeatLabel}
            </button>
          )}
        </>
      )}
    </section>
  );
}
