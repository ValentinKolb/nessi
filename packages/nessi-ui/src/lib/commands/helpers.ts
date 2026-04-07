export interface CommandHelpers {
  requestApproval: (message: string) => Promise<boolean>;
  requestSurvey: (input: { title?: string; questions: Array<{ question: string; options: string[] }> }) => Promise<{ result: string }>;
}

export function createCommandHelpers(): CommandHelpers {
  return {
    requestApproval: async () => true,
    requestSurvey: async () => ({ result: "Survey unavailable in this runtime." }),
  };
}
