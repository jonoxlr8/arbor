export default function SettingsIcon({kind}:{kind:"plan"|"plus"|"account"|"help"}) {
  const paths={plan:<><path d="M5 20V10m7 10V4m7 16v-7"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="10" r="2"/></>,plus:<path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-2.9L6.4 20l1.1-6.1L3 9.5l6.2-.9Z"/>,account:<><circle cx="12" cy="8" r="4"/><path d="M5 21v-3a7 7 0 0 1 14 0v3Z"/></>,help:<><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5m0 3v1"/></>};
  return <span className={`settings-icon settings-icon-${kind}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg></span>;
}
