import { pick } from "../i18n/translations";

export default function Bilingual({
  value,
  primary = "ar",
  className = "",
  altClassName = "bilingual-alt",
}) {
  const primaryText = pick(value, primary);
  const altLang = primary === "ar" ? "en" : "ar";
  const altText = pick(value, altLang);

  if (!primaryText && !altText) {
    return <span className={className} />;
  }

  return (
    <span className={className}>
      {primaryText && (
        <span
          className="bilingual-main"
          dir={primary === "ar" ? "rtl" : "ltr"}
        >
          {primaryText}
        </span>
      )}

      {altText && altText !== primaryText && (
        <span
          className={altClassName}
          dir={altLang === "ar" ? "rtl" : "ltr"}
          lang={altLang}
        >
          {altText}
        </span>
      )}
    </span>
  );
}
