export type CompactionSettings = {
  maxToolChars: number;
  maxSourceChars: number;
};

export type ToolApprovalMap = Record<string, boolean>;

export type ImageAnalysisSettings = {
  /** Provider ID for image analysis, or null to use the active chat provider. */
  providerId: string | null;
};
