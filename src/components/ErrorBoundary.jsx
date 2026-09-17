import { Component } from "react";

import { announce, SPEAK_PRIORITY } from "../utils/a11y";

export default class ErrorBoundary extends Component {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unknown error",
    };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
    announce("حدث خطأ غير متوقع. يُرجى إعادة تحميل التطبيق.", {
      priority: SPEAK_PRIORITY.CRITICAL,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        role="alert"
        aria-live="assertive"
        style={{
          padding: "32px 24px",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          maxWidth: 480,
          margin: "0 auto",
        }}
      >
        <h1>حدث خطأ</h1>
        <p>عذراً، واجه التطبيق مشكلة غير متوقعة.</p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            width: "100%",
            minHeight: 56,
            marginTop: 16,
            fontSize: "1rem",
            fontWeight: 600,
            color: "#fff",
            background: "#1d4ed8",
            border: 0,
            borderRadius: 10,
          }}
        >
          إعادة التحميل
        </button>
      </main>
    );
  }
}
