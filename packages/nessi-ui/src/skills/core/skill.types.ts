export type SkillReference = {
  name: string;
  content: string;
};

export type SkillEntry = {
  id: string;
  name: string;
  description: string;
  doc: string;
  command: string;
  enabled: boolean;
  code?: string;
  references?: SkillReference[];
  builtin?: boolean;
};
