import { useI18n } from '@/hooks/useI18n';

export default function LanguageSwitcher() {
  const { locale, changeLocale, isRTL } = useI18n();

  const toggle = () => {
    changeLocale(locale === 'en' ? 'ar' : 'en');
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      aria-label={locale === 'en' ? 'Switch to Arabic' : 'Switch to English'}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.2 0 4-4 4-9s-1.8-9-4-9-4 4-4 9 1.8 9 4 9ZM3.5 9h17M3.5 15h17"
        />
      </svg>
      <span>{locale === 'en' ? 'عربي' : 'EN'}</span>
    </button>
  );
}
