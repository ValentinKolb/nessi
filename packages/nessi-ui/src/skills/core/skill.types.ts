export type SkillEntry = {
  id: string;
  name: string;
  description: string;
  doc: string;
  command: string;
  enabled: boolean;
  code?: string;
  builtin?: boolean;
};
