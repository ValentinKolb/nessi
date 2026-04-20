export type CompactionSettings = {
  maxToolChars: number;
  maxSourceChars: number;
  /** Max chars for tool results sent to the provider. Longer results are truncated in the context. */
  maxToolResultChars: number;
};

export type ToolApprovalMap = Record<string, boolean>;

export type ImageAnalysisSettings = {
  /** Provider ID for image analysis, or null to use the active chat provider. */
  providerId: string | null;
};
