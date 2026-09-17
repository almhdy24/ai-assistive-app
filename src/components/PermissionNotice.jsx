export default function PermissionNotice({
  message,
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="permission-notice"
      role="alert"
    >
      {message}
    </div>
  );
}
