// Scoped to the onboarding form; secondary buttons retain native keyboard behavior.
export function onboardingEnter(event: {
  key: string; repeat: boolean; isComposing: boolean;
  tagName: string; choice: boolean; contentEditable: boolean;
  preventDefault: () => void;
}, submit: () => void) {
  if (event.key !== "Enter" || event.isComposing || event.contentEditable ||
      event.tagName === "TEXTAREA" || (event.tagName === "BUTTON" && !event.choice)) return;
  event.preventDefault();
  if (!event.repeat) submit();
}
