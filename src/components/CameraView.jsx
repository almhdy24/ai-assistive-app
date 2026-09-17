export default function CameraView({
  videoRef,
  active,
  ready,
  capturedImage,
  ariaLabel,
}) {
  return (
    <div
      className="camera-container"
      role="img"
      aria-label={ariaLabel}
    >
      {capturedImage ? (
        <img
          className="camera-preview-image"
          src={capturedImage}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          muted
          playsInline
          aria-hidden="true"
        />
      )}

      {active && !ready && (
        <div className="camera-loader" aria-hidden="true">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      )}

      {!active && !capturedImage && (
        <div className="camera-placeholder" aria-hidden="true">
          <span>◎</span>
        </div>
      )}
    </div>
  );
}
