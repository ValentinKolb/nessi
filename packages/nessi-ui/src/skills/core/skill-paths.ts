export const skillPaths = {
  doc: (id: string) => `/skills/${id}/SKILL.md`,
  reference: (id: string, name: string) => `/skills/${id}/references/${name}`,
} as const;
