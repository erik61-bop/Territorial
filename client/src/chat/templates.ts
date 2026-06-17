// Preset quick-chat messages. No free text. {t} is replaced by the target player's label.
export interface ChatTemplate {
  id: string;
  text: string;        // {t} placeholder for the target label
  requiresTarget: boolean;
}

export const TEMPLATES: ChatTemplate[] = [
  { id: 'peace_request', text: 'Peace? 🤝', requiresTarget: true },   // also sends a peace request
  { id: 'attack_target', text: 'Attack {t}! ⚔️', requiresTarget: true },
  { id: 'help', text: 'Help me! 🆘', requiresTarget: false },
  { id: 'defend', text: 'Defend! 🛡️', requiresTarget: false },
  { id: 'leader', text: 'Get the leader! 👑', requiresTarget: false },
  { id: 'thanks', text: 'Thanks! 🙏', requiresTarget: false },
  { id: 'gg', text: 'Good game! 👍', requiresTarget: false },
  { id: 'sorry', text: 'Oops, sorry! 😅', requiresTarget: false },
];

export const TEMPLATE_BY_ID: Record<string, ChatTemplate> =
  Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export function formatMessage(templateId: string, target: number, label: (id: number) => string): string {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) return templateId;
  return t.text.replace('{t}', target >= 0 ? label(target) : '');
}
